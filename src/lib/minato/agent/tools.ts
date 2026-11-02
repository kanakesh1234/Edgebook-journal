/**
 * TOOL REGISTRY — the only things the model can ask the backend to do.
 *
 * Every tool is: allow-listed by name, argument-validated (schema.ts), read-only against the authenticated
 * trader's in-scope records (no SQL, no free-form queries, no other user's data is reachable because the
 * context is built from this request's verified session), bounded in output size, and returns plain JSON
 * with nulls/empties stripped so the model is not charged for — or distracted by — absent fields.
 *
 * The two writers (`save_trader_insight`) only touch the caller's own knowledge rows via RLS.
 */
import { DATE_SPEC, toJsonSchema, validateArgs, type ObjectSchema } from "./schema";
import { calculate, MathError } from "./safe-math";
import { dailySummaries, dataCoverage, riskProfile } from "./extra-tools";
import { executeMinatoTool, type MinatoToolName, type TraderDatabaseContext } from "../db-tools";
import { dropEmpty } from "../context-pack";
import { INSIGHT_KINDS, queryWords, type Insight, type InsightKind, type KnowledgeStore } from "./knowledge-store";
import type { ToolSpec } from "./llm";

export interface AgentToolContext {
  db: TraderDatabaseContext;
  knowledge: KnowledgeStore;
  /** Beliefs the client's local memory retrieved for this question (already sanitised). */
  clientBeliefs: { say: string; strength?: string; stance?: string; lastConfirmed?: string }[];
  today: string;
}

export interface AgentTool {
  name: string;
  description: string;
  schema: ObjectSchema;
  /** Soft ceiling for the serialised result. */
  maxChars?: number;
  run(args: Record<string, unknown>, ctx: AgentToolContext): unknown | Promise<unknown>;
}

const D = (description: string) => ({ ...DATE_SPEC, description });
const NUM = (description: string, minimum?: number, maximum?: number) => ({ type: "number" as const, description, minimum, maximum });
const STR = (description: string, maxLength = 120) => ({ type: "string" as const, description, maxLength });

const dbTool = (name: MinatoToolName): ((a: Record<string, unknown>, c: AgentToolContext) => unknown) => (a, c) => executeMinatoTool(name, a, c.db);

/** Keep only the requested sections of a large result so unrelated figures never reach the model. */
function pick(result: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  return Object.fromEntries(Object.entries(result).filter(([k]) => keys.includes(k)));
}
const PERF_SECTIONS: Record<string, string[]> = {
  summary: ["sampleTrades", "tradingDays", "totalPnl", "winRateDayPct", "winRateTradePct", "winningDays", "losingDays", "avgDayPnl", "bestDay", "worstDay"],
  expectancy: ["expectancyDollarsPerTrade", "expectancyR", "profitFactor", "payoffRatio", "avgWinDollars", "avgLossDollars", "avgR"],
  hold_time: ["holdTime"],
  setups: ["setupBreakdown"],
  a_plus: ["aPlusSummary"],
  time_windows: ["sessionWindows"],
};

export const AGENT_TOOLS: AgentTool[] = [
  {
    name: "get_trader_profile",
    description: "Who the trader is and how they have configured things: active challenge, account limits, playbook setups with their rules, enabled guardrail rules, and saved risk/stop/instrument preferences. Use for questions about their rules, strategy definitions, limits or setup. Not for performance numbers.",
    schema: { properties: {} },
    run: dbTool("get_trader_profile"),
  },
  {
    name: "get_trading_history",
    description: "List individual trades, filtered and sorted, with totals for everything that matches (not only the returned page). Use for 'my last N trades', 'losses on MNQ', 'trades from setup X', 'best/worst trades', or to page through history with offset.",
    schema: {
      properties: {
        dateFrom: D("Start date, inclusive."), dateTo: D("End date, inclusive."),
        instrument: STR("Symbol prefix, e.g. MNQ."), setup: STR("Part of the setup name."),
        direction: { type: "string", enum: ["long", "short"] },
        outcome: { type: "string", enum: ["win", "loss", "breakeven"] },
        verdict: { type: "string", enum: ["a-plus", "process-success", "process-failure", "unrated"], description: "The trader's own process verdict from Quick Autopsy." },
        sortBy: { type: "string", enum: ["newest", "oldest", "highest_pnl", "lowest_pnl", "longest_hold"] },
        limit: NUM("Rows to return, 1-50 (default 20).", 1, 50), offset: NUM("Skip this many matches.", 0, 100000),
      },
    },
    maxChars: 26_000,
    run: dbTool("get_trading_history"),
  },
  {
    name: "get_trade_details",
    description: "Everything recorded about one trade (or all trades on one date): entry/exit/stop/target prices, size, R, times, checklist, psychology, mistake tags, the trader's own notes and lesson. Use after you know which trade (by id, date, or extreme such as worst_pnl).",
    schema: {
      properties: {
        tradeId: STR("Exact trade id from another tool."), date: D("All trades on this date."),
        extreme: { type: "string", enum: ["latest", "best_pnl", "worst_pnl", "longest_hold", "shortest_hold"] },
      },
    },
    run: dbTool("get_trade_details"),
  },
  {
    name: "get_journal_entries",
    description: "The trader's own words: trade notes, post-trade reflections (went well / poorly / cause / lesson), pre-trade plans with their emotional state, and no-trade days. Use for 'what did I write', psychology over time, recurring themes. Filter by keyword and dates.",
    schema: { properties: { dateFrom: D("Start date."), dateTo: D("End date."), keyword: STR("Word to look for in notes and plans."), limit: NUM("Records, 1-30 (default 15).", 1, 30) } },
    maxChars: 26_000,
    run: dbTool("get_journal_entries"),
  },
  {
    name: "get_performance_metrics",
    description: "Aggregate performance for a period/instrument. Choose `sections` to get only what the question needs: summary (win rate, P&L, best/worst day), expectancy (expectancy, profit factor, avg win/loss, avg R), hold_time, setups (ranking per setup), a_plus (A+ verdict trades), time_windows (best entry windows). Omit sections for summary+expectancy.",
    schema: {
      properties: {
        dateFrom: D("Optional start date."), dateTo: D("Optional end date."), instrument: STR("Optional symbol prefix."),
        sections: { type: "array", items: { type: "string", enum: Object.keys(PERF_SECTIONS) }, maxItems: 6, description: "Which parts to return." },
      },
    },
    run: (a, c) => {
      const { sections, ...rest } = a as { sections?: string[] } & Record<string, unknown>;
      const full = executeMinatoTool("get_performance_metrics", rest, c.db);
      const want = sections?.length ? sections : ["summary", "expectancy"];
      return pick(full, want.flatMap((s) => PERF_SECTIONS[s] ?? []));
    },
  },
  {
    name: "get_rule_violations",
    description: "Discipline record: broken guardrails with dates, clean-day rate, per-rule counts, skipped pre-trade checklist items, departures from the plan. Use for 'am I following my rules', 'what rules do I break', overtrading, daily-loss breaches.",
    schema: { properties: { dateFrom: D("Optional start date."), dateTo: D("Optional end date.") } },
    run: dbTool("get_rule_violations"),
  },
  {
    name: "get_psychology_patterns",
    description: "Emotional and behavioural evidence: performance by emotional state, FOMO/revenge/fear-exit counts and their P&L, mistake categories ranked by dollar cost, recurring patterns with evidence, post-loss reflections. Use for tilt, discipline, mindset and 'why do I keep…' questions.",
    schema: { properties: { dateFrom: D("Optional start date."), dateTo: D("Optional end date.") } },
    run: dbTool("get_psychology_patterns"),
  },
  {
    name: "get_account_statistics",
    description: "Account state: starting/current/peak/target equity, progress to target, drawdown used vs room left vs limit, streak records and the equity curve tail. Use for drawdown, balance, target, 'how close am I'.",
    schema: { properties: {} },
    run: dbTool("get_account_statistics"),
  },
  {
    name: "compare_trading_periods",
    description: "Compare two periods side by side (P&L, win rate, expectancy, plan adherence, FOMO/revenge counts, mistakes, emotions) with deltas. Use for 'am I improving', 'this month vs last', before/after a rule change. Modes: first_half_vs_second_half, recent_vs_prior (recentCount trades), this_month_vs_last_month, custom_dates.",
    schema: {
      properties: {
        mode: { type: "string", enum: ["first_half_vs_second_half", "recent_vs_prior", "this_month_vs_last_month", "custom_dates"] },
        recentCount: NUM("Trades per window for recent_vs_prior.", 2, 200),
        periodAFrom: D("custom_dates: earlier period start."), periodATo: D("custom_dates: earlier period end."),
        periodBFrom: D("custom_dates: later period start."), periodBTo: D("custom_dates: later period end."),
      },
    },
    run: dbTool("compare_trading_periods"),
  },
  {
    name: "get_daily_summaries",
    description: "One row per trading day (P&L, trades, wins/losses, best/worst trade, rule breaches), with green/red day counts and no-trade days. Use for 'how was my week/month', best and worst days, day-level streaks.",
    schema: {
      properties: {
        dateFrom: D("Start date."), dateTo: D("End date."), limit: NUM("Days, 1-90 (default 30).", 1, 90), offset: NUM("Skip days.", 0, 100000),
        sortBy: { type: "string", enum: ["newest", "oldest", "best", "worst"] },
      },
    },
    maxChars: 24_000,
    run: (a, c) => dailySummaries(c.db, a as never),
  },
  {
    name: "get_risk_profile",
    description: "How much the trader actually risks and how much they safely could: their real stop distances (from entry vs stop prices), typical size and realised losses per instrument, drawdown room, the losing-streak distribution, and risk-per-trade ceilings with the reasoning, plus max contracts at their median stop. Use for position sizing, 'how much can I risk', survivability. Prefer this over asking the trader for their stop.",
    schema: { properties: { instrument: STR("Optional symbol prefix, e.g. MNQ.") } },
    run: (a, c) => riskProfile(c.db, a as never),
  },
  {
    name: "get_data_coverage",
    description: "What the journal does and does not contain (how many trades have stops, prices, reviews, psychology answers, notes…) and plain-language gaps. Call this when an answer depends on optional fields, or before telling the trader something cannot be determined.",
    schema: { properties: {} },
    run: (_a, c) => dataCoverage(c.db),
  },
  {
    name: "search_trader_memory",
    description: "MINATO's persistent notes about this trader: stated goals, rules, decisions, strategy notes, past conclusions (with the date they were true), earlier conversation summaries and progress checkpoints. Memory is context, not evidence: if it disagrees with live data, trust the data. Search by topic words; omit query to list the most relevant.",
    schema: { properties: { query: STR("Topic words, e.g. 'revenge trading' or 'goal'.", 160), kinds: { type: "array", items: { type: "string", enum: INSIGHT_KINDS }, maxItems: 6 }, limit: NUM("Items, 1-20.", 1, 20) } },
    run: async (a, c) => {
      const q = typeof a.query === "string" ? a.query : "";
      const kinds = (a.kinds as InsightKind[] | undefined)?.length ? (a.kinds as InsightKind[]) : undefined;
      const stored: Insight[] = await c.knowledge.list({ query: q || undefined, kinds, limit: Math.min(20, Number(a.limit) || 10) });
      const words = queryWords(q);
      const beliefs = c.clientBeliefs.filter((b) => !words.length || words.some((w) => b.say.toLowerCase().includes(w))).slice(0, 8);
      return {
        memoryBackend: c.knowledge.backend,
        notes: stored.map((s) => ({ id: s.id, kind: s.kind, note: s.content, source: s.source, confidence: s.confidence, timesConfirmed: s.timesSeen, lastConfirmed: s.lastSeen.slice(0, 10), asOfData: s.asOf, evidence: s.evidence })),
        localBeliefs: beliefs,
        reminder: "Stored notes may be older than the journal. Live tool data wins on any conflict.",
        ...(stored.length === 0 && beliefs.length === 0 ? { empty: true } : {}),
      };
    },
  },
  {
    name: "save_trader_insight",
    description: "Store ONE durable fact worth remembering next time: something the trader stated (a goal, rule, preference, decision, strategy intention) or a conclusion you verified from their data. Write it as a standalone sentence with numbers and dates. Never store guesses, one-off moods, secrets or account numbers. Use supersedesId when it replaces an older note from search_trader_memory.",
    schema: {
      properties: {
        kind: { type: "string", enum: INSIGHT_KINDS },
        content: { type: "string", maxLength: 600, description: "One standalone sentence (8-600 chars)." },
        source: { type: "string", enum: ["trader_stated", "analysis"], description: "trader_stated if they said it; analysis if you verified it from data." },
        asOf: D("Date of the data an analysis conclusion is based on."),
        supersedesId: STR("id of an older note this replaces.", 80),
      },
      required: ["kind", "content", "source"],
    },
    run: async (a, c) => {
      const res = await c.knowledge.save({
        kind: a.kind as InsightKind, content: String(a.content), source: a.source === "analysis" ? "analysis" : "trader_stated",
        asOf: (a.asOf as string | undefined) ?? (a.source === "analysis" ? c.today : null), supersedesId: a.supersedesId as string | undefined,
      });
      return res.ok ? { saved: true, created: res.created } : { saved: false, reason: res.error };
    },
  },
  {
    name: "calculate_trading_math",
    description: "Trading-specific math engine: losing-streak probabilities (exact + Monte Carlo), contract sizing for NQ/MNQ/ES/MES from stop and risk, hypothetical expectancy / break-even win rate / Kelly from a win rate and reward:risk. Defaults to the journal's win rate. For plain arithmetic use `calculate`.",
    schema: {
      properties: {
        symbol: STR("MNQ, NQ, MES, ES…", 12), stopPoints: NUM("Stop distance in points.", 0.01, 5000), riskDollars: NUM("Dollar risk per trade.", 1, 1e7), riskPct: NUM("Percent of equity risked.", 0.01, 100),
        winRate: NUM("0-1 or 0-100.", 0, 100), rr: NUM("Reward:risk, e.g. 2.", 0.05, 100), horizonTrades: NUM("Trades in the streak horizon (default 100).", 5, 5000), targetStreakK: NUM("Losing streak length to test.", 1, 100),
      },
    },
    maxChars: 14_000,
    run: dbTool("calculate_trading_math"),
  },
  {
    name: "calculate",
    description: "Exact arithmetic for any derived figure (differences, ratios, percentages, splits, sums). ALWAYS use this instead of computing in your head, so every number you state is verified. Supports + - * / % ^ ( ), abs, round(x,n), floor, ceil, min, max, sqrt, pow. Example: round(470/7, 2).",
    schema: { properties: { expression: STR("Arithmetic expression.", 240), decimals: NUM("Decimals to round to (default 4).", 0, 8) }, required: ["expression"] },
    run: (a) => {
      try { return calculate(String(a.expression), typeof a.decimals === "number" ? a.decimals : 4); } catch (e) { return { error: e instanceof MathError ? e.message : "could not evaluate" }; }
    },
  },
];

const BY_NAME = new Map(AGENT_TOOLS.map((t) => [t.name, t]));
export const toolNames = () => AGENT_TOOLS.map((t) => t.name);
export const isAgentTool = (n: unknown): n is string => typeof n === "string" && BY_NAME.has(n);

export function toolSpecs(): ToolSpec[] {
  return AGENT_TOOLS.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: toJsonSchema(t.schema) } }));
}

/* ------------------------------------------------------------------ */
/*  Execution                                                          */
/* ------------------------------------------------------------------ */

export const DEFAULT_RESULT_CHARS = 20_000;

/** Shrink arrays (and then long strings) until the JSON fits; always flags the truncation honestly. */
export function clampResult(value: unknown, maxChars: number): { json: string; truncated: boolean } {
  let v = value;
  let json = JSON.stringify(v);
  if (json.length <= maxChars) return { json, truncated: false };
  const shrink = (x: unknown, keep: number, strLen: number): unknown => {
    if (Array.isArray(x)) return x.slice(0, keep).map((y) => shrink(y, keep, strLen));
    if (typeof x === "string") return x.length > strLen ? `${x.slice(0, strLen)}…` : x;
    if (x && typeof x === "object") return Object.fromEntries(Object.entries(x as Record<string, unknown>).map(([k, y]) => [k, shrink(y, keep, strLen)]));
    return x;
  };
  for (const [keep, strLen] of [[40, 300], [25, 200], [15, 140], [8, 100], [4, 80]] as const) {
    v = shrink(value, keep, strLen);
    json = JSON.stringify({ ...(v as object), _truncated: "Result shortened to fit; narrow the date range or filters, or page with offset, to see more." });
    if (json.length <= maxChars) return { json, truncated: true };
  }
  return { json: json.slice(0, maxChars), truncated: true };
}

export interface ToolRun {
  name: string;
  args: Record<string, unknown>;
  ok: boolean;
  /** JSON string handed back to the model. */
  json: string;
  /** Parsed form, kept for the grounding ledger. */
  value: unknown;
  ms: number;
}

export async function runTool(name: string, rawArgs: unknown, ctx: AgentToolContext): Promise<ToolRun> {
  const t0 = Date.now();
  const fail = (error: string, extra: Record<string, unknown> = {}): ToolRun => {
    const value = { error, ...extra };
    return { name, args: {}, ok: false, json: JSON.stringify(value), value, ms: Date.now() - t0 };
  };
  const tool = BY_NAME.get(name);
  if (!tool) return fail("unknown_tool", { available: toolNames() });

  const v = validateArgs(tool.schema, rawArgs);
  if (!v.ok) return fail("invalid_arguments", { problems: v.errors, hint: "Fix the arguments and call again." });

  try {
    const out = await Promise.race([
      Promise.resolve(tool.run(v.value, ctx)),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("tool_timeout")), 12_000)),
    ]);
    const cleaned = dropEmpty(out as Record<string, unknown>);
    const withNotes = v.notes.length && cleaned && typeof cleaned === "object" && !Array.isArray(cleaned) ? { ...(cleaned as object), _notes: v.notes } : cleaned;
    const { json, truncated } = clampResult(withNotes ?? { empty: true }, tool.maxChars ?? DEFAULT_RESULT_CHARS);
    let value: unknown;
    try { value = JSON.parse(json); } catch { value = withNotes; }
    return { name, args: v.value, ok: true, json, value, ms: Date.now() - t0, ...(truncated ? {} : {}) };
  } catch (e) {
    return { ...fail(e instanceof Error && e.message === "tool_timeout" ? "tool_timeout" : "tool_failed"), args: v.value };
  }
}
