import { NextResponse } from "next/server";
import { getGoogleConfig } from "@/lib/server/google-config";
import { verifyState } from "@/lib/server/tokens";
import { APP_SESSION_COOKIE, OAUTH_STATE_COOKIE, readCookie, sealAppSession, sessionCookieOptions } from "@/lib/server/session";
import { upsertAccount } from "@/lib/server/accounts";
import { ensureAppFolders, exchangeCode } from "@/lib/server/drive";

export const dynamic = "force-dynamic";

/**
 * OAuth callback — the single entry point that:
 *   1. validates the CSRF state
 *   2. exchanges the code for tokens
 *   3. verifies the Google account (allowlist — private two-user phase)
 *   4. provisions (or reuses) the user's EdgeBook Drive folder tree
 *   5. persists the Drive authorization SERVER-SIDE per Edge Book user
 *   6. creates the Edge Book app session (identity-only cookie)
 *
 * Returning users: Google auto-approves (no re-consent); the stored
 * refresh token is kept when Google doesn't issue a new one.
 */
export async function GET(request: Request) {
  const config = getGoogleConfig();
  if (!config) {
    return NextResponse.redirect(new URL("/login?drive=not_configured", request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const stateCookie = readCookie(request, OAUTH_STATE_COOKIE);

  const fail = (reason: string) => NextResponse.redirect(new URL(`/login?drive=${encodeURIComponent(reason)}`, request.url));

  if (error) return fail(error);
  if (!code || !state || !stateCookie) return fail("state_mismatch");

  let nonce = "";
  let next = "/dashboard";
  try {
    const parsed = JSON.parse(stateCookie) as { nonce: string; next?: string };
    nonce = parsed.nonce;
    if (parsed.next?.startsWith("/")) next = parsed.next;
  } catch {
    return fail("state_mismatch");
  }
  if (verifyState(config.tokenSecret, state) !== nonce) return fail("state_mismatch");

  const tokens = await exchangeCode({
    code,
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    redirectUri: config.redirectUri,
  });
  if (!tokens) return fail("token_exchange_failed");

  // Identify the user from the id_token claims (obtained directly from the
  // TLS-protected token endpoint — no client involvement).
  let email = "";
  let sub = "";
  let name = "";
  try {
    const claims = JSON.parse(Buffer.from(tokens.idToken.split(".")[1], "base64url").toString("utf8")) as {
      email?: string;
      sub?: string;
      name?: string;
      email_verified?: boolean;
    };
    email = (claims.email ?? "").toLowerCase();
    sub = claims.sub ?? "";
    name = claims.name ?? "";
    if (claims.email_verified === false) email = "";
  } catch {
    /* fallthrough */
  }

  if (!email) return fail("no_email");

  // Provision (or reuse) the user's private EdgeBook folder tree.
  const folders = await ensureAppFolders(tokens.accessToken);
  if (!folders) return fail("folder_setup_failed");

  // Persist the Drive authorization server-side per Edge Book user.
  // Returning users keep their stored refresh token when Google doesn't
  // issue a new one (Google only sends it on first consent).
  upsertAccount({
    email,
    sub,
    name: name || undefined,
    folderId: folders.root,
    refreshToken: tokens.refreshToken ?? undefined,
  });

  // Edge Book app session — identity only, no tokens.
  const res = NextResponse.redirect(new URL(next, request.url));
  res.cookies.set(
    APP_SESSION_COOKIE,
    sealAppSession({ email, name: name || email.split("@")[0], sub }, config.tokenSecret),
    sessionCookieOptions(request),
  );
  res.cookies.set(OAUTH_STATE_COOKIE, "", { ...sessionCookieOptions(request), maxAge: 0 });
  return res;
}
