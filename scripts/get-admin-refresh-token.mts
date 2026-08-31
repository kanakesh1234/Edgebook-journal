/* ONE-TIME setup script.
 *
 * Authorizes ONE Google account (yours, or a dedicated service account you
 * control) to hold the app's shared metadata — accounts.json and
 * friends.json — in its Drive, via a folder named "EdgeBook-Meta". This is
 * separate from each end user's own per-user Drive OAuth grant.
 *
 * Run: node --experimental-strip-types scripts/get-admin-refresh-token.mts
 *
 * Requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET already set in
 * .env.local (the same OAuth client the app already uses). Opens a local
 * loopback server on http://localhost:53682, prints the URL to visit, and
 * once you approve consent, prints the refresh token to paste into
 * ADMIN_GOOGLE_REFRESH_TOKEN (in .env.local, and in Vercel's project env
 * vars for production). The token is printed ONCE and not stored by this
 * script — copy it immediately.
 */
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import crypto from "node:crypto";

const env = (() => {
  const raw = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  const map: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) map[m[1]] = m[2].trim();
  }
  return map;
})();

const clientId = env.GOOGLE_CLIENT_ID;
const clientSecret = env.GOOGLE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set in .env.local — set those up first.");
  process.exit(1);
}

const PORT = 53682;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
// Least-privilege scope: this admin account only ever touches files this
// app itself creates in it — same scope already used for per-user Drive.
const SCOPE = "https://www.googleapis.com/auth/drive.file";

console.log(
  "\nIMPORTANT: this OAuth client's \"Authorized redirect URIs\" (Google Cloud Console) must include:\n" +
    `  ${REDIRECT_URI}\n` +
    "Add it if it's not already there, then re-run this script.\n",
);

const state = crypto.randomBytes(12).toString("hex");
const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: REDIRECT_URI,
  response_type: "code",
  scope: SCOPE,
  access_type: "offline",
  prompt: "consent", // force a refresh_token even if this account has authorized before
  state,
}).toString();

console.log("Open this URL, sign in with the Google account that should hold app metadata, and approve:\n");
console.log(authUrl.toString());
console.log(`\nWaiting for the redirect on ${REDIRECT_URI} ...`);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", REDIRECT_URI);
  if (url.pathname !== "/callback") {
    res.writeHead(404).end();
    return;
  }
  const code = url.searchParams.get("code");
  const returnedState = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error || !code || returnedState !== state) {
    res.writeHead(400, { "Content-Type": "text/plain" }).end("Auth failed — check the terminal and try again.");
    console.error(`\nOAuth failed: ${error ?? "state mismatch or missing code"}`);
    server.close();
    process.exit(1);
    return;
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId!,
        client_secret: clientSecret!,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
      }),
    });
    const json = (await tokenRes.json()) as { refresh_token?: string; access_token?: string; error?: string; error_description?: string };
    if (!tokenRes.ok || !json.refresh_token) {
      res.writeHead(500, { "Content-Type": "text/plain" }).end("Token exchange failed — check the terminal.");
      console.error(
        `\nToken exchange failed: ${json.error ?? tokenRes.status} ${json.error_description ?? ""}\n` +
          (json.access_token && !json.refresh_token
            ? "Google did not return a refresh_token — this account may have already granted consent " +
              "without offline access. Revoke access at https://myaccount.google.com/permissions and re-run.\n"
            : ""),
      );
      server.close();
      process.exit(1);
      return;
    }

    res.writeHead(200, { "Content-Type": "text/plain" }).end("Success — you can close this tab and return to the terminal.");
    console.log("\n✅ Admin Drive authorized.\n");
    console.log("Add this to .env.local AND to your Vercel project's environment variables:\n");
    console.log(`ADMIN_GOOGLE_REFRESH_TOKEN=${json.refresh_token}\n`);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain" }).end("Unexpected error — check the terminal.");
    console.error("\nUnexpected error during token exchange:", err);
  } finally {
    server.close();
  }
});

server.listen(PORT);
