import { NextResponse } from "next/server";
import { getAuthedDrive } from "@/lib/server/authed-drive";
import { driveFetch, readJournalDoc, APP_FOLDER, JOURNAL_FILE } from "@/lib/server/drive";

export const dynamic = "force-dynamic";

/**
 * TEMPORARY DIAGNOSTIC — reports the real Drive persistence state from
 * inside the caller's authenticated session. Read-only by default.
 * `?writetest=1` performs one harmless test write + read-back through the
 * normal persistence path. Remove this file after diagnosis.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const writeTest = url.searchParams.get("writetest") === "1";

  const authed = await getAuthedDrive();
  if (!authed.ok) {
    return NextResponse.json({ diagnostic: "drive", ok: false, error: authed.error }, { status: authed.status });
  }
  const { session, accessToken, folders } = authed.drive;

  // Children of the EdgeBook root (folders + files), straight from Drive.
  const q = encodeURIComponent(`'${folders.root}' in parents and trashed = false`);
  const listRes = await driveFetch(accessToken, `/files?q=${q}&fields=files(id,name,mimeType)&pageSize=50`);
  const children = listRes.ok ? ((await listRes.json()) as { files?: { id: string; name: string; mimeType: string }[] }).files ?? [] : [];

  const journalDoc = await readJournalDoc(accessToken, folders);

  const result: Record<string, unknown> = {
    diagnostic: "drive",
    ok: true,
    connectedAs: session.email,
    backend: "GOOGLE_DRIVE_STORAGE",
    rootFolder: { name: APP_FOLDER, id: folders.root },
    subfolders: {
      trades: folders.trades,
      journals: folders.journals,
      screenshots: folders.screenshots,
      challenges: folders.challenges,
      exports: folders.exports,
    },
    rootChildren: children,
    subfolderPresence: Object.fromEntries(
      Object.entries(folders)
        .filter(([k]) => k !== "root")
        .map(([k, id]) => [k, children.some((c) => c.id === id)]),
    ),
    journalFile: { name: JOURNAL_FILE, exists: journalDoc != null, entryCount: (journalDoc as { entries?: unknown[] })?.entries?.length ?? 0 },
  };

  if (writeTest) {
    const stamp = new Date().toISOString();
    const testPayload = {
      entries: [
        {
          id: "diag-test-1",
          date: stamp.slice(0, 10),
          pnl: 1,
          rr: null,
          instrument: "DIAG",
          direction: null,
          setup: "diagnostic",
          notes: `MINATO/Drive persistence diagnostic write at ${stamp}. Safe to delete.`,
          images: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      settings: { traderName: "diagnostic", startingEquity: 10000, targetEquity: 20000, maxDrawdown: 500, currency: "USD" },
      version: 2,
      storedAt: Date.now(),
      owner: session.email,
    };
    const { writeJournalDoc } = await import("@/lib/server/drive");
    const writeOk = await writeJournalDoc(accessToken, folders, testPayload);
    const readBack = await readJournalDoc(accessToken, folders);
    const readEntry = (readBack as { entries?: { id: string; notes: string }[] })?.entries?.find((e) => e.id === "diag-test-1");
    result.writeTest = {
      writeOk,
      readBackOk: !!readEntry,
      readBackNotes: readEntry?.notes ?? null,
      backend: writeOk && readEntry ? "GOOGLE_DRIVE_STORAGE (write + read-back verified)" : "FAILED",
    };
  }

  return NextResponse.json(result);
}
