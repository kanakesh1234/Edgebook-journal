import { NextRequest, NextResponse } from 'next/server';
import { INSTRUMENTS } from '@/lib/backtesting/instruments';
import { rateLimited, sessionEmail } from '@/lib/server/auth';

/* ------------------------------------------------------------------ */
/*  Market data proxy — server-side only                                */
/*                                                                      */
/*  Proxies candle requests to London Strategic Edge's vault API.       */
/*  The LSE_API_KEY is read from process.env and NEVER sent to the     */
/*  browser. All responses are normalized before returning.             */
/* ------------------------------------------------------------------ */

const LSE_BASE = 'https://api.londonstrategicedge.com/vault';
const MAX_ROWS = 5000;

/**
 * LSE's actual response shape — the critical field is `ts`, a string
 * timestamp like "2026-01-01 00:00:00.000000".  We also keep the old
 * numeric-epoch fields (`t`, `time`, `timestamp`) for backward compat
 * in case LSE ever changes its format or the data comes from a
 * different endpoint.
 */
interface LseCandle {
  // String timestamp — LSE's real format: "YYYY-MM-DD HH:MM:SS.ffffff"
  ts?: string;
  date?: string;
  datetime?: string;
  // Numeric epoch — fallback / alternative formats
  t?: number;
  time?: number;
  timestamp?: number;
  // OHLCV — accept both short and long field names
  o?: number; open?: number;
  h?: number; high?: number;
  l?: number; low?: number;
  c?: number; close?: number;
  v?: number; volume?: number;
}

function getApiKey(): string | null {
  return process.env.LSE_API_KEY || null;
}

/** LSE's vault API expects plain YYYY-MM-DD dates, not full ISO timestamps. */
function toLseDate(value: string): string {
  // Already in YYYY-MM-DD form — leave as-is.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value; // let LSE surface the error if truly invalid
  return d.toISOString().slice(0, 10);
}

/**
 * Parse a string timestamp (e.g. "2026-01-01 09:30:00.000000") into
 * epoch seconds (UTC).  Returns 0 on failure so the row gets filtered.
 */
function parseStringTimestamp(value: string): number {
  // Replace the space between date and time with "T" for ISO parsing,
  // trim microsecond precision that Date() can't handle, and assume UTC
  // when no timezone suffix is present.
  let iso = value.trim();
  // "2026-01-01 09:30:00.000000" → "2026-01-01T09:30:00.000000"
  iso = iso.replace(' ', 'T');
  // Truncate microseconds → milliseconds (keep max 3 decimal digits)
  iso = iso.replace(/(\.\d{3})\d*$/, '$1');
  // Append Z if no timezone indicator present
  if (!/[Zz+\-]\d{0,4}$/.test(iso)) iso += 'Z';
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? 0 : Math.floor(ms / 1000);
}

/**
 * Resolve an internal symbol (e.g. "NQ") to the provider symbol
 * that LSE's API recognizes (e.g. "NQ.F").  Falls through to the
 * original symbol if no mapping exists.  Also handles the reverse:
 * if someone already passes "NQ.F", don't double-map it.
 */
function resolveProviderSymbol(symbol: string): string {
  // Direct match on internal symbol → providerSymbol
  const byInternal = INSTRUMENTS.find(
    (i) => i.symbol.toUpperCase() === symbol.toUpperCase(),
  );
  if (byInternal?.providerSymbol) return byInternal.providerSymbol;

  // Already a provider symbol? (e.g. caller passed "NQ.F" directly)
  const byProvider = INSTRUMENTS.find(
    (i) => i.providerSymbol?.toUpperCase() === symbol.toUpperCase(),
  );
  if (byProvider) return symbol; // already correct

  // No mapping found — pass through as-is
  return symbol;
}

const SYMBOL_RE = /^[A-Za-z0-9._-]{1,20}$/;
const TIMEFRAME_RE = /^\d{1,3}(s|m|h|d|w)$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}([T ][0-9:.]{0,20}(Z|[+-]\d{2}:?\d{2})?)?$/;

export async function GET(req: NextRequest) {
  // The upstream data plan is paid for — only signed-in users may spend it.
  const me = sessionEmail(req);
  if (!me) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  if (rateLimited(`market:${me}`, 120, 60_000)) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const apiKey = getApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: 'LSE_API_KEY not configured. Add it to .env.local.' },
      { status: 503 },
    );
  }

  const { searchParams } = req.nextUrl;
  const rawSymbol = searchParams.get('symbol');
  const timeframe = searchParams.get('timeframe') || '1m';
  const start = searchParams.get('start');
  const end = searchParams.get('end');

  if (!rawSymbol) {
    return NextResponse.json({ error: 'Missing required parameter: symbol' }, { status: 400 });
  }

  if (!SYMBOL_RE.test(rawSymbol) || !TIMEFRAME_RE.test(timeframe) || (start && !DATE_RE.test(start)) || (end && !DATE_RE.test(end))) {
    return NextResponse.json({ error: 'Invalid symbol, timeframe or date.' }, { status: 400 });
  }

  // Resolve to LSE provider symbol (NQ → NQ.F, ES → ES.F, etc.)
  const symbol = resolveProviderSymbol(rawSymbol);

  try {
    // Precise requested window (epoch seconds) — used to slice the final
    // result down to exactly what the session asked for. LSE's vault API
    // only understands whole calendar dates, so the fetch below has to be
    // widened to whole days; without this final slice you'd either get a
    // degenerate (often empty/near-empty) window when start/end fall on the
    // same day, or a full day of extra candles outside the requested range.
    const startEpoch = start ? Math.floor(Date.parse(start) / 1000) : null;
    const endEpoch = end ? Math.floor(Date.parse(end) / 1000) : null;

    // Build LSE vault URL using whole-day bounds. If start/end land on the
    // same calendar day (the normal case for an intraday session), push the
    // fetch end date one day later so LSE doesn't see start === end and
    // collapse the range to nothing.
    const params = new URLSearchParams({ symbol, timeframe, limit: String(MAX_ROWS) });
    if (start) {
      const fetchStartDate = toLseDate(start);
      params.set('start', fetchStartDate);
      if (end) {
        let fetchEndDate = toLseDate(end);
        if (fetchEndDate === fetchStartDate) {
          const d = new Date(fetchEndDate + 'T00:00:00Z');
          d.setUTCDate(d.getUTCDate() + 1);
          fetchEndDate = d.toISOString().slice(0, 10);
        }
        params.set('end', fetchEndDate);
      }
    } else if (end) {
      params.set('end', toLseDate(end));
    }

    const url = `${LSE_BASE}/candles?${params}`;
    const lseRes = await fetch(url, {
      headers: { 'x-api-key': apiKey },
      cache: 'no-store',
    });

    if (!lseRes.ok) {
      // Never forward the provider's raw error body to the browser (can contain account / quota details).
      console.error(`[market-data] LSE responded ${lseRes.status}`);
      return NextResponse.json(
        { error: `Market data provider error (${lseRes.status}).` },
        { status: lseRes.status >= 500 ? 502 : lseRes.status === 429 ? 429 : 502 },
      );
    }

    const raw = await lseRes.json();

    // Normalize: LSE may return an array directly or under a key
    const rawList = Array.isArray(raw) ? raw : (raw.data || raw.candles || raw.results);
    const rows: LseCandle[] = Array.isArray(rawList) ? rawList : [];

    const candles = rows.map((r: LseCandle) => {
      /* -------------------------------------------------------------- */
      /*  Timestamp resolution — priority order:                         */
      /*  1. `ts`  (string, LSE's real field: "2026-01-01 09:30:00...")  */
      /*  2. `date` / `datetime` (string alternatives)                  */
      /*  3. `t` / `time` / `timestamp` (numeric epoch, seconds or ms)  */
      /* -------------------------------------------------------------- */
      let timeSec = 0;

      // String timestamp fields (LSE's actual format)
      const strTs = r.ts ?? r.datetime ?? r.date;
      if (strTs && typeof strTs === 'string') {
        timeSec = parseStringTimestamp(strTs);
      }

      // Numeric fallback — only if string parsing didn't yield a result
      if (timeSec === 0) {
        const numTs = r.t ?? r.time ?? r.timestamp ?? 0;
        // Normalize to epoch seconds (lightweight-charts expects seconds)
        timeSec = typeof numTs === 'number' && numTs > 0
          ? (numTs > 1e12 ? Math.floor(numTs / 1000) : numTs)
          : 0;
      }

      return {
        time: timeSec,
        open: r.o ?? r.open ?? 0,
        high: r.h ?? r.high ?? 0,
        low: r.l ?? r.low ?? 0,
        close: r.c ?? r.close ?? 0,
        volume: r.v ?? r.volume ?? 0,
      };
    }).filter(c => c.time > 0 && c.open > 0);

    // Sort chronologically
    candles.sort((a: { time: number }, b: { time: number }) => a.time - b.time);

    // Slice down to exactly the requested window. This is what actually
    // guarantees a continuous, gap-free run of candles for the session
    // instead of a whole day (or a degenerate empty range).
    const sliced = candles.filter((c) => {
      if (startEpoch !== null && c.time < startEpoch) return false;
      if (endEpoch !== null && c.time > endEpoch) return false;
      return true;
    });

    return NextResponse.json({ candles: sliced, count: sliced.length });
  } catch (err) {
    console.error('[market-data] fetch failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Failed to fetch market data.' }, { status: 502 });
  }
}
