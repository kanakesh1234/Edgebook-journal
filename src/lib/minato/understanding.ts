/**
 * MINATO UNDERSTANDING ENGINE: what the journal says about HOW this trader trades, beyond P&L and win rate.
 *
 * Design rules (they are the point of the module):
 *  1. PROCESS ≠ OUTCOME. "Broke my process" (broke setup/risk rule, left the plan, moved stop, chased, FOMO/revenge flag,
 *     tagged mistake) is tracked separately from "lost money". A win can break process; a loss can be clean.
 *  2. MISSING DATA IS NOT CLEAN DATA. Only trades with at least one process answer count toward process rates. Coverage is reported.
 *  3. ASSOCIATION, NEVER CAUSE. Every claim compares two groups of the trader's own trades. Wording is "after X, Y happened
 *     k of n times vs j of m otherwise". Nothing here infers a personality trait.
 *  4. EVIDENCE GATES. A difference is reported only when the posterior probability that it is real clears a threshold that
 *     tightens when many windows are scanned (so "worst hour of the day" does not manufacture patterns from noise).
 *     established = replicated in both halves of the history; recent disagreement downgrades or drops the claim.
 *  5. SAY WHAT IS MISSING. When a comparison cannot be tested yet, it becomes a `gap` instead of a guess.
 *
 * Statistics are Beta–Bernoulli posteriors (weak uniform prior) compared with a normal approximation. This is deliberately
 * small: a journal has tens to hundreds of trades, which is far too little to train sequence models such as LSTM/GRU/
 * Transformer/Mamba without overfitting. No such model is trained or claimed here.
 */
import type { JournalEntry, TradePlan } from "../types";
import { MOOD_LABEL, isPositive, type MindState, type Mood } from "./mind";
import { detectPatterns, PATTERN_IDS } from "./patterns";
import type { EvidenceRef, MemoryGap, MemoryTopic, Observation, Polarity } from "./memory";

/* ============================== statistics ============================== */

const erf = (x: number) => {
  const s = Math.sign(x); const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-a * a);
  return s * y;
};
const phi = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));

export interface Ratio { k: number; n: number }

/** P(true rate of A > true rate of B) under independent Beta(1+k, 1+n−k) posteriors (normal approximation). */
export function probGreater(a: Ratio, b: Ratio): number {
  const ma = (a.k + 1) / (a.n + 2), mb = (b.k + 1) / (b.n + 2);
  const va = ((a.k + 1) * (a.n - a.k + 1)) / (((a.n + 2) ** 2) * (a.n + 3));
  const vb = ((b.k + 1) * (b.n - b.k + 1)) / (((b.n + 2) ** 2) * (b.n + 3));
  return phi((ma - mb) / Math.sqrt(va + vb));
}

/** Wilson score interval for a proportion. */
export function wilson(k: number, n: number, z = 1.96): { lo: number; hi: number } {
  if (n === 0) return { lo: 0, hi: 1 };
  const p = k / n, z2 = z * z;
  const centre = (p + z2 / (2 * n)) / (1 + z2 / n);
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
  return { lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

type Level = Observation["level"];

/** Evidence gate. `m` = how many comparable windows were scanned (stricter thresholds as m grows). */
export function evidenceLevel(prob: number, nA: number, nB: number, m: number, replicated: boolean, recentAgrees: boolean): Level | null {
  if (nA < 4 || nB < 4) return null;
  // Under "no real difference" a posterior direction-probability is roughly uniform, so the gate must be strict AND scale with the
  // number of comparisons (Bonferroni-style, linear in `m`, with a floor of 3 for the family of checks run on every journal).
  const thr = (base: number) => 1 - (1 - base) / Math.max(3, m);
  let lv: Level | null = null;
  if (prob >= thr(0.99) && nA >= 8 && nB >= 8) lv = replicated && nA + nB >= 24 ? "established" : "supported";
  else if (prob >= thr(0.95)) lv = "hypothesis";
  if (!lv) return null;
  // The newest trades no longer show it: a long history alone cannot keep a belief alive. At most a possibility remains, and only
  // if it was strong enough to be established; otherwise it is not asserted (the memory layer then marks the old belief contested).
  if (!recentAgrees) return lv === "established" ? "hypothesis" : null;
  return lv;
}

/* ============================ trade features ============================ */

export interface TF {
  e: JournalEntry;
  date: string;
  dow: number;
  hour: number | null;
  tradeNo: number;
  afterLoss: boolean;
  afterWin: boolean;
  /** At least one process answer exists for this trade. */
  known: boolean;
  /** Broke the trader's own process (only meaningful when `known`). */
  broke: boolean;
  reasons: string[];
  loss: boolean;
  win: boolean;
  plan: boolean;
  qty: number | null;
  prevQty: number | null;
}

export function processOf(e: JournalEntry): { known: boolean; broke: boolean; reasons: string[] } {
  const r = e.reflection, rv = e.review, ex = rv?.execution, ps = rv?.psychology, oc = rv?.outcome, fu = rv?.followUp;
  const reasons: string[] = [];
  let known = false;
  const chk = (v: boolean | null | undefined, badWhen: boolean, label: string) => {
    if (v === null || v === undefined) return;
    known = true;
    if (v === badWhen) reasons.push(label);
  };
  chk(r?.followedSetup, false, "broke setup rules");
  chk(r?.followedRisk, false, "broke risk rule");
  chk(oc?.followedPlan, false, "left the plan");
  chk(ex?.movedStop, true, "moved stop");
  chk(ex?.chased, true, "chased entry");
  chk(ps?.fomo, true, "FOMO");
  chk(ps?.revenge, true, "revenge urge");
  if (ex?.exitedEarly !== null && ex?.exitedEarly !== undefined) known = true; // answered, but an early exit is not by itself a rule break
  if (typeof fu?.mistake === "string" && fu.mistake !== "") { known = true; if (fu.mistake !== "none") reasons.push("tagged mistake"); }
  if (oc?.processVerdict) { known = true; if (oc.processVerdict === "process-failure") reasons.push("process failure"); }
  return { known, broke: reasons.length > 0, reasons };
}

const hourOf = (t?: string) => { const m = t?.match(/^(\d{1,2}):/); return m ? Number(m[1]) : null; };
const posNum = (v: unknown) => (typeof v === "number" && v > 0 ? v : null);

/** Chronological features. Only information available at the time of each trade is used for `afterLoss`/`prevQty`. */
export function featurize(entries: JournalEntry[], plans: TradePlan[]): TF[] {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date) || (a.entryTime ?? "").localeCompare(b.entryTime ?? "") || a.createdAt - b.createdAt);
  const planDates = new Set(plans.map((p) => p.date));
  const out: TF[] = [];
  let day = "", prev: JournalEntry | null = null, no = 0;
  for (const e of sorted) {
    if (e.date !== day) { day = e.date; prev = null; no = 0; }
    no++;
    const p = processOf(e);
    out.push({
      e, date: e.date, dow: new Date(`${e.date}T12:00:00Z`).getUTCDay(), hour: hourOf(e.entryTime), tradeNo: no,
      afterLoss: !!prev && prev.pnl < 0, afterWin: !!prev && prev.pnl > 0,
      known: p.known, broke: p.broke, reasons: p.reasons, loss: e.pnl < 0, win: e.pnl > 0,
      plan: !!e.planId || planDates.has(e.date), qty: posNum(e.quantity), prevQty: prev ? posNum(prev.quantity) : null,
    });
    prev = e;
  }
  return out;
}

/* ============================ comparison runner ============================ */

export interface Understanding {
  /** Chronological per-trade features (reused for episodic extraction, not persisted). */
  features: TF[];
  observations: Observation[];
  gaps: MemoryGap[];
  /** Axes that had enough data to be evaluated this pass (see `reconcileAxes`). */
  tested: string[];
  coverage: { trades: number; withProcess: number };
  /** Recent-vs-earlier process change, when there is enough history to say. */
  shift: { direction: "improving" | "worsening" | "steady"; recent: Ratio; earlier: Ratio } | null;
}

interface PoleDef { axis?: string; pole: string; short: string; text: (a: Ratio, b: Ratio) => string; polarity: Polarity; kind?: "semantic" | "procedural"; tags?: string[]; topic?: MemoryTopic }
interface Spec {
  axis: string;
  topic: MemoryTopic;
  universe: (t: TF) => boolean;
  pick: (t: TF) => "A" | "B" | null;
  outcome: (t: TF) => boolean;
  need: number;
  m?: number;
  gap?: string;
  worse?: PoleDef;
  better?: PoleDef;
}
interface Sink { obs: Observation[]; gaps: MemoryGap[]; tested: Set<string> }

function rates(tf: TF[], s: Spec) {
  const A = { k: 0, n: 0 }, B = { k: 0, n: 0 };
  const evA: TF[] = [];
  for (const t of tf) {
    if (!s.universe(t)) continue;
    const g = s.pick(t);
    if (!g) continue;
    const bucket = g === "A" ? A : B;
    bucket.n++;
    const out = s.outcome(t);
    if (out) bucket.k++;
    if (g === "A") evA.push(t);
  }
  return { A, B, evA };
}

const ev = (ts: TF[], want: boolean, s: Spec): EvidenceRef[] =>
  ts.filter((t) => s.outcome(t) === want).slice(-5).reverse().map((t) => ({ entryId: t.e.id, date: t.date, note: t.reasons.slice(0, 2).join(", ") || undefined }));

/**
 * Stability checks. `replicated`: the effect points the same way in BOTH halves of the history.
 * `recentAgrees`: in the newest 40% the effect still keeps at least a quarter of its overall size. Direction alone is not enough,
 * because noise has the right sign half the time; a belief the newest trades no longer show must not stay "supported".
 */
function stability(tf: TF[], s: Spec, dir: "worse" | "better") {
  const sign = dir === "worse" ? 1 : -1;
  const diff = (sub: TF[], min: number) => {
    const { A, B } = rates(sub, s);
    return A.n < min || B.n < min ? null : sign * (A.k / A.n - B.k / B.n);
  };
  const mid = Math.floor(tf.length / 2);
  const h1 = diff(tf.slice(0, mid), 3), h2 = diff(tf.slice(mid), 3);
  const all = diff(tf, 1) ?? 0;
  const recent = diff(tf.slice(Math.floor(tf.length * 0.6)), 5);
  return { replicated: h1 !== null && h2 !== null && h1 > 0 && h2 > 0, recentAgrees: recent === null || recent >= 0.25 * all };
}

function emit(tf: TF[], s: Spec, def: PoleDef, dir: "worse" | "better", A: Ratio, B: Ratio, prob: number, m: number, evA: TF[], sink: Sink, axisOverride?: string) {
  const st = stability(tf, s, dir);
  const level = evidenceLevel(prob, A.n, B.n, m, st.replicated, st.recentAgrees);
  if (!level) return null;
  const axis = axisOverride ?? def.axis ?? s.axis;
  const o: Observation = {
    id: `sem:${axis}:${def.pole}`, kind: def.kind ?? "semantic", topic: def.topic ?? s.topic, text: def.text(A, B), short: def.short,
    stance: "inference", polarity: def.polarity, level, confidence: prob, n: A.n + B.n, axis, pole: def.pole,
    evidence: ev(evA, dir === "worse", s), tags: def.tags ?? [], origin: "derived",
  };
  sink.obs.push(o);
  return o;
}

function runSpec(tf: TF[], s: Spec, sink: Sink) {
  const { A, B, evA } = rates(tf, s);
  if (A.n < s.need || B.n < s.need) {
    if (A.n + B.n > 0 && s.gap) sink.gaps.push({ topic: s.gap, have: Math.min(A.n, B.n), need: s.need, note: `${Math.min(A.n, B.n)} of ${s.need} comparable trades` });
    return;
  }
  sink.tested.add(s.axis);
  const m = s.m ?? 1;
  if (s.worse) emit(tf, s, s.worse, "worse", A, B, probGreater(A, B), m, evA, sink);
  if (s.better) emit(tf, s, s.better, "better", A, B, probGreater(B, A), m, evA, sink);
}

/** Scan many candidate windows; keep only the single best "worse" and best "better" (with a stricter gate for the scan size). */
function runScan(tf: TF[], keys: string[], make: (key: string) => Spec, axes: { worse: string; better: string }, minN: number, gap: string, sink: Sink) {
  const elig = keys.filter((k) => { const { A } = rates(tf, make(k)); return A.n >= minN; });
  if (!elig.length) {
    const best = Math.max(0, ...keys.map((k) => rates(tf, make(k)).A.n));
    if (keys.length) sink.gaps.push({ topic: gap, have: best, need: minN, note: `${best} of ${minN} trades in the busiest window` });
    return;
  }
  sink.tested.add(axes.worse); sink.tested.add(axes.better);
  const m = elig.length;
  let bestW: { k: string; prob: number } | null = null, bestB: { k: string; prob: number } | null = null;
  for (const k of elig) {
    const s = make(k);
    const { A, B } = rates(tf, s);
    if (B.n < minN) continue;
    const pw = probGreater(A, B), pb = probGreater(B, A);
    if (!bestW || pw > bestW.prob) bestW = { k, prob: pw };
    if (!bestB || pb > bestB.prob) bestB = { k, prob: pb };
  }
  for (const [pick, dir] of [[bestW, "worse"], [bestB, "better"]] as const) {
    if (!pick) continue;
    const s = make(pick.k);
    const { A, B, evA } = rates(tf, s);
    const def = dir === "worse" ? s.worse : s.better;
    if (def) emit(tf, s, def, dir, A, B, pick.prob, m, evA, sink, dir === "worse" ? axes.worse : axes.better);
  }
}

/* ================================== main ================================== */

const ratio = (r: Ratio) => `${r.k} of ${r.n}`;
const hh = (h: number) => `${String(h).padStart(2, "0")}:00–${String((h + 1) % 24).padStart(2, "0")}:00`;
const DOW = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "unnamed";

export function understand(entries: JournalEntry[], plans: TradePlan[], mind?: MindState | null): Understanding {
  const tf = featurize(entries, plans);
  const known = tf.filter((t) => t.known);
  const sink: Sink = { obs: [], gaps: [], tested: new Set() };
  const broke = (t: TF) => t.broke;
  const isKnown = (t: TF) => t.known;

  // 1. After a loss
  runSpec(tf, {
    axis: "post-loss", topic: "execution", universe: isKnown, pick: (t) => (t.afterLoss ? "A" : "B"), outcome: broke, need: 5, gap: "Behaviour after a loss",
    worse: { pole: "slips-after-loss", short: "Slips more right after a loss", polarity: "risk", text: (a, b) => `After a loss, your next trade broke your own process in ${ratio(a)} cases, vs ${ratio(b)} otherwise.` },
    better: { pole: "steady-after-loss", short: "Stays steady after a loss", polarity: "strength", text: (a, b) => `After a loss, your next trade broke your own process in only ${ratio(a)} cases, vs ${ratio(b)} otherwise.` },
  }, sink);

  // 2. Later trades of the day
  runSpec(tf, {
    axis: "late-day", topic: "execution", universe: isKnown, pick: (t) => (t.tradeNo >= 3 ? "A" : "B"), outcome: broke, need: 4, gap: "Third trade of the day and later",
    worse: { pole: "later-trades-slip", short: "Third trade of the day onward slips", polarity: "risk", text: (a, b) => `Your 3rd-or-later trade of a day broke your process in ${ratio(a)} cases, vs ${ratio(b)} for trades 1–2.` },
  }, sink);

  // 3. Planning first (procedural: a routine associated with better execution)
  runSpec(tf, {
    axis: "plan-first", topic: "habit", universe: isKnown, pick: (t) => (t.plan ? "A" : "B"), outcome: broke, need: 5, gap: "Planning before trading",
    better: { pole: "plan-helps", kind: "procedural", short: "Slips less on days you plan first", polarity: "strength", text: (a, b) => `On days with a written plan, trades broke your process in ${ratio(a)} cases, vs ${ratio(b)} with no plan.` },
  }, sink);

  // 4. Sizing after a loss
  runSpec(tf, {
    axis: "size-after-loss", topic: "risk", universe: (t) => t.qty !== null && t.prevQty !== null && (t.afterLoss || t.afterWin),
    pick: (t) => (t.afterLoss ? "A" : "B"), outcome: (t) => t.qty! > t.prevQty! * 1.25, need: 4, gap: "Position size after a loss",
    worse: { pole: "size-up-after-loss", short: "Sizes up after a loss", polarity: "risk", text: (a, b) => `After a loss you increased size in ${ratio(a)} next trades, vs ${ratio(b)} after a win.` },
  }, sink);

  // 5/6. Execution behaviours that coincide with losing
  for (const [key, label, short, ax] of [["movedStop", "moved your stop", "Moving your stop goes with more losses", "moved-stop-loses"], ["chased", "chased the entry", "Chased entries go with more losses", "chased-loses"]] as const) {
    const answered = (t: TF) => t.e.review?.execution?.[key] !== null && t.e.review?.execution?.[key] !== undefined;
    runSpec(tf, {
      axis: ax, topic: "risk", universe: answered, pick: (t) => (t.e.review?.execution?.[key] === true ? "A" : "B"), outcome: (t) => t.loss, need: 4, gap: `Trades where you ${label}`,
      worse: { pole: `${ax}-worse`, short, polarity: "risk", text: (a, b) => `Trades where you ${label} lost in ${ratio(a)} cases, vs ${ratio(b)} when you didn't.` },
    }, sink);
  }

  // 7. Time of day / day of week / setup (scans)
  const hours = [...new Set(known.filter((t) => t.hour !== null).map((t) => String(t.hour)))];
  runScan(tf, hours, (k) => ({
    axis: "time", topic: "timing", universe: (t) => t.known && t.hour !== null, pick: (t) => (String(t.hour) === k ? "A" : "B"), outcome: broke, need: 4,
    worse: { axis: "time-worst", pole: `worst-${k}`, short: `Process slips around ${hh(Number(k))}`, polarity: "risk", tags: [`hour:${k}`], text: (a, b) => `Trades entered ${hh(Number(k))} NY broke your process in ${ratio(a)} cases, vs ${ratio(b)} at other times.` },
    better: { axis: "time-best", pole: `best-${k}`, short: `Cleanest around ${hh(Number(k))}`, polarity: "strength", tags: [`hour:${k}`], text: (a, b) => `Trades entered ${hh(Number(k))} NY broke your process in only ${ratio(a)} cases, vs ${ratio(b)} at other times.` },
  }), { worse: "time-worst", better: "time-best" }, 4, "Time-of-day pattern", sink);

  const dows = [...new Set(known.map((t) => String(t.dow)))];
  runScan(tf, dows, (k) => ({
    axis: "dow", topic: "timing", universe: isKnown, pick: (t) => (String(t.dow) === k ? "A" : "B"), outcome: broke, need: 5,
    worse: { axis: "dow-worst", pole: `worst-${k}`, short: `${DOW[Number(k)]} are harder for you`, polarity: "risk", tags: [`dow:${k}`], text: (a, b) => `On ${DOW[Number(k)]}, trades broke your process in ${ratio(a)} cases, vs ${ratio(b)} on other days.` },
    better: { axis: "dow-best", pole: `best-${k}`, short: `${DOW[Number(k)]} are your cleanest`, polarity: "strength", tags: [`dow:${k}`], text: (a, b) => `On ${DOW[Number(k)]}, trades broke your process in only ${ratio(a)} cases, vs ${ratio(b)} on other days.` },
  }), { worse: "dow-worst", better: "dow-best" }, 5, "Day-of-week pattern", sink);

  const setups = [...new Set(known.map((t) => t.e.setup?.trim()).filter((s): s is string => !!s))];
  runScan(tf, setups, (k) => ({
    axis: "setup", topic: "strategy", universe: (t) => t.known && !!t.e.setup?.trim(), pick: (t) => (t.e.setup?.trim() === k ? "A" : "B"), outcome: broke, need: 6,
    worse: { axis: "setup-messy", pole: `messy-${slug(k)}`, short: `${k}: process slips more`, polarity: "risk", tags: [`setup:${slug(k)}`], text: (a, b) => `On ${k}, trades broke your process in ${ratio(a)} cases, vs ${ratio(b)} on your other setups.` },
    better: { axis: "setup-clean", pole: `clean-${slug(k)}`, short: `${k}: your cleanest setup`, polarity: "strength", tags: [`setup:${slug(k)}`], text: (a, b) => `On ${k}, trades broke your process in only ${ratio(a)} cases, vs ${ratio(b)} on your other setups.` },
  }), { worse: "setup-messy", better: "setup-clean" }, 6, "Setup comparison", sink);

  // 8. Recent vs earlier (behavioural change over time)
  let shift: Understanding["shift"] = null;
  if (known.length >= 24) {
    const W = Math.min(30, Math.floor(known.length / 3));
    const recent = known.slice(-W), earlier = known.slice(0, known.length - W);
    const A = { k: recent.filter(broke).length, n: recent.length }, B = { k: earlier.filter(broke).length, n: earlier.length };
    const pw = probGreater(A, B), pb = probGreater(B, A);
    sink.tested.add("trend");
    const mk = (pole: string, short: string, polarity: Polarity, text: string, prob: number): Observation | null => {
      const level = evidenceLevel(prob, A.n, B.n, 1, false, true);
      if (!level) return null;
      const o: Observation = { id: `sem:trend:${pole}`, kind: "semantic", topic: "habit", text, short, stance: "inference", polarity, level, confidence: prob, n: A.n + B.n, axis: "trend", pole, evidence: recent.filter(broke).slice(-3).reverse().map((t) => ({ entryId: t.e.id, date: t.date, note: t.reasons.slice(0, 2).join(", ") || undefined })), origin: "derived" };
      sink.obs.push(o);
      return o;
    };
    const worse = mk("worsening", "Process has slipped lately", "risk", `Your last ${W} reviewed trades broke your process in ${ratio(A)} cases, vs ${ratio(B)} before that.`, pw);
    const better = mk("improving", "Process is improving", "strength", `Your last ${W} reviewed trades broke your process in only ${ratio(A)} cases, vs ${ratio(B)} before that.`, pb);
    shift = { direction: worse ? "worsening" : better ? "improving" : "steady", recent: A, earlier: B };
  } else if (known.length > 0) {
    sink.gaps.push({ topic: "Recent change in your process", have: known.length, need: 24, note: `${known.length} of 24 reviewed trades` });
  }

  // 9. Wins that still broke the rules (recorded fact, reported as a count, with a Wilson bound so small samples stay quiet)
  const wins = known.filter((t) => t.win);
  if (wins.length >= 8) {
    const k = wins.filter(broke).length;
    const w = wilson(k, wins.length);
    sink.tested.add("win-quality");
    if (w.lo >= 0.2) {
      sink.obs.push({
        id: "sem:win-quality:wins-with-slips", kind: "semantic", topic: "execution", stance: "fact", polarity: "risk", level: "supported", confidence: Math.round(w.lo * 100) / 100,
        text: `${k} of ${wins.length} reviewed winning trades still broke your own rules.`, short: "Some wins broke your rules", n: wins.length, axis: "win-quality", pole: "wins-with-slips",
        evidence: wins.filter(broke).slice(-3).reverse().map((t) => ({ entryId: t.e.id, date: t.date, note: t.reasons.slice(0, 2).join(", ") || undefined })), origin: "derived",
      });
    }
  } else if (known.length > 0) {
    sink.gaps.push({ topic: "Quality of winning trades", have: wins.length, need: 8, note: `${wins.length} of 8 reviewed wins` });
  }

  // 10. Reported feelings → what the next trade did (uses the existing Mind counters; "trouble" = lost or broke process, as Mind defines it)
  if (mind) {
    const trouble = (t: TF) => t.loss || t.broke;
    const base: Ratio = { k: tf.filter(trouble).length, n: tf.length };
    const cand = (Object.entries(mind.stats) as [Mood, { seen: number; hits: number }][]).filter(([mood, s]) => !isPositive(mood) && s.seen >= 4);
    for (const [mood, s] of cand) {
      sink.tested.add(`mood:${mood}`);
      const A = { k: s.hits, n: s.seen };
      const level = evidenceLevel(probGreater(A, base), A.n, base.n, cand.length, false, true);
      if (!level) continue;
      const label = MOOD_LABEL[mood].toLowerCase();
      const keptNotes = mind.notes.filter((n) => n.status === "kept" && n.mood === mood && n.tradeId).slice(-3).reverse();
      sink.obs.push({
        id: `sem:mood:${mood}:linked`, kind: "semantic", topic: "emotion", stance: "inference", polarity: "risk", level, confidence: probGreater(A, base),
        text: `After you told me you felt ${label}, your next trade ran into trouble ${ratio(A)} times (all trades: ${ratio(base)}).`, short: `Feeling ${label} goes with rough next trades`, n: A.n, axis: `mood:${mood}`, pole: "linked-to-trouble",
        evidence: keptNotes.map((n) => ({ entryId: n.tradeId, date: n.date, note: `you said: “${n.quote.slice(0, 70)}”` })), tags: [`mood:${mood}`], origin: "derived",
      });
    }
    if (!cand.length && Object.keys(mind.stats).length > 0) sink.gaps.push({ topic: "Feelings you mention vs. your next trade", have: Math.max(0, ...Object.values(mind.stats).map((x) => x?.seen ?? 0)), need: 4, note: "needs 4 tested mentions of the same feeling" });
  }

  // 11. Recurring behaviours the trader wrote about themselves (counts of the trader's own words, so they are recorded facts)
  if (entries.length >= 5) for (const id of PATTERN_IDS) sink.tested.add(`habit:${id}`);
  for (const p of detectPatterns(entries)) {
    const fading = p.improving;
    sink.obs.push({
      id: `sem:habit:${p.id}:${fading ? "fading" : "recurs"}`, kind: "semantic", topic: "habit", stance: "fact", polarity: fading ? "strength" : "risk",
      level: p.confidence === "established" ? "established" : p.confidence === "repeated" ? "supported" : "hypothesis",
      confidence: p.confidence === "established" ? 0.95 : p.confidence === "repeated" ? 0.85 : 0.6,
      text: fading ? `“${p.label}” showed up ${p.count} times in your reviews, but not in your last 5 reviewed trades.` : `“${p.label}” appears in ${p.count} of your own written reviews.`,
      short: fading ? `${p.label}: fading` : p.label, n: p.count, axis: `habit:${p.id}`, pole: fading ? "fading" : "recurs",
      evidence: p.evidence.slice(0, 3).map((e) => ({ entryId: e.entryId, date: e.date, note: e.excerpt.slice(0, 80) })), tags: [`habit:${p.id}`], origin: "derived",
    });
  }

  const gaps = sink.gaps.filter((g, i, a) => a.findIndex((x) => x.topic === g.topic) === i).sort((a, b) => (b.have / b.need) - (a.have / a.need)).slice(0, 4);
  return { features: tf, observations: sink.obs, gaps, tested: [...sink.tested], coverage: { trades: tf.length, withProcess: known.length }, shift };
}
