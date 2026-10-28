import type { EdgeBookContext, TradeReviewContext } from "./context";
import { findSimilarTrades, histDate, strategyForEntry } from "./context";
import { holdTimeStats, formatHold } from "../holdtime";
import { timeWindowAnalytics } from "../time-patterns";
import { mistakeIndex, mistakeOf, mistakeTagsOf } from "../mistakes";
import { computeBrainCalibration } from "../ai-brain";

/* ------------------------------------------------------------------ */
/*  MINATO — English-only, analytical, evidence-based.                 */
/*  No Telugu. No "bro". No constant nagging.                          */
/*  Short conclusion → numbered findings → confidence note.            */
/* ------------------------------------------------------------------ */

export interface MinatoMessage {
  role: "buddy" | "user";
  text: string;
}

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
  const cal = computeBrainCalibration(ctx.recentTrades, []);
  const unreviewed = ctx.recentTrades.filter((e) => e.reviewStatus !== "reviewed").length;
  if (unreviewed > 3) {
    return `Hello, ${name}. I've indexed ${ctx.recentTrades.length} trades (${cal.tier} calibration · ${cal.calibrationPct}%). Completing your ${unreviewed} unreviewed trades will sharpen pattern accuracy further.`;
  }
  return `Hello, ${name}. I've indexed ${ctx.recentTrades.length} trades (${cal.tier} calibration · ${cal.calibrationPct}%). Ask me anything about your setups, mistakes, psychology, or edge.`;
}

export function respond(ctx: EdgeBookContext, input: string): string {
  const q = input.toLowerCase().trim();
  const { stats, discipline, adherence } = ctx;
  const cal = computeBrainCalibration(ctx.recentTrades, []);
  const mistakes = mistakeIndex(ctx.recentTrades);

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
      return lines.join("\n");
    }
  }

  // --- Mistakes / leaks / why losing / biggest error ---
  if (/mistake|leak|losing|loss|wrong|blunder|error|costing|hurt|weakness/.test(q)) {
    if (mistakes.length === 0) {
      const losses = ctx.recentTrades.filter((e) => e.pnl < 0);
      if (losses.length === 0) return "You have no losing trades or tagged mistakes recorded yet.";
      const totalLoss = losses.reduce((s, e) => s + e.pnl, 0);
      return `You have ${losses.length} losing trade${losses.length === 1 ? "" : "s"} (${money(totalLoss)} total), but none have mistake tags yet.\n\n1. **Action needed**: Open your losing trades in the Journal and complete the Quick Autopsy.\n2. **Why it matters**: Once you tag mistakes, I calculate the exact dollar cost of each habit and warn you before you repeat it in Plan a Trade.`;
    }
    const top = mistakes[0]!;
    const parts: string[] = [
      `Your #1 process leak is **${top.label}** — recorded ${top.count} time${top.count === 1 ? "" : "s"} and costing ${money(-top.cost)} in losing trades.`,
    ];
    mistakes.slice(0, 4).forEach((m, i) => {
      parts.push(`${i + 1}. **${m.label}** — ${m.count} trade${m.count === 1 ? "" : "s"} · cost ${money(-m.cost)}`);
    });
    parts.push(`\n**Takeaway**: Select **${top.label}** under “Mistakes to watch for today” in your next pre-trade Thought step to cut this leak first. (Sample: ${ctx.recentTrades.length} trades · ${cal.tier} calibration)`);
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
      return "No emotional states are recorded on your reviewed trades yet. Pick how you feel during Plan & Record and Quick Autopsy so I can measure how your mindset impacts your win rate.";
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
      parts.push(`\n**Risk trigger**: Trading while **${worst.k}** has cost ${money(worst.pnl)} (${worst.wr}% win rate). Step away or cut size when you notice this state.`);
    }
    return parts.join("\n");
  }

  // --- Overview / performance ---
  if (/how am i|doing|overall|performance|summary|stats|edge|accuracy|brain/.test(q)) {
    const parts: string[] = [];
    parts.push(`Across **${stats.tradingDays} trading days** (${ctx.recentTrades.length} trades), your net P&L is **${money(stats.totalPnl)}** with a **${Math.round(stats.winRate * 100)}%** win rate.`);
    parts.push(`1. **Average day P&L**: ${money(stats.avgDayPnl)} · Max drawdown: ${money(stats.drawdown)}`);
    if (adherence.cleanDayRate != null) {
      parts.push(`2. **Clean-plan days**: ${Math.round(adherence.cleanDayRate * 100)}%`);
    }
    if (mistakes[0]) {
      parts.push(`3. **Primary leak**: ${mistakes[0].label} (${mistakes[0].count}× · ${money(-mistakes[0].cost)})`);
    }
    parts.push(`4. **AI Brain calibration**: ${cal.calibrationPct}% (${cal.tier} tier · ${cal.reviewedTrades} reviewed trades indexed)`);
    return parts.join("\n");
  }

  // --- Hold time ---
  if (/hold|how long|duration/.test(q)) {
    const holds = holdTimeStats(ctx.recentTrades);
    if (holds.sampleSize === 0) return "No entry/exit times recorded yet. Add timestamps to your trades and I'll calculate hold durations.";
    const parts: string[] = [];
    parts.push(`Hold time analysis (**${holds.sampleSize} trades** with timestamps):`);
    parts.push(`1. **Average winning hold**: ${formatHold(holds.avgWinMin)} (median ${formatHold(holds.medianWinMin)})`);
    parts.push(`2. **Average losing hold**: ${formatHold(holds.avgLossMin)} (median ${formatHold(holds.medianLossMin)})`);
    parts.push(`3. **Longest win vs shortest loss**: ${formatHold(holds.longestWinMin)} vs ${formatHold(holds.shortestLossMin)}`);
    if (holds.avgWinMin != null && holds.avgLossMin != null && holds.avgWinMin < holds.avgLossMin) {
      parts.push(`\nYou're cutting winners shorter than losers — watch for premature exits on valid setups.`);
    } else if (holds.avgWinMin != null && holds.avgLossMin != null) {
      parts.push(`\nYou're letting winners run longer than losers — healthy execution asymmetry.`);
    }
    return parts.join("\n");
  }

  // --- Time windows ---
  if (/best time|worst time|best window|worst window|time window|best session|when.*best|when.*worst|perform best|perform worst|time.*perform|session|hour|morning/.test(q)) {
    const tw = timeWindowAnalytics(ctx.recentTrades);
    if (tw.sparse) {
      return `1. **Sample size**\n   - Only ${tw.totalSample} trade${tw.totalSample === 1 ? "" : "s"} have entry timestamps — add entry/exit times to more trades to unlock 15-minute session edge windows.`;
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
    if (byR.length === 0) return "No R-multiple data available for time window analysis yet. Record entry, stop, and exit prices on your trades.";
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
    if (bySetup.size === 0) return "No setups recorded yet. Name a playbook setup and tag your trades with it — then I can rank them.";
    const rows = [...bySetup.entries()]
      .map(([name, v]) => ({ name, ...v, winRate: v.wins + v.losses > 0 ? Math.round((v.wins / (v.wins + v.losses)) * 100) : null }))
      .sort((a, b) => b.pnl - a.pnl);
    const parts: string[] = [`Your top setup is **${rows[0]!.name}** (${money(rows[0]!.pnl)} across ${rows[0]!.n} trades):`];
    rows.slice(0, 4).forEach((r, i) => {
      parts.push(`${i + 1}. **${r.name}** — ${money(r.pnl)} · ${r.winRate ?? "—"}% win rate · ${r.n} trades${r.rr.length > 0 ? ` · avg ${(r.rr.reduce((s, x) => s + x, 0) / r.rr.length).toFixed(2)}R` : ""}`);
    });
    const worst = rows[rows.length - 1]!;
    if (rows.length > 1 && worst.pnl < 0) {
      parts.push(`\n**"${worst.name}"** is underperforming (${money(worst.pnl)} over ${worst.n} trades). Tighten its confirmation rules in the Trading Lab.`);
    }
    return parts.join("\n");
  }

  // --- Instrument / direction performance ---
  if (/instrument|symbol|long vs short|longs? or shorts?|direction|mnq|nq|es|mes/.test(q)) {
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
    if (pats.length === 0 && mistakes.length === 0) return "No recurring patterns detected yet. Patterns surface after at least two occurrences in your reviews.";
    const parts: string[] = [`Detected recurring patterns across your journal:`];
    if (pats.length > 0) {
      pats.forEach((p, i) => parts.push(`${i + 1}. **${p.pattern}** — ${p.count} occurrences`));
    } else {
      mistakes.slice(0, 3).forEach((m, i) => parts.push(`${i + 1}. **${m.label}** — ${m.count} occurrences (${money(-m.cost)})`));
    }
    return parts.join("\n");
  }

  // --- Plan vs actual / rules / discipline ---
  if (/plan.*actual|deviat|followed.*plan|following.*plan|am i following|rule|violate|violation|discipline|streak/.test(q)) {
    const linked = ctx.recentTrades.filter((e) => e.planId || e.review?.outcome?.followedPlan != null);
    const followed = linked.filter((e) => e.review?.outcome?.followedPlan === true).length;
    const pct = linked.length > 0 ? Math.round((followed / linked.length) * 100) : null;
    return [
      pct != null
        ? `Plan adherence is **${pct}%** (${followed} of ${linked.length} reviewed trades followed the plan).`
        : `Discipline completion rate is **${Math.round(discipline.completionRate * 100)}%** across ${stats.tradingDays} trading days.`,
      `1. **Clean-plan days**: ${adherence.cleanDayRate != null ? `${Math.round(adherence.cleanDayRate * 100)}%` : "—"}`,
      `2. **Reviewed trades**: ${ctx.recentTrades.filter((e) => e.reviewStatus === "reviewed").length} of ${ctx.recentTrades.length}`,
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
    return parts.join("\n");
  }

  // --- Comprehensive Adaptive Brain synthesis for any open-ended question ---
  const recent5 = ctx.recentTrades.slice(0, 5);
  const recentWins = recent5.filter((e) => e.pnl > 0).length;
  const recentPnl = recent5.reduce((s, e) => s + e.pnl, 0);
  const topMistake = mistakes[0];
  const latestLesson = ctx.recentTrades.find((e) => e.review?.followUp?.biggestMistake || e.reflection?.lesson);
  const lessonQuote = latestLesson?.review?.followUp?.biggestMistake ?? latestLesson?.reflection?.lesson;

  const synthesis: string[] = [
    `Based on your **${ctx.recentTrades.length} recorded trades** (${cal.tier} calibration · ${cal.calibrationPct}%), your overall win rate is **${Math.round(stats.winRate * 100)}%** (${money(stats.totalPnl)} net).`,
    `1. **Recent momentum (last ${recent5.length} trades)**: ${recentWins}/${recent5.length} won (${money(recentPnl)})`,
  ];
  if (topMistake) {
    synthesis.push(`2. **Biggest mistake to eliminate**: ${topMistake.label} (${topMistake.count} occurrences · cost ${money(-topMistake.cost)})`);
  } else {
    synthesis.push(`2. **Average day P&L**: ${money(stats.avgDayPnl)} · Max drawdown: ${money(stats.drawdown)}`);
  }
  if (lessonQuote) {
    synthesis.push(`3. **Your own recent lesson (${latestLesson!.date})**: “${lessonQuote}”`);
  }
  synthesis.push(`\nAsk me about a specific date, setup, mistake cost, emotional state, or 15-minute NY session window for a deeper drill-down.`);
  return synthesis.join("\n");
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

export { findSimilarTrades, histDate, strategyForEntry };
