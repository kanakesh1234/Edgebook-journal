/* Scan ALL EdgeBook roots for journal data. READ-ONLY. */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ALGO = "aes-256-gcm";
function deriveKey(s: string): Buffer { return crypto.scryptSync(s, "edgebook.token.v1", 32); }
function decryptToken(p: string, s: string): string | null {
  try {
    const [iv, tag, data] = p.split(".");
    const d = crypto.createDecipheriv(ALGO, deriveKey(s), Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(data, "base64url")), d.final()]).toString("utf8");
  } catch { return null; }
}
const envRaw = fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
const env: Record<string, string> = {};
for (const line of envRaw.split("\n")) { const m = line.match(/^([A-Z_]+)=(.*)$/); if (m) env[m[1]] = m[2].trim(); }

const accounts = JSON.parse(fs.readFileSync(".edgebook/accounts.json", "utf8"));
const acct = accounts["kanakesh939264@gmail.com"];
const base = crypto.createHash("sha256").update(`${env.GOOGLE_TOKEN_SECRET}:${acct.email}`).digest("hex");
const rt = decryptToken(acct.encRefreshToken, base)!;
const tokRes = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ refresh_token: rt, client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, grant_type: "refresh_token" }),
});
const at = ((await tokRes.json()) as { access_token: string }).access_token;
const H = { Authorization: `Bearer ${at}` };
const API = "https://www.googleapis.com/drive/v3";

async function kidsOf(id: string) {
  const q = encodeURIComponent(`'${id}' in parents and trashed = false`);
  const res = await fetch(`${API}/files?q=${q}&fields=files(id,name,mimeType)&pageSize=100`, { headers: H });
  return ((await res.json()) as { files?: { id: string; name: string; mimeType: string }[] }).files ?? [];
}

const q = encodeURIComponent(`name = 'EdgeBook' and trashed = false`);
const listRes = await fetch(`${API}/files?q=${q}&fields=files(id,createdTime)&pageSize=200`, { headers: H });
const roots = ((await listRes.json()) as { files?: { id: string; createdTime?: string }[] }).files ?? [];
console.log(`total EdgeBook roots: ${roots.length}\n`);

let best = { id: "", count: -1, created: "" };
for (let i = 0; i < roots.length; i++) {
  const r = roots[i];
  const kids = await kidsOf(r.id);
  const jDir = kids.find((k) => k.name === "journals" && k.mimeType.includes("folder"));
  let tradeCount = 0;
  let journalFileId = "";
  let size = "";
  if (jDir) {
    const jq = encodeURIComponent(`'${jDir.id}' in parents and trashed = false`);
    const jRes = await fetch(`${API}/files?q=${jq}&fields=files(id,name,size)&pageSize=50`, { headers: H });
    const jfiles = ((await jRes.json()) as { files?: { id: string; name: string; size?: string }[] }).files ?? [];
    const jf = jfiles.find((x) => x.name === "journal.json");
    if (jf) {
      journalFileId = jf.id;
      size = jf.size ?? "?";
      const media = await fetch(`${API}/files/${jf.id}?alt=media`, { headers: H });
      if (media.ok) {
        try {
          const doc = JSON.parse(await media.text()) as { entries?: unknown[] };
          tradeCount = doc.entries?.length ?? 0;
        } catch { tradeCount = -1; }
      }
    }
  }
  const otherKids = kids.filter((k) => !["trades","journals","screenshots","challenges","exports"].includes(k.name)).map(k=>k.name);
  console.log(`#${String(i+1).padStart(2,"0")} id=${r.id} created=${r.createdTime} subs=${kids.length} journal=${journalFileId ? `YES(${tradeCount} trades, ${size}b)` : "NO"}${otherKids.length ? " OTHER:" + otherKids.join(",") : ""}${r.id === acct.folderId ? "  <== STORED/CANONICAL" : ""}`);
  if (tradeCount > best.count) best = { id: r.id, count: tradeCount, created: r.createdTime ?? "" };
}
console.log(`\n>>> RICHEST FOLDER: id=${best.id} trades=${best.count} created=${best.created}`);
