import type { JournalEntry } from "./types";

/* ------------------------------------------------------------------ */
/*  Hold-time statistics — DETERMINISTIC backend calculations.         */
/*  MINATO never computes these from text; it renders these facts.     */
/*  Hold time = exit timestamp − entry timestamp (America/New_York     */
/*  wall times on the trade's own date; cross-midnight not assumed).   */
/* ------------------------------------------------------------------ */

export interface HoldTradeSummary {
  id: string;
  date: string;
  instrument: string;
  direction: "long" | "short" | null;
  setup: string;
  pnl: number;
  rr: number | null;
  entryTime: string;
  exitTime: string;
  holdMin: number;
  holdFormatted: string;
}

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
  longestHoldTrade: HoldTradeSummary | null;
  shortestHoldTrade: HoldTradeSummary | null;
  longestWinTrade: HoldTradeSummary | null;
  longestLossTrade: HoldTradeSummary | null;
}

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

export function holdMinutes(e: Pick<JournalEntry, "entryTime" | "exitTime">): number | null {
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

export function formatHold(min: number | null): string {
  if (min == null) return "—";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function toSummary(e: JournalEntry, min: number): HoldTradeSummary {
  return {
    id: e.id,
    date: e.date,
    instrument: e.instrument,
    direction: e.direction ?? null,
    setup: e.setup || "Unnamed setup",
    pnl: e.pnl,
    rr: e.rr ?? null,
    entryTime: e.entryTime ?? "",
    exitTime: e.exitTime ?? "",
    holdMin: min,
    holdFormatted: formatHold(min),
  };
}

export function holdTimeStats(entries: JournalEntry[]): HoldStats {
  const withHold = entries
    .map((e) => ({ e, min: holdMinutes(e) }))
    .filter((x): x is { e: JournalEntry; min: number } => x.min != null);

  const wins = withHold.filter((x) => x.e.pnl > 0);
  const losses = withHold.filter((x) => x.e.pnl < 0);
  const winMin = wins.map((x) => x.min);
  const lossMin = losses.map((x) => x.min);

  const byDesc = [...withHold].sort((a, b) => b.min - a.min || b.e.date.localeCompare(a.e.date));
  const byAsc = [...withHold].sort((a, b) => a.min - b.min || b.e.date.localeCompare(a.e.date));
  const winDesc = [...wins].sort((a, b) => b.min - a.min || b.e.date.localeCompare(a.e.date));
  const lossDesc = [...losses].sort((a, b) => b.min - a.min || b.e.date.localeCompare(a.e.date));

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
    longestHoldTrade: byDesc[0] ? toSummary(byDesc[0].e, byDesc[0].min) : null,
    shortestHoldTrade: byAsc[0] ? toSummary(byAsc[0].e, byAsc[0].min) : null,
    longestWinTrade: winDesc[0] ? toSummary(winDesc[0].e, winDesc[0].min) : null,
    longestLossTrade: lossDesc[0] ? toSummary(lossDesc[0].e, lossDesc[0].min) : null,
  };
}
