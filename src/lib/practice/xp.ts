/**
 * Normalized XP.
 *
 * Total XP only ever goes up, so showing it raw makes the number meaningless over
 * time. Instead XP is shown as a player level with progress toward the next one:
 * early levels are quick, and the cost per level is capped (so it never balloons).
 * The stored `practiceProgress.xp` is untouched — this is display-only.
 */
const BASE = 200;
const STEP = 50;
const CAP = 500;

const cost = (level: number) => Math.min(CAP, BASE + STEP * (level - 1));

export interface XpLevel { level: number; into: number; need: number; pct: number }

export function xpLevel(totalXp: number): XpLevel {
  let left = Math.max(0, Math.floor(totalXp));
  let level = 1;
  while (left >= cost(level)) { left -= cost(level); level++; }
  const need = cost(level);
  return { level, into: left, need, pct: Math.round((left / need) * 100) };
}

/**
 * XP for ONE correct answer.
 *
 * A question's base value is 10–12 × its level (up to 50 for chart drills), so paying it out
 * raw made XP grow linearly with level while the cost of a player level is capped — levelling
 * got easier the further you went. Square-root pacing keeps harder questions worth more, but
 * only gently:
 *
 *   base  10 → 3     base  24 → 5     base  50 → 7     base 100 → 10     base 144 → 12
 *
 * A level-1 round (about six correct answers) is worth ~18 XP, so the first player level takes
 * around twelve rounds; later levels still take five or six.
 */
export function earnedXp(base: number): number {
  return Math.max(1, Math.round(Math.sqrt(Math.max(0, base))));
}

/** Daily XP target on Home — about two or three rounds at the new pace. */
export const DAILY_XP_GOAL = 40;
