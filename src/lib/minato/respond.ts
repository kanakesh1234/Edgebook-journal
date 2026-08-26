import type { EdgeBookContext, TradeReviewContext } from "./context";
import { holdTimeStats, formatHold } from "../holdtime";
import { executionVerdict, findSimilarTrades, histDate, strategyForEntry } from "./context";

/* ------------------------------------------------------------------ */
/*  MINATO SENSEI — deterministic persona responses                    */
/*                                                                      */
/*  Every statement is derived from recorded data. No fabrication:     */
/*  if history has no match, he says so. He challenges behavior,       */
/*  never the person. Telugu + English, natural mix.                   */
/* ------------------------------------------------------------------ */

export interface MinatoMessage {
  role: "buddy" | "user";
  text: string;
  state?: string;
}

export const QUICK_PROMPTS = [
  "How am I doing?",
  "What should I fix?",
  "Review my last trade",
  "Find similar trades",
  "How's my discipline?",
] as const;

function money(n: number): string {
  const abs = Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 0 });
  return `${n < 0 ? "−" : "+"}$${abs}`;
}

/** Greeting when the panel opens — reflects the current reality. */
export function greet(ctx: EdgeBookContext): string {
  const name = ctx.userFirstName || "bro";
  if (ctx.recentTrades.length === 0) {
    return `Namaste ${name}. MINATO here. Journal empty ga undhi — first trade log cheyyi, appudu nenu watch cheyyadam start chestha.`;
  }
  if (ctx.discipline.missedDays > 0) {
    return `Namaste ${name}. ${ctx.discipline.missedDays} missed journals unnayi kada... adhi fix cheddam. Adigite adugu.`;
  }
  if (ctx.adherence.breaches30 > 0) {
    return `Namaste ${name}. Recent ga oka few rule breaks kanipisthunnayi. Let's see what happened.`;
  }
  return `Namaste ${name}. Sab bagundi — ${Math.round(ctx.adherence.cleanDayRate * 100)}% clean days last 30 lo. Em help kavali?`;
}

/** Trade review — compares intended (playbook) vs actual (reflection). */
export function reviewTrade(ctx: EdgeBookContext, t: TradeReviewContext): string {
  const { entry, strategy } = t;
  const verdict = executionVerdict(entry);
  const setupName = entry.setup || (strategy ? strategy.name : "");
  const parts: string[] = [];

  if (!setupName && !strategy) {
    parts.push(`Ee trade ki setup label ledu. Playbook lo define chesuko — appudu nenu proper ga review chestha.`);
  } else {
    parts.push(`${setupName} — ${histDate(entry)}, ${money(entry.pnl)}${entry.rr != null ? `, ${entry.rr}R` : ""}.`);
  }

  switch (verdict) {
    case "clean-win":
      parts.push("Profit + rules followed. Clean execution ra. Idi repeat cheyyali, luck kaadu.");
      break;
    case "profitable-but-sloppy":
      parts.push(
        "Profit vachindhi... kani result ni chusi execution ignore cheyyaku. " +
          (entry.reflection?.followedSetup === false ? "Setup follow avvale." : "Risk rules respect avvale.") +
          " Next time adhi hit avvochu.",
      );
      break;
    case "valid-loss":
      parts.push("Loss ayyindhi, but setup and risk rules follow ayyayi. This is a valid loss — market always mana side lo undadu.");
      break;
    case "loss-and-sloppy":
      parts.push(
        "Loss + rules broken — idi execution problem bro, strategy problem kaadu. " +
          (entry.reflection?.cause ? `Nuvve cheppav: "${entry.reflection.cause}".` : "") +
          " Next trade mundu reset avvu.",
      );
      break;
    case "unreflected":
      parts.push("Reflection ivvaledu ee trade ki. What went well, what caused this — quick ga fill cheyyi, appudu nenu honest ga review chestha.");
      break;
  }

  if (strategy?.entryConditions && verdict.includes("sloppy")) {
    parts.push(`Playbook prakaaram: ${strategy.entryConditions.split("\n")[0]} — confirmation kosam wait cheyyali ani rule kada?`);
  }
  return parts.filter(Boolean).join(" ");
}

/** Historical lookup — real records only, DD/MM/YYYY dates. */
export function findSimilar(ctx: EdgeBookContext, setupName?: string): string {
  const name = setupName ?? ctx.focus?.entry.setup ?? ctx.recentTrades.find((e) => e.setup)?.setup;
  if (!name) {
    return "Setup label ledu ee trade ki. Named setup ayithe similar history search chestha.";
  }
  const probe = ctx.recentTrades.find((e) => e.setup.toLowerCase() === name.toLowerCase()) ?? {
    id: "probe", date: "", pnl: 0, rr: null, instrument: "—", direction: null,
    setup: name, notes: "", images: [], createdAt: 0, updatedAt: 0,
  };
  const matches = findSimilarTrades(probe, ctx.recentTrades);
  if (matches.length === 0) {
    return `"${name}" ki similar trade dorakaledu in your recorded history. Nenu invent cheyyanu bro.`;
  }
  const wins = matches.filter((m) => m.pnl > 0).length;
  const top = matches.slice(0, 3).map((m) => `${histDate(m)} (${money(m.pnl)})`).join(", ");
  return (
    `"${name}" — ${matches.length} recorded ${matches.length === 1 ? "trade" : "trades"} dorikindi: ${top}. ` +
    `${wins}/${matches.length} green. ${matches.length < 5 ? "Small sample — pattern worth reviewing, conclusion kaadu." : ""}`
  ).trim();
}

/** Route a user utterance to a deterministic answer. */
export function respond(ctx: EdgeBookContext, input: string): string {
  const q = input.toLowerCase();
  const { stats, discipline, adherence } = ctx;

  if (/how am i|doing|overall|performance|summary/.test(q)) {
    return (
      `Equity ${money(stats.totalPnl)} (${stats.tradingDays} trading days). ` +
      `Adherence ${Math.round(adherence.cleanDayRate * 100)}%, discipline streak ${discipline.disciplineStreak} days, ` +
      `${adherence.violations30} violations last 30. ` +
      (adherence.cleanDayRate >= 0.8
        ? "Process solid ga undhi bro — profit follow avthundi."
        : "Process loose ga undhi konchem — profit kanna process first.")
    );
  }

  if (/fix|improve|wrong|mistake|problem/.test(q)) {
    const pattern = ctx.recurringPatterns[0];
    if (pattern) {
      return `Okate pattern focus cheyyi: "${pattern.pattern}" — ${pattern.count} sarlu recent reviews lo. ` +
        `Anni okate sari fix cheyyalem. Next week idi okate target.`;
    }
    if (discipline.missedDays > 0) return `Mundhu simple thing: ${discipline.missedDays} missed journals. Journaling fix aithe chala clear avthundi bro.`;
    const v = adherence.recent.find((x) => x.severity !== undefined);
    if (v) return `Ee rule meeda focus pettu: "${v.ruleLabel}" — ${v.detail}`;
    return "Prastutham peedha em kanipisthledu bro. Records clean. Consistency ne continue cheyyi.";
  }

  if (/review|last trade|check.*trade/.test(q)) {
    const focus = ctx.focus?.entry ?? ctx.recentTrades[0];
    if (!focus) return "Inka trades log avvaledu. First trade pettu, review cheddam.";
    const t = ctx.focus ?? { entry: focus, strategy: strategyForEntry(focus, ctx.playbook), violations: [] };
    return reviewTrade(ctx, t);
  }

  if (/similar|history|same setup|last time|eppudu/.test(q)) {
    return findSimilar(ctx);
  }

  if (/discipline|streak|xp|journal streak/.test(q)) {
    return (
      `Discipline streak ${discipline.disciplineStreak} days, completion ${Math.round(discipline.completionRate * 100)}%. ` +
      `${discipline.noTradeDays} no-trade days marked, ${discipline.missedDays} missed. ` +
      (discipline.missedDays === 0 ? "Idi bagundi bro — every trading day has an outcome." : "Missed days fix cheyyi bro.")
    );
  }

  if (/rule|lab|playbook|strategy/.test(q)) {
    return (
      `${ctx.activeRules.length} active rules unnayi, playbook lo ${ctx.playbook.length} setups. ` +
      (ctx.adherence.violations30 > 0
        ? `Last 30 lo ${ctx.adherence.violations30} violations — violation log check cheyyi Lab lo.`
        : "Rules anni hold avthunnayi recent ga. Good.")
    );
  }

  if (/milestone|target/.test(q)) {
    return stats.remainingToTarget <= 0
      ? "Target reached ra! Settings lo bigger target pettu, journey continue."
      : `Target ki ${money(stats.remainingToTarget)} to go (${Math.round(stats.targetProgress * 100)}% done). Pace bagundi, rush avvaku.`;
  }

  if (/hold|how long|duration/.test(q)) {
    const holds = holdTimeStats(ctx.recentTrades);
    if (holds.sampleSize === 0) return "Entry/exit times not recorded yet bro. Add times to your trades and I'll calculate hold durations.";
    return (
      `Winning trades: avg ${formatHold(holds.avgWinMin)}, median ${formatHold(holds.medianWinMin)}, longest ${formatHold(holds.longestWinMin)}. ` +
      `Losing trades: avg ${formatHold(holds.avgLossMin)}, median ${formatHold(holds.medianLossMin)}, shortest ${formatHold(holds.shortestLossMin)}. ` +
      `(${holds.sampleSize} trades with timestamps)`
    );
  }

  if (/pattern|recurring|same mistake/.test(q)) {
    const pats = ctx.recurringPatterns;
    if (pats.length === 0) return "No recurring patterns detected yet bro. Keep reviewing — patterns surface after at least two occurrences.";
    const top = pats[0];
    return `I've noticed "${top.pattern}" appeared ${top.count} times in your recent reviews. ${pats[1] ? `Also "${pats[1].pattern}" (${pats[1].count}×). ` : ""}Worth reviewing before your next entry.`;
  }

  if (/concept/.test(q)) {
    const concepts = [...new Set(ctx.recentTrades.flatMap((e) => e.review?.concepts?.used ?? []))];
    if (concepts.length === 0) return "No concepts tagged yet bro. Tag them in the review flow — they help me spot what's working.";
    return `Concepts you've been using: ${concepts.slice(0, 6).join(", ")}. ${concepts.length > 6 ? `+${concepts.length - 6} more.` : ""}`;
  }

  if (/plan vs actual|deviat|followed.*plan|following.*plan|am i following/.test(q)) {
    const linked = ctx.recentTrades.filter((e) => e.planId);
    const followed = linked.filter((e) => e.review?.outcome?.followedPlan === true).length;
    if (linked.length === 0) return "No trades linked to plans yet bro. Plan a trade first, then link it when you execute.";
    return `${followed} of ${linked.length} plan-linked trades followed the plan. ${followed === linked.length ? "Clean execution ra." : "Check the deviations in each trade review."}`;
  }

  // Honest fallback — no fabrication, no pretending to be a full LLM.
  return "Full brain connect avvaledu yet bro — ippudu nenu recorded data meeda matrame matlautanu. Try cheyyi: \"How am I doing?\", \"Review my last trade\", leda \"Find similar trades\".";
}
