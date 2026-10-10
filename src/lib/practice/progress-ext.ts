import type { EntryImage, PracticeProgress } from "../types.ts";

/**
 * The game-layer fields stored inside `settings.practiceProgress` (the setting is saved as plain JSON, so extra
 * optional keys round-trip). Declared here so `lib/types.ts` does not have to change.
 */
/** One way a card can be asked. `choices` always contains `answer`. */
export interface IctVariant { kind: "mcq" | "true-false" | "cloze"; prompt: string; choices: string[]; answer: string; explanation?: string }

/** A question the trader wrote for themselves, with the pictures that go with it. Images live in the image store. */
export interface IctCard {
  id: string;
  question: string;
  answer: string;
  /** Optional "why" shown after answering. */
  notes?: string;
  /** The ICT idea this question tests, e.g. "Fair value gap". Cards with no concept sit under "Unsorted". */
  concept?: string;
  /** Free labels, lowercase and hyphenated, e.g. "ny-open". Used to filter and search. */
  tags?: string[];
  images: EntryImage[];
  createdAt: number;
  updatedAt: number;
  /** Fingerprint of question+answer the cached variants were written for; stale after an edit. */
  variantsFor?: string;
  variants?: IctVariant[];
  seen?: number;
  correct?: number;
  /** YYYY-MM-DD of the last time it was asked. */
  lastSeen?: string;
}

export interface GameFields {
  /** The trader's own ICT Lab questions. */
  ictCards?: IctCard[];
  /** Per-day quest bookkeeping (YYYY-MM-DD), trimmed to ~14 days. Quest progress itself is derived. */
  questLog?: Record<string, {
    rounds: number; passes: number; maxCombo: number; perfect: number;
    /** Best accuracy (0–1) of a round with at least 8 answers today. */
    bestAcc: number; ictCorrect: number; modes: string[]; claimed: string[]; allDone?: boolean;
  }>;
  /** Personal records. Only ever go up. */
  records?: { rounds: number; bestStreak: number; bestCombo: number; bestAccuracy: number; bestRoundXp: number; bestCorrect: number; questDays: number };
  /** Achievement id → date (YYYY-MM-DD) it was first unlocked. */
  achievements?: Record<string, string>;
}

export type GameProgress = PracticeProgress & GameFields;
