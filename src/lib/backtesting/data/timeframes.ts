/* ------------------------------------------------------------------ */
/*  Timeframe + window helpers — pure, shared by server and client     */
/*                                                                      */
/*  Verified against LSE (Oct 2026):                                    */
/*   • natively serves 1s 5s 15s 30s 1m 3m 5m 15m 30m 1h 4h 1d 1w 1mo  */
/*   • `ts` is UTC (CME break shows as 21:00-22:00 UTC in October)      */
/*   • `end` is exclusive; one full futures day at 1m = 1380 rows       */
/* ------------------------------------------------------------------ */

/** Timeframes LSE can serve directly (lower-case, as LSE expects). */
export const LSE_NATIVE_TIMEFRAMES = [
  "1s", "5s", "15s", "30s", "1m", "3m", "5m", "15m", "30m", "1h", "4h", "1d", "1w",
] as const;

const NATIVE = new Set<string>(LSE_NATIVE_TIMEFRAMES);

/** UI timeframes LSE doesn't serve → fetch a finer native one and aggregate locally. */
const DERIVED: Record<string, { fetch: string; secs: number }> = {
  "10s": { fetch: "5s", secs: 10 },
  "2m": { fetch: "1m", secs: 120 },
  "10m": { fetch: "1m", secs: 600 },
  "2h": { fetch: "1h", secs: 7200 },
};

export interface TimeframePlan {
  /** What to ask LSE for (always a native timeframe). */
  fetchTf: string;
  /** If set, aggregate the fetched candles into buckets of this many seconds. */
  aggregateSecs: number | null;
}

/** Normalise "1D" → "1d" etc. Returns null when the string isn't a timeframe at all. */
export function normaliseTimeframe(tf: string): string | null {
  const m = /^(\d{1,3})(s|m|h|d|w)$/i.exec(tf.trim());
  return m ? `${Number(m[1])}${m[2].toLowerCase()}` : null;
}

/** Decide how to obtain a UI timeframe from LSE. Returns null when impossible. */
export function planTimeframe(uiTimeframe: string): TimeframePlan | null {
  const tf = normaliseTimeframe(uiTimeframe);
  if (!tf) return null;
  if (NATIVE.has(tf)) return { fetchTf: tf, aggregateSecs: null };
  const d = DERIVED[tf];
  return d ? { fetchTf: d.fetch, aggregateSecs: d.secs } : null;
}

export function isLseNativeTimeframe(tf: string): boolean {
  const n = normaliseTimeframe(tf);
  return n !== null && NATIVE.has(n);
}

/** Seconds in one bar of a (normalised) timeframe. */
export function timeframeSecs(tf: string): number {
  const n = normaliseTimeframe(tf);
  if (!n) return 60;
  const v = Number(n.slice(0, -1));
  switch (n.slice(-1)) {
    case "s": return v;
    case "m": return v * 60;
    case "h": return v * 3600;
    case "d": return v * 86400;
    case "w": return v * 604800;
    default: return 60;
  }
}

/* ------------------------------ prices ------------------------------ */

/** Number of decimals needed to represent a tick size (0.25 → 2, 0.5 → 1, 1 → 0). */
function decimalsOf(tick: number): number {
  let d = 0;
  while (d < 8 && Math.abs(Math.round(tick * 10 ** d) - tick * 10 ** d) > 1e-9) d++;
  return d;
}

/**
 * Snap a price to the instrument's tick grid and strip float noise
 * (31430.500000000004 → 31430.5). With no tick size, just trim to 6 dp.
 */
export function roundToTick(price: number, tickSize?: number): number {
  if (!Number.isFinite(price)) return price;
  if (!tickSize || tickSize <= 0) return Number(price.toFixed(6));
  return Number((Math.round(price / tickSize) * tickSize).toFixed(decimalsOf(tickSize)));
}

/* ------------------------------ cache key ------------------------------ */

/**
 * Cache key part for a fetch window. Includes BOTH bounds (epoch seconds):
 * the old key used only the start date, so a 15-minute test poisoned the
 * cache for a full-session test on the same day.
 */
export function windowKey(startUtc: string, endUtc: string): string {
  const s = Math.floor(Date.parse(startUtc) / 1000);
  const e = Math.floor(Date.parse(endUtc) / 1000);
  return `${s}-${e}`;
}

/* ------------------------------ chunking ------------------------------ */

export interface DayChunk {
  /** YYYY-MM-DD, inclusive start. */
  start: string;
  /** YYYY-MM-DD, EXCLUSIVE end (LSE semantics). */
  end: string;
  limit: number;
}

const DAY = 86400;
const isoDay = (sec: number) => new Date(sec * 1000).toISOString().slice(0, 10);

/**
 * Split [startSec, endSec) into whole-UTC-day requests sized so each stays
 * under ~4000 rows (LSE paging is by start/end, not offset).
 */
export function planChunks(startSec: number, endSec: number, fetchTf: string): DayChunk[] {
  if (!(endSec > startSec)) return [];
  const barSecs = Math.max(1, timeframeSecs(fetchTf));
  const rowsPerDay = Math.max(1, Math.ceil(DAY / barSecs));
  const daysPerChunk = Math.max(1, Math.floor(4000 / rowsPerDay));
  const firstDay = Math.floor(startSec / DAY) * DAY;
  // end is exclusive: a window ending exactly at 00:00 UTC doesn't touch that day
  const lastDayExcl = Math.ceil(endSec / DAY) * DAY;
  const chunks: DayChunk[] = [];
  for (let d = firstDay; d < lastDayExcl; d += daysPerChunk * DAY) {
    const e = Math.min(d + daysPerChunk * DAY, lastDayExcl);
    const days = (e - d) / DAY;
    chunks.push({
      start: isoDay(d),
      end: isoDay(e),
      limit: Math.min(200_000, rowsPerDay * days + 50),
    });
  }
  return chunks;
}

/** Hard cap so a typo can't spend the whole data plan. */
export function maxWindowDays(fetchTf: string): number {
  return timeframeSecs(fetchTf) >= 3600 ? 3650 : 31;
}
