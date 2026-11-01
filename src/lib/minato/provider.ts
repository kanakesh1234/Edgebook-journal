/**
 * PROVIDER — the one place MINATO talks to the AI model.
 *
 * Before this file, three copies of "call OpenRouter" existed (chat route, lean lanes, services/ai.ts). All of them
 * treated every non-OK response as "try something else" and then silently fell through to a canned answer, so a
 * rate-limited free model looked exactly like MINATO "only knowing one answer".
 *
 * What this adds:
 *  - every attempt is recorded (model, outcome, HTTP status, milliseconds) — never the key, never the prompt
 *  - failures are classified: auth / credits / rate_limited / timeout / network / server / bad_request / bad_response / empty
 *  - 429 and 5xx get ONE short back-off retry on the same model before moving on (free tiers recover in seconds)
 *  - 401/403 stop immediately (every other model would fail with the same key)
 *  - a 400/422 caused by the optional `reasoning` parameter is retried once without it
 *  - a hard time budget: the caller never waits longer than `budgetMs`
 *  - server-side only: the API key never leaves this process and is never logged
 */
import type { OpenRouterConfig } from "@/lib/services/ai";

export type FailureKind =
  | "no_key" | "auth" | "credits" | "rate_limited" | "timeout" | "network"
  | "server" | "bad_request" | "bad_response" | "empty";

export interface Attempt {
  model: string;
  outcome: "ok" | FailureKind;
  status?: number;
  ms: number;
}

export interface ChatMessage { role: "system" | "user" | "assistant"; content: string }

export interface ModelResult {
  text: string | null;
  model: string | null;
  attempts: Attempt[];
  /** Why no text was produced (the last meaningful failure); null on success. */
  failure: FailureKind | null;
}

export interface CallOptions {
  config: Pick<OpenRouterConfig, "apiKey" | "model" | "models" | "fallbackModel">;
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  /** Ask for low reasoning effort on models that support it. Retried without on 400/422. */
  reasoning?: boolean;
  /** Total wall-clock budget across every attempt. */
  budgetMs?: number;
  /** Cap for a single HTTP call. */
  perCallMs?: number;
  /** Max models to try. */
  maxModels?: number;
  /** Test seams. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const MIN_REMAINING_MS = 2_000;
const RETRY_BACKOFF_MS = 700;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function classifyStatus(status: number): FailureKind {
  if (status === 401 || status === 403) return "auth";
  if (status === 402) return "credits";
  if (status === 408) return "timeout";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server";
  return "bad_request";
}

/** OpenRouter sometimes returns HTTP 200 with `{ error: { code } }`. Map it onto the same kinds. */
function classifyBodyError(err: unknown): FailureKind {
  const code = typeof err === "object" && err ? Number((err as { code?: unknown }).code) : NaN;
  return Number.isFinite(code) ? classifyStatus(code) : "server";
}

const isTransient = (k: FailureKind) => k === "rate_limited" || k === "server" || k === "network";

export async function callChat(opts: CallOptions): Promise<ModelResult> {
  const attempts: Attempt[] = [];
  const doFetch = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;

  if (!opts.config.apiKey) return { text: null, model: null, attempts, failure: "no_key" };

  const models = [...new Set(
    (opts.config.models ?? [opts.config.model, ...(opts.config.fallbackModel ? [opts.config.fallbackModel] : [])]).filter(Boolean),
  )].slice(0, opts.maxModels ?? 4);

  const deadline = now() + (opts.budgetMs ?? 40_000);
  let lastFailure: FailureKind | null = null;

  for (const model of models) {
    let useReasoning = !!opts.reasoning;
    let transientRetried = false;

    // A model gets at most: first try, one retry without `reasoning`, one back-off retry for transient errors.
    for (let tries = 0; tries < 3; tries++) {
      const remaining = deadline - now();
      if (remaining < MIN_REMAINING_MS) return { text: null, model: null, attempts, failure: lastFailure ?? "timeout" };

      const started = now();
      const record = (outcome: Attempt["outcome"], status?: number) =>
        attempts.push({ model, outcome, status, ms: Math.max(0, now() - started) });

      let kind: FailureKind | null = null;
      let status: number | undefined;
      try {
        const res = await doFetch(ENDPOINT, {
          method: "POST",
          headers: { Authorization: `Bearer ${opts.config.apiKey}`, "Content-Type": "application/json", "X-Title": "EdgeBook" },
          body: JSON.stringify({
            model,
            max_tokens: opts.maxTokens,
            ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
            ...(useReasoning ? { reasoning: { effort: "low" } } : {}),
            messages: opts.messages,
          }),
          signal: AbortSignal.timeout(Math.min(opts.perCallMs ?? 28_000, remaining)),
        });
        status = res.status;
        if (!res.ok) {
          kind = classifyStatus(res.status);
        } else {
          let json: { choices?: { message?: { content?: string | null } }[]; error?: unknown } | null = null;
          try { json = await res.json(); } catch { kind = "bad_response"; }
          if (!kind && json) {
            if (json.error) kind = classifyBodyError(json.error);
            else {
              const text = json.choices?.[0]?.message?.content;
              if (typeof text === "string" && text.trim()) {
                record("ok", res.status);
                return { text: text.trim(), model, attempts, failure: null };
              }
              kind = "empty";
            }
          }
        }
      } catch (e) {
        const name = (e as { name?: string } | null)?.name;
        kind = name === "TimeoutError" || name === "AbortError" ? "timeout" : "network";
      }

      record(kind!, status);
      lastFailure = kind!;

      if (kind === "auth") return { text: null, model: null, attempts, failure: "auth" }; // same key for every model
      if (kind === "bad_request" && useReasoning) { useReasoning = false; continue; }
      if (isTransient(kind!) && !transientRetried) {
        transientRetried = true;
        if (deadline - now() > RETRY_BACKOFF_MS + MIN_REMAINING_MS) { await sleep(RETRY_BACKOFF_MS); continue; }
      }
      break; // next model
    }
  }
  return { text: null, model: null, attempts, failure: lastFailure ?? "empty" };
}

/** Compact, secret-free summary for logs and `meta.diagnostics`. */
export function summarizeAttempts(attempts: Attempt[]): string {
  return attempts.map((a) => `${a.model}:${a.outcome}${a.status ? `(${a.status})` : ""}`).join(" → ") || "no attempts";
}

/** Human wording for the one place a trader may see it (the honest-fallback message). */
export function failureWording(kind: FailureKind | null): string {
  switch (kind) {
    case "no_key": return "isn't configured on the server";
    case "auth": return "rejected the server's credentials";
    case "credits": return "is out of credits";
    case "rate_limited": return "is rate-limited right now";
    case "timeout": return "timed out";
    case "network": return "couldn't be reached";
    case "server": return "returned a server error";
    case "bad_response": return "sent back something unreadable";
    case "empty": return "returned an empty answer";
    default: return "didn't respond";
  }
}

/** Server log line. Never includes keys, prompts or journal data. */
export function logModelFailure(tag: string, r: ModelResult): void {
  if (r.text) return;
  console.warn(`[minato:${tag}] model unavailable (${r.failure ?? "unknown"}): ${summarizeAttempts(r.attempts)}`);
}
