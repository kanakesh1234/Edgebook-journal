import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getGoogleConfig } from "@/lib/server/google-config";
import { APP_SESSION_COOKIE, openAppSession, readCookie } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const MAX_BYTES = 50 * 1024 * 1024;
const ALLOWED = [
  "image/png", "image/jpeg", "image/gif", "image/webp",
  "video/mp4", "video/webm", "video/quicktime",
  "audio/mpeg", "audio/wav", "audio/x-wav", "audio/mp4", "audio/x-m4a", "audio/ogg",
];

function loggedIn(request: Request) {
  const config = getGoogleConfig();
  const cookie = readCookie(request, APP_SESSION_COOKIE);
  return !!(config && cookie && openAppSession(cookie, config.tokenSecret)?.email);
}

/**
 * Files go from the browser straight to Vercel Blob (Vercel functions cannot accept bodies over 4.5 MB).
 * This route only hands out a short-lived upload token, and only to signed-in users.
 * Needs BLOB_READ_WRITE_TOKEN, which Vercel adds when you connect a Blob store.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as HandleUploadBody | null;
  if (!body) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  try {
    const result = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        if (!loggedIn(request)) throw new Error("not_logged_in");
        if (!pathname.startsWith("lessons/")) throw new Error("bad_path");
        return { allowedContentTypes: ALLOWED, maximumSizeInBytes: MAX_BYTES, addRandomSuffix: true };
      },
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "upload_failed";
    console.error("[lessons/media] token request failed:", err);
    return NextResponse.json({ error: message }, { status: message === "not_logged_in" ? 401 : 400 });
  }
}
