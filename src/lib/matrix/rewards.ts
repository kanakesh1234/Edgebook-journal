import type { MatrixAttemptRecord, MatrixProgress } from "../types.ts";
import { matrixStreak } from "./attempt.ts";
import { attemptRewards } from "./progression.ts";

export interface MatrixRewardCatalogItem {
  id: string;
  title: string;
  tokenCost: number;
  detail: string;
}

/** Catalogue only. Redemption remains unavailable until fulfilment exists. */
export const MATRIX_REWARD_CATALOGUE: readonly MatrixRewardCatalogItem[] = [
  { id: "demo-credit-5", title: "$5 Demo Credit", tokenCost: 50, detail: "A future broker-demo reward." },
  { id: "demo-credit-10", title: "$10 Demo Credit", tokenCost: 90, detail: "A future broker-demo reward." },
  { id: "course-discount-25", title: "25% Off Course", tokenCost: 120, detail: "A future course reward." },
];

export interface MatrixRewardHistoryItem {
  id: string;
  tradeId: string;
  completedOn: string;
  correct: number;
  total: number;
  xp: number;
  tokens: number;
}

/**
 * Reconstructs only rewards whose answer totals are stored. Older, summary-only
 * attempts intentionally do not appear rather than fabricating a reward.
 */
export function matrixRewardHistory(progress: MatrixProgress | undefined): MatrixRewardHistoryItem[] {
  const history: MatrixRewardHistoryItem[] = [];
  for (const [tradeId, state] of Object.entries(progress?.tradeStates ?? {})) {
    for (const [index, attempt] of (state.attempts ?? []).entries()) {
      if (attempt.correct == null || attempt.total == null) continue;
      const rewards = attemptRewards(attempt.correct, attempt.total, index, attempt.mode ?? "classic");
      history.push({
        id: `${tradeId}:${index}:${attempt.completedOn}`,
        tradeId,
        completedOn: attempt.completedOn,
        correct: attempt.correct,
        total: attempt.total,
        ...rewards,
      });
    }
  }
  return history.sort((a, b) => b.completedOn.localeCompare(a.completedOn) || b.id.localeCompare(a.id));
}

export interface MatrixVaultBadge {
  id: "first-win" | "three-day-streak" | "hundred-correct" | "weekend-boss";
  title: string;
  detail: string;
  earned: boolean;
}

export function matrixVaultBadges(progress: MatrixProgress | undefined): MatrixVaultBadge[] {
  const history = matrixRewardHistory(progress);
  const correct = history.reduce((sum, item) => sum + item.correct, 0);
  return [
    { id: "first-win", title: "First Win", detail: "Complete one Matrix test", earned: history.length >= 1 },
    { id: "three-day-streak", title: "3-Day Streak", detail: "Complete Matrix tests on 3 consecutive days", earned: matrixStreak(progress ?? { xp: 0, tokens: 0 }) >= 3 },
    { id: "hundred-correct", title: "100 Correct", detail: `${correct} / 100 recorded correct answers`, earned: correct >= 100 },
    // Weekend Boss records do not exist until Stage 9, so it must remain locked.
    { id: "weekend-boss", title: "Weekend Boss", detail: "Available with Weekend Boss mode", earned: false },
  ];
}

export function verifiedAttempt(attempt: MatrixAttemptRecord): boolean {
  return attempt.correct != null && attempt.total != null;
}
