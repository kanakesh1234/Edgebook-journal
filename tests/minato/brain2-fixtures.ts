import type { JournalEntry, JournalSettings } from "../../src/lib/types.ts";
import type { EdgeBookContext } from "../../src/lib/minato/context.ts";
import { computeStats } from "../../src/lib/stats.ts";

export const SETTINGS: JournalSettings = { traderName: "Test", startingEquity: 10000, targetEquity: 20000, maxDrawdown: 1000, currency: "USD" } as JournalSettings;

type Verdict = "a-plus" | "process-success" | "process-failure" | "";
export function trade(o: { id: string; date: string; pnl: number; setup?: string; verdict?: Verdict; rr?: number | null; entryTime?: string; createdAt?: number; instrument?: string }): JournalEntry {
  return {
    id: o.id, date: o.date, pnl: o.pnl, rr: o.rr === undefined ? (o.pnl >= 0 ? 2 : -1) : o.rr, instrument: o.instrument ?? "MNQ", direction: "short",
    setup: o.setup ?? "", notes: "", images: [], entryTime: o.entryTime, createdAt: o.createdAt ?? 1, updatedAt: 1,
    review: o.verdict ? { outcome: { processVerdict: o.verdict } } : undefined,
  } as unknown as JournalEntry;
}

/** The journal shape from the bug report: 8 trades, a few A+ across two setups. */
export function screenshotJournal(): JournalEntry[] {
  return [
    trade({ id: "a1", date: "2026-10-20", pnl: 120, setup: "Sweep + SMT", verdict: "a-plus", entryTime: "09:40" }),
    trade({ id: "a2", date: "2026-10-21", pnl: 200, setup: "Sweep + SMT", verdict: "a-plus", entryTime: "09:35" }),
    trade({ id: "a3", date: "2026-10-22", pnl: 60, setup: "Retest", verdict: "a-plus", entryTime: "10:05" }),
    trade({ id: "b1", date: "2026-10-23", pnl: -80, setup: "Retest", verdict: "process-failure", entryTime: "10:20" }),
    trade({ id: "b2", date: "2026-10-24", pnl: -45, setup: "Sweep + SMT", verdict: "process-failure", entryTime: "09:50" }),
    trade({ id: "c1", date: "2026-10-27", pnl: 40, setup: "Retest", verdict: "process-success", entryTime: "09:45" }),
    trade({ id: "c2", date: "2026-10-28", pnl: -70, setup: "Retest", entryTime: "10:30" }),
    trade({ id: "c3", date: "2026-10-29", pnl: 15, setup: "Sweep + SMT", entryTime: "09:55" }),
  ];
}

export function ctxFor(entries: JournalEntry[], name = "Test"): EdgeBookContext {
  return {
    userFirstName: name, stats: computeStats(entries as never, SETTINGS),
    discipline: { disciplineStreak: 0, completionRate: 1, missedDays: 0 } as never, adherence: {} as never,
    recentTrades: entries, focus: null, playbook: [], activeRules: [], recurringPatterns: [], privacy: { includeNotes: true },
  };
}

/** Deterministic shuffle so order-sensitivity tests are reproducible. */
export function shuffled<T>(xs: T[], seed: number): T[] {
  const a = [...xs]; let s = seed >>> 0;
  for (let i = a.length - 1; i > 0; i--) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; const j = s % (i + 1); [a[i], a[j]] = [a[j]!, a[i]!]; }
  return a;
}
