import type { EdgeBookContext, TradeReviewContext } from "./context";
import { findSimilarTrades, histDate, strategyForEntry } from "./context";
import { holdTimeStats, formatHold } from "../holdtime";
import { timeWindowAnalytics } from "../time-patterns";

/* ------------------------------------------------------------------ */
/*  MINATO — English-only, analytical, evidence-based.                 */
/*  No Telugu. No "bro". No constant nagging.                          */
/*  Short conclusion → numbered findings → confidence note.            */
/* ------------------------------------------------------------------ */

export interface MinatoMessage {
  role: "buddy" | "user";
  text: string;
}

export const QUICK_PROMPTS = [
  "How am I doing?",
  "What is my best time window?",
  "What is my average winning hold time?",
  "What is my average losing hold time?",
  "What patterns do you see?",
  "What should I improve?",
  "Am I following my plan?",
  "Which setup works best?",
] as const;

function money(n: number): string {
  const abs = Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  return `${n < 0 ? "−" : "+"}$${abs}`;
}

export function greet(ctx: EdgeBookContext): string {
  const name = ctx.userFirstName || "there";
  if (ctx.recentTrades.length === 0) {
    return `Welcome, ${name}. Your journal is empty — log or import a trade and I'll start analyzing your process.`;
  }
  const unreviewed = ctx.recentTrades.filter((e) => e.reviewStatus !== "reviewed").length;
  if (unreviewed > 3) {
    return `Hello, ${name}. You have ${unreviewed} trades awaiting review. Completing those will give me enough data to identify patterns.`;
  }
  return `Hello, ${name}. Ask me anything about your recorded trading data.`;
}

export function respond(ctx: EdgeBookContext, input: string): string {
  const q = input.toLowerCase();
  const { stats, discipline, adherence } = ctx;

  // --- Overview / performance ---
  if (/how am i|doing|overall|performance|summary/.test(q)) {
    const parts: string[] = [];
    parts.push(`Across ${stats.tradingDays} trading days, your net P&L is ${money(stats.totalPnl)} with a ${Math.round(stats.winRate * 100)}% win rate.`);
    if (adherence.cleanDayRate != null) {
      parts.push(`\n1. Clean-plan days: ${Math.round(adherence.cleanDayRate * 100)}%`);
      parts.push(`2. Average day P&L: ${money(stats.avgDayPnl)}`);
      parts.push(`3. Max drawdown: ${money(stats.drawdown)}`);
    }
    if (stats.totalPnl > 0 && adherence.cleanDayRate != null && adherence.cleanDayRate >= 0.7) {
      parts.push(`\nYour process and results are both solid. Keep following your plan.`);
    } else if (adherence.cleanDayRate != null && adherence.cleanDayRate < 0.5) {
      parts.push(`\nYour plan adherence is below 50%. Improving that would likely improve your results.`);
    }
    return parts.join("\n");
  }

  // --- Hold time ---
  if (/hold|how long|duration/.test(q)) {
    const holds = holdTimeStats(ctx.recentTrades);
    if (holds.sampleSize === 0) return "No entry/exit times recorded yet. Add timestamps to your trades and I'll calculate hold durations.";
    const parts: string[] = [];
    parts.push(`Hold time analysis (${holds.sampleSize} trades with timestamps):`);
    parts.push(`1. Average winning hold: ${formatHold(holds.avgWinMin)}`);
    parts.push(`2. Average losing hold: ${formatHold(holds.avgLossMin)}`);
    parts.push(`3. Median winning hold: ${formatHold(holds.medianWinMin)}`);
    parts.push(`4. Median losing hold: ${formatHold(holds.medianLossMin)}`);
    parts.push(`5. Longest winning hold: ${formatHold(holds.longestWinMin)}`);
    parts.push(`6. Shortest losing hold: ${formatHold(holds.shortestLossMin)}`);
    if (holds.avgWinMin != null && holds.avgLossMin != null && holds.avgWinMin < holds.avgLossMin) {
      parts.push(`\nYou're cutting winners shorter than losers — a common discipline leak worth watching.`);
    } else if (holds.avgWinMin != null && holds.avgLossMin != null) {
      parts.push(`\nYou're letting winners run longer than losers. That's healthy discipline.`);
    }
    return parts.join("\n");
  }

  // --- Time windows ---
  if (/best time|worst time|best window|worst window|time window|best session|when.*best|when.*worst|perform best|perform worst|time.*perform/.test(q)) {
    const tw = timeWindowAnalytics(ctx.recentTrades);
    if (tw.sparse) return `Only ${tw.totalSample} trades with timestamps recorded — not enough data to identify a reliable time window yet.`;
    const best = tw.bestWinRate;
    const worst = tw.worstWinRate;
    if (!best && !worst) return "No clear time pattern emerged from your recorded trades.";
    const parts: string[] = [];
    if (best) {
      parts.push(`Your strongest recorded window is ${best.label}.`);
      parts.push(`\n1. Trades: ${best.trades}`);
      parts.push(`2. Win rate: ${best.winRate ?? "—"}%`);
      parts.push(`3. Average R: ${best.avgR != null ? `${best.avgR >= 0 ? "+" : ""}${best.avgR}R` : "—"}`);
      parts.push(`4. Average P&L: ${money(best.avgPnl)}`);
      parts.push(`5. Sample: ${best.trades} trades`);
    }
    if (worst && worst.label !== best?.label) {
      parts.push(`\nWeakest window: ${worst.label} — ${worst.winRate ?? "—"}% win rate across ${worst.trades} trades.`);
    }
    parts.push(`\n${best && best.trades >= 10 ? "Sample size is reasonable." : "Sample is still developing — treat this as directional, not definitive."}`);
    return parts.join("\n");
  }

  // --- Highest RR window ---
  if (/highest.*rr|rr.*window|rr.*best/.test(q)) {
    const tw = timeWindowAnalytics(ctx.recentTrades);
    const byR = [...tw.windows].filter((w) => w.avgR != null && w.trades >= 2).sort((a, b) => (b.avgR ?? 0) - (a.avgR ?? 0));
    if (byR.length === 0) return "No R-multiple data available for time window analysis yet. Tag R values on your trades.";
    const top = byR[0];
    const topR = top.avgR ?? 0;
    return `Your highest-RR window is ${top.label}.\n\n1. Average R: ${topR >= 0 ? "+" : ""}${topR}R\n2. Trades: ${top.trades}\n3. Win rate: ${top.winRate ?? "—"}%\n4. Total R: ${top.totalR != null ? `${top.totalR >= 0 ? "+" : ""}${top.totalR}R` : "—"}\n\nSample size: ${top.trades}. ${top.trades >= 10 ? "Reasonable confidence." : "Early signal — more data needed."}`;
  }

  // --- Patterns ---
  if (/pattern|recurring|same mistake/.test(q)) {
    const pats = ctx.recurringPatterns;
    if (pats.length === 0) return "No recurring patterns detected yet. Patterns surface after at least two occurrences in your reviews.";
    const parts: string[] = [`Detected ${pats.length} recurring ${pats.length === 1 ? "pattern" : "patterns"}:`];
    pats.forEach((p, i) => {
      parts.push(`${i + 1}. ${p.pattern} — ${p.count} occurrences`);
    });
    parts.push(`\nThese are based on your recorded reflections. Review the evidence in each trade for details.`);
    return parts.join("\n");
  }

  // --- Concepts ---
  if (/concept/.test(q)) {
    const concepts = [...new Set(ctx.recentTrades.flatMap((e) => e.review?.concepts?.used ?? []))];
    if (concepts.length === 0) return "No concepts tagged yet. Tag them in the review flow — they help identify which ideas are working for you.";
    return `Concepts you've been using: ${concepts.slice(0, 8).join(", ")}.`;
  }

  // --- Plan vs actual ---
  if (/plan.*actual|deviat|followed.*plan|following.*plan|am i following/.test(q)) {
    const linked = ctx.recentTrades.filter((e) => e.planId);
    const followed = linked.filter((e) => e.review?.outcome?.followedPlan === true).length;
    if (linked.length === 0) return "No trades linked to plans yet. Create a plan first, then link it when you execute.";
    return `Plan adherence: ${followed} of ${linked.length} plan-linked trades followed the plan (${Math.round((followed / linked.length) * 100)}%).\n${followed === linked.length ? "Clean execution across the board." : "Check the deviations in each trade review for specifics."}`;
  }

  // --- Discipline ---
  if (/discipline|streak|journal streak/.test(q)) {
    return `Discipline streak: ${discipline.disciplineStreak} days. Completion rate: ${Math.round(discipline.completionRate * 100)}%. ${discipline.missedDays > 0 ? `${discipline.missedDays} missed journal days.` : "No missed journal days."}`;
  }

  // --- Rules ---
  if (/rule|violate|violation/.test(q)) {
    const ruleViolations = ctx.recentTrades.filter((e) => {
      const c = e.checklist;
      if (!c) return false;
      const items = [c.r1Time?.answer, c.r2Environment?.answer, c.r3LiquiditySweep?.answer, c.r4Manipulation?.answer, c.r5Target?.answer, c.r6Smt?.answer];
      return items.some((a) => a === false);
    });
    if (ruleViolations.length === 0) return "No rule violations detected in your reviewed trades.";
    return `${ruleViolations.length} trades with rule violations detected. Check the Trading Lab for the specific rules that were broken.`;
  }

  // --- Trade review ---
  if (/review|last trade|autopsy/.test(q)) {
    const focus = ctx.focus?.entry ?? ctx.recentTrades[0];
    if (!focus) return "No trades to review yet.";
    const verdict = executionVerdict(focus);
    const setupName = focus.setup || "Unnamed";
    const parts: string[] = [`Last trade: ${setupName} — ${histDate(focus)}, ${money(focus.pnl)}${focus.rr != null ? `, ${focus.rr}R` : ""}.`];
    switch (verdict) {
      case "clean-win":
        parts.push("Profit + rules followed. Clean execution — repeat this process.");
        break;
      case "profitable-but-sloppy":
        parts.push("Profitable, but execution deviated from the plan. Don't let the result mask the process gap.");
        break;
      case "valid-loss":
        parts.push("Loss, but setup and risk rules were followed. This is a valid loss — the market doesn't always cooperate.");
        break;
      case "loss-and-sloppy":
        parts.push("Loss + rules broken. This is an execution issue, not a strategy issue.");
        break;
      case "unreflected":
        parts.push("No review recorded for this trade. Complete the autopsy to unlock pattern analysis.");
        break;
    }
    return parts.join(" ");
  }

  // --- Similar trades ---
  if (/similar|history|same setup/.test(q)) {
    const name = ctx.focus?.entry.setup ?? ctx.recentTrades.find((e) => e.setup)?.setup;
    if (!name) return "No setup label found. Tag your trades with a setup name to enable historical comparison.";
    const matches = ctx.recentTrades.filter((e) => e.setup.toLowerCase() === name.toLowerCase());
    if (matches.length <= 1) return `No other recorded trades match "${name}" yet.`;
    const wins = matches.filter((e) => e.pnl > 0).length;
    return `"${name}" — ${matches.length} recorded trades. ${wins}/${matches.length} profitable. Combined P&L: ${money(matches.reduce((s, e) => s + e.pnl, 0))}.`;
  }

  // --- Improve ---
  if (/improve|fix|better/.test(q)) {
    const pattern = ctx.recurringPatterns[0];
    if (pattern) return `Focus on one thing: "${pattern.pattern}" — it appeared ${pattern.count} times in your recent reviews. Fixing one pattern at a time is more effective than trying to change everything.`;
    if (discipline.missedDays > 0) return `Start with the basics: ${discipline.missedDays} missed journal days. Completing those builds the data I need to help you.`;
    return "Your recorded data doesn't show a clear weakness yet. Keep logging trades and I'll identify patterns as they emerge.";
  }

  // --- Fallback ---
  return `I can answer questions about your recorded trades — hold times, time windows, patterns, rule adherence, plan vs actual, and concepts. What would you like to know?`;
}

function executionVerdict(entry: EdgeBookContext["recentTrades"][number]): string {
  const r = entry.reflection;
  if (!r || (r.followedSetup === null && r.followedRisk === null)) return "unreflected";
  const brokeRules = r.followedSetup === false || r.followedRisk === false;
  if (entry.pnl > 0) return brokeRules ? "profitable-but-sloppy" : "clean-win";
  if (entry.pnl < 0) return brokeRules ? "loss-and-sloppy" : "valid-loss";
  return brokeRules ? "loss-and-sloppy" : "valid-loss";
}

// Keep existing exports for compatibility
export { findSimilarTrades, histDate, strategyForEntry };
