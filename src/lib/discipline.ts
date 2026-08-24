import type { JournalEntry, NoTradeLog } from "./types";
import { dateKey, todayKey } from "./format";

/* ------------------------------------------------------------------ */
/*  Daily discipline engine                                            */
/*                                                                      */
/*  A trading weekday must have an explicit outcome:                    */
/*    traded  → journaled (an entry IS the journal)                     */
/*    flat    → explicitly marked "no trade"                            */
/*  A weekday with neither is a missed discipline day. Weekends are     */
/*  neutral. XP is derived from the data — never stored separately —    */
/*  so it survives import/export and can be re-weighted later.          */
/* ------------------------------------------------------------------ */

/** Initial XP weights — easy to tune later in one place. */
export const XP = {
  tradeLogged: 20,
  reflectionComplete: 10,
  riskFollowed: 10,
  setupFollowed: 10,
  noTradeLogged: 15,
  weeklyReview: 75,
  recurringMistakeIdentified: 30,
  improvementRuleCreated: 40,
  missedWeekdayJournal: -20,
  riskRuleBroken: -15,
  revengeBehavior: -20,
} as const;

export type DayStatus =
  | "traded" // journaled trade(s)
  | "no-trade" // explicitly marked flat day
  | "missed" // eligible weekday with neither record
  | "weekend" // non-trading day
  | "open"; // today, still time to log

export interface DisciplineDay {
  date: string;
  status: DayStatus;
  xp: number;
  /** Entry ids behind a "traded" day (for drill-down). */
  entryIds: string[];
}

export interface DisciplineSummary {
  days: DisciplineDay[]; // ascending by date, tracked window only
  xpTotal: number;
  xpLast30: number;
  tradedDays: number;
  noTradeDays: number;
  missedDays: number;
  /** Consecutive most-recent eligible weekdays with an explicit outcome. */
  disciplineStreak: number;
  /** handled / (handled + missed) across the tracked window. */
  completionRate: number; // 0..1 (0 when nothing tracked yet)
  windowStart: string | null;
}

function isWeekend(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

function entryXp(e: JournalEntry): number {
  let xp = XP.tradeLogged;
  const r = e.reflection;
  if (r) {
    xp += XP.reflectionComplete;
    if (r.followedRisk === true) xp += XP.riskFollowed;
    if (r.followedRisk === false) xp += XP.riskRuleBroken;
    if (r.followedSetup === true) xp += XP.setupFollowed;
  }
  return xp;
}

export function disciplineSummary(
  entries: JournalEntry[],
  dayLogs: NoTradeLog[],
  today: string = todayKey(),
): DisciplineSummary {
  const byDate = new Map<string, JournalEntry[]>();
  for (const e of entries) {
    const list = byDate.get(e.date);
    if (list) list.push(e);
    else byDate.set(e.date, [e]);
  }
  const noTrade = new Set(dayLogs.map((d) => d.date));

  // Tracked window: first activity → today.
  const activityDates = [...byDate.keys(), ...noTrade];
  let windowStart: string | null = null;
  for (const d of activityDates) {
    if (!windowStart || d < windowStart) windowStart = d;
  }
  if (!windowStart) {
    return {
      days: [],
      xpTotal: 0,
      xpLast30: 0,
      tradedDays: 0,
      noTradeDays: 0,
      missedDays: 0,
      disciplineStreak: 0,
      completionRate: 0,
      windowStart: null,
    };
  }

  const days: DisciplineDay[] = [];
  const cursor = new Date(windowStart + "T00:00:00");
  const end = new Date(today + "T00:00:00");
  let xpTotal = 0;
  let tradedDays = 0;
  let noTradeDays = 0;
  let missedDays = 0;

  while (cursor <= end) {
    const key = dateKey(cursor);
    const weekend = isWeekend(cursor);
    const dayEntries = byDate.get(key);
    let status: DayStatus;
    let xp = 0;
    let entryIds: string[] = [];

    if (dayEntries) {
      status = "traded";
      entryIds = dayEntries.map((e) => e.id);
      xp = dayEntries.reduce((s, e) => s + entryXp(e), 0);
      tradedDays += 1;
    } else if (noTrade.has(key)) {
      status = "no-trade";
      xp = XP.noTradeLogged;
      noTradeDays += 1;
    } else if (weekend) {
      status = "weekend";
    } else if (key === today) {
      status = "open"; // still time today
    } else {
      status = "missed";
      xp = XP.missedWeekdayJournal;
      missedDays += 1;
    }

    xpTotal += xp;
    days.push({ date: key, status, xp, entryIds });
    cursor.setDate(cursor.getDate() + 1);
  }

  // XP over the trailing 30 days
  const cutoff = new Date(end);
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffKey = dateKey(cutoff);
  const xpLast30 = days.filter((d) => d.date >= cutoffKey).reduce((s, d) => s + d.xp, 0);

  // Discipline streak: walk newest → oldest, skipping weekends and "open".
  let disciplineStreak = 0;
  for (let i = days.length - 1; i >= 0; i--) {
    const s = days[i].status;
    if (s === "weekend" || s === "open") continue;
    if (s === "missed") break;
    disciplineStreak += 1;
  }

  const handled = tradedDays + noTradeDays;
  const completionRate = handled + missedDays > 0 ? handled / (handled + missedDays) : 0;

  return {
    days,
    xpTotal,
    xpLast30,
    tradedDays,
    noTradeDays,
    missedDays,
    disciplineStreak,
    completionRate,
    windowStart,
  };
}
