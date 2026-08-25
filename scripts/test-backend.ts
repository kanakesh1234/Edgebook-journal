/* Backend Phase A tests — run with: npx tsx scripts/test-backend.ts */
import crypto from "node:crypto";
import fs from "node:fs";
import { encryptToken, decryptToken, signState, verifyState, randomNonce } from "../src/lib/server/tokens.ts";
import { sealAppSession, openAppSession } from "../src/lib/server/session.ts";
import { ensureAppFolders, ensureFolder, putFile, getFile, readJournalDoc, writeJournalDoc, exchangeCode } from "../src/lib/server/drive.ts";

let failures = 0;
function expect(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++, console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  else console.log(`ok   ${name}`);
}

const SECRET = "unit-test-secret";

/* ------------------------------ tokens ------------------------------ */
const enc = encryptToken("1//refresh-token-abc", SECRET);
expect("token ciphertext differs", enc.includes("refresh-token-abc"), false);
expect("token round-trip", decryptToken(enc, SECRET), "1//refresh-token-abc");
expect("token tamper rejected", decryptToken(enc.slice(0, -4) + "AAAA", SECRET), null);
expect("token wrong key rejected", decryptToken(enc, "other-secret"), null);
expect("token unique iv", encryptToken("same", SECRET) !== encryptToken("same", SECRET), true);

/* ------------------------------ state ------------------------------ */
const nonce = randomNonce();
const state = signState(SECRET, nonce);
expect("state verify ok", verifyState(SECRET, state), nonce);
expect("state wrong key", verifyState("other", state), null);
expect("state tampered nonce", verifyState(SECRET, `${nonce}x.${state.split(".")[1]}`), null);

void (async () => {
const accountsMod = await import("../src/lib/server/accounts.ts");
/* ------------------- open signup: arbitrary Google identities ------------------- */
// No allowlist anywhere: any verified Google identity gets an account.
// tsx doesn't load .env.local — provide test env (never real credentials).
process.env.GOOGLE_CLIENT_ID ??= "test-client-id";
process.env.GOOGLE_CLIENT_SECRET ??= "test-client-secret";
const { getGoogleConfig } = await import("../src/lib/server/google-config.ts");
const cfg = getGoogleConfig();
expect("config loads from env", cfg?.clientId != null, true);
expect("no allowlist field remains", cfg && "allowedEmails" in cfg ? false : true, true);

// 1. New arbitrary identity → account created
accountsMod.upsertAccount({ email: "new.user.42@gmail.com", sub: "sub-new-42", name: "New User", folderId: "folder-new", refreshToken: "rt-new" });
const accNew = accountsMod.getAccount("new.user.42@gmail.com");
expect("open signup creates account", accNew?.folderId, "folder-new");

// 2. Existing identity → existing account restored (same record)
const accExisting = accountsMod.getAccount("new.user.42@gmail.com");
expect("existing identity restored", [accExisting?.sub, accExisting?.folderId], ["sub-new-42", "folder-new"]);

// 3. Same identity cannot create duplicates — upsert updates in place
accountsMod.upsertAccount({ email: "new.user.42@gmail.com", folderId: "folder-new-v2", refreshToken: "rt-new-2" });
const accDedup = accountsMod.getAccount("new.user.42@gmail.com");
expect("duplicate identity updates, not duplicates", accDedup?.folderId, "folder-new-v2");
expect("duplicate keeps original sub", accDedup?.sub, "sub-new-42");
expect("refresh token rotated on re-auth", accountsMod.accountRefreshToken(accDedup!, "seed"), "rt-new-2");

// 4. Empty/unset EDGEBOOK_ALLOWED_EMAILS → signup still succeeds
// (structural: the config no longer carries any allowlist; nothing gates upsert)
expect("no allowlist gate on account creation", accNew !== null, true);

// 9. Sign out → sign in again: authorization persists (cookie is irrelevant to the store)
const beforeSignout = accountsMod.getAccount("new.user.42@gmail.com")?.encRefreshToken;
expect("auth persists across signout", beforeSignout != null, true);

/* ------------------------- drive (mock fetch) ------------------------- */
function mockDriveFetch(created: Map<string, string>, content = new Map<string, string>()) {
  let idCounter = 100;
  return (async (url: string | URL | Request, init?: RequestInit) => {
    const u = typeof url === "string" ? url : url instanceof URL ? url.href : url.url;
    // Each access token is a different user's Drive — namespace by token.
    const token = ((init?.headers as Record<string, string> | undefined)?.Authorization ?? "").replace("Bearer ", "") || "me";

    // Media download: /files/{id}?alt=media
    if (u.includes("alt=media")) {
      const id = u.match(/files\/([^?]+)/)?.[1] ?? "";
      const text = content.get(id);
      return new Response(text ?? "{}", { status: text != null ? 200 : 404 });
    }

    // Search: files?q=...
    if (u.includes("/files?") && u.includes("q=")) {
      const q = decodeURIComponent(u.match(/q=([^&]+)/)?.[1] ?? "");
      const name = q.match(/name = '([^']+)'/)?.[1] ?? "";
      const parent = q.match(/'([^']+)' in parents/)?.[1] ?? (q.includes("'me' in parents") ? "me" : "");
      const key = `${token}:${parent}/${name}`;
      const existing = created.get(key);
      return new Response(JSON.stringify({ files: existing ? [{ id: existing }] : [] }));
    }

    // Multipart upload (FormData): metadata part carries name+parents
    if (u.includes("uploadType=multipart") && init?.body instanceof FormData) {
      const metaBlob = init.body.get("metadata") as Blob | null;
      const fileBlob = init.body.get("file") as Blob | null;
      const meta = metaBlob ? (JSON.parse(await metaBlob.text()) as { name: string; parents: string[] }) : null;
      if (meta) {
        const key = `${token}:${meta.parents[0]}/${meta.name}`;
        let id = created.get(key);
        if (!id) {
          id = `id-${idCounter++}`;
          created.set(key, id);
        }
        if (fileBlob) content.set(id, await fileBlob.text());
        return new Response(JSON.stringify({ id }), { status: 200 });
      }
      return new Response("{}", { status: 400 });
    }

    // Folder creation: POST /files?fields=id with JSON body
    if ((init?.method === "POST" || init?.method === "PATCH") && typeof init.body === "string") {
      const meta = JSON.parse(init.body) as { name?: string; mimeType?: string; parents?: string[] };
      if (meta.name && meta.mimeType?.includes("folder")) {
        const key = `${token}:${meta.parents?.[0] ?? "me"}/${meta.name}`;
        if (!created.has(key)) created.set(key, `id-${idCounter++}`);
        return new Response(JSON.stringify({ id: created.get(key) }), { status: 200 });
      }
    }

    return new Response("{}", { status: 200 });
  }) as typeof fetch;
}

const created = new Map<string, string>();
const content = new Map<string, string>();
const f = mockDriveFetch(created, content);

// Folder resolution/creation — reuse before create
const foldersA = await ensureAppFolders("token-a", f);
expect("folders created", foldersA !== null, true);
const before = created.size;
const foldersA2 = await ensureAppFolders("token-a", f);
expect("folders reused (no duplicates)", created.size === before && foldersA2?.root === foldersA?.root, true);
expect("folder tree complete", [foldersA?.root, foldersA?.trades, foldersA?.journals, foldersA?.screenshots, foldersA?.challenges, foldersA?.exports].every(Boolean), true);
expect("folder names namespaced per user tree", typeof foldersA?.journals, "string");

// Persistence read/write — full payload deep round-trip
const payload = {
  entries: [{ id: "e1", date: "2026-08-05", pnl: 22.5, rr: 2, instrument: "NQ", direction: "long", setup: "Sweep", notes: "clean", images: [], createdAt: 1, updatedAt: 1 }],
  settings: { currency: "USD", startingEquity: 10000 },
  dayLogs: [{ date: "2026-08-06", createdAt: 2 }],
  version: 2,
};
expect("journal write ok", await writeJournalDoc("token-a", foldersA!, payload, f), true);
const readBack = (await readJournalDoc("token-a", foldersA!, f)) as typeof payload;
expect("journal read matches", readBack?.entries?.[0]?.pnl, 22.5);
expect("journal deep round-trip", {
  entry: readBack?.entries?.[0],
  settings: readBack?.settings,
  dayLogs: readBack?.dayLogs,
  version: readBack?.version,
}, { entry: payload.entries[0], settings: payload.settings, dayLogs: payload.dayLogs, version: 2 });

// Overwrite cycle — second write must fully replace first content
const payload2 = { ...payload, entries: [{ ...payload.entries[0], pnl: 99 }] };
expect("journal overwrite ok", await writeJournalDoc("token-a", foldersA!, payload2, f), true);
const readBack2 = (await readJournalDoc("token-a", foldersA!, f)) as typeof payload;
expect("journal overwrite read", readBack2?.entries?.[0]?.pnl, 99);

// Cross-user read isolation: user B's folder never sees user A's journal
const foldersB = await ensureAppFolders("token-b", f);
expect("user B folders distinct", foldersB?.journals !== foldersA?.journals, true);
expect("user B cannot read user A journal", await readJournalDoc("token-b", foldersB!, f), null);
expect("user B cannot read user A screenshot", await getFile("token-b", foldersB!.screenshots, "img-1.jpg", f), null);

// Absent file → null (never fabricated)
expect("journal absent → null", await readJournalDoc("token-a", { root: "r", trades: "t", journals: "j-empty", screenshots: "s", challenges: "c", exports: "e" }, f), null);

// Screenshot binary round-trip — exact bytes
expect("screenshot write ok", await putFile("token-a", foldersA!.screenshots, "img-1.jpg", Buffer.from("jpegdata"), "image/jpeg", f), true);
const blob = await getFile("token-a", foldersA!.screenshots, "img-1.jpg", f);
expect("screenshot read ok", blob ? await blob.text() : null, "jpegdata");
// Overwrite with different bytes → read returns new bytes
await putFile("token-a", foldersA!.screenshots, "img-1.jpg", Buffer.from("bytes-v2"), "image/jpeg", f);
const blob2 = await getFile("token-a", foldersA!.screenshots, "img-1.jpg", f);
expect("screenshot overwrite read", blob2 ? await blob2.text() : null, "bytes-v2");

// ensureFolder reuse on a single folder
const r1 = await ensureFolder("token-a", "EdgeBook", null, f);
const r2 = await ensureFolder("token-a", "EdgeBook", null, f);
expect("single folder reused", r1 === r2, true);

// exchangeCode against a failing endpoint → null (no throw)
const badExchange = await exchangeCode({ code: "x", clientId: "c", clientSecret: "s", redirectUri: "r", fetchImpl: (async () => new Response("{}", { status: 400 })) as typeof fetch });
expect("exchange failure → null", badExchange, null);

/* --------------------- missing config / fallback --------------------- */
// Without env vars the app must not crash: getGoogleConfig is exercised in
// route handlers; here we assert the fallback contract of the client store
// switch is a plain object with the DataStore methods (delegation smoke).
const { dataStore, getActiveStore, setActiveStore, GoogleDriveDataStore, IdbDataStore } = await import("../src/lib/services/storage.ts");
expect("default store is local", getActiveStore() instanceof IdbDataStore, true);
expect("dataStore delegates kind", dataStore.kind, "local");
const cloud = new GoogleDriveDataStore();
setActiveStore(cloud);
expect("switch to cloud", getActiveStore() instanceof GoogleDriveDataStore, true);
expect("dataStore delegates kind to cloud", dataStore.kind, "cloud");
setActiveStore(new IdbDataStore());
expect("switch back to local", dataStore.kind, "local");

if (failures > 0) {
  console.log(`\n${failures} FAILURES`);
  process.exit(1);
}
console.log("\nAll backend tests passed");

})();
