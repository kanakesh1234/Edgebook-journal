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
