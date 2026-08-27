import type { JournalEntry, JournalSettings, TradePlan, Challenge, PlaybookSetup } from "../types";
import type { JournalStats } from "../types";
import type { Violation } from "../rules";
import type { AdherenceSummary } from "../rules";
import type { DisciplineSummary } from "../discipline";
import type { EdgeBookContext } from "../minato/context";
import { respond, greet, type MinatoMessage } from "../minato/respond";
import { holdTimeStats, formatHold, type HoldStats } from "../holdtime";
import { detectPatterns, matchPlanToPatterns, type RecurringPattern } from "../minato/patterns";
import { processScore, type ProcessScore } from "../competence";

/* ------------------------------------------------------------------ */
/*  AiCoachProvider — the single integration seam for MINATO           */
/*                                                                      */
/*  Two implementations:                                                */
/*   1. DeterministicMinatoProvider — pure local logic, zero network    */
/*   2. OpenRouterMinatoProvider — LLM renders language over            */
/*      deterministic facts; falls back to #1 on any failure           */
/*                                                                      */
/*  The frontend never calls OpenRouter directly.                      */
/* ------------------------------------------------------------------ */

export interface CoachRequest {
  messages: MinatoMessage[];
  focusEntry?: JournalEntry | null;
}

export interface CoachReply {
  text: string;
  meta: {
    deterministic: boolean;
    visionSupported: boolean;
    provider: string;
  };
}

export interface AiCoachProvider {
  readonly id: string;
  readonly visionSupported: boolean;
  greeting(ctx: EdgeBookContext): string;
  reply(request: CoachRequest, ctx: EdgeBookContext): Promise<CoachReply>;
}

export class DeterministicMinatoProvider implements AiCoachProvider {
  readonly id = "minato-deterministic";
  readonly visionSupported = false;

  greeting(ctx: EdgeBookContext): string {
    return greet(ctx);
  }

  async reply(request: CoachRequest, ctx: EdgeBookContext): Promise<CoachReply> {
    const last = [...request.messages].reverse().find((m) => m.role === "user");
    const text = last ? respond(ctx, last.text) : respond(ctx, "how am i doing");
    return { text, meta: { deterministic: true, visionSupported: false, provider: "deterministic" } };
  }
}

/* ------------------------------------------------------------------ */
/*  Hold-time + enriched facts for the LLM prompt                      */
/* ------------------------------------------------------------------ */

export interface MinatoFacts {
  trades: number;
  totalPnl: number;
  winRatePct: number;
  avgDayPnl: number;
  drawdown: number;
  hold: {
    avgWin: string;
    avgLoss: string;
    medianWin: string;
    medianLoss: string;
    longestWin: string;
    shortestWin: string;
    longestLoss: string;
    shortestLoss: string;
    sample: number;
  };
  patterns: { label: string; count: number; confidence: string; improving: boolean; evidence: { date: string; excerpt: string }[] }[];
  processScore: number;
  reviewedCount: number;
  conceptsUsed: string[];
  planVsActual: { linked: number; followedPlan: number | null } | null;
  challengeProgress: { name: string; progressPct: number; currentDrawdown: number } | null;
}

export function buildFacts(entries: JournalEntry[], plans: TradePlan[], challenges: Challenge[]): MinatoFacts {
  const stats: JournalStats = computeStatsSafe(entries);
  const holds: HoldStats = holdTimeStats(entries);
  const patterns: RecurringPattern[] = detectPatterns(entries);
  const proc: ProcessScore = processScore(entries, plans);

  const conceptsUsed = [...new Set(
    entries.flatMap((e) => e.review?.concepts?.used ?? []),
  )];

  const linkedPlans = plans.filter((p) => p.status === "executed" && p.linkedTradeId);
  const linkedEntries = linkedPlans
    .map((p) => entries.find((e) => e.id === p.linkedTradeId))
    .filter((e): e is JournalEntry => !!e);
  const followedPlan = linkedEntries.filter(
    (e) => e.review?.outcome?.followedPlan === true,
  ).length;

  const challengeWithEntries = challenges.length > 0 ? challenges[0] : null;

  return {
    trades: stats.tradingDays,
    totalPnl: Math.round(stats.totalPnl),
    winRatePct: Math.round(stats.winRate * 100),
    avgDayPnl: Math.round(stats.avgDayPnl),
    drawdown: Math.round(stats.drawdown),
    hold: {
      avgWin: formatHold(holds.avgWinMin),
      avgLoss: formatHold(holds.avgLossMin),
      medianWin: formatHold(holds.medianWinMin),
      medianLoss: formatHold(holds.medianLossMin),
      longestWin: formatHold(holds.longestWinMin),
      shortestWin: formatHold(holds.shortestWinMin),
      longestLoss: formatHold(holds.longestLossMin),
      shortestLoss: formatHold(holds.shortestLossMin),
      sample: holds.sampleSize,
    },
    patterns: patterns.map((p) => ({
      label: p.label,
      count: p.count,
      confidence: p.confidence,
      improving: p.improving,
      evidence: p.evidence.slice(0, 3).map((ev) => ({ date: ev.date, excerpt: ev.excerpt })),
    })),
    processScore: proc.score,
    reviewedCount: entries.filter((e) => e.reviewStatus === "reviewed").length,
    conceptsUsed,
    planVsActual: linkedPlans.length > 0
      ? { linked: linkedPlans.length, followedPlan: linkedEntries.length > 0 ? Math.round((followedPlan / linkedEntries.length) * 100) : null }
      : null,
    challengeProgress: challengeWithEntries
      ? {
          name: challengeWithEntries.name,
          progressPct: stats.tradingDays > 0
            ? Math.min(100, Math.round((stats.totalPnl / Math.max(1, (challengeWithEntries.targetBalance ?? 1) - (challengeWithEntries.startingBalance ?? 1))) * 100))
            : 0,
          currentDrawdown: Math.round(stats.drawdown),
        }
      : null,
  };
}

function computeStatsSafe(entries: JournalEntry[]): JournalStats {
  // Inline a minimal stats computation to avoid circular import with stats.ts
  const totalPnl = entries.reduce((s, e) => s + e.pnl, 0);
  const wins = entries.filter((e) => e.pnl > 0).length;
  const losses = entries.filter((e) => e.pnl < 0).length;
  const decided = wins + losses;
  return {
    tradingDays: entries.length,
    totalPnl,
    winRate: decided > 0 ? wins / decided : 0,
    avgDayPnl: entries.length > 0 ? totalPnl / entries.length : 0,
    drawdown: 0,
  } as JournalStats;
}

/* ------------------------------------------------------------------ */
/*  OpenRouter provider                                                */
/* ------------------------------------------------------------------ */

export interface OpenRouterConfig {
  apiKey: string;
  model: string;
  fallbackModel?: string;
  visionModel?: string;
}

export function getOpenRouterConfig(): OpenRouterConfig | null {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;
  return {
    apiKey,
    model: process.env.MINATO_MODEL ?? "nvidia/nemotron-3-super-120b-a12b:free",
    fallbackModel: process.env.MINATO_FALLBACK_MODEL ?? "z-ai/glm-5.2:free",
    visionModel: process.env.MINATO_VISION_MODEL ?? "",
  };
}

const SYSTEM_PROMPT = [
  "You are MINATO SENSEI, the EdgeBook trading-process companion — an intelligent, calm trading partner.",
  "",
  "STRICT RULES:",
  "- Use ONLY the DETERMINISTIC FACTS provided below. Never invent trades, dates, statistics, patterns, P&L, or evidence.",
  "- ANALYZE the facts and draw conclusions; never merely repeat stored numbers back or say 'not enough information' without first computing what you can.",
  "- If the sample is genuinely too small for a conclusion, say so explicitly and state what you WOULD need.",
  "- Distinguish clearly: a winning trade with broken rules = process failure. A losing trade with clean rules = valid loss.",
  "- Never give buy/sell signals, entry/exit recommendations, market predictions, probabilities, or guarantees.",
  "- English only. No Telugu. Never call the user 'bro'. Challenge behavior, never the person.",
  "- STRUCTURE: when an analysis has multiple findings, use numbered points (1. 2. 3.) with short sub-bullets. Avoid paragraph walls.",
  "- End multi-point analyses with a short 'Conclusion' point stating the strongest finding and the sample size caveat.",
].join("\n");

export class OpenRouterMinatoProvider implements AiCoachProvider {
  readonly id = "minato-openrouter";
  private config: OpenRouterConfig;

  constructor(config: OpenRouterConfig) {
    this.config = config;
  }

  get visionSupported(): boolean {
    return !!this.config.visionModel;
  }

  greeting(ctx: EdgeBookContext): string {
    return greet(ctx);
  }

  async reply(request: CoachRequest, ctx: EdgeBookContext): Promise<CoachReply> {
    const last = [...request.messages].reverse().find((m) => m.role === "user");
    const question = last?.text ?? "how am i doing";

    const facts = buildMinatoFactsFromContext(ctx);
    const factsJson = JSON.stringify(facts, null, 2);

    try {
      const text = await this.callOpenRouter(question, factsJson);
      if (text) return { text, meta: { deterministic: false, visionSupported: this.visionSupported, provider: this.config.model } };
    } catch {
      // OpenRouter failed → deterministic fallback
    }

    // Deterministic fallback
    const fallback = new DeterministicMinatoProvider();
    return fallback.reply(request, ctx);
  }

  async callOpenRouter(question: string, factsJson: string): Promise<string | null> {
    const models = [this.config.model, ...(this.config.fallbackModel ? [this.config.fallbackModel] : [])];
    for (const model of models) {
      try {
        const text = await this.callModel(model, question, factsJson);
        if (text) return text;
      } catch {
        continue;
      }
    }
    return null;
  }

  private async callModel(model: string, question: string, factsJson: string): Promise<string | null> {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 300,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `DETERMINISTIC FACTS (source of truth):\n${factsJson}\n\nTRADER QUESTION: ${question}` },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return json.choices?.[0]?.message?.content?.trim() ?? null;
  }
}

/** Build enriched facts from the full EdgeBook context. */
function buildMinatoFactsFromContext(ctx: EdgeBookContext): MinatoFacts {
  const holds = holdTimeStats(ctx.recentTrades);
  const patterns = detectPatterns(ctx.recentTrades);
  const concepts = [...new Set(ctx.recentTrades.flatMap((e) => e.review?.concepts?.used ?? []))];
  const linkedPlans = ctx.recentTrades.filter((e) => e.planId);
  const followedPlan = linkedPlans.filter((e) => e.review?.outcome?.followedPlan === true).length;

  return {
    trades: ctx.stats.tradingDays,
    totalPnl: Math.round(ctx.stats.totalPnl),
    winRatePct: Math.round(ctx.stats.winRate * 100),
    avgDayPnl: Math.round(ctx.stats.avgDayPnl),
    drawdown: Math.round(ctx.stats.drawdown),
    hold: {
      avgWin: formatHold(holds.avgWinMin),
      avgLoss: formatHold(holds.avgLossMin),
      medianWin: formatHold(holds.medianWinMin),
      medianLoss: formatHold(holds.medianLossMin),
      longestWin: formatHold(holds.longestWinMin),
      shortestWin: formatHold(holds.shortestWinMin),
      longestLoss: formatHold(holds.longestLossMin),
      shortestLoss: formatHold(holds.shortestLossMin),
      sample: holds.sampleSize,
    },
    patterns: patterns.map((p) => ({
      label: p.label, count: p.count, confidence: p.confidence, improving: p.improving,
      evidence: p.evidence.slice(0, 3).map((ev) => ({ date: ev.date, excerpt: ev.excerpt })),
    })),
    processScore: ctx.stats.tradingDays > 0
      ? processScore(ctx.recentTrades, []).score
      : 0,
    reviewedCount: ctx.recentTrades.filter((e) => e.reviewStatus === "reviewed").length,
    conceptsUsed: concepts,
    planVsActual: linkedPlans.length > 0
      ? { linked: linkedPlans.length, followedPlan: linkedPlans.length > 0 ? Math.round((followedPlan / linkedPlans.length) * 100) : null }
      : null,
    challengeProgress: null,
  };
}

/** Single switch point — uses OpenRouter when configured, deterministic otherwise. */
export function resolveCoachProvider(_settings?: JournalSettings): AiCoachProvider {
  const orConfig = getOpenRouterConfig();
  if (orConfig) return new OpenRouterMinatoProvider(orConfig);
  return new DeterministicMinatoProvider();
}

/** Context type re-export for consumers. */
export type { EdgeBookContext, MinatoMessage, JournalStats, Violation, AdherenceSummary, DisciplineSummary, HoldStats, RecurringPattern, ProcessScore };
