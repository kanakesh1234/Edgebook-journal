import type { DrawdownMode, TrailingBasis } from "./types";

/* ------------------------------------------------------------------ */
/*  Drawdown model — the ONE place the floor / cushion maths lives.    */
/*                                                                      */
/*  STATIC:   floor = startingBalance − maxDrawdown. Never moves.       */
/*  DYNAMIC:  floor = trailing peak − maxDrawdown. Only moves UP.       */
/*    EOD:    peak = highest end-of-day balance (CLOSED days only).     */
/*    LIVE:   peak = highest balance, updated after every trade.        */
/*  Cushion = currentEquity − floor (always, for every model).          */
/*                                                                      */
/*  Used by challengeProgress (challenge cards, nav) AND computeStats   */
/*  (Home, Practise, MINATO) so every screen shows the same numbers.    */
/* ------------------------------------------------------------------ */

export interface DrawdownTrade {
  date: string; // YYYY-MM-DD
  pnl: number;
  createdAt?: number;
}

export interface DrawdownInput {
  startingBalance: number;
  maxDrawdown: number;
  mode: DrawdownMode;
  /** Dynamic only. Absent = "live" (original behaviour). */
  basis?: TrailingBasis | null;
  /** Optional hard minimum for the trailing floor. */
  floor?: number | null;
  trades: DrawdownTrade[];
  /** Today's date key; a day only counts for EOD once it is before this. */
  asOf?: string;
}

export interface DrawdownResult {
  currentEquity: number;
  livePeak: number;
  eodPeak: number;
  trailingBasis: TrailingBasis | null;
  /** The peak the floor trails from (static: starting balance). */
  drawdownPeak: number;
  currentDrawdown: number;
  /** Current floor — the equity level that must not be breached. */
  threshold: number;
  /** currentEquity − threshold. Negative = breached. */
  cushion: number;
  /** max(0, cushion); 0 when no max drawdown is configured. */
  remaining: number;
  breached: boolean;
  /** 0..1 share of the drawdown allowance already spent. */
  budgetUsed: number;
  /** Worst live peak-to-trough decline seen. */
  maxObserved: number;
}

export function localDateKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function computeDrawdown(input: DrawdownInput): DrawdownResult {
  const start = input.startingBalance;
  const maxDD = input.maxDrawdown > 0 ? input.maxDrawdown : 0;
  const asOf = input.asOf ?? localDateKey();
  const trades = [...input.trades].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.createdAt ?? 0) - (b.createdAt ?? 0),
  );

  let equity = start;
  let livePeak = start;
  let eodPeak = start;
  let maxObserved = 0;
  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    equity += t.pnl;
    livePeak = Math.max(livePeak, equity);
    maxObserved = Math.max(maxObserved, livePeak - equity);
    const lastOfDay = i === trades.length - 1 || trades[i + 1].date !== t.date;
    // A day only qualifies once it has closed; today's session is still open.
    if (lastOfDay && t.date < asOf) eodPeak = Math.max(eodPeak, equity);
  }

  const dynamic = input.mode === "dynamic";
  const trailingBasis: TrailingBasis | null = dynamic ? (input.basis ?? "live") : null;
  const drawdownPeak = !dynamic ? start : trailingBasis === "eod" ? eodPeak : livePeak;
  const threshold = dynamic
    ? Math.max(input.floor ?? -Infinity, drawdownPeak - maxDD)
    : start - maxDD;
  const cushion = equity - threshold;
  const active = maxDD > 0;

  return {
    currentEquity: equity,
    livePeak,
    eodPeak,
    trailingBasis,
    drawdownPeak,
    currentDrawdown: Math.max(0, drawdownPeak - equity),
    threshold,
    cushion,
    remaining: active ? Math.max(0, cushion) : 0,
    breached: active && cushion <= 0,
    budgetUsed: active ? Math.min(1, Math.max(0, 1 - cushion / maxDD)) : 0,
    maxObserved,
  };
}
