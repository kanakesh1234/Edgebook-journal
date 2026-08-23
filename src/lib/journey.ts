import { clamp01 } from "./stats";
import type { JournalSettings, JournalStats } from "./types";

/* ------------------------------------------------------------------ */
/*  Journey derivation — the live roadmap layer                        */
/*  Pure: milestones, progress and pace computed from actual           */
/*  performance. No persistence needed; recalculates when the plan     */
/*  or the journal changes.                                            */
/* ------------------------------------------------------------------ */

export interface JourneyMilestone {
  /** Position along the start → target range, 0..1 */
  fraction: number;
  equity: number;
  passed: boolean;
}

export interface JourneyState {
  /** Clamped 0..1 progress from starting equity to target. */
  progress: number;
  milestones: JourneyMilestone[];
  next: JourneyMilestone | null;
  reachedTarget: boolean;
  /** Equity has dipped below the starting line. */
  behindStart: boolean;
  /** Trading days to target at the current average pace, null when unknown. */
  paceDays: number | null;
}

export function journeyState(settings: JournalSettings, stats: JournalStats): JourneyState {
  const range = settings.targetEquity - settings.startingEquity;
  const progress = range !== 0 ? clamp01(stats.targetProgress) : 0;

  const milestones: JourneyMilestone[] = [0.25, 0.5, 0.75].map((f) => ({
    fraction: f,
    equity: settings.startingEquity + f * range,
    passed: progress >= f - 1e-6,
  }));

  const next = milestones.find((m) => !m.passed) ?? null;
  const reachedTarget = range !== 0 && stats.remainingToTarget <= 0 && stats.tradeCount > 0;
  const behindStart = stats.currentEquity < settings.startingEquity && stats.tradeCount > 0;
  const paceDays =
    stats.avgDayPnl > 0 && stats.remainingToTarget > 0
      ? Math.ceil(stats.remainingToTarget / stats.avgDayPnl)
      : null;

  return { progress, milestones, next, reachedTarget, behindStart, paceDays };
}
