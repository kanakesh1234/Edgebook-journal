/* ------------------------------------------------------------------ */
/*  Candle aggregator — builds coarser timeframes from finer ones      */
/*                                                                      */
/*  Never re-fetches: always aggregates from the highest resolution    */
/*  data already in cache. OHLCV construction is mathematically        */
/*  correct: O=first.open, H=max(highs), L=min(lows), C=last.close,   */
/*  V=sum(volumes).                                                    */
/* ------------------------------------------------------------------ */

import type { CandleData } from '../data/types';

/** Parse a timeframe string into seconds. */
export function timeframeToSeconds(tf: string): number {
  const match = /^(\d+)(s|m|h|D|W)$/i.exec(tf);
  if (!match) return 60; // default 1m
  const n = Number(match[1]);
  switch (match[2].toUpperCase()) {
    case 'S': return n;
    case 'M': return n * 60;
    case 'H': return n * 3600;
    case 'D': return n * 86400;
    case 'W': return n * 604800;
    default: return 60;
  }
}

/**
 * Aggregate finer candles into a coarser timeframe.
 * Input candles MUST be sorted chronologically.
 */
export function aggregateCandles(
  candles: CandleData[],
  targetTimeframeSecs: number,
): CandleData[] {
  if (candles.length === 0) return [];
  if (targetTimeframeSecs <= 0) return candles;

  const result: CandleData[] = [];
  let bucket: CandleData[] = [];
  let bucketStart = Math.floor(candles[0].time / targetTimeframeSecs) * targetTimeframeSecs;

  for (const candle of candles) {
    const cBucket = Math.floor(candle.time / targetTimeframeSecs) * targetTimeframeSecs;
    if (cBucket !== bucketStart && bucket.length > 0) {
      result.push(mergeBucket(bucket, bucketStart));
      bucket = [];
      bucketStart = cBucket;
    }
    bucket.push(candle);
  }

  if (bucket.length > 0) {
    result.push(mergeBucket(bucket, bucketStart));
  }

  return result;
}

function mergeBucket(bucket: CandleData[], bucketTime: number): CandleData {
  return {
    time: bucketTime,
    open: bucket[0].open,
    high: Math.max(...bucket.map(c => c.high)),
    low: Math.min(...bucket.map(c => c.low)),
    close: bucket[bucket.length - 1].close,
    volume: bucket.reduce((sum, c) => sum + c.volume, 0),
  };
}

/**
 * Given 1m candles and a target timeframe, determine whether we can
 * aggregate locally or need to fetch from the provider.
 */
export function canAggregateLocally(sourceResolution: string, targetResolution: string): boolean {
  const sourceSecs = timeframeToSeconds(sourceResolution);
  const targetSecs = timeframeToSeconds(targetResolution);
  // Can aggregate if target is coarser (>= source) and evenly divisible
  return targetSecs >= sourceSecs && targetSecs % sourceSecs === 0;
}
