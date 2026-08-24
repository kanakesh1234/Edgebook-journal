import { NextResponse } from "next/server";
import { getGoogleConfig, googleAuthUrl } from "@/lib/server/google-config";
import { signState, randomNonce } from "@/lib/server/tokens";
import { SESSION_COOKIE, sessionCookieOptions } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/** Step 1–2: begin Google authorization (CSRF-protected state parameter). */
export async function GET() {
  const config = getGoogleConfig();
  if (!config) {
    return NextResponse.json(
      {
        error: "google_not_configured",
        message:
          "Google OAuth is not configured on this server. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (and optionally GOOGLE_REDIRECT_URI, EDGEBOOK_ALLOWED_EMAILS) in .env.local.",
      },
      { status: 503 },
    );
  }

  const nonce = randomNonce();
  const state = signState(config.tokenSecret, nonce);
  const res = NextResponse.redirect(googleAuthUrl(config, state));
  res.cookies.set(`edgebook.oauth.state`, nonce, {
    ...sessionCookieOptions(),
    maxAge: 600, // 10 minutes to complete consent
  });
  // Carry the signing context implicitly; state MAC already binds it.
  res.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions(), maxAge: 0 });
  return res;
}
