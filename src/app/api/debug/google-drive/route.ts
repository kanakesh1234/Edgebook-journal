import { NextResponse } from "next/server";
import { getGoogleConfig } from "@/lib/server/google-config";
import { getAuthedDrive } from "@/lib/server/authed-drive";
import { readJournalDoc } from "@/lib/server/drive";

export const dynamic = "force-dynamic";

/**
 * DEV-ONLY Google Drive diagnostics (Rule #17).
 * Reports safe booleans/statuses only — never tokens, emails or secrets.
 * Guarded: returns 404 in production builds.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return new NextResponse("Not Found", { status: 404 });
  }

  const config = getGoogleConfig();
  if (!config) {
    return NextResponse.json({ configured: false }, { status: 503 });
  }

  const authed = await getAuthedDrive();
  if (!authed.ok) {
    return NextResponse.json({
      session: { loggedIn: false },
      failure: {
        error: authed.error,
        googleStatus: authed.detail?.status ?? null,
        reason: authed.detail?.reason ?? null,
        message: authed.detail?.message ?? null,
      },
    }, { status: authed.status });
  }

  const { drive } = authed;
  const account = await (await import("@/lib/server/accounts")).getAccount(drive.session.email);

  // Verify the canonical root + journal file directly.
  const H = { Authorization: `Bearer ${drive.accessToken}` };
  let rootStatus: number | null = null;
  try {
    rootStatus = (await fetch(`https://www.googleapis.com/drive/v3/files/${drive.folders.root}?fields=id,name`, { headers: H })).status;
  } catch { rootStatus = 0; }

  let journalStatus: number | null = null;
  let tradeCount: number | null = null;
  try {
    const doc = await readJournalDoc(drive.accessToken, drive.folders);
    journalStatus = doc == null ? 404 : 200;
    tradeCount = (doc as { entries?: unknown[] } | null)?.entries?.length ?? 0;
  } catch (err) {
    journalStatus = (err as { driveError?: { status?: number } }).driveError?.status ?? 0;
  }

  return NextResponse.json({
    session: {
      loggedIn: true,
      googleAuthenticated: true,
    },
    account: {
      exists: !!account,
      hasRefreshToken: !!account?.encRefreshToken,
      hasFolderId: !!account?.folderId,
      folderIdMatchesResolvedRoot: account?.folderId === drive.folders.root,
    },
    drive: {
      scope: "https://www.googleapis.com/auth/drive.file",
      rootFolderId: drive.folders.root,
      journalsFolderId: drive.folders.journals,
      rootFolderAccessible: rootStatus === 200,
      journalFileAccessible: journalStatus === 200,
      rootStatus,
      journalStatus,
      tradeCount,
    },
  });
}
