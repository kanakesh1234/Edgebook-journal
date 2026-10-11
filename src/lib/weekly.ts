import type { JournalEntry, TradePlan } from "./types";
import { addDays, parseDateKey, todayKey, weekdayShort } from "./format";
import { mistakeOf, type MistakeKey } from "./mistakes";
import { feelingFromReview, feelingOf, type FeelingKey } from "./feelings";
import { dayLimitFor, dayTrades, riskFor, type DayRisk } from "./risk";

/**
 * Weekly review model. Pure functions over the journal: nothing here is stored, so the review always matches the
 * trades, plans and autopsies as they are right now. Weeks run Monday → Sunday and are keyed by their Monday.
 */
export const weekStartOf = (date: string) => addDays(date, -((parseDateKey(date).getDay() + 6) % 7));
export const weekEndOf = (start: string) => addDays(start, 6);
export const shiftWeek = (start: string, n: number) => addDays(start, n * 7);
export const thisWeekStart = () => weekStartOf(todayKey());

export type WeekDay = { date: string; label: string; future: boolean; trades: JournalEntry[]; net: number; limit: number | null; risk: DayRisk | null };
export type Insight = { tone: "good" | "warn" | "info"; text: string };
export type WeekMistake = { key: MistakeKey; label: string; count: number; cost: number; weeksSeen: number; recurring: boolean };
export type WeekFeeling = { key: FeelingKey; label: string; tone: "good" | "neutral" | "risk"; count: number; net: number };

export type WeekReview = {
  start: string; end: string; isCurrent: boolean;
  days: WeekDay[]; trades: JournalEntry[];
  count: number; net: number; wins: number; losses: number;
  winRate: number | null; avgR: number | null; profitFactor: number | null; avgWin: number | null; avgLoss: number | null;
  best: JournalEntry | null; worst: JournalEntry | null;
  reviewed: number;
  plan: { followed: number; broke: number; unknown: number; netFollowed: number; netBroke: number; adherence: number | null };
  risk: { daysWithLimit: number; held: number; breached: number; tradedWithoutLimit: number };
  mistakes: WeekMistake[];
  feelings: WeekFeeling[];
  insights: Insight[];
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function weekMistakes(trades: JournalEntry[]) {
  const map = new Map<MistakeKey, { key: MistakeKey; label: string; count: number; cost: number }>();
  for (const t of trades) {
    const m = mistakeOf(t);
    if (!m) continue;
    const row = map.get(m.key) ?? { key: m.key, label: m.label, count: 0, cost: 0 };
    row.count++; if (t.pnl < 0) row.cost += -t.pnl;
    map.set(m.key, row);
  }
  return [...map.values()];
}

export function buildWeek(entries: JournalEntry[], plans: TradePlan[], start: string): WeekReview {
  const end = weekEndOf(start);
  const today = todayKey();
  const trades = entries.filter((e) => e.date >= start && e.date <= end).sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);

  const days: WeekDay[] = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(start, i);
    const list = dayTrades(date, entries);
    const limit = dayLimitFor(date, plans);
    return { date, label: weekdayShort(date), future: date > today, trades: list, net: r2(list.reduce((s, t) => s + t.pnl, 0)), limit, risk: riskFor(limit, list) };
  });

  const wins = trades.filter((t) => t.pnl > 0), losses = trades.filter((t) => t.pnl < 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0), grossLoss = -losses.reduce((s, t) => s + t.pnl, 0);
  const rs = trades.filter((t) => t.rr != null).map((t) => t.rr as number);
  const net = r2(trades.reduce((s, t) => s + t.pnl, 0));

  const followed = trades.filter((t) => t.review?.outcome?.followedPlan === true);
  const broke = trades.filter((t) => t.review?.outcome?.followedPlan === false);
  const decided = followed.length + broke.length;

  const tradedDays = days.filter((d) => d.trades.length > 0);
  const withLimit = tradedDays.filter((d) => d.risk);

  // Mistakes, with how many of the last five weeks (this one included) each one showed up in.
  const prior = Array.from({ length: 4 }, (_, i) => weekMistakes(entries.filter((e) => e.date >= shiftWeek(start, -(i + 1)) && e.date <= weekEndOf(shiftWeek(start, -(i + 1))))));
  const mistakes: WeekMistake[] = weekMistakes(trades).map((m) => {
    const weeksSeen = 1 + prior.filter((w) => w.some((x) => x.key === m.key)).length;
    return { ...m, cost: r2(m.cost), weeksSeen, recurring: weeksSeen >= 2 };
  }).sort((a, b) => b.count - a.count || b.cost - a.cost);

  const fmap = new Map<FeelingKey, WeekFeeling>();
  for (const t of trades) {
    const k = feelingFromReview(t.review?.psychology);
    const f = k ? feelingOf(k) : null;
    if (!f) continue;
    const row = fmap.get(f.key) ?? { key: f.key, label: f.label, tone: f.tone, count: 0, net: 0 };
    row.count++; row.net = r2(row.net + t.pnl);
    fmap.set(f.key, row);
  }

  const w: WeekReview = {
    start, end, isCurrent: today >= start && today <= end,
    days, trades, count: trades.length, net, wins: wins.length, losses: losses.length,
    winRate: trades.length ? wins.length / trades.length : null,
    avgR: rs.length ? r2(rs.reduce((s, r) => s + r, 0) / rs.length) : null,
    profitFactor: grossLoss > 0 ? r2(grossWin / grossLoss) : null,
    avgWin: wins.length ? r2(grossWin / wins.length) : null,
    avgLoss: losses.length ? r2(-grossLoss / losses.length) : null,
    best: trades.length ? trades.reduce((a, b) => (b.pnl > a.pnl ? b : a)) : null,
    worst: trades.length ? trades.reduce((a, b) => (b.pnl < a.pnl ? b : a)) : null,
    reviewed: trades.filter((t) => (t.reviewStatus ?? (t.review ? "reviewed" : "not_reviewed")) === "reviewed").length,
    plan: {
      followed: followed.length, broke: broke.length, unknown: trades.length - decided,
      netFollowed: r2(followed.reduce((s, t) => s + t.pnl, 0)), netBroke: r2(broke.reduce((s, t) => s + t.pnl, 0)),
      adherence: decided ? followed.length / decided : null,
    },
    risk: {
      daysWithLimit: withLimit.length,
      held: withLimit.filter((d) => d.risk!.status !== "over").length,
      breached: withLimit.filter((d) => d.risk!.status === "over").length,
      tradedWithoutLimit: tradedDays.length - withLimit.length,
    },
    mistakes,
    feelings: [...fmap.values()].sort((a, b) => b.count - a.count),
    insights: [],
  };
  w.insights = buildInsights(w);
  return w;
}

/** Plain-language findings, each one computed from this week's numbers (never invented). */
function buildInsights(w: WeekReview): Insight[] {
  const out: Insight[] = [];
  const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
  if (w.count === 0) return [{ tone: "info", text: w.isCurrent ? "No trades logged yet this week." : "No trades were logged this week." }];

  const { followed, broke } = w.plan;
  if (followed + broke > 0) {
    if (broke === 0) out.push({ tone: "good", text: `You followed your plan on all ${followed} reviewed ${followed === 1 ? "trade" : "trades"}.` });
    else if (followed === 0) out.push({ tone: "warn", text: `You broke your plan on ${broke === 1 ? "the only reviewed trade" : `all ${broke} reviewed trades`}, which netted ${money(w.plan.netBroke)}.` });
    else out.push({ tone: w.plan.netBroke < w.plan.netFollowed ? "warn" : "info", text: `Plan followed on ${followed} of ${followed + broke} reviewed trades (${money(w.plan.netFollowed)}). The ${broke} that broke it netted ${money(w.plan.netBroke)}.` });
  }

  const worstDay = w.days.filter((d) => d.risk).sort((a, b) => b.risk!.ratio - a.risk!.ratio)[0];
  if (w.risk.daysWithLimit > 0) {
    if (w.risk.breached === 0) out.push({ tone: "good", text: `You stayed inside your daily loss limit on ${w.risk.held} of ${w.risk.daysWithLimit} ${w.risk.daysWithLimit === 1 ? "day" : "days"}.` });
    else if (worstDay) out.push({ tone: "warn", text: `You went past your daily limit on ${w.risk.breached} ${w.risk.breached === 1 ? "day" : "days"}. ${worstDay.label} reached ${money(-worstDay.risk!.used)} against a ${money(worstDay.risk!.limit)} limit.` });
  }
  if (w.risk.tradedWithoutLimit > 0) out.push({ tone: "info", text: `No daily loss limit was set on ${w.risk.tradedWithoutLimit} trading ${w.risk.tradedWithoutLimit === 1 ? "day" : "days"}. Set one in the plan so the day can be measured.` });

  const top = w.mistakes[0];
  if (top) {
    const rec = top.weeksSeen >= 2 ? ` It has shown up in ${top.weeksSeen} of the last 5 weeks.` : "";
    out.push({ tone: top.recurring ? "warn" : "info", text: `${top.label} was your most common mistake: ${top.count} ${top.count === 1 ? "time" : "times"}${top.cost > 0 ? `, costing ${money(-top.cost)}` : ""}.${rec}` });
  } else if (w.reviewed > 0) {
    out.push({ tone: "good", text: "No mistakes were recorded in this week's reviews." });
  }

  const risky = w.feelings.filter((f) => f.tone === "risk" && f.count >= 2).sort((a, b) => a.net - b.net)[0];
  if (risky && risky.net < 0) out.push({ tone: "warn", text: `Trades that felt ${risky.label.toLowerCase()} netted ${money(risky.net)} across ${risky.count} trades.` });

  const left = w.count - w.reviewed;
  if (left > 0) out.push({ tone: "info", text: `${left} ${left === 1 ? "trade has" : "trades have"} no completed review yet, so the numbers above are partial.` });
  return out.slice(0, 5);
}

export type TrendPoint = { start: string; net: number; trades: number; adherence: number | null; mistakes: number };
/** The last `n` weeks ending at `endStart`, oldest first — for the trend strip. */
export function weekTrend(entries: JournalEntry[], endStart: string, n = 8): TrendPoint[] {
  return Array.from({ length: n }, (_, i) => {
    const start = shiftWeek(endStart, i - (n - 1));
    const list = entries.filter((e) => e.date >= start && e.date <= weekEndOf(start));
    const followed = list.filter((t) => t.review?.outcome?.followedPlan === true).length;
    const broke = list.filter((t) => t.review?.outcome?.followedPlan === false).length;
    return { start, net: r2(list.reduce((s, t) => s + t.pnl, 0)), trades: list.length, adherence: followed + broke ? followed / (followed + broke) : null, mistakes: list.filter((t) => mistakeOf(t)).length };
  });
}

/** Mistakes that appeared in at least `min` of the last `n` weeks — the recurring list. */
export function recurringMistakes(entries: JournalEntry[], endStart: string, n = 5, min = 2) {
  const weeks = Array.from({ length: n }, (_, i) => weekMistakes(entries.filter((e) => e.date >= shiftWeek(endStart, -i) && e.date <= weekEndOf(shiftWeek(endStart, -i)))));
  const keys = new Map<MistakeKey, { key: MistakeKey; label: string; weeks: number; total: number; cost: number }>();
  weeks.forEach((w) => w.forEach((m) => {
    const row = keys.get(m.key) ?? { key: m.key, label: m.label, weeks: 0, total: 0, cost: 0 };
    row.weeks++; row.total += m.count; row.cost += m.cost;
    keys.set(m.key, row);
  }));
  return [...keys.values()].filter((r) => r.weeks >= min).sort((a, b) => b.weeks - a.weeks || b.total - a.total);
}
