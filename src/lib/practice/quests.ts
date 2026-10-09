/**
 * Daily quests — three small goals per day, picked deterministically from the date so every device agrees.
 *
 * Progress is DERIVED, not stored: answers and XP come from `dailyStats`, everything else from the day's
 * `questLog`. The only thing written on purpose is which rewards were claimed.
 * Pure functions only (no React, no storage).
 */
import type { GameProgress as PracticeProgress } from "./progress-ext.ts";

type Log = NonNullable<PracticeProgress["questLog"]>[string];
export type QuestKind = "answers" | "xp" | "passes" | "combo" | "perfect" | "accuracy" | "ict" | "modes";

export interface QuestDef { id: string; kind: QuestKind; target: number; title: string; reward: number; /** Short noun for the progress readout. */ unit: string }
export interface QuestState extends QuestDef { value: number; done: boolean; claimed: boolean }

export const CHEST_ID = "chest";
export const CHEST_REWARD = 30;
export const EMPTY_LOG: Log = { rounds: 0, passes: 0, maxCombo: 0, perfect: 0, bestAcc: 0, ictCorrect: 0, modes: [], claimed: [] };

const q = (kind: QuestKind, target: number, title: string, reward: number, unit: string): QuestDef => ({ id: `${kind}-${target}`, kind, target, title, reward, unit });

/** One of each lane per day: volume, skill, variety. */
const VOLUME: QuestDef[] = [q("answers", 15, "Answer 15 questions", 15, "answers"), q("answers", 25, "Answer 25 questions", 20, "answers"), q("xp", 30, "Earn 30 XP", 15, "XP"), q("xp", 50, "Earn 50 XP", 20, "XP")];
const SKILL: QuestDef[] = [q("passes", 1, "Clear a level gate", 20, "gates"), q("combo", 5, "Reach a ×5 flow", 20, "best flow"), q("perfect", 1, "Finish a perfect round", 25, "perfect rounds"), q("accuracy", 80, "Finish a round at 80%+", 20, "% best")];
const VARIETY: QuestDef[] = [q("ict", 8, "Get 8 ICT answers right", 20, "correct"), q("modes", 2, "Play 2 different modes", 20, "modes"), q("ict", 12, "Get 12 ICT answers right", 25, "correct")];

const hash = (text: string) => { let h = 2166136261; for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619); return h >>> 0; };

export function questsFor(date: string): QuestDef[] {
  const h = hash(date);
  return [VOLUME[h % VOLUME.length]!, SKILL[(h >>> 4) % SKILL.length]!, VARIETY[(h >>> 8) % VARIETY.length]!];
}

export const logOf = (progress: PracticeProgress | undefined, date: string): Log => ({ ...EMPTY_LOG, ...(progress?.questLog?.[date] ?? {}) });

function valueOf(def: QuestDef, stats: { xp: number; total: number } | undefined, log: Log): number {
  switch (def.kind) {
    case "answers": return stats?.total ?? 0;
    case "xp": return stats?.xp ?? 0;
    case "passes": return log.passes;
    case "combo": return log.maxCombo;
    case "perfect": return log.perfect;
    case "accuracy": return Math.round(log.bestAcc * 100);
    case "ict": return log.ictCorrect;
    case "modes": return log.modes.length;
  }
}

export function questStates(progress: PracticeProgress | undefined, date: string): QuestState[] {
  const log = logOf(progress, date);
  const stats = progress?.dailyStats?.[date];
  return questsFor(date).map((def) => {
    const value = valueOf(def, stats, log);
    return { ...def, value, done: value >= def.target, claimed: log.claimed.includes(def.id) };
  });
}

export const allDone = (states: QuestState[]) => states.length > 0 && states.every((s) => s.done);
export const chestClaimed = (progress: PracticeProgress | undefined, date: string) => logOf(progress, date).claimed.includes(CHEST_ID);

/** What one finished round adds to today's log. */
export interface RoundFacts { mode: string; passed: boolean; maxCombo: number; correct: number; total: number; ictCorrect: number }

export function applyRoundToLog(progress: PracticeProgress | undefined, date: string, round: RoundFacts): NonNullable<PracticeProgress["questLog"]> {
  const all = { ...(progress?.questLog ?? {}) };
  const log = logOf(progress, date);
  const accuracy = round.total >= 8 ? round.correct / round.total : 0;
  all[date] = {
    ...log,
    rounds: log.rounds + 1,
    passes: log.passes + (round.passed ? 1 : 0),
    maxCombo: Math.max(log.maxCombo, round.maxCombo),
    perfect: log.perfect + (round.total >= 3 && round.correct === round.total ? 1 : 0),
    bestAcc: Math.max(log.bestAcc, accuracy),
    ictCorrect: log.ictCorrect + round.ictCorrect,
    modes: [...new Set([...log.modes, round.mode])],
  };
  const keep = Object.keys(all).sort().slice(-14);
  return Object.fromEntries(keep.map((k) => [k, all[k]!]));
}

/** Marks the day as fully done once, and returns whether this call was the first time. */
export function markAllDone(progress: PracticeProgress, date: string): { questLog: NonNullable<PracticeProgress["questLog"]>; first: boolean } {
  const log = logOf(progress, date);
  const states = questStates(progress, date);
  if (log.allDone || !allDone(states)) return { questLog: progress.questLog ?? {}, first: false };
  return { questLog: { ...(progress.questLog ?? {}), [date]: { ...log, allDone: true } }, first: true };
}

/** Claim one quest (or the daily chest). Returns the XP granted and the log with the claim recorded; 0 XP if it can't be claimed. */
export function claim(progress: PracticeProgress, date: string, id: string): { xp: number; questLog: NonNullable<PracticeProgress["questLog"]> } {
  const log = logOf(progress, date);
  const states = questStates(progress, date);
  if (log.claimed.includes(id)) return { xp: 0, questLog: progress.questLog ?? {} };
  let xp = 0;
  if (id === CHEST_ID) { if (allDone(states) && states.every((s) => log.claimed.includes(s.id))) xp = CHEST_REWARD; }
  else { const s = states.find((x) => x.id === id); if (s?.done) xp = s.reward; }
  if (!xp) return { xp: 0, questLog: progress.questLog ?? {} };
  return { xp, questLog: { ...(progress.questLog ?? {}), [date]: { ...log, claimed: [...log.claimed, id] } } };
}
