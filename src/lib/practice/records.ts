/** Personal records — only ever go up. Pure functions (no React, no storage). */
import type { GameProgress as PracticeProgress } from "./progress-ext.ts";

export type Records = NonNullable<PracticeProgress["records"]>;
export type RecordKey = Exclude<keyof Records, "rounds" | "questDays">;
export const EMPTY_RECORDS: Records = { rounds: 0, bestStreak: 0, bestCombo: 0, bestAccuracy: 0, bestRoundXp: 0, bestCorrect: 0, questDays: 0 };

export const RECORD_LABELS: Record<RecordKey, string> = {
  bestStreak: "Longest streak", bestCombo: "Best flow", bestAccuracy: "Best accuracy", bestRoundXp: "Most XP in a round", bestCorrect: "Most correct in a round",
};

export const recordsOf = (progress: PracticeProgress | undefined): Records => ({ ...EMPTY_RECORDS, ...(progress?.records ?? {}), bestStreak: Math.max(progress?.records?.bestStreak ?? 0, progress?.streak ?? 0) });

export interface RoundRecordInput { correct: number; total: number; xp: number; maxCombo: number; streak: number }

/** Records after one round, plus which ones were beaten. A first-ever value counts as a record only once there is something to beat. */
export function updateRecords(progress: PracticeProgress | undefined, round: RoundRecordInput): { records: Records; broken: RecordKey[] } {
  const prev = recordsOf(progress);
  const accuracy = round.total >= 8 ? round.correct / round.total : 0;
  const next: Records = {
    ...prev,
    rounds: prev.rounds + 1,
    bestStreak: Math.max(prev.bestStreak, round.streak),
    bestCombo: Math.max(prev.bestCombo, round.maxCombo),
    bestAccuracy: Math.max(prev.bestAccuracy, accuracy),
    bestRoundXp: Math.max(prev.bestRoundXp, round.xp),
    bestCorrect: Math.max(prev.bestCorrect, round.correct),
  };
  const keys = Object.keys(RECORD_LABELS) as RecordKey[];
  // Only celebrate a record once the player has played before; round one just sets the baseline.
  const broken = prev.rounds === 0 ? [] : keys.filter((k) => next[k] > prev[k] && next[k] > 0);
  return { records: next, broken };
}
