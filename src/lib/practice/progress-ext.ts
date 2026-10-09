import type { PracticeProgress } from "../types.ts";

/**
 * The game-layer fields stored inside `settings.practiceProgress` (the setting is saved as plain JSON, so extra
 * optional keys round-trip). Declared here so `lib/types.ts` does not have to change.
 */
export interface GameFields {
  /** Per-day quest bookkeeping (YYYY-MM-DD), trimmed to ~14 days. Quest progress itself is derived. */
  questLog?: Record<string, {
    rounds: number; passes: number; maxCombo: number; perfect: number;
    /** Best accuracy (0–1) of a round with at least 8 answers today. */
    bestAcc: number; ictCorrect: number; modes: string[]; claimed: string[]; allDone?: boolean;
  }>;
  /** Personal records. Only ever go up. */
  records?: { rounds: number; bestStreak: number; bestCombo: number; bestAccuracy: number; bestRoundXp: number; bestCorrect: number; questDays: number };
  /** Achievement id → date (YYYY-MM-DD) it was first unlocked. */
  achievements?: Record<string, string>;
}

export type GameProgress = PracticeProgress & GameFields;
