/**
 * MINATO EVALUATION & REGRESSION TEST SUITE (20 Sample Questions & Scenarios)
 *
 * Covers:
 *  1. Exact user bug reproduction ("with this win rate, what's the maximum longest losing streak possible,
 *     and the position size for NQ micro or mini with exact numbers") — verifies it NEVER returns
 *     the unrelated directional/instrument breakdown and always computes exact numbers.
 *  2. Streak probability closed-form & seeded 10,000-run Monte Carlo calculations.
 *  3. Position sizing formula `contracts = floor(risk_$ / (stop_points × point_value))` for NQ ($20/pt) and MNQ ($2/pt).
 *  4. Missing input detection (asks once when stop size or risk % is missing, then saves to semantic memory).
 *  5. Expectancy, profit factor, average R, and drawdown room calculations.
 *  6. Semantic memory extraction, deduplication, and contradiction superseding (keeping history).
 *  7. Episodic memory & journal recall + hybrid retrieval within token budget.
 *  8. Trader name resolution (never calling the user by email handle / digit ID like `kanakesh939264`)
 *     and EdgeBook website blueprint navigation guidance.
 */

import { strict as assert } from "node:assert";
import { journal } from "./fixtures.ts";
import { routeIntent, planFor } from "../../src/lib/minato/router.ts";
import {
  computeExpectancyStatsTool,
  computePositionSizingTool,
  computeStreakTool,
  exactLosingStreakProbability,
} from "../../src/lib/minato/tools.ts";
import {
  applyExtractedMemories,
  extractStructuredMemoriesFromTurn,
  readUserSemanticParams,
  summarizeWorkingMemory,
} from "../../src/lib/minato/extract.ts";
import { respond } from "../../src/lib/minato/respond.ts";
import { resolveTraderFirstName } from "../../src/lib/minato/blueprint.ts";
import { buildContext } from "../../src/lib/minato/context.ts";
import { computeStats } from "../../src/lib/stats.ts";
import { disciplineSummary } from "../../src/lib/discipline.ts";
import { adherenceSummary, evaluateRules } from "../../src/lib/rules.ts";
import { emptyBrain } from "../../src/lib/minato/brain-ml.ts";
import { evolveMemory } from "../../src/lib/minato/evolve.ts";
import { memoryForModel } from "../../src/lib/minato/retrieve.ts";
import { applyMemoryOp } from "../../src/lib/minato/bridge.ts";
import { defaultSettings, type JournalEntry } from "../../src/lib/types.ts";

const NOW = Date.UTC(2026, 9, 31, 14, 0, 0);
const entries: JournalEntry[] = journal({ days: 40, breakAfterLoss: 0.3, breakBase: 0.1, seed: 42 }).map((e, i) => ({
  ...e,
  instrument: i % 2 === 0 ? "MNQ" : "NQ",
  direction: i % 3 === 0 ? "short" : "long",
  pnl: i % 5 === 0 ? -120 : i % 5 === 1 ? -80 : 180, // ~60% win rate
  rr: i % 5 <= 1 ? -1 : 1.8,
  notes: i === 0 ? "Waited for NY open liquidity sweep and entered on FVG retest" : e.notes,
}));

const settings = {
  ...defaultSettings(),
  startingEquity: 50000,
  targetEquity: 53000,
  maxDrawdown: 2000,
};

const stats = computeStats(entries, settings);
const discipline = disciplineSummary(entries, []);
const violations = evaluateRules(entries, settings);
const adherence = adherenceSummary(entries, settings);
const ctx = buildContext({
  userFirstName: "NANDIGAM KANAKESWARA RAO",
  entries,
  stats,
  discipline,
  adherence,
  playbook: [],
  activeRules: [],
  violations,
  focusEntry: null,
  includeNotes: true,
});

interface EvalCase {
  id: string;
  question: string;
  run: () => { pass: boolean; detail: string };
}

const EVAL_CASES: EvalCase[] = [
  {
    id: "Q01_EXACT_BUG_REPRO",
    question: "with this win rate, what's the maximum longest losing streak possible, and the position size for NQ micro or mini with exact numbers",
    run: () => {
      const route = routeIntent(
        "with this win rate, what's the maximum longest losing streak possible, and the position size for NQ micro or mini with exact numbers",
      );
      const reply = respond(
        ctx,
        "with this win rate, what's the maximum longest losing streak possible, and the position size for NQ micro or mini with exact numbers",
        { semanticParams: { riskDollars: 200, stopPoints: 20 }, startingEquity: 50000, maxDrawdown: 2000 },
      );
      const noDirectionalBreakdown = !reply.includes("Directional & Instrument Breakdown");
      const hasStreakMath = /expected maximum losing streak/i.test(reply) && /10,000-run Monte Carlo/i.test(reply);
      const hasSizingMath = /MNQ \(\$2\/pt\)/i.test(reply) && /NQ \(\$20\/pt\)/i.test(reply) && /floor\(/i.test(reply);
      const pass =
        route.intent === "calculation" &&
        route.toolsToCall.includes("streak_probability") &&
        route.toolsToCall.includes("position_sizing") &&
        noDirectionalBreakdown &&
        hasStreakMath &&
        hasSizingMath;
      return {
        pass,
        detail: `intent=${route.intent}, tools=${route.toolsToCall.join("+")}, noDirBreakdown=${noDirectionalBreakdown}`,
      };
    },
  },
  {
    id: "Q02_STREAK_PROBABILITY_EXACT_AND_MC",
    question: "What is the probability of a losing streak >= 5 in 100 trades with a 60% win rate?",
    run: () => {
      const exact = exactLosingStreakProbability(0.6, 100, 5);
      const res = computeStreakTool({ entries, overrideWinRate: 0.6, horizonTrades: 100, targetK: 5, runs: 10000, seed: 42 });
      const p5 = res.monteCarlo.probabilities.find((p) => p.k === 5);
      const pass =
        exact > 0.45 &&
        exact < 0.75 &&
        !!p5 &&
        Math.abs(p5.exactProbPct - p5.mcProbPct) < 3.5 &&
        res.monteCarlo.runs === 10000;
      return {
        pass,
        detail: `exact=${(exact * 100).toFixed(1)}%, mc=${p5?.mcProbPct}%, closedFormMax=${res.expectedMaxLosingStreakClosedForm}`,
      };
    },
  },
  {
    id: "Q03_POSITION_SIZING_MNQ_VS_NQ_FORMULA",
    question: "Calculate exact contract size for MNQ and NQ with $250 risk and a 25 point stop",
    run: () => {
      // MNQ: floor(250 / (25 * 2)) = floor(250 / 50) = 5 contracts
      // NQ:  floor(250 / (25 * 20)) = floor(250 / 500) = 0 contracts
      const res = computePositionSizingTool({
        entries,
        settings,
        symbol: "MNQ",
        stopPoints: 25,
        riskDollars: 250,
      });
      const mnq = res.primary.symbol === "MNQ" ? res.primary : res.comparison;
      const nq = res.primary.symbol === "NQ" ? res.primary : res.comparison;
      const pass =
        mnq.contracts === 5 &&
        mnq.actualDollarRisk === 250 &&
        nq.contracts === 0 &&
        nq.riskPerContractDollars === 500 &&
        res.missingInputs.length === 0;
      return {
        pass,
        detail: `MNQ=${mnq.contracts} ($${mnq.actualDollarRisk}), NQ=${nq.contracts} ($${nq.riskPerContractDollars}/contract)`,
      };
    },
  },
  {
    id: "Q04_POSITION_SIZING_MISSING_INPUTS_PROMPT",
    question: "How many MNQ contracts should I trade right now?",
    run: () => {
      const reply = respond(ctx, "How many MNQ contracts should I trade right now?", {
        semanticParams: {}, // neither stopPoints nor riskDollars in memory
        startingEquity: 50000,
        maxDrawdown: 2000,
      });
      const asksOnce = /Quick check/i.test(reply) && /isn't saved in memory yet/i.test(reply);
      const showsFormula = /floor\(/i.test(reply);
      return {
        pass: asksOnce && showsFormula,
        detail: `asksForMissing=${asksOnce}, showsWorking=${showsFormula}`,
      };
    },
  },
  {
    id: "Q05_SAVE_MISSING_INPUTS_TO_MEMORY_AND_REUSE",
    question: "My stop is 15 points and I risk $150 per trade",
    run: () => {
      const extracted = extractStructuredMemoriesFromTurn({
        text: "My stop is 15 points and I risk $150 per trade",
        pendingQuestionSlot: "both",
        now: NOW,
      });
      const { brain } = applyExtractedMemories(emptyBrain(), extracted, NOW);
      const sem = readUserSemanticParams(brain.memory);
      // Now ask sizing question again — should use $150 and 15 pts -> floor(150 / (15 * 2)) = 5 MNQ contracts, no missing prompt!
      const reply = respond(ctx, "What is my position size for MNQ micro or mini now?", {
        semanticParams: sem,
        startingEquity: 50000,
        maxDrawdown: 2000,
      });
      const noMissingPrompt = !/isn't saved in memory yet/i.test(reply);
      const usesSavedValues =
        reply.includes("$150") &&
        /15(?:-point|-pt) stop/i.test(reply) &&
        /\*\*5 contracts\*\*|\*\*5 MNQ/i.test(reply);
      return {
        pass: sem.stopPoints === 15 && sem.riskDollars === 150 && noMissingPrompt && usesSavedValues,
        detail: `savedStop=${sem.stopPoints}pt, savedRisk=$${sem.riskDollars}, usesSaved=${usesSavedValues}`,
      };
    },
  },
  {
    id: "Q06_CONTRADICTION_SUPERSEDING_RISK_LIMIT",
    question: "Update risk per trade from $200 to $100 and verify old fact is marked superseded",
    run: () => {
      const turn1 = extractStructuredMemoriesFromTurn({ text: "My risk per trade is $200", now: NOW });
      let state = applyExtractedMemories(emptyBrain(), turn1, NOW).brain;
      const turn2 = extractStructuredMemoriesFromTurn({ text: "I changed my risk to $100 per trade", now: NOW + 60_000 });
      const res2 = applyExtractedMemories(state, turn2, NOW + 60_000);
      state = res2.brain;

      const oldItem = state.memory?.items["sem:risk_per_trade:200usd"];
      const newItem = state.memory?.items["sem:risk_per_trade:100usd"];
      const sem = readUserSemanticParams(state.memory);

      const pass =
        oldItem?.status === "superseded" &&
        oldItem?.supersededBy === "sem:risk_per_trade:100usd" &&
        newItem?.status === "established" &&
        sem.riskDollars === 100;
      return {
        pass,
        detail: `oldStatus=${oldItem?.status}, supersededBy=${oldItem?.supersededBy}, activeRisk=$${sem.riskDollars}`,
      };
    },
  },
  {
    id: "Q07_CONTRADICTION_SUPERSEDING_ACCOUNT_TYPE",
    question: "Switch account type from paper to funded prop account",
    run: () => {
      const t1 = extractStructuredMemoriesFromTurn({ text: "I am trading on a paper account", now: NOW });
      let b = applyExtractedMemories(emptyBrain(), t1, NOW).brain;
      const t2 = extractStructuredMemoriesFromTurn({ text: "I switched to a funded prop account", now: NOW + 120_000 });
      b = applyExtractedMemories(b, t2, NOW + 120_000).brain;

      const paperItem = b.memory?.items["sem:account_type:paper"];
      const fundedItem = b.memory?.items["sem:account_type:funded-prop"];
      const sem = readUserSemanticParams(b.memory);

      const pass =
        paperItem?.status === "superseded" &&
        paperItem?.supersededBy === "sem:account_type:funded-prop" &&
        fundedItem?.status === "established" &&
        sem.accountType === "funded prop";
      return {
        pass,
        detail: `paper=${paperItem?.status}, funded=${fundedItem?.status}, current=${sem.accountType}`,
      };
    },
  },
  {
    id: "Q08_EXPECTANCY_PROFIT_FACTOR_AND_AVG_R",
    question: "What is my expectancy, profit factor, and average R across my journal?",
    run: () => {
      const exp = computeExpectancyStatsTool(entries, settings);
      const reply = respond(ctx, "What is my expectancy, profit factor, and average R across my journal?", {
        startingEquity: 50000,
        maxDrawdown: 2000,
      });
      const pass =
        exp.profitFactor !== null &&
        exp.profitFactor > 1 &&
        exp.expectancyDollarsPerTrade > 0 &&
        exp.avgR !== null &&
        reply.includes(String(exp.profitFactor)) &&
        /expectancy/i.test(reply);
      return {
        pass,
        detail: `expectancy=$${exp.expectancyDollarsPerTrade}, PF=${exp.profitFactor}, avgR=${exp.avgR}R`,
      };
    },
  },
  {
    id: "Q09_DRAWDOWN_ROOM_SAFETY_WARNING",
    question: "Position size when risk per trade threatens drawdown cushion",
    run: () => {
      const res = computePositionSizingTool({
        entries,
        settings: { ...settings, maxDrawdown: 600 }, // tight $600 drawdown limit
        symbol: "NQ",
        stopPoints: 15,
        riskDollars: 300, // $300 risk with p95 streak of 6 = $1800 > $600 cushion
        p95LosingStreak: 6,
      });
      const pass = res.safeForDrawdownStreak.warning !== null && res.safeForDrawdownStreak.maxSafeRiskForDrawdownRoom! < 300;
      return {
        pass,
        detail: `maxSafe=$${res.safeForDrawdownStreak.maxSafeRiskForDrawdownRoom}, warningPresent=${!!res.safeForDrawdownStreak.warning}`,
      };
    },
  },
  {
    id: "Q10_DAILY_LOSS_LIMIT_EXTRACTION",
    question: "My daily loss limit is $400 and my profit target is $1200",
    run: () => {
      const recs = extractStructuredMemoriesFromTurn({
        text: "My daily loss limit is $400 and my profit target is $1200",
        now: NOW,
      });
      const b = applyExtractedMemories(emptyBrain(), recs, NOW).brain;
      const sem = readUserSemanticParams(b.memory);
      const pass = sem.dailyLossLimit === 400 && sem.profitTarget === 1200;
      return {
        pass,
        detail: `dailyLossLimit=$${sem.dailyLossLimit}, profitTarget=$${sem.profitTarget}`,
      };
    },
  },
  {
    id: "Q11_INSTRUMENTS_AND_SESSION_EXTRACTION",
    question: "I only trade MNQ and NQ during the NY open",
    run: () => {
      const recs = extractStructuredMemoriesFromTurn({
        text: "I only trade MNQ and NQ during the NY open",
        now: NOW,
      });
      const hasInstr = recs.some((r) => r.category === "instruments_traded" && r.entities.includes("MNQ") && r.entities.includes("NQ"));
      const hasSession = recs.some((r) => r.category === "session_times");
      return {
        pass: hasInstr && hasSession,
        detail: `extracted=${recs.map((r) => r.category).join("+")}`,
      };
    },
  },
  {
    id: "Q12_EPISODIC_SESSION_REFLECTION_EXTRACTION",
    question: "Today I learned that chasing the first 5-minute candle on MNQ leads to a stop out",
    run: () => {
      const recs = extractStructuredMemoriesFromTurn({
        text: "Today I learned that chasing the first 5-minute candle on MNQ leads to a stop out",
        linkedTradeIds: [entries[0].id],
        now: NOW,
      });
      const ep = recs.find((r) => r.type === "episodic");
      const pass = !!ep && ep.trade_ids?.includes(entries[0].id) === true && ep.entities.includes("MNQ");
      return {
        pass,
        detail: `episodicId=${ep?.id}, linkedTrade=${ep?.trade_ids?.[0]}`,
      };
    },
  },
  {
    id: "Q13_JOURNAL_RECALL_BY_DATE",
    question: `Review my trade on ${entries[0].date}`,
    run: () => {
      const reply = respond(ctx, `How was my trade on ${entries[0].date}?`);
      const pass = reply.includes(entries[0].date) && reply.includes(entries[0].instrument);
      return {
        pass,
        detail: `matchedDate=${entries[0].date}, instrument=${entries[0].instrument}`,
      };
    },
  },
  {
    id: "Q14_HYBRID_RETRIEVAL_AND_TOKEN_BUDGET",
    question: "Hybrid retrieval ranks relevant memories and enforces token budget",
    run: () => {
      let b = evolveMemory(emptyBrain(), entries, [], NOW);
      const recs = extractStructuredMemoriesFromTurn({
        text: "My risk per trade is $150 and my default stop loss is 15 points",
        now: NOW,
      });
      b = applyExtractedMemories(b, recs, NOW).brain;
      const route = routeIntent("What is my risk and position size for MNQ?");
      const plan = planFor(route);
      const payload = memoryForModel(b.memory, "What is my risk and position size for MNQ?", plan, NOW);
      const pass =
        !!payload.debug &&
        payload.debug.tokensUsed <= payload.debug.tokenBudget &&
        payload.beliefs.some((x) => /150|15 points/i.test(x.say));
      return {
        pass,
        detail: `retrieved=${payload.debug?.retrievedCount}, tokens=${payload.debug?.tokensUsed}/${payload.debug?.tokenBudget}`,
      };
    },
  },
  {
    id: "Q15_WORKING_MEMORY_SUMMARIZATION",
    question: "Long conversation (>12 turns) summarizes older messages while keeping recent verbatim",
    run: () => {
      const longThread = Array.from({ length: 18 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "buddy") as "user" | "buddy",
        text: `Turn ${i + 1}: discussing MNQ setup and risk management rules for session ${i + 1}.`,
      }));
      const wm = summarizeWorkingMemory(longThread, 10);
      const pass = wm.summary !== null && wm.recentMessages.length === 10 && wm.summary.includes("8 turns");
      return {
        pass,
        detail: `recentCount=${wm.recentMessages.length}, summary="${wm.summary?.slice(0, 45)}..."`,
      };
    },
  },
  {
    id: "Q16_SETTINGS_MEMORY_EDIT_PIN_DELETE",
    question: "User can add, edit, pin/unpin, and delete memories via bridge ops",
    run: () => {
      let b = applyMemoryOp(emptyBrain(), { type: "add", text: "Never trade during FOMC speeches", category: "strategy_rules" }, NOW);
      const id = Object.keys(b.memory!.items)[0]!;
      b = applyMemoryOp(b, { type: "edit", id, text: "Never trade 15m before or after FOMC" }, NOW + 1000);
      const editedText = b.memory!.items[id]?.text;
      b = applyMemoryOp(b, { type: "pin", id, pinned: false }, NOW + 2000);
      const unpinned = !b.memory!.items[id]?.pinned;
      b = applyMemoryOp(b, { type: "delete", id }, NOW + 3000);
      const deleted = !b.memory!.items[id];
      const pass = editedText === "Never trade 15m before or after FOMC" && unpinned && deleted;
      return {
        pass,
        detail: `edited="${editedText}", unpinned=${unpinned}, deleted=${deleted}`,
      };
    },
  },
  {
    id: "Q17_ES_MES_POINT_VALUE_SIZING",
    question: "What is my position size for ES mini vs MES micro with $300 risk and a 12 point stop?",
    run: () => {
      // MES ($5/pt): floor(300 / (12 * 5)) = floor(300 / 60) = 5 contracts
      // ES ($50/pt): floor(300 / (12 * 50)) = floor(300 / 600) = 0 contracts
      const res = computePositionSizingTool({
        entries,
        settings,
        symbol: "MES",
        stopPoints: 12,
        riskDollars: 300,
      });
      const pass = res.primary.symbol === "MES" && res.primary.contracts === 5 && res.comparison.symbol === "ES" && res.comparison.contracts === 0;
      return {
        pass,
        detail: `MES=${res.primary.contracts} contracts, ES=${res.comparison.contracts} contracts`,
      };
    },
  },
  {
    id: "Q18_EXPLICIT_DIRECTIONAL_QUERY_STILL_WORKS",
    question: "Compare my long vs short performance",
    run: () => {
      const reply = respond(ctx, "Compare my long vs short performance");
      const pass = reply.includes("Directional & Instrument Breakdown") && reply.includes("Longs") && reply.includes("Shorts");
      return {
        pass,
        detail: `directionalBreakdownReturned=${pass}`,
      };
    },
  },
  {
    id: "Q19_TRADER_FIRST_NAME_NEVER_USES_EMAIL_ID",
    question: "hi sensei (must greet by real name Nandigam, never email handle kanakesh939264)",
    run: () => {
      const resolvedWithFullName = resolveTraderFirstName({
        fullName: "NANDIGAM KANAKESWARA RAO",
        sessionName: "kanakesh939264",
      });
      const resolvedFromEmailOnly = resolveTraderFirstName({
        sessionName: "kanakesh939264@gmail.com",
      });
      const reply = respond(ctx, "hi sensei");
      const pass =
        resolvedWithFullName === "Nandigam" &&
        resolvedFromEmailOnly === "Kanakesh" &&
        reply.includes("Nandigam") &&
        !reply.includes("kanakesh939264");
      return {
        pass,
        detail: `resolved="${resolvedWithFullName}", emailFallback="${resolvedFromEmailOnly}", greetedNandigam=${reply.includes("Nandigam")}`,
      };
    },
  },
  {
    id: "Q20_WEBSITE_BLUEPRINT_NAVIGATION_GUIDANCE",
    question: "Where should I practise or review my trades in EdgeBook?",
    run: () => {
      const reply = respond(ctx, "Where should I practise or review my trades in EdgeBook?");
      const hasPracticeModes = reply.includes("Practise") && reply.includes("The Matrix") && reply.includes("ICT Lab");
      const hasLabAndJournal = reply.includes("Trading Lab") && reply.includes("Journal");
      return {
        pass: hasPracticeModes && hasLabAndJournal,
        detail: `hasPracticeModes=${hasPracticeModes}, hasLabAndJournal=${hasLabAndJournal}`,
      };
    },
  },
];

let passedCount = 0;
console.log("\n=== MINATO MEMORY & DETERMINISTIC MATH EVAL SUITE (20 CASES) ===");
for (const tc of EVAL_CASES) {
  const res = tc.run();
  const badge = res.pass ? "PASS" : "FAIL";
  console.log(`  [${badge}] ${tc.id}: ${res.detail}`);
  assert.ok(res.pass, `Eval failed on ${tc.id} (${tc.question}): ${res.detail}`);
  passedCount++;
}
console.log(`=== ALL ${passedCount}/${EVAL_CASES.length} MINATO EVALS PASSED ===\n`);
