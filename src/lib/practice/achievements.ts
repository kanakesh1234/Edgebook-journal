/**
 * Achievements — derived from progress, so they can never drift from what really happened.
 * Only the date a badge was first unlocked is stored (`progress.achievements`). Pure functions.
 *
 * Trophies are meant to be EARNED, not collected. Two rules keep them that way:
 *   1. Targets are long-haul (days practised, streaks, hundreds of right answers).
 *   2. Time gate: a trophy cannot unlock until enough calendar days have passed since the first practice day
 *      (bronze 7, silver 21, gold 45). Doing everything in one sitting never works.
 */
import type { GameProgress as PracticeProgress } from "./progress-ext.ts";
import { recordsOf } from "./records.ts";
import { isIctTag } from "./ict.ts";

export type AchievementIcon = "flame" | "bolt" | "target" | "trophy" | "medal" | "star" | "brain" | "crown" | "calendar" | "compass";
export type AchievementGroup = "Consistency" | "Volume" | "Skill" | "ICT Lab";
export interface AchievementDef { id: string; group: AchievementGroup; title: string; blurb: string; icon: AchievementIcon; tier: 1 | 2 | 3; target: number; value: (p: PracticeProgress) => number }
export interface AchievementState extends AchievementDef {
  current: number;
  /** Target reached AND the time gate has opened. */
  unlocked: boolean;
  /** The number is reached but the calendar gate is still closed. */
  waiting: boolean;
  /** Calendar days of practice still needed before this can unlock (0 when open). */
  daysLeft: number;
  on?: string;
}

/** Calendar days a trophy of each tier needs to have passed since the first practice day. */
export const TIER_GATE_DAYS = { 1: 7, 2: 21, 3: 45 } as const;

const ALL_MODES = ["matrix", "time-machine", "math-duel", "boss", "ict"];
const DAY = 86_400_000;
const dayMs = (key: string) => Date.parse(`${key}T00:00:00Z`);

const practiceDays = (p: PracticeProgress): string[] => [...new Set(p.completedMissionDates ?? [])].sort();
/** Days between the first and the latest practice day, so the gate is about real elapsed time. */
export function spanDays(p: PracticeProgress): number {
  const days = practiceDays(p);
  if (days.length < 2) return 0;
  return Math.max(0, Math.round((dayMs(days[days.length - 1]!) - dayMs(days[0]!)) / DAY));
}
const daysPractised = (p: PracticeProgress) => practiceDays(p).length;

const totalCorrect = (p: PracticeProgress) => Object.values(p.modePerformance ?? {}).reduce((s, m) => s + (m?.correct ?? 0), 0);
const totalAttempts = (p: PracticeProgress) => Object.values(p.modePerformance ?? {}).reduce((s, m) => s + (m?.attempts ?? 0), 0);
const ictCorrect = (p: PracticeProgress) => Object.entries(p.masteryByTag ?? {}).filter(([tag]) => isIctTag(tag)).reduce((s, [, n]) => s + n, 0);
const topLevel = (p: PracticeProgress) => Math.max(1, ...ALL_MODES.map((m) => p.arena?.levels?.[m] ?? 1));
const lowestOf = (p: PracticeProgress, modes: string[]) => Math.min(...modes.map((m) => p.arena?.levels?.[m] ?? 1));
/** Accuracy only counts once there is a real sample; until then progress scales with the sample so the bar stays honest. */
const steadyAccuracy = (p: PracticeProgress, sample: number) => {
  const n = totalAttempts(p);
  return n === 0 ? 0 : Math.round((totalCorrect(p) / n) * 100 * Math.min(1, n / sample));
};

const A = (id: string, group: AchievementGroup, title: string, blurb: string, icon: AchievementIcon, tier: 1 | 2 | 3, target: number, value: (p: PracticeProgress) => number): AchievementDef => ({ id, group, title, blurb, icon, tier, target, value });

export const ACHIEVEMENTS: AchievementDef[] = [
  // Consistency — showing up
  A("days-7", "Consistency", "Showing up", "Practise on 7 different days.", "calendar", 1, 7, daysPractised),
  A("days-21", "Consistency", "Habit formed", "Practise on 21 different days.", "calendar", 2, 21, daysPractised),
  A("days-60", "Consistency", "Part of the routine", "Practise on 60 different days.", "calendar", 3, 60, daysPractised),
  A("streak-7", "Consistency", "Week warrior", "Practise 7 days in a row.", "flame", 1, 7, (p) => recordsOf(p).bestStreak),
  A("streak-21", "Consistency", "Three weeks strong", "Practise 21 days in a row.", "flame", 2, 21, (p) => recordsOf(p).bestStreak),
  A("streak-45", "Consistency", "Unbroken", "Practise 45 days in a row.", "flame", 3, 45, (p) => recordsOf(p).bestStreak),
  A("quests-7", "Consistency", "Quest runner", "Finish every daily challenge on 7 days.", "target", 2, 7, (p) => recordsOf(p).questDays),
  // Volume — putting in the reps
  A("rounds-40", "Volume", "Regular", "Finish 40 rounds.", "bolt", 1, 40, (p) => recordsOf(p).rounds),
  A("rounds-150", "Volume", "Relentless", "Finish 150 rounds.", "bolt", 2, 150, (p) => recordsOf(p).rounds),
  A("rounds-400", "Volume", "Tireless", "Finish 400 rounds.", "bolt", 3, 400, (p) => recordsOf(p).rounds),
  A("right-250", "Volume", "Getting it right", "Answer 250 questions correctly.", "medal", 1, 250, totalCorrect),
  A("right-1000", "Volume", "Pattern recognition", "Answer 1,000 questions correctly.", "medal", 2, 1000, totalCorrect),
  A("xp-3000", "Volume", "Rising", "Earn 3,000 XP.", "trophy", 1, 3000, (p) => p.xp),
  A("xp-12000", "Volume", "Veteran", "Earn 12,000 XP.", "crown", 3, 12000, (p) => p.xp),
  // Skill — doing it well
  A("flow-12", "Skill", "In the zone", "Reach a ×12 flow.", "star", 1, 12, (p) => recordsOf(p).bestCombo),
  A("flow-25", "Skill", "Untouchable", "Reach a ×25 flow.", "star", 3, 25, (p) => recordsOf(p).bestCombo),
  A("perfect-8", "Skill", "Sharpshooter", "Finish 8 perfect rounds.", "target", 2, 8, (p) => p.perfectSets ?? 0),
  A("sharp-85", "Skill", "Sharp eye", "Hold 85% accuracy across 150+ answers.", "target", 2, 85, (p) => steadyAccuracy(p, 150)),
  A("level-8", "Skill", "Climber", "Reach level 8 in any mode.", "medal", 2, 8, topLevel),
  A("level-15", "Skill", "Summit", "Reach level 15 in any mode.", "crown", 3, 15, topLevel),
  // ICT Lab
  A("ict-60", "ICT Lab", "Smart money student", "Get 60 ICT answers right.", "brain", 1, 60, ictCorrect),
  A("ict-300", "ICT Lab", "Price delivery", "Get 300 ICT answers right.", "brain", 3, 300, ictCorrect),
  A("explorer-5", "ICT Lab", "Well rounded", "Reach level 5 in both Time Machine and ICT Lab.", "compass", 2, 5, (p) => lowestOf(p, ["time-machine", "ict"])),
];

export function achievementStates(progress: PracticeProgress | undefined): AchievementState[] {
  const p: PracticeProgress = progress ?? { xp: 0, streak: 0 };
  const span = spanDays(p);
  return ACHIEVEMENTS.map((def) => {
    const current = Math.min(def.target, def.value(p));
    const reached = current >= def.target;
    const gate = TIER_GATE_DAYS[def.tier];
    const open = span >= gate;
    const unlocked = reached && open;
    return { ...def, current, unlocked, waiting: reached && !open, daysLeft: open ? 0 : gate - span, on: unlocked ? p.achievements?.[def.id] : undefined };
  });
}

/** Ids earned by `progress` that are not yet stamped in `progress.achievements`. */
export const newlyEarned = (progress: PracticeProgress): string[] => achievementStates(progress).filter((a) => a.unlocked && !progress.achievements?.[a.id]).map((a) => a.id);

export function stamp(progress: PracticeProgress, ids: string[], date: string): NonNullable<PracticeProgress["achievements"]> {
  return { ...(progress.achievements ?? {}), ...Object.fromEntries(ids.map((id) => [id, date])) };
}
