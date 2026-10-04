import { NextResponse } from "next/server";
import { getGoogleConfig } from "@/lib/server/google-config";
import { APP_SESSION_COOKIE, openAppSession, readCookie } from "@/lib/server/session";
import { getOpenRouterConfig } from "@/lib/services/ai";
import { buildAiPrompt, parseJsonLoose, validateAiBatch, type EvidenceTrade } from "@/lib/practice/ai-validate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WINDOW_MS = 5 * 60_000;
const MAX_CALLS = 10;
const calls = new Map<string, number[]>();

function limited(key: string): boolean {
  const now = Date.now();
  const recent = (calls.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_CALLS) { calls.set(key, recent); return true; }
  recent.push(now);
  calls.set(key, recent);
  if (calls.size > 500) for (const [k, v] of calls) if (!v.some((t) => now - t < WINDOW_MS)) calls.delete(k);
  return false;
}

function cleanTrade(value: unknown): EvidenceTrade | null {
  if (!value || typeof value !== "object") return null;
  const t = value as Record<string, unknown>;
  if (typeof t.id !== "string" || typeof t.label !== "string" || typeof t.date !== "string" || typeof t.pnl !== "number" || !Number.isFinite(t.pnl)) return null;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return {
    id: t.id.slice(0, 80), label: t.label.slice(0, 120), date: t.date.slice(0, 10), pnl: t.pnl,
    instrument: text(t.instrument, 20), direction: text(t.direction, 10) ?? null, setup: text(t.setup, 80),
    rr: num(t.rr), entryTime: text(t.entryTime, 8), exitTime: text(t.exitTime, 8),
    entryPrice: num(t.entryPrice), exitPrice: num(t.exitPrice), stopLoss: num(t.stopLoss), takeProfit: num(t.takeProfit), quantity: num(t.quantity),
    notes: text(t.notes, 700), lesson: text(t.lesson, 350), mistake: text(t.mistake, 350),
    followedPlan: typeof t.followedPlan === "boolean" ? t.followedPlan : null,
  };
}

async function callModel(apiKey: string, model: string, system: string, user: string, signal: AbortSignal): Promise<string | null> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 2800, temperature: 0.8, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? null;
}

export async function POST(request: Request) {
  const google = getGoogleConfig();
  const cookie = readCookie(request, APP_SESSION_COOKIE);
  const session = google && cookie ? openAppSession(cookie, google.tokenSecret) : null;
  if (!session) return NextResponse.json({ questions: [], source: "local", reason: "Sign in to use AI questions." }, { status: 401 });
  if (limited(session.email)) return NextResponse.json({ questions: [], source: "local", reason: "AI question limit reached — try again in a few minutes." }, { status: 429 });

  const config = getOpenRouterConfig();
  if (!config) return NextResponse.json({ questions: [], source: "local", reason: "AI key is not configured." });

  const body = (await request.json().catch(() => ({}))) as { mode?: unknown; level?: unknown; count?: unknown; trades?: unknown; avoid?: unknown; weakTags?: unknown };
  const trades = (Array.isArray(body.trades) ? body.trades : []).map(cleanTrade).filter((t): t is EvidenceTrade => t != null).slice(0, 12);
  if (!trades.length) return NextResponse.json({ questions: [], source: "local", reason: "No trades supplied." });
  const level = Math.min(4, Math.max(1, Math.round(Number(body.level) || 1)));
  const count = Math.min(16, Math.max(4, Math.round(Number(body.count) || 8)));
  const avoid = (Array.isArray(body.avoid) ? body.avoid : []).filter((a): a is string => typeof a === "string").map((a) => a.slice(0, 200)).slice(-60);
  const weakTags = (Array.isArray(body.weakTags) ? body.weakTags : []).filter((a): a is string => typeof a === "string").slice(0, 6);
  const mode = typeof body.mode === "string" ? body.mode.slice(0, 20) : "matrix";

  const { system, user } = buildAiPrompt({ mode, level, count: count + 4, trades, avoid, weakTags });
  const models = [config.model, ...(config.fallbackModel ? [config.fallbackModel] : [])];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 40_000);
  try {
    for (const model of models) {
      try {
        const text = await callModel(config.apiKey, model, system, user, controller.signal);
        if (!text) continue;
        const questions = validateAiBatch(parseJsonLoose(text), trades, avoid, count);
        if (questions.length) return NextResponse.json({ questions, source: "ai", model });
      } catch {
        if (controller.signal.aborted) break;
      }
    }
  } finally {
    clearTimeout(timer);
  }
  return NextResponse.json({ questions: [], source: "local", reason: "AI returned nothing usable; local questions were used." });
}
