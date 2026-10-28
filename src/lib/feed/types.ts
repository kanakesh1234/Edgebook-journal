/* ------------------------------------------------------------------ */
/*  Feed — shared types                                                */
/*                                                                      */
/*  Persisted state lives at settings.feed and rides the same guarded   */
/*  save path as everything else (→ Google Drive). It holds only small  */
/*  aggregates and id references — never trade or lesson content — so   */
/*  it stays far below the 4 MB journal limit.                          */
/* ------------------------------------------------------------------ */

import type { JournalEntry, PlaybookSetup } from "../types";
import type { LessonView } from "@/components/lessons/types";

/** Item key: `${kind}:${id}` — "trade:abc", "setup:su_1", "lesson:ls_3". */
export type FeedKey = string;

export interface FeedCollection {
  id: string;
  name: string;
  items: FeedKey[];
  createdAt: number;
}

export interface FeedMusicPrefs {
  /** Off by default. Turning it on is always a deliberate tap. */
  enabled: boolean;
  /** "ambient-calm" | "ambient-focus" | `custom:<trackId>` (a file the user added on this device). */
  source: string;
  /** 0–1 */
  volume: number;
}

export interface FeedPrefs {
  /** Minutes of Feed per day before a gentle break prompt. 0 = no limit. */
  dailyMinutes: number;
  /** Replays and videos start automatically when entering the active viewport unless turned off. */
  autoplayReplay: boolean;
  /** Marks that the autoplay preference uses the v2 default-on behavior. */
  autoplayV2?: boolean;
  haptics: boolean;
  music: FeedMusicPrefs;
}

export interface FeedDayStat {
  cards: number;
  replays: number;
  lessons: number;
}

export interface FeedProgress {
  /** YYYY-MM-DD → what happened that day. Trimmed to the last 60 days. */
  day: Record<string, FeedDayStat>;
  /** Replays watched to the end (first completion only). */
  replays: FeedKey[];
  /** Lessons opened from the Feed. */
  lessonsOpened: FeedKey[];
  /** Lifetime unique-card views. */
  totalCards: number;
}

export interface FeedState {
  v: 1;
  favorites: FeedKey[];
  collections: FeedCollection[];
  progress: FeedProgress;
  /** milestone id → timestamp earned. */
  milestones: Record<string, number>;
  prefs: FeedPrefs;
}

/* ------------------------------ cards ------------------------------ */

export interface CardBase {
  key: FeedKey;
  /** One honest sentence on why this card is here. Shown on the card. */
  reason: string;
  score: number;
}

export interface TradeCard extends CardBase {
  kind: "trade";
  entry: JournalEntry;
  replayable: boolean;
  hasImage: boolean;
  videoUrl?: string | null;
}
export interface SetupCard extends CardBase {
  kind: "setup";
  setup: PlaybookSetup;
  stats: { trades: number; wins: number; winRate: number | null; avgR: number | null };
}
export interface LessonCard extends CardBase {
  kind: "lesson";
  lesson: LessonView;
  /** Written by someone in the viewer's friend circle. */
  community: boolean;
  /** Optional embedded video URL extracted from the lesson. */
  videoUrl?: string | null;
}
export interface VideoCard extends CardBase {
  kind: "video";
  videoUrl: string;
  poster?: string | null;
  title: string;
  subtitle?: string;
  author?: string;
  href?: string;
}
export interface StarterCard extends CardBase {
  kind: "starter";
  id: "first-trade" | "first-setup" | "first-lesson";
}
export interface EndCard extends CardBase {
  kind: "end";
  seen: number;
}
export type FeedCard = TradeCard | SetupCard | LessonCard | VideoCard | StarterCard | EndCard;
