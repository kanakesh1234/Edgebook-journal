import { NextResponse } from "next/server";
import { APP_SESSION_COOKIE, sessionCookieOptions } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/**
 * Sign out of Edge Book: ends the app session only.
 * The Google Drive authorization stays securely stored server-side and is
 * restored automatically on the next Google sign-in.
 */
export async function POST(request: Request) {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(APP_SESSION_COOKIE, "", { ...sessionCookieOptions(request), maxAge: 0 });
  return res;
}
