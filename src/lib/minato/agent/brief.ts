/**
 * BRIEF — the small, always-fresh orientation the model gets on every turn.
 *
 * It is computed from the trader's records at request time (never cached across requests), so a trade logged
 * a minute ago, an edited rule or a new journal note is already reflected. It is deliberately compact: enough
 * for the model to know who it is talking to and what the headline state is, and to decide which tool to call
 * for detail. Everything else is fetched on demand.
 */
import { buildContinuousKnowledgeSnapshot } from "../knowledge";
import { dropEmpty } from "../context-pack";
import { todaySnapshot } from "./extra-tools";
import type { TraderDatabaseContext } from "../db-tools";
import type { Insight, KnowledgeStore } from "./knowledge-store";
import type { MarketClock } from "../market-clock";

export interface CheckpointData {
  date: string;
  trades: number;
  tradingDays: number;
  totalPnl: number;
  winRateTradePct: number | null;
  drawdownRoom: number;
  latestTradeDate: string | null;
}

export function checkpointFrom(db: TraderDatabaseContext, today: string): CheckpointData {
  const k = buildContinuousKnowledgeSnapshot({
    traderName: db.traderName, today, marketSummary: "", entries: db.entries, plans: db.plans, dayLogs: db.dayLogs,
    settings: db.settings, primaryChallenge: db.primaryChallenge, semanticParams: db.semanticParams,
  });
  return {
    date: today,
    trades: k.dataFreshness.totalTrades,
    tradingDays: k.accountOverview.tradingDays,
    totalPnl: k.accountOverview.totalPnl,
    winRateTradePct: k.accountOverview.winRateTradePct,
    drawdownRoom: k.accountOverview.drawdownRoom,
    latestTradeDate: k.dataFreshness.latestTradeDate,
  };
}

export async function buildBrief(opts: {
  db: TraderDatabaseContext;
  clock: MarketClock;
  knowledge: KnowledgeStore;
  clientBeliefs: { say: string }[];
}): Promise<{ brief: Record<string, unknown>; insights: Insight[] }> {
  const { db, clock } = opts;
  const k = buildContinuousKnowledgeSnapshot({
    traderName: db.traderName, today: db.today, marketSummary: clock.summary, entries: db.entries, plans: db.plans, dayLogs: db.dayLogs,
    settings: db.settings, primaryChallenge: db.primaryChallenge, semanticParams: db.semanticParams,
  });

  const [stored, last] = await Promise.all([
    opts.knowledge.list({ limit: 10 }).catch(() => [] as Insight[]),
    opts.knowledge.latestCheckpoint(db.today).catch(() => null),
  ]);
  const insights = stored.filter((s) => s.source !== "checkpoint" && s.kind !== "conversation").slice(0, 8);

  // What changed since MINATO last looked (from the previous day's checkpoint) — so new trades are noticed.
  let sinceLastCheckpoint: Record<string, unknown> | null = null;
  const prev = last?.data as Partial<CheckpointData> | undefined;
  if (last && prev && typeof prev.trades === "number") {
    sinceLastCheckpoint = {
      since: last.asOf,
      newTrades: k.dataFreshness.totalTrades - prev.trades,
      pnlChange: typeof prev.totalPnl === "number" ? k.accountOverview.totalPnl - prev.totalPnl : null,
      winRateTradePctThen: prev.winRateTradePct ?? null,
    };
  }

  const brief = dropEmpty({
    now: { date: db.today, weekday: clock.weekday, newYorkTime: clock.time, market: clock.summary },
    trader: db.traderName,
    scope: db.primaryChallenge ? { challenge: db.primaryChallenge.name } : { challenge: "all trades" },
    account: k.accountOverview,
    today: todaySnapshot(db.entries, db.today),
    dataFreshness: k.dataFreshness,
    sinceLastCheckpoint,
    configured: k.configuredPreferences,
    headlines: {
      strongestSetup: k.strengthsAndWeaknesses.strongestSetup,
      weakestSetup: k.strengthsAndWeaknesses.weakestSetup,
      repeatedMistakes: k.strengthsAndWeaknesses.repeatedMistakes,
      recentTrend: k.progressOverTime.trend,
    },
    rememberedNotes: insights.map((s) => ({ id: s.id, kind: s.kind, note: s.content, lastConfirmed: s.lastSeen.slice(0, 10), asOfData: s.asOf })),
    localBeliefs: opts.clientBeliefs.slice(0, 6).map((b) => b.say),
  }) as Record<string, unknown>;
  return { brief, insights };
}
