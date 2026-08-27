import { NextResponse } from "next/server";
import { getGoogleConfig } from "@/lib/server/google-config";
import { APP_SESSION_COOKIE, openAppSession, readCookie } from "@/lib/server/session";
import { findByHandle, getAccount, upsertAccount } from "@/lib/server/accounts";

export const dynamic = "force-dynamic";

const HANDLE_RE = /^[a-z0-9_]{3,24}$/;

function sessionEmail(request: Request): string | null {
  const config = getGoogleConfig();
  const cookie = readCookie(request, APP_SESSION_COOKIE);
  return config && cookie ? openAppSession(cookie, config.tokenSecret)?.email ?? null : null;
}

/** GET — current account handle (server-owned for Google users). */
export async function GET(request: Request) {
  const me = sessionEmail(request);
  if (!me) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
  const account = getAccount(me);
  return NextResponse.json({ handle: account?.handle ?? null });
}

/**
 * POST — claim/update the handle. Validates format + uniqueness.
 * The handle is THE canonical friend identifier — never an email.
 */
export async function POST(request: Request) {
  const me = sessionEmail(request);
  if (!me) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { handle?: string };
  const handle = (body.handle ?? "").trim().replace(/^@/, "").toLowerCase();

  if (!HANDLE_RE.test(handle)) {
    return NextResponse.json(
      { error: "invalid", detail: "3–24 characters — lowercase letters, numbers and underscores only." },
      { status: 400 },
    );
  }

  const existing = findByHandle(handle);
  if (existing && existing.email !== me) {
    return NextResponse.json(
      { error: "taken", detail: "That handle is already taken." },
      { status: 409 },
    );
  }

  const updated = upsertAccount({ email: me, handle });
  return NextResponse.json({ handle: updated.handle });
}
