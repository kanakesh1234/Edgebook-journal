import { NextResponse } from "next/server";
import { getAuthedDrive } from "@/lib/server/authed-drive";
import { readJournalDoc, writeJournalDoc } from "@/lib/server/drive";
import type { JournalPayload } from "@/lib/services/storage";

export const dynamic = "force-dynamic";

/**
 * Journal persistence over the user's own Google Drive.
 * GET  → read the user's journal.json (null when absent)
 * PUT  → write the user's journal.json
 *
 * Isolation: the handler resolves the folder from the caller's own
 * httpOnly session — no parameter can address another user's data.
 */
export async function GET() {
  const authed = await getAuthedDrive();
  if (!authed.ok) {
    return NextResponse.json({ error: authed.error }, { status: authed.status });
  }
  const doc = await readJournalDoc(authed.drive.accessToken, authed.drive.folders);
  if (doc == null) return NextResponse.json({ payload: null }, { status: 404 });
  return NextResponse.json({ payload: doc });
}

export async function PUT(request: Request) {
  const authed = await getAuthedDrive();
  if (!authed.ok) {
    return NextResponse.json({ error: authed.error }, { status: authed.status });
  }
  let payload: JournalPayload;
  try {
    payload = (await request.json()) as JournalPayload;
    if (!Array.isArray(payload?.entries) || typeof payload?.settings !== "object") {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    await writeJournalDoc(authed.drive.accessToken, authed.drive.folders, {
      ...payload,
      version: payload.version ?? 2,
      storedAt: Date.now(),
      owner: authed.drive.session.email,
    });
    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const driveErr = err as { driveError?: { status: number; reason: string; message: string } };
    if (driveErr.driveError) {
      console.error(`[Drive] Write failed for ${authed.drive.session.email}: ${driveErr.driveError.status} ${driveErr.driveError.reason} ${driveErr.driveError.message}`);
      const status = driveErr.driveError.status === 401 ? 401 : 502;
      return NextResponse.json({
        error: "drive_write_failed",
        detail: driveErr.driveError.reason,
        message: `Google Drive sync failed (${driveErr.driveError.status}). Your data has not been confirmed as saved.`,
      }, { status });
    }
    throw err;
  }
}
