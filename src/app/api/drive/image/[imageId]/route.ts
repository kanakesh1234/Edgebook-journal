import { NextResponse } from "next/server";
import { getAuthedDrive } from "@/lib/server/authed-drive";
import { deleteFile, getFile, putFile, screenshotFileName } from "@/lib/server/drive";

export const dynamic = "force-dynamic";

/**
 * Screenshot persistence over the user's own Google Drive.
 * GET          → download screenshots/<imageId>.jpg (404 when absent)
 * PUT          → upload screenshots/<imageId>.jpg
 * DELETE       → remove screenshots/<imageId>.jpg
 *
 * Isolation: imageId resolves strictly inside the caller's own
 * session-bound screenshots folder.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ imageId: string }> }) {
  const authed = await getAuthedDrive();
  if (!authed.ok) return NextResponse.json({ error: authed.error }, { status: authed.status });

  const { imageId } = await ctx.params;
  if (!/^[A-Za-z0-9_-]+$/.test(imageId)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const blob = await getFile(authed.drive.accessToken, authed.drive.folders.screenshots, screenshotFileName(imageId));
  if (!blob) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return new NextResponse(blob, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" } });
}

export async function PUT(request: Request, ctx: { params: Promise<{ imageId: string }> }) {
  const authed = await getAuthedDrive();
  if (!authed.ok) return NextResponse.json({ error: authed.error }, { status: authed.status });

  const { imageId } = await ctx.params;
  if (!/^[A-Za-z0-9_-]+$/.test(imageId)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  const blob = await request.blob();
  if (blob.size === 0 || blob.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "invalid_size" }, { status: 400 });
  }

  const ok = await putFile(
    authed.drive.accessToken,
    authed.drive.folders.screenshots,
    screenshotFileName(imageId),
    Buffer.from(await blob.arrayBuffer()),
    "image/jpeg",
  );
  if (!ok) return NextResponse.json({ error: "drive_write_failed" }, { status: 502 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ imageId: string }> }) {
  const authed = await getAuthedDrive();
  if (!authed.ok) return NextResponse.json({ error: authed.error }, { status: authed.status });

  const { imageId } = await ctx.params;
  if (!/^[A-Za-z0-9_-]+$/.test(imageId)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  await deleteFile(authed.drive.accessToken, authed.drive.folders.screenshots, screenshotFileName(imageId));
  return NextResponse.json({ ok: true });
}
