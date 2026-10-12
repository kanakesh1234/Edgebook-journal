import { NextResponse } from "next/server";
import { getOpenRouterConfig } from "@/lib/services/ai";
import { rateLimited, sessionEmail } from "@/lib/server/auth";
import { getGoogleConfig } from "@/lib/server/google-config";
import { readModelAnswer, sanitizeBundle, systemPrompt, userPayload, type ModelRun } from "@/lib/tagging/prompt";
import type { TagBundle } from "@/lib/tagging/evidence";

export const dynamic = "force-dynamic";

/**
 * Reads ONE trade's whole record and returns each model's grounded answer.
 *
 * Two differences from a plain "ask the model" route:
 *   1. The primary and the fallback model are BOTH asked, in parallel. Two models agreeing is a far better signal than
 *      one model's self-reported confidence — the fallback is not just a spare tyre.
 *   2. Every quote a model offers is checked against the trader's real words before it is returned. A tag without a
 *      verifiable quote never leaves this route.
 *
 * The route returns RUNS, not a verdict. The decision (what is filed, what is only suggested) is made by lib/tagging/policy.ts
 * together with the offline rules and the measured facts, so it can be tested without a network.
 */
async function ask(model: string, apiKey: string, bundle: TagBundle): Promise<ModelRun | null> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    signal: AbortSignal.timeout(14_000),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model, temperature: 0, max_tokens: 500, response_format: { type: "json_object" },
      messages: [{ role: "system", content: systemPrompt() }, { role: "user", content: userPayload(bundle) }],
    }),
  });
  if (!res.ok) return null;
  const payload = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return readModelAnswer(model, payload.choices?.[0]?.message?.content ?? "", bundle);
}

export async function POST(request: Request) {
  const me = sessionEmail(request);
  if (getGoogleConfig() && !me) return NextResponse.json({ error: "Sign in to use AI tagging." }, { status: 401 });
  if (rateLimited(`tag-trade:${me ?? "local"}`, 24, 5 * 60_000)) return NextResponse.json({ error: "Too many requests." }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as { bundle?: unknown };
  const bundle = sanitizeBundle(body.bundle);
  if (!bundle || (bundle.sources.length === 0 && bundle.facts.length === 0)) return NextResponse.json({ error: "Bad request." }, { status: 400 });

  const config = getOpenRouterConfig();
  if (!config) return NextResponse.json({ runs: [], source: "none" });

  const models = [...new Set([config.model, config.fallbackModel].filter((m): m is string => !!m))];
  const settled = await Promise.allSettled(models.map((m) => ask(m, config.apiKey, bundle)));
  const runs = settled.flatMap((r) => (r.status === "fulfilled" && r.value ? [r.value] : []));
  return NextResponse.json({ runs, source: runs.length > 0 ? "ai" : "none" });
}
