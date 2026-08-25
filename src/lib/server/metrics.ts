/* SERVER-ONLY module — import exclusively from route handlers. */

/* ------------------------------------------------------------------ */
/*  Competition metrics — aggregate, friendship-gated, privacy-safe.   */
/*  Deterministic process score from lib/competence.ts. No P&L-only    */
/*  ranking; no private data exposure.                                 */
/* ------------------------------------------------------------------ */

import { getGoogleConfig } from "./google-config";
import { accountRefreshToken, getAccount } from "./accounts";
import { decryptToken } from "./tokens";
import { fetchAccessToken, readJournalDoc } from "./drive";
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

export async function publicMetricsFor(email: string): Promise<PublicMetrics | null> {
  const config = getGoogleConfig();
  if (!config) return null;
  const account = getAccount(email);
  if (!account?.encRefreshToken) return null;

  const secret = process.env.GOOGLE_TOKEN_SECRET ?? config.clientSecret;
  const refreshToken = accountRefreshToken(account, secret);
  if (!refreshToken) return null;
  const accessToken = await fetchAccessToken(refreshToken, config.clientId, config.clientSecret);
  if (!accessToken) return null;

  const folderId = account.folderId;
  if (!folderId) return null;
  const doc = (await readJournalDoc(accessToken, {
    root: folderId, trades: folderId, journals: folderId, screenshots: folderId, challenges: folderId, exports: folderId,
  })) as { entries?: JournalEntry[]; settings?: { startingEquity?: number }; plans?: TradePlan[] } | null;

  const entries = doc?.entries ?? [];
  const plans = doc?.plans ?? [];
  const startingEquity = doc?.settings?.startingEquity ?? 10000;

  const stats = computeStats(entries, {
    traderName: account.name, startingEquity, targetEquity: startingEquity * 2, maxDrawdown: 1000, currency: "USD",
  });
  const proc = processScore(entries, plans);

  const [emailName] = account.email.split("@");
  const displayName = account.name?.split(" ")[0] || emailName;

  return {
    handle: account.handle,
    displayName,
    trades: stats.tradingDays,
    totalPnl: Math.round(stats.totalPnl),
    returnPct: startingEquity > 0 ? Math.round((stats.totalPnl / startingEquity) * 1000) / 10 : 0,
    winRate: Math.round(stats.winRate * 100),
    processScore: proc.score,
    challengeProgressPct: null, // per-challenge progress is computed by the friends route when scoped
    edgePoints: account.edgePoints ?? 0,
  };
}
