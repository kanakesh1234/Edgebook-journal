/* ------------------------------------------------------------------ */
/*  NY Session manager — navigate between trading days                 */
/*                                                                      */
/*  All times use America/New_York via IANA timezone. Never a          */
/*  hard-coded UTC-4 or UTC-5 offset.                                  */
/* ------------------------------------------------------------------ */

import { TRADING_TZ, zonedToUtc } from '../../tz';

/**
 * Given a date key (YYYY-MM-DD), find the next valid trading day.
 * Skips weekends (Saturday/Sunday). Does NOT skip market holidays
 * for Phase 1 — holiday awareness can be added later.
 */
export function nextTradingDay(dateKey: string): string {
  const d = new Date(dateKey + 'T12:00:00Z'); // noon to avoid DST edge
  for (let i = 0; i < 7; i++) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      return d.toISOString().slice(0, 10);
    }
  }
  return dateKey; // fallback
}

/**
 * Given a date key, find the previous valid trading day.
 */
export function previousTradingDay(dateKey: string): string {
  const d = new Date(dateKey + 'T12:00:00Z');
  for (let i = 0; i < 7; i++) {
    d.setUTCDate(d.getUTCDate() - 1);
    const dow = d.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      return d.toISOString().slice(0, 10);
    }
  }
  return dateKey;
}

/**
 * Resolve a NY session window (date + start/end times) to UTC epoch seconds.
 * Uses IANA timezone so DST transitions resolve automatically.
 */
export function resolveSessionWindowUtc(
  dateKey: string,
  startTime: string,
  endTime: string,
): { startUtc: number; endUtc: number } | null {
  const start = zonedToUtc(dateKey, startTime + ':00', TRADING_TZ);
  const end = zonedToUtc(dateKey, endTime + ':00', TRADING_TZ);
  if (!start || !end) return null;
  return {
    startUtc: Math.floor(start.getTime() / 1000),
    endUtc: Math.floor(end.getTime() / 1000),
  };
}

/**
 * Navigate to the next NY session. Returns new date key and UTC bounds.
 */
export function navigateToNextSession(
  currentDateKey: string,
  startTime: string,
  endTime: string,
): { dateKey: string; startUtc: number; endUtc: number } | null {
  const nextDate = nextTradingDay(currentDateKey);
  const window = resolveSessionWindowUtc(nextDate, startTime, endTime);
  if (!window) return null;
  return { dateKey: nextDate, ...window };
}

/**
 * Navigate to the previous NY session.
 */
export function navigateToPreviousSession(
  currentDateKey: string,
  startTime: string,
  endTime: string,
): { dateKey: string; startUtc: number; endUtc: number } | null {
  const prevDate = previousTradingDay(currentDateKey);
  const window = resolveSessionWindowUtc(prevDate, startTime, endTime);
  if (!window) return null;
  return { dateKey: prevDate, ...window };
}

/**
 * Check if a given date is a weekend.
 */
export function isWeekend(dateKey: string): boolean {
  const d = new Date(dateKey + 'T12:00:00Z');
  const dow = d.getUTCDay();
  return dow === 0 || dow === 6;
}

/**
 * Get the NY date key from a UTC epoch timestamp.
 */
export function utcToNyDateKey(utcEpochSec: number): string {
  const d = new Date(utcEpochSec * 1000);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TRADING_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const p: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') p[part.type] = part.value;
  }
  return `${p.year}-${p.month}-${p.day}`;
}

/**
 * Format UTC epoch seconds as NY time string (HH:MM:SS).
 */
export function utcToNyTimeStr(utcEpochSec: number): string {
  const d = new Date(utcEpochSec * 1000);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: TRADING_TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(d);
}
