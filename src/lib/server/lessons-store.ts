import "server-only";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { deleteMetaFile, readMetaJson, updateMetaJson } from "./admin-drive";

/**
 * Lessons live in their own file. They are never written to journal.json
 * and never read by the Minato routes, so Minato's analysis is unaffected.
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
  /** Optional custom cover photo (a Lessons media URL). When absent, the cover is the first image in the lesson, as before. */
  cover?: string;
  /** Names shown under the title. Display only; `author` stays the owner. */
  bylines?: string[];
  settings?: { comments: boolean; reposts: boolean };
  likes: string[];
  reposts: string[];
  /** Emails of people who bookmarked this lesson. Private: only ever exposed as `savedByMe`. Absent on older lessons. */
  saves?: string[];
  comments: { id: string; by: string; body: string; at: number }[];
}

const FILE = "lessons.json";

/**
 * Lessons are stored in the admin Drive folder (the same place as accounts.json / friends.json).
 * The local `.data/` folder is gone: Vercel's filesystem is read-only, which is what produced
 * "EROFS: read-only file system, open '/var/task/.data/lessons.json'".
 */
/**
 * Lessons that were deployed inside the app's old `.data/` folder (read-only on Vercel). They seed the Drive copy the
 * first time it is created, so lessons written before this change don't disappear. Absent folder = empty list.
 */
export const BUNDLED_DIR = path.join(process.cwd(), ".data");
async function bundledLessons(): Promise<Lesson[]> {
  try {
    const parsed = JSON.parse(await fs.readFile(path.join(BUNDLED_DIR, "lessons.json"), "utf8")) as unknown;
    return Array.isArray(parsed) ? (parsed as Lesson[]) : [];
  } catch {
    return [];
  }
}

export async function readLessons(): Promise<Lesson[]> {
  return readMetaJson<Lesson[]>(FILE, await bundledLessons());
}

/** Change the lessons list safely (serialised, so two quick actions can't overwrite each other). */
export function updateLessons<R>(fn: (all: Lesson[]) => { next?: Lesson[]; result: R } | Promise<{ next?: Lesson[]; result: R }>): Promise<R> {
  return bundledLessons().then((seed) => updateMetaJson<Lesson[], R>(FILE, seed, fn));
}

export const uid = () => randomBytes(9).toString("base64url").replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 12) + Date.now().toString(36);

/** Exact match for one uploaded-media URL (used by lessons-html.ts to keep only files uploaded through Lessons). Not global, so .test() is safe to reuse. */
export const MEDIA_URL_EXACT = /^\/api\/lessons\/media\?id=[a-z0-9]+\.(png|jpg|gif|webp|mp4|webm|mov|mp3|wav|m4a|ogg)$/;

const MEDIA_REF = /\/api\/lessons\/media\?id=([a-z0-9]+\.(?:png|jpg|gif|webp|mp4|webm|mov|mp3|wav|m4a|ogg))/g;

/** Delete the uploaded files that belonged to removed lessons. Best effort — a failed cleanup never blocks a delete. */
export async function removeMedia(lessons: Lesson[]) {
  for (const l of lessons) {
    const text = (l.html ?? "") + " " + l.blocks.map((b) => b.v).join(" ") + " " + (l.cover ?? "");
    for (const m of text.matchAll(MEDIA_REF)) await deleteMetaFile(`lm-${m[1]}`).catch(() => {});
  }
}

/** A custom cover must be an image that was uploaded through Lessons. */
export const isCoverUrl = (v: string) => MEDIA_URL_EXACT.test(v) && /\.(png|jpg|gif|webp)$/.test(v);

const mediaIds = (l: Pick<Lesson, "html" | "blocks" | "cover">) => {
  const text = (l.html ?? "") + " " + (l.blocks ?? []).map((b) => b.v).join(" ") + " " + (l.cover ?? "");
  return new Set([...text.matchAll(MEDIA_REF)].map((m) => m[1]));
};

/** After an edit: delete uploaded files the lesson used before but no longer references. Best effort. */
export async function removeUnusedMedia(before: Pick<Lesson, "html" | "blocks" | "cover">, after: Pick<Lesson, "html" | "blocks" | "cover">) {
  const keep = mediaIds(after);
  for (const id of mediaIds(before)) if (!keep.has(id)) await deleteMetaFile(`lm-${id}`).catch(() => {});
}
