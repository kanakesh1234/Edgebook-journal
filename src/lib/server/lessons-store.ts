import "server-only";

/**
 * Lesson types and constants. Nothing in this file touches a disk or a database:
 * all reads and writes go through ./storage (Upstash Redis + Vercel Blob).
 */
export type Block = { t: "text" | "image" | "video"; v: string };
export interface Lesson {
  id: string;
  author: string; // email, never sent to the browser
  title: string;
  subtitle: string;
  blocks: Block[]; // legacy lessons only
  html?: string; // sanitized rich text (current format)
  createdAt: number;
  /** Names shown under the title. Display only; `author` stays the owner. */
  bylines?: string[];
  settings?: { comments: boolean; reposts: boolean };
  likes: string[];
  reposts: string[];
  /** Emails of people who bookmarked this lesson. Private: only ever exposed as `savedByMe`. Absent on older lessons. */
  saves?: string[];
  comments: { id: string; by: string; body: string; at: number }[];
}

/** Uploaded lesson media lives in Vercel Blob under the "lessons/" folder. */
export const MEDIA_URL_SOURCE = "https://[a-z0-9-]+\\.public\\.blob\\.vercel-storage\\.com/lessons/[^\\s\"'<>)]+";
export const MEDIA_URL_EXACT = new RegExp(`^${MEDIA_URL_SOURCE}$`);

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
