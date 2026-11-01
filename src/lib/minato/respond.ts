import type { EdgeBookContext, TradeReviewContext } from "./context";
import { findSimilarTrades, histDate, strategyForEntry } from "./context";
import { holdTimeStats, formatHold } from "../holdtime";
import { timeWindowAnalytics } from "../time-patterns";
import { mistakeIndex, mistakeOf, mistakeTagsOf } from "../mistakes";
import { computeBrainCalibration } from "../ai-brain";
import {
  computeExpectancyStatsTool,
  computePositionSizingTool,
  computeStreakTool,
  parseCalcQuery,
} from "./tools";
import type { UserSemanticParams } from "./extract";
import { EDGEBOOK_SITE_BLUEPRINT, resolveTraderFirstName } from "./blueprint";
import { resolveMinatoTasks, type SimpleChatTurn } from "./actions";
import { aPlusSummary, newestFirst, setupBreakdown, wantsSetupAnalysis, THIN_SAMPLE } from "./setup-analytics";

/* ------------------------------------------------------------------ */
/*  MINATO — English-only, analytical, evidence-based + Jarvis Tasks.  */
/*  No Telugu. No "bro". No constant nagging.                          */
/*  Short conclusion → numbered findings → confidence note.            */
/* ------------------------------------------------------------------ */

export interface MinatoMessage {
  role: "buddy" | "user";
  text: string;
}

export interface RespondOptions {
  semanticParams?: Partial<UserSemanticParams>;
  startingEquity?: number;
  targetEquity?: number;
  maxDrawdown?: number;
  history?: SimpleChatTurn[];
  focusTradeId?: string | null;
  /** Set when the AI model was asked first and failed — shapes the honest fallback wording. */
  degraded?: string | null;
}

/** Focused starting points for a deeper conversation. Each remains grounded
 * in the trader's own journal, rather than asking the model for a signal. */
export const QUICK_PROMPTS = [
  "Give me a deep review of my journal.",
  "What pattern am I repeating in my own words?",
  "Compare my strongest and weakest setups.",
  "Where do my notes conflict with my execution?",
  "What should I practise next?",
] as const;

function money(n: number): string {
  const abs = Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 2 });
  return `${n < 0 ? "−" : "+"}$${abs}`;
}

export function greet(ctx: EdgeBookContext): string {
  const name = resolveTraderFirstName({ fullName: ctx.userFirstName });
  if (ctx.recentTrades.length === 0) {
    return `Welcome, ${name}. Your journal is empty — log a trade on **Home** or **Journal**, or explore **Practise** and **Trading Lab** to get started.`;
  }
  const cal = computeBrainCalibration(ctx.recentTrades, []);
  const unreviewed = ctx.recentTrades.filter((e) => e.reviewStatus !== "reviewed").length;
  if (unreviewed > 3) {
    return `Hello, ${name}. I've indexed ${ctx.recentTrades.length} trades (${cal.tier} calibration · ${cal.calibrationPct}%). Completing your ${unreviewed} unreviewed trades in **Journal → Quick Autopsy** will sharpen pattern accuracy further.`;
  }
  return `Hello, ${name}. I've indexed ${ctx.recentTrades.length} trades (${cal.tier} calibration · ${cal.calibrationPct}%). Ask me anything about your setups, losing streak odds, exact position sizing, or tell me to open a trade replay or section.`;
}

export function respond(rawCtx: EdgeBookContext, input: string, opts: RespondOptions = {}): string {
  // Callers pass entries in whatever order they hold them. Every "last N / recent / momentum" answer below assumes
  // newest-first, so enforce it once here instead of trusting each caller.
  const ctx: EdgeBookContext = { ...rawCtx, recentTrades: newestFirst(rawCtx.recentTrades) };
  const q = input.toLowerCase().trim();
  const name = resolveTraderFirstName({ fullName: ctx.userFirstName });
  const { stats, discipline, adherence } = ctx;
  const cal = computeBrainCalibration(ctx.recentTrades, []);
  const mistakes = mistakeIndex(ctx.recentTrades);
  const calcParams = parseCalcQuery(input);
  const sem = opts.semanticParams ?? {};

  // --- PRIORITY 0A: JARVIS / SIRI / BIXBY DIRECT TASK COMMANDS ---
  const taskRes = resolveMinatoTasks({
    query: input,
    entries: ctx.recentTrades,
    history: opts.history ?? [],
    focusTradeId: opts.focusTradeId ?? ctx.focus?.entry.id ?? null,
    traderName: name,
  });
  if (taskRes.isDirectCommand && taskRes.directReply) {
    return taskRes.directReply;
  }

  // --- PRIORITY 0B: GREETINGS, SMALL TALK, CONVERSATIONAL OPENINGS & SITE NAVIGATION ---
  if (/\b(i (had|have) a (doubt|question)|can i ask( a (doubt|question)| you( something)?)?|may i ask|arey i('?m| am) saying)\b/i.test(q)) {
    return `Of course, ${name} — go ahead and ask. What's on your mind?`;
  }

  if (/\b(what are you (doing|up to)|what('?re| are) you doing|how are you( doing)?|how'?s it going|are you there)\b/i.test(q)) {
    return `I'm right here, ${name} — ready whenever you want to review a trade, sharpen a concept, build a routine, or just talk through what's on your mind.`;
  }

  if (/^\s*(hi|hello|hey|yo|good (morning|afternoon|evening)|hi sensei|hey sensei|hello sensei|hi minato|hey minato)\b[\s!.?]*$/i.test(q)) {
    return `Hey, ${name}. What's on your mind?`;
  }

  if (/\b(where (is|do i|can i|to|should i)|how do i (use|find|navigate|practi[cs]e|backtest|review)|what sections|website|blueprint|guide me|what should i (practi[cs]e|review|do)|where should i go|in edgebook)\b/i.test(q)) {
    const unreviewed = ctx.recentTrades.filter((e) => e.reviewStatus !== "reviewed").length;
    const topMistake = mistakes[0];
    return [
      `Here's where to go, ${name}:`,
      topMistake
        ? `- **Practise** · The Matrix, ICT Lab and Math Duel — start with drills on **${topMistake.label}** (${topMistake.count}×)`
        : `- **Practise** · The Matrix, ICT Lab and Math Duel drills`,
      `- **Journal** · ${unreviewed > 0 ? `Quick Autopsy for ${unreviewed} unreviewed ${unreviewed === 1 ? "trade" : "trades"}` : "Filter by setup or mistake"}, or Replay any trade`,
      `- **Trading Lab** · Playbook setups, rule guardrails and Backtesting`,
      `- **Home & Feed** · Daily loss limit, Plan a trade, chart replays`,
      ``,
      `Say *"take me to The Matrix"* and I'll open it.`,
    ].join("\n");
  }

  // --- PRIORITY 1: DETERMINISTIC TRADING MATH (Streaks, Position Sizing, Expectancy/PF/R) ---
  // Never substitute a directional or instrument breakdown when the user asks about streaks, sizing, or math!
  if (calcParams.wantsStreak || calcParams.wantsSizing || calcParams.wantsExpectancyOrStats) {
    // Answer first (a headline + a few metric rows). Formulas, assumptions and sample-size
    // caveats live below a `---` divider, which the UI folds behind "Show working".
    const visible: string[] = [];
    const working: string[] = [];

    const streakRes = computeStreakTool({
      entries: ctx.recentTrades,
      overrideWinRate: calcParams.winRateOverride,
      horizonTrades: calcParams.horizonTrades,
      targetK: calcParams.targetStreakK,
      runs: 10_000,
      seed: 42,
    });

    if (calcParams.wantsStreak) {
      const wrPct = (streakRes.winRate * 100).toFixed(1);
      const lossPct = (streakRes.lossRate * 100).toFixed(1);
      const wanted = new Set<number>([3, 5, 8, ...(calcParams.targetStreakK ? [calcParams.targetStreakK] : [])]);
      const probs = streakRes.monteCarlo.probabilities.filter((p) => wanted.has(p.k)).slice(0, 4);

      visible.push(
        `At a **${wrPct}% win rate**, your expected maximum losing streak over **${streakRes.horizonTrades} trades** is about **${streakRes.monteCarlo.meanMaxStreak} losses**. A bad run (95th percentile) reaches **${streakRes.monteCarlo.p95MaxStreak}**.`,
      );
      for (const p of probs) visible.push(`- **${p.k}+ losses in a row** · ${p.exactProbPct}%`);
      visible.push(
        `- **Your journal** · ${streakRes.historicalMaxLosingStreak} losses / ${streakRes.historicalMaxWinningStreak} wins in a row at most`,
      );

      working.push(
        `- Assumes independent trades at a ${wrPct}% win rate (${lossPct}% loss rate, ${streakRes.sampleTrades} decided trades).`,
        `- Closed-form expected max ${streakRes.expectedMaxLosingStreakClosedForm}; 10,000-run Monte Carlo mean ${streakRes.monteCarlo.meanMaxStreak}, p95 ${streakRes.monteCarlo.p95MaxStreak}, p99 ${streakRes.monteCarlo.p99MaxStreak} (seed 42).`,
        `- ${streakRes.sampleSizeCaveat}`,
      );
    }

    if (calcParams.wantsSizing) {
      const sizingRes = computePositionSizingTool({
        entries: ctx.recentTrades,
        settings: {
          traderName: name,
          startingEquity: opts.startingEquity ?? stats.currentEquity - stats.totalPnl,
          targetEquity: opts.targetEquity ?? stats.currentEquity + stats.remainingToTarget,
          maxDrawdown: opts.maxDrawdown ?? (stats.drawdownCushion != null ? stats.drawdown + stats.drawdownCushion : 2000),
          currency: "USD",
        },
        symbol: calcParams.instrument ?? "MNQ",
        stopPoints: calcParams.stopPoints,
        riskDollars: calcParams.riskDollars,
        riskPct: calcParams.riskPct,
        memoryRiskDollars: sem.riskDollars ?? null,
        memoryRiskPct: sem.riskPct ?? null,
        memoryStopPoints: sem.stopPoints ?? null,
        memoryDailyLossLimit: sem.dailyLossLimit ?? null,
        p95LosingStreak: streakRes.monteCarlo.p95MaxStreak,
      });

      const mnq = sizingRes.primary.symbol === "MNQ" ? sizingRes.primary : sizingRes.comparison;
      const nq = sizingRes.primary.symbol === "NQ" ? sizingRes.primary : sizingRes.comparison;
      const sizeRow = (label: string, r: typeof mnq) =>
        `- **${label}** · ${
          r.contracts === 0
            ? `Too big — 1 contract risks $${r.riskPerContractDollars}`
            : `${r.contracts} contract${r.contracts === 1 ? "" : "s"} · $${r.actualDollarRisk} risk`
        }`;

      if (calcParams.wantsStreak) {
        visible.push(``, `**Position size** at **$${sizingRes.effectiveRiskDollars}** risk, **${sizingRes.stopPoints}-pt stop**`);
      } else {
        visible.push(
          `At **$${sizingRes.effectiveRiskDollars}** risk and a **${sizingRes.stopPoints}-pt stop**, size **${mnq.contracts} MNQ** or **${nq.contracts} NQ** contracts.`,
        );
      }
      visible.push(sizeRow("MNQ ($2/pt)", mnq), sizeRow("NQ ($20/pt)", nq));

      if (sizingRes.drawdownRoomDollars != null) {
        visible.push(`- **Drawdown room** · $${Math.round(sizingRes.drawdownRoomDollars).toLocaleString("en-US")} left`);
        if (sizingRes.safeForDrawdownStreak.maxSafeRiskForDrawdownRoom != null) {
          visible.push(
            `- **Max safe risk** · $${sizingRes.safeForDrawdownStreak.maxSafeRiskForDrawdownRoom}/trade (survives a ${sizingRes.safeForDrawdownStreak.p95MaxLosingStreak}-loss streak)`,
          );
        }
      }
      if (sizingRes.safeForDrawdownStreak.warning) {
        visible.push(`> ${sizingRes.safeForDrawdownStreak.warning}`);
      }

      working.push(
        `- MNQ ($2/pt): \`${mnq.formulaWorking}\``,
        `- NQ ($20/pt): \`${nq.formulaWorking}\``,
        `- Risk source: ${sizingRes.riskSource}.`,
      );

      if (sizingRes.missingInputs.length > 0) {
        const missingLabels = sizingRes.missingInputs
          .map((m) => (m === "stop_points" ? "typical stop size in points" : "risk per trade ($ or %)"))
          .join(" and ");
        visible.push(
          `> **Quick check** — I assumed ${sizingRes.stopPoints} pts and $${sizingRes.effectiveRiskDollars} risk because your ${missingLabels} isn't saved in memory yet. Reply with e.g. *"15 points, $150 per trade"* and I'll save it and recalculate.`,
        );
      }
    }

    if (calcParams.wantsExpectancyOrStats && !calcParams.wantsStreak && !calcParams.wantsSizing) {
      const expRes = computeExpectancyStatsTool(ctx.recentTrades, {
        traderName: name,
        startingEquity: opts.startingEquity ?? 10000,
        targetEquity: opts.targetEquity ?? 20000,
        maxDrawdown: opts.maxDrawdown ?? 2000,
        currency: "USD",
      });
      visible.push(
        `Across **${expRes.decidedTrades} decided trades** (${expRes.winRatePct}% win rate), your expectancy is **${money(expRes.expectancyDollarsPerTrade)} per trade**${expRes.expectancyR != null ? ` (**${expRes.expectancyR >= 0 ? "+" : ""}${expRes.expectancyR}R**)` : ""}, with a profit factor of **${expRes.profitFactor ?? "—"}**.`,
        `- **Avg win / loss** · +$${expRes.avgWinDollars.toFixed(0)} / −$${expRes.avgLossDollars.toFixed(0)}`,
        `- **Payoff ratio** · ${expRes.payoffRatio ?? "—"}`,
        `- **Avg R** · ${expRes.avgR != null ? `${expRes.avgR}R` : "—"}`,
        `- **Max drawdown** · $${expRes.drawdown.maxDrawdownDollars.toLocaleString("en-US")}`,
      );
      if (expRes.drawdown.drawdownRoomDollars != null) {
        visible.push(`- **Drawdown room** · $${expRes.drawdown.drawdownRoomDollars.toLocaleString("en-US")} left`);
      }
      working.push(
        `- Computed from ${expRes.totalTrades} live journal trades (${expRes.rSampleSize} with R-multiples recorded).`,
        `- Current drawdown $${expRes.drawdown.currentDrawdownDollars.toLocaleString("en-US")}.`,
      );
    }

    return [...visible, ...(working.length > 0 ? ["", "---", "**Working**", ...working] : [])].join("\n");
  }

  // --- Specific date or instrument lookup ---
  const dateMatch = q.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (dateMatch) {
    const targetDate = dateMatch[1]!;
    const dayMatches = ctx.recentTrades.filter((e) => e.date === targetDate);
    if (dayMatches.length > 0) {
      const dayPnl = dayMatches.reduce((s, e) => s + e.pnl, 0);
      const lines = [`**${targetDate}**: ${dayMatches.length} trade${dayMatches.length === 1 ? "" : "s"} · net ${money(dayPnl)}.`];
      dayMatches.slice(0, 5).forEach((t, i) => {
        const m = mistakeOf(t);
        lines.push(`${i + 1}. **${t.instrument} ${t.direction ?? ""}** (${t.setup || "Unnamed"}) — ${money(t.pnl)}${t.rr != null ? ` · ${t.rr}R` : ""}`);
        if (m) lines.push(`   - Mistake tagged: ${m.label}`);
        if (t.reflection?.lesson || t.review?.followUp?.biggestMistake) {
          lines.push(`   - Lesson: “${t.reflection?.lesson ?? t.review?.followUp?.biggestMistake}”`);
        }
      });
      lines.push(`\nTap **Replay** or **Open in Journal** below — or say *"replay this trade"* and I'll launch it right now.`);
      return lines.join("\n");
    }
  }

  // --- Setups and A+ trades (A+ is a review verdict; see setup-analytics.ts) ---
  const setupQ = wantsSetupAnalysis(q);
  if (setupQ.aPlus || (setupQ.setups && !/\b(last|latest|previous) (trade|entry)\b/.test(q))) {
    return answerSetups(ctx, name, setupQ.aPlus);
  }

  // --- Hold time (including "what is my largest holding time and which trade it is") ---
  if (/hold|how long|duration/.test(q)) {
    const holds = holdTimeStats(ctx.recentTrades);
    if (holds.sampleSize === 0) return "No entry/exit times recorded yet. Add timestamps to your trades in **Journal** (or use **Settings → Data → Recover Entry Times**) and I'll calculate hold durations.";
    const parts: string[] = [];
    if (holds.longestHoldTrade && /\b(largest|longest|max|maximum|which trade)\b/.test(q)) {
      const lt = holds.longestHoldTrade;
      parts.push(
        `Your longest holding time is **${lt.holdFormatted}** (${lt.entryTime} → ${lt.exitTime} NY) on **${lt.date} ${lt.instrument}${lt.direction ? ` ${lt.direction}` : ""}** (${lt.setup}) for **${money(lt.pnl)}**.`,
      );
    } else {
      parts.push(`Hold time analysis (**${holds.sampleSize} trades** with timestamps):`);
    }
    parts.push(`1. **Average winning hold**: ${formatHold(holds.avgWinMin)} (median ${formatHold(holds.medianWinMin)})`);
    parts.push(`2. **Average losing hold**: ${formatHold(holds.avgLossMin)} (median ${formatHold(holds.medianLossMin)})`);
    parts.push(`3. **Longest win vs shortest loss**: ${formatHold(holds.longestWinMin)} vs ${formatHold(holds.shortestLossMin)}`);
    if (holds.longestHoldTrade) {
      parts.push(
        `\nUse the **Replay** or **Open in Journal** action button below (or just say *"play this trade"*) and I'll open **${holds.longestHoldTrade.date} ${holds.longestHoldTrade.instrument}** right away.`,
      );
    }
    return parts.join("\n");
  }

  // --- Longitudinal Period Comparison ("Am I improving psychologically?", "Am I getting better?", "Compare periods") ---
  if (/\b(am i (improving|getting better)|improv(ing|ed) psychologically|compare.*period|progress over time)\b/.test(q)) {
    const chrono = [...ctx.recentTrades].reverse(); // oldest -> newest
    if (chrono.length < 4) {
      return `You have **${chrono.length} recorded trade${chrono.length === 1 ? "" : "s"}** so far, ${name} — log at least 4 trades with Quick Autopsy reviews so I can compare your earlier vs recent psychological and process trends.`;
    }
    const mid = Math.floor(chrono.length / 2);
    const early = chrono.slice(0, mid);
    const recent = chrono.slice(mid);
    const summarizeHalf = (slice: typeof chrono) => {
      const wins = slice.filter((e) => e.pnl > 0).length;
      const losses = slice.filter((e) => e.pnl < 0).length;
      const decided = wins + losses;
      const wr = decided > 0 ? Math.round((wins / decided) * 100) : 0;
      const pnl = Math.round(slice.reduce((s, e) => s + e.pnl, 0));
      const mistCount = slice.reduce((s, e) => s + mistakeTagsOf(e).length, 0);
      const rev = slice.filter((e) => e.review?.outcome?.followedPlan != null);
      const adh = rev.length > 0 ? Math.round((rev.filter((e) => e.review?.outcome?.followedPlan === true).length / rev.length) * 100) : null;
      const tiltCount = slice.filter((e) => e.review?.psychology?.fomo || e.review?.psychology?.revenge).length;
      return { n: slice.length, wr, pnl, mistCount, adh, tiltCount };
    };
    const eStat = summarizeHalf(early);
    const rStat = summarizeHalf(recent);
    const wrDelta = rStat.wr - eStat.wr;
    const mistDelta = rStat.mistCount - eStat.mistCount;
    const improving = wrDelta >= 0 && mistDelta <= 0;
    return [
      `Comparing your **recent ${rStat.n} trades** against your **earlier ${eStat.n} trades**, ${name}, your execution is **${improving ? "improving" : "still leaking discipline"}** (${eStat.wr}% → **${rStat.wr}% win rate**, ${money(eStat.pnl)} → **${money(rStat.pnl)}**).`,
      `- **Win rate & P&L** · Earlier ${eStat.wr}% (${money(eStat.pnl)}) → Recent ${rStat.wr}% (${money(rStat.pnl)})`,
      `- **Tagged mistakes** · ${eStat.mistCount} earlier vs ${rStat.mistCount} recent (${mistDelta <= 0 ? `${Math.abs(mistDelta)} fewer` : `+${mistDelta} more`})`,
      `- **FOMO / Revenge triggers** · ${eStat.tiltCount} earlier vs ${rStat.tiltCount} recent`,
      ...(eStat.adh != null && rStat.adh != null
        ? [`- **Plan adherence** · ${eStat.adh}% earlier → ${rStat.adh}% recent`]
        : []),
    ].join("\n");
  }

  // --- Mistakes / leaks / why losing / biggest error ---
  if (/mistake|leak|losing|loss|wrong|blunder|error|costing|hurt|weakness/.test(q) && !/streak/.test(q)) {
    const setupRows = setupBreakdown(ctx.recentTrades).rows.filter((r) => r.setup !== "(no setup recorded)");
    const worstSetup = [...setupRows].sort((a, b) => a.netPnl - b.netPnl)[0];
    if (mistakes.length === 0) {
      const losses = ctx.recentTrades.filter((e) => e.pnl < 0);
      if (losses.length === 0) return "You have no losing trades or tagged mistakes recorded yet.";
      const totalLoss = losses.reduce((s, e) => s + e.pnl, 0);
      return `You have ${losses.length} losing trade${losses.length === 1 ? "" : "s"} (${money(totalLoss)} total), but none have mistake tags yet.\n\n1. **Action needed**: Open your losing trades in **Journal → Quick Autopsy** (\`/journal\`).\n2. **Why it matters**: Once you tag mistakes, I calculate the exact dollar cost of each habit, build spaced-repetition drills in **Practise → The Matrix**, and warn you before you repeat it in **Home → Plan a trade**.`;
    }
    const top = mistakes[0]!;
    const parts: string[] = [
      `Your #1 process leak is **${top.label}** — recorded ${top.count} time${top.count === 1 ? "" : "s"} and costing ${money(-top.cost)} across your losing trades (${Math.round(stats.winRate * 100)}% day win rate, net ${money(stats.totalPnl)}).`,
    ];
    mistakes.slice(0, 3).forEach((m, i) => {
      parts.push(`${i + 1}. **${m.label}** — ${m.count} trade${m.count === 1 ? "" : "s"} · cost ${money(-m.cost)}`);
    });
    if (worstSetup && worstSetup.netPnl < 0) {
      parts.push(`${Math.min(mistakes.length, 3) + 1}. **Weakest strategy (${worstSetup.setup})** — ${money(worstSetup.netPnl)} (${worstSetup.winRatePct ?? 0}% win rate across ${worstSetup.trades} trades)`);
    }
    parts.push(`\n**Next step**: Select **${top.label}** under “Mistakes to watch for today” in **Home → Plan a trade**, or say *"start The Matrix"* and I'll launch a drill for this leak right now.`);
    return parts.join("\n");
  }

  // --- Psychology / emotions / feelings / FOMO / revenge / tilt ---
  if (/emotion|feel|feeling|psych|fomo|revenge|tilt|anxious|calm|focused|mindset/.test(q)) {
    const byEmo = new Map<string, { n: number; wins: number; pnl: number }>();
    for (const e of ctx.recentTrades) {
      const emo =
        e.review?.psychology?.fomo ? "FOMO"
        : e.review?.psychology?.revenge ? "Revenge"
        : e.review?.psychology?.fearExit ? "Fear / Hesitation"
        : e.review?.psychology?.emotionAfter || e.review?.psychology?.emotionBefore || "";
      if (!emo) continue;
      const key = emo.toUpperCase();
      const cur = byEmo.get(key) ?? { n: 0, wins: 0, pnl: 0 };
      cur.n++;
      if (e.pnl > 0) cur.wins++;
      cur.pnl += e.pnl;
      byEmo.set(key, cur);
    }
    if (byEmo.size === 0) {
      return "No emotional states are recorded on your reviewed trades yet. Pick how you feel during **Home → Plan a trade** and **Journal → Quick Autopsy** so I can measure how your mindset impacts your win rate.";
    }
    const rows = [...byEmo.entries()]
      .map(([k, v]) => ({ k, ...v, wr: Math.round((v.wins / v.n) * 100) }))
      .sort((a, b) => b.pnl - a.pnl);
    const best = rows[0]!;
    const worst = rows[rows.length - 1]!;
    const parts: string[] = [
      `Your strongest emotional state is **${best.k}** (${best.wr}% win rate, ${money(best.pnl)} over ${best.n} trades).`,
    ];
    rows.slice(0, 4).forEach((r, i) => {
      parts.push(`${i + 1}. **${r.k}** — ${r.wr}% win rate · ${money(r.pnl)} (${r.n} trade${r.n === 1 ? "" : "s"})`);
    });
    if (rows.length > 1 && worst.pnl < 0) {
      parts.push(`\n**Risk trigger**: Trading while **${worst.k}** has cost ${money(worst.pnl)} (${worst.wr}% win rate). Lock your daily loss limit on **Home** or step into **Practise** instead of forcing a live entry when you notice this state.`);
    }
    return parts.join("\n");
  }

  // --- Instrument / direction performance (ONLY when explicitly asking to compare instruments or long vs short) ---
  if (/\b(compare instruments|performance by instrument|which instrument|long vs short|longs? or shorts?|direction breakdown)\b/.test(q)) {
    const decided = ctx.recentTrades.filter((e) => e.direction);
    if (decided.length === 0) return "Record direction (Long/Short) on your entries and I'll compare longs vs shorts and per-instrument performance.";
    const longs = decided.filter((e) => e.direction === "long");
    const shorts = decided.filter((e) => e.direction === "short");
    const stat = (list: typeof decided) => {
      const pnl = list.reduce((s, e) => s + e.pnl, 0);
      const wins = list.filter((e) => e.pnl > 0).length;
      const losses = list.filter((e) => e.pnl < 0).length;
      return `${money(pnl)} · ${wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : "—"}% win rate · ${list.length} trades`;
    };
    const parts: string[] = ["**Directional & Instrument Breakdown**:"];
    parts.push(`1. **Longs**: ${stat(longs)}`);
    parts.push(`2. **Shorts**: ${stat(shorts)}`);
    const byInstrument = new Map<string, { pnl: number; n: number; wins: number }>();
    for (const e of ctx.recentTrades) {
      if (!e.instrument || e.instrument === "—") continue;
      const cur = byInstrument.get(e.instrument) ?? { pnl: 0, n: 0, wins: 0 };
      cur.pnl += e.pnl;
      cur.n += 1;
      if (e.pnl > 0) cur.wins += 1;
      byInstrument.set(e.instrument, cur);
    }
    const top = [...byInstrument.entries()].sort((a, b) => b[1].pnl - a[1].pnl)[0];
    if (top) parts.push(`3. **Primary instrument (${top[0]})**: ${money(top[1].pnl)} · ${Math.round((top[1].wins / top[1].n) * 100)}% win rate (${top[1].n} trades)`);
    return parts.join("\n");
  }

  // --- Overview / performance (only when asking about the trader's own performance, never bare "doing") ---
  if (/\b(how am i( doing| trading| performing)?|how('?s| is) my trading|overall|performance|summary|stats|statistics|my edge|accuracy|brain)\b/.test(q)) {
    const parts: string[] = [];
    parts.push(`Across **${stats.tradingDays} trading days** (${ctx.recentTrades.length} trades), ${name}, your net P&L is **${money(stats.totalPnl)}** with a **${Math.round(stats.winRate * 100)}%** win rate.`);
    parts.push(`1. **Average day P&L**: ${money(stats.avgDayPnl)} · Max drawdown: ${money(stats.drawdown)}`);
    if (adherence.cleanDayRate != null) {
      parts.push(`2. **Clean-plan days**: ${Math.round(adherence.cleanDayRate * 100)}%`);
    }
    if (mistakes[0]) {
      parts.push(`3. **Primary leak**: ${mistakes[0].label} (${mistakes[0].count}× · ${money(-mistakes[0].cost)}) — drill this in **Practise → The Matrix**`);
    }
    parts.push(`4. **AI Brain calibration**: ${cal.calibrationPct}% (${cal.tier} tier · ${cal.reviewedTrades} reviewed trades indexed)`);
    return parts.join("\n");
  }

  // --- Time windows ---
  if (/best time|worst time|best window|worst window|time window|best session|when.*best|when.*worst|perform best|perform worst|time.*perform|session|hour|morning/.test(q)) {
    const tw = timeWindowAnalytics(ctx.recentTrades);
    if (tw.sparse) {
      return `1. **Sample size**\n   - Only ${tw.totalSample} trade${tw.totalSample === 1 ? "" : "s"} have entry timestamps — add entry/exit times to more trades in **Journal** to unlock 15-minute session edge windows.`;
    }
    const qualified = [...tw.windows]
      .filter((w) => w.trades >= 2)
      .sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0) || b.avgPnl - a.avgPnl);
    if (qualified.length === 0) return "No clear time pattern emerged from your recorded trades yet.";
    const best = qualified[0]!;
    const second = qualified[1] ?? null;
    const weak = [...qualified].sort((a, b) => (a.winRate ?? 100) - (b.winRate ?? 100))[0];
    const parts: string[] = [];
    parts.push(`Your strongest execution window is **${best.label} NY** (${best.winRate ?? "—"}% win rate, avg ${money(best.avgPnl)}).`);
    parts.push(`1. **Best window**: ${best.label} NY — ${best.trades} trades · ${best.winRate ?? "—"}% win rate · avg ${money(best.avgPnl)}`);
    if (second && second.label !== best.label) {
      parts.push(`2. **Secondary window**: ${second.label} NY — ${second.trades} trades · ${second.winRate ?? "—"}% win rate · avg ${money(second.avgPnl)}`);
    }
    if (weak && weak.label !== best.label && (weak.winRate ?? 100) < 50) {
      parts.push(`${second && second.label !== best.label ? "3" : "2"}. **Weak window**: ${weak.label} NY — ${weak.trades} trades · ${weak.winRate ?? "—"}% win rate`);
    }
    parts.push(`\nSample: ${tw.totalSample} timestamped trades (${cal.tier} calibration).`);
    return parts.join("\n");
  }

  // --- Highest RR window ---
  if (/highest.*rr|rr.*window|rr.*best|risk.*reward|r multiple/.test(q)) {
    const tw = timeWindowAnalytics(ctx.recentTrades);
    const byR = [...tw.windows].filter((w) => w.avgR != null && w.trades >= 2).sort((a, b) => (b.avgR ?? 0) - (a.avgR ?? 0));
    if (byR.length === 0) return "No R-multiple data available for time window analysis yet. Record entry, stop, and exit prices on your trades in **Journal**.";
    const top = byR[0]!;
    const topR = top.avgR ?? 0;
    return `Your highest-R window is **${top.label} NY** (${topR >= 0 ? "+" : ""}${topR}R avg across ${top.trades} trades).\n\n1. **Average R**: ${topR >= 0 ? "+" : ""}${topR}R\n2. **Win rate**: ${top.winRate ?? "—"}%\n3. **Total R**: ${top.totalR != null ? `${top.totalR >= 0 ? "+" : ""}${top.totalR}R` : "—"}`;
  }

  // --- Setup performance ---
  if (/which setup|best setup|setup.*(works|perform|win|profit|best)|worst setup|playbook|strategy/.test(q)) {
    const bySetup = new Map<string, { pnl: number; wins: number; losses: number; rr: number[]; n: number }>();
    for (const e of ctx.recentTrades) {
      const key = e.setup || e.setupId;
      if (!key) continue;
      const cur = bySetup.get(key) ?? { pnl: 0, wins: 0, losses: 0, rr: [], n: 0 };
      cur.pnl += e.pnl;
      cur.n += 1;
      if (e.pnl > 0) cur.wins += 1;
      if (e.pnl < 0) cur.losses += 1;
      if (e.rr != null && Number.isFinite(e.rr)) cur.rr.push(e.rr);
      bySetup.set(key, cur);
    }
    if (bySetup.size === 0) return "No setups recorded yet. Define a setup in **Trading Lab → Playbook** and tag your trades with it — then I can rank them.";
    const rows = [...bySetup.entries()]
      .map(([nameKey, v]) => ({ name: nameKey, ...v, winRate: v.wins + v.losses > 0 ? Math.round((v.wins / (v.wins + v.losses)) * 100) : null }))
      .sort((a, b) => b.pnl - a.pnl);
    const parts: string[] = [`Your top setup is **${rows[0]!.name}** (${money(rows[0]!.pnl)} across ${rows[0]!.n} trades):`];
    rows.slice(0, 4).forEach((r, i) => {
      parts.push(`${i + 1}. **${r.name}** — ${money(r.pnl)} · ${r.winRate ?? "—"}% win rate · ${r.n} trades${r.rr.length > 0 ? ` · avg ${(r.rr.reduce((s, x) => s + x, 0) / r.rr.length).toFixed(2)}R` : ""}`);
    });
    const worst = rows[rows.length - 1]!;
    if (rows.length > 1 && worst.pnl < 0) {
      parts.push(`\n**"${worst.name}"** is underperforming (${money(worst.pnl)} over ${worst.n} trades). Tighten its confirmation checklist in **Trading Lab → Playbook** or test it in **Trading Lab → Backtesting**.`);
    }
    return parts.join("\n");
  }

  // --- Day of week ---
  if (/day of week|weekday|monday|tuesday|wednesday|thursday|friday|days?.*pattern|which day/.test(q)) {
    const byDow = new Map<string, { pnl: number; wins: number; losses: number; n: number }>();
    for (const e of ctx.recentTrades) {
      const dow = new Date(e.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short" });
      const cur = byDow.get(dow) ?? { pnl: 0, wins: 0, losses: 0, n: 0 };
      cur.pnl += e.pnl;
      cur.n += 1;
      if (e.pnl > 0) cur.wins += 1;
      if (e.pnl < 0) cur.losses += 1;
      byDow.set(dow, cur);
    }
    const order = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    const rows = [...byDow.entries()].filter(([d]) => order.includes(d));
    if (rows.length < 2) return "Your recorded days are concentrated on a single weekday so far — log trades across more sessions to compare weekdays.";
    const best = [...rows].sort((a, b) => b[1].pnl - a[1].pnl)[0]!;
    const worst = [...rows].sort((a, b) => a[1].pnl - b[1].pnl)[0]!;
    const wr = (v: (typeof rows)[number][1]) => (v.wins + v.losses > 0 ? Math.round((v.wins / (v.wins + v.losses)) * 100) : null);
    return [
      `Your strongest weekday is **${best[0]}** (${money(best[1].pnl)}) and weakest is **${worst[0]}** (${money(worst[1].pnl)}).`,
      `1. **Best day (${best[0]})**: ${money(best[1].pnl)} · ${wr(best[1]) ?? "—"}% win rate · ${best[1].n} trades`,
      `2. **Weakest day (${worst[0]})**: ${money(worst[1].pnl)} · ${wr(worst[1]) ?? "—"}% win rate · ${worst[1].n} trades`,
      `3. **Sample**: ${ctx.recentTrades.length} trades — treat weekday tendencies with caution on small samples.`,
    ].join("\n");
  }

  // --- Patterns ---
  if (/pattern|recurring|same mistake|habit/.test(q)) {
    const pats = ctx.recurringPatterns;
    if (pats.length === 0 && mistakes.length === 0) return "No recurring patterns detected yet. Complete **Journal → Quick Autopsy** on your trades so I can surface repeating habits.";
    const parts: string[] = [`Detected recurring patterns across your journal, ${name}:`];
    if (pats.length > 0) {
      pats.forEach((p, i) => parts.push(`${i + 1}. **${p.pattern}** — ${p.count} occurrences`));
    } else {
      mistakes.slice(0, 3).forEach((m, i) => parts.push(`${i + 1}. **${m.label}** — ${m.count} occurrences (${money(-m.cost)})`));
    }
    parts.push(`\nSay *"start The Matrix"* to drill these specific patterns or document a rule in **Lessons**.`);
    return parts.join("\n");
  }

  // --- Plan vs actual / rules / discipline ---
  if (/plan.*actual|deviat|followed.*plan|following.*plan|am i following|rule|violate|violation|discipline/.test(q)) {
    const linked = ctx.recentTrades.filter((e) => e.planId || e.review?.outcome?.followedPlan != null);
    const followed = linked.filter((e) => e.review?.outcome?.followedPlan === true).length;
    const pct = linked.length > 0 ? Math.round((followed / linked.length) * 100) : null;
    return [
      pct != null
        ? `Plan adherence is **${pct}%** (${followed} of ${linked.length} reviewed trades followed the plan).`
        : `Discipline completion rate is **${Math.round(discipline.completionRate * 100)}%** across ${stats.tradingDays} trading days.`,
      `1. **Clean-plan days**: ${adherence.cleanDayRate != null ? `${Math.round(adherence.cleanDayRate * 100)}%` : "—"}`,
      `2. **Reviewed trades**: ${ctx.recentTrades.filter((e) => e.reviewStatus === "reviewed").length} of ${ctx.recentTrades.length} (review pending trades in **Journal → Quick Autopsy**)`,
      mistakes[0] ? `3. **Most common rule slip**: ${mistakes[0].label} (${mistakes[0].count}×)` : `3. **Missed journal days**: ${discipline.missedDays}`,
    ].join("\n");
  }

  // --- Trade review / last trade / best / worst trade ---
  if (/review|last trade|autopsy|recent|best trade|worst trade/.test(q)) {
    const sorted = [...ctx.recentTrades];
    const focus =
      /best trade/.test(q) ? [...sorted].sort((a, b) => b.pnl - a.pnl)[0]
      : /worst trade/.test(q) ? [...sorted].sort((a, b) => a.pnl - b.pnl)[0]
      : ctx.focus?.entry ?? sorted[0];
    if (!focus) return "No trades to review yet.";
    const verdict = executionVerdict(focus);
    const setupName = focus.setup || "Unnamed setup";
    const tags = mistakeTagsOf(focus);
    const lesson = focus.review?.followUp?.biggestMistake ?? focus.reflection?.lesson ?? focus.notes;
    const parts: string[] = [
      `**${focus.instrument} ${focus.direction ?? ""}** (${setupName}) on ${histDate(focus)}: **${money(focus.pnl)}**${focus.rr != null ? ` · ${focus.rr}R` : ""}.`,
      `1. **Process verdict**: ${verdictLabel(verdict)}`,
      `2. **Mistakes tagged**: ${tags.length > 0 ? tags.map((t) => t.label).join(", ") : "None flagged"}`,
    ];
    if (lesson) parts.push(`3. **Recorded takeaway**: “${lesson}”`);
    parts.push(`\nTap **Replay** or **Quick Autopsy** below — or say *"replay this trade"* and I'll launch it right now.`);
    return parts.join("\n");
  }

  // --- No deterministic answer exists for this question ---
  // This used to print a generic overview (win rate, last 5 trades, top mistake) for ANY unmatched question, which made
  // every different question look like the same answer. Say plainly what happened instead.
  const why = opts.degraded ? ` (my reasoning engine ${opts.degraded})` : "";
  return [
    `I can't answer that one reliably right now${why}, and I won't guess from your journal.`,
    `- **I can answer now** · setups, A+ trades, mistakes, hold time, streak odds, sizing`,
    `> Ask again in a minute, or rephrase around one of those.`,
  ].join("\n");
}

function answerSetups(ctx: EdgeBookContext, name: string, aPlusAsked: boolean): string {
  const trades = ctx.recentTrades;
  if (trades.length === 0) return "No trades recorded yet — log a few in **Journal** and I can rank your setups.";

  if (aPlusAsked) {
    const a = aPlusSummary(trades);
    if (a.count === 0) {
      const best = setupBreakdown(trades).rows[0];
      return [
        `None of your ${a.total} trades is marked **A+** yet, ${name} — ${a.rated === 0 ? "none has a process verdict at all" : `${a.rated} have a process verdict, but not A+`}.`,
        best ? `- **Best setup, all trades** · ${best.setup} ${money(best.netPnl)} (${best.trades})` : `- **Setups** · none recorded`,
        `> Mark trades **A+ trade** in **Journal → Quick Autopsy** and I'll rank them.`,
      ].join("\n");
    }
    const best = a.best!;
    const lines = [
      `Your best A+ setup is **${best.setup}**: **${money(best.netPnl)}** across **${best.trades}** A+ trade${best.trades === 1 ? "" : "s"}${best.winRatePct != null ? ` (${best.winRatePct}% win rate)` : ""}.`,
      `- **All A+ trades** · ${a.count} · ${money(a.netPnl)}${a.winRatePct != null ? ` · ${a.winRatePct}% win rate` : ""}`,
    ];
    for (const r of a.bySetup.filter((r) => r.setup !== best.setup).slice(0, 2)) {
      lines.push(`- **${r.setup}** · ${money(r.netPnl)} · ${r.trades} A+ trade${r.trades === 1 ? "" : "s"}${r.avgR != null ? ` · ${r.avgR}R avg` : ""}`);
    }
    if (a.bySetup.every((r) => r.thin)) lines.push(`> Small sample — fewer than ${THIN_SAMPLE} A+ trades per setup, so treat the ranking as early.`);
    else if (a.count < a.rated) lines.push(`> ${a.count} of ${a.rated} rated trades are A+; ${a.total - a.rated} have no process verdict yet.`);
    return lines.join("\n");
  }

  const t = setupBreakdown(trades);
  const rows = t.rows.filter((r) => r.setup !== "(no setup recorded)");
  if (rows.length === 0) return "No setups recorded yet. Define a setup in **Trading Lab → Playbook** and tag your trades with it — then I can rank them.";
  const top = rows[0]!;
  const lines = [
    `Your top setup is **${top.setup}**: **${money(top.netPnl)}** over **${top.trades}** trade${top.trades === 1 ? "" : "s"}${top.winRatePct != null ? ` (${top.winRatePct}% win rate)` : ""}.`,
  ];
  for (const r of rows.slice(1, 4)) {
    lines.push(`- **${r.setup}** · ${money(r.netPnl)} · ${r.winRatePct ?? "—"}% win · ${r.trades} trade${r.trades === 1 ? "" : "s"}${r.avgR != null ? ` · ${r.avgR}R avg` : ""}`);
  }
  if (rows.every((r) => r.thin)) lines.push(`> Small samples — fewer than ${THIN_SAMPLE} trades per setup.`);
  return lines.join("\n");
}

function executionVerdict(entry: EdgeBookContext["recentTrades"][number]): string {
  const r = entry.reflection;
  const followed = entry.review?.outcome?.followedPlan ?? r?.followedSetup;
  if (followed == null && r?.followedRisk == null) return "unreflected";
  const brokeRules = followed === false || r?.followedRisk === false;
  if (entry.pnl > 0) return brokeRules ? "profitable-but-sloppy" : "clean-win";
  if (entry.pnl < 0) return brokeRules ? "loss-and-sloppy" : "valid-loss";
  return brokeRules ? "loss-and-sloppy" : "valid-loss";
}

function verdictLabel(verdict: string): string {
  switch (verdict) {
    case "clean-win": return "Clean win — profit + rules followed.";
    case "profitable-but-sloppy": return "Process warning — profitable outcome, but plan rules were broken.";
    case "valid-loss": return "Valid loss — setup and risk rules were respected.";
    case "loss-and-sloppy": return "Execution leak — loss combined with broken rules.";
    default: return "Unreviewed — complete the Quick Autopsy to grade process.";
  }
}

export { findSimilarTrades, histDate, strategyForEntry, EDGEBOOK_SITE_BLUEPRINT };
