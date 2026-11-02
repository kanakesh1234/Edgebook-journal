/**
 * AGENT LOOP — the LLM decides; the backend retrieves; the LLM analyses; repeat only when needed.
 *
 *   question → model → (tool calls → validated backend retrieval → results back to model)* → final answer
 *
 * Hard bounds (all configurable, all enforced here):
 *   maxRounds · maxToolCalls · maxPerRound · wall-clock budget · context size · duplicate-call detection
 * When any bound is reached the model is told to answer from what it has gathered (tool_choice "none"),
 * so the trader gets an honest answer rather than a loop or an error.
 *
 * Only the FINAL answer is streamed to the trader. Tool rounds are silent: if a model writes text and then
 * calls a tool, that text is retracted (`onReset`) and never becomes part of the reply.
 */
import { complete, type CompletionResult, type LlmConfig, type ToolCallOut, type WireMessage } from "./llm";
import { createStreamCleaner, cleanFinalText } from "./stream-clean";
import { runTool, toolNames, toolSpecs, isAgentTool, type AgentToolContext, type ToolRun } from "./tools";
import { buildSystemPrompt, FORCE_ANSWER } from "./prompt";
import type { Attempt } from "../provider";
import type { CompletionFailure } from "./llm";

export interface AgentLimits {
  maxRounds: number;
  maxToolCalls: number;
  maxPerRound: number;
  budgetMs: number;
  maxContextChars: number;
}
export const DEFAULT_LIMITS: AgentLimits = { maxRounds: 8, maxToolCalls: 24, maxPerRound: 6, budgetMs: 50_000, maxContextChars: 300_000 };

export interface AgentEvents {
  onDelta(text: string): void;
  onReset(): void;
}

export interface AgentInput {
  config: LlmConfig;
  brief: Record<string, unknown>;
  history: { role: "user" | "buddy"; text: string }[];
  ctx: AgentToolContext;
  events: AgentEvents;
  signal?: AbortSignal;
  limits?: Partial<AgentLimits>;
  fetchImpl?: typeof fetch;
}

export interface AgentResult {
  ok: boolean;
  text: string;
  failure?: CompletionFailure;
  model: string | null;
  rounds: number;
  toolRuns: ToolRun[];
  attempts: Attempt[];
  textMode: boolean;
  forced: boolean;
  detail?: string;
}

const canon = (name: string, args: unknown) => `${name}:${JSON.stringify(args, Object.keys((args as object) ?? {}).sort())}`;

function parseTextToolCalls(content: string): ToolCallOut[] {
  const out: ToolCallOut[] = [];
  const add = (raw: string) => {
    try {
      const o = JSON.parse(raw.trim()) as { name?: unknown; arguments?: unknown; tool?: unknown; args?: unknown };
      const name = typeof o.name === "string" ? o.name : typeof o.tool === "string" ? o.tool : "";
      const args = o.arguments ?? o.args ?? {};
      if (name) out.push({ id: `txt_${out.length + 1}`, name, arguments: typeof args === "string" ? args : JSON.stringify(args) });
    } catch { /* malformed block: ignored, the model sees nothing was run and can retry */ }
  };
  for (const m of content.matchAll(/<tool_call>([\s\S]*?)(?:<\/tool_call>|$)/g)) add(m[1]!);
  if (!out.length) {
    const t = content.trim();
    if (t.startsWith("{") && t.endsWith("}")) { try { const o = JSON.parse(t); if (isAgentTool(o?.name ?? o?.tool)) add(t); } catch { /* not a call */ } }
  }
  return out;
}

function safeJson(s: string): { ok: true; value: unknown } | { ok: false } {
  if (!s.trim()) return { ok: true, value: {} };
  try { return { ok: true, value: JSON.parse(s) }; } catch { return { ok: false }; }
}

function compact(messages: WireMessage[], maxChars: number): void {
  let total = messages.reduce((s, m) => s + (m.content?.length ?? 0) + (m.tool_calls ? 200 : 0), 0);
  if (total <= maxChars) return;
  // Oldest tool results first; the system prompt, the conversation and the latest round are never touched.
  const lastTool = messages.map((m, i) => (m.role === "tool" ? i : -1)).filter((i) => i >= 0);
  const keepFrom = lastTool.length ? lastTool[Math.max(0, lastTool.length - 3)]! : messages.length;
  for (let i = 0; i < keepFrom && total > maxChars; i++) {
    const m = messages[i]!;
    if (m.role === "tool" && (m.content?.length ?? 0) > 400) {
      total -= m.content!.length - 120;
      m.content = '{"_omitted":"Earlier tool result removed to save space; call the tool again if you need it."}';
    }
  }
}

export async function runAgent(input: AgentInput): Promise<AgentResult> {
  const limits = { ...DEFAULT_LIMITS, ...input.limits };
  const started = Date.now();
  const deadline = started + limits.budgetMs;
  const specs = toolSpecs();

  let textMode = false;
  const convo: WireMessage[] = input.history.map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: m.text }));
  const system = (): WireMessage => ({ role: "system", content: buildSystemPrompt(input.brief, { textTools: textMode, toolList: toolNames() }) });
  const messages: WireMessage[] = [system(), ...convo];

  const toolRuns: ToolRun[] = [];
  const seen = new Map<string, ToolRun>();
  const attempts: Attempt[] = [];
  let model: string | null = null;
  let rounds = 0;
  let forced = false;
  let dupes = 0;
  let toolCallsUsed = 0;
  let lastFailure: CompletionFailure = "empty";

  for (let guard = 0; guard < limits.maxRounds + 3; guard++) {
    if (input.signal?.aborted) return { ok: false, text: "", failure: "aborted", model, rounds, toolRuns, attempts, textMode, forced };

    const outOfRounds = rounds >= limits.maxRounds - 1;
    const outOfTools = toolCallsUsed >= limits.maxToolCalls;
    const outOfTime = deadline - Date.now() < 12_000 && toolRuns.length > 0;
    if (!forced && (outOfRounds || outOfTools || outOfTime || dupes >= 3)) {
      forced = true;
      messages.push({ role: "user", content: FORCE_ANSWER });
    }
    compact(messages, limits.maxContextChars);

    rounds++;
    const cleaner = createStreamCleaner();
    let emitted = "";
    const res: CompletionResult = await complete({
      config: input.config,
      messages,
      tools: textMode ? undefined : specs,
      toolChoice: forced ? "none" : "auto",
      stream: true,
      signal: input.signal,
      deadline,
      preferModel: model,
      fetchImpl: input.fetchImpl,
      onContent: (d) => {
        const safe = cleaner.push(d);
        if (safe) { emitted += safe; input.events.onDelta(safe); }
      },
      onReset: () => { if (emitted) { emitted = ""; input.events.onReset(); } },
    });
    attempts.push(...res.attempts);

    if (!res.ok) {
      lastFailure = res.failure;
      if (res.toolsRejected && !textMode && !forced) {
        textMode = true; // the models in the chain refuse native tools: switch protocol, same question
        messages[0] = system();
        rounds--;
        continue;
      }
      return { ok: false, text: "", failure: res.failure, model, rounds, toolRuns, attempts, textMode, forced, detail: res.detail };
    }
    model = res.model;
    const tail = cleaner.flush();
    if (tail && !cleaner.sawToolMarkup) { emitted += tail; input.events.onDelta(tail); }

    const calls = forced ? [] : res.toolCalls.length ? res.toolCalls : parseTextToolCalls(res.content);

    if (calls.length === 0) {
      const text = cleanFinalText(res.content);
      if (!text) {
        lastFailure = "empty";
        if (!forced) { forced = true; messages.push({ role: "user", content: FORCE_ANSWER }); continue; }
        return { ok: false, text: "", failure: "empty", model, rounds, toolRuns, attempts, textMode, forced };
      }
      return { ok: true, text, model, rounds, toolRuns, attempts, textMode, forced };
    }

    // The model chose to retrieve more. Anything it wrote alongside the call is retracted.
    if (emitted) { emitted = ""; input.events.onReset(); }

    const batch = calls.slice(0, limits.maxPerRound);
    const echoed = batch.map((c) => {
      const parsed = safeJson(c.arguments);
      return { call: c, parsed, wireArgs: parsed.ok ? JSON.stringify(parsed.value) : "{}" };
    });

    if (textMode) {
      messages.push({ role: "assistant", content: res.content });
    } else {
      messages.push({
        role: "assistant",
        content: null,
        tool_calls: echoed.map((e) => ({ id: e.call.id, type: "function" as const, function: { name: e.call.name, arguments: e.wireArgs } })),
      });
    }

    const results = await Promise.all(
      echoed.map(async (e) => {
        if (!e.parsed.ok) {
          const bad = { error: "invalid_arguments", problems: ["arguments were not valid JSON"], hint: "Send a JSON object." };
          return { e, run: { name: e.call.name, args: {}, ok: false, json: JSON.stringify(bad), value: bad, ms: 0 } as ToolRun, dup: false };
        }
        const key = canon(e.call.name, e.parsed.value);
        const prior = seen.get(key);
        if (prior?.ok) return { e, run: prior, dup: true };
        const run = await runTool(e.call.name, e.parsed.value, input.ctx);
        if (run.ok) seen.set(key, run);
        return { e, run, dup: false };
      }),
    );

    for (const r of results) {
      toolCallsUsed++;
      if (r.dup) dupes++;
      else toolRuns.push(r.run);
    }
    const dropped = calls.length - batch.length;
    if (textMode) {
      messages.push({
        role: "user",
        content: `TOOL RESULTS:\n${results.map((r) => `${r.e.call.name}(${r.e.wireArgs}) → ${r.dup ? "(already retrieved above) " : ""}${r.run.json}`).join("\n")}${dropped > 0 ? `\n(${dropped} extra call(s) skipped; ask again if needed.)` : ""}\nContinue: call more tools or write the final answer.`,
      });
    } else {
      for (const r of results) {
        messages.push({ role: "tool", tool_call_id: r.e.call.id, content: r.dup ? `{"_note":"identical call already made this turn; same result","result":${r.run.json}}` : r.run.json });
      }
    }
  }
  return { ok: false, text: "", failure: lastFailure, model, rounds, toolRuns, attempts, textMode, forced };
}
