/* Milestones reward steady study without punishing a missed day: every one is cumulative and none can be lost.
   (Deliberately no "streak" — a counter that resets turns a habit into an obligation.) */

import type { FeedState } from "./types";
import { daysVisited, savedKeys } from "./state";

export interface MilestoneDef {
  id: string;
  title: string;
  detail: string;
  target: number;
  value: (s: FeedState) => number;
}

export const MILESTONES: MilestoneDef[] = [
  { id: "first-replay", title: "First replay", detail: "Watched a trade play out bar by bar", target: 1, value: (s) => s.progress.replays.length },
  { id: "replays-10", title: "Ten replays", detail: "Replays are where patterns start to feel familiar", target: 10, value: (s) => s.progress.replays.length },
  { id: "saved-5", title: "Curator", detail: "Saved five charts, setups or lessons", target: 5, value: (s) => savedKeys(s).size },
  { id: "first-collection", title: "Collection started", detail: "Grouped saved items into a collection", target: 1, value: (s) => s.collections.length },
  { id: "lessons-3", title: "Student of the game", detail: "Opened three lessons from the Feed", target: 3, value: (s) => s.progress.lessonsOpened.length },
  { id: "cards-100", title: "A hundred looks", detail: "Reviewed one hundred cards", target: 100, value: (s) => s.progress.totalCards },
  { id: "days-7", title: "Seven days of study", detail: "Visited the Feed on seven different days — any seven", target: 7, value: (s) => daysVisited(s) },
];

export interface MilestoneRow {
  def: MilestoneDef;
  value: number;
  done: boolean;
  at: number | null;
}

export function milestoneRows(s: FeedState): MilestoneRow[] {
  return MILESTONES.map((def) => {
    const value = def.value(s);
    const at = s.milestones[def.id] ?? null;
    return { def, value: Math.min(value, def.target), done: at !== null || value >= def.target, at };
  });
}

/** Marks every newly satisfied milestone as earned. Already-earned ones are never touched or re-announced. */
export function awardMilestones(s: FeedState, now: number): { state: FeedState; earned: MilestoneDef[] } {
  const earned: MilestoneDef[] = [];
  const milestones = { ...s.milestones };
  for (const def of MILESTONES) {
    if (milestones[def.id] === undefined && def.value(s) >= def.target) {
      milestones[def.id] = now;
      earned.push(def);
    }
  }
  return earned.length ? { state: { ...s, milestones }, earned } : { state: s, earned };
}
