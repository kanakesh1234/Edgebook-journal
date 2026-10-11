import { NextRequest, NextResponse } from 'next/server';
import { INSTRUMENTS } from '@/lib/backtesting/instruments';
import { rateLimited, sessionEmail } from '@/lib/server/auth';
import {
  LSE_NATIVE_TIMEFRAMES,
  isLseNativeTimeframe,
  maxWindowDays,
  normaliseTimeframe,
  planChunks,
  roundToTick,
} from '@/lib/backtesting/data/timeframes';

/* ------------------------------------------------------------------ */
/*  Market data proxy — server-side only                                */
/*                                                                      */
/*  Proxies candle requests to London Strategic Edge's vault API.       */
/*  The LSE_API_KEY is read from process.env and NEVER sent to the     */
/*  browser.                                                            */
/*                                                                      */
/*  Verified LSE behaviour (Oct 2026):                                  */
/*   • response is a plain array: {ts, symbol, open, high, low, close,  */
/*     volume}; `ts` is "YYYY-MM-DD HH:MM:SS.ffffff" in UTC             */
/*   • `start`/`end` are whole dates, `end` is exclusive                */
/*   • prices carry float noise (31430.500000000004) → snapped to tick  */
/*   • unknown symbols return an error body, not an empty array         */
/* ------------------------------------------------------------------ */

const LSE_BASE = 'https://api.londonstrategicedge.com/vault';
const MAX_CHUNKS = 40;
const CONCURRENCY = 4;

interface LseCandle {
  ts?: string; date?: string; datetime?: string;
  t?: number; time?: number; timestamp?: number;
  o?: number; open?: number;
  h?: number; high?: number;
  l?: number; low?: number;
  c?: number; close?: number;
  v?: number; volume?: number;
}

function getApiKey(): string | null {
  return process.env.LSE_API_KEY || null;
}

/** "2026-10-08 13:30:00.000000" (UTC) → epoch seconds. 0 on failure. */
function parseStringTimestamp(value: string): number {
  let iso = value.trim().replace(' ', 'T');
  iso = iso.replace(/(\.\d{3})\d*$/, '$1');
  if (!/(Z|[+-]\d{2}:?\d{2})$/i.test(iso)) iso += 'Z';
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : Math.floor(ms / 1000);
}

/** Internal symbol → LSE symbol (NQ→NQ.F, MNQ→NQ.F). Pass-through if unknown or already LSE's. */
function resolveProviderSymbol(symbol: string): string {
  const up = symbol.toUpperCase();
  const byInternal = INSTRUMENTS.find((i) => i.symbol.toUpperCase() === up);
  if (byInternal?.providerSymbol) return byInternal.providerSymbol;
  return symbol;
}

function tickSizeFor(providerSymbol: string): number | undefined {
  return INSTRUMENTS.find((i) => i.providerSymbol?.toUpperCase() === providerSymbol.toUpperCase())?.tickSize;
}

const SYMBOL_RE = /^[A-Za-z0-9._/-]{1,20}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}([T ][0-9:.]{0,20}(Z|[+-]\d{2}:?\d{2})?)?$/;

function fail(error: string, message: string, status: number) {
  return NextResponse.json({ error, message }, { status });
}

class UpstreamError extends Error {
  constructor(public kind: 'unknown_symbol' | 'rate_limited' | 'provider', public status: number) {
    super(kind);
  }
}

function toCandle(r: LseCandle, tick: number | undefined) {
  let timeSec = 0;
  const strTs = r.ts ?? r.datetime ?? r.date;
  if (strTs && typeof strTs === 'string') timeSec = parseStringTimestamp(strTs);
  if (timeSec === 0) {
    const numTs = r.t ?? r.time ?? r.timestamp ?? 0;
    timeSec = typeof numTs === 'number' && numTs > 0 ? (numTs > 1e12 ? Math.floor(numTs / 1000) : numTs) : 0;
  }
  return {
    time: timeSec,
    open: roundToTick(r.o ?? r.open ?? 0, tick),
    high: roundToTick(r.h ?? r.high ?? 0, tick),
    low: roundToTick(r.l ?? r.low ?? 0, tick),
    close: roundToTick(r.c ?? r.close ?? 0, tick),
    volume: Math.round(r.v ?? r.volume ?? 0),
  };
}

async function fetchChunk(
  apiKey: string,
  symbol: string,
  timeframe: string,
  chunk: { start: string; end: string; limit: number },
): Promise<LseCandle[]> {
  const params = new URLSearchParams({
    symbol,
    timeframe,
    start: chunk.start,
    end: chunk.end,
    limit: String(chunk.limit),
  });
  const res = await fetch(`${LSE_BASE}/candles?${params}`, {
    headers: { 'x-api-key': apiKey },
    cache: 'no-store',
  });
  if (!res.ok) {
    // Log status only — never forward the provider body (may contain account/quota details).
    console.error(`[market-data] LSE ${res.status} for ${symbol} ${timeframe} ${chunk.start}`);
    if (res.status === 400 || res.status === 404 || res.status === 422) throw new UpstreamError('unknown_symbol', res.status);
    if (res.status === 429) throw new UpstreamError('rate_limited', 429);
    throw new UpstreamError('provider', res.status);
  }
  const raw = await res.json();
  const list = Array.isArray(raw) ? raw : (raw?.data || raw?.candles || raw?.results);
  return Array.isArray(list) ? list : [];
}

export async function GET(req: NextRequest) {
  const me = sessionEmail(req);
  if (!me) return fail('not_logged_in', 'Please sign in again.', 401);
  if (rateLimited(`market:${me}`, 120, 60_000)) return fail('rate_limited', 'Too many requests — wait a moment.', 429);

  const apiKey = getApiKey();
  if (!apiKey) return fail('not_configured', 'LSE_API_KEY is not set in .env.local.', 503);

  const { searchParams } = req.nextUrl;
  const rawSymbol = searchParams.get('symbol');
  const rawTf = searchParams.get('timeframe') || '1m';
  const start = searchParams.get('start');
  const end = searchParams.get('end');

  if (!rawSymbol || !SYMBOL_RE.test(rawSymbol)) return fail('bad_request', 'Missing or invalid symbol.', 400);
  if (!start || !end || !DATE_RE.test(start) || !DATE_RE.test(end)) {
    return fail('bad_request', 'start and end are required (ISO date or datetime).', 400);
  }

  const timeframe = normaliseTimeframe(rawTf);
  if (!timeframe || !isLseNativeTimeframe(timeframe)) {
    return fail(
      'unsupported_timeframe',
      `Timeframe "${rawTf}" isn't served by LSE. Supported: ${LSE_NATIVE_TIMEFRAMES.join(', ')}.`,
      400,
    );
  }

  const startEpoch = Math.floor(Date.parse(start) / 1000);
  const endEpoch = Math.floor(Date.parse(end) / 1000);
  if (!Number.isFinite(startEpoch) || !Number.isFinite(endEpoch) || endEpoch <= startEpoch) {
    return fail('bad_request', 'The end must be after the start.', 400);
  }

  const days = (endEpoch - startEpoch) / 86400;
  if (days > maxWindowDays(timeframe)) {
    return fail('window_too_large', `Window is ${Math.ceil(days)} days; the limit for ${timeframe} is ${maxWindowDays(timeframe)}.`, 400);
  }

  const symbol = resolveProviderSymbol(rawSymbol);
  const tick = tickSizeFor(symbol);
  const chunks = planChunks(startEpoch, endEpoch, timeframe);
  if (chunks.length === 0 || chunks.length > MAX_CHUNKS) {
    return fail('window_too_large', 'That window needs too many requests — shorten it.', 400);
  }

  try {
    const results: LseCandle[][] = new Array(chunks.length);
    let next = 0;
    let truncated = false;
    const worker = async () => {
      while (next < chunks.length) {
        const i = next++;
        const rows = await fetchChunk(apiKey, symbol, timeframe, chunks[i]);
        if (rows.length >= chunks[i].limit) truncated = true; // hit our own row cap → data may be cut
        results[i] = rows;
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, worker));

    const upstreamRows = results.reduce((n, r) => n + r.length, 0);

    const byTime = new Map<number, ReturnType<typeof toCandle>>();
    for (const rows of results) {
      for (const r of rows) {
        const c = toCandle(r, tick);
        // Window is [start, end): a candle's time is its OPEN, so the candle
        // stamped exactly at `end` belongs to the next session.
        if (c.time > 0 && c.open > 0 && c.time >= startEpoch && c.time < endEpoch) byTime.set(c.time, c);
      }
    }
    const candles = [...byTime.values()].sort((a, b) => a.time - b.time);

    return NextResponse.json({
      candles,
      count: candles.length,
      meta: {
        symbol: rawSymbol,
        providerSymbol: symbol,
        timeframe,
        start,
        end,
        chunks: chunks.length,
        upstreamRows,
        returned: candles.length,
        truncated,
        firstTime: candles[0]?.time ?? null,
        lastTime: candles[candles.length - 1]?.time ?? null,
      },
    });
  } catch (err) {
    if (err instanceof UpstreamError) {
      if (err.kind === 'unknown_symbol') {
        return fail('unknown_symbol', `LSE has no candle data for "${symbol}" at ${timeframe}.`, 404);
      }
      if (err.kind === 'rate_limited') return fail('provider_rate_limited', 'The data provider is rate-limiting us — try again shortly.', 429);
      return fail('provider_error', `Market data provider error (${err.status}).`, 502);
    }
    console.error('[market-data] fetch failed:', err instanceof Error ? err.message : err);
    return fail('provider_error', 'Failed to fetch market data.', 502);
  }
}
