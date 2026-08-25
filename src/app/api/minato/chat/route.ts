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

export const dynamic = "force-dynamic";

/* ------------------------------------------------------------------ */
/*  MINATO chat — server-side context, deterministic facts first.      */
/*                                                                      */
/*  Facts (hold times, stats, patterns) are computed HERE from the      */
/*  authenticated user's persisted journal — never by the LLM.          */
/*  If OPENROUTER_API_KEY is configured, the LLM renders natural        */
/*  language over the deterministic facts. Otherwise (or on any         */
/*  failure) the deterministic persona answers directly.               */
/*                                                                      */
/*  Rate limit: in-memory per session — MINATO is quiet by design.      */
/* ------------------------------------------------------------------ */

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

export async function POST(request: Request) {
  const config = getGoogleConfig();
  const cookie = readCookie(request, APP_SESSION_COOKIE);
  const session = config && cookie ? openAppSession(cookie, config.tokenSecret) : null;
  // Local-session users have no Google session cookie — the client falls back
  // to its deterministic provider, so this is a clean 200 (not an error).
  if (!session) {
    return NextResponse.json({ fallback: true, text: null });
  }

  const body = (await request.json().catch(() => ({}))) as { messages?: MinatoMessage[] };
  const messages = body.messages ?? [];
  const question = [...messages].reverse().find((m) => m.role === "user")?.text ?? "";

  if (rateLimited(session.email)) {
    return NextResponse.json({ error: "rate_limited", text: "Easy bro — ask again in a bit." }, { status: 429 });
  }

  // ---- Load the authenticated user's persisted journal (their Drive) ----
  const account = getAccount(session.email);
  const secret = process.env.GOOGLE_TOKEN_SECRET ?? config?.clientSecret ?? "";
  const refreshToken = account ? accountRefreshToken(account, secret) : null;
  let entries: Parameters<typeof computeStats>[0] = [];
  if (config && refreshToken && account?.folderId) {
    const accessToken = await fetchAccessToken(refreshToken, config.clientId, config.clientSecret);
    if (accessToken) {
      const doc = (await readJournalDoc(accessToken, {
        root: account.folderId, trades: account.folderId, journals: account.folderId,
        screenshots: account.folderId, challenges: account.folderId, exports: account.folderId,
      })) as { entries?: Parameters<typeof computeStats>[0] } | null;
      entries = doc?.entries ?? [];
    }
  }

  // ---- Deterministic facts (backend-computed, hallucination-proof) ----
  const stats = computeStats(entries, {
    traderName: session.name, startingEquity: 10000, targetEquity: 20000, maxDrawdown: 1000, currency: "USD",
  });
  const holds = holdTimeStats(entries);
  const patterns = detectPatterns(entries);
  const proc = processScore(entries, []);

  const facts = {
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
      shortestLoss: formatHold(holds.shortestLossMin),
      sample: holds.sampleSize,
    },
    patterns: patterns.map((p) => ({ label: p.label, count: p.count, confidence: p.confidence, improving: p.improving })),
    processScore: proc.score,
  };

  // ---- Deterministic answer path (always available) ----
  const deterministic = respond(
    {
      userFirstName: session.name.split(" ")[0],
      stats, discipline: { disciplineStreak: 0 } as never,
      adherence: {} as never, recentTrades: [], focus: null, playbook: [], activeRules: [],
      recurringPatterns: patterns.map((p) => ({ pattern: p.label, count: p.count })),
      privacy: { includeNotes: true },
    },
    question || "how am i doing",
  );

  // ---- LLM interpretation when configured ----
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.MINATO_MODEL ?? "openai/gpt-4o-mini";
  if (apiKey && entries.length > 0) {
    try {
      const system = [
        "You are MINATO SENSEI, a calm Telugu-English trading sensei inside the EdgeBook journal.",
        "Rules you must never break:",
        "- Use ONLY the DETERMINISTIC FACTS provided. Never invent trades, dates, statistics, patterns or P&L.",
        "- If the facts don't contain the answer, say you don't have enough recorded evidence.",
        "- Never give buy/sell signals, predictions, probabilities of market moves, or guarantees.",
        "- Challenge behavior, never the person. Be firm only about repeated rule breaks.",
        "- Reply in 1–4 sentences, natural Telugu-English mix (e.g. 'Bro, plan clear ga undi').",
        "- Hold times and statistics come from the FACTS block verbatim when relevant.",
        `- The trader's name is ${session.name.split(" ")[0]}.`,
      ].join("\n");
      const user = `DETERMINISTIC FACTS (source of truth):\n${JSON.stringify(facts)}\n\nTRADER QUESTION: ${question || "greet me"}`;
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          max_tokens: 300,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const text = json.choices?.[0]?.message?.content?.trim();
        if (text) return NextResponse.json({ text, meta: { deterministic: false, provider: model } });
      }
      // Non-OK → fall through to deterministic answer
    } catch {
      // fall through
    }
  }

  const text = question ? deterministic : greet({
    userFirstName: session.name.split(" ")[0], stats, discipline: { disciplineStreak: 0 } as never,
    adherence: {} as never, recentTrades: [], focus: null, playbook: [], activeRules: [],
    recurringPatterns: patterns.map((p) => ({ pattern: p.label, count: p.count })),
    privacy: { includeNotes: true },
  });

  return NextResponse.json({ text, meta: { deterministic: true, provider: "deterministic" } });
}
