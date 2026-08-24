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
  allowedEmails: string[];
}

/** Least-privilege scope: app-created files only. */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const AUTH_SCOPE = `openid email ${DRIVE_SCOPE}`;

export function getGoogleConfig(): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const redirectUri =
    process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:3000/api/auth/google/callback";

  // Token encryption key — dedicated secret preferred, falls back to the
  // client secret so a single-env setup still never stores plaintext tokens.
  const tokenSecret = process.env.GOOGLE_TOKEN_SECRET ?? clientSecret;

  const allowedEmails = (process.env.EDGEBOOK_ALLOWED_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return { clientId, clientSecret, redirectUri, tokenSecret, allowedEmails };
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
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export function isEmailAllowed(config: GoogleConfig, email: string): boolean {
  // Private phase: when no allowlist is configured, allow the configured
  // accounts only through the allowlist — an empty list denies everyone
  // except during explicit local development (ALLOW_ANY_EMAIL=1).
  if (config.allowedEmails.length === 0) {
    return process.env.ALLOW_ANY_EMAIL === "1";
  }
  return config.allowedEmails.includes(email.toLowerCase());
}
