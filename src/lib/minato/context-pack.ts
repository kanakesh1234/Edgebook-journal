/**
 * Context packer: applies the router's plan to the full deterministic facts so the model sees only what the question needs.
 *
 *  - Selection by reference: trades the question points at (dates, "last 3", instrument, setup, worst/best, focus trade) are
 *    resolved first; the rest of the journal is summarised, not dumped.
 *  - Compaction: null/empty fields are dropped; prices and setup evidence appear only when the intent needs them.
 *  - Honesty: `scope` tells the model what it is (not) looking at, so a trimmed view is never mistaken for an empty journal.
 */
import { sanitizeMemoryPayload } from "./pack-memory";
import type { MemoryPayload } from "./retrieve";
import type { ContextPlan, Route, TradeRefs } from "./router";

export { sanitizeMemoryPayload };

type Row = Record<string, unknown> & { id?: string | null; date?: string | null; instrument?: string | null; setup?: string | null; direction?: string | null; pnl?: number | null };
interface Words { date: unknown; instrument: unknown; setup: unknown; text: unknown }

export interface PackInput {
  facts: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  route: Route;
  plan: ContextPlan;
  refs: TradeRefs;
  focusId?: string | null;
  memory?: MemoryPayload | null;
  today: string;
}
export interface PackMeta { intent: string; confidence: number; approxTokens: number; fullApproxTokens: number; tradesShown: number; tradesInJournal: number }

export const approxTokens = (v: unknown) => Math.ceil(JSON.stringify(v ?? null).length / 3.7);

/** Recursively drop null / undefined / "" / [] / {} so the model is not charged for absent fields. */
export function dropEmpty<T>(v: T): T {
  if (Array.isArray(v)) return v.map(dropEmpty).filter((x) => !isEmpty(x)) as unknown as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) { const d = dropEmpty(x); if (!isEmpty(d)) out[k] = d; }
    return out as T;
  }
  return v;
}
const isEmpty = (x: unknown) => x === null || x === undefined || x === "" || (Array.isArray(x) && !x.length) || (typeof x === "object" && x !== null && !Array.isArray(x) && !Object.keys(x).length);

const PRICE_KEYS = ["entryPrice", "exitPrice", "stopLoss", "takeProfit", "exitTime", "screenshots"];
function compactRow(r: Row, detail: boolean) {
  const { id: _id, ...rest } = r;
  if (!detail) for (const k of PRICE_KEYS) delete (rest as Record<string, unknown>)[k];
  return dropEmpty(rest);
}

const dowOf = (d: string) => new Date(`${d}T12:00:00Z`).getUTCDay();
const daysBetween = (a: string, b: string) => Math.round((new Date(`${a}T12:00:00Z`).getTime() - new Date(`${b}T12:00:00Z`).getTime()) / 86_400_000);

/** Indices (newest-first order) of the trades this question refers to. */
export function selectReferenced(rows: Row[], refs: TradeRefs, plan: ContextPlan, focusId: string | null | undefined, today: string): number[] {
  const cap = plan.trades.resolved;
  const picked = new Set<number>();
  const outcomeOk = (r: Row) => !refs.outcome || (refs.outcome === "loss" ? (r.pnl ?? 0) < 0 : (r.pnl ?? 0) > 0);
  const scoped = rows.map((r, i) => ({ r, i })).filter(({ r }) =>
    (!refs.instruments.length || refs.instruments.some((x) => x.toLowerCase() === String(r.instrument ?? "").toLowerCase())) &&
    (!refs.setups.length || refs.setups.some((x) => String(r.setup ?? "").toLowerCase().includes(x.toLowerCase()))));

  if (focusId) { const i = rows.findIndex((r) => r.id === focusId); if (i >= 0) picked.add(i); }
  rows.forEach((r, i) => {
    const d = r.date ?? "";
    if (refs.dates.includes(d) || refs.ranges.some((g) => d >= g.from && d <= g.to)) picked.add(i);
    if (refs.weekdays.length && d && refs.weekdays.includes(dowOf(d)) && daysBetween(today, d) <= 42 && daysBetween(today, d) >= 0) picked.add(i);
  });
  if (refs.extreme) {
    const pool = (refs.instruments.length || refs.setups.length ? scoped : rows.map((r, i) => ({ r, i }))).filter(({ r }) => r.pnl !== null && r.pnl !== undefined);
    pool.sort((a, b) => (refs.extreme === "worst" ? (a.r.pnl! - b.r.pnl!) : (b.r.pnl! - a.r.pnl!))).slice(0, 3).forEach(({ i }) => picked.add(i));
  } else if (refs.lastN) {
    scoped.filter(({ r }) => outcomeOk(r)).slice(0, refs.lastN).forEach(({ i }) => picked.add(i));
  } else if (refs.instruments.length || refs.setups.length) {
    scoped.filter(({ r }) => outcomeOk(r)).slice(0, 12).forEach(({ i }) => picked.add(i));
  }
  if (!picked.size && plan.intent === "trade_review") rows.slice(0, 3).forEach((_, i) => picked.add(i));

  const sorted = [...picked].sort((a, b) => a - b);
  const keep = sorted.filter((i) => rows[i].id === focusId && focusId);
  const rest = sorted.filter((i) => !keep.includes(i));
  return [...keep, ...rest].slice(0, Math.max(cap, keep.length)).sort((a, b) => a - b);
}

/** Closest earlier analogues of a trade: same setup first, then instrument, direction, weekday. */
export function analogsOf(rows: Row[], base: Row, exclude: Set<number>, n: number): number[] {
  if (n <= 0) return [];
  return rows.map((r, i) => {
    if (exclude.has(i)) return { i, s: -1 };
    let s = 0;
    if (base.setup && r.setup && String(r.setup).toLowerCase() === String(base.setup).toLowerCase()) s += 2;
    if (base.instrument && r.instrument === base.instrument) s += 1;
    if (base.direction && r.direction === base.direction) s += 0.5;
    if (base.date && r.date && dowOf(base.date) === dowOf(r.date)) s += 0.5;
    return { i, s };
  }).filter((x) => x.s >= 2).sort((a, b) => b.s - a.s || a.i - b.i).slice(0, n).map((x) => x.i);
}

const clipJson = (v: unknown, chars: number) => { const s = JSON.stringify(v); return s.length > chars ? `${s.slice(0, chars - 1)}…` : v; };

export function packFacts(inp: PackInput): { facts: Record<string, unknown>; meta: PackMeta } {
  const { facts: f, plan, route, refs, today } = inp;
  const rows: Row[] = Array.isArray(f.recentTrades) ? f.recentTrades : [];
  const words: Words[] = Array.isArray(f.traderWords) ? f.traderWords : [];

  const ref = selectReferenced(rows, refs, plan, inp.focusId, today);
  const refSet = new Set(ref);
  const recentIdx = rows.map((_, i) => i).filter((i) => !refSet.has(i)).slice(0, plan.trades.recent);
  const analogIdx: number[] = [];
  for (const i of ref.slice(0, 2)) for (const j of analogsOf(rows, rows[i], new Set([...ref, ...recentIdx, ...analogIdx]), plan.analogs)) if (analogIdx.length < plan.analogs && !analogIdx.includes(j)) analogIdx.push(j);

  const wordIdx = [...ref, ...recentIdx].slice(0, plan.words.rows);
  const out: Record<string, unknown> = {
    currentContext: f.currentContext, trader: f.trader, primaryChallenge: f.primaryChallenge,
    scope: {
      intent: route.intent,
      tradesInJournal: rows.length,
      tradesShown: ref.length + recentIdx.length + analogIdx.length,
      note: "referencedTrades / recentTrades / similarPastTrades hold only the trades relevant to THIS question, not the whole journal. If the trader asks about a trade that is not shown, say you cannot see it in this view and ask for its date or instrument. Never claim a trade does not exist.",
    },
  };
  if (plan.stats) out.totals = { trades: f.trades, totalPnl: f.totalPnl, winRatePct: f.winRatePct, avgDayPnl: f.avgDayPnl, drawdown: f.drawdown, processScore: f.processScore, reviewedCount: f.reviewedCount, planVsActual: f.planVsActual };
  if (plan.hold) out.hold = f.hold;
  if (plan.patterns) out.patterns = f.patterns;
  const d = f.deep ?? {};
  const deep: Record<string, unknown> = {};
  if (plan.deep.time) deep.timeWindows = d.timeWindows;
  if (plan.deep.dow) deep.dayOfWeek = d.dayOfWeek;
  if (plan.deep.setups) deep.setupPerformance = d.setupPerformance;
  if (plan.deep.behavior) deep.behaviorCounts = d.behaviorCounts;
  if (plan.deep.concepts) { deep.conceptWinRates = d.conceptWinRates; deep.conceptsUsed = f.conceptsUsed; }
  if (Object.keys(deep).length) out.deep = deep;

  if (ref.length) out.referencedTrades = ref.map((i) => compactRow(rows[i], plan.trades.detail));
  if (recentIdx.length) out.recentTrades = recentIdx.map((i) => compactRow(rows[i], false));
  if (analogIdx.length) out.similarPastTrades = analogIdx.map((i) => compactRow(rows[i], false));
  if (wordIdx.length && plan.words.rowChars > 0) {
    out.traderWords = wordIdx.map((i) => dropEmpty({ date: words[i]?.date, instrument: words[i]?.instrument, setup: words[i]?.setup, text: clipJson(dropEmpty(words[i]?.text), plan.words.rowChars) })).filter((x) => (x as Record<string, unknown>).text);
  }
  if (plan.words.lessons > 0 && Array.isArray(f.lessons)) out.lessons = f.lessons.slice(-plan.words.lessons);

  // Client-built companion, filtered to what this intent uses.
  const c = (f.companion ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const pc = plan.companion;
  const comp: Record<string, unknown> = {};
  if (pc.practice) comp.practice = c.practice;
  if (pc.plans && Array.isArray(c.plans)) {
    const dates = new Set(ref.map((i) => rows[i].date));
    comp.plans = (plan.intent === "trade_review" && dates.size ? c.plans.filter((p: { date?: string }) => dates.has(p.date ?? null)) : c.plans).slice(-(plan.intent === "planning" || plan.intent === "general" ? 10 : 4));
  }
  if (pc.noTradeDays) { comp.noTradeDays = c.noTradeDays; comp.todayLossLimit = c.todayLossLimit; }
  if (pc.mind) comp.mind = c.mind;
  const b = (c.brain ?? {}) as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  const brain: Record<string, unknown> = {};
  if (pc.today) brain.today = b.today;
  if (pc.recentDays > 0) brain.recentDays = (b.recentDays ?? []).slice(0, pc.recentDays);
  if (pc.commitments) { brain.commitments = b.commitments; brain.keptCommitments = b.keptCommitments; brain.brokenCommitments = b.brokenCommitments; }
  if (pc.saved) brain.savedByTrader = b.savedByTrader;
  if (plan.words.recalled > 0) brain.recalled = (b.recalled ?? []).slice(0, plan.words.recalled);
  if (pc.readiness) brain.readiness = b.readiness;
  if (Object.keys(brain).length) comp.brain = brain;
  if (Object.keys(comp).length) out.companion = comp;

  if (inp.memory && (inp.memory.beliefs.length || inp.memory.insufficient.length)) {
    out.memory = {
      note: "Minato's own beliefs about this trader. 'recorded' = a count from the journal; 'inferred' = an association between two groups of trades, never a cause or a personality trait. Hedge 'possible' and 'mixed signals'. Mention 'insufficient' when it bears on the answer.",
      beliefs: inp.memory.beliefs, insufficient: inp.memory.insufficient,
    };
  }

  const packed = dropEmpty(out);
  return {
    facts: packed,
    meta: {
      intent: route.intent, confidence: route.confidence, approxTokens: approxTokens(packed), fullApproxTokens: approxTokens(f),
      tradesShown: ref.length + recentIdx.length + analogIdx.length, tradesInJournal: rows.length,
    },
  };
}
