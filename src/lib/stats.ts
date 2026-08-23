import {
  type DayResult,
  type EquityPoint,
  type JournalEntry,
  type JournalSettings,
  type JournalStats,
} from "./types";
import { dateKey } from "./format";

/* ------------------------------------------------------------------ */
/*  Pure analytics engine — no React, fully testable                   */
/* ------------------------------------------------------------------ */

export function groupByDay(entries: JournalEntry[]): Map<string, DayResult> {
  const map = new Map<string, DayResult>();
  for (const e of entries) {
    const day = map.get(e.date);
    if (day) {
      day.pnl += e.pnl;
      day.trades += 1;
    } else {
      map.set(e.date, { date: e.date, pnl: e.pnl, trades: 1 });
    }
  }
  return map;
}

export function computeStats(entries: JournalEntry[], settings: JournalSettings): JournalStats {
  const byDay = groupByDay(entries);
  const daily = [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date));

  let totalPnl = 0;
  let winningDays = 0;
  let losingDays = 0;
  let breakEvenDays = 0;
  let bestDay: DayResult | null = null;
  let worstDay: DayResult | null = null;

  for (const d of daily) {
    totalPnl += d.pnl;
    if (d.pnl > 0) winningDays += 1;
    else if (d.pnl < 0) losingDays += 1;
    else breakEvenDays += 1;

    if (!bestDay || d.pnl > bestDay.pnl) bestDay = d;
    if (!worstDay || d.pnl < worstDay.pnl) worstDay = d;
  }

  // R:R average over entries that track it
  const rrEntries = entries.filter((e) => e.rr != null && Number.isFinite(e.rr));
  const avgRR =
    rrEntries.length > 0 ? rrEntries.reduce((s, e) => s + (e.rr as number), 0) / rrEntries.length : null;

  // Equity curve from starting equity
  const equityCurve: EquityPoint[] = [];
  let running = settings.startingEquity;
  for (const d of daily) {
    running += d.pnl;
    equityCurve.push({ date: d.date, pnl: d.pnl, equity: running });
  }

  let peakEquity = settings.startingEquity;
  for (const p of equityCurve) peakEquity = Math.max(peakEquity, p.equity);

  const currentEquity = settings.startingEquity + totalPnl;
  const drawdown = Math.max(0, peakEquity - currentEquity);
  const drawdownPct = peakEquity > 0 ? drawdown / peakEquity : 0;

  const tradingDays = daily.length;
  const decidedDays = winningDays + losingDays;
  const targetRange = settings.targetEquity - settings.startingEquity;

  return {
    tradeCount: entries.length,
    tradingDays,
    totalPnl,

    winningDays,
    losingDays,
    breakEvenDays,
    winRate: decidedDays > 0 ? winningDays / decidedDays : 0,

    avgDayPnl: tradingDays > 0 ? totalPnl / tradingDays : 0,
    bestDay,
    worstDay,
    avgRR,
    rrCoverage: entries.length > 0 ? rrEntries.length / entries.length : 0,

    daily,
    equityCurve,

    currentEquity,
    peakEquity,
    drawdown,
    drawdownPct,
    drawdownBudgetUsed:
      settings.maxDrawdown > 0
        ? Math.min(1, Math.max(0, (peakEquity - currentEquity) / settings.maxDrawdown))
        : 0,

    remainingToTarget: settings.targetEquity - currentEquity,
    targetProgress: targetRange !== 0 ? clamp01((currentEquity - settings.startingEquity) / targetRange) : 0,
  };
}

export function clamp01(v: number): number {
  if (Number.isNaN(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/** Consecutive most-recent days with a positive result (or negative when flipped). */
export function currentStreak(daily: DayResult[]): number {
  const ordered = [...daily].sort((a, b) => b.date.localeCompare(a.date)); // newest first
  if (ordered.length === 0) return 0;
  const sign = Math.sign(ordered[0].pnl);
  if (sign === 0) return 0;
  let streak = 0;
  for (const d of ordered) {
    if (Math.sign(d.pnl) === sign) streak += 1;
    else break;
  }
  return sign > 0 ? streak : -streak; // negative = losing streak
}

/* ------------------------------ calendar ------------------------------ */

export interface MonthCell {
  key: string | null; // ISO date or null for padding cells
  day: number;
}

export function monthGrid(year: number, month0: number): MonthCell[] {
  const first = new Date(year, month0, 1);
  const startPad = first.getDay(); // 0 = Sunday
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();

  const cells: MonthCell[] = [];
  for (let i = 0; i < startPad; i++) cells.push({ key: null, day: 0 });

  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ key: dateKey(new Date(year, month0, d)), day: d });
  }

  while (cells.length % 7 !== 0) cells.push({ key: null, day: 0 });
  return cells;
}
