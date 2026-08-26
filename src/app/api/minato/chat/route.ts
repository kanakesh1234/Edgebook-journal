import { NextResponse } from "next/server";
import { getGoogleConfig } from "@/lib/server/google-config";
import { APP_SESSION_COOKIE, openAppSession, readCookie } from "@/lib/server/session";
import { accountRefreshToken, getAccount } from "@/lib/server/accounts";
import { decryptToken } from "@/lib/server/tokens";
import { fetchAccessToken, readJournalDoc } from "@/lib/server/drive";
import { computeStats } from "@/lib/stats";
import { holdTimeStats, formatHold } from "@/lib/holdtime";
import { detectPatterns, matchPlanToPatterns } from "@/lib/minato/patterns";
import { respond, greet, type MinatoMessage } from "@/lib/minato/respond";
import { processScore } from "@/lib/competence";
import { getOpenRouterConfig, type OpenRouterConfig } from "@/lib/services/ai";

export const dynamic = "force-dynamic";

const WINDOW_MS = 60 * 60 * 1000;
const MAX_CALLS_PER_WINDOW = 30;
const rateBuckets = new Map<string, number[]>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const bucket = (rateBuckets.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (bucket.length >= MAX_CALLS_PER_WINDOW) return true;
  bucket.push(now);
  rateBuckets.set(key, bucket);
  return false;
}

const SYSTEM_PROMPT = [
  "You are MINATO SENSEI, the EdgeBook trading-process companion.",
  "You are a calm, sharp, observant Telugu-English trading buddy/mentor.",
  "",
  "STRICT RULES:",
  "- Use ONLY the DETERMINISTIC FACTS provided below. Never invent trades, dates, statistics, patterns, P&L, or evidence.",
  "- If the facts don't contain the answer, say: \"I don't have enough recorded evidence to answer that yet.\"",
  "- Never give buy/sell signals, entry/exit recommendations, market predictions, probabilities, or guarantees.",
  "- Distinguish clearly: a winning trade with broken rules = process failure. A losing trade with clean rules = valid loss.",
  "- Challenge behavior, never the person. Be firm only about repeated rule breaks. Never insult.",
  "- If the trader's plan or reflection resembles a recorded pattern, mention it with the evidence count.",
  "- Reply in 1–4 sentences, natural Telugu-English mix (e.g. 'Bro, thesis clear ga undi. Ippudu wait cheyyi.').",
  "- Hold times and statistics come from the FACTS block verbatim when relevant.",
  "- If asked about hold times, quote the exact values from the hold block.",
  "- If asked about patterns, reference the patterns block with confidence level.",
  "- The trader's name is provided in the facts.",
].join("\n");

export async function POST(request: Request) {
  // Parse body first — local users send entries in the body
  const body = (await request.json().catch(() => ({}))) as {
    messages?: MinatoMessage[];
    entries?: Record<string, unknown>[];
  };
  const messages = body.messages ?? [];
  const clientEntries = body.entries ?? [];
  const question = [...messages].reverse().find((m) => m.role === "user")?.text ?? "";

  // Session resolution — Google session or local (client-provided entries)
  const config = getGoogleConfig();
  const cookie = readCookie(request, APP_SESSION_COOKIE);
  const session = config && cookie ? openAppSession(cookie, config.tokenSecret) : null;

  const traderName = session?.name.split(" ")[0] ?? "Trader";

  if (rateLimited(session?.email ?? "local")) {
    return NextResponse.json({ error: "rate_limited", text: "Easy bro — ask again in a bit." }, { status: 429 });
  }

  // ---- Load journal data ----
  // Google session → read from Drive (authoritative)
  // Local session → use client-provided entries
  let entries: Record<string, unknown>[] = clientEntries;
  if (session) {
    const account = getAccount(session.email);
    const secret = process.env.GOOGLE_TOKEN_SECRET ?? config?.clientSecret ?? "";
    const refreshToken = account ? accountRefreshToken(account, secret) : null;
    if (config && refreshToken && account?.folderId) {
      const accessToken = await fetchAccessToken(refreshToken, config.clientId, config.clientSecret);
      if (accessToken) {
        const doc = (await readJournalDoc(accessToken, {
          root: account.folderId, trades: account.folderId, journals: account.folderId,
          screenshots: account.folderId, challenges: account.folderId, exports: account.folderId,
        })) as { entries?: Record<string, unknown>[] } | null;
        entries = doc?.entries ?? entries;
      }
    }
  }

  if (entries.length === 0) {
    return NextResponse.json({ text: "Journal is empty bro — log or import a trade first and I'll have real data to work with." });
  }

  // ---- Deterministic facts (backend-computed, hallucination-proof) ----
  const stats = computeStats(entries as never, {
    traderName: traderName, startingEquity: 10000, targetEquity: 20000, maxDrawdown: 1000, currency: "USD",
  });
  const holds = holdTimeStats(entries as never);
  const patterns = detectPatterns(entries as never);
  const proc = processScore(entries as never, []);

  const concepts = [...new Set(
    (entries as { review?: { concepts?: { used?: string[] } } }[]).flatMap((e) => e.review?.concepts?.used ?? []),
  )];

  const plans = (entries as { planId?: string }[]).filter((e) => e.planId);
  const followedPlanCount = (entries as { planId?: string; review?: { outcome?: { followedPlan?: boolean } } }[])
    .filter((e) => e.planId && e.review?.outcome?.followedPlan === true).length;

  const facts = {
    trader: traderName,
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
      label: p.label, count: p.count, confidence: p.confidence, improving: p.improving,
      evidence: p.evidence.slice(0, 3).map((ev) => ({ date: ev.date, excerpt: ev.excerpt })),
    })),
    processScore: proc.score,
    reviewedCount: (entries as { reviewStatus?: string }[]).filter((e) => e.reviewStatus === "reviewed").length,
    conceptsUsed: concepts.slice(0, 10),
    planVsActual: plans.length > 0
      ? { linked: plans.length, followedPlanPct: plans.length > 0 ? Math.round((followedPlanCount / plans.length) * 100) : null }
      : null,
  };

  // ---- Deterministic answer path (always available) ----
  const deterministic = respond(
    {
      userFirstName: traderName,
      stats, discipline: { disciplineStreak: 0 } as never,
      adherence: {} as never, recentTrades: entries as never, focus: null, playbook: [], activeRules: [],
      recurringPatterns: patterns.map((p) => ({ pattern: p.label, count: p.count })),
      privacy: { includeNotes: true },
    },
    question || "how am i doing",
  );

  const greetingText = greet({
    userFirstName: traderName,
    stats, discipline: { disciplineStreak: 0 } as never,
    adherence: {} as never, recentTrades: entries as never, focus: null, playbook: [], activeRules: [],
    recurringPatterns: patterns.map((p) => ({ pattern: p.label, count: p.count })),
    privacy: { includeNotes: true },
  });

  // ---- LLM interpretation when configured ----
  const orConfig = getOpenRouterConfig();
  if (orConfig && entries.length > 0) {
    const text = await callOpenRouterWithFallback(orConfig, question, JSON.stringify(facts, null, 2));
    if (text) return NextResponse.json({ text, meta: { deterministic: false, provider: orConfig.model } });
  }

  const text = question ? deterministic : greetingText;
  return NextResponse.json({ text, meta: { deterministic: true, provider: "deterministic" } });
}

async function callOpenRouterWithFallback(
  config: OpenRouterConfig,
  question: string,
  factsJson: string,
): Promise<string | null> {
  const models = [config.model, ...(config.fallbackModel ? [config.fallbackModel] : [])];
  for (const model of models) {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
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
      if (!res.ok) continue;
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = json.choices?.[0]?.message?.content?.trim();
      if (text) return text;
    } catch {
      continue;
    }
  }
  return null;
}
