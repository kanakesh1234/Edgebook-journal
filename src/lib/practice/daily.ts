import type { PracticeProgress } from "@/lib/types";

type Daily = NonNullable<PracticeProgress["dailyStats"]>;

/** Add one finished session to today's totals and keep only the last ~45 days. */
export function addDailyStats(progress: PracticeProgress, date: string, add: { xp: number; correct: number; total: number }): Daily {
  const prev = progress.dailyStats ?? {};
  const cur = prev[date] ?? { xp: 0, correct: 0, total: 0 };
  const merged: Daily = { ...prev, [date]: { xp: cur.xp + add.xp, correct: cur.correct + add.correct, total: cur.total + add.total } };
  const keys = Object.keys(merged).sort().slice(-45);
  return Object.fromEntries(keys.map((k) => [k, merged[k]!]));
}
