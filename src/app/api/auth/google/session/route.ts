import { NextResponse } from "next/server";
import { getGoogleConfig } from "@/lib/server/google-config";
import { APP_SESSION_COOKIE, openAppSession, readCookie } from "@/lib/server/session";
import { verifyDriveConnection } from "@/lib/server/authed-drive";

export const dynamic = "force-dynamic";

/**
 * App session state for the client bootstrap.
 *
 * `drive.state` is explicit (never a collapsed boolean):
 *   connected               – server verified a working authorization
 *   auth_required           – Google definitively reports invalid_grant
 *   temporarily_unavailable – transient refresh/network failure; NOT a logout
 *   not_authorized          – no account/refresh token stored yet
 *
 * Verification uses the shared access-token cache: a real Google exchange
 * happens only when needed, so returning-user bootstrap stays fast.
 */
export async function GET(request: Request) {
  const config = getGoogleConfig();
  const sessionCookie = readCookie(request, APP_SESSION_COOKIE);
  const session = config && sessionCookie ? openAppSession(sessionCookie, config.tokenSecret) : null;

  if (!session) {
    return NextResponse.json({
      configured: !!config,
      loggedIn: false,
      user: null,
      drive: { connected: false, state: "not_authorized", reason: "no_session" },
    });
  }

  console.log(`[BOOTSTRAP] session_check_success email_domain=${session.email.split("@")[1] ?? "?"}`);
  const { state, reason } = await verifyDriveConnection(session, config!);
  console.log(`[BOOTSTRAP] drive_state=${state} reason=${reason}`);

  return NextResponse.json({
    configured: !!config,
    loggedIn: true,
    user: { id: `g_${session.sub}`, name: session.name, email: session.email },
    drive: { connected: state === "connected", state, reason },
  });
}
