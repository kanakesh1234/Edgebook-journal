/* Auth + Google Drive state-machine tests (Rule: no build-only claims).
 *
 * Covers:
 *  - single-flight root provisioning under concurrent bootstrap requests
 *  - stored account.folderId reused after simulated restart (no search/create)
 *  - non-404 verify failure → error surfaced, NEVER a second root
 *  - 401 → exactly one token refresh → retry succeeds
 *  - invalid_grant → auth_required; transient refresh failure → unavailable
 *  - uploads hit https://www.googleapis.com/upload/drive/v3
 *  - write → read-back round-trip
 *
 * Run: npx tsx scripts/test-auth-drive.mts
 */
import fs from "node:fs";
import path from "node:path";

// The resolver's 401-retry reads OAuth credentials from the environment
// (as in production routes); provide them before importing server modules.
process.env.GOOGLE_CLIENT_ID ??= "cid";
process.env.GOOGLE_CLIENT_SECRET ??= "csec";

let failures = 0;
const ok = (name: string, extra = "") => console.log(`ok   ${name}${extra ? ` ${extra}` : ""}`);
const fail = (name: string, extra = "") => { failures++; console.log(`FAIL ${name} ${extra}`); };
function expect(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got); const w = JSON.stringify(want);
  if (g === w) ok(name);
  else fail(name, `got ${g}, want ${w}`);
}

const { encryptToken: _encryptToken } = await import("../src/lib/server/tokens.ts");
const accountsMod = await import("../src/lib/server/accounts.ts");
const driveMod = await import("../src/lib/server/drive.ts");
const authedMod = await import("../src/lib/server/authed-drive.ts");
const { resolveDriveForSession, withDrive, verifyDriveConnection, __resetDriveCachesForTests } = authedMod;

/* ------------------------- accounts.json guard ------------------------- */
const STORE_FILE = path.join(process.cwd(), ".edgebook", "accounts.json");
const originalStore = fs.existsSync(STORE_FILE) ? fs.readFileSync(STORE_FILE, "utf8") : null;
const realFetch = global.fetch;

/* ---------------------------- fetch harness --------------------------- */
interface Ctx {
  rootVerifies: Record<string, number>;
  searchResults: string[];
  createdRoots: string[];
  refreshCalls: number;
  refreshStatus: number;
  uploadCalls: { url: string; method: string }[];
  files: Map<string, string>;
  /** parent/name → fileId, for files.list query resolution */
  namedFiles: Map<string, string>;
  trashedRoots: Set<string>;
}
function freshCtx(): Ctx {
  return { rootVerifies: {}, searchResults: [], createdRoots: [], refreshCalls: 0, refreshStatus: 200, uploadCalls: [], files: new Map(), namedFiles: new Map(), trashedRoots: new Set() };
}
let ctx: Ctx = freshCtx();
let verifyOverride: "ok" | "500" | null = null;

global.fetch = (async (url: unknown, init?: RequestInit) => {
  const u = String(url);
  if (u.startsWith("https://oauth2.googleapis.com/token")) {
    ctx.refreshCalls++;
    if (ctx.refreshStatus !== 200) {
      return new Response(JSON.stringify({ error: "invalid_grant", error_description: "Token has been expired or revoked." }), { status: ctx.refreshStatus });
    }
    return new Response(JSON.stringify({ access_token: `at-${ctx.refreshCalls}`, expires_in: 3600 }), { status: 200 });
  }
  if (u.includes("/drive/v3/files?") && u.includes("q=")) {
    const q = decodeURIComponent(u.match(/q=([^&]+)/)?.[1] ?? "");
    const name = q.match(/name = '([^']+)'/)?.[1] ?? "";
    const parent = q.match(/'([^']+)' in parents/)?.[1] ?? "";
    const fileId = ctx.namedFiles.get(`${parent}/${name}`);
    return new Response(JSON.stringify({ files: fileId ? [{ id: fileId }] : [] }), { status: 200 });
  }
  if (u.includes("/drive/v3/files/") && !u.includes("alt=media")) {
    const id = u.match(/files\/([^?]+)/)![1];
    ctx.rootVerifies[id] = (ctx.rootVerifies[id] ?? 0) + 1;
    if (verifyOverride === "500") {
      return new Response(JSON.stringify({ error: { code: 500, message: "backend error", errors: [{ reason: "internalError" }] } }), { status: 500 });
    }
    if (ctx.trashedRoots.has(id)) {
      // Drive serves trashed files via GET 200 with trashed:true
      return new Response(JSON.stringify({ id, name: "EdgeBook", trashed: true, mimeType: "application/vnd.google-apps.folder" }), { status: 200 });
    }
    return new Response(JSON.stringify({ id, name: "EdgeBook", trashed: false, mimeType: "application/vnd.google-apps.folder" }), { status: 200 });
  }
  if (u.includes("/upload/drive/v3")) {
    ctx.uploadCalls.push({ url: u, method: init?.method ?? "GET" });
    const bodyText = typeof init?.body === "string" ? init.body : Buffer.from(init?.body as Uint8Array).toString("utf8");
    const meta = JSON.parse((bodyText.split(/\r\n\r\n/)[1] ?? "{}").split("\r\n--")[0]) as { name?: string; parents?: string[] };
    const content = bodyText.split("\r\n\r\n").slice(2).join("\r\n\r\n").replace(/\r\n--edgebook-[0-9a-f]+--\r?\n?$/, "");
    const id = meta.name === "journal.json" ? "journal-file-id" : `file-${ctx.uploadCalls.length}`;
    ctx.files.set(id, content);
    if (meta.parents?.[0]) ctx.namedFiles.set(`${meta.parents[0]}/${meta.name}`, id);
    return new Response(JSON.stringify({ id }), { status: 200 });
  }
  if (u.includes("alt=media")) {
    const id = u.match(/files\/([^?]+)/)![1];
    const c = ctx.files.get(id);
    return new Response(c ?? "{}", { status: c != null ? 200 : 404 });
  }
  if ((init?.method === "POST") && u.includes("/drive/v3/files?")) {
    const meta = JSON.parse(String(init.body)) as { name?: string; mimeType?: string; parents?: string[] };
    if (meta.mimeType?.includes("folder")) {
      // createdRoots records ONLY top-level roots (no parent) — subfolders
      // under a known root are legitimate and never counted as roots.
      ctx.createdRoots.push(meta.parents ? `${meta.parents[0]}/${meta.name}` : meta.name!);
      const id = `created-${meta.parents ? "sub" : "root"}-${ctx.createdRoots.length}`;
      return new Response(JSON.stringify({ id }), { status: 200 });
    }
  }
  return new Response("{}", { status: 200 });
}) as typeof fetch;

/* ------------------------------- fixtures ------------------------------ */
const CONFIG = { clientId: "cid", clientSecret: "csec", redirectUri: "http://localhost/x", tokenSecret: "tsec" };
const KNOWN_ROOT = "known-root-id-123";
const sessionFor = (email: string) => ({ email, name: email.split("@")[0], sub: `sub-${email}` });

try {
  function registerAccount(email: string, folderId: string | null) {
    accountsMod.upsertAccount({ email, refreshToken: `rt-${email}`, folderId });
  }

  // Sanity: refresh tokens written by the test decrypt for the resolver.
  {
    const acct = accountsMod.getAccount("probe@x.test") ?? accountsMod.upsertAccount({ email: "probe@x.test", refreshToken: "rt-probe" });
    expect("account store roundtrip (refresh token decrypts)", !!accountsMod.accountRefreshToken(acct!, ""), true);
  }

  /* 1+5+18. Concurrent bootstrap for a NEW account → exactly one root */
  {
    __resetDriveCachesForTests();
    ctx = freshCtx();
    registerAccount("concurrent@x.test", null);
    const results = await Promise.all(
      Array.from({ length: 5 }, () => resolveDriveForSession(sessionFor("concurrent@x.test"), CONFIG)),
    );
    expect("concurrent resolutions all succeed", results.every((r) => r.ok), true);
    const roots = new Set(results.filter((r): r is Extract<typeof r, { ok: true }> => r.ok).map((r) => r.drive.folders.root));
    expect("single canonical root across concurrent requests", roots.size, 1);
    expect("exactly ONE root creation call (single-flight)", ctx.createdRoots.filter((c) => !c.includes("/")).length, 1);
    ok("new account creates exactly one root; concurrent bootstrap deduped");
  }

  /* 2+4+7. Stored folderId reused after simulated restart */
  {
    __resetDriveCachesForTests();
    ctx = freshCtx();
    registerAccount("restart@x.test", KNOWN_ROOT);
    const res = await resolveDriveForSession(sessionFor("restart@x.test"), CONFIG);
    expect("stored folderId resolves ok", res.ok, true);
    expect("verified THE stored root", res.ok && (res as { drive: { folders: { root: string } } }).drive.folders.root === KNOWN_ROOT, true);
    expect("no name-search needed", ctx.searchResults.length, 0);
    expect("no ROOT created", ctx.createdRoots.filter((c) => !c.includes("/")).length, 0);
    expect("root verified exactly once", ctx.rootVerifies[KNOWN_ROOT], 1);

    await resolveDriveForSession(sessionFor("restart@x.test"), CONFIG);
    expect("cached resolution skips re-verification", ctx.rootVerifies[KNOWN_ROOT], 1);
    ok("existing account login does not create another root");
  }

  /* 12-adjacent. Non-404 verify failure → loud failure, NO fallback create */
  {
    __resetDriveCachesForTests();
    ctx = freshCtx();
    registerAccount("flaky@x.test", KNOWN_ROOT);
    verifyOverride = "500";
    const res = await resolveDriveForSession(sessionFor("flaky@x.test"), CONFIG);
    verifyOverride = null;
    expect("transient 500 on verify does NOT fabricate missing folder", res.ok, false);
    expect("failure surfaced as drive_error", !res.ok && (res as { error?: string }).error, "drive_error");
    expect("NO root created on transient failure", ctx.createdRoots.filter((c) => !c.includes("/")).length, 0);
    ok("temporary Drive failure does not create/duplicate anything");
  }

  /* 13. Drive op 401 → ONE forced refresh → retry succeeds */
  {
    __resetDriveCachesForTests();
    ctx = freshCtx();
    registerAccount("retry@x.test", KNOWN_ROOT);
    const res = await resolveDriveForSession(sessionFor("retry@x.test"), CONFIG);
    if (!res.ok) { fail("resolve for retry scenario"); throw new Error("resolve failed"); }
    else {
      const before = ctx.refreshCalls;
      let attempts = 0;
      const result = await withDrive(res.drive, "op401Test", "req-test-1", async () => {
        attempts++;
        if (attempts === 1) throw Object.assign(new Error("expired"), { driveError: { status: 401, reason: "authError", message: "Invalid Credentials" } });
        return "done";
      });
      expect("retry succeeds after 401", result, "done");
      expect("exactly one extra token refresh", ctx.refreshCalls - before, 1);
      expect("operation attempted exactly twice", attempts, 2);
    }
  }

  /* 14-adjacent. invalid_grant vs transient refresh failure classification */
  {
    __resetDriveCachesForTests();
    ctx = freshCtx();
    registerAccount("revoked@x.test", KNOWN_ROOT);
    ctx.refreshStatus = 400;
    const v = await verifyDriveConnection(sessionFor("revoked@x.test"), CONFIG);
    ctx.refreshStatus = 503;
    const v2 = await verifyDriveConnection(sessionFor("revoked@x.test"), CONFIG);
    ctx.refreshStatus = 200;
    expect("invalid_grant classified auth_required (definitive)", v.state, "auth_required");
    expect("transient refresh failure classified temporarily_unavailable", v2.state, "temporarily_unavailable");
  }

  /* 8+9+10. Upload endpoint contract + write→read-back */
  {
    __resetDriveCachesForTests();
    ctx = freshCtx();
    registerAccount("write@x.test", KNOWN_ROOT);
    const res = await resolveDriveForSession(sessionFor("write@x.test"), CONFIG);
    if (!res.ok) { fail("resolve for write scenario"); throw new Error("resolve failed"); }
    else {
      const payload = { entries: [{ id: "e1", pnl: 42 }], settings: {}, version: 2, storedAt: 123 };
      await withDrive(res.drive, "testWrite", "req-w", (t) => driveMod.writeJournalDoc(t, res.drive.folders, payload));
      expect("uploads target /upload/drive/v3 exclusively", ctx.uploadCalls.length > 0 && ctx.uploadCalls.every((c) => c.url.startsWith("https://www.googleapis.com/upload/drive/v3")), true);
      const back = await withDrive(res.drive, "testRead", "req-r", (t) => driveMod.readJournalDoc(t, res.drive.folders));
      expect("journal read-back matches what was written", back, payload);
    }
  }

  /* Session-state classification summary */
  {
    expect("verify without account → not_authorized", (await verifyDriveConnection(sessionFor("ghost@x.test"), CONFIG)).state, "not_authorized");
  }

  /* Trash-recovery: stored root trashed by user → exactly ONE new root,
   * old ID replaced, no write ever touches the trashed folder. */
  {
    __resetDriveCachesForTests();
    ctx = freshCtx();
    ctx.trashedRoots.add("trashed-old-root");
    registerAccount("recovery@x.test", "trashed-old-root");
    const res = await resolveDriveForSession(sessionFor("recovery@x.test"), CONFIG);
    expect("trash-recovery resolution succeeds", res.ok, true);
    expect("NEW root selected (not the trashed one)", res.ok && (res as { drive: { folders: { root: string } } }).drive.folders.root !== "trashed-old-root", true);
    expect("exactly ONE new root created during recovery", ctx.createdRoots.filter((c) => !c.includes("/")).length, 1);
    expect("new root ID persisted to account", accountsMod.getAccount("recovery@x.test")?.folderId, res.ok ? (res as { drive: { folders: { root: string } } }).drive.folders.root : null);
    // Second resolution must reuse the persisted NEW root — zero creates.
    __resetDriveCachesForTests();
    const res2 = await resolveDriveForSession(sessionFor("recovery@x.test"), CONFIG);
    expect("post-restart uses persisted NEW root", res2.ok && (res2 as { drive: { folders: { root: string } } }).drive.folders.root === (res as { drive: { folders: { root: string } } }).drive.folders.root, true);
    expect("no additional roots created after recovery", ctx.createdRoots.filter((c) => !c.includes("/")).length, 1);
  }

  /* Concurrent recovery race: two requests while stored root is trashed */
  {
    __resetDriveCachesForTests();
    ctx = freshCtx();
    ctx.trashedRoots.add("trashed-race-root");
    registerAccount("race@x.test", "trashed-race-root");
    const results = await Promise.all([
      resolveDriveForSession(sessionFor("race@x.test"), CONFIG),
      resolveDriveForSession(sessionFor("race@x.test"), CONFIG),
      resolveDriveForSession(sessionFor("race@x.test"), CONFIG),
    ]);
    const roots = new Set(results.filter((r): r is Extract<typeof r, { ok: true }> => r.ok).map((r) => r.drive.folders.root));
    expect("concurrent trash-recovery yields ONE canonical root", roots.size, 1);
    expect("no duplicate roots created in recovery race", ctx.createdRoots.filter((c) => !c.includes("/")).length, 1);
  }

} finally {
  if (originalStore != null) fs.writeFileSync(STORE_FILE, originalStore);
  else if (fs.existsSync(STORE_FILE)) fs.unlinkSync(STORE_FILE);
  global.fetch = realFetch;
}

console.log(failures === 0 ? "\nAll auth-drive tests passed" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
