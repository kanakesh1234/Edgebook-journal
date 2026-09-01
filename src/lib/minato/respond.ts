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

// Quick-prompt chips were removed — they repeated the same handful of
// canned questions on every open and the user found that irritating.
export const QUICK_PROMPTS: readonly string[] = [];

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
    if (tw.sparse) {
      return `1. Sample size\n   - Only ${tw.totalSample} trade${tw.totalSample === 1 ? "" : "s"} have entry timestamps — there is not enough data to identify a reliable time window yet.\n   - I won't fabricate probabilities from that. Add entry/exit times to more trades and ask again.`;
    }
    const qualified = [...tw.windows]
      .filter((w) => w.trades >= 2)
      .sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0) || b.avgPnl - a.avgPnl);
    if (qualified.length === 0) return "No clear time pattern emerged from your recorded trades yet.";
    const best = qualified[0];
    const second = qualified[1] ?? null;
    const weak = [...qualified].sort((a, b) => (a.winRate ?? 100) - (b.winRate ?? 100))[0];
    const parts: string[] = [];
    parts.push(`1. Best window: ${best.label} NY`);
    parts.push(`   - ${best.trades} trades · ${best.winRate ?? "—"}% win rate · avg ${money(best.avgPnl)}${best.avgR != null ? ` · avg ${best.avgR >= 0 ? "+" : ""}${best.avgR}R` : ""}`);
    if (second && second.label !== best.label) {
      parts.push(`2. Secondary window: ${second.label} NY`);
      parts.push(`   - ${second.trades} trades · ${second.winRate ?? "—"}% win rate · avg ${money(second.avgPnl)}`);
    }
    if (weak && weak.label !== best.label && (weak.winRate ?? 100) < 50) {
      parts.push(`${second && second.label !== best.label ? "3" : "2"}. Weak window: ${weak.label} NY`);
      parts.push(`   - ${weak.trades} trades · ${weak.winRate ?? "—"}% win rate · lower expectancy`);
    }
    parts.push(`4. Conclusion`);
    parts.push(`   - Strongest historical window: ${best.label}. Weakest: ${weak?.label ?? "n/a"}.`);
    parts.push(`   - Sample: ${tw.totalSample} timestamped trades — treat this as a historical tendency, not a guarantee.`);
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

  // --- Setup performance ---
  if (/which setup|best setup|setup.*(works|perform|win|profit|best)|worst setup/.test(q)) {
    const bySetup = new Map<string, { pnl: number; wins: number; losses: number; rr: number[]; n: number }>();
    for (const e of ctx.recentTrades) {
      const key = e.setupId || e.setup;
      if (!key) continue;
      const cur = bySetup.get(key) ?? { pnl: 0, wins: 0, losses: 0, rr: [], n: 0 };
      cur.pnl += e.pnl;
      cur.n += 1;
      if (e.pnl > 0) cur.wins += 1;
      if (e.pnl < 0) cur.losses += 1;
      if (e.rr != null && Number.isFinite(e.rr)) cur.rr.push(e.rr);
      bySetup.set(key, cur);
    }
    if (bySetup.size === 0) return "No setups recorded yet. Name a playbook setup and tag your trades with it — then I can rank them.";
    const rows = [...bySetup.entries()]
      .map(([name, v]) => ({ name, ...v, winRate: v.wins + v.losses > 0 ? Math.round((v.wins / (v.wins + v.losses)) * 100) : null }))
      .sort((a, b) => b.pnl - a.pnl);
    const parts: string[] = [`Setup performance across ${rows.length} named ${rows.length === 1 ? "setup" : "setups"}:`];
    rows.slice(0, 4).forEach((r, i) => {
      parts.push(`${i + 1}. ${r.name} — ${money(r.pnl)} · ${r.winRate ?? "—"}% win rate · ${r.n} trades${r.rr.length > 0 ? ` · avg ${(r.rr.reduce((s, x) => s + x, 0) / r.rr.length).toFixed(2)}R` : ""}`);
    });
    const worst = rows[rows.length - 1];
    if (rows.length > 1 && worst.pnl < 0) {
      parts.push(`\n"${worst.name}" is your weakest (${money(worst.pnl)} over ${worst.n} trades). Consider tightening its rules or trading it smaller.`);
    }
    return parts.join("\n");
  }

  // --- Instrument / direction performance ---
  if (/instrument|symbol|long vs short|longs? or shorts?|direction/.test(q)) {
    const decided = ctx.recentTrades.filter((e) => e.direction);
    if (decided.length < 3) return "Not enough tagged trades yet — record direction on your entries and I'll compare longs vs shorts and per-instrument results.";
    const longs = decided.filter((e) => e.direction === "long");
    const shorts = decided.filter((e) => e.direction === "short");
    const stat = (list: typeof decided) => {
      const pnl = list.reduce((s, e) => s + e.pnl, 0);
      const wins = list.filter((e) => e.pnl > 0).length;
      const losses = list.filter((e) => e.pnl < 0).length;
      return `${money(pnl)} · ${wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : "—"}% win rate · ${list.length} trades`;
    };
    const parts: string[] = ["Long vs short:"];
    parts.push(`1. Long: ${stat(longs)}`);
    parts.push(`2. Short: ${stat(shorts)}`);
    const byInstrument = new Map<string, { pnl: number; n: number }>();
    for (const e of ctx.recentTrades) {
      if (!e.instrument || e.instrument === "—") continue;
      const cur = byInstrument.get(e.instrument) ?? { pnl: 0, n: 0 };
      cur.pnl += e.pnl;
      cur.n += 1;
      byInstrument.set(e.instrument, cur);
    }
    const top = [...byInstrument.entries()].sort((a, b) => b[1].pnl - a[1].pnl)[0];
    if (top) parts.push(`3. Best instrument: ${top[0]} — ${money(top[1].pnl)} over ${top[1].n} trades`);
    return parts.join("\n");
  }

  // --- Day of week ---
  if (/day of week|weekday|monday|friday|days?.*pattern|which day/.test(q)) {
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
    if (byDow.size < 2) return "Need trades spread across multiple weekdays before day-of-week patterns mean anything.";
    const order = ["Mon", "Tue", "Wed", "Thu", "Fri"];
    const rows = [...byDow.entries()].filter(([d]) => order.includes(d));
    if (rows.length < 2) return "Your recorded days are too concentrated for a weekday comparison yet.";
    const best = [...rows].sort((a, b) => b[1].pnl - a[1].pnl)[0];
    const worst = [...rows].sort((a, b) => a[1].pnl - b[1].pnl)[0];
    const wr = (v: (typeof rows)[number][1]) => (v.wins + v.losses > 0 ? Math.round((v.wins / (v.wins + v.losses)) * 100) : null);
    const parts: string[] = ["Day-of-week pattern:"];
    parts.push(`1. Best day: ${best[0]} — ${money(best[1].pnl)} · ${wr(best[1]) ?? "—"}% win rate · ${best[1].n} trades`);
    parts.push(`2. Weakest day: ${worst[0]} — ${money(worst[1].pnl)} · ${wr(worst[1]) ?? "—"}% win rate · ${worst[1].n} trades`);
    parts.push(`3. Note: weekday effects are usually noise at small sample sizes — treat as tendency only.`);
    return parts.join("\n");
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
