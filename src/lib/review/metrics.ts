import type { Challenge, JournalEntry, JournalSettings, NoTradeLog, ProcessGrade, ReviewDayMark } from "@/lib/types";
import { computeDrawdown } from "@/lib/drawdown";
import { addDays } from "@/lib/format";
import { holidayName, isTradingDay, isWeekend, mondayOf, mondaysInMonth, tradingWeekdaysInMonth, weekDays } from "./period";
import { classifyMistakes, criteriaOfEntry, mistakesOfEntry, PSYCH_PATTERNS, type MistakeGroup } from "./mistakes";

/* ────────────────────────────────────────────────────────────────────────────
 * Review metrics — every number on the Weekly and Monthly review is computed
 * here from the trades, no-trade logs and challenge settings. Nothing is stored.
 * A metric with no data is `null` (rendered "—"), never 0 or a made-up value.
 * ──────────────────────────────────────────────────────────────────────────── */

const GRADE_VALUE: Record<ProcessGrade, number> = { A: 4, B: 3, C: 2, D: 1 };
const VALUE_GRADE: ProcessGrade[] = ["D", "D", "C", "B", "A"];

/** Process grade the trader's own review implies for one trade (null when they gave no verdict). */
export function gradeOfEntry(e: JournalEntry): ProcessGrade | null {
  const v = e.review?.outcome?.processVerdict;
  if (v === "a-plus") return "A";
  if (v === "process-success") return "B";
  if (v === "process-failure") return "D";
  if (e.review?.outcome?.followedPlan === false) return "D";
  return null;
}
export function averageGrade(grades: (ProcessGrade | null | undefined)[]): ProcessGrade | null {
  const g = grades.filter((x): x is ProcessGrade => !!x);
  if (g.length === 0) return null;
  return VALUE_GRADE[Math.round(g.reduce((s, x) => s + GRADE_VALUE[x], 0) / g.length)] ?? "C";
}

export type DayState = "traded" | "no-setup" | "pass" | "unlogged" | "holiday" | "weekend" | "upcoming";

export interface DayRow {
  date: string;
  state: DayState;
  holiday: string | null;
  trades: JournalEntry[];
  pnl: number;
  rr: number | null;
  /** Criteria confirmed / criteria checked, summed over the day's trades (null = no checklist recorded). */
  criteria: { met: number; total: number } | null;
  grade: ProcessGrade | null;
  gradeIsManual: boolean;
  noSetupReason?: string;
}

const sum = (n: number[]) => n.reduce((s, x) => s + x, 0);
const mean = (n: number[]) => (n.length ? sum(n) / n.length : null);

export interface Totals {
  trades: number; winners: number; losers: number; breakevens: number; winRate: number | null;
  net: number; grossWin: number; grossLoss: number; profitFactor: number | null;
  avgWin: number | null; avgLoss: number | null; avgRR: number | null; realizedRR: number | null;
  largestWin: number | null; largestLoss: number | null;
}
export function totalsOf(list: JournalEntry[]): Totals {
  const wins = list.filter((e) => e.pnl > 0), losses = list.filter((e) => e.pnl < 0);
  const grossWin = sum(wins.map((e) => e.pnl)), grossLoss = -sum(losses.map((e) => e.pnl));
  const avgWin = mean(wins.map((e) => e.pnl)), avgLoss = losses.length ? grossLoss / losses.length : null;
  return {
    trades: list.length, winners: wins.length, losers: losses.length, breakevens: list.length - wins.length - losses.length,
    winRate: list.length ? wins.length / list.length : null,
    net: sum(list.map((e) => e.pnl)), grossWin, grossLoss,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    avgWin, avgLoss,
    avgRR: mean(list.filter((e) => e.rr != null).map((e) => e.rr as number)),
    realizedRR: avgWin != null && avgLoss ? avgWin / avgLoss : null,
    largestWin: wins.length ? Math.max(...wins.map((e) => e.pnl)) : null,
    largestLoss: losses.length ? Math.min(...losses.map((e) => e.pnl)) : null,
  };
}

const byDate = (list: JournalEntry[]) => { const m = new Map<string, JournalEntry[]>(); for (const e of list) { const a = m.get(e.date); if (a) a.push(e); else m.set(e.date, [e]); } return m; };
const chrono = (a: JournalEntry, b: JournalEntry) => a.date.localeCompare(b.date) || (a.entryTime ?? "").localeCompare(b.entryTime ?? "") || a.createdAt - b.createdAt;

export function buildDayRow(date: string, trades: JournalEntry[], logs: Map<string, NoTradeLog>, marks: Record<string, ReviewDayMark> | undefined, today: string): DayRow {
  const holiday = holidayName(date);
  const mark = marks?.[date];
  const t = [...trades].sort(chrono);
  const crit = t.map(criteriaOfEntry).filter((c) => c.length > 0);
  const auto = averageGrade(t.map(gradeOfEntry));
  let state: DayState;
  if (t.length > 0) state = "traded";
  else if (isWeekend(date)) state = "weekend";
  else if (holiday) state = "holiday";
  else if (date > today) state = "upcoming";
  else if (mark?.skippedValid) state = "pass";
  else if (logs.has(date)) state = "no-setup";
  else state = "unlogged";
  return {
    date, state, holiday, trades: t, pnl: sum(t.map((e) => e.pnl)),
    rr: mean(t.filter((e) => e.rr != null).map((e) => e.rr as number)),
    criteria: crit.length ? { met: sum(crit.map((c) => c.filter((x) => x.present).length)), total: sum(crit.map((c) => c.length)) } : null,
    grade: mark?.grade ?? auto, gradeIsManual: !!mark?.grade, noSetupReason: logs.get(date)?.reason,
  };
}

/* ───────── criteria predictiveness ───────── */

export interface CriterionStat { key: string; label: string; present: number; wins: number; losses: number; winRate: number | null; net: number; entryIds: string[] }
export function criteriaStats(list: JournalEntry[]): CriterionStat[] {
  const m = new Map<string, CriterionStat>();
  for (const e of list) for (const c of criteriaOfEntry(e)) {
    const s = m.get(c.key) ?? { key: c.key, label: c.label, present: 0, wins: 0, losses: 0, winRate: null, net: 0, entryIds: [] };
    if (c.present) { s.present++; s.entryIds.push(e.id); s.net += e.pnl; if (e.pnl > 0) s.wins++; else if (e.pnl < 0) s.losses++; }
    m.set(c.key, s);
  }
  return [...m.values()].map((s) => ({ ...s, winRate: s.present ? s.wins / s.present : null })).sort((a, b) => b.present - a.present || a.label.localeCompare(b.label));
}

export interface ComboStat { keys: string[]; labels: string[]; trades: number; wins: number; winRate: number; net: number }
/** Best 2- and 3-criterion combinations by win rate (needs ≥ minTrades trades that had ALL of them confirmed). */
export function bestCombos(list: JournalEntry[], minTrades = 3, top = 3): ComboStat[] {
  const stats = criteriaStats(list).slice(0, 9);
  const labels = new Map(stats.map((s) => [s.key, s.label]));
  const sets = list.map((e) => ({ e, present: new Set(criteriaOfEntry(e).filter((c) => c.present).map((c) => c.key)) }));
  const keys = stats.map((s) => s.key);
  const out: ComboStat[] = [];
  const eval_ = (combo: string[]) => {
    const hit = sets.filter((s) => combo.every((k) => s.present.has(k)));
    if (hit.length < minTrades) return;
    const wins = hit.filter((s) => s.e.pnl > 0).length;
    out.push({ keys: combo, labels: combo.map((k) => labels.get(k) ?? k), trades: hit.length, wins, winRate: wins / hit.length, net: sum(hit.map((s) => s.e.pnl)) });
  };
  for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) { eval_([keys[i], keys[j]]); for (let k = j + 1; k < keys.length; k++) eval_([keys[i], keys[j], keys[k]]); }
  return out.sort((a, b) => b.winRate - a.winRate || b.trades - a.trades || b.keys.length - a.keys.length).slice(0, top);
}

export interface ThresholdRow { met: number; trades: number; wins: number; winRate: number; net: number }
/** Outcome by how many criteria were confirmed — answers "should the minimum threshold change?" */
export function outcomeByCriteriaMet(list: JournalEntry[]): ThresholdRow[] {
  const m = new Map<number, JournalEntry[]>();
  for (const e of list) { const c = criteriaOfEntry(e); if (!c.length) continue; const met = c.filter((x) => x.present).length; const a = m.get(met); if (a) a.push(e); else m.set(met, [e]); }
  return [...m].sort((a, b) => a[0] - b[0]).map(([met, es]) => ({ met, trades: es.length, wins: es.filter((e) => e.pnl > 0).length, winRate: es.filter((e) => e.pnl > 0).length / es.length, net: sum(es.map((e) => e.pnl)) }));
}

/* ───────── psychology table ───────── */

export interface PatternRow { key: string; label: string; manual: boolean; perDay: Record<string, number>; total: number; lost: number; entryIds: string[] }
export function patternTable(list: JournalEntry[], dates: string[], marks: Record<string, ReviewDayMark> | undefined, maxTrades: number | null): { rows: PatternRow[]; correct: PatternRow } {
  const rows = new Map<string, PatternRow>(PSYCH_PATTERNS.map((p) => [p.key, { key: p.key, label: p.label, manual: !!p.manual, perDay: {}, total: 0, lost: 0, entryIds: [] }]));
  const correct: PatternRow = { key: "correct", label: "Correct execution", manual: false, perDay: {}, total: 0, lost: 0, entryIds: [] };
  const bump = (r: PatternRow, e: JournalEntry | null, date: string) => { r.perDay[date] = (r.perDay[date] ?? 0) + 1; r.total++; if (e) { r.entryIds.push(e.id); if (e.pnl < 0) r.lost += -e.pnl; } };
  const perDay = byDate(list);
  for (const e of list) {
    const ms = mistakesOfEntry(e);
    for (const m of ms) { const r = rows.get(m.key) ?? (m.key === "oversized" || m.key === "broke-plan" || m.key.startsWith("other") ? (rows.set(m.key, { key: m.key, label: m.label, manual: false, perDay: {}, total: 0, lost: 0, entryIds: [] }), rows.get(m.key)!) : null); if (r) bump(r, e, e.date); }
    const verdict = e.review?.outcome?.processVerdict;
    if (ms.length === 0 && (e.review?.outcome?.followedPlan === true || verdict === "a-plus" || verdict === "process-success")) bump(correct, e, e.date);
  }
  if (maxTrades != null && maxTrades > 0) for (const [date, es] of perDay) {
    const over = [...es].sort(chrono).slice(maxTrades);
    const r = rows.get("overtrade")!;
    for (const e of over) if (!r.entryIds.includes(e.id)) bump(r, e, date);
  }
  for (const d of dates) {
    const mk = marks?.[d];
    if (mk?.skippedValid) bump(rows.get("skipped")!, null, d);
    if (mk?.biasLock) bump(rows.get("bias-lock")!, null, d);
  }
  return { rows: [...rows.values()], correct };
}

/* ───────── equity curve, drawdown clusters, streaks ───────── */

export interface CurvePointR { date: string; pnl: number; cum: number; session: number }
export interface DrawdownMark { date: string; depth: number; session: number }
export interface Streak { from: number; to: number; length: number; pnl: number }
export function sessionCurve(days: DayRow[]): CurvePointR[] {
  let cum = 0, n = 0;
  return days.filter((d) => d.state === "traded").map((d) => ({ date: d.date, pnl: d.pnl, cum: (cum += d.pnl), session: ++n }));
}
/** The deepest distinct peak-to-trough drops (each a different trough). */
export function drawdownMarks(curve: CurvePointR[], top = 3): DrawdownMark[] {
  const out: DrawdownMark[] = [];
  let peak = 0, peakAt = -1, troughAt = -1, depth = 0;
  const flush = () => { if (depth > 0 && troughAt >= 0) out.push({ date: curve[troughAt].date, depth, session: curve[troughAt].session }); depth = 0; troughAt = -1; };
  curve.forEach((p, i) => {
    if (p.cum >= peak) { flush(); peak = p.cum; peakAt = i; }
    else if (peak - p.cum > depth) { depth = peak - p.cum; troughAt = i; }
  });
  void peakAt; flush();
  return out.sort((a, b) => b.depth - a.depth).slice(0, top);
}
/** The longest runs of consecutive winning sessions (≥ 2). */
export function bestStreaks(curve: CurvePointR[], top = 3): Streak[] {
  const out: Streak[] = [];
  let start = -1;
  const close = (end: number) => { if (start >= 0 && end - start + 1 >= 2) out.push({ from: start, to: end, length: end - start + 1, pnl: sum(curve.slice(start, end + 1).map((p) => p.pnl)) }); start = -1; };
  curve.forEach((p, i) => { if (p.pnl > 0) { if (start < 0) start = i; } else close(i - 1); });
  close(curve.length - 1);
  return out.sort((a, b) => b.length - a.length || b.pnl - a.pnl).slice(0, top);
}
export function curveShape(curve: CurvePointR[]): "empty" | "ascending" | "descending" | "choppy" | "recovering" {
  if (curve.length < 3) return "empty";
  const net = curve[curve.length - 1].cum;
  const flips = curve.filter((p, i) => i > 0 && Math.sign(p.pnl) !== Math.sign(curve[i - 1].pnl) && p.pnl !== 0 && curve[i - 1].pnl !== 0).length;
  const dd = Math.max(0, ...drawdownMarks(curve, 1).map((m) => m.depth));
  const range = Math.max(...curve.map((p) => Math.abs(p.cum)), 1);
  if (flips / (curve.length - 1) > 0.6 && dd > range * 0.5) return "choppy";
  if (net > 0 && dd <= Math.max(1, net) * 0.35) return "ascending";
  if (net > 0) return "recovering";
  if (net < 0 && dd > Math.abs(net) * 0.5) return "descending";
  return "choppy";
}

/* ───────── challenge / prop checkpoint ───────── */

export interface PropCheckpoint {
  target: number | null; achieved: number; targetMet: boolean | null;
  maxDrawdown: number | null; drawdownUsed: number | null; drawdownBreached: boolean;
  dailyLossLimit: number | null; dailyLossBreaches: number | null;
  status: "pass" | "fail" | "in-progress" | "none";
}
export function propCheckpoint(args: { challenge: Challenge | null; settings: JournalSettings; entries: JournalEntry[]; monthEnd: string; monthDays: DayRow[]; today: string }): PropCheckpoint {
  const { challenge, settings, entries, monthEnd, monthDays, today } = args;
  const start = challenge?.startingBalance ?? settings.startingEquity;
  const targetBal = challenge?.targetBalance ?? settings.targetEquity;
  const target = targetBal != null && start != null && targetBal > start ? targetBal - start : null;
  const upto = entries.filter((e) => e.date <= monthEnd);
  const achieved = sum(upto.map((e) => e.pnl));
  const maxDD = challenge?.maxDrawdown ?? settings.maxDrawdown ?? null;
  const dd = maxDD && maxDD > 0 ? computeDrawdown({ startingBalance: start, maxDrawdown: maxDD, mode: challenge?.drawdownMode ?? settings.drawdownMode ?? "static", basis: challenge?.trailingBasis ?? settings.trailingBasis ?? null, floor: challenge?.drawdownFloor ?? settings.drawdownFloor ?? null, trades: upto, asOf: today }) : null;
  const rule = settings.rules?.rules.find((r) => r.id === "risk.max-daily-loss" && r.enabled);
  const dailyLimit = challenge?.dailyLossLimit ?? (rule && typeof rule.params.limit === "number" ? rule.params.limit : null);
  const breaches = dailyLimit && dailyLimit > 0 ? monthDays.filter((d) => d.pnl <= -dailyLimit).length : null;
  const targetMet = target != null ? achieved >= target : null;
  const breached = !!dd?.breached;
  return {
    target, achieved, targetMet, maxDrawdown: maxDD && maxDD > 0 ? maxDD : null, drawdownUsed: dd ? dd.maxObserved : null, drawdownBreached: breached,
    dailyLossLimit: dailyLimit && dailyLimit > 0 ? dailyLimit : null, dailyLossBreaches: breaches,
    status: target == null && !dd ? "none" : breached ? "fail" : targetMet ? "pass" : "in-progress",
  };
}

/* ───────── insights ───────── */

export interface Insight { id: string; tone: "good" | "warn" | "info"; text: string; /** Journal filter that opens the evidence. */ evidence?: { kind: "mistake"; key: string } | { kind: "ids"; ids: string[] } }

/* ───────── Weekly ───────── */

export interface WeekReview {
  monday: string; days: DayRow[]; tradingSlots: number; entries: JournalEntry[];
  totals: Totals; sessions: number; noSetupDays: number; unloggedDays: number; weekendEntries: number;
  maxDayLoss: number | null; avgGrade: ProcessGrade | null; balance: number | null; startBalance: number;
  criteria: CriterionStat[]; strongest: CriterionStat | null; weakest: CriterionStat | null;
  patterns: ReturnType<typeof patternTable>; mistakes: MistakeGroup[]; insights: Insight[]; isCurrent: boolean; isFuture: boolean;
}

export interface ReviewContext { entries: JournalEntry[]; dayLogs: NoTradeLog[]; settings: JournalSettings; challenge: Challenge | null; today: string }
const maxTradesRule = (s: JournalSettings): number | null => { const r = s.rules?.rules.find((x) => x.id === "risk.max-trades-per-day" && x.enabled); return r && typeof r.params.maxTrades === "number" ? r.params.maxTrades : null; };
const money0 = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`;
const pct0 = (n: number) => `${Math.round(n * 100)}%`;
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function dayOfWeekInsight(days: DayRow[]): Insight | null {
  const traded = days.filter((d) => d.state === "traded");
  if (traded.length < 6) return null;
  const by = new Map<number, number[]>();
  for (const d of traded) { const g = new Date(d.date + "T12:00:00").getDay(); (by.get(g) ?? by.set(g, []).get(g)!).push(d.pnl); }
  const rows = [...by].filter(([, v]) => v.length >= 2).map(([g, v]) => ({ g, avg: sum(v) / v.length, n: v.length }));
  if (rows.length < 2) return null;
  rows.sort((a, b) => b.avg - a.avg);
  const best = rows[0], worst = rows[rows.length - 1];
  return { id: "dow", tone: "info", text: `${DOW[best.g]}s are your strongest day (${money0(best.avg)} average over ${best.n} sessions); ${DOW[worst.g]}s your weakest (${money0(worst.avg)} over ${worst.n}).` };
}

function insightsFor(list: JournalEntry[], mistakes: MistakeGroup[], criteria: CriterionStat[], days: DayRow[], scope: string): Insight[] {
  const out: Insight[] = [];
  const t = totalsOf(list);
  if (t.trades === 0) return out;
  const costly = [...mistakes].filter((m) => m.lost > 0).sort((a, b) => b.lost - a.lost)[0];
  if (costly) out.push({ id: "costly", tone: "warn", text: `${costly.label} cost ${money0(costly.lost)} across ${costly.count} ${costly.count === 1 ? "trade" : "trades"} ${scope} — your most expensive recorded mistake.`, evidence: { kind: "mistake", key: costly.key } });
  const repeat = mistakes.find((m) => m.count >= 2);
  if (repeat && repeat.key !== costly?.key) out.push({ id: "repeat", tone: "warn", text: `${repeat.label} repeated ${repeat.count} times ${scope}.`, evidence: { kind: "mistake", key: repeat.key } });
  const withC = criteria.filter((c) => c.present >= 3 && c.winRate != null);
  if (withC.length >= 2) {
    const s = [...withC].sort((a, b) => b.winRate! - a.winRate! || b.present - a.present);
    const hi = s[0], lo = s[s.length - 1];
    if (hi.winRate! - lo.winRate! >= 0.15) {
      out.push({ id: "criterion-hi", tone: "good", text: `“${hi.label}” was the most predictive criterion: ${pct0(hi.winRate!)} win rate when confirmed (${hi.wins}/${hi.present}).`, evidence: { kind: "ids", ids: hi.entryIds } });
      out.push({ id: "criterion-lo", tone: "info", text: `“${lo.label}” was the least predictive: ${pct0(lo.winRate!)} when confirmed (${lo.wins}/${lo.present}).`, evidence: { kind: "ids", ids: lo.entryIds } });
    }
  }
  const clean = list.filter((e) => mistakesOfEntry(e).length === 0), flagged = list.filter((e) => mistakesOfEntry(e).length > 0);
  if (clean.length >= 3 && flagged.length >= 2) out.push({ id: "clean-vs-flagged", tone: "info", text: `Trades without a recorded mistake netted ${money0(totalsOf(clean).net)} (${clean.length}); trades with one netted ${money0(totalsOf(flagged).net)} (${flagged.length}).` });
  const dow = dayOfWeekInsight(days); if (dow) out.push(dow);
  const rrN = list.filter((e) => e.rr != null).length;
  if (rrN > 0 && rrN < list.length) out.push({ id: "rr-coverage", tone: "info", text: `R:R is recorded on ${rrN} of ${list.length} trades — averages use only those.` });
  return out;
}

export function buildWeek(ctx: ReviewContext, monday: string, marks?: Record<string, ReviewDayMark>): WeekReview {
  const { entries, dayLogs, settings, today } = ctx;
  const logs = new Map(dayLogs.map((d) => [d.date, d]));
  const sunday = addDays(monday, 6);
  const list = entries.filter((e) => e.date >= monday && e.date <= sunday).sort(chrono);
  const dates = weekDays(monday);
  const grouped = byDate(list);
  const days = dates.map((d) => buildDayRow(d, grouped.get(d) ?? [], logs, marks, today));
  const trading = days.filter((d) => !isWeekend(d.date) && !d.holiday);
  const traded = days.filter((d) => d.state === "traded" && !isWeekend(d.date));
  const criteria = criteriaStats(list);
  const rated = criteria.filter((c) => c.present >= 2 && c.winRate != null);
  const mistakes = classifyMistakes(list);
  const startBalance = ctx.challenge?.startingBalance ?? settings.startingEquity;
  const upto = entries.filter((e) => e.date <= sunday);
  return {
    monday, days, tradingSlots: trading.length, entries: list, totals: totalsOf(list), sessions: traded.length,
    noSetupDays: days.filter((d) => d.state === "no-setup" || d.state === "pass").length, unloggedDays: days.filter((d) => d.state === "unlogged").length,
    weekendEntries: list.filter((e) => isWeekend(e.date)).length,
    maxDayLoss: traded.length ? Math.min(0, ...traded.map((d) => d.pnl)) : null,
    avgGrade: averageGrade(days.map((d) => d.grade)),
    balance: monday > today ? null : startBalance + sum(upto.map((e) => e.pnl)), startBalance,
    criteria, strongest: rated.length ? [...rated].sort((a, b) => b.winRate! - a.winRate! || b.present - a.present)[0] : null,
    weakest: rated.length > 1 ? [...rated].sort((a, b) => a.winRate! - b.winRate! || b.present - a.present)[0] : null,
    patterns: patternTable(list, dates.filter(isTradingDay), marks, maxTradesRule(settings)), mistakes,
    insights: insightsFor(list, mistakes, criteria, days, "this week"),
    isCurrent: monday <= today && today <= sunday, isFuture: monday > today,
  };
}

/* ───────── Monthly ───────── */

export interface SessionLogRow { n: number; entry: JournalEntry; criteria: { met: number; total: number } | null; cum: number; grade: ProcessGrade | null; primary: string }
export interface WeekSlice { monday: string; label: number; totals: Totals; net: number; sessions: number }
export interface MonthReview {
  month: string; days: DayRow[]; tradingDays: number; sessions: number; entries: JournalEntry[]; totals: Totals; balance: number | null;
  noSetupDays: number; forcedTrades: number; weeks: WeekSlice[]; bestWeek: WeekSlice | null; worstWeek: WeekSlice | null; avgGrade: ProcessGrade | null;
  log: SessionLogRow[]; curve: CurvePointR[]; drawdowns: DrawdownMark[]; streaks: Streak[]; shape: ReturnType<typeof curveShape>;
  criteria: CriterionStat[]; heatmap: { key: string; label: string; perWeek: { present: number; winRate: number | null }[]; total: CriterionStat }[]; combos: ComboStat[]; thresholds: ThresholdRow[];
  patterns: ReturnType<typeof patternTable>; mistakes: MistakeGroup[]; prop: PropCheckpoint; insights: Insight[];
  decisions: { id: string; label: string; yes: boolean | null; detail: string; ifYes: string; ifNo: string }[]; isFuture: boolean;
}

export function buildMonth(ctx: ReviewContext, month: string, weekMarks?: (monday: string) => Record<string, ReviewDayMark> | undefined): MonthReview {
  const { entries, dayLogs, settings, today } = ctx;
  const logs = new Map(dayLogs.map((d) => [d.date, d]));
  const list = entries.filter((e) => e.date.startsWith(month)).sort(chrono);
  const grouped = byDate(list);
  const allMarks: Record<string, ReviewDayMark> = {};
  const mondays = mondaysInMonth(month);
  for (const m of mondays) Object.assign(allMarks, weekMarks?.(m) ?? {});
  const dateSet = new Set<string>([...tradingWeekdaysInMonth(month), ...grouped.keys()]);
  const days = [...dateSet].sort().map((d) => buildDayRow(d, grouped.get(d) ?? [], logs, allMarks, today));
  const trading = days.filter((d) => isTradingDay(d.date));
  const totals = totalsOf(list);
  const curve = sessionCurve(days);
  const criteria = criteriaStats(list);
  const weeks: WeekSlice[] = mondays.map((m, i) => {
    const es = list.filter((e) => mondayOf(e.date) === m);
    return { monday: m, label: i + 1, totals: totalsOf(es), net: sum(es.map((e) => e.pnl)), sessions: new Set(es.map((e) => e.date)).size };
  });
  const played = weeks.filter((w) => w.totals.trades > 0);
  let cum = 0;
  const log: SessionLogRow[] = list.map((e, i) => {
    const c = criteriaOfEntry(e);
    const m = mistakesOfEntry(e)[0];
    return { n: i + 1, entry: e, criteria: c.length ? { met: c.filter((x) => x.present).length, total: c.length } : null, cum: (cum += e.pnl), grade: allMarks[e.date]?.grade ?? gradeOfEntry(e), primary: m ? m.label : (gradeOfEntry(e) === "A" || gradeOfEntry(e) === "B" ? "Correct execution" : "—") };
  });
  const mistakes = classifyMistakes(list);
  const patterns = patternTable(list, trading.map((d) => d.date), allMarks, maxTradesRule(settings));
  const monthEnd = `${month}-31`;
  const prop = propCheckpoint({ challenge: ctx.challenge, settings, entries, monthEnd, monthDays: days, today });
  const avgGrade = averageGrade(days.map((d) => d.grade));
  const gv = avgGrade ? GRADE_VALUE[avgGrade] : null;
  const wr = totals.winRate, rr = totals.realizedRR ?? totals.avgRR;
  const decisions = [
    { id: "wr", label: "Is win rate ≥ 50%?", yes: wr == null ? null : wr >= 0.5, detail: wr == null ? "No trades yet" : `${pct0(wr)} this month`, ifYes: "Setup is statistically valid", ifNo: "Review whether your core criteria are present on the losses" },
    { id: "rr", label: "Is average R:R ≥ 1.5R?", yes: rr == null ? null : rr >= 1.5, detail: rr == null ? "No R:R recorded" : `${rr.toFixed(2)}R ${totals.realizedRR != null ? "realized" : "recorded"}`, ifYes: "Sizing is justified", ifNo: "Are you exiting targets early?" },
    { id: "grade", label: "Is average process grade B or better?", yes: gv == null ? null : gv >= 3, detail: avgGrade ? `Average ${avgGrade}` : "No process verdicts yet", ifYes: "Process is consistent", ifNo: "Which psychological pattern is the culprit?" },
    { id: "prop", label: "Did you pass the prop target?", yes: prop.target == null ? null : prop.targetMet, detail: prop.target == null ? "No target set" : `${money0(prop.achieved)} of ${money0(prop.target)}`, ifYes: "Scale up or withdraw profit", ifNo: "Was it variance or process failure?" },
  ];
  const max = maxTradesRule(settings);
  return {
    month, days, tradingDays: trading.length, sessions: days.filter((d) => d.state === "traded" && isTradingDay(d.date)).length, entries: list, totals,
    balance: `${month}-01` > today ? null : (ctx.challenge?.startingBalance ?? settings.startingEquity) + sum(entries.filter((e) => e.date <= monthEnd).map((e) => e.pnl)),
    noSetupDays: days.filter((d) => d.state === "no-setup" || d.state === "pass").length,
    forcedTrades: new Set([...(patterns.rows.find((r) => r.key === "overtrade")?.entryIds ?? []), ...list.filter((e) => mistakesOfEntry(e).some((m) => m.key === "overtrade")).map((e) => e.id)]).size,
    weeks, bestWeek: played.length ? [...played].sort((a, b) => b.net - a.net)[0] : null, worstWeek: played.length ? [...played].sort((a, b) => a.net - b.net)[0] : null, avgGrade,
    log, curve, drawdowns: drawdownMarks(curve), streaks: bestStreaks(curve), shape: curveShape(curve),
    criteria, heatmap: criteria.map((c) => ({ key: c.key, label: c.label, total: c, perWeek: weeks.map((w) => { const hit = criteriaStats(list.filter((e) => mondayOf(e.date) === w.monday)).find((x) => x.key === c.key); return { present: hit?.present ?? 0, winRate: hit?.winRate ?? null }; }) })),
    combos: bestCombos(list), thresholds: outcomeByCriteriaMet(list), patterns, mistakes, prop,
    insights: insightsFor(list, mistakes, criteria, days, "this month").concat(max ? [] : []), decisions, isFuture: `${month}-01` > today,
  };
}
