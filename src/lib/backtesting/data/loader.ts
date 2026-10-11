/* ------------------------------------------------------------------ */
/*  Candle loader — the ONE place that turns (symbol, timeframe,       */
/*  window) into candles.                                               */
/*                                                                      */
/*  cache → LSE (via /api/market-data) → local aggregation (2m/10m/2h)  */
/*  Never returns an empty result silently: `error` always explains.    */
/* ------------------------------------------------------------------ */

import { instrumentBySymbol } from '../instruments';
import { aggregateCandles } from '../engine/candle-aggregator';
import { cacheKey, getCachedCandles, setCachedCandles } from './cache';
import { lseProvider } from './lse-provider';
import { planTimeframe, windowKey } from './timeframes';
import type { CandleData, CandleFetchMeta } from './types';

export interface LoadResult {
  symbol: string;
  candles: CandleData[];
  fromCache: boolean;
  meta: CandleFetchMeta | null;
  /** Set when candles is empty or the fetch failed — always human-readable. */
  error: string | null;
  /** Set when data loaded but may be incomplete. */
  warning: string | null;
}

const NY = 'America/New_York';

function nyStamp(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: NY, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso)) + ' ET';
}

function isWeekendNy(iso: string): boolean {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: NY, weekday: 'short' }).format(new Date(iso));
  return wd === 'Sat' || wd === 'Sun';
}

function describeEmpty(symbol: string, providerSymbol: string, startUtc: string, endUtc: string): string {
  const win = `${nyStamp(startUtc)} → ${nyStamp(endUtc)}`;
  const hint = isWeekendNy(startUtc)
    ? 'That start falls on a weekend — futures are closed.'
    : 'Likely a market holiday, the CME daily break (5–6 PM ET), or a date outside LSE\u2019s history.';
  const via = providerSymbol !== symbol ? ` (priced from ${providerSymbol})` : '';
  return `No ${symbol}${via} candles for ${win}. ${hint}`;
}

export async function loadSymbolCandles(
  symbol: string,
  timeframe: string,
  startUtc: string,
  endUtc: string,
): Promise<LoadResult> {
  const providerSymbol = instrumentBySymbol(symbol)?.providerSymbol || symbol;
  const base = { symbol, fromCache: false, meta: null, warning: null } as const;

  const plan = planTimeframe(timeframe);
  if (!plan) {
    return { ...base, candles: [], error: `Timeframe "${timeframe}" is not supported.` };
  }

  const finish = (raw: CandleData[], fromCache: boolean, meta: CandleFetchMeta | null): LoadResult => {
    const candles = plan.aggregateSecs ? aggregateCandles(raw, plan.aggregateSecs) : raw;
    return {
      symbol,
      candles,
      fromCache,
      meta,
      warning: meta?.truncated
        ? 'The data provider cut this window short — shorten the date range for complete candles.'
        : null,
      error: candles.length === 0 ? describeEmpty(symbol, providerSymbol, startUtc, endUtc) : null,
    };
  };

  // Cache is keyed by LSE symbol (MNQ and NQ share data), full window, native timeframe.
  const key = cacheKey('lse', providerSymbol, windowKey(startUtc, endUtc), plan.fetchTf);
  const cached = await getCachedCandles(key);
  if (cached && cached.length > 0) return finish(cached, true, null);

  try {
    const { candles, meta } = await lseProvider.getCandlesWithMeta(providerSymbol, plan.fetchTf, startUtc, endUtc);
    // Don't cache empty or truncated results — they'd be served forever.
    if (candles.length > 0 && !meta?.truncated) await setCachedCandles(key, candles);
    return finish(candles, false, meta);
  } catch (err) {
    return {
      ...base,
      candles: [],
      error: err instanceof Error ? err.message : 'Failed to load market data.',
    };
  }
}

/** Index of the last candle with time <= t, or -1. Candles must be sorted. */
export function lastIndexAtOrBefore(candles: CandleData[], t: number): number {
  let lo = 0, hi = candles.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid].time <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/**
 * Where the replay clock should sit after a (re)load:
 *  - fresh session (0) or a position outside the loaded range → first candle
 *  - otherwise keep the user's position (resume / timeframe switch),
 *    snapped to a real candle.
 */
export function resolveClock(candles: CandleData[], currentTime: number): number {
  if (candles.length === 0) return currentTime;
  const first = candles[0].time;
  const last = candles[candles.length - 1].time;
  if (!currentTime || currentTime < first || currentTime > last) return first;
  const i = lastIndexAtOrBefore(candles, currentTime);
  return i >= 0 ? candles[i].time : first;
}
