/**
 * LLM CLIENT — the single place MINATO's reasoning engine is called.
 *
 * OpenAI-compatible chat completions (OpenRouter by default). Server-side only: the key is read from the
 * environment, sent only as the Authorization header, and never logged or returned.
 *
 *  - Native tool calling (`tools`, `tool_choice`) with streamed assembly of tool-call fragments
 *  - Real token streaming (SSE) with first-byte and idle watchdogs, so a stalled upstream cannot hang a request
 *  - Model fallback chain, sticky within a turn; one back-off retry for 429/5xx/network on each model
 *  - 400/404 handling: a model that no longer exists (404 / "no endpoints") is skipped; otherwise retry without
 *    `reasoning`, lower `max_tokens` if the provider says it is too large, then report `toolsRejected` so the loop
 *    can switch to its text-tool protocol rather than failing the trader's question
 *  - Self-healing model list: free-tier slugs rotate and die without notice. The chain always ends with OpenRouter's
 *    own `openrouter/free` router, and if every model is rejected the live catalogue is asked for free models that
 *    support tools (cached) and those are tried before giving up
 *  - A hard wall-clock deadline across every attempt; the caller's AbortSignal cancels in-flight calls
 */
import { getOpenRouterConfig } from "@/lib/services/ai";
import { classifyStatus, type Attempt, type FailureKind } from "../provider";

export type CompletionFailure = FailureKind | "aborted";

export interface LlmConfig {
  apiKey: string;
  models: string[];
  endpoint: string;
  maxOutputTokens: number;
  temperature: number;
  reasoningEffort: "low" | "medium" | "high" | null;
  /** Ask the provider's live catalogue for working free tool-capable models when every configured one is rejected. */
  discover?: boolean;
  /** Catalogue URL (defaults to OpenRouter's public models endpoint). */
  modelsEndpoint?: string;
}

export interface WireToolCall { id: string; type: "function"; function: { name: string; arguments: string } }
export interface WireMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: WireToolCall[];
  tool_call_id?: string;
}
export interface ToolSpec { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } }
export interface ToolCallOut { id: string; name: string; arguments: string }

export interface CompletionOptions {
  config: LlmConfig;
  messages: WireMessage[];
  tools?: ToolSpec[];
  toolChoice?: "auto" | "none";
  stream?: boolean;
  /** Raw content deltas, as the model produces them (the caller filters markup). */
  onContent?: (delta: string) => void;
  /** An attempt that already streamed content failed; the caller must discard what it showed. */
  onReset?: () => void;
  signal?: AbortSignal;
  /** Epoch ms after which no new attempt starts. */
  deadline: number;
  maxTokens?: number;
  temperature?: number;
  preferModel?: string | null;
  /** Per-HTTP-call ceiling, first-byte and idle limits (ms). */
  perCallMs?: number;
  firstByteMs?: number;
  idleMs?: number;
  /** Test seams. */
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export type CompletionResult =
  | { ok: true; content: string; toolCalls: ToolCallOut[]; finish: string | null; model: string; attempts: Attempt[] }
  | { ok: false; failure: CompletionFailure; attempts: Attempt[]; toolsRejected?: boolean; detail?: string };

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const MIN_REMAINING_MS = 1_500;

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

/** Slugs that are known to be retired. Using one only wastes a round trip and (before this fix) broke tool calling. */
const DEAD_MODELS = new Set(["z-ai/glm-5.2:free"]);
/** OpenRouter's own router over the currently-live free models; it picks one that supports what the request needs. */
export const FREE_ROUTER = "openrouter/free";

export function cleanModelList(models: (string | undefined | null)[]): string[] {
  const out: string[] = [];
  for (const raw of models) {
    const m = (raw ?? "").trim();
    if (m && !DEAD_MODELS.has(m) && !out.includes(m)) out.push(m);
  }
  return out;
}

const isFreeTier = (m: string) => m === FREE_ROUTER || m.endsWith(":free") || m.startsWith("stealth/");

export function getAgentLlmConfig(env: NodeJS.ProcessEnv = process.env): LlmConfig | null {
  const base = getOpenRouterConfig();
  if (!base) return null;
  const override = cleanModelList((env.MINATO_MODELS ?? "").split(","));
  // An explicitly chosen model is never silently diluted with the free-tier fallbacks of the old chain:
  // with MINATO_MODEL set, only it (and MINATO_FALLBACK_MODEL, if given) is used.
  const chosen = cleanModelList([env.MINATO_MODEL, env.MINATO_FALLBACK_MODEL]);
  const picked = override.length ? override : chosen.length ? chosen : cleanModelList(base.models);
  // …except that a chain made ONLY of free-tier models gets OpenRouter's own free router as a last resort and live
  // discovery: free slugs get retired without notice, and one dead slug must never silence Minato. A paid chain is
  // left exactly as configured — it never quietly degrades to a free model.
  const freeOnly = picked.every(isFreeTier);
  const models = (freeOnly ? cleanModelList([...picked, FREE_ROUTER]) : picked).slice(0, 8);
  const tokens = Number(env.MINATO_MAX_OUTPUT_TOKENS);
  const effort = (env.MINATO_REASONING_EFFORT ?? "").toLowerCase();
  const endpoint = env.MINATO_LLM_ENDPOINT?.trim() || "https://openrouter.ai/api/v1/chat/completions";
  return {
    apiKey: base.apiKey,
    models,
    endpoint,
    maxOutputTokens: Number.isFinite(tokens) && tokens >= 512 ? Math.min(64_000, Math.round(tokens)) : 8_000,
    temperature: 0.3,
    reasoningEffort: effort === "low" || effort === "medium" || effort === "high" ? effort : null,
    discover: freeOnly && (env.MINATO_DISCOVER_MODELS ?? "").toLowerCase() !== "off" && /openrouter\.ai/.test(endpoint),
    modelsEndpoint: endpoint.replace(/\/chat\/completions\/?$/, "/models"),
  };
}

/* ------------------------------------------------------------------ */
/*  Live catalogue — which free models exist right now                  */
/* ------------------------------------------------------------------ */

interface CatalogueModel { id?: string; context_length?: number; pricing?: { prompt?: string | number; completion?: string | number }; supported_parameters?: string[]; expiration_date?: string | null }
let catalogueCache: { at: number; ids: string[] } | null = null;
const CATALOGUE_TTL_MS = 30 * 60_000;

/** Pure: pick free models that support tool calling, biggest context first. */
export function pickFreeToolModels(list: CatalogueModel[], exclude: string[] = [], limit = 3, today = new Date()): string[] {
  const isFree = (m: CatalogueModel) => Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0;
  const live = (m: CatalogueModel) => !m.expiration_date || new Date(m.expiration_date).getTime() > today.getTime() + 86_400_000;
  return list
    .filter((m): m is CatalogueModel & { id: string } => typeof m.id === "string" && m.id !== FREE_ROUTER && !exclude.includes(m.id))
    .filter((m) => isFree(m) && live(m) && (m.supported_parameters ?? []).includes("tools"))
    .filter((m) => (m.context_length ?? 0) >= 16_000)
    .sort((a, b) => (b.context_length ?? 0) - (a.context_length ?? 0))
    .slice(0, limit)
    .map((m) => m.id);
}

async function discoverFreeToolModels(o: CompletionOptions, exclude: string[]): Promise<string[]> {
  const now = (o.now ?? Date.now)();
  if (catalogueCache && now - catalogueCache.at < CATALOGUE_TTL_MS) return catalogueCache.ids.filter((id) => !exclude.includes(id));
  try {
    const res = await (o.fetchImpl ?? fetch)(o.config.modelsEndpoint ?? "https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(6_000) });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: CatalogueModel[] };
    const ids = pickFreeToolModels(Array.isArray(json.data) ? json.data : [], [], 6);
    catalogueCache = { at: now, ids };
    return ids.filter((id) => !exclude.includes(id));
  } catch { return []; }
}
export function _resetCatalogue(): void { catalogueCache = null; }

/* ------------------------------------------------------------------ */
/*  One HTTP attempt                                                   */
/* ------------------------------------------------------------------ */

interface AttemptOutcome {
  kind: FailureKind | "aborted" | null;
  status?: number;
  content: string;
  toolCalls: ToolCallOut[];
  finish: string | null;
  emitted: number;
  /** Short, non-secret description of what the provider said (error body snippet). */
  detail?: string;
}

function snippetOf(v: unknown): string {
  try {
    const o = v as { message?: unknown; code?: unknown; error?: { message?: unknown } };
    const m = typeof o?.message === "string" ? o.message : typeof o?.error?.message === "string" ? o.error.message : JSON.stringify(v);
    return String(m).replace(/\s+/g, " ").replace(/sk-[A-Za-z0-9_-]{8,}/g, "sk-…").slice(0, 200);
  } catch { return ""; }
}
async function errorSnippet(res: Response): Promise<string> {
  try {
    const t = await res.text();
    try { return snippetOf((JSON.parse(t) as { error?: unknown }).error ?? JSON.parse(t)); } catch { return t.replace(/\s+/g, " ").slice(0, 200); }
  } catch { return ""; }
}

function bodyErrorKind(err: unknown): FailureKind {
  const code = typeof err === "object" && err ? Number((err as { code?: unknown }).code) : NaN;
  return Number.isFinite(code) ? classifyStatus(code) : "server";
}

async function oneAttempt(o: CompletionOptions, model: string, useReasoning: boolean, useTools: boolean, remainingMs: number): Promise<AttemptOutcome> {
  const doFetch = o.fetchImpl ?? fetch;
  const out: AttemptOutcome = { kind: null, content: "", toolCalls: [], finish: null, emitted: 0 };
  const ctl = new AbortController();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let timedOut = false;
  const arm = (ms: number) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timedOut = true; ctl.abort(); }, Math.max(500, ms));
  };
  const onAbort = () => ctl.abort();
  if (o.signal) {
    if (o.signal.aborted) return { ...out, kind: "aborted" };
    o.signal.addEventListener("abort", onAbort, { once: true });
  }
  const overall = Math.min(o.perCallMs ?? 28_000, remainingMs);
  const overallTimer = setTimeout(() => { timedOut = true; ctl.abort(); }, overall);
  arm(Math.min(o.firstByteMs ?? 18_000, overall));

  const streaming = o.stream !== false;
  try {
    const res = await doFetch(o.config.endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${o.config.apiKey}`, "Content-Type": "application/json", "X-Title": "EdgeBook MINATO" },
      body: JSON.stringify({
        model,
        max_tokens: o.maxTokens ?? o.config.maxOutputTokens,
        temperature: o.temperature ?? o.config.temperature,
        stream: streaming,
        ...(useReasoning && o.config.reasoningEffort ? { reasoning: { effort: o.config.reasoningEffort } } : {}),
        ...(useTools && o.tools?.length
          ? { tools: o.tools, tool_choice: o.toolChoice ?? "auto" }
          : {}),
        messages: o.messages,
      }),
      signal: ctl.signal,
    });
    out.status = res.status;
    if (!res.ok) {
      out.kind = classifyStatus(res.status);
      out.detail = await errorSnippet(res);
      return out;
    }

    if (!streaming || !res.body) {
      let json: { choices?: { message?: { content?: unknown; tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[] }; finish_reason?: string }[]; error?: unknown } | null = null;
      try { json = await res.json(); } catch { out.kind = "bad_response"; return out; }
      if (json?.error) { out.kind = bodyErrorKind(json.error); out.detail = snippetOf(json.error); return out; }
      const choice = json?.choices?.[0];
      const msg = choice?.message;
      out.content = typeof msg?.content === "string" ? msg.content : "";
      out.finish = choice?.finish_reason ?? null;
      for (const tc of msg?.tool_calls ?? []) {
        if (tc?.function?.name) out.toolCalls.push({ id: tc.id || `call_${out.toolCalls.length + 1}`, name: tc.function.name, arguments: tc.function.arguments ?? "" });
      }
      if (out.content && o.onContent) { o.onContent(out.content); out.emitted += out.content.length; }
      if (!out.content.trim() && out.toolCalls.length === 0) out.kind = "empty";
      return out;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let pending = "";
    const calls = new Map<number, ToolCallOut>();
    let done = false;
    const handleLine = (line: string) => {
      if (!line || line.startsWith(":")) return;
      if (!line.startsWith("data:")) return;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") { done = true; return; }
      let evt: {
        error?: unknown;
        choices?: { delta?: { content?: unknown; tool_calls?: { index?: number; id?: string; function?: { name?: string; arguments?: string } }[] }; finish_reason?: string | null }[];
      };
      try { evt = JSON.parse(payload); } catch { return; }
      if (evt.error) { out.kind = bodyErrorKind(evt.error); out.detail = snippetOf(evt.error); done = true; return; }
      const ch = evt.choices?.[0];
      if (!ch) return;
      const d = ch.delta;
      if (typeof d?.content === "string" && d.content) {
        out.content += d.content;
        o.onContent?.(d.content);
        out.emitted += d.content.length;
      }
      for (const tc of d?.tool_calls ?? []) {
        const idx = typeof tc.index === "number" ? tc.index : 0;
        const cur = calls.get(idx) ?? { id: "", name: "", arguments: "" };
        if (tc.id && !cur.id) cur.id = tc.id;
        if (tc.function?.name && !cur.name) cur.name = tc.function.name;
        if (typeof tc.function?.arguments === "string") cur.arguments += tc.function.arguments;
        calls.set(idx, cur);
      }
      if (ch.finish_reason) {
        out.finish = ch.finish_reason;
        if (ch.finish_reason === "error") out.kind = "server";
      }
    };

    while (!done) {
      const { value, done: rdDone } = await reader.read();
      if (rdDone) break;
      arm(o.idleMs ?? 25_000);
      pending += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = pending.indexOf("\n")) >= 0) {
        handleLine(pending.slice(0, nl).replace(/\r$/, "").trim());
        pending = pending.slice(nl + 1);
        if (done) break;
      }
    }
    if (pending.trim() && !done) handleLine(pending.trim());
    try { await reader.cancel(); } catch { /* already closed */ }

    out.toolCalls = [...calls.entries()].sort((a, b) => a[0] - b[0]).map(([i, c]) => ({ id: c.id || `call_${i + 1}`, name: c.name, arguments: c.arguments })).filter((c) => c.name);
    if (!out.kind && !out.content.trim() && out.toolCalls.length === 0) out.kind = "empty";
    return out;
  } catch (e) {
    const name = (e as { name?: string } | null)?.name;
    if (o.signal?.aborted) out.kind = "aborted";
    else if (timedOut || name === "TimeoutError") out.kind = "timeout";
    else if (name === "AbortError") out.kind = "timeout";
    else out.kind = "network";
    return out;
  } finally {
    if (timer) clearTimeout(timer);
    clearTimeout(overallTimer);
    o.signal?.removeEventListener("abort", onAbort);
  }
}

/* ------------------------------------------------------------------ */
/*  Completion with fallbacks                                          */
/* ------------------------------------------------------------------ */

/** The provider says this model id does not exist / has no live endpoint — skip it, it is not a tools problem. */
export function looksLikeDeadModel(status: number | undefined, detail: string | undefined): boolean {
  if (status === 404) return true;
  return /no endpoints found|not a valid model|model.{0,40}(not found|does not exist|is not available|unavailable|deprecated|retired|no longer)|no allowed providers/i.test(detail ?? "");
}
/** The provider says the requested output budget is larger than the model allows. */
export function looksLikeTokenLimit(detail: string | undefined): boolean {
  return /max[_ ]?tokens|maximum context|context length|too many tokens|exceeds? the (model|context)|output (token )?limit/i.test(detail ?? "");
}

export async function complete(o: CompletionOptions): Promise<CompletionResult> {
  const now = o.now ?? Date.now;
  const sleep = o.sleep ?? defaultSleep;
  const attempts: Attempt[] = [];
  const preferred = o.preferModel && o.config.models.includes(o.preferModel) ? o.preferModel : null;
  const configured = [...new Set([...(preferred ? [preferred] : []), ...o.config.models])].slice(0, 8);
  let lastFailure: CompletionFailure = "empty";
  let toolsRejected = false;
  let lastDetail: string | undefined;
  let outputCap = o.maxTokens ?? o.config.maxOutputTokens;
  // Tools stay declared even with tool_choice "none": providers require them while the history contains tool calls.
  const wantTools = !!(o.tools && o.tools.length > 0);

  const tryModels = async (models: string[]): Promise<CompletionResult | null> => {
    for (const model of models) {
      let useReasoning = !!o.config.reasoningEffort;
      let useTools = wantTools;
      let transientRetries = 0;
      let cappedOnce = false;

      for (let tries = 0; tries < 5; tries++) {
        const remaining = o.deadline - now();
        if (remaining < MIN_REMAINING_MS) return { ok: false, failure: lastFailure === "empty" ? "timeout" : lastFailure, attempts, detail: lastDetail, ...(toolsRejected ? { toolsRejected } : {}) };
        if (o.signal?.aborted) return { ok: false, failure: "aborted", attempts };

        const started = now();
        const r = await oneAttempt({ ...o, maxTokens: outputCap }, model, useReasoning, useTools, remaining);
        const ms = Math.max(0, now() - started);

        if (!r.kind) {
          attempts.push({ model, outcome: "ok", status: r.status, ms });
          return { ok: true, content: r.content, toolCalls: r.toolCalls, finish: r.finish, model, attempts };
        }
        attempts.push({ model, outcome: r.kind === "aborted" ? "network" : r.kind, status: r.status, ms });
        lastFailure = r.kind;
        if (r.detail) lastDetail = `${model}: ${r.status ?? ""} ${r.detail}`.trim();
        if (r.emitted > 0) o.onReset?.();

        if (r.kind === "aborted") return { ok: false, failure: "aborted", attempts };
        if (r.kind === "auth") return { ok: false, failure: "auth", attempts };
        if (r.kind === "bad_request") {
          // 1. The model itself is gone: move on. This says nothing about whether tools work.
          if (looksLikeDeadModel(r.status, r.detail)) break;
          // 2. Asked for more output than this model can give: lower the cap once and retry the same model.
          if (!cappedOnce && looksLikeTokenLimit(r.detail) && outputCap > 2_048) { cappedOnce = true; outputCap = Math.max(1_024, Math.min(2_048, Math.floor(outputCap / 4))); continue; }
          // 3. Some models dislike `reasoning`; then some dislike `tools`.
          if (useReasoning) { useReasoning = false; continue; }
          if (useTools) { useTools = false; toolsRejected = true; break; } // let other models try native tools first
          break;
        }
        const transient = r.kind === "rate_limited" || r.kind === "server" || r.kind === "network" || r.kind === "timeout" || r.kind === "empty";
        if (transient && transientRetries < 1 && o.deadline - now() > 2_500 + 700) {
          transientRetries++;
          await sleep(r.kind === "rate_limited" ? 1_200 : 700);
          continue;
        }
        break; // next model
      }
    }
    return null;
  };

  const first = await tryModels(configured);
  if (first) return first;

  // Every configured model was rejected as unavailable/unsupported (not rate-limited or down): ask the provider what
  // is live right now and try a few of those, so a retired slug in the environment never silences Minato.
  const rejectedAll = attempts.length > 0 && attempts.every((a) => a.outcome === "bad_request" || a.outcome === "empty");
  if (o.config.discover && rejectedAll && o.deadline - now() > 8_000) {
    const extra = await discoverFreeToolModels(o, configured);
    if (extra.length) {
      const second = await tryModels(extra);
      if (second) return second;
    }
  }
  return { ok: false, failure: lastFailure, attempts, detail: lastDetail, ...(toolsRejected ? { toolsRejected } : {}) };
}

/* ------------------------------------------------------------------ */
/*  Diagnostics (no secrets, no prompts, no journal data)               */
/* ------------------------------------------------------------------ */

export function summarizeAttempts(attempts: Attempt[]): string {
  return attempts.map((a) => `${a.model}:${a.outcome}${a.status ? `(${a.status})` : ""}`).join(" → ") || "no attempts";
}

export function failureMessage(f: CompletionFailure): string {
  switch (f) {
    case "no_key": return "My reasoning engine isn't configured on the server yet.";
    case "auth": return "My reasoning engine rejected the server's credentials.";
    case "credits": return "My reasoning engine is out of credits right now.";
    case "rate_limited": return "My reasoning engine is rate-limited right now.";
    case "timeout": return "My reasoning engine took too long to answer.";
    case "network": return "I couldn't reach my reasoning engine.";
    case "server": return "My reasoning engine hit a server error.";
    case "aborted": return "The request was cancelled.";
    case "bad_request": return "My reasoning engine rejected the request — the configured model may be unavailable or not support this kind of request.";
    default: return "My reasoning engine returned an empty answer.";
  }
}
