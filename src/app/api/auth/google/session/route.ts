import { NextResponse } from "next/server";
import { getGoogleConfig } from "@/lib/server/google-config";
import { decryptToken } from "@/lib/server/tokens";
import { APP_SESSION_COOKIE, openAppSession, readCookie } from "@/lib/server/session";
import { accountRefreshToken, getAccount } from "@/lib/server/accounts";
import { revokeToken } from "@/lib/server/drive";

export const dynamic = "force-dynamic";

/**
 * App session state for the client bootstrap.
 * `drive.connected` is VERIFIED: the stored server-side authorization must
 * successfully obtain a real access token from Google — a stale flag or a
 * revoked authorization reports connected:false.
 */
export async function GET(request: Request) {
  const config = getGoogleConfig();
  const sessionCookie = readCookie(request, APP_SESSION_COOKIE);
  const session = config && sessionCookie ? openAppSession(sessionCookie, config.tokenSecret) : null;

  let driveConnected = false;
  let driveReason = "not_authorized";
  if (session && config) {
    const account = getAccount(session.email);
    const secret = process.env.GOOGLE_TOKEN_SECRET ?? config.clientSecret;
    const refreshToken = account ? accountRefreshToken(account, secret) : null;
    if (!refreshToken) {
      driveConnected = false;
      driveReason = "not_authorized";
    } else {
      const { fetchAccessToken } = await import("@/lib/server/drive");
      const accessToken = await fetchAccessToken(refreshToken, config.clientId, config.clientSecret);
      driveConnected = !!accessToken;
      driveReason = accessToken ? "verified" : "revoked_or_invalid";
    }
  }

  return NextResponse.json({
    configured: !!config,
    loggedIn: !!session,
    user: session ? { id: `g_${session.sub}`, name: session.name, email: session.email } : null,
    drive: { connected: driveConnected, reason: driveReason },
  });
}
