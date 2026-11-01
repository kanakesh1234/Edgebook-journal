/**
 * CONTINUOUS LEARNING CONTEXT (`knowledge.ts`)
 *
 * Builds a live-reconciled, persistent trader knowledge snapshot that combines:
 *  - Actual database records (entries, pre-trade plans, no-trade days, configured rules, playbook setups)
 *  - Structured persistent memory (semantic facts, episodic session lessons, commitments, saved insights)
 *  - Longitudinal progression (recent vs earlier behavior, repeated mistakes, emotional triggers, strengths)
 *
 * CRITICAL INVARIANT:
 *  Fresh database records (newest trades, updated rules, latest journal entries) ALWAYS supersede
 *  older cached summaries so stale memory can never override the trader's current reality.
 */

import type { Challenge, JournalEntry, JournalSettings, NoTradeLog, TradePlan } from "@/lib/types";
import { defaultSettings } from "@/lib/types";
import { computeStats } from "@/lib/stats";
import { evaluateRules, adherenceSummary } from "@/lib/rules";
import { mistakeIndex } from "@/lib/mistakes";
import { newestFirst, setupBreakdown, aPlusSummary, verdictOf } from "./setup-analytics";
import type { UserSemanticParams } from "./extract";
import type { MemoryStore } from "./memory";

export interface TraderKnowledgeSnapshot {
  traderName: string;
  today: string;
  marketSummary: string;
  dataFreshness: {
    totalTrades: number;
    latestTradeDate: string | null;
    latestTradeId: string | null;
    latestPlanDate: string | null;
    activeRulesCount: number;
    playbookSetupsCount: number;
  };
  accountOverview: {
    challengeName: string | null;
    startingEquity: number;
    currentEquity: number;
    targetEquity: number;
    totalPnl: number;
    tradingDays: number;
    winRateDayPct: number;
    winRateTradePct: number | null;
    avgDayPnl: number;
    drawdownUsed: number;
    drawdownLimit: number;
    drawdownRoom: number;
    drawdownUsedPct: number;
    todayLossLimit: number | null;
  };
  strengthsAndWeaknesses: {
    strongestSetup: { name: string; netPnl: number; trades: number; winRatePct: number | null } | null;
    weakestSetup: { name: string; netPnl: number; trades: number; winRatePct: number | null } | null;
    bestAPlusSetup: { name: string; netPnl: number; trades: number; winRatePct: number | null } | null;
    aPlusCount: number;
    repeatedMistakes: { label: string; count: number; costDollars: number }[];
    cleanPlanDayRatePct: number | null;
    recentRuleViolationsCount: number;
  };
  emotionalAndHabitProfile: {
    bestEmotionalState: { state: string; winRatePct: number | null; netPnl: number; trades: number } | null;
    riskEmotionalState: { state: string; winRatePct: number | null; netPnl: number; trades: number } | null;
    fomoCount: number;
    revengeCount: number;
  };
  progressOverTime: {
    trend: "improving" | "steady" | "slipping" | "insufficient_sample";
    recent5WinRatePct: number | null;
    recent5NetPnl: number;
    prior5NetPnl: number | null;
    recentPlanAdherencePct: number | null;
  };
  configuredPreferences: {
    riskDollarsPerTrade: number | null;
    riskPctPerTrade: number | null;
    stopPoints: number | null;
    dailyLossLimit: number | null;
    instruments: string[];
    accountType: string | null;
    sessionTimes: string | null;
  };
  persistentMemoryHighlights: string[];
}

export function buildContinuousKnowledgeSnapshot(opts: {
  traderName: string;
  today: string;
  marketSummary: string;
  entries: readonly JournalEntry[];
  plans?: readonly TradePlan[];
  dayLogs?: readonly NoTradeLog[];
  settings?: JournalSettings;
  primaryChallenge?: Pick<
    Challenge,
    "id" | "name" | "startingBalance" | "targetBalance" | "maxDrawdown" | "drawdownMode" | "trailingBasis" | "drawdownFloor"
  > | null;
  semanticParams?: Partial<UserSemanticParams>;
  memoryStore?: MemoryStore | null;
}): TraderKnowledgeSnapshot {
  const sorted = newestFirst(opts.entries);
  const settings = opts.settings ?? defaultSettings();
  const sem = opts.semanticParams ?? {};

  const stats = computeStats(sorted, settings);
  const wins = sorted.filter((e) => e.pnl > 0).length;
  const losses = sorted.filter((e) => e.pnl < 0).length;
  const winRateTradePct = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : null;

  const ddLimit = settings.maxDrawdown || 1000;
  const ddUsed = Math.round(stats.drawdown);
  const ddRoom = Math.round(stats.drawdownCushion ?? Math.max(0, ddLimit - stats.drawdown));

  const setups = setupBreakdown(sorted).rows.filter((r) => r.setup !== "(no setup recorded)");
  const strongestSetup = setups[0]
    ? { name: setups[0].setup, netPnl: setups[0].netPnl, trades: setups[0].trades, winRatePct: setups[0].winRatePct }
    : null;
  const weakestCandidate = setups.length > 1 ? setups[setups.length - 1] : null;
  const weakestSetup =
    weakestCandidate && weakestCandidate.netPnl < 0
      ? {
          name: weakestCandidate.setup,
          netPnl: weakestCandidate.netPnl,
          trades: weakestCandidate.trades,
          winRatePct: weakestCandidate.winRatePct,
        }
      : null;

  const aPlus = aPlusSummary(sorted);
  const bestAPlusSetup = aPlus.best
    ? { name: aPlus.best.setup, netPnl: aPlus.best.netPnl, trades: aPlus.best.trades, winRatePct: aPlus.best.winRatePct }
    : null;

  const mistakes = mistakeIndex(sorted as JournalEntry[])
    .slice(0, 4)
    .map((m) => ({
      label: m.label,
      count: m.count,
      costDollars: Math.round(m.cost * 100) / 100,
    }));

  const violations = evaluateRules(sorted as JournalEntry[], settings);
  const adherence = adherenceSummary(sorted as JournalEntry[], settings);

  // Emotional profile from live entries
  const byEmo = new Map<string, { n: number; wins: number; losses: number; pnl: number }>();
  let fomoCount = 0;
  let revengeCount = 0;
  for (const e of sorted) {
    const p = e.review?.psychology;
    if (p?.fomo) fomoCount++;
    if (p?.revenge) revengeCount++;
    const emo = (p?.emotionBefore || p?.emotionAfter || (p?.fomo ? "FOMO" : p?.revenge ? "REVENGE" : "")).trim().toUpperCase();
    if (!emo) continue;
    const cur = byEmo.get(emo) ?? { n: 0, wins: 0, losses: 0, pnl: 0 };
    cur.n++;
    if (e.pnl > 0) cur.wins++;
    else if (e.pnl < 0) cur.losses++;
    cur.pnl += e.pnl;
    byEmo.set(emo, cur);
  }
  const emoRows = [...byEmo.entries()]
    .map(([state, v]) => ({
      state,
      trades: v.n,
      winRatePct: v.wins + v.losses > 0 ? Math.round((v.wins / (v.wins + v.losses)) * 100) : null,
      netPnl: Math.round(v.pnl * 100) / 100,
    }))
    .sort((a, b) => b.netPnl - a.netPnl);

  // Progress over time (newest 5 vs prior 5)
  const recent5 = sorted.slice(0, 5);
  const prior5 = sorted.slice(5, 10);
  const recent5Wins = recent5.filter((e) => e.pnl > 0).length;
  const recent5Losses = recent5.filter((e) => e.pnl < 0).length;
  const recent5NetPnl = Math.round(recent5.reduce((s, e) => s + e.pnl, 0) * 100) / 100;
  const prior5NetPnl = prior5.length > 0 ? Math.round(prior5.reduce((s, e) => s + e.pnl, 0) * 100) / 100 : null;
  const recentWithPlan = recent5.filter((e) => e.review?.outcome?.followedPlan != null);
  const recentPlanAdherencePct =
    recentWithPlan.length > 0
      ? Math.round((recentWithPlan.filter((e) => e.review?.outcome?.followedPlan === true).length / recentWithPlan.length) * 100)
      : null;

  let trend: TraderKnowledgeSnapshot["progressOverTime"]["trend"] = "insufficient_sample";
  if (sorted.length >= 6 && prior5NetPnl != null) {
    if (recent5NetPnl > prior5NetPnl + 25) trend = "improving";
    else if (recent5NetPnl < prior5NetPnl - 25) trend = "slipping";
    else trend = "steady";
  }

  // Extract active, non-superseded memory highlights, ensuring live DB config wins on any conflict
  const memoryHighlights: string[] = [];
  if (opts.memoryStore?.items) {
    const activeItems = Object.values(opts.memoryStore.items)
      .filter((item) => item.status !== "superseded" && item.status !== "retired")
      .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || b.lastSeen - a.lastSeen)
      .slice(0, 6);
    for (const item of activeItems) {
      memoryHighlights.push(item.text);
    }
  }

  return {
    traderName: opts.traderName,
    today: opts.today,
    marketSummary: opts.marketSummary,
    dataFreshness: {
      totalTrades: sorted.length,
      latestTradeDate: sorted[0]?.date ?? null,
      latestTradeId: sorted[0]?.id ?? null,
      latestPlanDate: opts.plans && opts.plans.length > 0 ? opts.plans[opts.plans.length - 1]!.date : null,
      activeRulesCount: (settings.rules?.rules ?? []).filter((r) => r.enabled).length,
      playbookSetupsCount: (settings.playbook ?? []).filter((p) => p.active !== false).length,
    },
    accountOverview: {
      challengeName: opts.primaryChallenge?.name ?? null,
      startingEquity: settings.startingEquity,
      currentEquity: Math.round(stats.currentEquity),
      targetEquity: settings.targetEquity,
      totalPnl: Math.round(stats.totalPnl),
      tradingDays: stats.tradingDays,
      winRateDayPct: Math.round(stats.winRate * 100),
      winRateTradePct,
      avgDayPnl: Math.round(stats.avgDayPnl),
      drawdownUsed: ddUsed,
      drawdownLimit: Math.round(ddLimit),
      drawdownRoom: ddRoom,
      drawdownUsedPct: Math.round((stats.drawdownBudgetUsed ?? 0) * 100),
      todayLossLimit: settings.dayLimits?.[opts.today] ?? sem.dailyLossLimit ?? null,
    },
    strengthsAndWeaknesses: {
      strongestSetup,
      weakestSetup,
      bestAPlusSetup,
      aPlusCount: aPlus.count,
      repeatedMistakes: mistakes,
      cleanPlanDayRatePct: adherence.cleanDayRate != null ? Math.round(adherence.cleanDayRate * 100) : null,
      recentRuleViolationsCount: violations.length,
    },
    emotionalAndHabitProfile: {
      bestEmotionalState: emoRows[0] ?? null,
      riskEmotionalState: emoRows.length > 1 && emoRows[emoRows.length - 1]!.netPnl < 0 ? emoRows[emoRows.length - 1]! : null,
      fomoCount,
      revengeCount,
    },
    progressOverTime: {
      trend,
      recent5WinRatePct: recent5Wins + recent5Losses > 0 ? Math.round((recent5Wins / (recent5Wins + recent5Losses)) * 100) : null,
      recent5NetPnl,
      prior5NetPnl,
      recentPlanAdherencePct,
    },
    configuredPreferences: {
      riskDollarsPerTrade: sem.riskDollars ?? null,
      riskPctPerTrade: sem.riskPct ?? null,
      stopPoints: sem.stopPoints ?? null,
      dailyLossLimit: settings.dayLimits?.[opts.today] ?? sem.dailyLossLimit ?? null,
      instruments: sem.instruments ?? [],
      accountType: sem.accountType ?? null,
      sessionTimes: sem.sessionTimes ?? null,
    },
    persistentMemoryHighlights: memoryHighlights,
  };
}
