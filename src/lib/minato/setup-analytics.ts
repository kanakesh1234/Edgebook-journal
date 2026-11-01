/**
 * SETUP ANALYTICS — deterministic answers to "which setup works", "my best A+ trades", "compare my setups".
 *
 * In EdgeBook, "A+" is a REVIEW VERDICT the trader gives a trade in Quick Autopsy
 * (`review.outcome.processVerdict === "a-plus"`), not a setup name. Nothing in MINATO could rank by it before, so
 * "best A+ setup" fell through every branch to a generic overview. These helpers compute it from the journal;
 * the model only phrases the result.
 */
import type { JournalEntry } from "@/lib/types";

export type Verdict = "a-plus" | "process-success" | "process-failure" | "unrated";

export const NO_SETUP = "(no setup recorded)";
/** Below this many trades a setup's win rate is an anecdote. */
export const THIN_SAMPLE = 5;

export function verdictOf(e: Pick<JournalEntry, "review">): Verdict {
  const v = e.review?.outcome?.processVerdict;
  return v === "a-plus" || v === "process-success" || v === "process-failure" ? v : "unrated";
}

const num = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? x : 0);

/** Newest first, deterministic. Date desc → entry time desc → createdAt desc → id. Tolerates missing fields. */
export function newestFirst<T extends Partial<Pick<JournalEntry, "date" | "entryTime" | "createdAt" | "id">>>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) =>
    (b.date ?? "").localeCompare(a.date ?? "")
    || (b.entryTime ?? "").localeCompare(a.entryTime ?? "")
    || num(b.createdAt) - num(a.createdAt)
    || String(a.id ?? "").localeCompare(String(b.id ?? "")),
  );
}

export interface SetupRow {
  setup: string;
  trades: number;
  wins: number;
  losses: number;
  /** wins / (wins + losses); breakeven trades are excluded. null when there is no decided trade. */
  winRatePct: number | null;
  netPnl: number;
  avgPnl: number;
  avgR: number | null;
  /** True when the sample is too small to rank on win rate. */
  thin: boolean;
}

export interface SetupBreakdown {
  rows: SetupRow[];
  /** Trades that went into the table (after the verdict filter). */
  considered: number;
  /** All trades in the journal. */
  total: number;
  filter: Verdict | "all";
}

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

export function setupBreakdown(entries: readonly JournalEntry[], opts: { verdict?: Verdict } = {}): SetupBreakdown {
  const pool = opts.verdict ? entries.filter((e) => verdictOf(e) === opts.verdict) : [...entries];
  const by = new Map<string, { n: number; wins: number; losses: number; pnl: number; r: number[] }>();
  for (const e of pool) {
    const key = e.setup?.trim() || NO_SETUP;
    const cur = by.get(key) ?? { n: 0, wins: 0, losses: 0, pnl: 0, r: [] };
    const pnl = num(e.pnl);
    cur.n++;
    cur.pnl += pnl;
    if (pnl > 0) cur.wins++;
    else if (pnl < 0) cur.losses++;
    if (typeof e.rr === "number" && Number.isFinite(e.rr)) cur.r.push(e.rr);
    by.set(key, cur);
  }
  const rows: SetupRow[] = [...by.entries()].map(([setup, v]) => ({
    setup,
    trades: v.n,
    wins: v.wins,
    losses: v.losses,
    winRatePct: v.wins + v.losses > 0 ? Math.round((v.wins / (v.wins + v.losses)) * 100) : null,
    netPnl: round(v.pnl),
    avgPnl: round(v.pnl / v.n),
    avgR: v.r.length ? round(v.r.reduce((s, x) => s + x, 0) / v.r.length) : null,
    thin: v.n < THIN_SAMPLE,
  }));
  rows.sort((a, b) => b.netPnl - a.netPnl || (b.winRatePct ?? -1) - (a.winRatePct ?? -1) || b.trades - a.trades || a.setup.localeCompare(b.setup));
  return { rows, considered: pool.length, total: entries.length, filter: opts.verdict ?? "all" };
}

export interface TradeLine { id: string | null; date: string | null; instrument: string | null; direction: string | null; setup: string; pnl: number; rr: number | null }

export interface APlusSummary {
  /** Trades the trader marked A+ in Quick Autopsy. */
  count: number;
  /** Trades that have any verdict at all (A+, good process, process failure). */
  rated: number;
  total: number;
  netPnl: number;
  winRatePct: number | null;
  bySetup: SetupRow[];
  /** Best row by net P&L (prefers a non-thin sample when one exists). */
  best: SetupRow | null;
  trades: TradeLine[];
}

export function aPlusSummary(entries: readonly JournalEntry[]): APlusSummary {
  const aplus = newestFirst(entries.filter((e) => verdictOf(e) === "a-plus"));
  const rated = entries.filter((e) => verdictOf(e) !== "unrated").length;
  const wins = aplus.filter((e) => num(e.pnl) > 0).length;
  const losses = aplus.filter((e) => num(e.pnl) < 0).length;
  const bySetup = setupBreakdown(entries, { verdict: "a-plus" }).rows;
  return {
    count: aplus.length,
    rated,
    total: entries.length,
    netPnl: round(aplus.reduce((s, e) => s + num(e.pnl), 0)),
    winRatePct: wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : null,
    bySetup,
    best: bySetup.find((r) => !r.thin) ?? bySetup[0] ?? null,
    trades: aplus.slice(0, 12).map((e) => ({
      id: e.id ?? null, date: e.date ?? null, instrument: e.instrument ?? null, direction: e.direction ?? null,
      setup: e.setup?.trim() || NO_SETUP, pnl: round(num(e.pnl)), rr: typeof e.rr === "number" ? e.rr : null,
    })),
  };
}

/* ------------------------------ question detection ------------------------------ */

const A_PLUS = /(?:^|[^\p{L}\p{N}])a\s?\+|\ba[- ]plus\b/iu;
const SETUP_WORD = /\b(setups?|playbook|strateg(?:y|ies)|models?)\b/i;
const RANKING = /\b(best|worst|top|strongest|weakest|most|least|rank\w*|compare|which|what|analy[sz]e\w*|breakdown|perform\w*|profitable|works?|edge)\b/i;

export interface SetupQuery { setups: boolean; aPlus: boolean }

/** True when the question is about setups and/or A+ trades. Pure; the route and respond() share it. */
export function wantsSetupAnalysis(q: string): SetupQuery {
  const aPlus = A_PLUS.test(q);
  const setups = SETUP_WORD.test(q) && RANKING.test(q);
  return { setups: setups || aPlus, aPlus };
}

/** Everything the model (or the fallback) needs, computed once. */
export function setupToolResult(entries: readonly JournalEntry[]) {
  return {
    all: setupBreakdown(entries),
    aPlus: aPlusSummary(entries),
    note: "A+ means the trader marked the trade \"A+ trade\" in Quick Autopsy. winRatePct excludes breakeven trades. thin = fewer than " + THIN_SAMPLE + " trades.",
  };
}
