import type { JournalEntry } from "./types";

/* ------------------------------------------------------------------ */
/*  Trading timezone utilities                                         */
/*                                                                      */
/*  EdgeBook communicates trading time in America/New_York (with       */
/*  proper DST handling). Imported broker timestamps are commonly      */
/*  IST — normalize them at the import seam, never inside MINATO.      */
/* ------------------------------------------------------------------ */

export const TRADING_TZ = "America/New_York";
export const IMPORT_SOURCE_TZ = "Asia/Kolkata"; // broker exports (IST, UTC+5:30)

type Parts = Record<string, string>;

function partsInTz(date: Date, tz: string): Parts {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const out: Parts = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== "literal") out[p.type] = p.value;
  }
  return out;
}

/** Offset (minutes east of UTC) of a timezone at a given instant. */
function tzOffsetMinutes(date: Date, tz: string): number {
  const p = partsInTz(date, tz);
  const asUtc = Date.UTC(
    Number(p.year),
    Number(p.month) - 1,
    Number(p.day),
    Number(p.hour) % 24,
    Number(p.minute),
    Number(p.second),
  );
  return (asUtc - date.getTime()) / 60000;
}

/** Convert a wall-clock time in `sourceTz` to the true UTC instant. */
export function zonedToUtc(dateStr: string, timeStr: string, sourceTz: string): Date | null {
  const guess = new Date(`${dateStr}T${timeStr || "00:00:00"}Z`);
  if (Number.isNaN(guess.getTime())) return null;
  const offset = tzOffsetMinutes(guess, sourceTz);
  const utc = new Date(guess.getTime() - offset * 60000);
  // Second pass handles boundaries where the offset itself shifts.
  const offset2 = tzOffsetMinutes(utc, sourceTz);
  return offset2 === offset ? utc : new Date(guess.getTime() - offset2 * 60000);
}

/** YYYY-MM-DD of an instant as seen in New York. */
export function nyDateKey(ts: Date): string {
  const p = partsInTz(ts, TRADING_TZ);
  return `${p.year}-${p.month}-${p.day}`;
}

/** "9:34 AM" — New York wall-clock time. */
export function formatNyTime(ts: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TRADING_TZ,
    hour: "numeric",
    minute: "2-digit",
  }).format(ts);
}

/**
 * Normalize an imported timestamp (e.g. "08/05/2026 19:23:29" IST) into
 * the trading journal: NY date key + "9:53 AM" NY clock time.
 * Returns null when the input can't be parsed.
 */
export function normalizeImportedTimestamp(
  raw: string,
  sourceTz: string = IMPORT_SOURCE_TZ,
): { date: string; time: string } | null {
  const v = raw.trim();
  if (!v) return null;

  // MM/DD/YYYY HH:mm[:ss]
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(v);
  // YYYY-MM-DD[ T]HH:mm[:ss]
  if (!m) m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(v);
  if (!m) return null;

  const [, a, b, y, hh = "0", mm = "0", ss = "0"] = m;
  // Detect whether the shape is ISO (year first) or US (month first)
  const iso = a.length === 4;
  const dateStr = iso ? `${a}-${b.padStart(2, "0")}` : `${y}-${a.padStart(2, "0")}-${b.padStart(2, "0")}`;
  const timeStr = `${hh.padStart(2, "0")}:${mm}:${ss}`;

  const utc = zonedToUtc(dateStr, timeStr, sourceTz);
  if (!utc) return null;
  return { date: nyDateKey(utc), time: formatNyTime(utc) };
}

/** Does the cell carry a time-of-day component (vs a plain calendar date)? */
export function hasTimeComponent(raw: string): boolean {
  return /\d{1,2}:\d{2}/.test(raw);
}

/**
 * Historical dates shown to the trader use DD/MM/YYYY.
 */
export function formatHistoricalDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-");
  return `${d}/${m}/${y}`;
}

/** Most-recent-first copy of entries (helper for MINATO's history lookups). */
export function entriesNewestFirst(entries: JournalEntry[]): JournalEntry[] {
  return [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
}
