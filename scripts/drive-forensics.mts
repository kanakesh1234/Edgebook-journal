/* READ-ONLY forensic inspection of the user's real Google Drive.
 * Never creates, modifies or deletes anything. Never prints tokens.
 * Run: node --experimental-strip-types scripts/drive-forensics.mts
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ALGO = "aes-256-gcm";
function deriveKey(secret: string): Buffer {
  return crypto.scryptSync(secret, "edgebook.token.v1", 32);
}
function decryptToken(payload: string, secret: string): string | null {
  try {
    const [ivB64, tagB64, dataB64] = payload.split(".");
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const d = crypto.createDecipheriv(ALGO, deriveKey(secret), Buffer.from(ivB64, "base64url"));
    d.setAuthTag(Buffer.from(tagB64, "base64url"));
    return Buffer.concat([d.update(Buffer.from(dataB64, "base64url")), d.final()]).toString("utf8");
  } catch (e) {
    console.log(`  decrypt failed: ${(e as Error).message}`);
    return null;
  }
}

const env = (() => {
  const raw = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  const map: Record<string, string> = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) map[m[1]] = m[2].trim();
  }
  return map;
})();

const clientId = env.GOOGLE_CLIENT_ID!;
const clientSecret = env.GOOGLE_CLIENT_SECRET!;
const tokenSecret = env.GOOGLE_TOKEN_SECRET ?? clientSecret;
const API = "https://www.googleapis.com";

const accounts = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), ".edgebook", "accounts.json"), "utf8"),
) as Record<string, { email: string; folderId: string | null; encRefreshToken: string | null }>;

for (const [key, acct] of Object.entries(accounts)) {
  console.log(`\n=== ACCOUNT ${key} ===`);
  console.log(`stored folderId=${acct.folderId ?? "(none)"} hasRefreshToken=${!!acct.encRefreshToken}`);
  if (!acct.encRefreshToken) continue;

  // Per-user secret derivation — must match src/lib/server/accounts.ts
  const base = crypto.createHash("sha256").update(`${tokenSecret}:${acct.email.toLowerCase()}`).digest("hex");
  const refreshToken = decryptToken(acct.encRefreshToken!, base);
  if (!refreshToken) { console.log("  cannot decrypt refresh token — skipping"); continue; }

  const tokRes = await fetch(`${API}/oauth2/v4/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!tokRes.ok) {
    const body = await tokRes.text();
    console.log(`  TOKEN REFRESH FAILED status=${tokRes.status} body=${body.slice(0, 300)}`);
    continue;
  }
  const at = ((await tokRes.json()) as { access_token: string }).access_token;
  const H = { Authorization: `Bearer ${at}` };

  // 1. Verify stored folderId directly
  if (acct.folderId && !acct.folderId.startsWith("folder-")) {
    const r = await fetch(`${API}/drive/v3/files/${acct.folderId}?fields=id,name,createdTime,modifiedTime`, { headers: H });
    console.log(`  GET stored root → status=${r.status}` + (r.ok ? ` name=${(await r.json()).name}` : ` body=${(await r.text()).slice(0, 200)}`));
  }

  // 2. Enumerate ALL EdgeBook roots visible to this OAuth client (drive.file scope)
  const q = encodeURIComponent(
    `mimeType = 'application/vnd.google-apps.folder' and trashed = false and name = 'EdgeBook' and 'me' in parents`,
  );
  const listRes = await fetch(`${API}/drive/v3/files?q=${q}&fields=files(id,name,createdTime,modifiedTime)&pageSize=50`, { headers: H });
  const listJson = (await listRes.json()) as { files?: { id: string; createdTime?: string; modifiedTime?: string }[] };
  const folders = listJson.files ?? [];
  console.log(`  EdgeBook roots visible under drive.file scope: ${folders.length}`);

  let canonicalIdx = -1;
  for (let i = 0; i < folders.length; i++) {
    const f = folders[i];
    console.log(`\n  FOLDER ${String.fromCharCode(65 + i)} id=${f.id} created=${f.createdTime} modified=${f.modifiedTime}`);
    // children
    const cq = encodeURIComponent(`'${f.id}' in parents and trashed = false`);
    const cRes = await fetch(`${API}/drive/v3/files?q=${cq}&fields=files(id,name,mimeType)&pageSize=100`, { headers: H });
    const kids = ((await cRes.json()) as { files?: { id: string; name: string; mimeType: string }[] }).files ?? [];
    for (const k of kids) console.log(`    child: ${k.name} (${k.mimeType.includes("folder") ? "dir" : "file"}) id=${k.id}`);
    const jDir = kids.find((k) => k.name === "journals" && k.mimeType.includes("folder"));
    if (jDir) {
      const jq = encodeURIComponent(`'${jDir.id}' in parents and trashed = false`);
      const jRes = await fetch(`${API}/drive/v3/files?q=${jq}&fields=files(id,name,mimeType,size,modifiedTime)&pageSize=50`, { headers: H });
      const jfiles = ((await jRes.json()) as { files?: { id: string; name: string; size?: string; modifiedTime?: string }[] }).files ?? [];
      const jf = jfiles.find((x) => x.name === "journal.json");
      if (jf) {
        const media = await fetch(`${API}/drive/v3/files/${jf.id}?alt=media`, { headers: H });
        if (media.ok) {
          try {
            const doc = JSON.parse(await media.text()) as { entries?: unknown[] };
            console.log(`    journal.json: YES tradeCount=${doc.entries?.length ?? 0} fileId=${jf.id} size=${jf.size ?? "?"} modified=${jf.modifiedTime}`);
            if ((doc.entries?.length ?? 0) > 0) canonicalIdx = i;
          } catch { console.log(`    journal.json: PARSE FAILED`); }
        } else {
          console.log(`    journal.json read failed status=${media.status}`);
        }
      } else {
        console.log(`    journal.json: NO`);
      }
    }
  }
  if (canonicalIdx >= 0) {
    console.log(`\n  >>> DATA-BEARING FOLDER: ${String.fromCharCode(65 + canonicalIdx)} id=${folders[canonicalIdx].id}`);
    console.log(`  >>> stored account.folderId matches: ${acct.folderId === folders[canonicalIdx].id ? "YES" : "NO — MISMATCH"}`);
  }
}
console.log("\n(done — no mutations performed)");
