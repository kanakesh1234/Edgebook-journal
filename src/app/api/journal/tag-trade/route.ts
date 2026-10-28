import { NextResponse } from "next/server";
import { getOpenRouterConfig } from "@/lib/services/ai";
import { rateLimited, sessionEmail } from "@/lib/server/auth";
import { getGoogleConfig } from "@/lib/server/google-config";
import { readModelAnswer, sanitizeBundle, systemPrompt, userPayload, type ModelRun } from "@/lib/tagging/prompt";
import type { TagBundle } from "@/lib/tagging/evidence";
import { synthesizeBrainTagRun } from "@/lib/ai-brain";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUDGET_MS = 22_000;
const MAX_TOKENS = 2_000;

type ModelDiag = { model: string; ok: boolean; reason?: string; status?: number };
type Attempt = { run: ModelRun | null; status?: number; reason?: string; retryable?: boolean; plain?: boolean };

const reasonFor = (status: number, body: string): string => {
  if (status === 401 || status === 403) return "OpenRouter rejected the API key — check OPENROUTER_API_KEY.";
  if (status === 402) return "OpenRouter account has no credit for this model.";
  if (status === 404) return "The AI model name was not found.";
  if (status === 429) return "The free AI model is rate-limited right now.";
  if (status >= 500) return "The AI provider had a server error.";
  const msg = body.match(/"message"\s*:\s*"([^"]{1,140})/)?.[1];
  return msg ? `The AI provider refused the request: ${msg}` : `The AI provider refused the request (${status}).`;
};

async function attempt(model: string, apiKey: string, bundle: TagBundle, timeoutMs: number, plain: boolean): Promise<Attempt> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Title": "EdgeBook" },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: MAX_TOKENS,
        ...(plain ? {} : { response_format: { type: "json_object" }, reasoning: { effort: "low" } }),
        messages: [
          { role: "system", content: systemPrompt() },
          { role: "user", content: userPayload(bundle) },
        ],
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      return {
        run: null,
        status: res.status,
        reason: reasonFor(res.status, text),
        retryable: res.status === 429 || res.status >= 500,
        plain: res.status === 400 || res.status === 422,
      };
    }
    let payload: { choices?: { message?: { content?: string | null }; finish_reason?: string }[]; error?: { message?: string } };
    try {
      payload = JSON.parse(text);
    } catch {
      return { run: null, reason: "The AI provider sent an unreadable reply.", retryable: true };
    }
    if (payload.error) {
      return { run: null, reason: `The AI provider failed: ${String(payload.error.message ?? "unknown").slice(0, 120)}`, retryable: true };
    }
    const choice = payload.choices?.[0];
    const content = choice?.message?.content ?? "";
    if (!content.trim()) {
      return {
        run: null,
        reason: choice?.finish_reason === "length" ? "The AI model ran out of room before answering." : "The AI model returned an empty answer.",
        retryable: true,
      };
    }
    const run = readModelAnswer(model, content, bundle);
    return run ? { run } : { run: null, reason: "The AI model did not return valid JSON.", retryable: true };
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    return { run: null, reason: timedOut ? "The AI model took too long to answer." : "Could not reach OpenRouter (network error).", retryable: true };
  }
}

async function ask(model: string, apiKey: string, bundle: TagBundle): Promise<{ run: ModelRun | null; diag: ModelDiag }> {
  const started = Date.now();
  const left = () => Math.max(4_000, BUDGET_MS - (Date.now() - started));
  let plain = false;
  let last: Attempt = { run: null };
  for (let i = 0; i < 2; i++) {
    if (i > 0 && Date.now() - started > BUDGET_MS - 4_000) break;
    last = await attempt(model, apiKey, bundle, left(), plain);
    if (last.run) return { run: last.run, diag: { model, ok: true } };
    if (last.plain && !plain) {
      plain = true;
      continue;
    }
    if (last.retryable) {
      await new Promise((r) => setTimeout(r, 800));
      continue;
    }
    break;
  }
  return { run: null, diag: { model, ok: false, reason: last.reason, status: last.status } };
}

export async function POST(request: Request) {
  const me = sessionEmail(request);
  if (getGoogleConfig() && !me) {
    return NextResponse.json({ error: "Sign in to use AI tagging.", reason: "You are signed out — sign in again to use AI tagging." }, { status: 401 });
  }
  if (rateLimited(`tag-trade:${me ?? "local"}`, 90, 5 * 60_000)) {
    return NextResponse.json({ error: "Too many requests.", reason: "Too many AI checks in a short time — wait a few minutes." }, { status: 429 });
  }

  const body = (await request.json().catch(() => ({}))) as { bundle?: unknown };
  const bundle = sanitizeBundle(body.bundle);
  if (!bundle || (bundle.sources.length === 0 && bundle.facts.length === 0)) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  // Always compute the local grounded EdgeBook Brain voter so even if external free models rate-limit or time out,
  // the trader gets instant, verbatim-grounded AI tagging without "AI did not answer" errors.
  const brainRun = synthesizeBrainTagRun(bundle);

  const config = getOpenRouterConfig();
  if (!config) {
    return NextResponse.json({
      runs: [brainRun],
      source: "ai",
      diagnostics: [{ model: brainRun.model, ok: true }],
    });
  }

  const candidateModels = config.models.slice(0, 2);
  const results = await Promise.all(candidateModels.map((m) => ask(m, config.apiKey, bundle)));
  const externalRuns = results.flatMap((r) => (r.run ? [r.run] : []));
  const diagnostics = results.map((r) => r.diag);

  // Combine external LLM runs with the EdgeBook Brain voter if external models failed or returned no grounded tags
  const runs = externalRuns.length > 0 && externalRuns.some((r) => r.tags.length > 0)
    ? externalRuns
    : [...externalRuns, brainRun];

  return NextResponse.json({
    runs,
    source: "ai",
    diagnostics: [...diagnostics, { model: brainRun.model, ok: true }],
  });
}
