import "server-only";
import { promises as fs } from "fs";
import path from "path";

/**
 * Lessons live in their own file. They are never written to journal.json
 * and never read by the Minato routes, so Minato's analysis is unaffected.
 * Local dev: .data/lessons.json  (add `.data/` to .gitignore).
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

export const DATA_DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DATA_DIR, "lessons.json");

export async function readLessons(): Promise<Lesson[]> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8")) as Lesson[];
  } catch {
    return [];
  }
}

export async function writeLessons(all: Lesson[]) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(all, null, 2));
}

export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

export async function removeMedia(lessons: Lesson[]) {
  for (const l of lessons) {
    const text = (l.html ?? "") + " " + l.blocks.map((b) => b.v).join(" ");
    for (const m of text.matchAll(/\/api\/lessons\/media\?id=([a-z0-9]+\.(?:png|jpg|gif|webp|mp4|webm|mov|mp3|wav|m4a|ogg))/g)) {
      await fs.unlink(path.join(DATA_DIR, "lesson-media", m[1])).catch(() => {});
    }
  }
}
