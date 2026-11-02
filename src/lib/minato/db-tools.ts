/**
 * MINATO INTELLIGENT DATABASE RETRIEVAL TOOLS (`db-tools.ts`)
 *
 * Gives the LLM controlled, schema-validated, read-only access to the authenticated trader's
 * complete EdgeBook data on demand — without dumping the entire database into every prompt.
 *
 * Tools provided:
 *  1. `get_trader_profile`       — Trader identity, active challenge, playbook setups, rules, and risk preferences.
 *  2. `get_trading_history`      — Filtered & sorted trade records (supports date ranges, setup, instrument, direction, outcome, verdict, pagination; fast on 5,000+ trades).
 *  3. `get_trade_details`        — Full record for specific trade(s) by ID, date, or extreme (`latest`, `best_pnl`, `worst_pnl`, `longest_hold`, `shortest_hold`).
 *  4. `get_journal_entries`      — Pre-trade plans, written trade notes, post-trade reflections, and no-trade day logs.
 *  5. `get_performance_metrics`  — Win rate, P&L, expectancy, profit factor, average R, setup breakdown, A+ summary, time-of-day & weekday edge.
 *  6. `get_rule_violations`      — Configured rule violations, plan adherence, checklist skips, premature entries, and daily loss limit breaches.
 *  7. `get_psychology_patterns`  — Emotional state performance, FOMO/revenge/fear triggers, mistake category dollar costs, and post-loss gates.
 *  8. `get_account_statistics`   — Equity curve summary, starting/current/peak/target balance, drawdown used vs room left, and streak records.
 *  9. `compare_trading_periods`  — Dynamic comparison between two date ranges or trade windows (e.g. recent vs prior, this month vs last month, first half vs second half) across P&L, win rate, psychology, and mistakes.
 * 10. `search_trader_memory`     — Hybrid search across semantic, episodic, and working memory + saved insights + trader vocabulary.
 * 11. `calculate_trading_math`   — Deterministic math engine for streak probability (exact DP + 10k Monte Carlo), NQ/MNQ/ES/MES position sizing, and hypothetical expectancy.
 */

import type {
  Challenge,
  JournalEntry,
  JournalSettings,
  NoTradeLog,
  PlaybookSetup,
  TradePlan,
} from "@/lib/types";
import { defaultSettings, setupRules } from "@/lib/types";
import { computeStats } from "@/lib/stats";
import { holdTimeStats, formatHold, holdMinutes as entryHoldMinutes } from "@/lib/holdtime";
import { evaluateRules, adherenceSummary } from "@/lib/rules";
import { disciplineSummary } from "@/lib/discipline";
import { mistakeIndex, mistakeOf, mistakeTagsOf } from "@/lib/mistakes";
import { timeWindowAnalytics } from "@/lib/time-patterns";
import { detectPatterns } from "./patterns";
import { newestFirst, setupBreakdown, aPlusSummary, verdictOf } from "./setup-analytics";
import {
  computeExpectancyStatsTool,
  computePositionSizingTool,
  computeStreakTool,
} from "./tools";
import { computeIdeal } from "./ideal-calc";
import { memoryForModel } from "./retrieve";
import { routeIntent, planFor } from "./router";
import type { UserSemanticParams } from "./extract";
import type { MemoryStore } from "./memory";

export type MinatoToolName =
  | "get_trader_profile"
  | "get_trading_history"
  | "get_trade_details"
  | "get_journal_entries"
  | "get_performance_metrics"
  | "get_rule_violations"
  | "get_psychology_patterns"
  | "get_account_statistics"
  | "compare_trading_periods"
  | "search_trader_memory"
  | "calculate_trading_math";

export interface TraderDatabaseContext {
  traderName: string;
  today: string;
  entries: JournalEntry[];
  plans?: TradePlan[];
  dayLogs?: NoTradeLog[];
  settings: JournalSettings;
  primaryChallenge?: Pick<
    Challenge,
    | "id"
    | "name"
    | "startingBalance"
    | "targetBalance"
    | "maxDrawdown"
    | "drawdownMode"
    | "trailingBasis"
    | "drawdownFloor"
    | "dailyLossLimit"
    | "dailyProfitTarget"
    | "tradeLimit"
    | "instruments"
  > | null;
  semanticParams?: Partial<UserSemanticParams>;
  memoryStore?: MemoryStore | null;
  companion?: Record<string, unknown> | null;
  focusTradeId?: string | null;
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: MinatoToolName;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required?: string[];
    };
  };
}

export const MINATO_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_trader_profile",
      description:
        "Retrieve the trader's profile, active challenge settings, playbook strategies/setups, configured risk/behavior rules, and stored preferences (risk per trade, stop size, instruments).",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_trading_history",
      description:
        "Query the trader's historical trade records with optional filters for date range, instrument, setup, direction, win/loss outcome, process verdict, and sort order.",
      parameters: {
        type: "object",
        properties: {
          dateFrom: { type: "string", description: "Start date YYYY-MM-DD (inclusive)." },
          dateTo: { type: "string", description: "End date YYYY-MM-DD (inclusive)." },
          instrument: { type: "string", description: "Filter by instrument symbol (e.g. MNQ, NQ, ES, MES)." },
          setup: { type: "string", description: "Filter by setup/strategy name substring." },
          direction: { type: "string", enum: ["long", "short"], description: "Filter by trade direction." },
          outcome: { type: "string", enum: ["win", "loss", "breakeven"], description: "Filter by P&L outcome." },
          verdict: {
            type: "string",
            enum: ["a-plus", "process-success", "process-failure", "unrated"],
            description: "Filter by Quick Autopsy process verdict.",
          },
          sortBy: {
            type: "string",
            enum: ["newest", "oldest", "highest_pnl", "lowest_pnl", "longest_hold"],
            description: "Sort order for returned trades (default: newest).",
          },
          limit: { type: "number", description: "Max trade rows to return (1 to 50, default 20)." },
          offset: { type: "number", description: "Skip this many matching trades (for paging through long histories)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_trade_details",
      description:
        "Fetch complete execution, price, stop-loss, take-profit, checklist, psychology, mistake tag, and reflection details for a specific trade by ID, date, or extreme (latest, best_pnl, worst_pnl, longest_hold, shortest_hold).",
      parameters: {
        type: "object",
        properties: {
          tradeId: { type: "string", description: "Exact trade ID." },
          date: { type: "string", description: "Date YYYY-MM-DD to inspect trades from." },
          extreme: {
            type: "string",
            enum: ["latest", "best_pnl", "worst_pnl", "longest_hold", "shortest_hold"],
            description: "Select a specific extreme trade when tradeId is not provided.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_journal_entries",
      description:
        "Retrieve the trader's written journal notes, pre-trade plans (thesis, bias, emotional state, rules), post-trade reflections (wentWell, wentPoorly, cause, lesson), and no-trade day logs.",
      parameters: {
        type: "object",
        properties: {
          dateFrom: { type: "string", description: "Start date YYYY-MM-DD." },
          dateTo: { type: "string", description: "End date YYYY-MM-DD." },
          keyword: { type: "string", description: "Optional search keyword in notes, reflections, or plans." },
          limit: { type: "number", description: "Max records to return (default 15)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_performance_metrics",
      description:
        "Compute comprehensive performance analytics: win rate, net P&L, expectancy, profit factor, average R, hold times, setup rankings, A+ setup performance, time-of-day session edge, and day-of-week breakdown.",
      parameters: {
        type: "object",
        properties: {
          dateFrom: { type: "string", description: "Optional start date YYYY-MM-DD." },
          dateTo: { type: "string", description: "Optional end date YYYY-MM-DD." },
          instrument: { type: "string", description: "Optional instrument filter." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_rule_violations",
      description:
        "Inspect rule adherence, broken Trading Lab guardrails (max daily loss, max trades/day, consecutive-loss stop, min R:R), skipped pre-trade checklist rules, premature entries before 09:33 NY, and plan deviations.",
      parameters: {
        type: "object",
        properties: {
          dateFrom: { type: "string", description: "Optional start date YYYY-MM-DD." },
          dateTo: { type: "string", description: "Optional end date YYYY-MM-DD." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_psychology_patterns",
      description:
        "Analyze the trader's emotional states (CALM, FOCUSED, FOMO, REVENGE, ANXIOUS, etc.), conviction vs urgency, repeated mistake categories and their dollar cost, and recurring behavioral patterns.",
      parameters: {
        type: "object",
        properties: {
          dateFrom: { type: "string", description: "Optional start date YYYY-MM-DD." },
          dateTo: { type: "string", description: "Optional end date YYYY-MM-DD." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_account_statistics",
      description:
        "Retrieve account balance, starting/target equity, peak equity, drawdown used, drawdown room left, daily loss limits, and winning/losing streak records.",
      parameters: {
        type: "object",
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "compare_trading_periods",
      description:
        "Compare two trading periods (e.g. recent trades vs earlier trades, this month vs last month, or custom date ranges) across win rate, net P&L, average R, rule adherence, mistakes, and psychology to assess improvement or regression.",
      parameters: {
        type: "object",
        properties: {
          mode: {
            type: "string",
            enum: ["first_half_vs_second_half", "recent_vs_prior", "this_month_vs_last_month", "custom_dates"],
            description: "Comparison mode (default: first_half_vs_second_half).",
          },
          recentCount: {
            type: "number",
            description: "Number of recent trades for recent_vs_prior mode (default 10).",
          },
          periodAFrom: { type: "string", description: "Period A start date YYYY-MM-DD (for custom_dates)." },
          periodATo: { type: "string", description: "Period A end date YYYY-MM-DD (for custom_dates)." },
          periodBFrom: { type: "string", description: "Period B start date YYYY-MM-DD (for custom_dates)." },
          periodBTo: { type: "string", description: "Period B end date YYYY-MM-DD (for custom_dates)." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_trader_memory",
      description:
        "Search persistent trader memory (semantic facts, episodic session summaries, commitments, saved insights, and practice progress) by query or topic.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search query or topic." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calculate_trading_math",
      description:
        "Run deterministic trading math calculations: losing streak probabilities (exact dynamic programming + 10,000-run Monte Carlo), exact contract position sizing for NQ ($20/pt), MNQ ($2/pt), ES ($50/pt), MES ($5/pt), expectancy, profit factor, break-even win rate, and Kelly criterion.",
      parameters: {
        type: "object",
        properties: {
          symbol: { type: "string", description: "Instrument symbol (MNQ, NQ, MES, ES)." },
          stopPoints: { type: "number", description: "Stop loss distance in points." },
          riskDollars: { type: "number", description: "Dollar risk per trade." },
          riskPct: { type: "number", description: "Percentage of equity risked per trade." },
          winRate: { type: "number", description: "Win rate as 0..1 or 0..100 (optional; defaults to journal win rate)." },
          rr: { type: "number", description: "Reward-to-risk ratio (e.g. 2 for 1:2 RR)." },
          horizonTrades: { type: "number", description: "Number of trades for streak probability (default 100)." },
          targetStreakK: { type: "number", description: "Losing streak length k to test P(streak >= k)." },
        },
      },
    },
  },
];

const ALLOWLISTED_TOOLS = new Set<MinatoToolName>(
  MINATO_TOOL_DEFINITIONS.map((d) => d.function.name),
);

export function isValidToolName(name: unknown): name is MinatoToolName {
  return typeof name === "string" && ALLOWLISTED_TOOLS.has(name as MinatoToolName);
}

/* ------------------------------------------------------------------ */
/*  Helper: Filter entries safely                                      */
/* ------------------------------------------------------------------ */

export function filterEntries(
  entries: readonly JournalEntry[],
  args: {
    dateFrom?: string;
    dateTo?: string;
    instrument?: string;
    setup?: string;
    direction?: string;
    outcome?: string;
    verdict?: string;
  },
): JournalEntry[] {
  const from = typeof args.dateFrom === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.dateFrom) ? args.dateFrom : null;
  const to = typeof args.dateTo === "string" && /^\d{4}-\d{2}-\d{2}$/.test(args.dateTo) ? args.dateTo : null;
  const instr = typeof args.instrument === "string" ? args.instrument.trim().toUpperCase() : null;
  const setupSub = typeof args.setup === "string" ? args.setup.trim().toLowerCase() : null;
  const dir = args.direction === "long" || args.direction === "short" ? args.direction : null;
  const out = args.outcome === "win" || args.outcome === "loss" || args.outcome === "breakeven" ? args.outcome : null;
  const verd =
    args.verdict === "a-plus" ||
    args.verdict === "process-success" ||
    args.verdict === "process-failure" ||
    args.verdict === "unrated"
      ? args.verdict
      : null;

  return newestFirst(entries).filter((e) => {
    if (from && e.date < from) return false;
    if (to && e.date > to) return false;
    if (instr && (e.instrument ?? "").toUpperCase() !== instr && !(e.instrument ?? "").toUpperCase().startsWith(instr)) {
      return false;
    }
    if (setupSub && !(e.setup ?? "").toLowerCase().includes(setupSub)) return false;
    if (dir && e.direction !== dir) return false;
    if (out === "win" && !(e.pnl > 0)) return false;
    if (out === "loss" && !(e.pnl < 0)) return false;
    if (out === "breakeven" && e.pnl !== 0) return false;
    if (verd && verdictOf(e) !== verd) return false;
    return true;
  });
}

function summarizeTradeDetailed(e: JournalEntry) {
  const m = mistakeOf(e);
  const tags = mistakeTagsOf(e);
  const holdMin = entryHoldMinutes(e);
  return {
    id: e.id,
    date: e.date,
    instrument: e.instrument || "—",
    direction: e.direction ?? null,
    setup: e.setup || "(no setup)",
    pnl: Math.round(e.pnl * 100) / 100,
    rr: e.rr ?? null,
    entryTime: e.entryTime ?? null,
    exitTime: e.exitTime ?? null,
    holdMinutes: holdMin != null ? Math.round(holdMin * 10) / 10 : null,
    holdDuration: e.holdDuration ?? (holdMin != null ? formatHold(holdMin) : null),
    entryPrice: e.entryPrice ?? null,
    exitPrice: e.exitPrice ?? null,
    stopLoss: e.stopLoss ?? null,
    takeProfit: e.takeProfit ?? null,
    quantity: e.quantity ?? null,
    verdict: verdictOf(e),
    followedPlan: e.review?.outcome?.followedPlan ?? e.reflection?.followedSetup ?? null,
    respectedRisk: e.reflection?.followedRisk ?? null,
    primaryMistake: m ? { key: m.key, label: m.label } : null,
    mistakeTags: tags.map((t) => t.label),
    emotionBefore: e.review?.psychology?.emotionBefore ?? null,
    emotionAfter: e.review?.psychology?.emotionAfter ?? null,
    fomo: e.review?.psychology?.fomo ?? null,
    revenge: e.review?.psychology?.revenge ?? null,
    fearExit: e.review?.psychology?.fearExit ?? null,
    whyEntered: e.review?.execution?.whyEntered ?? null,
    biggestMistakeNote: e.review?.followUp?.biggestMistake ?? e.review?.followUp?.mistakeNote ?? null,
    wentWell: e.reflection?.wentWell ?? null,
    wentPoorly: e.reflection?.wentPoorly ?? null,
    lesson: e.reflection?.lesson ?? e.review?.concepts?.improve ?? null,
    notes: e.notes ? e.notes.slice(0, 600) : null,
    preTradeChecklist: e.preTradeChecklist ?? null,
    reviewStatus: e.reviewStatus ?? null,
  };
}

function summarizePeriodSlice(entries: readonly JournalEntry[], settings: JournalSettings, label: string) {
  if (entries.length === 0) {
    return {
      label,
      trades: 0,
      tradingDays: 0,
      netPnl: 0,
      winRateTradePct: null,
      winRateDayPct: null,
      avgWin: 0,
      avgLoss: 0,
      profitFactor: null,
      avgR: null,
      followedPlanPct: null,
      aPlusCount: 0,
      processFailureCount: 0,
      topMistakes: [],
      emotions: [],
    };
  }
  const stats = computeStats(entries as JournalEntry[], settings);
  const exp = computeExpectancyStatsTool(entries as JournalEntry[], settings);
  const mistakes = mistakeIndex(entries as JournalEntry[]).slice(0, 4).map((m) => ({
    label: m.label,
    count: m.count,
    costDollars: Math.round(m.cost * 100) / 100,
  }));

  const withPlanVerdict = entries.filter((e) => e.review?.outcome?.followedPlan != null || e.reflection?.followedSetup != null);
  const followedCount = withPlanVerdict.filter(
    (e) => (e.review?.outcome?.followedPlan ?? e.reflection?.followedSetup) === true,
  ).length;

  const emoCounts = new Map<string, { count: number; netPnl: number; wins: number }>();
  let fomoCount = 0;
  let revengeCount = 0;
  for (const e of entries) {
    const p = e.review?.psychology;
    if (p?.fomo) fomoCount++;
    if (p?.revenge) revengeCount++;
    const emo = (p?.emotionBefore || p?.emotionAfter || (p?.fomo ? "FOMO" : p?.revenge ? "REVENGE" : "")).trim().toUpperCase();
    if (!emo) continue;
    const cur = emoCounts.get(emo) ?? { count: 0, netPnl: 0, wins: 0 };
    cur.count++;
    cur.netPnl += e.pnl;
    if (e.pnl > 0) cur.wins++;
    emoCounts.set(emo, cur);
  }

  const dates = entries.map((e) => e.date).sort();
  return {
    label,
    dateRange: dates.length > 0 ? `${dates[0]} to ${dates[dates.length - 1]}` : null,
    trades: entries.length,
    tradingDays: stats.tradingDays,
    netPnl: Math.round(stats.totalPnl * 100) / 100,
    winRateTradePct: exp.winRatePct,
    winRateDayPct: Math.round(stats.winRate * 100),
    avgDayPnl: Math.round(stats.avgDayPnl * 100) / 100,
    avgWin: exp.avgWinDollars,
    avgLoss: exp.avgLossDollars,
    profitFactor: exp.profitFactor,
    expectancyDollars: exp.expectancyDollarsPerTrade,
    avgR: exp.avgR,
    followedPlanPct: withPlanVerdict.length > 0 ? Math.round((followedCount / withPlanVerdict.length) * 100) : null,
    aPlusCount: entries.filter((e) => verdictOf(e) === "a-plus").length,
    processFailureCount: entries.filter((e) => verdictOf(e) === "process-failure").length,
    fomoCount,
    revengeCount,
    topMistakes: mistakes,
    emotions: [...emoCounts.entries()]
      .map(([emotion, v]) => ({
        emotion,
        trades: v.count,
        winRatePct: Math.round((v.wins / v.count) * 100),
        netPnl: Math.round(v.netPnl * 100) / 100,
      }))
      .sort((a, b) => b.trades - a.trades)
      .slice(0, 5),
  };
}

/* ------------------------------------------------------------------ */
/*  Main Tool Executor                                                 */
/* ------------------------------------------------------------------ */

export function executeMinatoTool(
  name: MinatoToolName,
  rawArgs: Record<string, unknown> | undefined | null,
  db: TraderDatabaseContext,
): Record<string, unknown> {
  const args = rawArgs && typeof rawArgs === "object" ? rawArgs : {};
  const sortedEntries = newestFirst(db.entries);
  const settings = db.settings ?? defaultSettings();
  const sem = db.semanticParams ?? {};

  switch (name) {
    case "get_trader_profile": {
      const playbook = (settings.playbook ?? []).map((p: PlaybookSetup) => ({
        id: p.id,
        name: p.name,
        strategy: p.strategy ?? p.purpose ?? null,
        minRR: p.minRR ?? null,
        sessions: p.sessions ?? [],
        instruments: p.instruments ?? [],
        rules: setupRules(p).map((r) => r.text),
        active: p.active !== false,
      }));
      const activeRules = (settings.rules?.rules ?? [])
        .filter((r) => r.enabled)
        .map((r) => ({
          id: r.id,
          kind: r.kind,
          label: r.label,
          params: r.params,
        }));
      return {
        traderName: db.traderName,
        today: db.today,
        totalTradesRecorded: sortedEntries.length,
        primaryChallenge: db.primaryChallenge ?? null,
        accountConfig: {
          startingEquity: settings.startingEquity,
          targetEquity: settings.targetEquity,
          maxDrawdown: settings.maxDrawdown,
          currency: settings.currency,
          todayDailyLossLimit: settings.dayLimits?.[db.today] ?? sem.dailyLossLimit ?? null,
        },
        semanticPreferences: {
          riskDollarsPerTrade: sem.riskDollars ?? null,
          riskPctPerTrade: sem.riskPct ?? null,
          defaultStopPoints: sem.stopPoints ?? null,
          dailyLossLimit: sem.dailyLossLimit ?? null,
          drawdownLimit: sem.drawdownLimit ?? null,
          profitTarget: sem.profitTarget ?? null,
          instrumentsTraded: sem.instruments ?? [],
          accountType: sem.accountType ?? null,
          sessionWindow: sem.sessionTimes ?? null,
        },
        playbookSetups: playbook,
        activeGuardrailRules: activeRules,
      };
    }

    case "get_trading_history": {
      const filtered = filterEntries(sortedEntries, {
        dateFrom: args.dateFrom as string | undefined,
        dateTo: args.dateTo as string | undefined,
        instrument: args.instrument as string | undefined,
        setup: args.setup as string | undefined,
        direction: args.direction as string | undefined,
        outcome: args.outcome as string | undefined,
        verdict: args.verdict as string | undefined,
      });

      const sortBy = typeof args.sortBy === "string" ? args.sortBy : "newest";
      const ordered = [...filtered];
      if (sortBy === "oldest") ordered.reverse();
      else if (sortBy === "highest_pnl") ordered.sort((a, b) => b.pnl - a.pnl);
      else if (sortBy === "lowest_pnl") ordered.sort((a, b) => a.pnl - b.pnl);
      else if (sortBy === "longest_hold") {
        ordered.sort((a, b) => (entryHoldMinutes(b) ?? -1) - (entryHoldMinutes(a) ?? -1));
      }

      const limit = Math.min(50, Math.max(1, Number(args.limit) || 20));
      const offset = Math.max(0, Math.min(filtered.length, Math.trunc(Number(args.offset) || 0)));
      const wins = filtered.filter((e) => e.pnl > 0).length;
      const losses = filtered.filter((e) => e.pnl < 0).length;
      const netPnl = Math.round(filtered.reduce((s, e) => s + e.pnl, 0) * 100) / 100;

      return {
        totalMatchingTrades: filtered.length,
        returnedCount: Math.min(limit, Math.max(0, ordered.length - offset)),
        offset,
        hasMore: offset + limit < ordered.length,
        summaryOfMatching: {
          wins,
          losses,
          winRatePct: wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : null,
          netPnl,
        },
        trades: ordered.slice(offset, offset + limit).map((e) => {
          const m = mistakeOf(e);
          const holdMin = entryHoldMinutes(e);
          return {
            id: e.id,
            date: e.date,
            instrument: e.instrument || "—",
            direction: e.direction ?? null,
            setup: e.setup || "(no setup)",
            pnl: Math.round(e.pnl * 100) / 100,
            rr: e.rr ?? null,
            entryTime: e.entryTime ?? null,
            exitTime: e.exitTime ?? null,
            hold: e.holdDuration ?? (holdMin != null ? formatHold(holdMin) : null),
            verdict: verdictOf(e),
            followedPlan: e.review?.outcome?.followedPlan ?? null,
            mistake: m ? m.label : null,
            noteExcerpt: (e.reflection?.lesson || e.review?.followUp?.biggestMistake || e.notes || "").slice(0, 140) || null,
          };
        }),
      };
    }

    case "get_trade_details": {
      const tradeId = typeof args.tradeId === "string" ? args.tradeId.trim() : null;
      const date = typeof args.date === "string" ? args.date.trim() : null;
      const extreme = typeof args.extreme === "string" ? args.extreme : null;

      if (tradeId) {
        const found = sortedEntries.find((e) => e.id === tradeId);
        return {
          found: !!found,
          trade: found ? summarizeTradeDetailed(found) : null,
        };
      }

      if (date) {
        const matches = sortedEntries.filter((e) => e.date === date);
        return {
          date,
          count: matches.length,
          netPnl: Math.round(matches.reduce((s, e) => s + e.pnl, 0) * 100) / 100,
          trades: matches.slice(0, 10).map(summarizeTradeDetailed),
        };
      }

      let target: JournalEntry | undefined = sortedEntries[0];
      if (extreme === "best_pnl") {
        target = [...sortedEntries].sort((a, b) => b.pnl - a.pnl)[0];
      } else if (extreme === "worst_pnl") {
        target = [...sortedEntries].sort((a, b) => a.pnl - b.pnl)[0];
      } else if (extreme === "longest_hold") {
        target = [...sortedEntries].sort((a, b) => (entryHoldMinutes(b) ?? -1) - (entryHoldMinutes(a) ?? -1))[0];
      } else if (extreme === "shortest_hold") {
        const withHold = sortedEntries.filter((e) => entryHoldMinutes(e) != null);
        target = [...withHold].sort((a, b) => (entryHoldMinutes(a) ?? 1e9) - (entryHoldMinutes(b) ?? 1e9))[0] ?? sortedEntries[0];
      } else if (db.focusTradeId) {
        target = sortedEntries.find((e) => e.id === db.focusTradeId) ?? sortedEntries[0];
      }

      return {
        found: !!target,
        extreme: extreme ?? "latest",
        trade: target ? summarizeTradeDetailed(target) : null,
      };
    }

    case "get_journal_entries": {
      const from = typeof args.dateFrom === "string" ? args.dateFrom : null;
      const to = typeof args.dateTo === "string" ? args.dateTo : null;
      const kw = typeof args.keyword === "string" ? args.keyword.trim().toLowerCase() : null;
      const limit = Math.min(30, Math.max(1, Number(args.limit) || 15));

      const entryNotes = sortedEntries
        .filter((e) => {
          if (from && e.date < from) return false;
          if (to && e.date > to) return false;
          const text = [
            e.notes,
            e.reflection?.wentWell,
            e.reflection?.wentPoorly,
            e.reflection?.cause,
            e.reflection?.lesson,
            e.review?.followUp?.biggestMistake,
            e.review?.followUp?.mistakeNote,
            e.review?.execution?.whyEntered,
            e.review?.psychology?.notes,
          ]
            .filter(Boolean)
            .join(" ");
          if (!text.trim()) return false;
          if (kw && !text.toLowerCase().includes(kw)) return false;
          return true;
        })
        .slice(0, limit)
        .map((e) => ({
          tradeId: e.id,
          date: e.date,
          instrument: e.instrument,
          setup: e.setup || null,
          pnl: e.pnl,
          verdict: verdictOf(e),
          notes: e.notes ? e.notes.slice(0, 400) : null,
          wentWell: e.reflection?.wentWell ?? null,
          wentPoorly: e.reflection?.wentPoorly ?? null,
          cause: e.reflection?.cause ?? null,
          lesson: e.reflection?.lesson ?? e.review?.concepts?.improve ?? null,
          biggestMistake: e.review?.followUp?.biggestMistake ?? e.review?.followUp?.mistakeNote ?? null,
          whyEntered: e.review?.execution?.whyEntered ?? null,
        }));

      const plans = (db.plans ?? [])
        .filter((p) => {
          if (from && p.date < from) return false;
          if (to && p.date > to) return false;
          if (kw) {
            const blob = `${p.thesis ?? ""} ${p.preSessionProcess ?? ""} ${p.playbookName ?? ""} ${p.emotionalNote ?? ""}`.toLowerCase();
            if (!blob.includes(kw)) return false;
          }
          return true;
        })
        .slice(-limit)
        .map((p) => ({
          id: p.id,
          date: p.date,
          instrument: p.instrument ?? null,
          playbookName: p.playbookName ?? null,
          thesis: p.thesis ? p.thesis.slice(0, 300) : null,
          emotionalState: p.emotionalState ?? null,
          emotionalNote: p.emotionalNote ?? null,
          watchMistakes: p.watchMistakes ?? [],
          maxLoss: p.maxLoss ?? null,
          status: p.status,
        }));

      return {
        writtenTradeReflections: entryNotes,
        preTradePlans: plans,
        noTradeDays: (db.dayLogs ?? []).slice(-15),
      };
    }

    case "get_performance_metrics": {
      const pool = filterEntries(sortedEntries, {
        dateFrom: args.dateFrom as string | undefined,
        dateTo: args.dateTo as string | undefined,
        instrument: args.instrument as string | undefined,
      });
      const stats = computeStats(pool, settings);
      const exp = computeExpectancyStatsTool(pool, settings);
      const holds = holdTimeStats(pool);
      const setups = setupBreakdown(pool);
      const aPlus = aPlusSummary(pool);
      const tw = timeWindowAnalytics(pool);
      const topWindows = [...tw.windows]
        .filter((w) => w.trades >= 1)
        .sort((a, b) => b.totalPnl - a.totalPnl)
        .slice(0, 5)
        .map((w) => ({
          window: `${w.label} NY`,
          trades: w.trades,
          winRatePct: w.winRate,
          avgPnl: w.avgPnl,
          totalPnl: w.totalPnl,
          avgR: w.avgR,
        }));

      return {
        sampleTrades: pool.length,
        tradingDays: stats.tradingDays,
        totalPnl: Math.round(stats.totalPnl * 100) / 100,
        winRateDayPct: Math.round(stats.winRate * 100),
        winRateTradePct: exp.winRatePct,
        winningDays: stats.winningDays,
        losingDays: stats.losingDays,
        avgDayPnl: Math.round(stats.avgDayPnl * 100) / 100,
        bestDay: stats.bestDay,
        worstDay: stats.worstDay,
        expectancyDollarsPerTrade: exp.expectancyDollarsPerTrade,
        expectancyR: exp.expectancyR,
        profitFactor: exp.profitFactor,
        payoffRatio: exp.payoffRatio,
        avgWinDollars: exp.avgWinDollars,
        avgLossDollars: exp.avgLossDollars,
        avgR: exp.avgR,
        holdTime: {
          sampleSize: holds.sampleSize,
          avgWin: formatHold(holds.avgWinMin),
          avgLoss: formatHold(holds.avgLossMin),
          longestHoldTrade: holds.longestHoldTrade,
          shortestHoldTrade: holds.shortestHoldTrade,
        },
        setupBreakdown: setups.rows.slice(0, 8),
        aPlusSummary: {
          count: aPlus.count,
          rated: aPlus.rated,
          total: aPlus.total,
          netPnl: aPlus.netPnl,
          winRatePct: aPlus.winRatePct,
          bestSetup: aPlus.best,
          bySetup: aPlus.bySetup.slice(0, 5),
        },
        sessionWindows: topWindows,
      };
    }

    case "get_rule_violations": {
      const pool = filterEntries(sortedEntries, {
        dateFrom: args.dateFrom as string | undefined,
        dateTo: args.dateTo as string | undefined,
      });
      const violations = evaluateRules(pool, settings);
      const adherence = adherenceSummary(pool, settings);
      const discipline = disciplineSummary(pool, db.dayLogs ?? []);

      // The 9:33 AM rule is the trader's own configurable R1 checklist item. Only report "premature entries"
      // when that rule is actually in play (a trade carries the R1 flag, or a playbook rule mentions it) —
      // otherwise this would flag trades against a rule the trader never set.
      const r1InPlay =
        pool.some((e) => e.checklist && Object.prototype.hasOwnProperty.call(e.checklist, "r1Time")) ||
        (settings.playbook ?? []).some((p: PlaybookSetup) => setupRules(p).some((r) => /9[:.]?33/.test(r.text)));
      const prematureEntries = (!r1InPlay ? [] : pool)
        .filter((e) => e.entryTime && e.entryTime < "09:33" && e.entryTime >= "09:15")
        .map((e) => ({ id: e.id, date: e.date, instrument: e.instrument, entryTime: e.entryTime, pnl: e.pnl }));

      const skippedChecklistTrades = pool
        .filter((e) => e.preTradeChecklist && e.preTradeChecklist.some((c) => !c.confirmed))
        .map((e) => ({
          id: e.id,
          date: e.date,
          instrument: e.instrument,
          pnl: e.pnl,
          skippedRules: e.preTradeChecklist!.filter((c) => !c.confirmed).map((c) => c.label),
        }));

      const planDepartures = pool
        .filter((e) => e.review?.outcome?.followedPlan === false || e.reflection?.followedSetup === false)
        .map((e) => ({
          id: e.id,
          date: e.date,
          instrument: e.instrument,
          setup: e.setup || null,
          pnl: e.pnl,
          mistake: mistakeOf(e)?.label ?? null,
        }));

      return {
        totalViolations: violations.length,
        cleanDayRatePct: adherence.cleanDayRate != null ? Math.round(adherence.cleanDayRate * 100) : null,
        tradingDays30: adherence.tradingDays30,
        violations30: adherence.violations30,
        byRule: adherence.byRule,
        recentViolations: violations.slice(0, 15),
        prematureEntriesBefore933: prematureEntries.slice(0, 10),
        skippedChecklistTrades: skippedChecklistTrades.slice(0, 10),
        planDepartures: planDepartures.slice(0, 10),
        disciplineCompletionRatePct: Math.round(discipline.completionRate * 100),
      };
    }

    case "get_psychology_patterns": {
      const pool = filterEntries(sortedEntries, {
        dateFrom: args.dateFrom as string | undefined,
        dateTo: args.dateTo as string | undefined,
      });
      const mistakes = mistakeIndex(pool);
      const patterns = detectPatterns(pool);

      const byEmotion = new Map<string, { trades: number; wins: number; losses: number; netPnl: number }>();
      let fomoTrades = 0;
      let fomoPnl = 0;
      let revengeTrades = 0;
      let revengePnl = 0;
      let fearExitTrades = 0;
      let urgencyTrades = 0;
      let convictionTrades = 0;

      for (const e of pool) {
        const p = e.review?.psychology;
        if (p?.fomo) {
          fomoTrades++;
          fomoPnl += e.pnl;
        }
        if (p?.revenge) {
          revengeTrades++;
          revengePnl += e.pnl;
        }
        if (p?.fearExit) fearExitTrades++;
        if (p?.convictionOrUrgency === "urgency") urgencyTrades++;
        if (p?.convictionOrUrgency === "conviction") convictionTrades++;

        const emo = (p?.emotionBefore || p?.emotionAfter || (p?.fomo ? "FOMO" : p?.revenge ? "REVENGE" : "")).trim().toUpperCase();
        if (!emo) continue;
        const cur = byEmotion.get(emo) ?? { trades: 0, wins: 0, losses: 0, netPnl: 0 };
        cur.trades++;
        if (e.pnl > 0) cur.wins++;
        else if (e.pnl < 0) cur.losses++;
        cur.netPnl += e.pnl;
        byEmotion.set(emo, cur);
      }

      const postLossGates = pool
        .filter((e) => e.review?.postLossGate)
        .slice(0, 8)
        .map((e) => ({
          date: e.date,
          pnl: e.pnl,
          emotionalState: e.review?.postLossGate?.emotionalState ?? null,
          immediateThoughts: e.review?.postLossGate?.immediateThoughts ?? null,
          fomo: e.review?.postLossGate?.fomo ?? null,
          revenge: e.review?.postLossGate?.revenge ?? null,
        }));

      return {
        sampleTrades: pool.length,
        emotionalStatePerformance: [...byEmotion.entries()]
          .map(([state, v]) => ({
            state,
            trades: v.trades,
            winRatePct: v.wins + v.losses > 0 ? Math.round((v.wins / (v.wins + v.losses)) * 100) : null,
            netPnl: Math.round(v.netPnl * 100) / 100,
          }))
          .sort((a, b) => b.netPnl - a.netPnl),
        triggers: {
          fomo: { trades: fomoTrades, netPnl: Math.round(fomoPnl * 100) / 100 },
          revenge: { trades: revengeTrades, netPnl: Math.round(revengePnl * 100) / 100 },
          fearExit: { trades: fearExitTrades },
          urgencyEntries: urgencyTrades,
          convictionEntries: convictionTrades,
        },
        mistakeCategoriesRankedByCost: mistakes.map((m) => ({
          key: m.key,
          label: m.label,
          count: m.count,
          costDollars: Math.round(m.cost * 100) / 100,
        })),
        recurringPatterns: patterns.map((p) => ({
          label: p.label,
          count: p.count,
          confidence: p.confidence,
          improving: p.improving,
          evidence: p.evidence.slice(0, 3),
        })),
        recentPostLossGates: postLossGates,
      };
    }

    case "get_account_statistics": {
      const stats = computeStats(sortedEntries, settings);
      const streak = computeStreakTool({ entries: sortedEntries, runs: 5_000, seed: 42 });
      const ddLimit = settings.maxDrawdown || 1000;
      const ddUsed = Math.round(stats.drawdown * 100) / 100;
      const ddRoom =
        stats.drawdownCushion != null
          ? Math.round(stats.drawdownCushion * 100) / 100
          : Math.max(0, Math.round((ddLimit - ddUsed) * 100) / 100);

      return {
        challenge: db.primaryChallenge?.name ?? "Primary Account",
        startingEquity: settings.startingEquity,
        currentEquity: Math.round(stats.currentEquity * 100) / 100,
        peakEquity: Math.round(stats.peakEquity * 100) / 100,
        targetEquity: settings.targetEquity,
        remainingToTarget: Math.round(stats.remainingToTarget * 100) / 100,
        targetProgressPct: Math.round(stats.targetProgress * 100),
        totalPnl: Math.round(stats.totalPnl * 100) / 100,
        drawdown: {
          used: ddUsed,
          limit: ddLimit,
          room: ddRoom,
          usedPct: Math.round((stats.drawdownBudgetUsed ?? 0) * 100),
          floor: stats.drawdownFloor != null ? Math.round(stats.drawdownFloor * 100) / 100 : null,
        },
        streaks: {
          historicalMaxLosingStreak: streak.historicalMaxLosingStreak,
          historicalMaxWinningStreak: streak.historicalMaxWinningStreak,
          expectedMaxLosingStreakOver100Trades: streak.monteCarlo.meanMaxStreak,
          p95MaxLosingStreakOver100Trades: streak.monteCarlo.p95MaxStreak,
        },
        equityCurveTail: stats.equityCurve.slice(-15),
      };
    }

    case "compare_trading_periods": {
      const mode = typeof args.mode === "string" ? args.mode : "first_half_vs_second_half";
      const chronological = [...sortedEntries].reverse(); // oldest -> newest
      let sliceA: JournalEntry[] = [];
      let sliceB: JournalEntry[] = [];
      let labelA = "Earlier Period";
      let labelB = "Recent Period";

      if (mode === "custom_dates" && typeof args.periodAFrom === "string" && typeof args.periodBFrom === "string") {
        sliceA = filterEntries(sortedEntries, {
          dateFrom: args.periodAFrom as string,
          dateTo: (args.periodATo as string) || undefined,
        });
        sliceB = filterEntries(sortedEntries, {
          dateFrom: args.periodBFrom as string,
          dateTo: (args.periodBTo as string) || undefined,
        });
        labelA = `${args.periodAFrom} to ${args.periodATo ?? "end"}`;
        labelB = `${args.periodBFrom} to ${args.periodBTo ?? "end"}`;
      } else if (mode === "this_month_vs_last_month") {
        const thisMonthPrefix = db.today.slice(0, 7);
        const [y, m] = thisMonthPrefix.split("-").map(Number);
        const prevDate = new Date(Date.UTC(y ?? 2026, (m ?? 1) - 2, 1));
        const lastMonthPrefix = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, "0")}`;
        sliceA = chronological.filter((e) => e.date.startsWith(lastMonthPrefix));
        sliceB = chronological.filter((e) => e.date.startsWith(thisMonthPrefix));
        labelA = `Last Month (${lastMonthPrefix})`;
        labelB = `This Month (${thisMonthPrefix})`;
      } else if (mode === "recent_vs_prior") {
        const n = Math.max(2, Math.min(50, Number(args.recentCount) || Math.max(3, Math.floor(chronological.length / 2))));
        sliceB = chronological.slice(-n);
        sliceA = chronological.slice(Math.max(0, chronological.length - 2 * n), Math.max(0, chronological.length - n));
        labelA = `Prior ${sliceA.length} Trades`;
        labelB = `Latest ${sliceB.length} Trades`;
      } else {
        const mid = Math.floor(chronological.length / 2);
        sliceA = chronological.slice(0, mid);
        sliceB = chronological.slice(mid);
        labelA = `First Half (${sliceA.length} trades)`;
        labelB = `Second Half (${sliceB.length} trades)`;
      }

      const summaryA = summarizePeriodSlice(sliceA, settings, labelA);
      const summaryB = summarizePeriodSlice(sliceB, settings, labelB);

      const pnlDelta = Math.round((summaryB.netPnl - summaryA.netPnl) * 100) / 100;
      const wrDelta =
        summaryA.winRateTradePct != null && summaryB.winRateTradePct != null
          ? Math.round((summaryB.winRateTradePct - summaryA.winRateTradePct) * 10) / 10
          : null;
      const planAdherenceDelta =
        summaryA.followedPlanPct != null && summaryB.followedPlanPct != null
          ? summaryB.followedPlanPct - summaryA.followedPlanPct
          : null;

      return {
        mode,
        earlierPeriod: summaryA,
        recentPeriod: summaryB,
        deltas: {
          netPnlChangeDollars: pnlDelta,
          winRateTradeChangePctPoints: wrDelta,
          planAdherenceChangePctPoints: planAdherenceDelta,
          fomoCountChange: (summaryB.fomoCount ?? 0) - (summaryA.fomoCount ?? 0),
          revengeCountChange: (summaryB.revengeCount ?? 0) - (summaryA.revengeCount ?? 0),
          processFailureChange: summaryB.processFailureCount - summaryA.processFailureCount,
          aPlusCountChange: summaryB.aPlusCount - summaryA.aPlusCount,
        },
      };
    }

    case "search_trader_memory": {
      const q = typeof args.query === "string" && args.query.trim() ? args.query.trim() : "trader profile rules mistakes";
      const route = routeIntent(q);
      const plan = planFor(route);
      const retrieved = db.memoryStore ? memoryForModel(db.memoryStore, q, plan, Date.now()) : null;
      return {
        semanticParameters: sem,
        beliefs: retrieved?.beliefs ?? [],
        insufficient: retrieved?.insufficient ?? [],
        companionPractice: (db.companion as { practice?: unknown } | null)?.practice ?? null,
        companionPlans: (db.companion as { plans?: unknown } | null)?.plans ?? null,
      };
    }

    case "calculate_trading_math": {
      const winRateRaw = typeof args.winRate === "number" ? args.winRate : undefined;
      const overrideWinRate =
        winRateRaw != null ? (winRateRaw > 1 ? winRateRaw / 100 : winRateRaw) : undefined;
      const horizonTrades = typeof args.horizonTrades === "number" ? args.horizonTrades : 100;
      const targetK = typeof args.targetStreakK === "number" ? args.targetStreakK : undefined;

      const streak = computeStreakTool({
        entries: sortedEntries,
        overrideWinRate,
        horizonTrades,
        targetK,
        runs: 10_000,
        seed: 42,
      });

      const sizing = computePositionSizingTool({
        entries: sortedEntries,
        settings,
        symbol: typeof args.symbol === "string" ? args.symbol : "MNQ",
        stopPoints: typeof args.stopPoints === "number" ? args.stopPoints : undefined,
        riskDollars: typeof args.riskDollars === "number" ? args.riskDollars : undefined,
        riskPct: typeof args.riskPct === "number" ? args.riskPct : undefined,
        memoryRiskDollars: sem.riskDollars ?? null,
        memoryRiskPct: sem.riskPct ?? null,
        memoryStopPoints: sem.stopPoints ?? null,
        memoryDailyLossLimit: sem.dailyLossLimit ?? null,
        p95LosingStreak: streak.monteCarlo.p95MaxStreak,
      });

      const exp = computeExpectancyStatsTool(sortedEntries, settings);

      let hypotheticalExpectancy: Record<string, unknown> | null = null;
      if (overrideWinRate != null && typeof args.rr === "number" && args.rr > 0) {
        const p = overrideWinRate;
        const qLoss = 1 - p;
        const r = args.rr;
        const expR = Math.round((p * r - qLoss) * 1000) / 1000;
        const pf = qLoss > 0 ? Math.round(((p * r) / qLoss) * 100) / 100 : null;
        const breakEvenWrPct = Math.round((1 / (1 + r)) * 10000) / 100;
        const kellyPct = Math.max(0, Math.round((p - qLoss / r) * 10000) / 100);
        hypotheticalExpectancy = {
          winRatePct: Math.round(p * 1000) / 10,
          rewardToRisk: r,
          expectancyR: expR,
          profitFactor: pf,
          breakEvenWinRatePct: breakEvenWrPct,
          fullKellyPct: kellyPct,
          halfKellyPct: Math.round((kellyPct / 2) * 100) / 100,
        };
      } else {
        const idealFromText = computeIdeal(
          `win rate ${overrideWinRate != null ? overrideWinRate * 100 : exp.winRatePct}% rr 1:${args.rr ?? exp.payoffRatio ?? 2}`,
          {
            riskDollars: sem.riskDollars ?? null,
            riskPct: sem.riskPct ?? null,
            stopPoints: sem.stopPoints ?? null,
          },
        );
        if (idealFromText?.results.expectancy) {
          hypotheticalExpectancy = idealFromText.results.expectancy as Record<string, unknown>;
        }
      }

      return {
        streakProbability: streak,
        positionSizing: sizing,
        journalExpectancy: exp,
        hypotheticalExpectancy,
      };
    }
  }
}
