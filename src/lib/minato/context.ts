import type { JournalEntry, PlaybookSetup, RuleDef } from "../types";
import type { Violation } from "../rules";
import type { AdherenceSummary } from "../rules";
import type { JournalStats } from "../types";
import type { DisciplineSummary } from "../discipline";
import { entriesNewestFirst, formatHistoricalDate } from "../tz";

/* ------------------------------------------------------------------ */
/*  EdgeBookContext — structured, privacy-filtered context for MINATO  */
/*                                                                      */
/*  Deterministic retrieval: we never dump the whole journal. The       */
/*  builder assembles only what the companion needs, and journal        */
/*  notes/reflections are included only when the user allows it.        */
/* ------------------------------------------------------------------ */

export interface TradeReviewContext {
  entry: JournalEntry;
  /** Playbook setup matched by the entry's setup label (strategy isolation). */
  strategy: PlaybookSetup | null;
  violations: Violation[];
}

export interface EdgeBookContext {
  userFirstName: string;
  stats: JournalStats;
  discipline: DisciplineSummary;
  adherence: AdherenceSummary;
  /** Newest-first. */
  recentTrades: JournalEntry[];
  /** Trades under the lens right now (review flow / selected day). */
  focus: TradeReviewContext | null;
  playbook: PlaybookSetup[];
  activeRules: RuleDef[];
  /** Recurring behaviour keywords mined from reflections (structured memory seam). */
  recurringPatterns: { pattern: string; count: number }[];
  privacy: { includeNotes: boolean };
}

const MISTAKE_KEYWORDS: { pattern: string; keys: string[] }[] = [
  { pattern: "early entry / FOMO", keys: ["early", "fomo", "chased", "before confirmation", "miss the move"] },
  { pattern: "revenge trading", keys: ["revenge", "back to back entry", "immediately after loss"] },
  { pattern: "moving stop loss", keys: ["moved stop", "moving stop", "widened stop", "stop loss shift"] },
  { pattern: "oversized risk", keys: ["oversize", "too big", "size increase", "large position"] },
  { pattern: "skipped confirmation", keys: ["confirmation", "smt", "no confirm"] },
  { pattern: "no setup / impulse", keys: ["no setup", "impulse", "outside setup", "unnamed"] },
];

/** Mine recorded reflections for repeated behaviour patterns. Cautious: only counts actual text. */
export function findRecurringPatterns(entries: JournalEntry[], minCount = 2): { pattern: string; count: number }[] {
  const texts: string[] = [];
  for (const e of entries) {
    const r = e.reflection;
    if (!r) continue;
    if (r.wentPoorly) texts.push(r.wentPoorly.toLowerCase());
    if (r.cause) texts.push(r.cause.toLowerCase());
    if (r.lesson) texts.push(r.lesson.toLowerCase());
  }
  const found: { pattern: string; count: number }[] = [];
  for (const { pattern, keys } of MISTAKE_KEYWORDS) {
    const count = texts.filter((t) => keys.some((k) => t.includes(k))).length;
    if (count >= minCount) found.push({ pattern, count });
  }
  return found.sort((a, b) => b.count - a.count);
}

/** Match an entry to its playbook strategy by setup label (exact, case-insensitive). */
export function strategyForEntry(entry: JournalEntry, playbook: PlaybookSetup[]): PlaybookSetup | null {
  if (!entry.setup) return null;
  const s = entry.setup.toLowerCase();
  return playbook.find((p) => p.name.toLowerCase() === s) ?? null;
}

/**
 * Historical lookup — actual recorded trades only, never fabricated.
 * Matches by setup label (and optionally instrument).
 */
export function findSimilarTrades(
  entry: JournalEntry,
  entries: JournalEntry[],
  opts?: { instrument?: boolean },
): JournalEntry[] {
  return entriesNewestFirst(entries).filter(
    (e) =>
      e.id !== entry.id &&
      !!e.setup &&
      e.setup.toLowerCase() === entry.setup.toLowerCase() &&
      (opts?.instrument ? e.instrument === entry.instrument : true),
  );
}

/** Execution verdict — profit is NOT the same as good execution. */
export type ExecutionVerdict =
  | "clean-win"
  | "profitable-but-sloppy"
  | "valid-loss"
  | "loss-and-sloppy"
  | "unreflected";

export function executionVerdict(entry: JournalEntry): ExecutionVerdict {
  const r = entry.reflection;
  if (!r || (r.followedSetup === null && r.followedRisk === null)) return "unreflected";
  const brokeRules = r.followedSetup === false || r.followedRisk === false;
  if (entry.pnl > 0) return brokeRules ? "profitable-but-sloppy" : "clean-win";
  if (entry.pnl < 0) return brokeRules ? "loss-and-sloppy" : "valid-loss";
  return brokeRules ? "loss-and-sloppy" : "valid-loss";
}

export function buildContext(args: {
  userFirstName: string;
  entries: JournalEntry[];
  stats: JournalStats;
  discipline: DisciplineSummary;
  adherence: AdherenceSummary;
  playbook: PlaybookSetup[];
  activeRules: RuleDef[];
  violations: Violation[];
  focusEntry?: JournalEntry | null;
  includeNotes: boolean;
}): EdgeBookContext {
  const { focusEntry, playbook } = args;
  return {
    userFirstName: args.userFirstName,
    stats: args.stats,
    discipline: args.discipline,
    adherence: args.adherence,
    recentTrades: entriesNewestFirst(args.entries).slice(0, 20),
    focus:
      focusEntry
        ? {
            entry: focusEntry,
            strategy: strategyForEntry(focusEntry, playbook),
            violations: args.violations.filter((v) => v.entryId === focusEntry.id || v.date === focusEntry.date),
          }
        : null,
    playbook,
    activeRules: args.activeRules,
    recurringPatterns: findRecurringPatterns(args.entries),
    privacy: { includeNotes: args.includeNotes },
  };
}

/** Historical date for display — always DD/MM/YYYY per the trading convention. */
export function histDate(entry: JournalEntry): string {
  return formatHistoricalDate(entry.date);
}
