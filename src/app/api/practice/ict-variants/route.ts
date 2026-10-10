import { NextResponse } from "next/server";
import { getGoogleConfig } from "@/lib/server/google-config";
import { APP_SESSION_COOKIE, openAppSession, readCookie } from "@/lib/server/session";
import { getOpenRouterConfig } from "@/lib/services/ai";
import { parseJsonLoose } from "@/lib/practice/ai-validate";
import { buildVariantPrompt, validateVariants, type VariantInputCard } from "@/lib/practice/ict-variants";

export const dynamic = "force-dynamic";
export const maxDuration = 45;

const WINDOW_MS = 5 * 60_000;
const MAX_CALLS = 30;
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

function cleanCard(value: unknown): VariantInputCard | null {
  if (!value || typeof value !== "object") return null;
  const c = value as Record<string, unknown>;
  const text = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
  const id = text(c.id, 80);
  const question = text(c.question, 600);
  const answer = text(c.answer, 400);
  if (!id || question.length < 4 || !answer) return null;
  return { id, question, answer, notes: text(c.notes, 300) || undefined };
}

async function callModel(apiKey: string, model: string, system: string, user: string, signal: AbortSignal): Promise<string | null> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal,
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, max_tokens: 3200, temperature: 0.6, messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return data.choices?.[0]?.message?.content ?? null;
}

export async function POST(request: Request) {
  const google = getGoogleConfig();
  const cookie = readCookie(request, APP_SESSION_COOKIE);
  const session = google && cookie ? openAppSession(cookie, google.tokenSecret) : null;
  if (!session) return NextResponse.json({ variants: [], reason: "Sign in to use AI question styles." }, { status: 401 });
  if (limited(session.email)) return NextResponse.json({ variants: [], reason: "AI limit reached — try again in a few minutes." }, { status: 429 });

  const config = getOpenRouterConfig();
  if (!config) return NextResponse.json({ variants: [], reason: "AI key is not configured." });

  const body = (await request.json().catch(() => ({}))) as { cards?: unknown };
  const cards = (Array.isArray(body.cards) ? body.cards : []).map(cleanCard).filter((c): c is VariantInputCard => c != null).slice(0, 6);
  if (!cards.length) return NextResponse.json({ variants: [], reason: "No cards supplied." });

  const { system, user } = buildVariantPrompt(cards);
  const models = [config.model, ...(config.fallbackModel ? [config.fallbackModel] : [])];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 38_000);
  try {
    for (const model of models) {
      try {
        const text = await callModel(config.apiKey, model, system, user, controller.signal);
        if (!text) continue;
        const valid = validateVariants(parseJsonLoose(text), cards);
        if (valid.size) return NextResponse.json({ variants: [...valid].map(([id, variants]) => ({ id, variants })), source: "ai" });
      } catch {
        if (controller.signal.aborted) break;
      }
    }
  } finally {
    clearTimeout(timer);
  }
  return NextResponse.json({ variants: [], reason: "AI returned nothing usable; simple question styles were used." });
}
