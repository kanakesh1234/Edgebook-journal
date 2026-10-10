/**
 * Arena ladder — automatic, open-ended difficulty for the four practice modes.
 *
 * Every round is 60 seconds. Each mode has its own level (1, 2, 3 … no ceiling).
 * To advance you must clear a GATE inside one round: enough correct answers at a
 * minimum accuracy. The gate rises with the level, so the ladder keeps getting
 * steeper after the question tiers themselves top out.
 *
 *   pass the gate            → level + 1
 *   miss it once             → stay
 *   miss it twice in a row   → level − 1
 *   leave the round early    → nothing changes
 *   run out of questions     → nothing changes (that is the journal's limit, not the player's)
 *
 * Pure functions only (no React, no storage) so the rules are easy to test.
 */
import type { PracticeProgress } from "@/lib/types";
import { targetDifficulty } from "./curriculum.ts";

export { targetDifficulty };

export type ArenaMode = "matrix" | "time-machine" | "math-duel" | "boss" | "ict";
export const ARENA_MODES: ArenaMode[] = ["matrix", "time-machine", "math-duel", "boss", "ict"];
export const ROUND_SECONDS = 60;
/** ICT Lab is revision: you read your own pictures and notes, so the clock is more generous. */
export const roundSecondsFor = (mode: ArenaMode) => (mode === "ict" ? 150 : ROUND_SECONDS);

/** Math Duel questions are quicker to answer, so its gate is higher. */
const PACE: Record<ArenaMode, number> = { matrix: 1, "time-machine": 1, "math-duel": 1.5, boss: 1, ict: 1 };
/**
 * The most correct answers a gate can ask for in one round. It has to be reachable: a chart question takes
 * a human 5–7 seconds to read and answer, so 14 in 60 seconds (the old ceiling) could never be cleared and
 * the player was stuck for good. Past the cap the ladder keeps climbing through ACCURACY instead.
 */
const CAP: Record<ArenaMode, number> = { matrix: 11, "time-machine": 9, "math-duel": 30, boss: 9, ict: 14 };

export interface Gate { correct: number; accuracy: number }

export function levelOf(progress: PracticeProgress | undefined, mode: ArenaMode): number {
  const stored = progress?.arena?.levels?.[mode];
  return typeof stored === "number" && Number.isFinite(stored) && stored >= 1 ? Math.floor(stored) : 1;
}

/** Best correct count in a single round at the current level — progress toward the gate. */
export function levelBestOf(progress: PracticeProgress | undefined, mode: ArenaMode): number {
  const stored = progress?.arena?.levelBest?.[mode];
  return typeof stored === "number" && stored > 0 ? Math.floor(stored) : 0;
}

export function failsOf(progress: PracticeProgress | undefined, mode: ArenaMode): number {
  const stored = progress?.arena?.fails?.[mode];
  return typeof stored === "number" && stored > 0 ? Math.floor(stored) : 0;
}

/** What it takes to clear a level in one round. */
export function gateFor(mode: ArenaMode, level: number): Gate {
  const lv = Math.max(1, Math.floor(level));
  const correct = Math.min(CAP[mode], Math.round((3 + lv * 0.7) * PACE[mode]));
  const accuracy = Math.min(0.85, Math.round((0.7 + lv * 0.008) * 1000) / 1000);
  return { correct, accuracy };
}

/** The whole-number tier (1–4) used by the question builders and the AI. */
export const tierOf = (level: number): 1 | 2 | 3 | 4 => Math.min(4, Math.max(1, Math.round(targetDifficulty(level)))) as 1 | 2 | 3 | 4;

/** Live in-round drift: three right in a row nudges the target up, two wrong nudges it down. */
export function nudge(target: number, streak: { right: number; wrong: number }): { target: number; streak: { right: number; wrong: number } } {
  if (streak.right >= 3) return { target: Math.min(4, target + 0.5), streak: { right: 0, wrong: 0 } };
  if (streak.wrong >= 2) return { target: Math.max(1, target - 0.5), streak: { right: 0, wrong: 0 } };
  return { target, streak };
}

export type Outcome = "up" | "hold" | "down" | "early";

export interface RoundOutcome {
  outcome: Outcome;
  passed: boolean;
  level: number;
  nextLevel: number;
  nextFails: number;
  gate: Gate;
  accuracy: number;
  /** Why an "early" round counted for nothing: the player left, or the journal had no more questions to give. */
  reason?: "left" | "ran-out";
}

/** Level change for one finished round. */
export function evaluateRound(args: { mode: ArenaMode; level: number; fails: number; correct: number; answered: number; completed: boolean; /** The question supply ran dry before the clock did. */ exhausted?: boolean }): RoundOutcome {
  const { mode, level, fails, correct, answered, completed, exhausted } = args;
  const gate = gateFor(mode, level);
  const accuracy = answered > 0 ? correct / answered : 0;
  const base = { level, gate, accuracy };
  // Walking away from a round (or barely starting one) never costs a level.
  if (!completed || answered < 3) return { ...base, outcome: "early", passed: false, nextLevel: level, nextFails: fails, reason: "left" };
  const passed = correct >= gate.correct && accuracy >= gate.accuracy;
  if (passed) return { ...base, outcome: "up", passed: true, nextLevel: level + 1, nextFails: 0 };
  // Running out of questions is not a failed round: a small or well-revised journal must never push the player down.
  if (exhausted) return { ...base, outcome: "early", passed: false, nextLevel: level, nextFails: fails, reason: "ran-out" };
  if (fails + 1 >= 2 && level > 1) return { ...base, outcome: "down", passed: false, nextLevel: level - 1, nextFails: 0 };
  return { ...base, outcome: "hold", passed: false, nextLevel: level, nextFails: level > 1 ? fails + 1 : 0 };
}

/** The `arena` block after a round. Never mutates the input. */
export function applyOutcome(progress: PracticeProgress | undefined, mode: ArenaMode, result: RoundOutcome, correct: number): NonNullable<PracticeProgress["arena"]> {
  const arena = progress?.arena ?? {};
  const best = Math.max(arena.best?.[mode] ?? 0, correct);
  // The meter measures the CURRENT level only: a new level starts from zero, the same level keeps its best.
  const levelBest = result.nextLevel === result.level ? Math.max(arena.levelBest?.[mode] ?? 0, correct) : 0;
  return {
    levels: { ...(arena.levels ?? {}), [mode]: result.nextLevel },
    fails: { ...(arena.fails ?? {}), [mode]: result.nextFails },
    best: { ...(arena.best ?? {}), [mode]: best },
    levelBest: { ...(arena.levelBest ?? {}), [mode]: levelBest },
  };
}

export function arenaLevels(progress: PracticeProgress | undefined): Record<ArenaMode, number> {
  return { matrix: levelOf(progress, "matrix"), "time-machine": levelOf(progress, "time-machine"), "math-duel": levelOf(progress, "math-duel"), boss: levelOf(progress, "boss"), ict: levelOf(progress, "ict") };
}
