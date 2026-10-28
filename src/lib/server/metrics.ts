/* SERVER-ONLY module — import exclusively from route handlers. */

/* ------------------------------------------------------------------ */
/*  Competition metrics — aggregate, friendship-gated, privacy-safe.   */
/*  Deterministic process score from lib/competence.ts. No P&L-only    */
/*  ranking; no private data exposure.                                 */
/* ------------------------------------------------------------------ */

import { getGoogleConfig } from "./google-config";
import { accountRefreshToken, getAccount } from "./accounts";
import { ensureAppFolders, readJournalDoc, refreshAccessTokenDetailed } from "./drive";
import { computeStats } from "../stats";
import { processScore } from "../competence";
import type { JournalEntry, TradePlan } from "../types";

export interface PublicMetrics {
  handle: string;
  displayName: string;
  trades: number;
  totalPnl: number;
  returnPct: number;
  winRate: number | null;
  processScore: number;
  challengeProgressPct: number | null;
  edgePoints: number;
}

/**
 * High-speed server caches for Friend Metrics:
 * 1. `tokenCache`: caches each friend's OAuth access token until 60s before expiry (avoids OAuth POST on every poll).
 * 2. `foldersCache`: caches each friend's Drive folder IDs (avoids 3 Drive folder lookups per friend).
 * 3. `metricsCache`: serves computed `PublicMetrics` for 45s fresh and up to 5m stale-while-revalidate,
 *    with single-flight deduplication (`inflightMetrics`) so concurrent requests never duplicate Drive reads.
 */
const METRICS_FRESH_MS = 45_000;
const METRICS_STALE_MS = 5 * 60_000;

type ResolvedFolders = NonNullable<Awaited<ReturnType<typeof ensureAppFolders>>>;

const tokenCache = new Map<string, { token: string; expiresAt: number }>();
const foldersCache = new Map<string, ResolvedFolders>();
const metricsCache = new Map<string, { at: number; data: PublicMetrics }>();
const inflightMetrics = new Map<string, Promise<PublicMetrics | null>>();

export function invalidateMetricsCache(email?: string): void {
  if (email) {
    metricsCache.delete(email.toLowerCase());
  } else {
    metricsCache.clear();
  }
}

async function computeFreshMetrics(email: string): Promise<PublicMetrics | null> {
  const key = email.toLowerCase();
  const config = getGoogleConfig();
  if (!config) return null;
  const account = await getAccount(key);
  if (!account) return null;

  const fallbackName = account.name?.trim().split(" ")[0] || account.handle || "Trader";
  const baseMetrics: PublicMetrics = {
    handle: account.handle,
    displayName: fallbackName,
    trades: 0,
    totalPnl: 0,
    returnPct: 0,
    winRate: null,
    processScore: 0,
    challengeProgressPct: null,
    edgePoints: account.edgePoints ?? 0,
  };

  if (!account.encRefreshToken || !account.folderId) {
    return baseMetrics;
  }

  const secret = process.env.GOOGLE_TOKEN_SECRET ?? config.clientSecret;
  const refreshToken = accountRefreshToken(account, secret);
  if (!refreshToken) return baseMetrics;

  let accessToken: string | null = null;
  const cachedTok = tokenCache.get(key);
  if (cachedTok && cachedTok.expiresAt > Date.now() + 60_000) {
    accessToken = cachedTok.token;
  } else {
    const refreshed = await refreshAccessTokenDetailed(refreshToken, config.clientId, config.clientSecret);
    if (refreshed.ok && refreshed.accessToken) {
      accessToken = refreshed.accessToken;
      tokenCache.set(key, {
        token: refreshed.accessToken,
        expiresAt: Date.now() + (refreshed.expiresIn ?? 3600) * 1000,
      });
    }
  }
  if (!accessToken) return baseMetrics;

  let folders = foldersCache.get(key) ?? null;
  if (!folders) {
    folders = await ensureAppFolders(accessToken);
    if (folders) foldersCache.set(key, folders);
  }
  if (!folders) return baseMetrics;

  const doc = (await readJournalDoc(accessToken, folders)) as {
    entries?: JournalEntry[];
    settings?: { startingEquity?: number };
    plans?: TradePlan[];
  } | null;

  const entries = doc?.entries ?? [];
  const plans = doc?.plans ?? [];
  const startingEquity = doc?.settings?.startingEquity ?? 10000;

  const stats = computeStats(entries, {
    traderName: account.name,
    startingEquity,
    targetEquity: startingEquity * 2,
    maxDrawdown: 1000,
    currency: "USD",
  });
  const proc = processScore(entries, plans);

  const result: PublicMetrics = {
    handle: account.handle,
    displayName: fallbackName,
    trades: stats.tradingDays,
    totalPnl: Math.round(stats.totalPnl),
    returnPct: startingEquity > 0 ? Math.round((stats.totalPnl / startingEquity) * 1000) / 10 : 0,
    winRate: entries.length > 0 ? Math.round(stats.winRate * 100) : null,
    processScore: proc.score,
    challengeProgressPct: null,
    edgePoints: account.edgePoints ?? 0,
  };

  metricsCache.set(key, { at: Date.now(), data: result });
  return result;
}

function fetchSingleFlight(email: string): Promise<PublicMetrics | null> {
  const key = email.toLowerCase();
  const existing = inflightMetrics.get(key);
  if (existing) return existing;
  const promise = computeFreshMetrics(key)
    .catch(() => metricsCache.get(key)?.data ?? null)
    .finally(() => {
      inflightMetrics.delete(key);
    });
  inflightMetrics.set(key, promise);
  return promise;
}

export async function publicMetricsFor(email: string): Promise<PublicMetrics | null> {
  const key = email.toLowerCase();
  const cached = metricsCache.get(key);
  const age = cached ? Date.now() - cached.at : Number.POSITIVE_INFINITY;

  if (cached && age < METRICS_FRESH_MS) {
    return cached.data;
  }
  if (cached && age < METRICS_STALE_MS) {
    // Serve immediately and revalidate in the background so Friends never blocks on Drive
    void fetchSingleFlight(key);
    return cached.data;
  }
  return fetchSingleFlight(key);
}
