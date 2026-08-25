import { NextResponse } from "next/server";
import { getGoogleConfig } from "@/lib/server/google-config";
import { readCookie } from "@/lib/server/session";
import { APP_SESSION_COOKIE, openAppSession } from "@/lib/server/session";
import { accountRefreshToken, getAccount, listAccounts, type EdgeBookAccount } from "@/lib/server/accounts";
import { fetchAccessToken, readJournalDoc } from "@/lib/server/drive";
import { computeStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

/**
 * Ranking — aggregate, intentionally-public metrics only.
 *
 * Privacy: journal text, reflections, notes, screenshots and private
 * identifiers are NEVER returned. Only aggregate statistics per account,
 * with a display handle (first name + masked email).
 *
 * Ranking quality: sorted by a process-weighted score (consistency +
 * win rate + expectancy), not raw P&L.
 */
export async function GET(request: Request) {
  const config = getGoogleConfig();
  if (!config) return NextResponse.json({ error: "google_not_configured" }, { status: 503 });

  // Require an authenticated Edge Book user to view rankings.
  const sessionCookie = readCookie(request, APP_SESSION_COOKIE);
  const viewer = config && sessionCookie ? openAppSession(sessionCookie, config.tokenSecret) : null;
  if (!viewer) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });

  const accounts: import("@/lib/server/accounts").EdgeBookAccount[] = listAccounts().filter((a) => a.encRefreshToken);
  const rows: {
    handle: string;
    isViewer: boolean;
    trades: number;
    winRate: number | null;
    profitFactor: number | null;
    expectancy: number | null;
    consistency: number | null;
    totalPnl: number;
    score: number;
  }[] = [];

  for (const account of accounts) {
    try {
      const secret = process.env.GOOGLE_TOKEN_SECRET ?? config.clientSecret;
      const refreshToken = accountRefreshToken(account, secret);
      if (!refreshToken) continue;
      const accessToken = await fetchAccessToken(refreshToken, config.clientId, config.clientSecret);
      if (!accessToken) continue;
      const doc = (await readJournalDoc(accessToken, {
        root: account.folderId ?? "",
        trades: account.folderId ?? "",
        journals: account.folderId ?? "",
        screenshots: account.folderId ?? "",
        challenges: account.folderId ?? "",
        exports: account.folderId ?? "",
      })) as { entries?: { id: string; pnl: number; date: string; reviewStatus?: string }[]; dayLogs?: unknown[] } | null;
      const entries = doc?.entries ?? [];
      if (entries.length < 3) continue; // too little data — skip, don't fabricate

      const stats = computeStats(
        entries.map((e, i) => ({ ...e, rr: null, instrument: "x", direction: null, setup: "", notes: "", images: [], createdAt: i, updatedAt: i, reviewStatus: undefined })) as import("@/lib/types").JournalEntry[],
        { traderName: "", startingEquity: 10000, targetEquity: 20000, maxDrawdown: 1000, currency: "USD" },
      );

      const wins = stats.winningDays;
      const losses = stats.losingDays;
      const winRate = stats.winRate;
      const grossWin = stats.daily.filter((d) => d.pnl > 0).reduce((s, d) => s + d.pnl, 0);
      const grossLoss = Math.abs(stats.daily.filter((d) => d.pnl < 0).reduce((s, d) => s + d.pnl, 0));
      const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 2 : null;
      const expectancy = stats.tradingDays > 0 ? stats.avgDayPnl : null;
      // Consistency: share of trading days that were not large losses relative to avg win
      const consistency = stats.tradingDays > 0 ? Math.max(0, 1 - stats.drawdownPct * 2) : null;

      // Process-weighted score: consistency 40% + win rate 30% + expectancy 30% (normalized, clamped)
      const expectancyScore = expectancy != null ? Math.max(0, Math.min(1, 0.5 + expectancy / 200)) : 0.5;
      const pfScore = profitFactor != null ? Math.max(0, Math.min(1, profitFactor / 3)) : 0.5;
      const score = Math.round(
        (0.4 * (consistency ?? 0) + 0.3 * winRate + 0.3 * ((pfScore + expectancyScore) / 2)) * 100,
      );

      const [emailName] = account.email.split("@");
      const first = account.name?.split(" ")[0] || emailName;
      rows.push({
        handle: `${first} · ${emailName.slice(0, 2)}•••`,
        isViewer: account.email === viewer.email,
        trades: stats.tradingDays,
        winRate: Math.round(winRate * 100),
        profitFactor: profitFactor != null ? Math.round(profitFactor * 100) / 100 : null,
        expectancy: expectancy != null ? Math.round(expectancy) : null,
        consistency: consistency != null ? Math.round(consistency * 100) : null,
        totalPnl: Math.round(stats.totalPnl),
        score,
      });
    } catch {
      // Skip accounts that can't be read — never leak errors per user.
    }
  }

  rows.sort((x, y) => y.score - x.score);
  return NextResponse.json({ rows });
}

