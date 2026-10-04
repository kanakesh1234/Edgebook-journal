import "server-only";
import { Redis } from "@upstash/redis";
import { del } from "@vercel/blob";
import { MEDIA_URL_SOURCE, type Lesson } from "./lessons-store";

/**
 * The ONLY file that talks to storage. API routes call these functions and never
 * touch Redis or Blob directly.
 *
 *  - Lessons  -> Upstash Redis, one hash ("edgebook:lessons"), field = lesson id, value = lesson JSON.
 *                Deleting any number of lessons is a single atomic HDEL.
 *  - Media    -> Vercel Blob (uploaded straight from the browser, see api/lessons/media/route.ts).
 *
 * Env vars (added automatically when you connect the stores in the Vercel dashboard):
 *   KV_REST_API_URL, KV_REST_API_TOKEN      (Upstash Redis, Marketplace)
 *   BLOB_READ_WRITE_TOKEN                   (Vercel Blob)
 * UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are accepted as alternative names.
 */
const LESSONS_KEY = "edgebook:lessons";

let client: Redis | null = null;
function db(): Redis {
  if (client) return client;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error("Storage is not configured: add KV_REST_API_URL and KV_REST_API_TOKEN (Upstash Redis) to the environment variables.");
  }
  client = new Redis({ url, token });
  return client;
}

/** Every lesson, unsorted. */
export async function getLessons(): Promise<Lesson[]> {
  const all = await db().hgetall<Record<string, Lesson>>(LESSONS_KEY);
  return all ? Object.values(all) : [];
}

export async function getLesson(id: string): Promise<Lesson | null> {
  if (!id) return null;
  return (await db().hget<Lesson>(LESSONS_KEY, id)) ?? null;
}

/** Create or overwrite one lesson (used for create, like, repost, save and comment). */
export async function saveLesson(lesson: Lesson): Promise<void> {
  await db().hset(LESSONS_KEY, { [lesson.id]: lesson });
}

/** Delete any number of lessons at once. Returns how many existed. */
export async function deleteLessons(ids: string[]): Promise<number> {
  const unique = [...new Set(ids)].filter(Boolean);
  if (!unique.length) return 0;
  return db().hdel(LESSONS_KEY, ...unique);
}

/** True when a lesson with this id is already stored (used by the migration script). */
export async function lessonExists(id: string): Promise<boolean> {
  return (await db().hexists(LESSONS_KEY, id)) === 1;
}

/** Deletes the Blob files used by these lessons. Best effort: it must never make a delete fail. */
export async function removeMedia(lessons: Lesson[]): Promise<void> {
  try {
    const urls = new Set<string>();
    for (const l of lessons) {
      const text = (l.html ?? "") + " " + (l.blocks ?? []).map((b) => b.v).join(" ");
      for (const m of text.matchAll(new RegExp(MEDIA_URL_SOURCE, "g"))) urls.add(m[0]);
    }
    if (urls.size) await del([...urls]);
  } catch (err) {
    console.error("[storage] media cleanup failed:", err);
  }
}
