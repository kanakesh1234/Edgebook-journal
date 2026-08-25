import { NextResponse } from "next/server";
import { getGoogleConfig, googleAuthUrl } from "@/lib/server/google-config";
import { signState, randomNonce } from "@/lib/server/tokens";
import { OAUTH_STATE_COOKIE, sessionCookieOptions } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/**
 * Begin Google authentication: Edge Book sign-in/sign-up AND first-time
 * Drive authorization in a single consent. `?next=/path` is carried
 * through the state cookie and honored by the callback.
 */
export async function GET(request: Request) {
  const config = getGoogleConfig();
  if (!config) {
    return NextResponse.json(
      {
        error: "google_not_configured",
        message:
          "Google OAuth is not configured on this server. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (and optionally GOOGLE_REDIRECT_URI) in .env.local.",
      },
      { status: 503 },
    );
  }

  const next = new URL(request.url).searchParams.get("next") ?? "/dashboard";
  const nonce = randomNonce();
  const state = signState(config.tokenSecret, nonce);

  const res = NextResponse.redirect(googleAuthUrl(config, state));
  res.cookies.set(
    OAUTH_STATE_COOKIE,
    JSON.stringify({ nonce, next }),
    { ...sessionCookieOptions(request), maxAge: 600 }, // 10 minutes to complete consent
  );
  return res;
}
