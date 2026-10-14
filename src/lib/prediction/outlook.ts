import type { JournalEntry, TradePlan } from "../types";
import { dayTrades } from "../risk";
import { mistakeTagsOf } from "../mistakes";
import { ruleStats, statFor, ruleText } from "../rule-stats";

/**
 * Pre-trade outlook: "given how you have traded before, and what you just planned, what is likely to happen to YOU?"
 *
 * It is a statement about the trader's own process and results, never about the market: no buy/sell calls, no price targets.
 * The numbers are computed here, offline and deterministically, from the trader's own journal. The AI (optional, see
 * /api/journal/outlook) only puts words around these facts — it cannot add a statistic that is not in them.
 */
export type PlanDraft = {
  date: string;
  setupId?: string; setupName?: string;
  emotion?: string; emotionReason?: string;
  thesis: string; draw?: string; invalidation?: string; breakPlan?: string;
  news: string[];
  maxLoss?: number;
  watch: string[];
  /** Rule texts the trader ticked / left unticked, and how many the setup has. */
  confirmedRules: string[]; skippedRules: string[];
};

export type Factor = { id: string; label: string; n: number; winRate: number | null; avgPnl: number | null; /** winRate − baseline, in points */ delta: number | null };
export type OutlookFacts = {
  baseline: { n: number; winRate: number | null; avgPnl: number | null };
  factors: Factor[];
  /** Mistakes that appeared most in the trades most like this one. */
  likelyMistakes: { key: string; label: string; count: number; of: number }[];
  skippedRuleHistory: { rule: string; skippedBefore: number; of: number; skippedAvgPnl: number | null; confirmedAvgPnl: number | null }[];
  tradeOfDay: number; afterLossToday: boolean;
};
export type Lean = "favorable" | "mixed" | "unfavorable" | "unknown";
export type Outlook = { lean: Lean; headline: string; points: string[]; watch: string[]; source: "rules" | "ai"; note?: string };

const MIN = 3; // a factor needs at least this many past trades to count
const r2 = (n: number) => Math.round(n * 100) / 100;
const wrOf = (t: JournalEntry[]) => (t.length ? r2(t.filter((e) => e.pnl > 0).length / t.length) : null);
const avgOf = (t: JournalEntry[]) => (t.length ? r2(t.reduce((s, e) => s + e.pnl, 0) / t.length) : null);
const planFor = (e: JournalEntry, plans: TradePlan[]) => plans.find((p) => p.id === e.planId);

export function buildOutlookFacts(d: PlanDraft, entries: JournalEntry[], plans: TradePlan[]): OutlookFacts {
  // Only trades dated before today's plan, so a trade being logged right now never predicts itself.
  const past = entries.filter((e) => e.date <= d.date && e.pnl !== undefined);
  const base = { n: past.length, winRate: wrOf(past), avgPnl: avgOf(past) };
  const factors: Factor[] = [];
  const related = new Map<string, JournalEntry>();
  const addFactor = (id: string, label: string, trades: JournalEntry[]) => {
    if (trades.length === 0) return;
    const w = wrOf(trades);
    factors.push({ id, label, n: trades.length, winRate: w, avgPnl: avgOf(trades), delta: w != null && base.winRate != null ? r2(w - base.winRate) : null });
    if (trades.length >= MIN) trades.forEach((t) => related.set(t.id, t));
  };

  if (d.setupId) addFactor("setup", `trades on your “${d.setupName ?? "this"}” setup`, past.filter((e) => e.setupId === d.setupId));
  if (d.emotion) addFactor("emotion", `plans written while feeling ${d.emotion.toLowerCase()}`, past.filter((e) => planFor(e, plans)?.emotionalState === d.emotion));

  const withPlan = past.map((e) => ({ e, p: planFor(e, plans) })).filter((x): x is { e: JournalEntry; p: TradePlan } => !!x.p);
  const anySkipped = (p: TradePlan) => p.rules.some((r) => r.state !== "ready");
  if (d.skippedRules.length > 0) addFactor("skipped", "trades where you skipped a setup rule", withPlan.filter((x) => x.p.rules.length > 0 && anySkipped(x.p)).map((x) => x.e));
  else if (d.confirmedRules.length > 0) addFactor("allrules", "trades where you confirmed every rule", withPlan.filter((x) => x.p.rules.length > 0 && !anySkipped(x.p)).map((x) => x.e));
  if (d.news.length > 0) addFactor("news", "trades planned on a news day", withPlan.filter((x) => (x.p.newsEvents?.length ?? 0) > 0).map((x) => x.e));

  // Position in the day: a trade after a loss earlier today behaves differently from a first trade.
  const today = dayTrades(d.date, entries);
  const tradeOfDay = today.length + 1;
  const afterLossToday = today.some((t) => t.pnl < 0);
  if (afterLossToday) {
    const after: JournalEntry[] = [];
    for (const day of new Set(past.map((e) => e.date))) { if (day === d.date) continue; const t = dayTrades(day, entries); t.forEach((e, i) => { if (i > 0 && t.slice(0, i).some((x) => x.pnl < 0)) after.push(e); }); }
    addFactor("afterloss", "trades taken after an earlier loss the same day", after);
  }

  // Mistakes most common in the closest matches (or, with none, across the whole journal).
  const pool = related.size >= MIN ? [...related.values()] : past;
  const counts = new Map<string, { label: string; count: number }>();
  for (const e of pool) for (const t of mistakeTagsOf(e)) { const c = counts.get(t.key) ?? { label: t.label, count: 0 }; c.count++; counts.set(t.key, c); }
  const likelyMistakes = [...counts.entries()].map(([key, v]) => ({ key, label: v.label, count: v.count, of: pool.length })).filter((m) => m.count >= 2).sort((a, b) => b.count - a.count).slice(0, 3);

  const stats = ruleStats(plans, entries);
  const skippedRuleHistory = d.skippedRules.flatMap((rule) => {
    const s = statFor(stats, d.setupId, rule);
    return s && s.skipped > 0 ? [{ rule: ruleText(rule), skippedBefore: s.skipped, of: s.planned, skippedAvgPnl: s.skippedAvgPnl, confirmedAvgPnl: s.confirmedAvgPnl }] : [];
  }).slice(0, 4);

  return { baseline: base, factors, likelyMistakes, skippedRuleHistory, tradeOfDay, afterLossToday };
}

const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);
const money = (n: number | null) => (n == null ? "—" : `${n < 0 ? "−" : "+"}$${Math.abs(Math.round(n))}`);

/** The offline answer. Always available; the AI only rephrases and connects it with what the trader wrote. */
export function localOutlook(f: OutlookFacts, d: PlanDraft): Outlook {
  const usable = f.factors.filter((x) => x.n >= MIN && x.delta != null);
  if (f.baseline.n < 5) return { lean: "unknown", source: "rules", headline: "Not enough history to predict yet.", points: [`You have ${f.baseline.n} past trade${f.baseline.n === 1 ? "" : "s"}. After about 5–10 logged trades with plans, this will compare your new plan with how similar ones went.`], watch: d.watch.slice(0, 3) };

  const weighted = usable.reduce((s, x) => s + x.delta! * Math.min(x.n, 10), 0) / Math.max(1, usable.reduce((s, x) => s + Math.min(x.n, 10), 0));
  const lean: Lean = usable.length === 0 ? "mixed" : weighted >= 0.1 ? "favorable" : weighted <= -0.1 ? "unfavorable" : "mixed";
  const points: string[] = [];
  for (const x of usable.sort((a, b) => Math.abs(b.delta!) - Math.abs(a.delta!)).slice(0, 3)) {
    const dir = x.delta! > 0 ? "better" : x.delta! < 0 ? "worse" : "about the same";
    points.push(`${x.n} ${x.label}: ${pct(x.winRate)} won, average ${money(x.avgPnl)} — ${dir} than your usual ${pct(f.baseline.winRate)}.`);
  }
  for (const s of f.skippedRuleHistory) points.push(`You have skipped “${s.rule}” ${s.skippedBefore} of ${s.of} times; those trades averaged ${money(s.skippedAvgPnl)}${s.confirmedAvgPnl != null ? ` vs ${money(s.confirmedAvgPnl)} when you confirmed it` : ""}.`);
  const thin = f.factors.filter((x) => x.n < MIN);
  if (thin.length > 0) points.push(`Too few past trades to judge: ${thin.map((x) => x.label).join("; ")}.`);
  if (f.afterLossToday && !f.factors.some((x) => x.id === "afterloss")) points.push("You already took a loss today, which is when discipline slips most — your plan's loss limit matters more now.");

  const watch = [...f.likelyMistakes.map((m) => `${m.label} — in ${m.count} of your ${m.of} most similar trades`), ...d.watch.map((w) => `${w} (you chose to watch this)`)].slice(0, 4);
  const headline = lean === "favorable" ? "Your history says this plan looks stronger than your average." : lean === "unfavorable" ? "Your history says plans like this have gone worse than your average." : "Mixed: nothing in your history strongly favours or warns against this plan.";
  return { lean, headline, points: points.slice(0, 5), watch, source: "rules" };
}
