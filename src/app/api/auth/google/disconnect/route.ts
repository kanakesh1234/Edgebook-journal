import { NextResponse } from "next/server";
import { getGoogleConfig } from "@/lib/server/google-config";
import { decryptToken } from "@/lib/server/tokens";
import { SESSION_COOKIE, openSession, sessionCookieOptions } from "@/lib/server/session";
import { revokeToken } from "@/lib/server/drive";

export const dynamic = "force-dynamic";

/** Step 8: disconnect — revoke the refresh token at Google and clear the session. */
export async function POST(request: Request) {
  const config = getGoogleConfig();
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.split("=")
    .slice(1)
    .join("=");

  const session = config && cookie ? openSession(decodeURIComponent(cookie), config.tokenSecret) : null;

  if (config && session) {
    const refreshToken = decryptToken(session.encRefreshToken, config.tokenSecret);
    if (refreshToken) await revokeToken(refreshToken);
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return res;
}
