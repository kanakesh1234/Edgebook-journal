import type { Challenge, JournalEntry, JournalSettings, TrailingBasis } from "./types";
import { computeDrawdown } from "./drawdown";

/* ------------------------------------------------------------------ */
/*  Challenge progress — pure calculations                             */
/*                                                                      */
/*  STATIC drawdown:  floor = startingBalance − maxDrawdown. Never moves.*/
/*  DYNAMIC drawdown: floor = trailing peak − maxDrawdown, moves UP only.*/
/*    EOD trailing:   peak = highest end-of-day balance (closed days).   */
/*    Live trailing:  peak = highest balance, updated on every trade.    */
/*  Remaining cushion is ALWAYS currentEquity − currentFloor.            */
/* ------------------------------------------------------------------ */

export interface ChallengeMilestone {
  fraction: number; // 0..1 toward target
  equity: number;
  passed: boolean;
}

export interface ChallengeProgress {
  challengeId: string;
  startingBalance: number;
  targetBalance: number;
  currentEquity: number;
  /** Highest equity achieved during the challenge (high-water mark). */
  highestBalance: number;
  currentPnl: number;
  /** 0..1 progress from start to target (clamped). */
  progress: number;
  progressPct: number;
  maxDrawdown: number;
  /** Current drawdown per the challenge's mode. */
  currentDrawdown: number;
  /** Remaining drawdown budget. */
  remainingDrawdown: number;
  drawdownMode: "static" | "dynamic";
  /** Dynamic only: what drives the trailing floor. Null for static. */
  trailingBasis: TrailingBasis | null;
  /** The peak the floor trails from (static: starting balance). */
  drawdownPeak: number;
  /**
   * Current drawdown floor — the lowest equity allowed before breach.
   * STATIC: startingBalance − maxDrawdown (fixed).
   * DYNAMIC: drawdownPeak − maxDrawdown, never below drawdownFloor when set.
   */
  drawdownThreshold: number;
  /** currentEquity − drawdownThreshold. Negative = floor breached. */
  drawdownCushion: number;
  /** True once equity has reached/crossed the floor (needs maxDrawdown set). */
  breached: boolean;
  drawdownFloor: number | null;
  /** Worst peak-to-current decline seen (always trailing model). */
  maxObservedDrawdown: number;
  distanceToTarget: number;
  reachedTarget: boolean;
  trades: number;
  wins: number;
  losses: number;
  winRate: number | null;
  avgR: number | null;
  /** Checklist adherence across challenge trades with checklists (0..1). */
  ruleAdherence: number | null;
  milestones: ChallengeMilestone[];
  tradesList: JournalEntry[];
}

export function challengeProgress(
  challenge: Challenge,
  allEntries: JournalEntry[],
  today?: string,
): ChallengeProgress {
  const startingBalance = challenge.startingBalance ?? 0;
  const targetBalance = challenge.targetBalance ?? startingBalance;
  const tradesList = allEntries
    .filter((e) => e.challengeId === challenge.id)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);

  const currentPnl = tradesList.reduce((s, e) => s + e.pnl, 0);
  const currentEquity = startingBalance + currentPnl;

  const range = targetBalance - startingBalance;
  const progress = range > 0 ? Math.min(1, Math.max(0, (currentEquity - startingBalance) / range)) : 0;

  const drawdownMode = challenge.drawdownMode ?? "static";
  const maxDrawdown = challenge.maxDrawdown ?? 0;
  const dd = computeDrawdown({
    startingBalance,
    maxDrawdown,
    mode: drawdownMode,
    basis: challenge.trailingBasis,
    floor: challenge.drawdownFloor ?? null,
    trades: tradesList,
    asOf: today,
  });
  const floor = challenge.drawdownFloor ?? null;

  const wins = tradesList.filter((e) => e.pnl > 0).length;
  const losses = tradesList.filter((e) => e.pnl < 0).length;
  const decided = wins + losses;
  const rrEntries = tradesList.filter((e) => e.rr != null);
  const checklistEntries = tradesList.filter((e) => e.checklist);
  let confirmed = 0;
  let required = 0;
  for (const e of checklistEntries) {
    const items = [
      e.checklist?.r1Time?.answer,
      e.checklist?.r2Environment?.answer,
      e.checklist?.r3LiquiditySweep?.answer,
      e.checklist?.r4Manipulation?.answer,
      e.checklist?.r5Target?.answer,
      e.checklist?.r6Smt?.answer,
      ...(e.checklist?.tradeNumber === 2 ? [e.checklist?.r7NewSmt?.answer] : []),
    ];
    for (const a of items) {
      if (a != null) {
        required += 1;
        if (a === true) confirmed += 1;
      }
    }
  }

  const milestoneFractions = [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1];
  const milestones: ChallengeMilestone[] = milestoneFractions.map((f) => ({
    fraction: f,
    equity: startingBalance + f * range,
    passed: progress >= f - 1e-9,
  }));

  return {
    challengeId: challenge.id,
    startingBalance,
    targetBalance,
    currentEquity,
    highestBalance: dd.livePeak,
    currentPnl,
    progress,
    progressPct: Math.round(progress * 100),
    maxDrawdown,
    currentDrawdown: dd.currentDrawdown,
    remainingDrawdown: dd.remaining,
    drawdownMode,
    trailingBasis: dd.trailingBasis,
    drawdownPeak: dd.drawdownPeak,
    drawdownThreshold: dd.threshold,
    drawdownCushion: dd.cushion,
    breached: dd.breached,
    drawdownFloor: floor,
    maxObservedDrawdown: dd.maxObserved,
    distanceToTarget: Math.max(0, targetBalance - currentEquity),
    reachedTarget: range > 0 && currentEquity >= targetBalance,
    trades: tradesList.length,
    wins,
    losses,
    winRate: decided > 0 ? wins / decided : null,
    avgR:
      rrEntries.length > 0
        ? rrEntries.reduce((s, e) => s + (e.rr ?? 0), 0) / rrEntries.length
        : null,
    ruleAdherence: required > 0 ? confirmed / required : null,
    milestones,
    tradesList,
  };
}

/* ------------------------------------------------------------------ */
/*  Primary challenge — the single shared selection that the Home      */
/*  dashboard, calendar, journey and MINATO all reference.             */
/* ------------------------------------------------------------------ */

/** The user's selected primary challenge, or null when none is set / it was deleted. */
export function primaryChallenge(settings: Pick<JournalSettings, "challenges" | "primaryChallengeId">): Challenge | null {
  const challenges = settings.challenges ?? [];
  if (challenges.length === 0) return null;
  return challenges.find((c) => c.id === settings.primaryChallengeId) ?? null;
}

/**
 * Entries + effective equity settings scoped to the primary challenge.
 * When no primary challenge exists the overall/default behaviour applies
 * (all entries, global settings) — never crashes.
 */
export function scopeToPrimary(
  settings: JournalSettings,
  entries: JournalEntry[],
): { entries: JournalEntry[]; settings: JournalSettings; challenge: Challenge | null } {
  const challenge = primaryChallenge(settings);
  if (!challenge) return { entries, settings, challenge: null };
  const scoped = entries.filter((e) => e.challengeId === challenge.id);
  const effective: JournalSettings = {
    ...settings,
    startingEquity: challenge.startingBalance ?? settings.startingEquity,
    targetEquity: challenge.targetBalance ?? settings.targetEquity,
    maxDrawdown:
      challenge.maxDrawdown && challenge.maxDrawdown > 0 ? challenge.maxDrawdown : settings.maxDrawdown,
    // Effective-only: lets computeStats (Home, Practise, MINATO) use the
    // challenge's drawdown model. Derived per render, never persisted.
    drawdownMode: challenge.drawdownMode ?? "static",
    trailingBasis: challenge.trailingBasis ?? null,
    drawdownFloor: challenge.drawdownFloor ?? null,
  };
  return { entries: scoped, settings: effective, challenge };
}

/** Context-aware motivational reminder — original wording, evidence-based. */
export function challengeReminder(progress: ChallengeProgress): string | null {
  if (progress.maxDrawdown > 0 && progress.remainingDrawdown <= progress.maxDrawdown * 0.25 && progress.currentDrawdown > 0) {
    return "Drawdown budget nearly spent. Protect the remaining room — one trade at the plan's pace, or none at all.";
  }
  if (progress.reachedTarget) {
    return "Target reached. Locking this in is also a discipline — set the next objective before trading on.";
  }
  if (progress.progress >= 0.75) {
    return "Past 75% of the challenge. Consistency finishes what conviction started — same checklist, same patience.";
  }
  if (progress.losses >= 2) {
    return "Two losses logged. The plan says the day is protecting tomorrow — review before anything else.";
  }
  if (progress.trades === 0) {
    return "Challenge ready. Wait for the playbook to come to you — patience is position one.";
  }
  return null;
}

/* ------------------------------------------------------------------ */
/*  Journey card — single source of truth = primary challenge           */
/* ------------------------------------------------------------------ */

export interface JourneyCardData {
  /** null → no primary challenge; callers render an empty state. */
  challengeName: string | null;
  startingBalance: number | null;
  currentBalance: number | null;
  targetBalance: number | null;
  /** 0..1 toward target. */
  progress: number;
  progressPct: number;
  drawdownMode: "static" | "dynamic";
  remainingDrawdown: number | null;
}

/**
 * Derives Journey card values from the CURRENT PRIMARY CHALLENGE.
 * Never falls back to global default equity — no hard-coded $10,000.
 * When no primary challenge exists, returns nulls (empty state).
 */
export function journeyCardData(settings: JournalSettings, entries: JournalEntry[]): JourneyCardData {
  const challenge = primaryChallenge(settings);
  if (!challenge) {
    return {
      challengeName: null, startingBalance: null, currentBalance: null,
      targetBalance: null, progress: 0, progressPct: 0,
      drawdownMode: "static", remainingDrawdown: null,
    };
  }
  const p = challengeProgress(challenge, entries);
  return {
    challengeName: challenge.name,
    startingBalance: p.startingBalance,
    currentBalance: p.currentEquity,
    targetBalance: p.targetBalance,
    progress: p.progress,
    progressPct: p.progressPct,
    drawdownMode: p.drawdownMode,
    remainingDrawdown: p.maxDrawdown > 0 ? p.remainingDrawdown : null,
  };
}
