import { NextResponse } from "next/server";
import { getGoogleConfig, isEmailAllowed } from "@/lib/server/google-config";
import { verifyState } from "@/lib/server/tokens";
import { SESSION_COOKIE, sessionCookieOptions, sealSession, type DriveSession } from "@/lib/server/session";
import { ensureAppFolders, exchangeCode } from "@/lib/server/drive";

export const dynamic = "force-dynamic";

/** Step 3–6: OAuth callback — code→tokens, allowlist gate, folder provisioning. */
export async function GET(request: Request) {
  const config = getGoogleConfig();
  if (!config) {
    return NextResponse.redirect(new URL("/settings?drive=not_configured", request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const cookies = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .reduce<Record<string, string>>((acc, c) => {
      const [k, ...v] = c.split("=");
      acc[k] = decodeURIComponent(v.join("="));
      return acc;
    }, {}) ?? {};

  const nonceCookie = cookies["edgebook.oauth.state"];

  if (error) return NextResponse.redirect(new URL(`/settings?drive=${encodeURIComponent(error)}`, request.url));
  if (!code || !state || !nonceCookie || verifyState(config.tokenSecret, state) !== nonceCookie) {
    return NextResponse.redirect(new URL("/settings?drive=state_mismatch", request.url));
  }

  const tokens = await exchangeCode({
    code,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
  });
  if (!tokens?.refreshToken) {
    return NextResponse.redirect(new URL("/settings?drive=token_exchange_failed", request.url));
  }

  // Identify the user from Google's id_token payload (email is a JWT claim;
  // we decode the claim without verification because it arrived over the
  // direct token endpoint response — TLS-protected, no audience confusion).
  let email = "";
  let sub = "";
  try {
    const claims = JSON.parse(Buffer.from(tokens.idToken.split(".")[1], "base64url").toString("utf8")) as {
      email?: string;
      sub?: string;
      email_verified?: boolean;
    };
    email = (claims.email ?? "").toLowerCase();
    sub = claims.sub ?? "";
    if (claims.email_verified === false) email = "";
  } catch {
    /* fallthrough */
  }

  if (!email || !isEmailAllowed(config, email)) {
    return NextResponse.redirect(new URL("/settings?drive=not_allowed", request.url));
  }

  // Provision the user's private EdgeBook folder tree (reuse before create).
  const folders = await ensureAppFolders(tokens.accessToken);
  if (!folders) {
    return NextResponse.redirect(new URL("/settings?drive=folder_setup_failed", request.url));
  }

  const { encryptToken } = await import("@/lib/server/tokens");
  const session: DriveSession = {
    email,
    sub,
    folderId: folders.root,
    encRefreshToken: encryptToken(tokens.refreshToken, config.tokenSecret),
  };

  const res = NextResponse.redirect(new URL("/settings?drive=connected", request.url));
  res.cookies.set(SESSION_COOKIE, sealSession(session, config.tokenSecret), sessionCookieOptions());
  res.cookies.set("edgebook.oauth.state", "", { ...sessionCookieOptions(), maxAge: 0 });
  return res;
}
