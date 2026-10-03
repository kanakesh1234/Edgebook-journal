import type { JournalEntry } from "@/lib/types";
import type { MatrixGameMode } from "./game-modes.ts";

export const MATRIX_REWARDS = {
  xpPerCorrect: 10,
  completionXp: 20,
  firstAttemptXp: 10,
  tokensPerCorrect: 1,
  completionTokens: 2,
  firstAttemptTokens: 1,
} as const;

export const MATRIX_DAILY_XP_GOAL = 100;

export type TradeResult = "win" | "loss" | "breakeven" | "unavailable";
export type RResult = { r: number; reason?: never } | { r: null; reason: "missing-entry" | "missing-stop" | "missing-exit" | "missing-direction" | "zero-risk" };

/** Computes realized R from recorded prices only. No P&L or image inference. */
export function realizedR(entry: Pick<JournalEntry, "entryPrice" | "stopLoss" | "exitPrice" | "direction">): RResult {
  if (entry.entryPrice == null) return { r: null, reason: "missing-entry" };
  if (entry.stopLoss == null) return { r: null, reason: "missing-stop" };
  if (entry.exitPrice == null) return { r: null, reason: "missing-exit" };
  if (entry.direction == null) return { r: null, reason: "missing-direction" };
  const risk = Math.abs(entry.entryPrice - entry.stopLoss);
  if (risk === 0) return { r: null, reason: "zero-risk" };
  const move = entry.direction === "long" ? entry.exitPrice - entry.entryPrice : entry.entryPrice - entry.exitPrice;
  return { r: move / risk };
}

export function tradeResult(r: number | null, tolerance = 0.1): TradeResult {
  if (r == null) return "unavailable";
  if (Math.abs(r) <= tolerance) return "breakeven";
  return r > 0 ? "win" : "loss";
}

export interface MatrixAttempt {
  accuracy: number; // 0..1
  completedOn: string; // local YYYY-MM-DD
}

/** Stars only move up. A completed test always earns the first star. */
export function nextStars(previous: number, attempts: MatrixAttempt[]): 0 | 1 | 2 | 3 {
  if (attempts.length === 0) return Math.max(0, Math.min(3, previous)) as 0 | 1 | 2 | 3;
  const atLeastOne = Math.max(1, previous);
  const hasSeventy = attempts.some((attempt) => attempt.accuracy >= .7);
  const highAttempts = attempts.filter((attempt) => attempt.accuracy >= .9).length;
  return Math.max(atLeastOne, hasSeventy ? 2 : 0, highAttempts >= 2 ? 3 : 0) as 0 | 1 | 2 | 3;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

/** A low score repeats soon; each completed revisit doubles the next interval. */
export function nextDueDate(completedOn: string, accuracy: number, completedAttemptsBeforeThis = 0): string {
  const base = accuracy < .7 ? 1 : accuracy < .9 ? 3 : 7;
  return addDays(completedOn, base * 2 ** Math.max(0, completedAttemptsBeforeThis));
}

export interface MatrixStudyState {
  tradeId: string;
  attempts: MatrixAttempt[];
  stars: number;
  dueOn?: string;
}

export interface MatrixTradeCandidate {
  id: string;
  date: string;
}

/** Picks a real trade to study, prioritizing due work and preserving oldest-first ties. */
export function nextUp(trades: MatrixTradeCandidate[], states: Record<string, MatrixStudyState | undefined>, today: string): MatrixTradeCandidate | null {
  const priority = (trade: MatrixTradeCandidate) => {
    const state = states[trade.id];
    if (state?.dueOn && state.dueOn <= today) return 0;
    if (state && state.attempts.length > 0 && (state.stars < 2 || state.attempts.at(-1)!.accuracy < .7)) return 1;
    if (!state || state.attempts.length === 0) return 2;
    return 3;
  };
  return [...trades].sort((a, b) => priority(a) - priority(b) || a.date.localeCompare(b.date) || a.id.localeCompare(b.id))[0] ?? null;
}

export function attemptRewards(correct: number, total: number, completedAttemptsBeforeThis: number, mode: MatrixGameMode = "classic") {
  const safeCorrect = Math.max(0, Math.min(total, correct));
  const first = completedAttemptsBeforeThis === 0;
  return {
    xp: Math.round((safeCorrect * MATRIX_REWARDS.xpPerCorrect + MATRIX_REWARDS.completionXp + (first ? MATRIX_REWARDS.firstAttemptXp : 0)) * (mode === "time-attack" ? 1.5 : 1)),
    tokens: safeCorrect * MATRIX_REWARDS.tokensPerCorrect + MATRIX_REWARDS.completionTokens + (first ? MATRIX_REWARDS.firstAttemptTokens : 0),
  };
}

/** Current local-day streak: a day qualifies when at least one Matrix attempt completed. */
export function completionStreak(completedOn: string[], today: string): number {
  const days = new Set(completedOn);
  let cursor = today;
  let streak = 0;
  while (days.has(cursor)) { streak++; cursor = addDays(cursor, -1); }
  return streak;
}
