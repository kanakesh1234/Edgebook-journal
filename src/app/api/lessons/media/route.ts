import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getGoogleConfig } from "@/lib/server/google-config";
import { APP_SESSION_COOKIE, openAppSession, readCookie } from "@/lib/server/session";
import { DATA_DIR, uid } from "@/lib/server/lessons-store";

export const dynamic = "force-dynamic";
const DIR = path.join(DATA_DIR, "lesson-media");
const TYPES: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
  "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/ogg": "ogg",
};

function loggedIn(request: Request) {
  const config = getGoogleConfig();
  const cookie = readCookie(request, APP_SESSION_COOKIE);
  return !!(config && cookie && openAppSession(cookie, config.tokenSecret)?.email);
}

/** POST multipart "file" → { url, kind } */
export async function POST(request: Request) {
  if (!loggedIn(request)) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
  const file = (await request.formData()).get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "no_file" }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "unsupported_type" }, { status: 415 });
  if (file.size > 50 * 1024 * 1024) return NextResponse.json({ error: "too_large" }, { status: 413 });
  const id = uid();
  await fs.mkdir(DIR, { recursive: true });
  await fs.writeFile(path.join(DIR, `${id}.${ext}`), Buffer.from(await file.arrayBuffer()));
  return NextResponse.json({ url: `/api/lessons/media?id=${id}.${ext}`, kind: file.type.startsWith("video") ? "video" : file.type.startsWith("audio") ? "audio" : "image" });
}

/** GET ?id=<file> */
export async function GET(request: Request) {
  if (!loggedIn(request)) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[a-z0-9]+\.(png|jpg|gif|webp|mp4|webm|mov|mp3|wav|m4a|ogg)$/.test(id)) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  try {
    const buf = await fs.readFile(path.join(DIR, id));
    const type = Object.entries(TYPES).find(([, e]) => id.endsWith("." + e))?.[0] ?? "application/octet-stream";
    return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400" } });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
