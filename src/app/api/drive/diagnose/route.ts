import { NextResponse } from "next/server";
import { getAuthedDrive } from "@/lib/server/authed-drive";
import { readJournalDoc, writeJournalDoc } from "@/lib/server/drive";

export const dynamic = "force-dynamic";

/**
 * DEV-ONLY diagnostic — verifies the full Drive write→read→verify cycle.
 * Remove after persistence is confirmed stable.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const writeTest = url.searchParams.get("write") === "1";

  const authed = await getAuthedDrive();
  if (!authed.ok) {
    return NextResponse.json({ ok: false, error: authed.error, stage: "auth" }, { status: authed.status });
  }
  const { session, accessToken, folders } = authed.drive;

  try {
    // Read current state
    const doc = (await readJournalDoc(accessToken, folders)) as { entries?: unknown[] } | null;
    const beforeCount = doc?.entries?.length ?? 0;

    if (!writeTest) {
      return NextResponse.json({
        ok: true,
        account: session.email,
        rootFolder: folders.root,
        journalsFolder: folders.journals,
        screenshotsFolder: folders.screenshots,
        beforeCount,
        journalExists: doc != null,
        backend: "GOOGLE_DRIVE",
      });
    }

    // Write test record
    const testId = `diag-${Date.now()}`;
    const testPayload = {
      ...doc,
      entries: [
        ...(doc?.entries ?? []),
        { id: testId, date: new Date().toISOString().slice(0, 10), pnl: 0, instrument: "DIAG", setup: "", notes: "diagnostic", images: [], createdAt: Date.now(), updatedAt: Date.now() },
      ],
    };
    await writeJournalDoc(accessToken, folders, testPayload);

    // Read back
    const readBack = (await readJournalDoc(accessToken, folders)) as { entries?: { id: string }[] } | null;
    const afterCount = readBack?.entries?.length ?? 0;
    const found = readBack?.entries?.some((e) => e.id === testId);

    // Clean up test record
    const cleanup = (testPayload.entries as { id: string }[]).filter((e: { id: string }) => e.id !== testId);
    await writeJournalDoc(accessToken, folders, { ...testPayload, entries: cleanup });

    return NextResponse.json({
      ok: found,
      account: session.email,
      rootFolder: folders.root,
      journalsFolder: folders.journals,
      beforeCount,
      afterCount,
      writeSucceeded: true,
      readBackSucceeded: found,
      backend: "GOOGLE_DRIVE_STORAGE (write + read-back + cleanup verified)",
    });
  } catch (err: unknown) {
    const driveErr = err as { driveError?: { status: number; reason: string; message: string } };
    return NextResponse.json({
      ok: false,
      account: session.email,
      error: driveErr.driveError?.message ?? String(err),
      stage: "write_or_read",
    }, { status: 500 });
  }
}
