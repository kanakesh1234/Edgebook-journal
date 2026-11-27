import { NextResponse } from "next/server";
import { getGoogleConfig } from "@/lib/server/google-config";
import { APP_SESSION_COOKIE, openAppSession, readCookie, sealAppSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/**
 * Mints a short/standard HMAC-sealed Edgebook session token for the Safari
 * Quick Plan extension ONLY when the request carries a valid first-party
 * `edgebook.session` HttpOnly cookie.
 *
 * Why: Safari ITP blocks cross-origin cookies inside third-party iframes on
 * tradingview.com. The extension background context calls this endpoint using
 * the user's first-party Safari cookie and forwards the sealed session token
 * to `/embed/plan-trade` via `Authorization: Bearer <token>`.
 */
export async function GET(request: Request) {
  const config = getGoogleConfig();
  if (!config) {
    return NextResponse.json(
      { configured: false, loggedIn: false, token: null },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const cookie = readCookie(request, APP_SESSION_COOKIE);
  const session = cookie ? openAppSession(cookie, config.tokenSecret) : null;
  if (!session) {
    return NextResponse.json(
      { configured: true, loggedIn: false, token: null },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const token = sealAppSession(
    { email: session.email, name: session.name, sub: session.sub },
    config.tokenSecret,
  );

  return NextResponse.json(
    {
      configured: true,
      loggedIn: true,
      token,
      user: { id: `g_${session.sub}`, name: session.name, email: session.email },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
