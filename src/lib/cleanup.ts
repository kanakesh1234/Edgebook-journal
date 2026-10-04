import type { JournalSettings, TradePlan } from "@/lib/types";

/**
 * Remove every trace of the given trades from settings + plans:
 *  - Matrix per-trade state (attempts, stars, due dates, bookmarks, predictions)
 *  - Practise per-trade accuracy (`matrix:<id>` keys)
 * Plans that were executed as one of these trades go back to "planned".
 * Pure function — the store decides when to persist.
 */
export function purgeTradeTraces(
  ids: ReadonlySet<string>,
  settings: JournalSettings,
  plans: TradePlan[],
): { settings: JournalSettings; plans: TradePlan[] } {
  const next: JournalSettings = { ...settings };

  const matrix = settings.matrixProgress;
  if (matrix?.tradeStates) {
    const tradeStates = Object.fromEntries(Object.entries(matrix.tradeStates).filter(([id]) => !ids.has(id)));
    next.matrixProgress = { ...matrix, tradeStates };
  }

  const practice = settings.practiceProgress;
  if (practice?.modePerformance) {
    const modePerformance = Object.fromEntries(
      Object.entries(practice.modePerformance).filter(([key]) => !(key.startsWith("matrix:") && ids.has(key.slice(7)))),
    );
    next.practiceProgress = { ...practice, modePerformance };
  }

  const nextPlans = plans.map((p) =>
    p.linkedTradeId && ids.has(p.linkedTradeId) ? { ...p, linkedTradeId: undefined, status: "planned" as const } : p,
  );
  return { settings: next, plans: nextPlans };
}
