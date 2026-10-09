/**
 * Achievements — derived from progress, so they can never drift from what really happened.
 * Only the date a badge was first unlocked is stored (`progress.achievements`). Pure functions.
 */
import type { GameProgress as PracticeProgress } from "./progress-ext.ts";
import { recordsOf } from "./records.ts";
import { isIctTag } from "./ict.ts";

export type AchievementIcon = "flame" | "bolt" | "target" | "trophy" | "medal" | "star" | "brain" | "crown" | "calendar" | "compass";
export interface AchievementDef { id: string; title: string; blurb: string; icon: AchievementIcon; tier: 1 | 2 | 3; target: number; value: (p: PracticeProgress) => number }
export interface AchievementState extends AchievementDef { current: number; unlocked: boolean; on?: string }

const ALL_MODES = ["matrix", "time-machine", "math-duel", "boss", "ict"];
const ictCorrect = (p: PracticeProgress) => Object.entries(p.masteryByTag ?? {}).filter(([tag]) => isIctTag(tag)).reduce((s, [, n]) => s + n, 0);
const modesPlayed = (p: PracticeProgress) => ALL_MODES.filter((m) => (p.modePerformance?.[m]?.attempts ?? 0) > 0).length;
const topLevel = (p: PracticeProgress) => Math.max(1, ...ALL_MODES.map((m) => p.arena?.levels?.[m] ?? 1));

const A = (id: string, title: string, blurb: string, icon: AchievementIcon, tier: 1 | 2 | 3, target: number, value: (p: PracticeProgress) => number): AchievementDef => ({ id, title, blurb, icon, tier, target, value });

export const ACHIEVEMENTS: AchievementDef[] = [
  A("first-round", "First round", "Finish your first round.", "bolt", 1, 1, (p) => recordsOf(p).rounds),
  A("rounds-25", "Regular", "Finish 25 rounds.", "bolt", 2, 25, (p) => recordsOf(p).rounds),
  A("rounds-100", "Relentless", "Finish 100 rounds.", "bolt", 3, 100, (p) => recordsOf(p).rounds),
  A("streak-3", "On a roll", "Practise 3 days in a row.", "flame", 1, 3, (p) => recordsOf(p).bestStreak),
  A("streak-7", "Week warrior", "Practise 7 days in a row.", "flame", 2, 7, (p) => recordsOf(p).bestStreak),
  A("streak-30", "Unbroken", "Practise 30 days in a row.", "flame", 3, 30, (p) => recordsOf(p).bestStreak),
  A("flow-5", "In the zone", "Reach a ×5 flow.", "star", 1, 5, (p) => recordsOf(p).bestCombo),
  A("flow-10", "Untouchable", "Reach a ×10 flow.", "star", 2, 10, (p) => recordsOf(p).bestCombo),
  A("perfect-1", "Flawless", "Finish a perfect round.", "target", 1, 1, (p) => p.perfectSets ?? 0),
  A("perfect-10", "Sharpshooter", "Finish 10 perfect rounds.", "target", 3, 10, (p) => p.perfectSets ?? 0),
  A("sharp-90", "Sharp eye", "Hit 90% accuracy over 8+ answers.", "target", 2, 90, (p) => Math.round(recordsOf(p).bestAccuracy * 100)),
  A("level-5", "Climber", "Reach level 5 in any mode.", "medal", 1, 5, topLevel),
  A("level-10", "Summit", "Reach level 10 in any mode.", "medal", 3, 10, topLevel),
  A("ict-25", "Smart money student", "Get 25 ICT answers right.", "brain", 1, 25, ictCorrect),
  A("ict-100", "Price delivery", "Get 100 ICT answers right.", "brain", 3, 100, ictCorrect),
  A("explorer", "Explorer", "Play all five modes.", "compass", 2, 5, modesPlayed),
  A("quests-3", "Quest runner", "Finish all daily quests on 3 days.", "calendar", 2, 3, (p) => recordsOf(p).questDays),
  A("xp-500", "Rising", "Earn 500 XP.", "trophy", 1, 500, (p) => p.xp),
  A("xp-2500", "Veteran", "Earn 2,500 XP.", "crown", 3, 2500, (p) => p.xp),
];

export function achievementStates(progress: PracticeProgress | undefined): AchievementState[] {
  const p: PracticeProgress = progress ?? { xp: 0, streak: 0 };
  return ACHIEVEMENTS.map((def) => {
    const current = Math.min(def.target, def.value(p));
    return { ...def, current, unlocked: current >= def.target, on: p.achievements?.[def.id] };
  });
}

/** Ids earned by `progress` that are not yet stamped in `progress.achievements`. */
export const newlyEarned = (progress: PracticeProgress): string[] => achievementStates(progress).filter((a) => a.unlocked && !progress.achievements?.[a.id]).map((a) => a.id);

export function stamp(progress: PracticeProgress, ids: string[], date: string): NonNullable<PracticeProgress["achievements"]> {
  return { ...(progress.achievements ?? {}), ...Object.fromEntries(ids.map((id) => [id, date])) };
}
