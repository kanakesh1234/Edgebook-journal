import { addDays, dateKey, parseDateKey } from "@/lib/format";

/**
 * Calendar maths for the Weekly / Monthly review.
 * Trading days are Monday–Friday minus US exchange holidays; weekends and holidays are reserved
 * for review, practice and backtesting. A week is keyed by its Monday (YYYY-MM-DD), a month by YYYY-MM.
 */

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m0: number, d: number) => `${y}-${pad(m0 + 1)}-${pad(d)}`;

export const isWeekend = (date: string) => { const g = parseDateKey(date).getDay(); return g === 0 || g === 6; };

/** Monday of the week containing `date`. */
export function mondayOf(date: string): string {
  const d = parseDateKey(date);
  const back = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
  return addDays(date, -back);
}

export const weekDays = (monday: string): string[] => Array.from({ length: 7 }, (_, i) => addDays(monday, i));
export const weekTradingSlots = (monday: string): string[] => weekDays(monday).slice(0, 5);

/** ISO-8601 week number (1–53) of the week whose Monday is given. */
export function isoWeek(monday: string): number {
  const d = parseDateKey(monday);
  const thursday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 3);
  const jan1 = new Date(thursday.getFullYear(), 0, 1);
  return Math.floor((thursday.getTime() - jan1.getTime()) / 86400000 / 7) + 1;
}

/** Week of the month (1-based) by Monday-anchored weeks that touch the month. */
export function weekOfMonth(monday: string, month: string): number {
  const mons = mondaysInMonth(month);
  const i = mons.indexOf(monday);
  return i >= 0 ? i + 1 : 1;
}

/** Mondays of every week that contains at least one weekday of the month. */
export function mondaysInMonth(month: string): string[] {
  const days = tradingWeekdaysInMonth(month);
  const out: string[] = [];
  for (const d of days) { const m = mondayOf(d); if (!out.includes(m)) out.push(m); }
  return out;
}

/** Every Mon–Fri date of the month (holidays included — see `isHoliday`). */
export function tradingWeekdaysInMonth(month: string): string[] {
  const [y, m] = month.split("-").map(Number);
  const out: string[] = [];
  const last = new Date(y, m, 0).getDate();
  for (let d = 1; d <= last; d++) { const k = ymd(y, m - 1, d); if (!isWeekend(k)) out.push(k); }
  return out;
}

const nthWeekday = (y: number, m0: number, weekday: number, n: number) => {
  const first = new Date(y, m0, 1).getDay();
  return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
};
const lastWeekday = (y: number, m0: number, weekday: number) => {
  const last = new Date(y, m0 + 1, 0);
  return last.getDate() - ((last.getDay() - weekday + 7) % 7);
};
/** Gregorian Easter Sunday (anonymous algorithm). */
function easter(y: number): { m0: number; d: number } {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return { m0: month - 1, d: day };
}
/** A fixed-date holiday observed on the nearest weekday (Sat → Fri, Sun → Mon). */
function observed(y: number, m0: number, d: number): string {
  const g = new Date(y, m0, d).getDay();
  return ymd(y, m0, g === 6 ? d - 1 : g === 0 ? d + 1 : d);
}

const cache = new Map<number, Map<string, string>>();
/** NYSE full-day closures for a year: date → name. */
export function holidaysOf(y: number): Map<string, string> {
  const hit = cache.get(y); if (hit) return hit;
  const map = new Map<string, string>();
  const add = (k: string, name: string) => { if (k.startsWith(`${y}-`)) map.set(k, name); };
  add(observed(y, 0, 1), "New Year's Day");
  add(ymd(y, 0, nthWeekday(y, 0, 1, 3)), "Martin Luther King Jr. Day");
  add(ymd(y, 1, nthWeekday(y, 1, 1, 3)), "Presidents' Day");
  const e = easter(y); add(addDays(ymd(y, e.m0, e.d), -2), "Good Friday");
  add(ymd(y, 4, lastWeekday(y, 4, 1)), "Memorial Day");
  if (y >= 2022) add(observed(y, 5, 19), "Juneteenth");
  add(observed(y, 6, 4), "Independence Day");
  add(ymd(y, 8, nthWeekday(y, 8, 1, 1)), "Labor Day");
  add(ymd(y, 10, nthWeekday(y, 10, 4, 4)), "Thanksgiving");
  add(observed(y, 11, 25), "Christmas Day");
  cache.set(y, map);
  return map;
}
export const holidayName = (date: string): string | null => holidaysOf(Number(date.slice(0, 4))).get(date) ?? null;
export const isHoliday = (date: string) => holidayName(date) != null;
/** A day the market is open: Mon–Fri and not a holiday. */
export const isTradingDay = (date: string) => !isWeekend(date) && !isHoliday(date);

export function weekLabel(monday: string): string {
  const fri = addDays(monday, 4);
  const f = (k: string) => parseDateKey(k).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${f(monday)} – ${f(fri)}`;
}
export function monthOf(date: string) { return date.slice(0, 7); }
export const addMonths = (month: string, n: number) => { const [y, m] = month.split("-").map(Number); const d = new Date(y, m - 1 + n, 1); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; };
export const monthTitle = (month: string) => { const [y, m] = month.split("-").map(Number); return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }); };
export const todayMonday = () => mondayOf(dateKey(new Date()));
