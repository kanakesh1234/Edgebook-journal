/* ------------------------------------------------------------------ */
/*  Backtesting domain model — PHASE 1                                 */
/*                                                                      */
/*  Interfaces only. No engine, no data fetching, no persistence yet —  */
/*  those land in later phases. This file is the shared contract that  */
/*  the setup screen, and eventually the engine/chart/results screens, */
/*  all build against.                                                 */
/* ------------------------------------------------------------------ */

import type { CurrencyCode } from "../types";

/* --------------------------- Sessions & timezone --------------------------- */

/**
 * Built-in trading sessions. "custom" lets the user define their own
 * start/end window instead of a named session.
 *
 * All session math is IANA-timezone based (see sessions.ts) — never a
 * hard-coded UTC offset — so DST transitions resolve automatically.
 */
export type SessionId = "new-york" | "london" | "asia" | "custom";

export interface TradingSession {
  id: SessionId;
  label: string;
  /** IANA timezone the session's wall-clock hours are defined in. */
  timezone: string;
  /** Wall-clock start, "HH:mm", in `timezone`. Absent for "custom". */
  startTime?: string;
  /** Wall-clock end, "HH:mm", in `timezone`. Absent for "custom". */
  endTime?: string;
}

/* ------------------------------ Instruments ------------------------------ */

export type AssetClass = "futures"; // extend later: "forex" | "stock" | "crypto" | "option"

/**
 * Contract economics. The engine (Phase 6/11) reads P&L math from here —
 * never hard-coded per-symbol in the UI or execution layer.
 */
export interface InstrumentSpec {
  symbol: string;
  name: string;
  exchange: string;
  assetClass: AssetClass;
  /** Minimum price increment, e.g. 0.25 for MNQ. */
  tickSize: number;
  /** Dollar value of one tick move, e.g. $0.50 for MNQ. */
  tickValue: number;
  /** Dollar value of one full point move (tickValue / tickSize * tickSize² shortcut: point value). */
  pointValue: number;
  currency: CurrencyCode;
  /** Round-turn commission per contract, in `currency`. */
  commissionPerContract: number;
  /** Exchange/regulatory fees per contract, in `currency`. */
  feesPerContract: number;
  /** IANA timezone the exchange's trading hours are quoted in. */
  timezone: string;
  /** Data-source symbol this maps to (e.g. LSE catalog symbol), resolved in Phase 2. */
  providerSymbol?: string;
}

/* ------------------------------ Account setup ------------------------------ */

export type AccountType = "personal" | "prop";

/** STATIC = measured from starting balance. TRAILING = high-water-mark walk. */
export type DrawdownMode = "static" | "trailing";

export interface PropAccountRules {
  maxDrawdown: number;
  drawdownMode: DrawdownMode;
  dailyLossLimit: number | null;
  maxContracts: number | null;
}

/* -------------------------------- Timeframes -------------------------------- */

export const TIMEFRAMES = [
  "1s", "5s", "10s", "15s", "30s",
  "1m", "2m", "3m", "5m", "10m", "15m", "30m",
  "1h", "2h", "4h",
  "1D",
] as const;

export type Timeframe = (typeof TIMEFRAMES)[number];

/* -------------------------------- Backtest config -------------------------------- */

/** What the setup screen collects before a backtest can start. */
export interface BacktestConfig {
  instrumentSymbol: string;
  sessionId: SessionId;
  /** Only used when sessionId === "custom". Wall-clock "HH:mm" in `customTimezone`. */
  customSession?: { startTime: string; endTime: string; timezone: string };
  accountType: AccountType;
  startingBalance: number;
  currency: CurrencyCode;
  propRules?: PropAccountRules;
  /** Backtest period — stored as UTC ISO instants, entered by the user in the instrument's timezone. */
  periodStartUtc: string;
  periodEndUtc: string;
  timeframe: Timeframe;
}

/* -------------------------------- Backtest state -------------------------------- */

export type BacktestStatus = "ready" | "running" | "paused" | "completed" | "terminated" | "breached";

export interface BacktestState {
  id: string;
  userId: string;
  config: BacktestConfig;
  /** Current position of the replay clock, UTC ISO instant. Null until started. */
  currentReplayTimeUtc: string | null;
  status: BacktestStatus;
  /** Populated only when status is "terminated" or "breached". */
  terminationReason?: string;
  createdAt: number;
  updatedAt: number;
}

/* -------------------------------- Orders & trades -------------------------------- */
/* Defined now so later phases (engine, results, CSV export) share one shape   */
/* from the start — not created/modified by Phase 1 itself.                    */

export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit" | "stop" | "stop-limit";
export type OrderStatus = "pending" | "filled" | "cancelled" | "rejected";

export interface BacktestOrder {
  orderId: string;
  backtestId: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  submittedAt: string; // UTC ISO
  filledAt: string | null;
  requestedPrice: number | null; // limit/stop trigger price, null for market
  filledPrice: number | null;
  stopPrice: number | null;
  limitPrice: number | null;
  status: OrderStatus;
  commission: number;
  fees: number;
  slippage: number;
}

export interface BacktestTrade {
  tradeId: string;
  orderId: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  entryTime: string; // UTC ISO
  entryPrice: number;
  exitTime: string | null;
  exitPrice: number | null;
  entryType: OrderType;
  exitType: OrderType | null;
  stopLoss: number | null;
  takeProfit: number | null;
  grossPnl: number;
  commission: number;
  fees: number;
  slippage: number;
  netPnl: number;
  points: number;
  ticks: number;
  durationSeconds: number | null;
  balanceAfter: number;
  equityAfter: number;
  drawdownAfter: number;
  session: SessionId;
  timezone: string;
}
