/**
 * Consistency calendar — the maths behind the Progress page's week grid.
 *
 * Pure functions on "YYYY-MM-DD" keys (UTC maths, so they never drift with the viewer's timezone).
 * The grid is laid out like Apple's Calendar: fixed Monday-first week columns, the current week last,
 * days still to come shown quietly. Colour carries how much you practised that day:
 *
 *   level 0  nothing          level 3  16–29 answers
 *   level 1  1–7 answers      level 4  30+ answers
 *   level 2  8–15 answers
 *
 * A round is roughly 6–14 answers, so one round lights a day up and three or four fill it.
 */

export type DayLevel = 0 | 1 | 2 | 3 | 4;
export interface DayStat { xp: number; correct: number; total: number }
export interface Cell { key: string; day: number; future: boolean }

const DAY_MS = 86_400_000;
const toMs = (key: string) => Date.parse(`${key}T00:00:00Z`);
const toKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export const addDaysKey = (key: string, n: number) => toKey(toMs(key) + n * DAY_MS);
/** Monday = 0 … Sunday = 6. */
export const weekdayIndex = (key: string) => (new Date(toMs(key)).getUTCDay() + 6) % 7;
export const WEEKDAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"] as const;

/** `weeks` full Monday–Sunday rows, ending with the week that contains `today`. */
export function calendarGrid(today: string, weeks = 5): Cell[] {
  const start = addDaysKey(addDaysKey(today, -weekdayIndex(today)), -(weeks - 1) * 7);
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const key = addDaysKey(start, i);
    return { key, day: Number(key.slice(8, 10)), future: key > today };
  });
}

/** How strongly a day should be coloured. A day known to be trained but with no answer count still counts as level 1. */
export function dayLevel(total: number | undefined, trained = false): DayLevel {
  const n = total ?? 0;
  if (n <= 0) return trained ? 1 : 0;
  if (n < 8) return 1;
  if (n < 16) return 2;
  if (n < 30) return 3;
  return 4;
}

/** Days trained, the longest unbroken run and total answers across the visible, non-future days. */
export function summarise(cells: Cell[], stats: Record<string, DayStat> | undefined, completed: ReadonlySet<string>): { days: number; longest: number; answers: number } {
  let days = 0, run = 0, longest = 0, answers = 0;
  for (const cell of cells) {
    if (cell.future) break;
    const total = stats?.[cell.key]?.total ?? 0;
    answers += total;
    if (total > 0 || completed.has(cell.key)) { days++; run++; longest = Math.max(longest, run); } else run = 0;
  }
  return { days, longest, answers };
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en", { timeZone: "UTC", ...opts });
/** "Tue, Oct 6" — for tooltips and screen readers. */
export const dateLabel = (key: string) => fmt({ weekday: "short", month: "short", day: "numeric" }).format(toMs(key));
/** "Sep 7 – Oct 6" — the span actually shown (up to today). */
export const rangeLabel = (cells: Cell[]) => {
  const shown = cells.filter((c) => !c.future);
  if (!shown.length) return "";
  const short = fmt({ month: "short", day: "numeric" });
  return `${short.format(toMs(shown[0]!.key))} – ${short.format(toMs(shown[shown.length - 1]!.key))}`;
};
