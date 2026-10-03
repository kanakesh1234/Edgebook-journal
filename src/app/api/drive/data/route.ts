import { NextResponse } from "next/server";
import { getAuthedDrive, newRequestId, withDrive } from "@/lib/server/authed-drive";
import { JOURNAL_FILE, readJournalDoc, writeJournalDoc } from "@/lib/server/drive";
import type { DriveError } from "@/lib/server/drive";
import type { JournalPayload } from "@/lib/services/storage";

export const dynamic = "force-dynamic";

/**
 * Journal persistence over the user's own Google Drive.
 * GET  → read the user's journal.json (404 only when genuinely absent)
 * PUT  → write the user's journal.json + READ-BACK VERIFICATION
 *
 * Isolation: the handler resolves the folder from the caller's own
 * httpOnly session — no parameter can address another user's data.
 *
 * Every request carries a correlation ID traced through:
 * session → account → token → root folder → journal file → Drive op
 */
function driveErrorResponse(err: unknown, requestId: string, operation: string): NextResponse | null {
  const de = (err as { driveError?: DriveError }).driveError;
  if (!de) return null;
  console.error(
    `[DRIVE] OP_FAILED requestId=${requestId} operation=${operation} status=${de.status} reason=${de.reason} message="${de.message}"`,
  );
  // Preserve Google's actual status for the browser's retry policy.  A
  // network/local parse failure has no HTTP equivalent, so it stays a 502.
  const status = de.status >= 400 && de.status <= 599 ? de.status : 502;
  return NextResponse.json({
    error: "drive_write_failed",
    detail: de.reason,
    googleStatus: de.status,
    message: de.message,
  }, { status });
}

export async function GET() {
  const requestId = newRequestId();
  const authed = await getAuthedDrive();
  if (!authed.ok) {
    console.log(`[DRIVE] GET_DATA_BLOCKED requestId=${requestId} error=${authed.error}${authed.detail ? ` reason=${authed.detail.reason}` : ""}`);
    return NextResponse.json({ error: authed.error, googleStatus: authed.detail?.status, detail: authed.detail?.reason, message: authed.detail?.message }, { status: authed.status });
  }
  try {
    const doc = await withDrive(authed.drive, "readJournal", requestId, (t) => readJournalDoc(t, authed.drive.folders));
    if (doc == null) {
      console.log(`[DRIVE] GET_DATA_OK requestId=${requestId} handle=${authed.drive.handle} rootFolderId=${authed.drive.folders.root} result=no_journal_file_yet`);
      return NextResponse.json({ payload: null }, { status: 404 });
    }
    const count = (doc as { entries?: unknown[] }).entries?.length ?? 0;
    console.log(`[DRIVE] GET_DATA_OK requestId=${requestId} handle=${authed.drive.handle} rootFolderId=${authed.drive.folders.root} tradeCount=${count}`);
    return NextResponse.json({ payload: doc });
  } catch (err) {
    const resp = driveErrorResponse(err, requestId, "readJournal");
    if (resp) return resp;
    throw err;
  }
}

export async function PUT(request: Request) {
  const requestId = newRequestId();
  const authed = await getAuthedDrive();
  if (!authed.ok) {
    console.log(`[DRIVE] PUT_DATA_BLOCKED requestId=${requestId} error=${authed.error}${authed.detail ? ` reason=${authed.detail.reason}` : ""}`);
    return NextResponse.json({ error: authed.error, googleStatus: authed.detail?.status, detail: authed.detail?.reason, message: authed.detail?.message }, { status: authed.status });
  }
  let payload: JournalPayload;
  try {
    payload = (await request.json()) as JournalPayload;
    if (!Array.isArray(payload?.entries) || !payload.settings || typeof payload.settings !== "object" || Array.isArray(payload.settings)) {
      return NextResponse.json({ error: "invalid_payload", message: "entries must be an array and settings must be an object" }, { status: 400 });
    }
    // New practice fields intentionally remain forward-compatible: settings
    // is an object, not a closed allow-list schema. Validate only the stable
    // envelope so a newly shipped practiceProgress field cannot be rejected.
    if (payload.dayLogs != null && !Array.isArray(payload.dayLogs)) {
      return NextResponse.json({ error: "invalid_payload", message: "dayLogs must be an array when present" }, { status: 400 });
    }
    if (payload.plans != null && !Array.isArray(payload.plans)) {
      return NextResponse.json({ error: "invalid_payload", message: "plans must be an array when present" }, { status: 400 });
    }
  } catch (err) {
    console.error(`[DRIVE] PUT_DATA_INVALID_JSON requestId=${requestId} message="${err instanceof Error ? err.message : String(err)}"`);
    return NextResponse.json({ error: "invalid_json", message: "Request body must be valid JSON" }, { status: 400 });
  }

  const storedAt = Date.now();
  const body = {
    ...payload,
    version: payload.version ?? 2,
    storedAt,
    owner: authed.drive.session.email,
  };

  try {
    // ── WRITE ──
    await withDrive(authed.drive, "writeJournal", requestId, (t) => writeJournalDoc(t, authed.drive.folders, body));

    // ── READ-BACK (Rule #13: a save is only confirmed once Google returns it) ──
    const back = (await withDrive(authed.drive, "readBackJournal", requestId, (t) => readJournalDoc(t, authed.drive.folders))) as
      | { storedAt?: number; entries?: unknown[] }
      | null;
    if (!back || back.storedAt !== storedAt) {
      console.error(`[DRIVE] WRITE_READBACK_MISMATCH requestId=${requestId} handle=${authed.drive.handle} rootFolderId=${authed.drive.folders.root} expectedStoredAt=${storedAt} gotStoredAt=${back?.storedAt ?? null}`);
      return NextResponse.json({
        error: "drive_readback_failed",
        message: "Google Drive accepted the write but the read-back did not confirm it. Data may not be persisted.",
      }, { status: 502 });
    }

    console.log(`[DRIVE] PUT_DATA_OK requestId=${requestId} handle=${authed.drive.handle} operation=writeJournal rootFolderId=${authed.drive.folders.root} fileIdResolvedByName=${JOURNAL_FILE} tradeCount=${body.entries.length} readBackConfirmed=true`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const resp = driveErrorResponse(err, requestId, "writeJournal");
    if (resp) return resp;
    throw err;
  }
}
