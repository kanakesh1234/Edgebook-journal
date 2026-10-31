/**
 * MINATO BRAIN: the learning layer on top of EdgeBook's AI Brain (`lib/ai-brain.ts`).
 *
 * Everything here runs on the trader's device and is stored inside `settings.aiBrain.minato`
 * (so it syncs through the same Google Drive journal file). Four cooperating parts:
 *
 *  1. DAY BRIEF      – what the trader talked about today: feelings, topics, commitments.
 *  2. RECALL         – a local semantic index (signed feature-hashing embeddings + TF-IDF, cosine search)
 *                      over everything the trader has written: notes, autopsies, plans, lessons, chat.
 *                      Minato retrieves the *relevant* past words instead of guessing.
 *  3. RISK NET       – a small neural network (MLP, 1 hidden layer, Adam, L2) trained on the trader's own
 *                      trade history to estimate the chance that the next trade slips (loses, breaks a rule or
 *                      carries a mistake). It is only shown once it beats a naive baseline on held-out trades.
 *  4. COMMITMENTS    – "I'll stop after two trades" is captured, then checked against what really happened.
 *
 * It models the trader's PROCESS. It does not predict markets and never gives trade signals.
 */
import type { JournalEntry, JournalSettings, TradePlan } from "../types";
import { addNotes, detectMoods, emptyMind, isPositive, reconcile, MOOD_LABEL, type MindState, type Mood } from "./mind";
import type { MemoryStore } from "./memory";

/* ================================ types ================================ */

export interface DayBrief {
  date: string;
  /** The trader's own messages that day (trimmed). */
  said: string[];
  topics: string[];
  moods: Mood[];
  commitments: string[];
  messages: number;
  line: string;
  updatedAt: number;
}
export type CommitmentRule = { kind: "maxTrades"; n: number } | { kind: "stopAfterLoss" };
export interface Commitment {
  id: string;
  date: string;
  text: string;
  rule?: CommitmentRule;
  status: "open" | "kept" | "broken";
  /** true when EdgeBook checked it against the journal; false once the trader set it by hand. */
  auto: boolean;
}
export interface SavedInsight { id: string; date: string; text: string; at: number }
export interface NetSnapshot {
  v: 1;
  w1: number[]; b1: number[]; w2: number[]; b2: number;
  mean: number[]; std: number[];
  n: number; trainedAt: number; ready: boolean;
  metrics: { holdout: number; acc: number; baseAcc: number; brier: number; baseBrier: number; baseRate: number };
}
export interface MinatoBrain {
  v: 1;
  mind: MindState;
  days: Record<string, DayBrief>;
  commitments: Commitment[];
  saved: SavedInsight[];
  net?: NetSnapshot;
  /** Long-term memory tiers (episodic / semantic / procedural). Optional so older journals load unchanged. */
  memory?: MemoryStore;
}
export const emptyBrain = (): MinatoBrain => ({ v: 1, mind: emptyMind(), days: {}, commitments: [], saved: [] });

const DAYS_KEPT = 30;
const SAID_PER_DAY = 8;

/* ============================== text helpers ============================== */

const STOP = new Set(("the and for that this with from was were have had has not but you your our into out when then just very too some all any can will would could should about after before " +
  "its it's i'm ive i've im feel feeling felt today trade trades trading price market because really like also still much more than them they what which where while been being does did done tomorrow yesterday going want think need make take keep getting something thing things always never again will won't anxious nervous frustrated tired calm confident worried scared afraid").split(" "));

function words(text: string): string[] {
  return text.toLowerCase().replace(/[^\p{L}\p{N}\s']+/gu, " ").split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w));
}

function topics(texts: string[], n = 5): string[] {
  const c = new Map<string, number>();
  for (const t of texts) for (const w of new Set(words(t))) if (w.length >= 4) c.set(w, (c.get(w) ?? 0) + 1);
  return [...c.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length).slice(0, n).map(([w]) => w);
}

/* ============================ 1. commitments ============================ */

const INTENT = /\b(i (?:will|'ll|am going to|'m going to|won'?t|will not|promise|must|need to|plan to|commit to|have to)|from now on|no more|never again|my rule is|today i (?:will|won'?t))\b/i;

export function extractCommitments(text: string): { text: string; rule?: CommitmentRule }[] {
  const out: { text: string; rule?: CommitmentRule }[] = [];
  for (const raw of text.split(/(?<=[.!?\n])\s+/)) {
    const s = raw.trim();
    if (s.length < 10 || s.length > 160 || s.endsWith("?") || !INTENT.test(s)) continue;
    let rule: CommitmentRule | undefined;
    const max = s.match(/\b(?:max(?:imum)?|only|no more than|more than|limit(?:ed)?(?: to)?|stop after|at most)\D{0,14}(\d)\s*(?:trades?|setups?|positions?)\b/i);
    if (max) rule = { kind: "maxTrades", n: Number(max[1]) };
    else if (/\b(stop|quit|done|walk away|no more trad\w*|shut it down)\b.{0,24}\b(after|once|following)\b.{0,16}\b(loss|losing|red|a stop)\b/i.test(s)) rule = { kind: "stopAfterLoss" };
    out.push({ text: s, rule });
  }
  return out.slice(0, 3);
}

function verifyCommitments(list: Commitment[], entries: JournalEntry[], today: string): Commitment[] {
  const byDay = new Map<string, JournalEntry[]>();
  for (const e of entries) byDay.set(e.date, [...(byDay.get(e.date) ?? []), e]);
  return list.map((c) => {
    if (!c.auto || !c.rule) return c;
    const trades = (byDay.get(c.date) ?? []).sort((a, b) => a.createdAt - b.createdAt);
    const over = c.date < today;
    let broken = false;
    if (c.rule.kind === "maxTrades") broken = trades.length > c.rule.n;
    else broken = trades.some((t, i) => i > 0 && trades.slice(0, i).some((p) => p.pnl < 0));
    if (broken) return { ...c, status: "broken" };
    if (over && trades.length > 0) return { ...c, status: "kept" };
    return { ...c, status: "open" };
  });
}

/* ============================== 2. day brief ============================== */

function briefLine(b: Pick<DayBrief, "moods" | "topics" | "commitments">): string {
  const parts: string[] = [];
  if (b.moods.length) parts.push(`Felt ${b.moods.map((m) => MOOD_LABEL[m].toLowerCase()).join(" and ")}.`);
  if (b.topics.length) parts.push(`Talked about ${b.topics.slice(0, 3).join(", ")}.`);
  if (b.commitments.length) parts.push(`Committed: ${b.commitments[0]}`);
  return parts.join(" ") || "A quiet check-in.";
}

/** Fold one trader message into the brain: feelings → held notes, intent → commitments, everything → today's brief. */
export function applyChat(brain: MinatoBrain, text: string, now: number, date: string): { brain: MinatoBrain; moods: Mood[]; commitments: string[] } {
  const moods = detectMoods(text);
  const found = extractCommitments(text);
  const mind = moods.length ? addNotes(brain.mind, moods, text, now, date) : brain.mind;

  const prev = brain.days[date];
  const said = [...(prev?.said ?? []), text.replace(/\s+/g, " ").trim().slice(0, 170)].slice(-SAID_PER_DAY);
  const dayMoods = [...new Set([...(prev?.moods ?? []), ...moods])];
  const dayCommits = [...(prev?.commitments ?? []), ...found.map((f) => f.text)].slice(-4);
  const base = { date, said, topics: topics(said), moods: dayMoods, commitments: dayCommits, messages: (prev?.messages ?? 0) + 1, updatedAt: now };
  const days = { ...brain.days, [date]: { ...base, line: briefLine(base) } };
  for (const k of Object.keys(days).sort().slice(0, Math.max(0, Object.keys(days).length - DAYS_KEPT))) delete days[k];

  const commitments = [...brain.commitments, ...found.map((f, i): Commitment => ({ id: `${now}-${i}`, date, text: f.text, rule: f.rule, status: "open", auto: !!f.rule }))].slice(-30);
  return { brain: { ...brain, mind, days, commitments }, moods, commitments: found.map((f) => f.text) };
}

/** Settle held feelings and commitments against the journal. Returns the same object when nothing changed. */
export function reconcileBrain(brain: MinatoBrain, entries: JournalEntry[], now: number, today: string): MinatoBrain {
  const r = reconcile(brain.mind, entries, now, today);
  // Chat briefs are per day. Yesterday's conversation is not kept to colour today's.
  const days = Object.fromEntries(Object.entries(brain.days).filter(([d]) => d === today));
  const prunedDays = Object.keys(days).length !== Object.keys(brain.days).length;
  const verified = verifyCommitments(brain.commitments, entries, today);
  // open commitments older than a week are quietly retired
  const week = 7 * 86_400_000;
  const kept = verified.filter((c) => c.status !== "open" || now - new Date(`${c.date}T12:00:00`).getTime() < week);
  const changed = r.changed || prunedDays || JSON.stringify(kept) !== JSON.stringify(brain.commitments);
  return changed ? { ...brain, mind: r.changed ? r.state : brain.mind, commitments: kept, days } : brain;
}

/* ================================ 3. recall ================================ */

export interface RecallItem { id: string; date: string; kind: "journal" | "reflection" | "autopsy" | "plan" | "lesson" | "chat" | "saved"; text: string }
const DIM = 384;

function fnv(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
/** Signed feature hashing of unigrams, bigrams and character trigrams (so "frustrated" ≈ "frustration"). */
function embed(text: string): Map<number, number> {
  const toks = words(text);
  const feats: string[] = [...toks, ...toks.slice(1).map((w, i) => `${toks[i]}_${w}`)];
  for (const w of toks) if (w.length >= 5) for (let i = 0; i <= w.length - 3; i++) feats.push(`#${w.slice(i, i + 3)}`);
  const tf = new Map<number, number>();
  for (const f of feats) {
    const h = fnv(f);
    const idx = h % DIM, sign = (h >>> 16) & 1 ? 1 : -1;
    tf.set(idx, (tf.get(idx) ?? 0) + sign);
  }
  return tf;
}

export interface Recall { search(query: string, k?: number): (RecallItem & { score: number })[]; size: number }

export function buildRecall(items: RecallItem[]): Recall {
  const vecs = items.map((it) => embed(it.text));
  const df = new Float64Array(DIM);
  for (const v of vecs) for (const i of v.keys()) df[i] += 1;
  const N = Math.max(1, items.length);
  const idf = (i: number) => Math.log((N + 1) / (df[i] + 1)) + 1;
  const weigh = (v: Map<number, number>) => {
    const w = new Map<number, number>();
    let norm = 0;
    for (const [i, c] of v) { const x = Math.sign(c) * (1 + Math.log(Math.abs(c))) * idf(i); w.set(i, x); norm += x * x; }
    return { w, norm: Math.sqrt(norm) || 1 };
  };
  const docs = vecs.map(weigh);
  const today = Date.now();
  return {
    size: items.length,
    search(query, k = 5) {
      const q = weigh(embed(query));
      return items
        .map((it, n) => {
          let dot = 0;
          for (const [i, x] of q.w) { const y = docs[n].w.get(i); if (y) dot += x * y; }
          const cos = dot / (q.norm * docs[n].norm);
          const ageDays = Math.max(0, (today - new Date(`${it.date}T12:00:00`).getTime()) / 86_400_000);
          return { ...it, score: cos * (0.85 + 0.15 * Math.exp(-ageDays / 60)) };
        })
        .filter((r) => r.score > 0.14)
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
    },
  };
}

/** Everything the trader has put into words, across the whole site. */
const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export function collectWords(entries: JournalEntry[], plans: TradePlan[], settings: JournalSettings, brain: MinatoBrain, today: string = localToday()): RecallItem[] {
  const out: RecallItem[] = [];
  const add = (id: string, date: string, kind: RecallItem["kind"], text?: string | null) => {
    const t = text?.replace(/\s+/g, " ").trim();
    if (t && t.length >= 12) out.push({ id, date, kind, text: t.slice(0, 260) });
  };
  for (const e of entries) {
    const f = e.review?.followUp;
    add(`${e.id}:n`, e.date, "journal", e.notes);
    add(`${e.id}:w`, e.date, "reflection", e.reflection?.wentWell);
    add(`${e.id}:p`, e.date, "reflection", e.reflection?.wentPoorly);
    add(`${e.id}:c`, e.date, "reflection", e.reflection?.cause);
    add(`${e.id}:l`, e.date, "reflection", e.reflection?.lesson);
    add(`${e.id}:m`, e.date, "autopsy", f?.mistakeNote);
    add(`${e.id}:b`, e.date, "autopsy", f?.biggestMistake);
    add(`${e.id}:x`, e.date, "autopsy", f?.watchNext);
    add(`${e.id}:d`, e.date, "autopsy", e.review?.plannedVsActual?.deviations);
    add(`${e.id}:i`, e.date, "autopsy", e.review?.concepts?.improve);
  }
  for (const p of plans) {
    add(`${p.id}:t`, p.date, "plan", p.thesis);
    add(`${p.id}:v`, p.date, "plan", p.invalidation);
    add(`${p.id}:e`, p.date, "plan", p.emotionalNote);
    add(`${p.id}:k`, p.date, "plan", p.whatCouldBreakPlan);
    add(`${p.id}:s`, p.date, "plan", p.preSessionProcess);
  }
  (settings.practiceProgress?.seedLessons ?? []).forEach((l, i) => add(`lesson:${i}`, new Date().toISOString().slice(0, 10), "lesson", l));
  // Only TODAY's conversation is recalled; earlier days' chat is deliberately not carried forward.
  for (const d of Object.values(brain.days)) if (d.date === today) d.said.forEach((s, i) => add(`chat:${d.date}:${i}`, d.date, "chat", s));
  for (const s of brain.saved) add(s.id, s.date, "saved", s.text);
  return out.slice(-400);
}

/* ================================ 4. risk net ================================ */

const D = 10; // features
const H = 6;  // hidden units

type Ctx = { minute: number | null; tradeNo: number; lossesToday: number; pnlSign: number; hasPlan: number; prevSlip: number; setupRate: number; dowRate: number; negMood: number };

const slipOf = (e: JournalEntry) =>
  e.pnl < 0 || e.reflection?.followedSetup === false || e.reflection?.followedRisk === false || (!!e.review?.followUp?.mistake && e.review.followUp.mistake !== "none");

const minuteOf = (t?: string) => { const m = t?.match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const dowOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

function toVec(c: Ctx): number[] {
  const a = c.minute == null ? 0 : (2 * Math.PI * c.minute) / 1440;
  return [c.minute == null ? 0 : Math.sin(a), c.minute == null ? 0 : Math.cos(a), Math.min(c.tradeNo, 6) / 6, Math.min(c.lossesToday, 3) / 3, c.pnlSign, c.hasPlan, c.prevSlip, c.setupRate, c.dowRate, c.negMood];
}

/** Features for each past trade, using only what was known BEFORE it (no leakage). */
function history(entries: JournalEntry[], plans: TradePlan[], mind: MindState) {
  const sorted = [...entries].sort((a, b) => a.createdAt - b.createdAt);
  const planDates = new Set(plans.map((p) => p.date));
  const bySetup = new Map<string, { n: number; s: number }>();
  const byDow = new Map<number, { n: number; s: number }>();
  const negTrades = new Set(mind.notes.filter((n) => n.status === "kept" && !isPositive(n.mood) && n.tradeId).map((n) => n.tradeId));
  const day = new Map<string, { n: number; loss: number; pnl: number }>();
  const X: number[][] = [], y: number[] = [];
  let prev = 0;
  for (const e of sorted) {
    const d = day.get(e.date) ?? { n: 0, loss: 0, pnl: 0 };
    const su = bySetup.get(e.setup || "?") ?? { n: 0, s: 0 };
    const dw = byDow.get(dowOf(e.date)) ?? { n: 0, s: 0 };
    X.push(toVec({ minute: minuteOf(e.entryTime), tradeNo: d.n + 1, lossesToday: d.loss, pnlSign: Math.sign(d.pnl), hasPlan: planDates.has(e.date) || e.planId ? 1 : 0, prevSlip: prev, setupRate: (su.s + 1) / (su.n + 2), dowRate: (dw.s + 1) / (dw.n + 2), negMood: negTrades.has(e.id) ? 1 : 0 }));
    const slip = slipOf(e) ? 1 : 0;
    y.push(slip);
    day.set(e.date, { n: d.n + 1, loss: d.loss + (e.pnl < 0 ? 1 : 0), pnl: d.pnl + e.pnl });
    bySetup.set(e.setup || "?", { n: su.n + 1, s: su.s + slip });
    byDow.set(dowOf(e.date), { n: dw.n + 1, s: dw.s + slip });
    prev = slip;
  }
  return { X, y, base: y.length ? y.reduce((s, v) => s + v, 0) / y.length : 0.5 };
}

/* --- tiny MLP: D → H (tanh) → 1 (sigmoid) --- */
const sig = (z: number) => 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z))));
function forward(t: { w1: number[]; b1: number[]; w2: number[]; b2: number }, x: number[]) {
  const h = new Array<number>(H);
  for (let j = 0; j < H; j++) { let z = t.b1[j]; for (let i = 0; i < D; i++) z += t.w1[j * D + i] * x[i]; h[j] = Math.tanh(z); }
  let o = t.b2; for (let j = 0; j < H; j++) o += t.w2[j] * h[j];
  return { h, p: sig(o) };
}
function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296) - 0.5; }

function fit(X: number[][], y: number[], epochs = 320, lr = 0.03, l2 = 2e-3) {
  const r = rng(7);
  const t = { w1: Array.from({ length: H * D }, () => r() * 0.8), b1: new Array(H).fill(0), w2: Array.from({ length: H }, () => r() * 0.8), b2: 0 };
  const P = [t.w1, t.b1, t.w2, [t.b2]] as number[][];
  const m = P.map((a) => a.map(() => 0)), v = P.map((a) => a.map(() => 0));
  const n = X.length;
  for (let ep = 1; ep <= epochs; ep++) {
    const g = P.map((a) => a.map(() => 0));
    for (let k = 0; k < n; k++) {
      const { h, p } = forward(t, X[k]);
      const dO = p - y[k];
      g[3][0] += dO;
      for (let j = 0; j < H; j++) {
        g[2][j] += dO * h[j];
        const dz = dO * t.w2[j] * (1 - h[j] * h[j]);
        g[1][j] += dz;
        for (let i = 0; i < D; i++) g[0][j * D + i] += dz * X[k][i];
      }
    }
    for (let a = 0; a < 4; a++) for (let i = 0; i < P[a].length; i++) {
      const grad = g[a][i] / n + (a === 0 || a === 2 ? l2 * P[a][i] : 0);
      m[a][i] = 0.9 * m[a][i] + 0.1 * grad;
      v[a][i] = 0.999 * v[a][i] + 0.001 * grad * grad;
      P[a][i] -= (lr * (m[a][i] / (1 - 0.9 ** ep))) / (Math.sqrt(v[a][i] / (1 - 0.999 ** ep)) + 1e-8);
    }
    t.b2 = P[3][0];
  }
  return t;
}

const MIN_TRADES = 24;

/** Retrain from the whole journal. Cheap (a few hundred trades), deterministic, and skipped when nothing new arrived. */
export function trainNet(entries: JournalEntry[], plans: TradePlan[], mind: MindState, prev?: NetSnapshot): NetSnapshot | undefined {
  if (entries.length < 12) return undefined;
  if (prev && prev.n === entries.length) return prev;
  const { X, y, base } = history(entries, plans, mind);
  const mean = Array.from({ length: D }, (_, i) => X.reduce((s, r) => s + r[i], 0) / X.length);
  const std = Array.from({ length: D }, (_, i) => Math.sqrt(X.reduce((s, r) => s + (r[i] - mean[i]) ** 2, 0) / X.length) || 1);
  const Z = X.map((r) => r.map((v, i) => (v - mean[i]) / std[i]));

  // honest check: train on the older 80%, test on the newest 20%
  const cut = Math.floor(Z.length * 0.8), hold = Z.length - cut;
  const trial = fit(Z.slice(0, cut), y.slice(0, cut));
  const tr = y.slice(0, cut).reduce((s, v) => s + v, 0) / Math.max(1, cut);
  let acc = 0, baseAcc = 0, brier = 0, baseBrier = 0;
  for (let k = cut; k < Z.length; k++) {
    const p = forward(trial, Z[k]).p;
    acc += (p >= 0.5 ? 1 : 0) === y[k] ? 1 : 0; baseAcc += (tr >= 0.5 ? 1 : 0) === y[k] ? 1 : 0;
    brier += (p - y[k]) ** 2; baseBrier += (tr - y[k]) ** 2;
  }
  const metrics = { holdout: hold, acc: acc / hold, baseAcc: baseAcc / hold, brier: brier / hold, baseBrier: baseBrier / hold, baseRate: base };
  const ready = entries.length >= MIN_TRADES && hold >= 5 && metrics.brier < metrics.baseBrier * 0.98;

  const net = fit(Z, y);
  return { v: 1, ...net, mean, std, n: entries.length, trainedAt: Date.now(), ready, metrics };
}

const DRIVER: ((c: Ctx) => string)[] = [
  () => "this time of day has been harder for you", () => "this time of day has been harder for you",
  (c) => `it would be trade #${c.tradeNo} today`, (c) => `you are already ${c.lossesToday} loss${c.lossesToday === 1 ? "" : "es"} down today`,
  () => "today is in the red", () => "there is no plan written for today", () => "your last trade slipped",
  () => "this setup has slipped before", (c) => `${["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"][new Date().getDay()]} have been harder for you`, () => "you said you felt off",
];

export interface Readiness { pct: number; level: "steady" | "watch" | "high"; drivers: string[]; trades: number; holdoutAcc: number }

/** The trader's process-slip risk for a hypothetical next trade right now. null until the net has earned its place. */
export function readinessNow(net: NetSnapshot | undefined, entries: JournalEntry[], plans: TradePlan[], mind: MindState, today: string, now = new Date()): Readiness | null {
  if (!net?.ready) return null;
  const todays = entries.filter((e) => e.date === today).sort((a, b) => a.createdAt - b.createdAt);
  const last = [...entries].sort((a, b) => b.createdAt - a.createdAt)[0];
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const minute = Number(parts.find((p) => p.type === "hour")?.value) * 60 + Number(parts.find((p) => p.type === "minute")?.value);
  const slips = entries.filter(slipOf).length;
  const dowTrades = entries.filter((e) => dowOf(e.date) === now.getDay());
  const ctx: Ctx = {
    minute, tradeNo: todays.length + 1, lossesToday: todays.filter((e) => e.pnl < 0).length,
    pnlSign: Math.sign(todays.reduce((s, e) => s + e.pnl, 0)), hasPlan: plans.some((p) => p.date === today) ? 1 : 0,
    prevSlip: last && slipOf(last) ? 1 : 0, setupRate: (slips + 1) / (entries.length + 2),
    dowRate: (dowTrades.filter(slipOf).length + 1) / (dowTrades.length + 2),
    negMood: mind.notes.some((n) => n.status === "pending" && !isPositive(n.mood)) ? 1 : 0,
  };
  const z = toVec(ctx).map((v, i) => (v - net.mean[i]) / net.std[i]);
  const raw = forward(net, z).p;
  // shrink toward the trader's base rate and never claim certainty: a small personal model, not an oracle
  const p = Math.min(0.95, Math.max(0.05, net.metrics.baseRate + (raw - net.metrics.baseRate) * 0.85));
  const drivers = z
    .map((_, i) => { const alt = [...z]; alt[i] = 0; return { i, d: raw - forward(net, alt).p }; })
    .filter((x) => x.d > 0.04).sort((a, b) => b.d - a.d).slice(0, 2).map((x) => DRIVER[x.i](ctx));
  const base = net.metrics.baseRate;
  return { pct: Math.round(p * 100), level: p >= Math.max(0.6, base + 0.2) ? "high" : p >= base + 0.07 ? "watch" : "steady", drivers: [...new Set(drivers)], trades: net.n, holdoutAcc: Math.round(net.metrics.acc * 100) };
}

/** Small, factual context for the trade-tagging model: how the trader said they felt around this trade and what they promised. */
export function tagContextFromBrain(brain: MinatoBrain | undefined, entry: { date: string; createdAt: number; id: string }) {
  if (!brain) return null;
  const near = brain.mind.notes.filter((n) => n.tradeId === entry.id || (n.status === "pending" && entry.createdAt > n.at && entry.createdAt - n.at < 36 * 3_600_000));
  const day = brain.days[entry.date];
  const promises = brain.commitments.filter((c) => c.date === entry.date).map((c) => ({ said: c.text, status: c.status }));
  if (!near.length && !day && !promises.length) return null;
  return {
    feltBeforeTrade: near.slice(0, 3).map((n) => ({ feeling: MOOD_LABEL[n.mood], words: n.quote.slice(0, 120) })),
    dayInChat: day?.line,
    promisesThatDay: promises.slice(0, 3),
    note: "What the trader told Minato. Context only; never proof of a mistake.",
  };
}

/* ============================ what the model sees ============================ */

export function brainForModel(brain: MinatoBrain, recall: Recall, question: string, readiness: Readiness | null, today: string) {
  return {
    today: brain.days[today]?.line ?? null,
    recentDays: [] as { date: string; summary: string }[], // past days' chat is never sent; each day starts clean
    commitments: brain.commitments.filter((c) => c.status !== "kept").slice(-5).map((c) => ({ date: c.date, said: c.text, status: c.status })),
    keptCommitments: brain.commitments.filter((c) => c.status === "kept").length,
    brokenCommitments: brain.commitments.filter((c) => c.status === "broken").length,
    savedByTrader: brain.saved.slice(-4).map((s) => s.text),
    recalled: recall.search(question, 5).map((r) => ({ date: r.date, from: r.kind, words: r.text.slice(0, 200) })),
    readiness: readiness ? { processSlipRiskPct: readiness.pct, level: readiness.level, because: readiness.drivers, learnedFromTrades: readiness.trades } : null,
  };
}
