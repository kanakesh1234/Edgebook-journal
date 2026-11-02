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
import { riskProfile, todaySnapshot } from "./extra-tools";
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

const RISK_QUERY_RE =
  /\b(how much (?:can i|to|should i) risk|risk safely|safe risk|position siz\w*|contracts?|mnq|nq|mes|es|loss limit|drawdown|losing streak|max(?:imum)? (?:longest )?losing|stop loss|stop size)\b/i;

export const GREETING_QUERY_RE =
  /^\s*(?:hi|hello|hey|hola|yo|sup|gm|good\s*(?:morning|afternoon|evening|night)|morning|afternoon|evening|hey\s+there|hi\s+there|what'?s\s+up|howdy)(?:\s+minato)?[!.?\s]*$/i;

export function getTimeOfDayGreetingContext(now = new Date(), traderName?: string | null) {
  const h = now.getHours();
  const name = traderName && traderName !== "Trader" ? traderName : null;
  if (h < 5) {
    return {
      period: "late_night",
      salutation: name ? `Hey ${name}` : "Hey there",
      vibe: "Warm, calm late-night / early-hours encouragement — remind them that rest, patience, and mental clarity are part of their edge.",
    };
  }
  if (h < 12) {
    return {
      period: "morning",
      salutation: name ? `Good morning, ${name}` : "Good morning",
      vibe: "Warm, energizing morning motivation — fresh session, clean slate, waiting calmly for their A+ setup and trusting their process.",
    };
  }
  if (h < 17) {
    return {
      period: "afternoon",
      salutation: name ? `Good afternoon, ${name}` : "Good afternoon",
      vibe: "Friendly, steady afternoon encouragement — staying composed, protecting focus, and choosing quality over forcing trades.",
    };
  }
  if (h < 21) {
    return {
      period: "evening",
      salutation: name ? `Good evening, ${name}` : "Good evening",
      vibe: "Warm, reflective evening encouragement — unwinding from the charts, reviewing with a clear head, and building consistency day by day.",
    };
  }
  return {
    period: "night",
    salutation: name ? `Good evening, ${name}` : "Good evening",
    vibe: "Warm, supportive night check-in — proud of showing up with discipline, recharging well so tomorrow's mind is sharp.",
  };
}

export async function buildBrief(opts: {
  db: TraderDatabaseContext;
  clock: MarketClock;
  knowledge: KnowledgeStore;
  clientBeliefs: { say: string }[];
  question?: string;
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

  const isGreeting = !!(opts.question && GREETING_QUERY_RE.test(opts.question));
  const greetingContext = getTimeOfDayGreetingContext(new Date(), db.traderName);

  // Pre-compute riskProfile when the question asks about safe risk, position sizing, loss limits, or streaks
  // so the model has all exact risk ceilings ($67.14, $58.75, daily loss limit, MNQ/NQ contract sizing) in Round 1
  // without burning multiple slow tool-call round-trips.
  const precomputedRisk = opts.question && RISK_QUERY_RE.test(opts.question)
    ? riskProfile(db, {})
    : null;

  const brief = dropEmpty({
    now: { date: db.today, weekday: clock.weekday, newYorkTime: clock.time, market: clock.summary },
    timeOfDay: greetingContext,
    ...(isGreeting
      ? {
          greetingTurn: {
            isPureGreeting: true,
            ...greetingContext,
            instruction:
              "Reply with a warm, friendly, genuinely motivating greeting matched to the time of day using the trader's first name. Do NOT cite account balances, targets, drawdown numbers, or trade P&L in a greeting.",
          },
        }
      : {}),
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
    ...(precomputedRisk ? { riskProfile: precomputedRisk } : {}),
    rememberedNotes: insights.map((s) => ({ id: s.id, kind: s.kind, note: s.content, lastConfirmed: s.lastSeen.slice(0, 10), asOfData: s.asOf })),
    localBeliefs: opts.clientBeliefs.slice(0, 6).map((b) => b.say),
  }) as Record<string, unknown>;
  return { brief, insights };
}
