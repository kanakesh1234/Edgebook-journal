import { NextResponse } from "next/server";
import { sessionEmail, rateLimited } from "@/lib/server/auth";
import { getMetaFile, putMetaFile } from "@/lib/server/admin-drive";
import { BUNDLED_DIR, uid } from "@/lib/server/lessons-store";
import { promises as fs } from "node:fs";
import path from "node:path";

export const dynamic = "force-dynamic";

/** Vercel rejects request bodies over ~4.5 MB, so uploads are capped just under that. */
const MAX_BYTES = 4 * 1024 * 1024;

const TYPES: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp",
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
  "audio/mpeg": "mp3", "audio/wav": "wav", "audio/x-wav": "wav", "audio/mp4": "m4a", "audio/x-m4a": "m4a", "audio/ogg": "ogg",
};
const EXT_TO_TYPE: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", jfif: "image/jpeg", gif: "image/gif", webp: "image/webp",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4", ogg: "audio/ogg",
};
const EXT_TO_MIME = Object.fromEntries(Object.entries(TYPES).map(([m, e]) => [e, m])) as Record<string, string>;

/** Real file type from the first bytes: a renamed .exe/.html/.svg is rejected instead of being stored and served. */
function sniff(b: Buffer): string | null {
  const ascii = (from: number, to: number) => b.subarray(from, to).toString("latin1");
  if (b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 6 && ascii(0, 4) === "GIF8") return "image/gif";
  if (b.length > 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  if (b.length > 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WAVE") return "audio/wav";
  if (b.length > 12 && ascii(4, 8) === "ftyp") return ascii(8, 12).startsWith("qt") ? "video/quicktime" : /^M4[AB]/.test(ascii(8, 12)) ? "audio/mp4" : "video/mp4";
  if (b.length > 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "video/webm";
  if (b.length > 4 && ascii(0, 4) === "OggS") return "audio/ogg";
  if (b.length > 3 && (ascii(0, 3) === "ID3" || (b[0] === 0xff && (b[1] & 0xe0) === 0xe0))) return "audio/mpeg";
  return null;
}
const sameFamily = (a: string, b: string) => a.split("/")[0] === b.split("/")[0] || (a.startsWith("audio") && b.startsWith("video")) || (a.startsWith("video") && b.startsWith("audio"));

/** POST multipart "file" → { url, kind }. Always answers JSON { error } on failure so the editor can say why. */
export async function POST(request: Request) {
  const me = sessionEmail(request);
  if (!me) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
  if (rateLimited(`media:${me}`, 40, 10 * 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("file");
  } catch {
    return NextResponse.json({ error: "too_large" }, { status: 413 });
  }
  if (!(file instanceof File)) return NextResponse.json({ error: "no_file" }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "bad_content" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "too_large" }, { status: 413 });

  // Some browsers send an empty / generic type — fall back to the extension.
  const declared = file.type && file.type !== "application/octet-stream" ? file.type : EXT_TO_TYPE[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? "";
  if (!TYPES[declared]) return NextResponse.json({ error: "unsupported_type" }, { status: 415 });

  const buf = Buffer.from(await file.arrayBuffer());
  const real = sniff(buf);
  if (!real || !TYPES[real] || !sameFamily(real, declared)) return NextResponse.json({ error: "bad_content" }, { status: 415 });

  const ext = TYPES[real]; // trust the bytes, not the label
  const id = uid();
  try {
    await putMetaFile(`lm-${id}.${ext}`, buf, real);
  } catch (err) {
    console.error("[lessons/media] Drive upload failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "storage_failed" }, { status: 502 });
  }
  return NextResponse.json({ url: `/api/lessons/media?id=${id}.${ext}`, kind: real.startsWith("video") ? "video" : real.startsWith("audio") ? "audio" : "image" });
}

/** GET ?id=<file> — only signed-in users; served with a fixed type and nosniff so a file can never run as a page. */
export async function GET(request: Request) {
  if (!sessionEmail(request)) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const m = /^([a-z0-9]{6,40})\.(png|jpg|gif|webp|mp4|webm|mov|mp3|wav|m4a|ogg)$/.exec(id);
  if (!m) return NextResponse.json({ error: "bad_id" }, { status: 400 });
  try {
    let blob: Blob | null = await getMetaFile(`lm-${id}`);
    if (!blob) {
      // Uploaded before the move to Drive: it still ships inside the deployment. Serve it, and copy it to Drive once.
      const old = await fs.readFile(path.join(BUNDLED_DIR, "lesson-media", id)).catch(() => null);
      if (!old) return NextResponse.json({ error: "not_found" }, { status: 404 });
      await putMetaFile(`lm-${id}`, old, EXT_TO_MIME[m[2]]).catch(() => {});
      blob = new Blob([new Uint8Array(old)], { type: EXT_TO_MIME[m[2]] });
    }
    return new NextResponse(blob, {
      headers: {
        "Content-Type": EXT_TO_MIME[m[2]],
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Content-Disposition": "inline",
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    console.error("[lessons/media] Drive read failed:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "storage_failed" }, { status: 502 });
  }
}
