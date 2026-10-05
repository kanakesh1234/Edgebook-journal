import type { JournalEntry, JournalSettings } from "@/lib/types";
import { displayStreak, isUsable, rankOf, weekTrades } from "./engine";
import { arenaLevels } from "./arena";
import { xpLevel } from "./xp";
import { matrixAccuracy, matrixTodayXp } from "@/lib/matrix/overview";
import { matrixStreak } from "@/lib/matrix/attempt";
import { MATRIX_DAILY_XP_GOAL } from "@/lib/matrix/progression";

/**
 * One source of truth for the Home "Practice arcade" card.
 * Reads BOTH the Practise page store (practiceProgress) and the older Matrix
 * store (matrixProgress), so whatever you train anywhere shows up on Home.
 * `entries` must already be scoped to the primary challenge (same as Practise).
 */
export function practiceHomeStats(entries: JournalEntry[], settings: JournalSettings, today: string) {
  const practice = settings.practiceProgress ?? { xp: 0, streak: 0, freezeDays: 1 };
  const matrix = settings.matrixProgress ?? { xp: 0, tokens: 0, tradeStates: {} };

  const daily = practice.dailyStats?.[today];
  const todayXp = (daily?.xp ?? 0) + matrixTodayXp(matrix, today);

  // Overall accuracy: mode-level counters only (keys with ":" are per-trade copies — skip to avoid double counting).
  let correct = 0;
  let total = 0;
  for (const [key, v] of Object.entries(practice.modePerformance ?? {})) {
    if (key.includes(":")) continue;
    correct += v.correct;
    total += v.attempts;
  }
  const legacy = matrixAccuracy(matrix);
  if (legacy != null) {
    const attempts = Object.values(matrix.tradeStates ?? {}).flatMap((s) => s.attempts ?? []);
    const t = attempts.reduce((sum, a) => sum + (a.total ?? 0), 0);
    correct += Math.round(legacy * t);
    total += t;
  }
  const accuracy = total > 0 ? correct / total : null;

  const usable = entries.filter(isUsable);
  const perf = practice.modePerformance ?? {};
  let untested = 0;
  let needsWork = 0;
  for (const t of usable) {
    const p = perf[`matrix:${t.id}`];
    if (!p || !p.attempts) untested++;
    else if (p.correct / p.attempts < 0.7) needsWork++;
  }
  const dueReviews = Object.entries(matrix.tradeStates ?? {}).filter(([id, s]) => entries.some((e) => e.id === id) && !!s.dueOn && s.dueOn <= today).length;
  const week = weekTrades(entries);

  return {
    xp: practice.xp + matrix.xp,
    xpLevel: xpLevel(practice.xp + matrix.xp),
    rank: rankOf(practice.xp),
    levels: arenaLevels(practice),
    dailyGoal: MATRIX_DAILY_XP_GOAL,
    todayXp,
    streak: Math.max(displayStreak(practice, today), matrixStreak(matrix, today)),
    accuracy,
    answered: total,
    tradesTotal: entries.length,
    tradesToday: entries.filter((e) => e.date === today).length,
    usableTrades: usable.length,
    untested,
    needsWork,
    dueReviews,
    weekTradeCount: week.trades.length,
    bossReady: week.trades.length >= 2,
  };
}
