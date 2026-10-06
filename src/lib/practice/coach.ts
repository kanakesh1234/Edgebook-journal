/**
 * The coach — decides what the player should train next so they never have to.
 *
 * Pure functions only (no React, no storage). Nothing here is a setting: it reads what the
 * player has already done and recommends a mode, with a short human reason.
 *
 *   1. A mode never played comes first (round out the training before specialising).
 *   2. Once everything has been played, the weakest mode by accuracy comes next.
 *   3. Ties rotate toward the mode with the fewest attempts, then the usual mode order.
 */
import type { PracticeProgress } from "@/lib/types";
import { ARENA_MODES, type ArenaMode } from "./arena.ts";

/** A mode needs this many answers before its accuracy is trusted over "never played". */
const MIN_SAMPLE = 5;

export interface Recommendation {
  mode: ArenaMode;
  /** One short line shown under the recommendation. */
  reason: string;
}

export function modeStats(progress: PracticeProgress | undefined, mode: ArenaMode): { attempts: number; correct: number; accuracy: number | null } {
  const perf = progress?.modePerformance?.[mode];
  const attempts = perf?.attempts ?? 0;
  const correct = perf?.correct ?? 0;
  return { attempts, correct, accuracy: attempts > 0 ? correct / attempts : null };
}

/** Accuracy across the four modes. Keys containing ":" are per-trade copies and are skipped to avoid double counting. */
export function overallAccuracy(progress: PracticeProgress | undefined): number | null {
  let correct = 0;
  let attempts = 0;
  for (const [key, value] of Object.entries(progress?.modePerformance ?? {})) {
    if (key.includes(":")) continue;
    correct += value.correct;
    attempts += value.attempts;
  }
  return attempts > 0 ? correct / attempts : null;
}

/**
 * @param locked  Reason a mode is unavailable (a string), or null/undefined when it can be played.
 * @returns       null when every mode is locked.
 */
export function recommendMode(args: { progress: PracticeProgress | undefined; locked: Partial<Record<ArenaMode, string | null>> }): Recommendation | null {
  const open = ARENA_MODES.filter((mode) => !args.locked[mode]);
  if (open.length === 0) return null;

  const stats = open.map((mode, order) => ({ mode, order, ...modeStats(args.progress, mode) }));

  // Only one mode is available — nothing to compare it with.
  if (stats.length === 1) {
    const only = stats[0]!;
    return { mode: only.mode, reason: only.attempts === 0 ? "New for you — you haven't played this yet." : "Ready whenever you are." };
  }

  const unplayed = stats.filter((s) => s.attempts < MIN_SAMPLE);
  if (unplayed.length > 0 && unplayed.length < stats.length) {
    // Someone has real data and someone doesn't: start with the least-played mode.
    const pick = [...unplayed].sort((a, b) => a.attempts - b.attempts || a.order - b.order)[0]!;
    return { mode: pick.mode, reason: pick.attempts === 0 ? "New for you — you haven't played this yet." : "Still warming up — a few more rounds will tune it to you." };
  }
  if (unplayed.length === stats.length) {
    const pick = [...stats].sort((a, b) => a.attempts - b.attempts || a.order - b.order)[0]!;
    const fresh = stats.every((s) => s.attempts === 0);
    return { mode: pick.mode, reason: fresh ? (pick.mode === "matrix" ? "A mixed run is the best place to start." : "Start here — it's ready whenever you are.") : "Still warming up — a few more rounds will tune it to you." };
  }

  const ranked = [...stats].sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0) || a.attempts - b.attempts || a.order - b.order);
  const weakest = ranked[0]!;
  const runnerUp = ranked[1];
  const pct = Math.round((weakest.accuracy ?? 0) * 100);
  if (runnerUp && Math.abs((runnerUp.accuracy ?? 0) - (weakest.accuracy ?? 0)) < 0.03) {
    const rotate = [weakest, runnerUp].sort((a, b) => a.attempts - b.attempts || a.order - b.order)[0]!;
    return { mode: rotate.mode, reason: "Your modes are evenly matched — this one has had the fewest rounds." };
  }
  return { mode: weakest.mode, reason: `Your weakest mode right now — ${pct}% accuracy.` };
}
