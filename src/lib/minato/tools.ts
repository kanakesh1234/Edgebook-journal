/**
 * MINATO DETERMINISTIC TRADING MATH TOOLS
 *
 * Hard rule: The LLM must NEVER do trading math itself.
 * All streak probabilities, Monte Carlo simulations, position sizing,
 * expectancy, profit factor, average R, and drawdown calculations
 * are computed deterministically here from live trades DB + user semantic memory.
 */

import type { JournalEntry, JournalSettings } from "../types";

/* ========================================================================== */
/*  1. INSTRUMENT POINT VALUES & SPECS                                        */
/* ========================================================================== */

export interface InstrumentSpec {
  symbol: string;
  name: string;
  pointValue: number; // USD per 1.0 point move per contract
  tickSize: number;
  tickValue: number;
  pairSymbol?: string; // e.g., NQ <-> MNQ
}

export const INSTRUMENT_SPECS: Record<string, InstrumentSpec> = {
  NQ: { symbol: "NQ", name: "E-mini Nasdaq-100", pointValue: 20, tickSize: 0.25, tickValue: 5, pairSymbol: "MNQ" },
  MNQ: { symbol: "MNQ", name: "Micro E-mini Nasdaq-100", pointValue: 2, tickSize: 0.25, tickValue: 0.5, pairSymbol: "NQ" },
  ES: { symbol: "ES", name: "E-mini S&P 500", pointValue: 50, tickSize: 0.25, tickValue: 12.5, pairSymbol: "MES" },
  MES: { symbol: "MES", name: "Micro E-mini S&P 500", pointValue: 5, tickSize: 0.25, tickValue: 1.25, pairSymbol: "ES" },
  YM: { symbol: "YM", name: "E-mini Dow", pointValue: 5, tickSize: 1, tickValue: 5, pairSymbol: "MYM" },
  MYM: { symbol: "MYM", name: "Micro E-mini Dow", pointValue: 0.5, tickSize: 1, tickValue: 0.5, pairSymbol: "YM" },
  RTY: { symbol: "RTY", name: "E-mini Russell 2000", pointValue: 50, tickSize: 0.1, tickValue: 5, pairSymbol: "M2K" },
  M2K: { symbol: "M2K", name: "Micro E-mini Russell 2000", pointValue: 5, tickSize: 0.1, tickValue: 0.5, pairSymbol: "RTY" },
  GC: { symbol: "GC", name: "Gold Futures", pointValue: 100, tickSize: 0.1, tickValue: 10, pairSymbol: "MGC" },
  MGC: { symbol: "MGC", name: "Micro Gold Futures", pointValue: 10, tickSize: 0.1, tickValue: 1, pairSymbol: "GC" },
  CL: { symbol: "CL", name: "Crude Oil Futures", pointValue: 1000, tickSize: 0.01, tickValue: 10, pairSymbol: "MCL" },
  MCL: { symbol: "MCL", name: "Micro Crude Oil Futures", pointValue: 100, tickSize: 0.01, tickValue: 1, pairSymbol: "CL" },
};

export function resolveInstrumentSpec(raw?: string | null): InstrumentSpec {
  const clean = (raw ?? "MNQ").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (INSTRUMENT_SPECS[clean]) return INSTRUMENT_SPECS[clean];
  if (clean.includes("MNQ") || clean.includes("MICRONQ")) return INSTRUMENT_SPECS.MNQ;
  if (clean.includes("NQ") || clean.includes("NAS")) return INSTRUMENT_SPECS.NQ;
  if (clean.includes("MES") || clean.includes("MICROES")) return INSTRUMENT_SPECS.MES;
  if (clean.includes("ES") || clean.includes("SPX")) return INSTRUMENT_SPECS.ES;
  if (clean.includes("MGC") || clean.includes("XAU")) return INSTRUMENT_SPECS.MGC;
  return INSTRUMENT_SPECS.NQ;
}

/* ========================================================================== */
/*  2. STREAK PROBABILITY & MONTE CARLO TOOL                                  */
/* ========================================================================== */

export interface StreakProbabilityResult {
  winRate: number; // 0..1
  lossRate: number; // 0..1
  sampleTrades: number;
  horizonTrades: number; // n trades
  historicalMaxLosingStreak: number;
  historicalMaxWinningStreak: number;
  currentStreak: { type: "win" | "loss" | "none"; count: number };
  expectedMaxLosingStreakClosedForm: number;
  monteCarlo: {
    runs: number;
    seed: number;
    meanMaxStreak: number;
    medianMaxStreak: number;
    p90MaxStreak: number;
    p95MaxStreak: number;
    p99MaxStreak: number;
    maxObservedInSim: number;
    /** P(losing streak >= k in n trades) for key k values */
    probabilities: { k: number; exactProbPct: number; mcProbPct: number }[];
  };
  assumptions: string[];
  sampleSizeCaveat: string;
}

/**
 * Exact DP probability of seeing at least one run of >= k consecutive losses
 * in n independent Bernoulli trials with loss probability q = 1 - p.
 */
export function exactLosingStreakProbability(winRate: number, n: number, k: number): number {
  if (k <= 0) return 1;
  if (n < k) return 0;
  const q = Math.max(0, Math.min(1, 1 - winRate));
  const p = 1 - q;
  if (q === 0) return 0;
  if (q === 1) return 1;

  // State j in [0..k-1]: current consecutive losses < k.
  // State k: absorbing state (already hit >= k consecutive losses).
  let dp = new Float64Array(k + 1);
  dp[0] = 1;

  for (let step = 0; step < n; step++) {
    const next = new Float64Array(k + 1);
    // From states 0..k-1
    for (let j = 0; j < k; j++) {
      const prob = dp[j];
      if (prob === 0) continue;
      // Win resets current losing run to 0
      next[0] += prob * p;
      // Loss increments current losing run
      if (j + 1 >= k) {
        next[k] += prob * q;
      } else {
        next[j + 1] += prob * q;
      }
    }
    // Absorbing state stays absorbed
    next[k] += dp[k];
    dp = next;
  }

  return Math.max(0, Math.min(1, dp[k]));
}

/** Seeded Mulberry32 PRNG for deterministic, reproducible 10k+ Monte Carlo runs. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function computeStreakTool(opts: {
  entries: JournalEntry[];
  overrideWinRate?: number | null; // 0..1 or 0..100
  horizonTrades?: number | null;
  targetK?: number | null;
  runs?: number;
  seed?: number;
}): StreakProbabilityResult {
  const { entries, runs = 10_000, seed = 42 } = opts;

  // Chronological trade outcomes from live DB
  const chronological = [...entries].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.entryTime ?? "").localeCompare(b.entryTime ?? "") || a.createdAt - b.createdAt,
  );
  const decided = chronological.filter((e) => e.pnl !== 0);
  const wins = decided.filter((e) => e.pnl > 0).length;
  const sampleTrades = decided.length;

  let historicalMaxLosingStreak = 0;
  let historicalMaxWinningStreak = 0;
  let curLoss = 0;
  let curWin = 0;
  for (const e of decided) {
    if (e.pnl < 0) {
      curLoss++;
      curWin = 0;
      if (curLoss > historicalMaxLosingStreak) historicalMaxLosingStreak = curLoss;
    } else if (e.pnl > 0) {
      curWin++;
      curLoss = 0;
      if (curWin > historicalMaxWinningStreak) historicalMaxWinningStreak = curWin;
    }
  }

  const currentStreak: StreakProbabilityResult["currentStreak"] =
    curLoss > 0 ? { type: "loss", count: curLoss } : curWin > 0 ? { type: "win", count: curWin } : { type: "none", count: 0 };

  let rawWr = opts.overrideWinRate != null ? opts.overrideWinRate : sampleTrades > 0 ? wins / sampleTrades : 0.5;
  if (rawWr > 1) rawWr = rawWr / 100;
  const winRate = Math.max(0.01, Math.min(0.99, rawWr));
  const lossRate = 1 - winRate;
  const horizonTrades = opts.horizonTrades && opts.horizonTrades >= 5 ? Math.min(5000, Math.round(opts.horizonTrades)) : Math.max(100, sampleTrades);

  // Closed-form approximation for expected maximum losing streak in N trades:
  // E[L_N] ≈ log_{1/q}(N * p) + gamma / ln(1/q) - 0.5 (Schilling 1990)
  const EULER_GAMMA = 0.5772156649;
  const invLogQ = 1 / Math.log(1 / lossRate);
  const closedForm = Math.max(
    1,
    Math.log(Math.max(1, horizonTrades * winRate)) * invLogQ + EULER_GAMMA * invLogQ - 0.5,
  );

  // Seeded Monte Carlo (10,000+ runs)
  const rng = mulberry32(seed);
  const maxStreaks = new Int32Array(runs);
  let sumMax = 0;

  for (let r = 0; r < runs; r++) {
    let cur = 0;
    let maxS = 0;
    for (let t = 0; t < horizonTrades; t++) {
      if (rng() < lossRate) {
        cur++;
        if (cur > maxS) maxS = cur;
      } else {
        cur = 0;
      }
    }
    maxStreaks[r] = maxS;
    sumMax += maxS;
  }

  const sortedStreaks = Array.from(maxStreaks).sort((a, b) => a - b);
  const pctAt = (q: number) => sortedStreaks[Math.min(runs - 1, Math.floor(q * runs))] ?? 0;

  // Key k thresholds around expected max streak (plus targetK if requested)
  const baseKs = new Set<number>([3, 4, 5, 6, 8, 10, 12]);
  if (opts.targetK && opts.targetK >= 1 && opts.targetK <= 100) baseKs.add(Math.round(opts.targetK));
  baseKs.add(Math.max(2, Math.round(closedForm)));
  const kList = [...baseKs].sort((a, b) => a - b);

  const probabilities = kList.map((k) => {
    const exact = exactLosingStreakProbability(winRate, horizonTrades, k);
    let mcHits = 0;
    for (let i = 0; i < runs; i++) {
      if (maxStreaks[i] >= k) mcHits++;
    }
    return {
      k,
      exactProbPct: Math.round(exact * 1000) / 10,
      mcProbPct: Math.round((mcHits / runs) * 1000) / 10,
    };
  });

  const assumptions = [
    `Independent and identically distributed (i.i.d.) trades with constant win rate ${(winRate * 100).toFixed(1)}% (loss rate ${(lossRate * 100).toFixed(1)}%).`,
    `Horizon evaluated over N = ${horizonTrades} trades using exact Markov chain recurrence and ${runs.toLocaleString("en-US")} seeded Monte Carlo runs (seed=${seed}).`,
    `Does not include tilt-induced win-rate degradation; if loss rate rises after losses, real-world tail streaks are longer.`,
  ];

  const sampleSizeCaveat =
    sampleTrades < 20
      ? `Small sample caveat: win rate is estimated from only ${sampleTrades} decided trade${sampleTrades === 1 ? "" : "s"} — true long-run win rate has a wide confidence interval.`
      : sampleTrades < 50
        ? `Moderate sample caveat: based on ${sampleTrades} decided trades; treat tail streak estimates (95th–99th percentile) as planning buffers.`
        : `Grounded on ${sampleTrades} decided trades in your journal.`;

  return {
    winRate,
    lossRate,
    sampleTrades,
    horizonTrades,
    historicalMaxLosingStreak,
    historicalMaxWinningStreak,
    currentStreak,
    expectedMaxLosingStreakClosedForm: Math.round(closedForm * 100) / 100,
    monteCarlo: {
      runs,
      seed,
      meanMaxStreak: Math.round((sumMax / runs) * 100) / 100,
      medianMaxStreak: pctAt(0.5),
      p90MaxStreak: pctAt(0.9),
      p95MaxStreak: pctAt(0.95),
      p99MaxStreak: pctAt(0.99),
      maxObservedInSim: sortedStreaks[runs - 1] ?? 0,
      probabilities,
    },
    assumptions,
    sampleSizeCaveat,
  };
}

/* ========================================================================== */
/*  3. POSITION SIZING TOOL (NQ / MNQ / ES / MES)                             */
/* ========================================================================== */

export interface PositionSizeCalculation {
  symbol: string;
  name: string;
  pointValue: number;
  stopPoints: number;
  riskPerContractDollars: number;
  contracts: number; // floor(risk_$ / (stop_points * point_value))
  actualDollarRisk: number;
  unusedRiskDollars: number;
  formulaWorking: string;
}

export interface PositionSizingResult {
  accountEquity: number;
  drawdownRoomDollars: number | null;
  dailyLossLimitDollars: number | null;
  storedRiskDollars: number | null;
  storedRiskPct: number | null;
  effectiveRiskDollars: number;
  riskSource: string;
  stopPoints: number;
  stopPointsSource: "query" | "memory" | "journal_median" | "default_fallback";
  missingInputs: ("stop_points" | "risk_per_trade")[];
  primary: PositionSizeCalculation;
  comparison: PositionSizeCalculation; // e.g., MNQ vs NQ
  safeForDrawdownStreak: {
    p95MaxLosingStreak: number;
    maxSafeRiskForDrawdownRoom: number | null;
    warning: string | null;
  };
  assumptions: string[];
}

export function computePositionSizingTool(opts: {
  entries: JournalEntry[];
  settings: JournalSettings;
  symbol?: string | null;
  stopPoints?: number | null;
  riskDollars?: number | null;
  riskPct?: number | null;
  memoryRiskDollars?: number | null;
  memoryRiskPct?: number | null;
  memoryStopPoints?: number | null;
  memoryDailyLossLimit?: number | null;
  p95LosingStreak?: number;
}): PositionSizingResult {
  const { entries, settings } = opts;

  const totalPnl = entries.reduce((s, e) => s + e.pnl, 0);
  const accountEquity = (settings.startingEquity || 10000) + totalPnl;

  // Drawdown room calculation
  let peak = settings.startingEquity || 10000;
  let running = peak;
  const byDate = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  for (const e of byDate) {
    running += e.pnl;
    if (running > peak) peak = running;
  }
  const currentDrawdown = Math.max(0, peak - accountEquity);
  const drawdownRoomDollars =
    settings.maxDrawdown > 0 ? Math.max(0, settings.maxDrawdown - currentDrawdown) : null;

  // Daily loss limit from settings rules or memory
  const ruleDailyLoss = settings.rules?.rules.find((r) => r.id === "risk.max-daily-loss" && r.enabled)?.params?.limit;
  const dailyLossLimitDollars =
    opts.memoryDailyLossLimit ?? (typeof ruleDailyLoss === "number" ? ruleDailyLoss : null);

  // Determine missing inputs (if neither query nor semantic memory provided them)
  const missingInputs: ("stop_points" | "risk_per_trade")[] = [];
  const hasExplicitRisk =
    opts.riskDollars != null || opts.riskPct != null || opts.memoryRiskDollars != null || opts.memoryRiskPct != null;
  const hasExplicitStop = opts.stopPoints != null || opts.memoryStopPoints != null;

  if (!hasExplicitRisk) missingInputs.push("risk_per_trade");
  if (!hasExplicitStop) missingInputs.push("stop_points");

  // Resolve effective risk in dollars
  let effectiveRiskDollars = 100;
  let riskSource = "default 1% of account equity";
  if (opts.riskDollars != null && opts.riskDollars > 0) {
    effectiveRiskDollars = opts.riskDollars;
    riskSource = `explicitly requested $${opts.riskDollars.toLocaleString("en-US")} risk`;
  } else if (opts.riskPct != null && opts.riskPct > 0) {
    effectiveRiskDollars = Math.round(accountEquity * (opts.riskPct / 100) * 100) / 100;
    riskSource = `${opts.riskPct}% of $${Math.round(accountEquity).toLocaleString("en-US")} equity`;
  } else if (opts.memoryRiskDollars != null && opts.memoryRiskDollars > 0) {
    effectiveRiskDollars = opts.memoryRiskDollars;
    riskSource = `saved memory risk ($${opts.memoryRiskDollars.toLocaleString("en-US")}/trade)`;
  } else if (opts.memoryRiskPct != null && opts.memoryRiskPct > 0) {
    effectiveRiskDollars = Math.round(accountEquity * (opts.memoryRiskPct / 100) * 100) / 100;
    riskSource = `saved memory risk (${opts.memoryRiskPct}% of $${Math.round(accountEquity).toLocaleString("en-US")} equity)`;
  } else if (dailyLossLimitDollars != null && dailyLossLimitDollars > 0) {
    effectiveRiskDollars = Math.round((dailyLossLimitDollars / 2) * 100) / 100;
    riskSource = `50% of your $${dailyLossLimitDollars.toLocaleString("en-US")} daily loss limit ($${effectiveRiskDollars}/trade)`;
  } else if (drawdownRoomDollars != null && drawdownRoomDollars > 0) {
    effectiveRiskDollars = Math.round((drawdownRoomDollars / 10) * 100) / 100;
    riskSource = `10% of remaining $${Math.round(drawdownRoomDollars).toLocaleString("en-US")} drawdown room ($${effectiveRiskDollars}/trade)`;
  } else {
    effectiveRiskDollars = Math.round(accountEquity * 0.01 * 100) / 100;
  }

  // Resolve stop points
  let stopPoints = 20;
  let stopPointsSource: PositionSizingResult["stopPointsSource"] = "default_fallback";
  if (opts.stopPoints != null && opts.stopPoints > 0) {
    stopPoints = opts.stopPoints;
    stopPointsSource = "query";
  } else if (opts.memoryStopPoints != null && opts.memoryStopPoints > 0) {
    stopPoints = opts.memoryStopPoints;
    stopPointsSource = "memory";
  } else {
    // Check journal entries for historical stop distances
    const dists = entries
      .filter((e) => typeof e.entryPrice === "number" && typeof e.stopLoss === "number" && Math.abs(e.entryPrice - e.stopLoss) > 0)
      .map((e) => Math.abs((e.entryPrice as number) - (e.stopLoss as number)))
      .sort((a, b) => a - b);
    if (dists.length > 0) {
      stopPoints = Math.round(dists[Math.floor(dists.length / 2)] * 100) / 100;
      stopPointsSource = "journal_median";
    }
  }

  const primarySpec = resolveInstrumentSpec(opts.symbol ?? "MNQ");
  const pairSpec = resolveInstrumentSpec(primarySpec.pairSymbol ?? (primarySpec.symbol === "NQ" ? "MNQ" : "NQ"));

  const calcFor = (spec: InstrumentSpec): PositionSizeCalculation => {
    const riskPerContract = stopPoints * spec.pointValue;
    const contracts = riskPerContract > 0 ? Math.floor(effectiveRiskDollars / riskPerContract) : 0;
    const actualDollarRisk = Math.round(contracts * riskPerContract * 100) / 100;
    const unusedRiskDollars = Math.round(Math.max(0, effectiveRiskDollars - actualDollarRisk) * 100) / 100;
    const formulaWorking = `floor($${effectiveRiskDollars} / (${stopPoints} pts × $${spec.pointValue}/pt)) = floor($${effectiveRiskDollars} / $${riskPerContract.toFixed(2)}) = ${contracts} contract${contracts === 1 ? "" : "s"}`;
    return {
      symbol: spec.symbol,
      name: spec.name,
      pointValue: spec.pointValue,
      stopPoints,
      riskPerContractDollars: Math.round(riskPerContract * 100) / 100,
      contracts,
      actualDollarRisk,
      unusedRiskDollars,
      formulaWorking,
    };
  };

  // Always show MNQ and NQ clearly when NQ/MNQ is asked
  const isNqFamily = primarySpec.symbol === "NQ" || primarySpec.symbol === "MNQ";
  const mnqCalc = calcFor(isNqFamily ? INSTRUMENT_SPECS.MNQ : primarySpec);
  const nqCalc = calcFor(isNqFamily ? INSTRUMENT_SPECS.NQ : pairSpec);

  const p95Streak = opts.p95LosingStreak ?? 6;
  const maxSafeRiskForDrawdownRoom =
    drawdownRoomDollars != null && p95Streak > 0
      ? Math.floor(drawdownRoomDollars / (p95Streak + 1))
      : null;

  let warning: string | null = null;
  if (maxSafeRiskForDrawdownRoom != null && effectiveRiskDollars > maxSafeRiskForDrawdownRoom) {
    warning = `At $${effectiveRiskDollars}/trade, a 95th-percentile losing streak (${p95Streak} losses = $${(effectiveRiskDollars * p95Streak).toLocaleString("en-US")}) would approach or breach your $${Math.round(drawdownRoomDollars!).toLocaleString("en-US")} drawdown cushion. Consider capping risk at $${maxSafeRiskForDrawdownRoom}/trade.`;
  } else if (dailyLossLimitDollars != null && effectiveRiskDollars > dailyLossLimitDollars) {
    warning = `Risk per trade ($${effectiveRiskDollars}) exceeds your daily loss limit ($${dailyLossLimitDollars}).`;
  }

  return {
    accountEquity: Math.round(accountEquity * 100) / 100,
    drawdownRoomDollars: drawdownRoomDollars != null ? Math.round(drawdownRoomDollars * 100) / 100 : null,
    dailyLossLimitDollars,
    storedRiskDollars: opts.memoryRiskDollars ?? null,
    storedRiskPct: opts.memoryRiskPct ?? null,
    effectiveRiskDollars,
    riskSource,
    stopPoints,
    stopPointsSource,
    missingInputs,
    primary: primarySpec.symbol === "NQ" ? nqCalc : mnqCalc,
    comparison: primarySpec.symbol === "NQ" ? mnqCalc : nqCalc,
    safeForDrawdownStreak: {
      p95MaxLosingStreak: p95Streak,
      maxSafeRiskForDrawdownRoom,
      warning,
    },
    assumptions: [
      `Formula: contracts = floor(risk_$ / (stop_points × point_value)).`,
      `Point values: MNQ = $2.00/pt ($0.50/tick), NQ = $20.00/pt ($5.00/tick).`,
      `Risk budget used: $${effectiveRiskDollars} (${riskSource}); Stop distance: ${stopPoints} pts (${stopPointsSource.replace("_", " ")}).`,
    ],
  };
}

/* ========================================================================== */
/*  4. EXPECTANCY, PROFIT FACTOR, AVERAGE R & DRAWDOWN STATS TOOL             */
/* ========================================================================== */

export interface ExpectancyAndStatsResult {
  totalTrades: number;
  decidedTrades: number;
  wins: number;
  losses: number;
  breakevens: number;
  winRatePct: number;
  lossRatePct: number;
  grossProfit: number;
  grossLoss: number;
  netPnl: number;
  profitFactor: number | null; // grossProfit / abs(grossLoss)
  avgWinDollars: number;
  avgLossDollars: number;
  payoffRatio: number | null; // avgWin / abs(avgLoss)
  expectancyDollarsPerTrade: number; // (winRate * avgWin) - (lossRate * abs(avgLoss))
  expectancyR: number | null;
  avgR: number | null;
  avgWinR: number | null;
  avgLossR: number | null;
  rSampleSize: number;
  drawdown: {
    startingEquity: number;
    currentEquity: number;
    peakEquity: number;
    maxDrawdownDollars: number;
    currentDrawdownDollars: number;
    drawdownLimitDollars: number;
    drawdownRoomDollars: number | null;
  };
}

export function computeExpectancyStatsTool(entries: JournalEntry[], settings: JournalSettings): ExpectancyAndStatsResult {
  const chronological = [...entries].sort(
    (a, b) => a.date.localeCompare(b.date) || (a.entryTime ?? "").localeCompare(b.entryTime ?? "") || a.createdAt - b.createdAt,
  );

  let wins = 0;
  let losses = 0;
  let breakevens = 0;
  let grossProfit = 0;
  let grossLoss = 0;
  const rAll: number[] = [];
  const rWins: number[] = [];
  const rLosses: number[] = [];

  let runningEquity = settings.startingEquity || 10000;
  let peakEquity = runningEquity;
  let maxDrawdownDollars = 0;

  for (const e of chronological) {
    if (e.pnl > 0) {
      wins++;
      grossProfit += e.pnl;
    } else if (e.pnl < 0) {
      losses++;
      grossLoss += Math.abs(e.pnl);
    } else {
      breakevens++;
    }
    if (typeof e.rr === "number" && Number.isFinite(e.rr)) {
      rAll.push(e.rr);
      if (e.pnl > 0) rWins.push(e.rr);
      else if (e.pnl < 0) rLosses.push(e.rr);
    }
    runningEquity += e.pnl;
    if (runningEquity > peakEquity) peakEquity = runningEquity;
    const dd = peakEquity - runningEquity;
    if (dd > maxDrawdownDollars) maxDrawdownDollars = dd;
  }

  const decidedTrades = wins + losses;
  const winRate = decidedTrades > 0 ? wins / decidedTrades : 0;
  const lossRate = decidedTrades > 0 ? losses / decidedTrades : 0;
  const avgWinDollars = wins > 0 ? grossProfit / wins : 0;
  const avgLossDollars = losses > 0 ? grossLoss / losses : 0;
  const profitFactor = grossLoss > 0 ? Math.round((grossProfit / grossLoss) * 100) / 100 : grossProfit > 0 ? Infinity : null;
  const payoffRatio = avgLossDollars > 0 ? Math.round((avgWinDollars / avgLossDollars) * 100) / 100 : null;
  const expectancyDollarsPerTrade =
    decidedTrades > 0 ? Math.round((winRate * avgWinDollars - lossRate * avgLossDollars) * 100) / 100 : 0;

  const mean = (arr: number[]) => (arr.length > 0 ? Math.round((arr.reduce((s, x) => s + x, 0) / arr.length) * 100) / 100 : null);
  const avgR = mean(rAll);
  const avgWinR = mean(rWins);
  const avgLossR = mean(rLosses);
  const expectancyR =
    avgWinR != null && avgLossR != null
      ? Math.round((winRate * avgWinR - lossRate * Math.abs(avgLossR)) * 100) / 100
      : avgR;

  const currentDrawdownDollars = Math.max(0, peakEquity - runningEquity);
  const drawdownLimitDollars = settings.maxDrawdown || 0;
  const drawdownRoomDollars =
    drawdownLimitDollars > 0 ? Math.max(0, drawdownLimitDollars - currentDrawdownDollars) : null;

  return {
    totalTrades: entries.length,
    decidedTrades,
    wins,
    losses,
    breakevens,
    winRatePct: Math.round(winRate * 1000) / 10,
    lossRatePct: Math.round(lossRate * 1000) / 10,
    grossProfit: Math.round(grossProfit * 100) / 100,
    grossLoss: Math.round(grossLoss * 100) / 100,
    netPnl: Math.round((grossProfit - grossLoss) * 100) / 100,
    profitFactor,
    avgWinDollars: Math.round(avgWinDollars * 100) / 100,
    avgLossDollars: Math.round(avgLossDollars * 100) / 100,
    payoffRatio,
    expectancyDollarsPerTrade,
    expectancyR,
    avgR,
    avgWinR,
    avgLossR,
    rSampleSize: rAll.length,
    drawdown: {
      startingEquity: settings.startingEquity || 10000,
      currentEquity: Math.round(runningEquity * 100) / 100,
      peakEquity: Math.round(peakEquity * 100) / 100,
      maxDrawdownDollars: Math.round(maxDrawdownDollars * 100) / 100,
      currentDrawdownDollars: Math.round(currentDrawdownDollars * 100) / 100,
      drawdownLimitDollars,
      drawdownRoomDollars: drawdownRoomDollars != null ? Math.round(drawdownRoomDollars * 100) / 100 : null,
    },
  };
}

/* ========================================================================== */
/*  5. QUERY PARAMETER PARSER FOR CALCULATIONS                                */
/* ========================================================================== */

export interface ParsedCalcParams {
  wantsStreak: boolean;
  wantsSizing: boolean;
  wantsExpectancyOrStats: boolean;
  winRateOverride: number | null;
  horizonTrades: number | null;
  targetStreakK: number | null;
  stopPoints: number | null;
  riskDollars: number | null;
  riskPct: number | null;
  instrument: string | null;
}

export function parseCalcQuery(query: string): ParsedCalcParams {
  const q = query.toLowerCase();

  const wantsStreak =
    /\b(streak|losing run|losses in a row|consecutive loss\w*|max\w* (?:longest )?losing|probability of losing|monte carlo)\b/i.test(q);
  const wantsSizing =
    /\b(position siz\w*|contract\w*|how many (?:contracts|micros|minis|lots)|size for|sizing|point value|stop size|stop loss points)\b/i.test(q) ||
    (/\b(nq|mnq|es|mes|micro|mini)\b/i.test(q) && /\b(size|contracts?|risk|stop|pts|points)\b/i.test(q));
  const wantsExpectancyOrStats =
    /\b(expectancy|profit factor|average r|avg r|payoff ratio|drawdown room|drawdown stat\w*|math)\b/i.test(q);

  // Extract explicit win rate if given in the prompt (e.g. "with a 45% win rate" or "at 60% wr")
  let winRateOverride: number | null = null;
  const wrMatch =
    q.match(/\b(\d{1,2}(?:\.\d+)?)\s*%\s*(?:win\s*rate|wr|winrate)\b/i) ??
    q.match(/\b(?:win\s*rate|wr)\s*(?:of|is|at|=)?\s*(\d{1,2}(?:\.\d+)?)\s*%/i);
  if (wrMatch) {
    winRateOverride = Number(wrMatch[1]) / 100;
  }

  // Extract horizon N trades (e.g. "in 200 trades" or "over 100 trades")
  let horizonTrades: number | null = null;
  const nMatch = q.match(/\b(?:in|over|across|next|for)\s+(\d{2,4})\s+trades\b/i);
  if (nMatch) horizonTrades = Number(nMatch[1]);

  // Extract target streak k (e.g. "streak of 6" or ">= 5 losses" or "5 losses in a row")
  let targetStreakK: number | null = null;
  const kMatch =
    q.match(/\b(?:streak\s*(?:of|>=|≥)?\s*(\d{1,2})|(\d{1,2})\s*(?:losses in a row|consecutive losses))\b/i);
  if (kMatch) targetStreakK = Number(kMatch[1] ?? kMatch[2]);

  // Extract stop points (e.g. "15 point stop", "20pt stop", "stop of 12 points", "25 pts")
  let stopPoints: number | null = null;
  const stopMatch =
    q.match(/\b(\d{1,3}(?:\.\d+)?)\s*(?:pt|pts|point|points)\s*(?:stop|sl)?\b/i) ??
    q.match(/\bstop\s*(?:loss|size|of|is|at|=)?\s*(\d{1,3}(?:\.\d+)?)\s*(?:pt|pts|point|points)?\b/i);
  if (stopMatch) stopPoints = Number(stopMatch[1]);

  // Extract explicit dollar risk (e.g. "$200 risk", "risk $150", "risking $250")
  let riskDollars: number | null = null;
  const riskDollarMatch =
    q.match(/\$\s*(\d{2,5}(?:\.\d+)?)\s*(?:risk|per trade|max loss)/i) ??
    q.match(/\brisk(?:ing)?\s*(?:is|of|=)?\s*\$\s*(\d{2,5}(?:\.\d+)?)\b/i) ??
    (q.includes("risk") ? q.match(/\$\s*(\d{2,5}(?:\.\d+)?)\b/) : null);
  if (riskDollarMatch) riskDollars = Number(riskDollarMatch[1]);

  // Extract explicit % risk (e.g. "1% risk", "0.5% risk per trade", "risk 1.5%")
  let riskPct: number | null = null;
  const riskPctMatch =
    q.match(/\b(\d{1,2}(?:\.\d+)?)\s*%\s*risk\b/i) ??
    q.match(/\brisk(?:ing)?\s*(?:is|of|=)?\s*(\d{1,2}(?:\.\d+)?)\s*%/i);
  if (riskPctMatch) riskPct = Number(riskPctMatch[1]);

  // Instrument detection
  let instrument: string | null = null;
  if (/\bmnq\b|\bmicro\s*nq\b|\bnq\s*micro\b/i.test(q)) instrument = "MNQ";
  else if (/\bnq\b|\bmini\s*nq\b|\bnq\s*mini\b/i.test(q)) instrument = "NQ";
  else if (/\bmes\b|\bmicro\s*es\b/i.test(q)) instrument = "MES";
  else if (/\bes\b|\bmini\s*es\b/i.test(q)) instrument = "ES";
  else if (/\bmgc\b/i.test(q)) instrument = "MGC";
  else if (/\bgc\b/i.test(q)) instrument = "GC";

  return {
    wantsStreak,
    wantsSizing,
    wantsExpectancyOrStats,
    winRateOverride,
    horizonTrades,
    targetStreakK,
    stopPoints,
    riskDollars,
    riskPct,
    instrument,
  };
}
