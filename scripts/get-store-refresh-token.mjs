// One-time setup script — run locally with: node scripts/get-store-refresh-token.mjs
//
// Obtains a refresh token for whichever Google account you sign in with here.
// That account's Drive is where EdgeBook will store its app-wide accounts.json
// and friends.json (replacing the local .edgebook/ folder that doesn't exist
// on Vercel). Any Google account works — your own is fine, it's just storage.
//
// Prerequisites:
//   1. In Google Cloud Console → your OAuth client → Authorized redirect URIs,
//      add:  http://localhost:8991/callback
//      (keep your existing http://localhost:3000/api/auth/google/callback too)
//   2. Have GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET available — either
//      exported in your shell, or present in .env.local (this script reads
//      .env.local automatically if the env vars aren't already set).

import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";

function loadDotEnvLocal() {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) return;
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}
loadDotEnvLocal();

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const PORT = 8991;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Missing GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (checked shell env and .env.local).");
  process.exit(1);
}

const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.searchParams.set("client_id", CLIENT_ID);
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/drive.file");
authUrl.searchParams.set("access_type", "offline");
authUrl.searchParams.set("prompt", "consent"); // force a refresh_token every run

console.log("\n1. Open this URL and sign in with the Google account you want to use for app storage:\n");
console.log(authUrl.toString());
console.log(`\n2. Waiting for the redirect to ${REDIRECT_URI} ...\n`);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  if (url.pathname !== "/callback") {
    res.writeHead(404).end();
    return;
  }
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  if (error || !code) {
    res.writeHead(400, { "Content-Type": "text/plain" }).end(`Google returned an error: ${error ?? "no code"}`);
    console.error("Failed:", error ?? "no code returned");
    server.close();
    process.exit(1);
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
    }),
  });
  const json = await tokenRes.json();

  if (!tokenRes.ok || !json.refresh_token) {
    res.writeHead(500, { "Content-Type": "text/plain" }).end("Token exchange failed — see terminal.");
    console.error("Token exchange failed:", json);
    console.error(
      json.error === "invalid_grant"
        ? "\nTip: the code was already used or expired — rerun the script and complete the flow quickly."
        : "",
    );
    server.close();
    process.exit(1);
  }

  res.writeHead(200, { "Content-Type": "text/plain" }).end("Done — check your terminal, then close this tab.");
  console.log("\nSuccess. Add this to your environment:\n");
  console.log(`ADMIN_GOOGLE_REFRESH_TOKEN=${json.refresh_token}`);
  console.log("\n- Locally: add the line above to .env.local");
  console.log("- Vercel: Project Settings → Environment Variables → add ADMIN_GOOGLE_REFRESH_TOKEN, then redeploy\n");
  server.close();
  process.exit(0);
});

server.listen(PORT);
