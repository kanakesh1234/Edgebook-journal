import { NextResponse } from "next/server";
import { getAuthedDrive, newRequestId, withDrive } from "@/lib/server/authed-drive";
import { getFile, putFile } from "@/lib/server/drive";
import type { DriveError } from "@/lib/server/drive";

export const dynamic = "force-dynamic";

/**
 * Backtest-session persistence over the user's own Google Drive.
 *
 *   GET → { sessions, deleted }       the user's saved backtest sessions + deletion tombstones
 *   PUT → { upserts, deletes }        merge changes into backtests.json (server-side merge, newest wins)
 *
 * One JSON document per user (EdgeBook/journals/backtests.json), next to journal.json. The server MERGES the
 * incoming changes into whatever is stored, so two devices saving at different times never overwrite each other.
 * Journal replays ("Replay this trade") are rejected here on purpose — they are throw-away and never stored.
 */
const BACKTESTS_FILE = "backtests.json";
const MAX_BYTES = 8 * 1024 * 1024;
const TOMBSTONE_TTL_MS = 90 * 24 * 3600 * 1000;

type Session = { id: string; updatedAt?: number; config?: { replayTrade?: unknown } } & Record<string, unknown>;
type Doc = { version: 1; storedAt: number; sessions: Session[]; deleted: Record<string, number> };

const ID = /^[A-Za-z0-9_.:-]{1,120}$/;

function driveErrorResponse(err: unknown, requestId: string, operation: string): NextResponse | null {
  const de = (err as { driveError?: DriveError }).driveError;
  if (!de) return null;
  console.error(`[DRIVE] OP_FAILED requestId=${requestId} operation=${operation} status=${de.status} reason=${de.reason} message="${de.message}"`);
  const status = de.status >= 400 && de.status <= 599 ? de.status : 502;
  return NextResponse.json({ error: "drive_failed", detail: de.reason, googleStatus: de.status, message: de.message }, { status });
}

async function readDoc(token: string, folderId: string): Promise<Doc> {
  const blob = await getFile(token, folderId, BACKTESTS_FILE);
  if (!blob) return { version: 1, storedAt: 0, sessions: [], deleted: {} };
  try {
    const j = JSON.parse(await blob.text()) as Partial<Doc>;
    return { version: 1, storedAt: j.storedAt ?? 0, sessions: Array.isArray(j.sessions) ? j.sessions : [], deleted: j.deleted && typeof j.deleted === "object" ? j.deleted : {} };
  } catch {
    // A corrupt file must never be silently replaced by an empty one.
    throw Object.assign(new Error("backtests.json is not valid JSON"), { driveError: { status: 0, reason: "corrupt_backtests", message: "Stored backtests.json could not be parsed" } });
  }
}

export async function GET() {
  const authed = await getAuthedDrive();
  if (!authed.ok) return NextResponse.json({ error: authed.error }, { status: authed.status });
  const requestId = newRequestId();
  try {
    const doc = await withDrive(authed.drive, "readBacktests", requestId, (t) => readDoc(t, authed.drive.folders.journals));
    return NextResponse.json({ sessions: doc.sessions, deleted: doc.deleted });
  } catch (err) {
    const resp = driveErrorResponse(err, requestId, "readBacktests");
    if (resp) return resp;
    throw err;
  }
}

export async function PUT(request: Request) {
  const authed = await getAuthedDrive();
  if (!authed.ok) return NextResponse.json({ error: authed.error }, { status: authed.status });
  const requestId = newRequestId();

  let body: { upserts?: unknown; deletes?: unknown };
  try { body = (await request.json()) as typeof body; } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }
  const upserts = Array.isArray(body.upserts) ? (body.upserts as Session[]) : [];
  const deletes = Array.isArray(body.deletes) ? (body.deletes as unknown[]).filter((x): x is string => typeof x === "string" && ID.test(x)) : [];
  for (const s of upserts) {
    if (!s || typeof s.id !== "string" || !ID.test(s.id) || typeof s.config !== "object" || s.config === null) {
      return NextResponse.json({ error: "invalid_payload", message: "each session needs an id and a config" }, { status: 400 });
    }
  }

  try {
    const doc = await withDrive(authed.drive, "writeBacktests", requestId, async (t) => {
      const cur = await readDoc(t, authed.drive.folders.journals);
      const now = Date.now();
      const byId = new Map(cur.sessions.map((s) => [s.id, s]));
      const deleted = { ...cur.deleted };
      for (const id of deletes) { byId.delete(id); deleted[id] = now; }
      for (const s of upserts) {
        if (s.config?.replayTrade) continue; // journal replays are throw-away
        if ((deleted[s.id] ?? 0) >= (s.updatedAt ?? 0)) continue; // deleted after this edit was made
        const prev = byId.get(s.id);
        if (!prev || (s.updatedAt ?? 0) >= (prev.updatedAt ?? 0)) { byId.set(s.id, s); delete deleted[s.id]; }
      }
      for (const [id, ts] of Object.entries(deleted)) if (now - ts > TOMBSTONE_TTL_MS) delete deleted[id];
      const next: Doc = { version: 1, storedAt: now, sessions: [...byId.values()], deleted };
      const json = JSON.stringify(next);
      if (Buffer.byteLength(json) > MAX_BYTES) {
        throw Object.assign(new Error("too large"), { driveError: { status: 413, reason: "backtests_too_large", message: "Backtest sessions exceed the 8 MB Drive limit — delete old sessions." } });
      }
      await putFile(t, authed.drive.folders.journals, BACKTESTS_FILE, Buffer.from(json), "application/json");
      return next;
    });
    console.log(`[DRIVE] PUT_BACKTESTS_OK requestId=${requestId} handle=${authed.drive.handle} sessions=${doc.sessions.length}`);
    return NextResponse.json({ ok: true, count: doc.sessions.length });
  } catch (err) {
    const resp = driveErrorResponse(err, requestId, "writeBacktests");
    if (resp) return resp;
    throw err;
  }
}
