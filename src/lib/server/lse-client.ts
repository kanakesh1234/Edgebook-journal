/* ------------------------------------------------------------------ */
/*  LSE upstream client — server-side only, no Next.js imports         */
/*                                                                      */
/*  Why this exists: opening a replay session fires a burst of candle   */
/*  requests (one per symbol, then "context bars" per symbol, doubled   */
/*  by React StrictMode in dev, and again on every Retry click). The    */
/*  vault API answers that burst with HTTP 429, and the old route       */
/*  treated the first 429 as fatal → "No data to replay".               */
/*                                                                      */
/*  This module makes that burst survivable:                            */
/*   • gate     — at most MAX_INFLIGHT requests to LSE at a time        */
/*   • retry    — 429 / 5xx / network errors are retried with backoff,  */
/*                honouring Retry-After (capped, so a serverless        */
/*                function never sleeps past its time limit)            */
/*   • memo     — identical windows are de-duplicated while in flight   */
/*                and remembered briefly, so StrictMode double-fires    */
/*                and Retry clicks don't spend more of the data plan    */
/* ------------------------------------------------------------------ */

export type UpstreamKind = 'unknown_symbol' | 'rate_limited' | 'provider';

export class UpstreamError extends Error {
  // Explicit fields (no constructor parameter properties) so the strip-only test runner can load this file.
  kind: UpstreamKind;
  status: number;
  retryAfterSec?: number;
  constructor(kind: UpstreamKind, status: number, retryAfterSec?: number) {
    super(kind);
    this.kind = kind;
    this.status = status;
    this.retryAfterSec = retryAfterSec;
  }
}

export interface ChunkRequest {
  start: string;
  end: string;
  limit: number;
}

export interface LseClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  /** Max simultaneous requests to LSE from this server instance. */
  maxInflight?: number;
  /** Total attempts per request (first try + retries). */
  maxAttempts?: number;
  /** Longest single wait between attempts, ms. */
  maxWaitMs?: number;
  /** Per-request network timeout, ms. */
  timeoutMs?: number;
  /** Random source (injectable for tests). */
  random?: () => number;
}

const DEFAULT_BASE = 'https://api.londonstrategicedge.com/vault';
const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** "5" → 5 s, HTTP-date → seconds from now, anything else → undefined. */
export function parseRetryAfter(header: string | null | undefined, nowMs = Date.now()): number | undefined {
  if (!header) return undefined;
  const t = header.trim();
  if (/^\d+(\.\d+)?$/.test(t)) return Math.max(0, Number(t));
  const when = Date.parse(t);
  return Number.isNaN(when) ? undefined : Math.max(0, (when - nowMs) / 1000);
}

export function createLseClient(opts: LseClientOptions = {}) {
  const base = opts.baseUrl ?? DEFAULT_BASE;
  const doFetch = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const sleep = opts.sleep ?? defaultSleep;
  const maxInflight = Math.max(1, opts.maxInflight ?? 2);
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 4);
  const maxWaitMs = opts.maxWaitMs ?? 4000;
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const random = opts.random ?? Math.random;

  /* ---- gate: slot hand-off so the limit can never be exceeded ---- */
  let inflight = 0;
  const waiters: Array<() => void> = [];
  const acquire = async () => {
    if (inflight < maxInflight) { inflight++; return; }
    await new Promise<void>((resolve) => waiters.push(resolve)); // slot is handed to us, inflight unchanged
  };
  const release = () => {
    const next = waiters.shift();
    if (next) next(); else inflight--;
  };

  const backoffMs = (attempt: number, retryAfterSec?: number) => {
    if (retryAfterSec !== undefined) return Math.min(maxWaitMs, Math.ceil(retryAfterSec * 1000) + 100);
    const exp = 600 * 2 ** (attempt - 1); // 600, 1200, 2400…
    return Math.min(maxWaitMs, exp + Math.floor(random() * 250));
  };

  async function once(apiKey: string, url: string): Promise<{ rows: unknown[] } | { retry: UpstreamError }> {
    await acquire();
    try {
      let res: Response;
      try {
        res = await doFetch(url, {
          headers: { 'x-api-key': apiKey },
          cache: 'no-store',
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        return { retry: new UpstreamError('provider', 0) }; // network error / timeout
      }

      if (res.ok) {
        const raw = (await res.json()) as unknown;
        const list = Array.isArray(raw)
          ? raw
          : ((raw as { data?: unknown; candles?: unknown; results?: unknown } | null)?.data ??
             (raw as { candles?: unknown } | null)?.candles ??
             (raw as { results?: unknown } | null)?.results);
        return { rows: Array.isArray(list) ? list : [] };
      }

      // Status only — never log or forward the provider body (may hold account/quota details).
      console.error(`[market-data] LSE ${res.status} for ${url.replace(/\?.*$/, '')}`);
      if (res.status === 400 || res.status === 404 || res.status === 422) throw new UpstreamError('unknown_symbol', res.status);
      if (res.status === 429) {
        return { retry: new UpstreamError('rate_limited', 429, parseRetryAfter(res.headers.get('retry-after'))) };
      }
      if (res.status >= 500) return { retry: new UpstreamError('provider', res.status) };
      throw new UpstreamError('provider', res.status); // 401/403/other 4xx: retrying won't help
    } finally {
      release();
    }
  }

  async function fetchChunk(apiKey: string, symbol: string, timeframe: string, chunk: ChunkRequest): Promise<unknown[]> {
    const params = new URLSearchParams({ symbol, timeframe, start: chunk.start, end: chunk.end, limit: String(chunk.limit) });
    const url = `${base}/candles?${params}`;
    let last: UpstreamError | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const r = await once(apiKey, url);
      if ('rows' in r) return r.rows;
      last = r.retry;
      if (attempt < maxAttempts) await sleep(backoffMs(attempt, last.retryAfterSec)); // slot is NOT held while waiting
    }
    throw last ?? new UpstreamError('provider', 0);
  }

  return { fetchChunk };
}

/* ------------------------------------------------------------------ */
/*  Memo: in-flight de-dupe + short-lived result cache                  */
/* ------------------------------------------------------------------ */

export function createMemo<T>(ttlMs: number, maxEntries: number, now: () => number = Date.now) {
  const done = new Map<string, { at: number; value: T }>();
  const pending = new Map<string, Promise<T>>();

  /**
   * Run `fn` once per key. Concurrent callers share the same promise; successful results
   * are served for `ttlMs` when `cacheable(value)` is true. Failures are never remembered.
   */
  async function run(key: string, fn: () => Promise<T>, cacheable: (v: T) => boolean = () => true): Promise<{ value: T; hit: boolean }> {
    const hit = done.get(key);
    if (hit) {
      if (now() - hit.at < ttlMs) return { value: hit.value, hit: true };
      done.delete(key);
    }
    const existing = pending.get(key);
    if (existing) return { value: await existing, hit: true };

    const p = fn();
    pending.set(key, p);
    try {
      const value = await p;
      if (cacheable(value)) {
        done.set(key, { at: now(), value });
        while (done.size > maxEntries) done.delete(done.keys().next().value as string); // oldest first
      }
      return { value, hit: false };
    } finally {
      pending.delete(key);
    }
  }

  return { run, size: () => done.size };
}

/** Shared instances for the route. */
export const lse = createLseClient();
