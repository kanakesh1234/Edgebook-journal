/* SERVER-ONLY module — import exclusively from route handlers (src/app/api/**). Never import from client components. */

/* ------------------------------------------------------------------ */
/*  Google OAuth configuration — server-only                           */
/*                                                                      */
/*  Credentials live exclusively in environment variables and are       */
/*  never shipped to the browser. When configuration is missing the     */
/*  app reports a clear "not configured" state and the local-first      */
/*  DataStore keeps working.                                            */
/* ------------------------------------------------------------------ */

export interface GoogleConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  tokenSecret: string;
}

/** Least-privilege scope: app-created files only. */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const AUTH_SCOPE = `openid email ${DRIVE_SCOPE}`;

/**
 * Strips whitespace and rejects newline/control characters. A pasted env
 * value that accidentally contains a trailing newline (very common when
 * copy-pasting into a dashboard field) will crash Node's HTTP header
 * serializer with an opaque, unhandled 500 the moment it's used in a
 * redirect or Set-Cookie header. Better to fail clean here.
 */
function cleanEnvValue(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || /[\r\n\t\0]/.test(trimmed)) return null;
  return trimmed;
}

export function getGoogleConfig(): GoogleConfig | null {
  const clientId = cleanEnvValue(process.env.GOOGLE_CLIENT_ID);
  const clientSecret = cleanEnvValue(process.env.GOOGLE_CLIENT_SECRET);
  if (!clientId || !clientSecret) return null;

  const redirectUri =
    cleanEnvValue(process.env.GOOGLE_REDIRECT_URI) ?? "http://localhost:3000/api/auth/google/callback";

  // Token encryption key — dedicated secret preferred, falls back to the
  // client secret so a single-env setup still never stores plaintext tokens.
  const tokenSecret = cleanEnvValue(process.env.GOOGLE_TOKEN_SECRET) ?? clientSecret;

  return { clientId, clientSecret, redirectUri, tokenSecret };
}

export function isGoogleConfigured(): boolean {
  return getGoogleConfig() !== null;
}

export function googleAuthUrl(config: GoogleConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: AUTH_SCOPE,
    access_type: "offline",
    include_granted_scopes: "true",
    state,
    // No `prompt` → returning users with a live Google session and prior
    // consent sail straight through (true one-click login). First-time
    // users still get the consent screen because drive.file + offline
    // access have not been granted yet.
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
