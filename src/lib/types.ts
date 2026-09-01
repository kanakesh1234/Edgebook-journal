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

/**
 * Canonical PRE-TRADE execution checklist item — completed BEFORE the trade
 * is recorded, persisted as historical evidence on the entry itself.
 * Labels are derived from the selected setup/plan; never hard-coded.
 */
export interface PreTradeChecklistItem {
  label: string;
  description?: string;
  confirmed: boolean;
}

export interface JournalEntry {
  id: string;
  /** Local trading date, `YYYY-MM-DD` (America/New_York). */
  date: string;
  /** Net profit & loss for the trade in account currency. */
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
  /** Challenge this trade belongs to. */
  challengeId?: string;
  /** Canonical PlaybookSetup this trade was executed under (id reference, never a copy). */
  setupId?: string;
  /** Pre-trade plan this trade executed (plan ↔ trade link, no duplication). */
  planId?: string;
  /** Planned trade number within the day (1 or 2). */
  tradeNumber?: 1 | 2 | null;
  /** Entry / exit clock time in NY trading time, "HH:MM". */
  entryTime?: string;
  exitTime?: string;
  entryPrice?: number | null;
  exitPrice?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  /** Trade quantity — contracts, shares, or lots. */
  quantity?: number | null;
  /** Human-readable hold duration imported from CSV (e.g. "16 seconds"). */
  holdDuration?: string | null;
  /** Execution playbook checklist (6/6 first trade, 7/7 second trade). */
  checklist?: TradeChecklist;
  /**
   * Canonical PRE-TRADE execution checklist — captured in the Plan Trade
   * flow BEFORE recording. Read-only historical evidence after the trade.
   * Replaces the legacy interactive post-trade checklist for new trades.
   */
  preTradeChecklist?: PreTradeChecklistItem[];
  /** Structured review data — setup, execution, psychology, outcome. */
  review?: TradeReviewData;
  /** Review lifecycle status (derived + persisted for calendar/list display). */
  reviewStatus?: ReviewStatus;
  createdAt: number;
  updatedAt: number;
}

export interface JournalSettings {
  /** Display name used across the app (dashboard greeting, profile). Overrides the auth name when set. */
  fullName?: string;
  /** Canonical unique friend identifier (Connection ID) — never an email. */
  handle?: string;
  traderName: string;
  startingEquity: number;
  targetEquity: number;
  maxDrawdown: number;
  currency: CurrencyCode;
  /** Trading Lab rule set. Optional so v1 payloads import cleanly. */
  rules?: RuleSet;
  /** The trader's playbook — fully defined setups with entry/exit logic. */
  playbook?: PlaybookSetup[];
  /** The challenge the Home dashboard / calendar / MINATO are scoped to. */
  primaryChallengeId?: string | null;
  /** AI companion preferences. */
  aiPrefs?: AiPrefs;
  /** Trading challenges — distinct trading periods/objectives. */
  challenges?: Challenge[];
}

/* ------------------------------------------------------------------ */
/*  Challenges — distinct trading periods/objectives                   */
/* ------------------------------------------------------------------ */

export type DrawdownMode = "static" | "dynamic";

export interface Challenge {
  id: string;
  name: string;
  notes?: string;
  startingBalance?: number | null;
  targetBalance?: number | null;
  /** STATIC: measured from starting balance. DYNAMIC: trailing high-water mark. */
  drawdownMode?: DrawdownMode;
  maxDrawdown?: number | null;
  /**
   * DYNAMIC only: absolute equity floor the trailing threshold can never
   * breach (broker "lock" level). Null = trail with no lock.
   */
  drawdownFloor?: number | null;
  startDate?: string;
  endDate?: string;
  dailyProfitTarget?: number | null;
  dailyLossLimit?: number | null;
  tradeLimit?: number | null;
  instruments?: string[];
  createdAt: number;
}

/* ------------------------------------------------------------------ */
/*  Pre-trade plans — "what I intend to do if my setup appears"        */
/*  A plan is NOT a trade. No entry/exit/P&L is required or expected.  */
/* ------------------------------------------------------------------ */

export type PlanStatus =
  | "planned"
  | "ready"
  | "active"
  | "executed"
  | "not_executed"
  | "invalidated"
  | "cancelled";

export const PLAN_EMOTIONS = [
  "CALM", "FOCUSED", "CONFIDENT", "UNCERTAIN", "FOMO", "ANXIOUS",
  "FRUSTRATED", "REVENGE-PRONE", "TIRED", "DISTRACTED", "OTHER",
] as const;

/** Pre-trade checklist rule state — planning defines WHAT MUST HAPPEN, not what did. */
export type PlanRuleState = "waiting" | "expected" | "ready" | "invalidated";

export interface PlanRule {
  label: string;
  state: PlanRuleState;
  note?: string;
}

export interface TradePlan {
  id: string;
  userId?: string; // informational; server isolation is by session
  date: string; // planned trading day YYYY-MM-DD
  challengeId?: string;
  playbookId?: string;
  playbookName?: string;
  playbookVersion?: number;
  instrument?: string;
  bias?: "long" | "short" | "either";
  /** Free-form pre-session / pre-trade process written by the trader. */
  preSessionProcess?: string;
  /** "What is price likely to do today?" — stored exactly as written. */
  thesis: string;
  drawOnLiquidity?: string;
  drawLevel?: string;
  liquidityObservations?: string;
  importantLevels?: string;
  mustHappenBeforeEntry?: string;
  invalidation?: string;
  expectedSetup?: string;
  expectedTarget?: string;
  emotionalState?: (typeof PLAN_EMOTIONS)[number];
  emotionalNote?: string;
  whatCouldBreakPlan?: string;
  rules: PlanRule[];
  /** Execution-checklist confirmations from the pre-trade analysis stage. */
  executionChecklist?: PreTradeChecklistItem[];
  executionConfirmedAt?: number;
  preTradeScreenshotIds?: string[];
  status: PlanStatus;
  linkedTradeId?: string;
  createdAt: number;
  updatedAt: number;
}

/* ------------------------------------------------------------------ */
/*  Trade review — checklist, execution, psychology, process           */
/* ------------------------------------------------------------------ */

export type ReviewStatus = "not_reviewed" | "in_progress" | "reviewed" | "incomplete";

export interface ChecklistItem {
  answer: boolean | null;
  note?: string;
}

/** Execution playbook checklist — 6/6 for trade #1, 7/7 for trade #2. */
export interface TradeChecklist {
  /** Planned trade number within the day. */
  tradeNumber: 1 | 2;
  /** R1 — 9:33 AM rule (no entry before 9:33 AM EST). */
  r1Time?: ChecklistItem;
  /** R2 — Environment gate: clean delivery vs manipulative wicks. */
  r2Environment?: ChecklistItem;
  /** R3 — Liquidity sweep: exact high/low + timestamp. */
  r3LiquiditySweep?: ChecklistItem;
  /** R4 — Institutional manipulation confirmed after the sweep. */
  r4Manipulation?: ChecklistItem;
  /** R5 — Clear draw on liquidity / target levels before entry. */
  r5Target?: ChecklistItem;
  /** R6 — SMT divergence at key structural levels. */
  r6Smt?: ChecklistItem;
  /** R7 — Second trade only: new SMT after minor liquidity (3-candle divergence). */
  r7NewSmt?: ChecklistItem;
}

export function checklistItems(c: TradeChecklist): { id: string; label: string; item: ChecklistItem }[] {
  const defs: [string, string, ChecklistItem | undefined][] = [
    ["r1Time", "9:33 AM rule — no entry before 9:33 AM EST", c.r1Time],
    ["r2Environment", "Environment gate — clean candle-body delivery", c.r2Environment],
    ["r3LiquiditySweep", "Liquidity sweep — exact high/low + timestamp", c.r3LiquiditySweep],
    ["r4Manipulation", "Manipulation confirmed after the sweep", c.r4Manipulation],
    ["r5Target", "Clear draw on liquidity / target levels", c.r5Target],
    ["r6Smt", "SMT divergence at key structural levels", c.r6Smt],
    ...(c.tradeNumber === 2 ? ([["r7NewSmt", "New SMT after minor liquidity — 3-candle divergence", c.r7NewSmt]] as [string, string, ChecklistItem | undefined][]) : []),
  ];
  return defs.map(([id, label, item]) => ({ id, label, item: item ?? { answer: null } }));
}

export function checklistScore(c: TradeChecklist): { confirmed: number; required: number } {
  const items = checklistItems(c);
  return {
    confirmed: items.filter((i) => i.item.answer === true).length,
    required: items.length,
  };
}

/** Execution review — how the trade was actually taken. */
export interface ExecutionReview {
  whyEntered?: string;
  planned?: boolean | null;
  correctTime?: boolean | null;
  followedStop?: boolean | null;
  movedStop?: boolean | null;
  movedStopReason?: string;
  exitedEarly?: boolean | null;
  exitedEarlyReason?: string;
  chased?: boolean | null;
}

/** Psychology review — emotional state around the trade. */
export interface PsychologyReview {
  emotionBefore?: string;
  convictionOrUrgency?: "conviction" | "urgency" | "";
  fomo?: boolean | null;
  revenge?: boolean | null;
  fearExit?: boolean | null;
  makeItBack?: boolean | null;
  notes?: string;
}

/** Outcome vs process — a win can be a process failure; a loss can be a process success. */
export interface OutcomeReview {
  followedPlan?: boolean | null;
  goodTradeDespiteLoss?: boolean | null;
  badTradeDespiteWin?: boolean | null;
  processVerdict?: "a-plus" | "process-success" | "process-failure" | "";
  notes?: string;
}

export interface TradeReviewData {
  plannedVsActual?: {
    followedChecklist?: boolean | null;
    deviations?: string;
    notes?: string;
  };
  playbookRef?: { name: string; version: number };
  concepts?: {
    used: string[];
    learned?: string;
    improve?: string;
  };
  compareInsight?: string;
  followUp?: {
    strongestEvidence?: string;
    biggestMistake?: string;
    conceptApplied?: string;
    conceptMisunderstood?: string;
    watchNext?: string;
  };
  setup?: {
    liquiditySwept?: string;
    sweepTimestamp?: string;
    smtEvidence?: string;
    targetDescription?: string;
    manipulationIdentified?: string;
  };
  checklist?: TradeChecklist;
  execution?: ExecutionReview;
  psychology?: PsychologyReview;
  outcome?: OutcomeReview;
  postLossGate?: {
    emotionalState?: string;
    immediateThoughts?: string;
    fomo?: boolean | null;
    revenge?: boolean | null;
    urgency?: boolean | null;
    intendedNextAction?: string;
    acknowledgedAt: number;
  };
  prematureEntryAcknowledgedAt?: number;
  reviewedAt?: number;
}

/** Derive review status — REVIEWED requires evidence, checklist, execution, psychology, outcome. */
export function reviewStatusOf(entry: Pick<JournalEntry, "review" | "reflection" | "images" | "checklist"> & { preTradeChecklist?: PreTradeChecklistItem[] }): ReviewStatus {
  const hasChecklist =
    (!!entry.checklist && checklistScore(entry.checklist).confirmed > 0) ||
    (!!entry.preTradeChecklist && entry.preTradeChecklist.some((i) => i.confirmed));
  const hasReflection = !!entry.reflection;
  const hasExecution = !!entry.review?.execution && Object.values(entry.review.execution).some((v) => v != null && v !== "");
  const hasPsychology = !!entry.review?.psychology && Object.values(entry.review.psychology).some((v) => v != null && v !== "");
  const hasOutcome = !!entry.review?.outcome && Object.values(entry.review.outcome).some((v) => v != null && v !== "");
  const hasEvidence = entry.images.length > 0;

  if (!hasChecklist && !hasReflection && !hasExecution && !hasPsychology && !hasOutcome) return "not_reviewed";
  if (hasChecklist && hasReflection && hasExecution && hasPsychology && hasOutcome && hasEvidence) return "reviewed";
  if (!hasEvidence) return "incomplete"; // attempted review without screenshot evidence
  return "in_progress";
}

/* ------------------------------------------------------------------ */
/*  Playbook — the trader's defined setups and strategy                */
/* ------------------------------------------------------------------ */

/** A single user-defined rule inside a setup. Canonical — referenced, never duplicated into trades. */
export interface PlaybookRule {
  id: string;
  text: string;
  description?: string;
}

export interface PlaybookSetup {
  id: string;
  name: string;
  purpose?: string;
  /** The idea behind the setup — where the edge comes from. */
  strategy?: string;
  /** User-defined rules (unlimited). Preferred over entryConditions. */
  rules?: PlaybookRule[];
  /** Legacy: conditions that must be true before entering (one per line = one rule). */
  entryConditions?: string;
  /** What kills the trade / the idea. */
  invalidation?: string;
  /** Targets, stop placement, management rules. */
  exitRules?: string;
  minRR?: number | null;
  /** Preferred sessions, e.g. "London open", "NY". */
  sessions?: string[];
  instruments?: string[];
  notes?: string;
  active?: boolean;
  /**
   * Version safety: bumped on every edit. Trades reference the version that
   * applied at execution time so historical interpretation never shifts.
   */
  version: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Canonical rule list for a setup. Migrates legacy setups transparently:
 * when `rules` is absent, rules are derived from `entryConditions` lines.
 */
export function setupRules(setup: Pick<PlaybookSetup, "rules" | "entryConditions"> | null | undefined): PlaybookRule[] {
  if (!setup) return [];
  if (setup.rules && setup.rules.length > 0) return setup.rules;
  return (setup.entryConditions ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((text, i) => ({ id: `legacy-${i}`, text }));
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
