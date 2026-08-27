import type { JournalEntry, PlaybookSetup } from "./types";

/* ------------------------------------------------------------------ */
/*  Setup-level statistics — one canonical calculation shared by the   */
/*  Playbook (Trading Lab), the Journal setup folders and MINATO.      */
/* ------------------------------------------------------------------ */

export interface SetupStats {
  trades: number;
  totalPnl: number;
  winRate: number | null; // across decided trades
  avgR: number | null;
  bestTrade: number | null;
  worstTrade: number | null;
}

/** Trades belonging to a setup — matched by setupId first, then by name (legacy). */
export function tradesForSetup(setup: Pick<PlaybookSetup, "id" | "name">, entries: JournalEntry[]): JournalEntry[] {
  const name = setup.name.toLowerCase();
  return entries.filter(
    (e) => e.setupId === setup.id || (!!e.setup && !e.setupId && e.setup.toLowerCase() === name),
  );
}

export function setupStats(trades: JournalEntry[]): SetupStats {
  const wins = trades.filter((e) => e.pnl > 0).length;
  const losses = trades.filter((e) => e.pnl < 0).length;
  const decided = wins + losses;
  const rrEntries = trades.filter((e) => e.rr != null && Number.isFinite(e.rr));
  return {
    trades: trades.length,
    totalPnl: trades.reduce((s, e) => s + e.pnl, 0),
    winRate: decided > 0 ? wins / decided : null,
    avgR:
      rrEntries.length > 0
        ? rrEntries.reduce((s, e) => s + (e.rr ?? 0), 0) / rrEntries.length
        : null,
    bestTrade: trades.length > 0 ? Math.max(...trades.map((e) => e.pnl)) : null,
    worstTrade: trades.length > 0 ? Math.min(...trades.map((e) => e.pnl)) : null,
  };
}
