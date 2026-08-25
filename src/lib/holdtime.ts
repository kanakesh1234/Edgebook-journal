import type { JournalEntry } from "./types";

/* ------------------------------------------------------------------ */
/*  Hold-time statistics — DETERMINISTIC backend calculations.         */
/*  MINATO never computes these from text; it renders these facts.     */
/*  Hold time = exit timestamp − entry timestamp (America/New_York     */
/*  wall times on the trade's own date; cross-midnight not assumed).   */
/* ------------------------------------------------------------------ */

export interface HoldStats {
  sampleSize: number;
  avgWinMin: number | null;
  avgLossMin: number | null;
  medianWinMin: number | null;
  medianLossMin: number | null;
  longestWinMin: number | null;
  shortestWinMin: number | null;
  longestLossMin: number | null;
  shortestLossMin: number | null;
  avgHoldMin: number | null;
}

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function holdMinutes(e: JournalEntry): number | null {
  if (!e.entryTime || !e.exitTime) return null;
  const a = toMinutes(e.entryTime);
  const b = toMinutes(e.exitTime);
  if (a == null || b == null) return null;
  return Math.max(0, b - a);
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round(values.reduce((s, v) => s + v, 0) / values.length);
}

export function holdTimeStats(entries: JournalEntry[]): HoldStats {
  const withHold = entries
    .map((e) => ({ e, min: holdMinutes(e) }))
    .filter((x): x is { e: JournalEntry; min: number } => x.min != null);

  const winMin = withHold.filter((x) => x.e.pnl > 0).map((x) => x.min);
  const lossMin = withHold.filter((x) => x.e.pnl < 0).map((x) => x.min);

  return {
    sampleSize: withHold.length,
    avgWinMin: avg(winMin),
    avgLossMin: avg(lossMin),
    medianWinMin: median(winMin),
    medianLossMin: median(lossMin),
    longestWinMin: winMin.length ? Math.max(...winMin) : null,
    shortestWinMin: winMin.length ? Math.min(...winMin) : null,
    longestLossMin: lossMin.length ? Math.max(...lossMin) : null,
    shortestLossMin: lossMin.length ? Math.min(...lossMin) : null,
    avgHoldMin: avg(withHold.map((x) => x.min)),
  };
}

export function formatHold(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
