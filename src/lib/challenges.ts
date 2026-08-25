import type { Challenge, JournalEntry } from "./types";

/* ------------------------------------------------------------------ */
/*  Challenge progress — pure calculations                             */
/*                                                                      */
/*  STATIC drawdown:  peak = startingBalance (fixed anchor).            */
/*                    drawdown = startingBalance − equity (min 0).      */
/*  DYNAMIC drawdown: trailing high-water-mark of equity;               */
/*                    drawdown = max peak-to-current decline.           */
/*  Both are explicit and tested — never approximated.                  */
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

  // Trailing high-water-mark walk (used for dynamic DD + max observed DD).
  let peak = startingBalance;
  let maxObserved = 0;
  let equity = startingBalance;
  for (const e of tradesList) {
    equity += e.pnl;
    peak = Math.max(peak, equity);
    maxObserved = Math.max(maxObserved, peak - equity);
  }

  const drawdownMode = challenge.drawdownMode ?? "static";
  const maxDrawdown = challenge.maxDrawdown ?? 0;
  const staticDD = Math.max(0, startingBalance - currentEquity);
  const dynamicDD = Math.max(0, peak - currentEquity);
  const currentDrawdown = drawdownMode === "dynamic" ? dynamicDD : staticDD;

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

  const milestoneFractions = [0.25, 0.5, 0.75];
  const milestones: ChallengeMilestone[] = milestoneFractions.map((f) => ({
    fraction: f,
    equity: startingBalance + f * range,
    passed: progress >= f - 1e-9,
  }));

  void today;

  return {
    challengeId: challenge.id,
    startingBalance,
    targetBalance,
    currentEquity,
    currentPnl,
    progress,
    progressPct: Math.round(progress * 100),
    maxDrawdown,
    currentDrawdown,
    remainingDrawdown: Math.max(0, maxDrawdown - currentDrawdown),
    drawdownMode,
    maxObservedDrawdown: maxObserved,
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
