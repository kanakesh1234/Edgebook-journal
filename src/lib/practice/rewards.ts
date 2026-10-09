import type { RecordKey } from "./records.ts";

/** Everything a finished round earned beyond XP and the level change — shown on the summary. */
export interface RoundExtras {
  newRecords: RecordKey[];
  /** Achievement ids unlocked by this round. */
  unlocked: string[];
  /** Quest ids completed by this round. */
  questsDone: string[];
  streak: number;
  /** The streak went up because of this round (first round of the day). */
  streakGrew: boolean;
  /** All three quests are now done. */
  allQuestsDone: boolean;
}

export const NO_EXTRAS: RoundExtras = { newRecords: [], unlocked: [], questsDone: [], streak: 0, streakGrew: false, allQuestsDone: false };
