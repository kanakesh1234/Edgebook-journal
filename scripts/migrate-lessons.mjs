// One-time migration: .data/lessons.json (+ .data/lesson-media/*)  ->  Upstash Redis + Vercel Blob.
//
// Run from the project root (needs Node 18+):
//   node scripts/migrate-lessons.mjs --dry-run     (shows what would happen, changes nothing)
//   node scripts/migrate-lessons.mjs               (does it)
//
// Reads KV_REST_API_URL, KV_REST_API_TOKEN and BLOB_READ_WRITE_TOKEN from .env.local.
// Safe to run more than once: lessons that are already in Redis are skipped.
import fs from "node:fs";
import path from "node:path";
import { Redis } from "@upstash/redis";
import { put } from "@vercel/blob";

const DRY = process.argv.includes("--dry-run");
const KEY = "edgebook:lessons";
const root = process.cwd();

// --- tiny .env.local loader (keeps real environment variables if already set) ---
try {
  for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith("#")) continue;
    process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* no .env.local: rely on the shell environment */ }

const lessonsFile = path.join(root, ".data", "lessons.json");
if (!fs.existsSync(lessonsFile)) {
  console.log("No .data/lessons.json found, nothing to migrate.");
  process.exit(0);
}
const lessons = JSON.parse(fs.readFileSync(lessonsFile, "utf8"));
console.log(`Found ${lessons.length} lesson(s) in .data/lessons.json${DRY ? "  [dry run]" : ""}`);

const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
if (!DRY && (!url || !token)) { console.error("Missing KV_REST_API_URL / KV_REST_API_TOKEN in .env.local"); process.exit(1); }
if (!DRY && !process.env.BLOB_READ_WRITE_TOKEN) { console.error("Missing BLOB_READ_WRITE_TOKEN in .env.local"); process.exit(1); }
const redis = DRY ? null : new Redis({ url, token });

const TYPES = {
  png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg",
};
const LEGACY = /\/api\/lessons\/media\?id=([a-z0-9]+\.(?:png|jpg|gif|webp|mp4|webm|mov|mp3|wav|m4a|ogg))/g;
const mediaDir = path.join(root, ".data", "lesson-media");
const uploaded = new Map(); // legacy file name -> blob url

let migrated = 0, skipped = 0, files = 0, missing = 0;
for (const lesson of lessons) {
  if (!DRY && (await redis.hexists(KEY, lesson.id)) === 1) { skipped++; console.log(`- skip   ${lesson.id}  (already in Redis)`); continue; }

  let json = JSON.stringify(lesson);
  for (const name of new Set([...json.matchAll(LEGACY)].map((m) => m[1]))) {
    const file = path.join(mediaDir, name);
    if (!fs.existsSync(file)) { missing++; console.warn(`  ! media file missing: ${name} (left as is)`); continue; }
    if (!uploaded.has(name)) {
      if (DRY) uploaded.set(name, `https://<store>.public.blob.vercel-storage.com/lessons/${name}`);
      else {
        const ext = name.split(".").pop();
        const blob = await put(`lessons/${name}`, fs.readFileSync(file), { access: "public", addRandomSuffix: true, contentType: TYPES[ext] });
        uploaded.set(name, blob.url);
      }
      files++;
    }
    json = json.split(`/api/lessons/media?id=${name}`).join(uploaded.get(name));
  }

  if (!DRY) await redis.hset(KEY, { [lesson.id]: JSON.parse(json) });
  migrated++;
  console.log(`+ ${DRY ? "would migrate" : "migrated"} ${lesson.id}  "${String(lesson.title).slice(0, 40)}"`);
}
console.log(`\nDone. lessons: ${migrated} ${DRY ? "to migrate" : "migrated"}, ${skipped} skipped. media files: ${files} ${DRY ? "to upload" : "uploaded"}, ${missing} missing.`);
if (!DRY) console.log("You can keep .data/ as a backup, but do not commit it (add .data/ to .gitignore).");
