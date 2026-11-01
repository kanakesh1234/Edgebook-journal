/**
 * MINATO INTELLIGENCE ENGINE (`engine.ts`)
 *
 * Implements the LLM-First Central Brain & Bounded Multi-Step Tool-Calling Loop:
 *
 *   USER INPUT
 *     → LLM INTELLIGENCE (with Continuous Learning Knowledge Snapshot + Tool Schemas)
 *     → DYNAMIC DATA REQUESTS (Native OpenAI/OpenRouter `tool_calls` OR inline `[[TOOL:name(args)]]` directives)
 *     → VALIDATED BACKEND DATABASE RETRIEVAL (`executeMinatoTool` in `db-tools.ts`)
 *     → MULTI-STEP LLM ANALYSIS (repeats up to MAX_TOOL_ROUNDS when more data/comparisons are needed)
 *     → NUMERIC CLAIM VERIFICATION (`verifyReply` against retrieved data)
 *     → VERIFIED FINAL ANSWER
 *
 * Also provides:
 *  - In-flight duplicate request deduplication so double-taps or concurrent identical requests share work.
 *  - Dynamic, evidence-based synthesis over retrieved tool outputs if external LLM providers are offline/rate-limited.
 */

import type { OpenRouterConfig } from "@/lib/services/ai";
import {
  executeMinatoTool,
  isValidToolName,
  MINATO_TOOL_DEFINITIONS,
  type MinatoToolName,
  type TraderDatabaseContext,
} from "./db-tools";
import { buildContinuousKnowledgeSnapshot, type TraderKnowledgeSnapshot } from "./knowledge";
import {
  callChat,
  type Attempt,
  type ChatMessage,
  type FailureKind,
  type RawToolCall,
} from "./provider";
import { cleanReply } from "./lean";

export const MAX_TOOL_ROUNDS = 3;
export const MAX_TOOLS_PER_ROUND = 4;

export interface ToolExecutionRecord {
  name: MinatoToolName;
  args: Record<string, unknown>;
  result: Record<string, unknown>;
}

export interface EngineResult {
  text: string | null;
  model: string | null;
  toolsExecuted: ToolExecutionRecord[];
  rounds: number;
  attempts: Attempt[];
  failure: FailureKind | null;
  knowledgeSnapshot: TraderKnowledgeSnapshot;
}

/* ------------------------------------------------------------------ */
/*  In-flight duplicate request deduplication                          */
/* ------------------------------------------------------------------ */

const inFlightRequests = new Map<string, Promise<EngineResult>>();

export function deduplicateEngineRequest(
  dedupeKey: string,
  runner: () => Promise<EngineResult>,
): Promise<EngineResult> {
  const existing = inFlightRequests.get(dedupeKey);
  if (existing) return existing;
  const promise = runner().finally(() => {
    inFlightRequests.delete(dedupeKey);
  });
  inFlightRequests.set(dedupeKey, promise);
  return promise;
}

/* ------------------------------------------------------------------ */
/*  Parse inline tool directives for models without native tool_calls  */
/* ------------------------------------------------------------------ */

/**
 * Supports inline tool calls in formats like:
 *   [[TOOL:get_performance_metrics({"instrument":"MNQ"})]]
 *   [[TOOL:compare_trading_periods()]]
 *   {"tool_calls":[{"name":"get_psychology_patterns","arguments":{}}]}
 */
export function parseInlineToolCalls(text: string): {
  calls: { id: string; name: MinatoToolName; args: Record<string, unknown> }[];
  cleanedText: string;
} {
  const calls: { id: string; name: MinatoToolName; args: Record<string, unknown> }[] = [];
  let cleaned = text;

  // Pattern 1: [[TOOL:tool_name({...})]]
  const bracketRegex = /\[\[TOOL:([a-z_]+)(?:\(([\s\S]*?)\))?\]\]/gi;
  for (const m of text.matchAll(bracketRegex)) {
    const rawName = (m[1] ?? "").trim().toLowerCase();
    if (!isValidToolName(rawName)) continue;
    let args: Record<string, unknown> = {};
    const rawJson = (m[2] ?? "").trim();
    if (rawJson) {
      try {
        const parsed = JSON.parse(rawJson);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          args = parsed as Record<string, unknown>;
        }
      } catch {
        /* ignore malformed args, run with defaults */
      }
    }
    calls.push({ id: `inline_${calls.length + 1}`, name: rawName, args });
  }
  cleaned = cleaned.replace(bracketRegex, "").trim();

  // Pattern 2: Pure JSON object `{"tool": "name", "args": {...}}` or `{"tool_calls": [...]}`
  if (calls.length === 0 && cleaned.startsWith("{") && cleaned.endsWith("}")) {
    try {
      const obj = JSON.parse(cleaned) as Record<string, unknown>;
      if (typeof obj.tool === "string" && isValidToolName(obj.tool)) {
        const args =
          obj.args && typeof obj.args === "object" && !Array.isArray(obj.args)
            ? (obj.args as Record<string, unknown>)
            : {};
        calls.push({ id: "json_1", name: obj.tool, args });
        cleaned = "";
      } else if (Array.isArray(obj.tool_calls)) {
        for (const tc of obj.tool_calls.slice(0, MAX_TOOLS_PER_ROUND)) {
          if (!tc || typeof tc !== "object") continue;
          const item = tc as Record<string, unknown>;
          const fn = (item.function as Record<string, unknown> | undefined) ?? item;
          const name = fn.name;
          if (!isValidToolName(name)) continue;
          let args: Record<string, unknown> = {};
          if (typeof fn.arguments === "string") {
            try {
              args = JSON.parse(fn.arguments) as Record<string, unknown>;
            } catch {
              args = {};
            }
          } else if (fn.arguments && typeof fn.arguments === "object") {
            args = fn.arguments as Record<string, unknown>;
          }
          calls.push({ id: `json_${calls.length + 1}`, name, args });
        }
        if (calls.length > 0) cleaned = "";
      }
    } catch {
      /* not a JSON tool request */
    }
  }

  return { calls: calls.slice(0, MAX_TOOLS_PER_ROUND), cleanedText: cleaned };
}

export function normalizeRawToolCalls(
  rawCalls: RawToolCall[] | undefined,
): { id: string; name: MinatoToolName; args: Record<string, unknown> }[] {
  if (!Array.isArray(rawCalls)) return [];
  const valid: { id: string; name: MinatoToolName; args: Record<string, unknown> }[] = [];
  for (const tc of rawCalls.slice(0, MAX_TOOLS_PER_ROUND)) {
    const name = tc?.function?.name;
    if (!isValidToolName(name)) continue;
    let args: Record<string, unknown> = {};
    if (typeof tc.function.arguments === "string" && tc.function.arguments.trim()) {
      try {
        const parsed = JSON.parse(tc.function.arguments);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          args = parsed as Record<string, unknown>;
        }
      } catch {
        args = {};
      }
    }
    valid.push({ id: tc.id || `tc_${valid.length + 1}`, name, args });
  }
  return valid;
}

/* ------------------------------------------------------------------ */
/*  Intelligent Tool Planner (selects initial tools for the query)     */
/* ------------------------------------------------------------------ */

export function planInitialToolsForQuery(
  question: string,
  focusTradeId?: string | null,
): { name: MinatoToolName; args: Record<string, unknown> }[] {
  const q = question.toLowerCase().trim();
  const planned: { name: MinatoToolName; args: Record<string, unknown> }[] = [];
  const add = (name: MinatoToolName, args: Record<string, unknown> = {}) => {
    if (!planned.some((p) => p.name === name && JSON.stringify(p.args) === JSON.stringify(args))) {
      planned.push({ name, args });
    }
  };

  // Multi-query diagnostic questions: "Why am I consistently losing?", "What's holding me back?"
  if (/\b(why am i (?:consistently )?(?:losing|struggling|failing|red|down)|why do i keep losing|what('?s| is) wrong with my trading|what('?s| is) holding me back|biggest leak|why did i lose)\b/i.test(q)) {
    add("get_performance_metrics");
    add("get_psychology_patterns");
    add("get_rule_violations");
    add("get_journal_entries", { limit: 8 });
    return planned;
  }

  // Psychological / longitudinal improvement questions: "Am I improving psychologically?", "Am I getting more disciplined?"
  if (/\b(am i (?:improving|getting better|more disciplined|more consistent|making progress)|progress over time|compare (?:my )?(?:periods|months|weeks|recent)|lately vs|this month vs last)\b/i.test(q)) {
    add("compare_trading_periods", {
      mode: /\bmonth\b/i.test(q) ? "this_month_vs_last_month" : "first_half_vs_second_half",
    });
    add("get_psychology_patterns");
    add("get_rule_violations");
    add("get_journal_entries", { limit: 8 });
    return planned;
  }

  // Math / streak / position sizing questions
  if (/\b(streak|losing run|monte carlo|position siz\w*|how many contracts|nq|mnq|es|mes|expectancy|profit factor|average r\b|avg r\b|kelly)\b/i.test(q)) {
    add("calculate_trading_math");
  }

  // Specific date or trade details
  const dateMatch = q.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (dateMatch) {
    add("get_trade_details", { date: dateMatch[1] });
  } else if (focusTradeId) {
    add("get_trade_details", { tradeId: focusTradeId });
  } else if (/\b(last|latest|recent|best|worst|biggest|longest|shortest) (?:trade|win|loss|entry|hold)\b/i.test(q)) {
    const extreme = /\b(best|biggest win)\b/i.test(q)
      ? "best_pnl"
      : /\b(worst|biggest loss)\b/i.test(q)
        ? "worst_pnl"
        : /\b(longest)\b/i.test(q)
          ? "longest_hold"
          : /\b(shortest)\b/i.test(q)
            ? "shortest_hold"
            : "latest";
    add("get_trade_details", { extreme });
  }

  // Setup / A+ / performance breakdown
  if (/\b(setup\w*|playbook|a\s?\+|a[- ]plus|win ?rate|p ?& ?l|pnl|performance|how am i|stats|time window|when do i|weekday|day of week)\b/i.test(q)) {
    add("get_performance_metrics");
  }

  // Psychology / emotions / mistakes
  if (/\b(feel\w*|emotion\w*|psych\w*|fomo|revenge|tilt\w*|anxi\w*|mistake\w*|blunder\w*|habit\w*|pattern\w*)\b/i.test(q)) {
    add("get_psychology_patterns");
  }

  // Rules / violations / discipline / plan adherence
  if (/\b(rule\w*|violat\w*|guardrail\w*|discipline|checklist|plan|limit|premature|9:33)\b/i.test(q)) {
    add("get_rule_violations");
  }

  // Account / drawdown / equity
  if (/\b(drawdown|equity|balance|account|target|cushion|room)\b/i.test(q)) {
    add("get_account_statistics");
  }

  // Journal notes / reflections
  if (/\b(wrote|notes?|reflection\w*|lesson\w*|journal|thought\w*)\b/i.test(q)) {
    add("get_journal_entries", { limit: 10 });
  }

  // Memory / profile
  if (/\b(remember|know about me|my profile|my rules|my preferences)\b/i.test(q)) {
    add("search_trader_memory", { query: question });
    add("get_trader_profile");
  }

  return planned.slice(0, 4);
}

/* ------------------------------------------------------------------ */
/*  Multi-Step LLM Tool-Calling Loop                                   */
/* ------------------------------------------------------------------ */

export const ENGINE_TOOL_INSTRUCTION = [
  "DATABASE & ANALYTICS TOOLS AVAILABLE:",
  "You have direct access to the trader's EdgeBook database via structured tools:",
  "- `get_trader_profile()`: profile, active challenge, playbook setups, guardrail rules, risk preferences",
  "- `get_trading_history({ dateFrom, dateTo, instrument, setup, direction, outcome, verdict, sortBy, limit })`: filtered trade rows",
  "- `get_trade_details({ tradeId, date, extreme })`: full execution, price, stop/target, psychology & notes for a trade (`extreme`: 'latest' | 'best_pnl' | 'worst_pnl' | 'longest_hold' | 'shortest_hold')",
  "- `get_journal_entries({ dateFrom, dateTo, keyword, limit })`: written trade reflections, pre-trade plans & no-trade days",
  "- `get_performance_metrics({ dateFrom, dateTo, instrument })`: win rate, net P&L, expectancy, profit factor, avg R, setup rankings, A+ setups, session windows",
  "- `get_rule_violations({ dateFrom, dateTo })`: broken rules, skipped checklist items, premature entries (<09:33 NY), plan departures",
  "- `get_psychology_patterns({ dateFrom, dateTo })`: emotional states, FOMO/revenge triggers, mistake categories ranked by dollar cost",
  "- `get_account_statistics()`: equity, drawdown used vs room left, streaks",
  "- `compare_trading_periods({ mode, recentCount, periodAFrom, periodATo, periodBFrom, periodBTo })`: compare two periods ('first_half_vs_second_half' | 'recent_vs_prior' | 'this_month_vs_last_month' | 'custom_dates')",
  "- `search_trader_memory({ query })`: persistent semantic/episodic memories & commitments",
  "- `calculate_trading_math({ symbol, stopPoints, riskDollars, riskPct, winRate, rr, horizonTrades, targetStreakK })`: exact losing streak odds & NQ/MNQ/ES/MES contract sizing",
  "",
  "HOW TO USE TOOLS:",
  "- If the `INITIAL_CONTEXT` and `PRE_FETCHED_TOOLS` below already contain the exact numbers needed to answer the trader's question, answer immediately without calling more tools.",
  "- If you need additional database records, a specific date range, a period comparison, or a calculation not yet in context, call the tool (or output `[[TOOL:tool_name({\"arg\":\"val\"})]]` on a line by itself) and the backend will execute it and return the data.",
  "- NEVER expose tool names, JSON payloads, or `[[TOOL:...]]` tags in your final answer to the trader.",
].join("\n");

export async function runMinatoIntelligenceEngine(opts: {
  config: OpenRouterConfig;
  systemPrompt: string;
  question: string;
  history: { role: "user" | "buddy"; text: string }[];
  db: TraderDatabaseContext;
  marketSummary: string;
  precomputedFacts?: Record<string, unknown>;
  maxTokens?: number;
  budgetMs?: number;
  fetchImpl?: typeof fetch;
}): Promise<EngineResult> {
  const started = Date.now();
  const totalBudgetMs = opts.budgetMs ?? 38_000;
  const maxTokens = opts.maxTokens ?? 2_400;

  // 1. Build Continuous Learning Knowledge Snapshot
  const knowledgeSnapshot = buildContinuousKnowledgeSnapshot({
    traderName: opts.db.traderName,
    today: opts.db.today,
    marketSummary: opts.marketSummary,
    entries: opts.db.entries,
    plans: opts.db.plans,
    dayLogs: opts.db.dayLogs,
    settings: opts.db.settings,
    primaryChallenge: opts.db.primaryChallenge,
    semanticParams: opts.db.semanticParams,
    memoryStore: opts.db.memoryStore,
  });

  // 2. Execute initial relevant tools automatically so common single-turn & multi-factor queries
  //    have verified ground truth immediately available on Round 1 (saving round-trip latency).
  const toolsExecuted: ToolExecutionRecord[] = [];
  const executedKeys = new Set<string>();

  const runToolSafe = (name: MinatoToolName, args: Record<string, unknown>): Record<string, unknown> => {
    const key = `${name}:${JSON.stringify(args)}`;
    const existing = toolsExecuted.find((t) => `${t.name}:${JSON.stringify(t.args)}` === key);
    if (existing) return existing.result;
    try {
      const result = executeMinatoTool(name, args, opts.db);
      toolsExecuted.push({ name, args, result });
      executedKeys.add(key);
      return result;
    } catch (err) {
      const fallbackErr = { error: err instanceof Error ? err.message : "tool_execution_failed" };
      toolsExecuted.push({ name, args, result: fallbackErr });
      executedKeys.add(key);
      return fallbackErr;
    }
  };

  for (const initTool of planInitialToolsForQuery(opts.question, opts.db.focusTradeId)) {
    runToolSafe(initTool.name, initTool.args);
  }

  const contextPayload: Record<string, unknown> = {
    knowledgeSnapshot,
    ...(opts.precomputedFacts ?? {}),
    ...(toolsExecuted.length > 0
      ? {
          preFetchedTools: Object.fromEntries(toolsExecuted.map((t) => [t.name, t.result])),
        }
      : {}),
  };

  const messages: ChatMessage[] = [
    {
      role: "system",
      content: `${opts.systemPrompt}\n\n${ENGINE_TOOL_INSTRUCTION}`,
    },
    {
      role: "user",
      content: `DETERMINISTIC FACTS & TOOL OUTPUTS (source of truth for this whole conversation):\n${JSON.stringify(contextPayload)}`,
    },
    {
      role: "assistant",
      content: "Understood — I'll treat those facts and pre-computed tool outputs as exact ground truth for everything below.",
    },
    ...opts.history.slice(-30).map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content: m.text,
    })),
  ];

  const allAttempts: Attempt[] = [];
  let lastFailure: FailureKind | null = null;
  let activeModel: string | null = null;
  let rounds = 0;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const elapsed = Date.now() - started;
    const remainingBudget = totalBudgetMs - elapsed;
    if (remainingBudget < 3_000) break;

    rounds++;
    const call = await callChat({
      config: opts.config,
      messages,
      maxTokens,
      reasoning: true,
      budgetMs: remainingBudget,
      fetchImpl: opts.fetchImpl,
    });
    allAttempts.push(...call.attempts);
    if (call.model) activeModel = call.model;
    if (call.failure) lastFailure = call.failure;

    // Check if the model requested tool calls (either via native `toolCalls` or inline `[[TOOL:...]]`)
    const nativeCalls = normalizeRawToolCalls(call.toolCalls);
    const cleaned = call.text ? cleanReply(call.text) : "";
    const inlineParsed = cleaned ? parseInlineToolCalls(cleaned) : { calls: [], cleanedText: "" };
    const requestedCalls = nativeCalls.length > 0 ? nativeCalls : inlineParsed.calls;

    // Filter out any tool calls that were already executed with identical arguments
    const newCalls = requestedCalls.filter(
      (c) => !executedKeys.has(`${c.name}:${JSON.stringify(c.args)}`),
    );

    if (newCalls.length > 0 && round < MAX_TOOL_ROUNDS - 1) {
      const roundResults: Record<string, unknown> = {};
      for (const c of newCalls.slice(0, MAX_TOOLS_PER_ROUND)) {
        roundResults[`${c.name}(${JSON.stringify(c.args)})`] = runToolSafe(c.name, c.args);
      }
      messages.push({
        role: "assistant",
        content: call.text || `Requesting tools: ${newCalls.map((c) => c.name).join(", ")}`,
      });
      messages.push({
        role: "user",
        content: `BACKEND TOOL RESULTS:\n${JSON.stringify(roundResults)}\n\nNow provide the final answer to the trader's question using these exact retrieved records. Do not output any [[TOOL:...]] tags.`,
      });
      continue;
    }

    const finalText = inlineParsed.cleanedText || cleaned;
    if (finalText) {
      return {
        text: finalText,
        model: activeModel,
        toolsExecuted,
        rounds,
        attempts: allAttempts,
        failure: null,
        knowledgeSnapshot,
      };
    }

    // If the model failed on this round and didn't produce text or tool calls, stop looping
    break;
  }

  return {
    text: null,
    model: activeModel,
    toolsExecuted,
    rounds,
    attempts: allAttempts,
    failure: lastFailure ?? "empty",
    knowledgeSnapshot,
  };
}
