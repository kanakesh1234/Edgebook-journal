"use client";

import { useEffect, useState } from "react";

export type QuestId =
  | "q1_plan"
  | "q2_tape"
  | "q3_autopsy"
  | "q4_arena"
  | "q5_minato"
  | "q6_vault";

export interface QuestSpec {
  id: QuestId;
  num: string;
  code: string;
  title: string;
  shortTitle: string;
  anchor: string;
  xpReward: number;
  badgeTitle: string;
  description: string;
}

export const QUEST_SPECS: QuestSpec[] = [
  {
    id: "q1_plan",
    num: "01",
    code: "QUEST 01",
    title: "The Pre-Bell Ritual",
    shortTitle: "Pre-Bell Plan",
    anchor: "#top",
    xpReward: 200,
    badgeTitle: "Locked in Ink",
    description: "Build a disciplined pre-session intention before the 09:30 NY bell.",
  },
  {
    id: "q2_tape",
    num: "02",
    code: "QUEST 02",
    title: "09:30 Live Tape Simulator",
    shortTitle: "Live Tape",
    anchor: "#film",
    xpReward: 300,
    badgeTitle: "Unshakeable Composure",
    description: "Execute your setup across 5 live market ticks without succumbing to FOMO or fear.",
  },
  {
    id: "q3_autopsy",
    num: "03",
    code: "QUEST 03",
    title: "The Autopsy Detective",
    shortTitle: "Autopsy X-Ray",
    anchor: "#gap",
    xpReward: 250,
    badgeTitle: "Honest Mirror",
    description: "X-ray 3 trades and separate sloppy wins from clean-process losses.",
  },
  {
    id: "q4_arena",
    num: "04",
    code: "QUEST 04",
    title: "The 5 Practice Arenas",
    shortTitle: "Practice Arenas",
    anchor: "#toolkit",
    xpReward: 300,
    badgeTitle: "Arena Tactician",
    description: "Clear rapid-fire trading drills across Matrix, Time Machine, Math Duel, Boss & ICT.",
  },
  {
    id: "q5_minato",
    num: "05",
    code: "QUEST 05",
    title: "Minato Pattern Investigation",
    shortTitle: "Minato AI",
    anchor: "#minato",
    xpReward: 200,
    badgeTitle: "Pattern Whisperer",
    description: "Interrogate your past entries with Minato and equip a personal guardrail.",
  },
  {
    id: "q6_vault",
    num: "06",
    code: "QUEST 06",
    title: "Equity Road & Sovereign Vault",
    shortTitle: "Road & Vault",
    anchor: "#road",
    xpReward: 250,
    badgeTitle: "Sovereign Operator",
    description: "Drive your equity to the $20k target and verify your Google Drive JSON vault.",
  },
];

export interface RankSpec {
  level: number;
  title: string;
  minXp: number;
  nextXp: number;
}

export const RANKS: RankSpec[] = [
  { level: 1, title: "Impulse Novice", minXp: 0, nextXp: 250 },
  { level: 2, title: "Rule Apprentice", minXp: 250, nextXp: 550 },
  { level: 3, title: "Process Tactician", minXp: 550, nextXp: 900 },
  { level: 4, title: "Disciplined Operator", minXp: 900, nextXp: 1250 },
  { level: 5, title: "Sovereign Master", minXp: 1250, nextXp: 1600 },
];

export function getRankForXp(xp: number): {
  rank: RankSpec;
  levelProgressPct: number;
} {
  let current = RANKS[0]!;
  for (const r of RANKS) {
    if (xp >= r.minXp) current = r;
  }
  const span = Math.max(1, current.nextXp - current.minXp);
  const pct = Math.min(100, Math.max(0, Math.round(((xp - current.minXp) / span) * 100)));
  return { rank: current, levelProgressPct: pct };
}

export interface RewardToast {
  id: number;
  title: string;
  subtitle: string;
  xpDelta: number;
  tone: "profit" | "gold" | "loss";
}

export interface LandingGameState {
  xp: number;
  composure: number;
  equity: number;
  streak: number;
  activeQuestIndex: number;
  questsCompleted: Record<QuestId, boolean>;
  badges: string[];
  guardrailEquipped: string;
  lastToast: RewardToast | null;
}

const INITIAL_STATE: LandingGameState = {
  xp: 120,
  composure: 84,
  equity: 10000,
  streak: 2,
  activeQuestIndex: 0,
  questsCompleted: {
    q1_plan: false,
    q2_tape: false,
    q3_autopsy: false,
    q4_arena: false,
    q5_minato: false,
    q6_vault: false,
  },
  badges: [],
  guardrailEquipped: "Stop after 2 consecutive losses · Wait for 5m close",
  lastToast: null,
};

let state: LandingGameState = {
  ...INITIAL_STATE,
  questsCompleted: { ...INITIAL_STATE.questsCompleted },
  badges: [],
};

type GameListener = (s: LandingGameState) => void;
const listeners = new Set<GameListener>();

function emit() {
  const snapshot: LandingGameState = {
    ...state,
    questsCompleted: { ...state.questsCompleted },
    badges: [...state.badges],
  };
  listeners.forEach((fn) => fn(snapshot));
}

export function getGameState(): LandingGameState {
  return state;
}

export function subscribeGameState(fn: GameListener): () => void {
  listeners.add(fn);
  fn(state);
  return () => {
    listeners.delete(fn);
  };
}

export function useLandingGame(): LandingGameState {
  const [snap, setSnap] = useState<LandingGameState>(state);
  useEffect(() => subscribeGameState(setSnap), []);
  return snap;
}

let toastCounter = 1;

export function awardGameAction(opts: {
  xpDelta?: number;
  composureDelta?: number;
  equityDelta?: number;
  streakReset?: boolean;
  streakIncrement?: boolean;
  questId?: QuestId;
  title: string;
  subtitle: string;
  tone?: "profit" | "gold" | "loss";
  guardrail?: string;
}) {
  const xpDelta = opts.xpDelta ?? 0;
  const compDelta = opts.composureDelta ?? 0;
  const eqDelta = opts.equityDelta ?? 0;

  let bonusXp = 0;
  let questJustCleared = false;

  if (opts.questId && !state.questsCompleted[opts.questId]) {
    state.questsCompleted[opts.questId] = true;
    questJustCleared = true;
    const spec = QUEST_SPECS.find((q) => q.id === opts.questId);
    if (spec) {
      bonusXp = spec.xpReward;
      if (!state.badges.includes(spec.badgeTitle)) {
        state.badges = [...state.badges, spec.badgeTitle];
      }
    }
  }

  const totalXpAdded = xpDelta + bonusXp;
  state.xp = Math.max(0, state.xp + totalXpAdded);
  state.composure = Math.max(15, Math.min(100, state.composure + compDelta));
  state.equity = Math.max(5000, Math.min(25000, state.equity + eqDelta));

  if (opts.streakReset) {
    state.streak = 0;
  } else if (opts.streakIncrement) {
    state.streak += 1;
  }

  if (opts.guardrail) {
    state.guardrailEquipped = opts.guardrail;
  }

  state.lastToast = {
    id: toastCounter++,
    title: questJustCleared ? `${opts.title} · Quest Cleared!` : opts.title,
    subtitle: opts.subtitle,
    xpDelta: totalXpAdded,
    tone: opts.tone ?? (totalXpAdded >= 0 ? "profit" : "loss"),
  };

  emit();
}

export function setActiveQuestIndex(index: number) {
  const clamped = Math.max(0, Math.min(QUEST_SPECS.length - 1, index));
  if (state.activeQuestIndex !== clamped) {
    state.activeQuestIndex = clamped;
    emit();
  }
}

export function resetLandingGame() {
  state = {
    ...INITIAL_STATE,
    questsCompleted: { ...INITIAL_STATE.questsCompleted },
    badges: [],
    lastToast: {
      id: toastCounter++,
      title: "Session Reset",
      subtitle: "Fresh $10,000 ledger and 08:45 AM pre-bell state restored.",
      xpDelta: 0,
      tone: "gold",
    },
  };
  emit();
}
