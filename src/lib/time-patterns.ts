import type { JournalEntry } from "./types";

/* ------------------------------------------------------------------ */
/*  Time-pattern analytics — deterministic window grouping             */
/*                                                                      */
/*  Groups trades into NY-time entry windows and computes per-window    */
/*  stats: count, win rate, avg R, total R, avg P&L, max loss.          */
/*  Sample-size safeguards: windows with < minTrades are flagged.       */
/* ------------------------------------------------------------------ */

export interface TimeWindow {
  label: string;
  startMin: number;
  endMin: number;
  trades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  avgR: number | null;
  medianR: number | null;
  totalR: number | null;
  avgPnl: number;
  totalPnl: number;
  maxLoss: number;
  avgHoldMin: number | null;
}

export interface TimePatternResult {
  windows: TimeWindow[];
  bestWinRate: TimeWindow | null;
  bestAvgR: TimeWindow | null;
  worstWinRate: TimeWindow | null;
  totalSample: number;
  /** True when the data is too sparse for confident conclusions. */
  sparse: boolean;
}

function toMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 100) / 100 : sorted[mid];
}

/** Generate window boundaries based on data density. */
function generateWindows(entries: JournalEntry[]): { label: string; startMin: number; endMin: number }[] {
  const times = entries
    .map((e) => toMinutes(e.entryTime ?? ""))
    .filter((t): t is number => t != null)
    .sort((a, b) => a - b);

  if (times.length === 0) return [];

  // Default 15-minute windows covering 9:00–12:00 EST (540–720 minutes)
  const windows: { label: string; startMin: number; endMin: number }[] = [];
  const start = Math.max(540, Math.floor((times[0] - 15) / 15) * 15);
  const end = Math.min(720, Math.ceil((times[times.length - 1] + 15) / 15) * 15);

  for (let t = start; t < end; t += 15) {
    const h1 = Math.floor(t / 60);
    const m1 = t % 60;
    const h2 = Math.floor((t + 15) / 60);
    const m2 = (t + 15) % 60;
    const fmt = (h: number, m: number) => `${h}:${String(m).padStart(2, "0")}`;
    windows.push({ label: `${fmt(h1, m1)}–${fmt(h2, m2)}`, startMin: t, endMin: t + 15 });
  }

  return windows;
}

export function timeWindowAnalytics(
  entries: JournalEntry[],
  opts?: { minTradesPerWindow?: number },
): TimePatternResult {
  const minTrades = opts?.minTradesPerWindow ?? 2;
  const windows = generateWindows(entries);

  const results: TimeWindow[] = [];

  for (const w of windows) {
    const inWindow = entries.filter((e) => {
      const t = toMinutes(e.entryTime ?? "");
      return t != null && t >= w.startMin && t < w.endMin;
    });

    if (inWindow.length === 0) continue;

    const wins = inWindow.filter((e) => e.pnl > 0).length;
    const losses = inWindow.filter((e) => e.pnl < 0).length;
    const decided = wins + losses;
    const rrValues = inWindow.filter((e) => e.rr != null).map((e) => e.rr!);
    const pnlValues = inWindow.map((e) => e.pnl);
    const holdValues = inWindow
      .map((e) => {
        if (!e.entryTime || !e.exitTime) return null;
        const a = toMinutes(e.entryTime);
        const b = toMinutes(e.exitTime);
        if (a == null || b == null) return null;
        return Math.max(0, b - a);
      })
      .filter((v): v is number => v != null);

    results.push({
      label: w.label,
      startMin: w.startMin,
      endMin: w.endMin,
      trades: inWindow.length,
      wins,
      losses,
      winRate: decided > 0 ? Math.round((wins / decided) * 100) : null,
      avgR: rrValues.length > 0 ? Math.round((rrValues.reduce((s, r) => s + r, 0) / rrValues.length) * 100) / 100 : null,
      medianR: median(rrValues),
      totalR: rrValues.length > 0 ? Math.round(rrValues.reduce((s, r) => s + r, 0) * 100) / 100 : null,
      avgPnl: Math.round(pnlValues.reduce((s, p) => s + p, 0) / inWindow.length),
      totalPnl: Math.round(pnlValues.reduce((s, p) => s + p, 0)),
      maxLoss: Math.min(0, ...pnlValues),
      avgHoldMin: holdValues.length > 0 ? Math.round(holdValues.reduce((s, h) => s + h, 0) / holdValues.length) : null,
    });
  }

  // Best/worst — only among windows with sufficient sample size
  const qualified = results.filter((w) => w.trades >= minTrades);
  const byWinRate = [...qualified].filter((w) => w.winRate != null).sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0));
  const byAvgR = [...qualified].filter((w) => w.avgR != null).sort((a, b) => (b.avgR ?? 0) - (a.avgR ?? 0));

  return {
    windows: results,
    bestWinRate: byWinRate[0] ?? null,
    bestAvgR: byAvgR[0] ?? null,
    worstWinRate: byWinRate.length > 1 ? byWinRate[byWinRate.length - 1] : null,
    totalSample: entries.filter((e) => e.entryTime).length,
    sparse: entries.filter((e) => e.entryTime).length < 5,
  };
}
