/**
 * Focus — which of your trades deserve the most revision.
 *
 * Practice used to treat every trade the same: one question each, round-robin, and a question answered
 * correctly once was retired for good. That is the opposite of how mistakes are fixed. A blunder you keep
 * repeating needs MORE questions, asked MORE often, in several shapes — a clean trade needs a quick reminder.
 *
 * Everything here is computed from fields the trader already recorded (the journal Autopsy: mistake type,
 * severity "Slip / Costly / Blunder", plan followed, process verdict, the written notes — plus the P&L
 * itself). Nothing is invented. Pure functions only (no React, no storage) so the rules are easy to test.
 *
 *   assessTrade()  → blunder | slip | mixed | clean, with a weight that scales the trade's share of a round
 *   updateRevision()/isDue() → spaced repetition for blunder trades (a right answer is NOT retired for good;
 *                              it comes back after 1, 3, 7, 14 and 30 days; a miss resets it to today)
 */
import type { JournalEntry, PracticeProgress } from "@/lib/types";
import { addDaysKey } from "./consistency.ts";

export type TradeKind = "blunder" | "slip" | "mixed" | "clean";
export type Severity = 0 | 1 | 2 | 3;

export interface TradeFocus {
  id: string;
  kind: TradeKind;
  /** Raw evidence score (higher = worse). Exposed for tests and for ordering. */
  score: number;
  /** How many shares of a round this trade gets, relative to an ordinary trade (= 1). */
  weight: number;
  /** The trader's own rating from the Autopsy (0 = none recorded). */
  severity: Severity;
  /** The mistake key the trader picked (or the strongest recorded process flag), if any. */
  mistakeKey: string | null;
  mistakeLabel: string | null;
  /** Short human reasons, e.g. "You rated this a blunder", "Moved stop". */
  reasons: string[];
}

/** Autopsy mistake keys → the label the trader saw when they picked it. */
export const MISTAKE_LABELS: Record<string, string> = {
  early: "Entered early",
  chased: "Chased price",
  stop: "Moved stop",
  size: "Oversized",
  plan: "Broke plan",
  revenge: "Revenge trade",
  overtrade: "Overtraded",
};

export const SEVERITY_LABELS: Record<1 | 2 | 3, { label: string; noun: string }> = {
  1: { label: "Slip", noun: "slip" },
  2: { label: "Costly", noun: "costly error" },
  3: { label: "Blunder", noun: "blunder" },
};

/** Process flags that count as a mistake when the Autopsy mistake type was never filled in. */
const FLAG_MISTAKES: Array<{ key: string; label: string; get: (e: JournalEntry) => boolean | null | undefined }> = [
  { key: "stop", label: "Moved stop", get: (e) => e.review?.execution?.movedStop },
  { key: "chased", label: "Chased price", get: (e) => e.review?.execution?.chased },
  { key: "early", label: "Exited early", get: (e) => e.review?.execution?.exitedEarly },
  { key: "fomo", label: "FOMO", get: (e) => e.review?.psychology?.fomo ?? e.review?.postLossGate?.fomo },
  { key: "revenge", label: "Revenge trade", get: (e) => e.review?.psychology?.revenge ?? e.review?.postLossGate?.revenge },
  { key: "fear", label: "Exited out of fear", get: (e) => e.review?.psychology?.fearExit },
  { key: "makeback", label: "Trying to make it back", get: (e) => e.review?.psychology?.makeItBack },
];

const has = (value: unknown): boolean => typeof value === "string" && value.trim().length > 0;

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** The trader's recorded severity, 0 when the Autopsy was skipped or the mistake was "none". */
export function severityOf(entry: JournalEntry): Severity {
  const f = entry.review?.followUp;
  if (f?.mistake === "none") return 0;
  const level = Number(f?.blunderLevel ?? 0);
  return level === 1 || level === 2 || level === 3 ? level : 0;
}

/** The mistake the trader named in the Autopsy ("none" and empty give null). */
export function mistakeOf(entry: JournalEntry): { key: string; label: string } | null {
  const f = entry.review?.followUp;
  const key = f?.mistake?.trim();
  if (!key || key === "none") return null;
  if (key === "other") {
    const other = f?.mistakeOther?.trim();
    return other ? { key: `other:${other.toLowerCase().slice(0, 40)}`, label: other.slice(0, 60) } : { key: "other", label: "Another mistake" };
  }
  const label = MISTAKE_LABELS[key];
  return label ? { key, label } : null;
}

function firstFlagMistake(entry: JournalEntry): { key: string; label: string } | null {
  for (const flag of FLAG_MISTAKES) if (flag.get(entry) === true) return { key: flag.key, label: flag.label };
  return null;
}

/** Average size of a losing trade (positive number), or null when there are fewer than three losers. */
function averageLoss(all: JournalEntry[]): number | null {
  const losses = all.filter((e) => finite(e.pnl) && e.pnl < 0);
  return losses.length >= 3 ? Math.abs(losses.reduce((sum, e) => sum + e.pnl, 0) / losses.length) : null;
}

const KIND_ORDER: Record<TradeKind, number> = { blunder: 3, slip: 2, mixed: 1, clean: 0 };
export const isMistakeTrade = (kind: TradeKind): boolean => KIND_ORDER[kind] >= KIND_ORDER.slip;

/** How the evidence score turns into a share of the round. Blunders get 3–6×, slips 2×, clean trades half. */
export function weightFor(kind: TradeKind, score: number): number {
  if (kind === "blunder") return Math.round((3 + Math.min(3, Math.max(0, score - 4) * 0.5)) * 100) / 100;
  if (kind === "slip") return 2;
  if (kind === "clean") return 0.5;
  return 1;
}

export function assessTrade(entry: JournalEntry, all: JournalEntry[]): TradeFocus {
  const reasons: string[] = [];
  let score = 0;
  const review = entry.review;
  const severity = severityOf(entry);
  const named = mistakeOf(entry);
  const flagged = FLAG_MISTAKES.filter((flag) => flag.get(entry) === true);
  const verdict = review?.outcome?.processVerdict;
  const followedPlan = typeof review?.outcome?.followedPlan === "boolean" ? review.outcome.followedPlan : entry.reflection?.followedSetup;

  // 1. The trader's own rating is the strongest signal.
  if (severity > 0) { score += [0, 2, 4, 6][severity]!; reasons.push(`You rated this a ${SEVERITY_LABELS[severity as 1 | 2 | 3].noun}`); }
  if (named) { score += severity > 0 ? 0.5 : 2; reasons.push(named.label); }

  // 2. Process evidence, whatever the P&L says (a lucky win with bad process is still a blunder).
  if (verdict === "process-failure") { score += 2.5; reasons.push("Process failure"); }
  if (review?.outcome?.badTradeDespiteWin === true) { score += 2.5; reasons.push("A bad trade that happened to win"); }
  if (followedPlan === false) { score += 2; reasons.push("Plan not followed"); }
  if (flagged.length) { score += Math.min(3, flagged.length); if (!named) reasons.push(flagged[0]!.label); }
  const wrote = [review?.followUp?.mistakeNote, review?.followUp?.biggestMistake, entry.reflection?.wentPoorly, review?.plannedVsActual?.deviations, review?.followUp?.conceptMisunderstood].some(has);
  if (wrote) score += 1;

  // 3. What it cost.
  if (finite(entry.pnl) && entry.pnl < 0) {
    score += 1;
    const avg = averageLoss(all);
    if (avg != null && Math.abs(entry.pnl) >= avg * 1.5) { score += 1; reasons.push("A bigger loss than usual"); }
    const worst = all.filter((e) => finite(e.pnl)).reduce<JournalEntry | null>((w, e) => (!w || e.pnl < w.pnl ? e : w), null);
    if (worst && worst.id === entry.id && all.filter((e) => finite(e.pnl)).length >= 3) score += 1;
  }

  // 4. A mistake you keep making matters more than a one-off.
  const key = named?.key ?? firstFlagMistake(entry)?.key ?? null;
  if (key && all.some((other) => other.id !== entry.id && (mistakeOf(other)?.key ?? firstFlagMistake(other)?.key) === key)) { score += 1; reasons.push("A mistake you have repeated"); }

  // 5. Evidence that the trade was done well pulls it down.
  const nothingWrong = severity === 0 && !named && flagged.length === 0 && followedPlan !== false && verdict !== "process-failure";
  if (verdict === "a-plus") score -= 2;
  else if (verdict === "process-success") score -= 1.5;
  if (review?.outcome?.goodTradeDespiteLoss === true) score -= 1.5;
  if (review?.followUp?.mistake === "none") score -= 1;
  if (nothingWrong && followedPlan === true) score -= 1;
  if (nothingWrong && finite(entry.pnl) && entry.pnl > 0) score -= 0.5;

  const kind: TradeKind = score >= 4 ? "blunder" : score >= 2 ? "slip" : score <= -1.5 ? "clean" : "mixed";
  const mistake = named ?? firstFlagMistake(entry);
  return { id: entry.id, kind, score: Math.round(score * 100) / 100, weight: weightFor(kind, score), severity, mistakeKey: mistake?.key ?? null, mistakeLabel: mistake?.label ?? null, reasons };
}

const cache = new WeakMap<readonly JournalEntry[], Map<string, TradeFocus>>();

/** Focus for every trade, cached per journal array so building a round does not redo the work per question. */
export function assessAll(all: JournalEntry[]): Map<string, TradeFocus> {
  const hit = cache.get(all);
  if (hit) return hit;
  const map = new Map(all.map((entry) => [entry.id, assessTrade(entry, all)] as const));
  cache.set(all, map);
  return map;
}

export function focusOf(entry: JournalEntry, all: JournalEntry[]): TradeFocus {
  return assessAll(all).get(entry.id) ?? assessTrade(entry, all);
}

/** Trade id → weight, the shape the session builder takes. */
export function weightsOf(all: JournalEntry[]): Map<string, number> {
  return new Map([...assessAll(all)].map(([id, focus]) => [id, focus.weight] as const));
}

/** Ids of the trades whose questions must be revised on a schedule, not retired after one right answer. */
export function revisitIds(all: JournalEntry[]): Set<string> {
  return new Set([...assessAll(all)].filter(([, focus]) => isMistakeTrade(focus.kind)).map(([id]) => id));
}

/* ------------------------------------------------------------------ */
/*  Spaced revision (Leitner boxes)                                    */
/* ------------------------------------------------------------------ */

/** Days until a question is due again, by box. Box 5 = mastered: it is retired for good. */
export const REVISION_GAPS = [0, 1, 3, 7, 14, 30] as const;
export const MASTERED_BOX = REVISION_GAPS.length - 1;

type Revision = NonNullable<PracticeProgress["revision"]>;
export interface RevisionAnswer { key: string; correct: boolean; tradeId?: string }

export interface RevisionResult {
  revision: Revision;
  /** Keys that reached the last box in this update — the ledger can now retire them. */
  mastered: Set<string>;
}

/**
 * Updates the schedule after a round. Only questions about mistake trades (`revisit`) are scheduled; every
 * other question keeps the old rule (right once → retired). A miss sends a question back to box 0 (due now).
 */
export function updateRevision(progress: PracticeProgress | undefined, answers: RevisionAnswer[], today: string, revisit: ReadonlySet<string>): RevisionResult {
  const revision: Revision = { ...(progress?.revision ?? {}) };
  const mastered = new Set<string>();
  for (const answer of answers) {
    if (!answer.tradeId || !revisit.has(answer.tradeId)) continue;
    const prev = revision[answer.key];
    if (!answer.correct) { revision[answer.key] = { box: 0, due: today, trade: answer.tradeId }; continue; }
    const box = Math.min(MASTERED_BOX, (prev?.box ?? 0) + 1);
    if (box >= MASTERED_BOX) { delete revision[answer.key]; mastered.add(answer.key); continue; }
    revision[answer.key] = { box, due: addDaysKey(today, REVISION_GAPS[box]!), trade: answer.tradeId };
  }
  return { revision, mastered };
}

/** Held back until its date: a scheduled question that is not due yet. */
export const isHeld = (entry: { due: string } | undefined, today: string): boolean => !!entry && entry.due > today;

/** Drops schedule entries whose trade no longer exists (a deleted trade must not keep questions alive). */
export function pruneRevision(revision: Revision | undefined, liveTradeIds: ReadonlySet<string>): Revision | undefined {
  if (!revision) return revision;
  return Object.fromEntries(Object.entries(revision).filter(([, value]) => !value.trade || liveTradeIds.has(value.trade)));
}
