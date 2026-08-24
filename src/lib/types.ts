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
  /** Trading Lab rule set. Optional so v1 payloads import cleanly. */
  rules?: RuleSet;
  /** The trader's playbook — fully defined setups with entry/exit logic. */
  playbook?: PlaybookSetup[];
  /** AI companion preferences. */
  aiPrefs?: AiPrefs;
}

/* ------------------------------------------------------------------ */
/*  Playbook — the trader's defined setups and strategy                */
/* ------------------------------------------------------------------ */

export interface PlaybookSetup {
  id: string;
  name: string;
  /** The idea behind the setup — where the edge comes from. */
  strategy?: string;
  /** Conditions that must be true before entering (one per line). */
  entryConditions?: string;
  /** What kills the trade / the idea. */
  invalidation?: string;
  /** Targets, stop placement, management rules. */
  exitRules?: string;
  minRR?: number | null;
  /** Preferred sessions, e.g. "London open", "NY". */
  sessions?: string[];
  instruments?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface AiPrefs {
  /** May the companion read journal notes/reflections when building context? */
  includeNotes: boolean;
}

/* ------------------------------------------------------------------ */
/*  Trading Lab — the trader's personal operating manual               */
/* ------------------------------------------------------------------ */

export type RuleKind = "risk" | "setup" | "behavior";

export interface RuleDef {
  /** Stable id, e.g. "risk.max-daily-loss". */
  id: string;
  kind: RuleKind;
  label: string;
  description: string;
  enabled: boolean;
  params: Record<string, number | string | string[]>;
}

export interface RuleSet {
  rules: RuleDef[];
}

export function defaultRuleSet(): RuleSet {
  return {
    rules: [
      {
        id: "risk.max-daily-loss",
        kind: "risk",
        label: "Maximum daily loss",
        description: "Stop trading for the day when the net loss reaches this amount.",
        enabled: true,
        params: { limit: 300 },
      },
      {
        id: "risk.max-trades-per-day",
        kind: "risk",
        label: "Maximum trades per day",
        description: "Overtrading is the most expensive habit there is. Cap the count.",
        enabled: true,
        params: { maxTrades: 5 },
      },
      {
        id: "risk.max-consecutive-losses",
        kind: "risk",
        label: "Consecutive-loss stop",
        description: "After this many losing days in a row, step away and review.",
        enabled: true,
        params: { max: 3 },
      },
      {
        id: "risk.min-rr",
        kind: "risk",
        label: "Minimum R:R",
        description: "Trades recorded below this R multiple break the plan (checked when R is tracked).",
        enabled: false,
        params: { min: 2 },
      },
      {
        id: "setup.allowed-instruments",
        kind: "setup",
        label: "Allowed instruments",
        description: "Only trade these symbols. Leave empty to allow anything.",
        enabled: false,
        params: { instruments: [] as string[] },
      },
      {
        id: "setup.allowed-setups",
        kind: "setup",
        label: "Allowed setups",
        description: "Only take setups from your playbook. Leave empty to allow anything.",
        enabled: false,
        params: { setups: [] as string[] },
      },
      {
        id: "behavior.trade-your-setup",
        kind: "behavior",
        label: "Trade your setup",
        description: "Broken when one of your reflections marks the setup as not followed.",
        enabled: true,
        params: {},
      },
      {
        id: "behavior.respect-risk-rules",
        kind: "behavior",
        label: "Respect your risk rules",
        description: "Broken when one of your reflections marks risk as not respected.",
        enabled: true,
        params: {},
      },
      {
        id: "behavior.name-your-setups",
        kind: "behavior",
        label: "Name every setup",
        description: "Every trade should carry a named setup — no anonymous trades.",
        enabled: false,
        params: {},
      },
    ],
  };
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
    rules: defaultRuleSet(),
    playbook: [],
    aiPrefs: { includeNotes: true },
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
