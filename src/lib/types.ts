/* ------------------------------------------------------------------ */
/*  Domain model — single source of truth for journal data             */
/* ------------------------------------------------------------------ */

export type TradeDirection = "long" | "short";

/** Post-trade reflection attached to an entry. All fields optional except stamps. */
export interface TradeReflection {
  wentWell?: string;
  wentPoorly?: string;
  /** What caused this outcome — the trigger behind the result. */
  cause?: string;
  /** null = not answered; true/false = explicit answer */
  followedSetup: boolean | null;
  followedRisk: boolean | null;
  /** What to improve / do differently next time. */
  lesson?: string;
  updatedAt: number;
}

/** A day without trading, explicitly recorded (part of the discipline system). */
export interface NoTradeLog {
  date: string; // YYYY-MM-DD
  reason?: string;
  createdAt: number;
}

/** Metadata for an uploaded screenshot. Binary lives in the image store. */
export interface EntryImage {
  id: string;
  name: string;
  width: number;
  height: number;
  size: number; // bytes
}

export interface JournalEntry {
  id: string;
  /** Local calendar date, `YYYY-MM-DD`. */
  date: string;
  /** Net profit & loss for the day in account currency. */
  pnl: number;
  /** Realized risk-to-reward multiple, e.g. 2.5 = 2.5R. Null when not tracked. */
  rr: number | null;
  instrument: string;
  direction: TradeDirection | null;
  setup: string;
  notes: string;
  images: EntryImage[]; // max MAX_IMAGES_PER_ENTRY
  /** Structured post-trade reflection (optional; older entries may not have one). */
  reflection?: TradeReflection;
  createdAt: number;
  updatedAt: number;
}

export interface JournalSettings {
  traderName: string;
  startingEquity: number;
  targetEquity: number;
  maxDrawdown: number;
  currency: CurrencyCode;
}

export const CURRENCIES = ["USD", "EUR", "GBP", "INR", "JPY"] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  USD: "$",
  EUR: "\u20AC",
  GBP: "\u00A3",
  INR: "\u20B9",
  JPY: "\u00A5",
};

export const MAX_IMAGES_PER_ENTRY = 2;

export function defaultSettings(): JournalSettings {
  return {
    traderName: "",
    startingEquity: 10000,
    targetEquity: 20000,
    maxDrawdown: 2000,
    currency: "USD",
  };
}

/* ------------------------------------------------------------------ */
/*  Derived analytics                                                  */
/* ------------------------------------------------------------------ */

export interface DayResult {
  date: string;
  pnl: number;
  trades: number;
}

export interface EquityPoint {
  date: string;
  equity: number;
  pnl: number;
}

export interface JournalStats {
  tradeCount: number;
  tradingDays: number;
  totalPnl: number;

  winningDays: number;
  losingDays: number;
  breakEvenDays: number;
  winRate: number; // 0..1 across days with a non-zero result

  avgDayPnl: number;
  bestDay: DayResult | null;
  worstDay: DayResult | null;
  avgRR: number | null;
  rrCoverage: number; // fraction of entries with R:R recorded

  daily: DayResult[]; // ascending by date
  equityCurve: EquityPoint[];

  currentEquity: number;
  peakEquity: number;
  drawdown: number; // absolute currency from peak
  drawdownPct: number;
  drawdownBudgetUsed: number; // fraction of maxDrawdown consumed

  remainingToTarget: number;
  targetProgress: number; // 0..1
}
