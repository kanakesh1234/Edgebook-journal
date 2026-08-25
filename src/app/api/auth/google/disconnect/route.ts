import { NextResponse } from "next/server";
import { getGoogleConfig } from "@/lib/server/google-config";
import { APP_SESSION_COOKIE, openAppSession, readCookie, sessionCookieOptions } from "@/lib/server/session";
import { accountRefreshToken, clearDriveAuth, getAccount } from "@/lib/server/accounts";
import { revokeToken } from "@/lib/server/drive";

export const dynamic = "force-dynamic";

/**
 * Explicit Drive disconnect: revokes the token at Google and deletes the
 * stored authorization. The app session remains; Drive requires a fresh
 * authorization afterward.
 */
export async function POST(request: Request) {
  const config = getGoogleConfig();
  const sessionCookie = readCookie(request, APP_SESSION_COOKIE);
  const session = config && sessionCookie ? openAppSession(sessionCookie, config.tokenSecret) : null;

  if (config && session) {
    const account = getAccount(session.email);
    const secret = process.env.GOOGLE_TOKEN_SECRET ?? config.clientSecret;
    const refreshToken = account ? accountRefreshToken(account, secret) : null;
    if (refreshToken) await revokeToken(refreshToken);
    clearDriveAuth(session.email);
  }

  const res = NextResponse.json({ ok: true });
  return res;
}
