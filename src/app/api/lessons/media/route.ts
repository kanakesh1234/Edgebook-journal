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

const EXT_TO_TYPE: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", jfif: "image/jpeg", gif: "image/gif", webp: "image/webp",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg",
};

/** Real image type from the first bytes, so a mislabelled or truncated upload is rejected instead of saved as a broken file. */
function sniffImage(b: Buffer): string | null {
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 6 && b.subarray(0, 4).toString("latin1") === "GIF8") return "image/gif";
  if (b.length > 12 && b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

/** POST multipart "file" → { url, kind } — always answers with JSON { error } on failure so the editor can say why. */
export async function POST(request: Request) {
  if (!loggedIn(request)) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    // Body missing, truncated or over a platform limit.
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }
  if (!(file instanceof File)) return NextResponse.json({ error: "no_file" }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "bad_content" }, { status: 400 });
  if (file.size > 50 * 1024 * 1024) return NextResponse.json({ error: "too_large" }, { status: 413 });

  // Some browsers send an empty / generic type — fall back to the file extension.
  const declared = file.type && file.type !== "application/octet-stream"
    ? file.type
    : EXT_TO_TYPE[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? "";
  let type = declared;
  let ext = TYPES[type];
  if (!ext) return NextResponse.json({ error: "unsupported_type" }, { status: 415 });

  const buf = Buffer.from(await file.arrayBuffer());
  if (type.startsWith("image/")) {
    const real = sniffImage(buf);
    if (!real) return NextResponse.json({ error: "bad_content" }, { status: 415 });
    if (real !== type) { type = real; ext = TYPES[real]; } // trust the bytes over the label
  }

  const id = uid();
  try {
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(path.join(DIR, `${id}.${ext}`), buf);
  } catch (err) {
    console.error("[lessons/media] could not write upload:", err);
    return NextResponse.json({ error: "storage_failed" }, { status: 500 });
  }
  return NextResponse.json({ url: `/api/lessons/media?id=${id}.${ext}`, kind: type.startsWith("video") ? "video" : type.startsWith("audio") ? "audio" : "image" });
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
