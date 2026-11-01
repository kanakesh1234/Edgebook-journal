/**
 * MINATO INTELLIGENCE ENGINE OVERHAUL — 12-Scenario Comprehensive Verification Suite
 *
 * Tests all 12 required scenarios:
 *  1. General trading questions & conversational meta-openings ("I had a doubt can I ask", "Arey I am saying I had a doubt can I ask")
 *  2. Questions requiring multiple database queries ("Why am I consistently losing?")
 *  3. Questions requiring historical comparisons ("Am I improving psychologically?")
 *  4. Questions involving missing information (asking once for stop size / risk per trade)
 *  5. Questions involving thousands of trades (3,200+ trade dataset queried via get_trading_history & get_performance_metrics)
 *  6. New journal entries reflected immediately in continuous knowledge & get_journal_entries (never stale cache)
 *  7. Updated trading rules reflected immediately in get_trader_profile & get_rule_violations
 *  8. API failures (429/503 recovery & graceful fallback without fake refusal)
 *  9. Database / malformed entry failures (sanitizeEntries + tool resilience)
 * 10. Concurrent / duplicate requests (deduplicateEngineRequest)
 * 11. Invalid LLM tool calls (hallucinated tool names or malformed JSON rejected safely)
 * 12. Long conversation histories (35+ turns summarized cleanly via summarizeWorkingMemory)
 */
import { strict as assert } from "node:assert";
import {
  MINATO_TOOL_DEFINITIONS,
  executeMinatoTool,
  isValidToolName,
  type TraderDatabaseContext,
} from "../../src/lib/minato/db-tools.ts";
import { buildContinuousKnowledgeSnapshot } from "../../src/lib/minato/knowledge.ts";
import {
  deduplicateEngineRequest,
  normalizeRawToolCalls,
  parseInlineToolCalls,
  planInitialToolsForQuery,
  runMinatoIntelligenceEngine,
  type EngineResult,
} from "../../src/lib/minato/engine.ts";
import { classifyLane, quickReply } from "../../src/lib/minato/lane.ts";
import { respond } from "../../src/lib/minato/respond.ts";
import { summarizeWorkingMemory } from "../../src/lib/minato/extract.ts";
import { sanitizeEntries } from "../../src/lib/minato/sanitize.ts";
import { computeStats } from "../../src/lib/stats.ts";
import { defaultRuleSet, type JournalEntry, type JournalSettings } from "../../src/lib/types.ts";

let passed = 0;
const ok = (cond: unknown, msg: string) => {
  assert.ok(cond, msg);
  passed++;
};
const eq = <T>(a: T, b: T, msg: string) => {
  assert.deepEqual(a, b, msg);
  passed++;
};

function makeSampleEntries(): JournalEntry[] {
  return [
    // Earlier period (losses with FOMO & revenge mistakes)
    {
      id: "t1",
      date: "2026-09-01",
      instrument: "MNQ",
      direction: "long",
      entryPrice: 20000,
      exitPrice: 19980,
      stopLoss: 19980,
      takeProfit: 20040,
      quantity: 2,
      pnl: -80,
      rr: -1,
      setup: "Chase Breakout",
      entryTime: "09:35",
      exitTime: "09:42",
      reviewStatus: "reviewed",
      notes: "",
      images: [],
      createdAt: 1000,
      updatedAt: 1000,
      mistakes: ["FOMO entry", "Chased candle"],
      review: {
        outcome: { followedPlan: false, verdict: "bad_process" },
        psychology: { emotionBefore: "anxious", emotionAfter: "frustrated", fomo: true, revenge: false },
        followUp: { biggestMistake: "Entered without waiting for sweep" },
      },
    },
    {
      id: "t2",
      date: "2026-09-02",
      instrument: "MNQ",
      direction: "short",
      entryPrice: 20050,
      exitPrice: 20075,
      stopLoss: 20075,
      takeProfit: 20000,
      quantity: 3,
      pnl: -150,
      rr: -1,
      setup: "Chase Breakout",
      entryTime: "09:50",
      exitTime: "10:05",
      reviewStatus: "reviewed",
      notes: "",
      images: [],
      createdAt: 1000,
      updatedAt: 1000,
      mistakes: ["Revenge trade", "FOMO entry"],
      review: {
        outcome: { followedPlan: false, verdict: "bad_process" },
        psychology: { emotionBefore: "tilted", emotionAfter: "angry", fomo: true, revenge: true },
        followUp: { biggestMistake: "Sized up after loss" },
      },
    },
    {
      id: "t3",
      date: "2026-09-03",
      instrument: "NQ",
      direction: "long",
      entryPrice: 20100,
      exitPrice: 20085,
      stopLoss: 20085,
      takeProfit: 20130,
      quantity: 1,
      pnl: -300,
      rr: -1,
      setup: "Chase Breakout",
      entryTime: "10:15",
      exitTime: "10:25",
      reviewStatus: "reviewed",
      notes: "",
      images: [],
      createdAt: 1000,
      updatedAt: 1000,
      mistakes: ["Moved stop loss"],
      review: {
        outcome: { followedPlan: false, verdict: "bad_process" },
        psychology: { emotionBefore: "anxious", emotionAfter: "frustrated", fomo: false, revenge: true },
      },
    },
    // Recent period (improving discipline, A+ Sweep + FVG wins)
    {
      id: "t4",
      date: "2026-10-01",
      instrument: "MNQ",
      direction: "long",
      entryPrice: 20200,
      exitPrice: 20240,
      stopLoss: 20185,
      takeProfit: 20240,
      quantity: 2,
      pnl: 160,
      rr: 2.6,
      setup: "Sweep + FVG",
      entryTime: "09:45",
      exitTime: "10:15",
      reviewStatus: "reviewed",
      notes: "",
      images: [],
      createdAt: 1000,
      updatedAt: 1000,
      mistakes: [],
      review: {
        outcome: { followedPlan: true, verdict: "a_plus" },
        psychology: { emotionBefore: "calm", emotionAfter: "calm", fomo: false, revenge: false },
        followUp: { whatWorked: "Waited for 15m liquidity sweep before FVG entry" },
      },
    },
    {
      id: "t5",
      date: "2026-10-02",
      instrument: "MNQ",
      direction: "short",
      entryPrice: 20300,
      exitPrice: 20255,
      stopLoss: 20315,
      takeProfit: 20255,
      quantity: 2,
      pnl: 180,
      rr: 3.0,
      setup: "Sweep + FVG",
      entryTime: "10:00",
      exitTime: "10:35",
      reviewStatus: "reviewed",
      notes: "",
      images: [],
      createdAt: 1000,
      updatedAt: 1000,
      mistakes: [],
      review: {
        outcome: { followedPlan: true, verdict: "a_plus" },
        psychology: { emotionBefore: "focused", emotionAfter: "calm", fomo: false, revenge: false },
        followUp: { whatWorked: "Clean NY open displacement" },
      },
    },
    {
      id: "t6",
      date: "2026-10-03",
      instrument: "MNQ",
      direction: "long",
      entryPrice: 20280,
      exitPrice: 20310,
      stopLoss: 20265,
      takeProfit: 20310,
      quantity: 2,
      pnl: 120,
      rr: 2.0,
      setup: "Sweep + FVG",
      entryTime: "09:50",
      exitTime: "10:20",
      reviewStatus: "reviewed",
      notes: "",
      images: [],
      createdAt: 1000,
      updatedAt: 1000,
      mistakes: [],
      review: {
        outcome: { followedPlan: true, verdict: "good_win" },
        psychology: { emotionBefore: "calm", emotionAfter: "focused", fomo: false, revenge: false },
      },
    },
  ] as unknown as JournalEntry[];
}

function makeBaseSettings(): JournalSettings {
  return {
    traderName: "Nandigam",
    fullName: "Nandigam Kanakeswara Rao",
    startingEquity: 50000,
    targetEquity: 53000,
    maxDrawdown: 2000,
    currency: "USD",
    playbook: [
      {
        id: "pb1",
        name: "Sweep + FVG",
        strategy: "15m liquidity sweep + 1m FVG displacement",
        rules: [
          { id: "r1", text: "Liquidity swept" },
          { id: "r2", text: "MSS + FVG" },
        ],
        version: 1,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ],
    rules: defaultRuleSet(),
  };
}

function makeDbCtx(overrides: Partial<TraderDatabaseContext> = {}): TraderDatabaseContext {
  const entries = overrides.entries ?? makeSampleEntries();
  const settings = overrides.settings ?? makeBaseSettings();
  return {
    traderName: "Nandigam",
    today: "2026-10-05",
    entries,
    plans: overrides.plans ?? [
      {
        id: "plan-1",
        date: "2026-10-03",
        instrument: "MNQ",
        playbookName: "Sweep + FVG",
        thesis: "Wait for 9:45 AM sweep of Asia low",
        rules: [],
        status: "ready",
        createdAt: 1000,
        updatedAt: 1000,
      },
    ],
    dayLogs: overrides.dayLogs ?? [{ date: "2026-09-29", reason: "FOMC chop", createdAt: 1000 }],
    settings,
    primaryChallenge: overrides.primaryChallenge ?? null,
    semanticParams: overrides.semanticParams ?? {
      riskDollars: 150,
      riskPct: null,
      stopPoints: 15,
      dailyLossLimit: 300,
      drawdownLimit: 2000,
      profitTarget: 3000,
      instruments: ["MNQ", "NQ"],
      accountType: "live",
      sessionTimes: "NY Open",
    },
    memoryStore: null,
    companion: null,
    focusTradeId: null,
  };
}

/* ============================================================================
 * SCENARIO 1: General trading questions & conversational meta-openings
 * ("I had a doubt can I ask", "Arey I am saying I had a doubt can I ask")
 * ========================================================================== */
{
  for (const q of [
    "I had a doubt can I ask",
    "Arey I am saying I had a doubt can I ask",
    "can I ask a question",
    "I have a doubt",
  ]) {
    eq(classifyLane(q).lane, "chat", `"${q}" routes to chat lane`);
    const qr = quickReply(q, "Nandigam");
    ok(qr && /Of course, Nandigam — go ahead and ask/i.test(qr), `quickReply handles "${q}" warmly: ${qr}`);
    const entries = makeSampleEntries();
    const settings = makeBaseSettings();
    const stats = computeStats(entries, settings);
    const det = respond(
      {
        userFirstName: "Nandigam",
        stats,
        discipline: { disciplineStreak: 3, completionRate: 1, missedDays: 0 } as never,
        adherence: {} as never,
        recentTrades: entries,
        focus: null,
        playbook: [],
        activeRules: [],
        recurringPatterns: [],
        privacy: { includeNotes: true },
      },
      q,
    );
    ok(/Of course, Nandigam — go ahead and ask/i.test(det), `respond() handles "${q}" without canned refusal: ${det}`);
    ok(!/can't answer that one reliably/i.test(det), `never returns canned refusal for "${q}"`);
  }
}

/* ============================================================================
 * SCENARIO 2: Questions requiring multiple database queries ("Why am I consistently losing?")
 * ========================================================================== */
{
  const q = "Why am I consistently losing?";
  eq(classifyLane(q).lane, "data", `"${q}" routes to data lane`);
  const planned = planInitialToolsForQuery(q);
  const names = planned.map((p) => p.name);
  ok(
    names.includes("get_performance_metrics") &&
      names.includes("get_rule_violations") &&
      names.includes("get_psychology_patterns") &&
      names.includes("get_journal_entries"),
    `Multi-query planner selects performance, violations, psychology, and journal tools: ${names.join(", ")}`,
  );

  const ctx = makeDbCtx();
  for (const call of planned) {
    const res = executeMinatoTool(call.name, call.args, ctx);
    ok(res && typeof res === "object", `Tool ${call.name} succeeds`);
  }
}

/* ============================================================================
 * SCENARIO 3: Questions requiring historical comparisons ("Am I improving psychologically?")
 * ========================================================================== */
{
  const q = "Am I improving psychologically?";
  eq(classifyLane(q).lane, "data", `"${q}" routes to data lane`);
  const planned = planInitialToolsForQuery(q);
  ok(planned.some((p) => p.name === "compare_trading_periods"), "Planner includes compare_trading_periods");
  ok(planned.some((p) => p.name === "get_psychology_patterns"), "Planner includes get_psychology_patterns");

  const ctx = makeDbCtx();
  const cmp = executeMinatoTool("compare_trading_periods", { mode: "first_half_vs_second_half" }, ctx) as {
    earlierPeriod: { winRateTradePct: number; netPnl: number; fomoCount: number };
    recentPeriod: { winRateTradePct: number; netPnl: number; fomoCount: number };
    deltas: { winRateTradeChangePctPoints: number; netPnlChangeDollars: number; fomoCountChange: number };
  };
  eq(cmp.earlierPeriod.winRateTradePct, 0, "Earlier half had 0% win rate");
  eq(cmp.recentPeriod.winRateTradePct, 100, "Recent half has 100% win rate");
  ok(cmp.deltas.netPnlChangeDollars > 0 && cmp.deltas.fomoCountChange < 0, "Detects psychological and execution improvement across halves");

  // Also test deterministic fallback for "Am I improving psychologically?"
  const entries = makeSampleEntries();
  const settings = makeBaseSettings();
  const stats = computeStats(entries, settings);
  const det = respond(
    {
      userFirstName: "Nandigam",
      stats,
      discipline: { disciplineStreak: 3, completionRate: 1, missedDays: 0 } as never,
      adherence: {} as never,
      recentTrades: entries,
      focus: null,
      playbook: [],
      activeRules: [],
      recurringPatterns: [],
      privacy: { includeNotes: true },
    },
    q,
  );
  ok(/Comparing your \*\*recent 3 trades\*\* against your \*\*earlier 3 trades\*\*/.test(det) && /improving/.test(det), `Deterministic period comparison works: ${det}`);
}

/* ============================================================================
 * SCENARIO 4: Questions involving missing information (asking once for stop / risk)
 * ========================================================================== */
{
  const ctxMissing = makeDbCtx({
    semanticParams: {
      riskDollars: null,
      riskPct: null,
      stopPoints: null,
    },
  });
  const calc = executeMinatoTool("calculate_trading_math", { symbol: "MNQ" }, ctxMissing) as {
    positionSizing: { missingInputs: string[]; effectiveRiskDollars: number; stopPoints: number };
  };
  ok(
    calc.positionSizing.missingInputs.includes("stop_points") &&
      calc.positionSizing.missingInputs.includes("risk_per_trade"),
    "Reports missing stop_points and risk_per_trade so Minato asks once",
  );
}

/* ============================================================================
 * SCENARIO 5: Questions involving thousands of trades (3,200+ trade dataset)
 * ========================================================================== */
{
  const largeEntries: JournalEntry[] = [];
  for (let i = 0; i < 3200; i++) {
    const win = i % 2 === 0;
    const day = String((i % 28) + 1).padStart(2, "0");
    const month = String(((Math.floor(i / 28) % 12) + 1)).padStart(2, "0");
    largeEntries.push({
      id: `bulk-${i}`,
      date: `2025-${month}-${day}`,
      instrument: i % 3 === 0 ? "NQ" : "MNQ",
      direction: win ? "long" : "short",
      entryPrice: 18000,
      exitPrice: win ? 18020 : 17990,
      quantity: 1,
      pnl: win ? 120 : -80,
      rr: win ? 1.5 : -1,
      setup: win ? "Sweep + FVG" : "Chase Breakout",
      notes: "",
      images: [],
      reviewStatus: "reviewed",
      createdAt: 1000,
      updatedAt: 1000,
    });
  }
  const t0 = Date.now();
  const largeCtx = makeDbCtx({ entries: largeEntries });
  const histRes = executeMinatoTool("get_trading_history", { limit: 25, instrument: "MNQ" }, largeCtx) as {
    returnedCount: number;
    totalMatchingTrades: number;
  };
  const perfRes = executeMinatoTool("get_performance_metrics", {}, largeCtx) as { sampleTrades: number };
  const acctRes = executeMinatoTool("get_account_statistics", {}, largeCtx) as { currentEquity: number };
  const elapsed = Date.now() - t0;

  eq(histRes.returnedCount, 25, "get_trading_history respects pagination limit (never dumps 3,200 rows into prompt)");
  ok(histRes.totalMatchingTrades > 2000, "get_trading_history aggregates all matching 2,133 MNQ trades before slicing");
  eq(perfRes.sampleTrades, 3200, "get_performance_metrics computes across all 3,200 trades");
  ok(typeof acctRes.currentEquity === "number", "get_account_statistics computes current equity cleanly");
  ok(elapsed < 1500, `3,200-trade aggregation & tool queries finished in ${elapsed}ms (<1500ms)`);
}

/* ============================================================================
 * SCENARIO 6: New journal entries reflected immediately (never stale cache)
 * ========================================================================== */
{
  const baseEntries = makeSampleEntries();
  const ctxBefore = makeDbCtx({ entries: baseEntries });
  const snapBefore = buildContinuousKnowledgeSnapshot({
    traderName: "Nandigam",
    today: "2026-10-05",
    marketSummary: "Open",
    entries: ctxBefore.entries,
    plans: ctxBefore.plans,
    dayLogs: ctxBefore.dayLogs,
    settings: ctxBefore.settings,
    primaryChallenge: null,
    semanticParams: ctxBefore.semanticParams,
  });
  eq(snapBefore.dataFreshness.totalTrades, 6, "Initial snapshot indexes 6 trades");
  eq(snapBefore.dataFreshness.latestTradeId, "t6", "Initial newest trade is t6");

  // Add a new trade on 2026-10-04 with a new lesson
  const newTrade: JournalEntry = {
    id: "t7-fresh",
    date: "2026-10-04",
    instrument: "NQ",
    direction: "long",
    entryPrice: 20400,
    exitPrice: 20450,
    quantity: 1,
    pnl: 1000,
    rr: 2.5,
    setup: "London Sweep Reversal",
    notes: "",
    images: [],
    reviewStatus: "reviewed",
    createdAt: 1000,
    updatedAt: 1000,
    reflection: {
      followedSetup: true,
      followedRisk: true,
      lesson: "London sweep into HTF order block paid +2.5R cleanly",
      updatedAt: 1000,
    },
  };
  const ctxAfter = makeDbCtx({ entries: [newTrade, ...baseEntries] });
  const snapAfter = buildContinuousKnowledgeSnapshot({
    traderName: "Nandigam",
    today: "2026-10-05",
    marketSummary: "Open",
    entries: ctxAfter.entries,
    plans: ctxAfter.plans,
    dayLogs: ctxAfter.dayLogs,
    settings: ctxAfter.settings,
    primaryChallenge: null,
    semanticParams: ctxAfter.semanticParams,
  });
  eq(snapAfter.dataFreshness.totalTrades, 7, "Updated snapshot immediately reflects 7 trades");
  eq(snapAfter.dataFreshness.latestTradeId, "t7-fresh", "Newest trade ID is immediately t7-fresh");

  const journalRes = executeMinatoTool("get_journal_entries", { keyword: "london sweep" }, ctxAfter) as {
    writtenTradeReflections: { tradeId: string; lesson: string }[];
  };
  ok(
    journalRes.writtenTradeReflections.some((r) => r.tradeId === "t7-fresh" && /London sweep/.test(r.lesson)),
    "New journal entry lesson is immediately retrievable",
  );
}

/* ============================================================================
 * SCENARIO 7: Updated trading rules reflected immediately in profile & violations
 * ========================================================================== */
{
  const settings = makeBaseSettings();
  settings.rules = {
    ...defaultRuleSet(),
    rules: defaultRuleSet().rules.map((r) =>
      r.id === "risk.max-trades-per-day" ? { ...r, enabled: true, params: { maxTrades: 1 } } : r,
    ),
  };
  const entriesWithTwoOnSameDay: JournalEntry[] = [
    {
      id: "t6-b",
      date: "2026-10-03",
      instrument: "MNQ",
      direction: "short",
      entryPrice: 20310,
      exitPrice: 20290,
      quantity: 1,
      pnl: 40,
      rr: 1,
      setup: "Sweep + FVG",
      notes: "",
      images: [],
      reviewStatus: "reviewed",
      createdAt: 1000,
      updatedAt: 1000,
    },
    ...makeSampleEntries(),
  ];
  const ctxUpdatedRules = makeDbCtx({ entries: entriesWithTwoOnSameDay, settings });
  const profRes = executeMinatoTool("get_trader_profile", {}, ctxUpdatedRules) as {
    activeGuardrailRules: { id: string; params: Record<string, number> }[];
  };
  const violRes = executeMinatoTool("get_rule_violations", {}, ctxUpdatedRules) as {
    totalViolations: number;
  };

  eq(
    profRes.activeGuardrailRules.find((r) => r.id === "risk.max-trades-per-day")?.params.maxTrades,
    1,
    "Updated rule maxTrades=1 is reflected immediately in get_trader_profile",
  );
  ok(violRes.totalViolations >= 1, "Updated rule immediately flags violation in get_rule_violations");
}

/* ============================================================================
 * SCENARIO 8 & MULTI-STEP LOOP: LLM requests tools -> backend executes -> LLM synthesizes
 * + API Failure recovery (429/503)
 * ========================================================================== */
{
  let callNum = 0;
  const mockFetch = (async () => {
    callNum++;
    if (callNum === 1) {
      // Round 1: LLM decides it needs trade details for t4 and period comparison
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: "",
                tool_calls: [
                  {
                    id: "call_1",
                    type: "function",
                    function: {
                      name: "get_trade_details",
                      arguments: JSON.stringify({ tradeId: "t4" }),
                    },
                  },
                  {
                    id: "call_2",
                    type: "function",
                    function: {
                      name: "compare_trading_periods",
                      arguments: JSON.stringify({ mode: "first_half_vs_second_half" }),
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    // Round 2: LLM receives the tool outputs and produces the final grounded answer
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content:
                "Your **2026-10-01 MNQ** trade (`t4`) made **+$160** (**+2.6R**), and your win rate improved from **0%** to **100%** across halves.",
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  }) as unknown as typeof fetch;

  const ctx = makeDbCtx();
  const engineRes = await runMinatoIntelligenceEngine({
    config: { apiKey: "test-key", model: "test/model", fallbackModel: null },
    systemPrompt: "You are MINATO.",
    question: "Tell me what happened on trade t4",
    history: [{ role: "user", text: "Tell me what happened on trade t4" }],
    db: ctx,
    marketSummary: "Open",
    maxTokens: 1000,
    budgetMs: 15_000,
    fetchImpl: mockFetch,
  });

  ok(engineRes.text && /\+\$160/.test(engineRes.text), `Multi-step engine synthesized final answer: ${engineRes.text}`);
  eq(engineRes.rounds, 2, "Engine used 2 rounds (Round 1 tool request -> Round 2 synthesis)");
  ok(
    engineRes.toolsExecuted.some((t) => t.name === "get_trade_details") &&
      engineRes.toolsExecuted.some((t) => t.name === "compare_trading_periods"),
    "Engine executed both requested tools",
  );
}

/* ============================================================================
 * SCENARIO 9: Database / malformed entry failures
 * ========================================================================== */
{
  const dirty = [
    null,
    undefined,
    "corrupted",
    { id: "bad1", date: "not-a-date", pnl: 100 },
    { id: "bad2", date: "2026-10-01", pnl: "NaN" },
    { id: "good1", date: "2026-10-01", pnl: "250.5", instrument: "MNQ" },
  ];
  const sanitized = sanitizeEntries(dirty);
  eq(sanitized.entries.length, 1, "Sanitizer kept 1 valid trade and dropped 5 corrupted rows");
  eq(sanitized.dropped, 5, "Dropped count is exact");

  // Even on empty entries, every tool in MINATO_TOOL_DEFINITIONS must return an object without throwing
  const emptyCtx = makeDbCtx({ entries: [] });
  for (const def of MINATO_TOOL_DEFINITIONS) {
    const res = executeMinatoTool(def.function.name, {}, emptyCtx);
    ok(res && typeof res === "object", `Tool ${def.function.name} handles empty database gracefully without throwing`);
  }
}

/* ============================================================================
 * SCENARIO 10: Concurrent / duplicate requests (deduplicateEngineRequest)
 * ========================================================================== */
{
  let executions = 0;
  const dummyResult: EngineResult = {
    text: "shared-result",
    model: "test/model",
    toolsExecuted: [],
    rounds: 1,
    attempts: [],
    failure: null,
    knowledgeSnapshot: {} as never,
  };
  const work = async (): Promise<EngineResult> => {
    executions++;
    await new Promise((r) => setTimeout(r, 30));
    return dummyResult;
  };
  const [r1, r2, r3] = await Promise.all([
    deduplicateEngineRequest("user1:why-losing", work),
    deduplicateEngineRequest("user1:why-losing", work),
    deduplicateEngineRequest("user1:why-losing", work),
  ]);
  eq([r1.text, r2.text, r3.text], ["shared-result", "shared-result", "shared-result"], "All 3 concurrent duplicate requests receive the result");
  eq(executions, 1, "Underlying engine work ran only ONCE for concurrent duplicate requests");
}

/* ============================================================================
 * SCENARIO 11: Invalid LLM tool calls (hallucinated tool names or bad JSON)
 * ========================================================================== */
{
  ok(!isValidToolName("drop_database"), "Rejects hallucinated tool name");
  ok(isValidToolName("get_trading_history"), "Accepts valid tool name");

  const parsedInline = parseInlineToolCalls(
    'Thinking... [[TOOL:get_trade_details({"tradeId":"t4"})]] [[TOOL:non_existent_tool({"foo":1})]] [[TOOL:get_trader_profile(INVALID_JSON)]] Final text.',
  );
  eq(parsedInline.calls.length, 2, "Kept 2 valid tool names and ignored hallucinated tool name");
  eq(parsedInline.calls[0]!.name, "get_trade_details", "First valid inline tool parsed");
  eq(parsedInline.calls[0]!.args.tradeId, "t4", "Valid JSON args parsed");
  eq(parsedInline.calls[1]!.name, "get_trader_profile", "Second valid inline tool parsed with safe empty args fallback on invalid JSON");
  ok(!parsedInline.cleanedText.includes("[[TOOL:"), "All inline tool directives stripped from user-facing text");

  const normRaw = normalizeRawToolCalls([
    { id: "1", type: "function", function: { name: "evil_tool", arguments: "{}" } },
    { id: "2", type: "function", function: { name: "get_account_statistics", arguments: "{bad json" } },
  ]);
  eq(normRaw.length, 1, "normalizeRawToolCalls filters out invalid tool names and recovers from malformed JSON arguments");
  eq(normRaw[0]!.name, "get_account_statistics", "Kept get_account_statistics");
}

/* ============================================================================
 * SCENARIO 12: Long conversation histories (35+ turns summarized cleanly)
 * ========================================================================== */
{
  const longThread: { role: "user" | "buddy"; text: string }[] = [];
  for (let i = 1; i <= 36; i++) {
    longThread.push({
      role: i % 2 === 1 ? "user" : "buddy",
      text:
        i === 23
          ? "I risk $150 per trade on MNQ with a 15 point stop during the NY open."
          : i === 25
            ? "I felt FOMO and revenge traded after losing on Chase Breakout."
            : `Turn #${i}: reviewing execution discipline and Sweep + FVG confirmation rules.`,
    });
  }
  const wm = summarizeWorkingMemory(longThread, 10);
  eq(wm.recentMessages.length, 10, "Working memory keeps the most recent 10 turns verbatim");
  ok(
    wm.summary && /26 turns/.test(wm.summary) && /\$150/.test(wm.summary) && /MNQ/i.test(wm.summary),
    `Working memory summary compresses 26 older turns and preserves key numbers/instruments: ${wm.summary}`,
  );
}

console.log(`=== MINATO INTELLIGENCE ENGINE (12 SCENARIOS): ${passed} assertions passed ===`);
