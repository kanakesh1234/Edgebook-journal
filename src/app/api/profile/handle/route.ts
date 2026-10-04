import { NextResponse } from "next/server";
import { rateLimited, sessionEmail } from "@/lib/server/auth";
import { claimHandle, getAccount } from "@/lib/server/accounts";

export const dynamic = "force-dynamic";

const HANDLE_RE = /^[a-z0-9_]{3,24}$/;

/** GET — current account handle (server-owned for Google users). */
export async function GET(request: Request) {
  const me = sessionEmail(request);
  if (!me) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
  const account = await getAccount(me);
  return NextResponse.json({ handle: account?.handle ?? null });
}

/**
 * POST — claim/update the handle. Validates format + uniqueness.
 * The handle is THE canonical friend identifier — never an email.
 */
export async function POST(request: Request) {
  const me = sessionEmail(request);
  if (!me) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });

  if (rateLimited(`handle:${me}`, 10, 10 * 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  const body = (await request.json().catch(() => ({}))) as { handle?: string };
  const handle = (typeof body.handle === "string" ? body.handle : "").trim().replace(/^@/, "").toLowerCase();

  if (!HANDLE_RE.test(handle)) {
    return NextResponse.json(
      { error: "invalid", detail: "3–24 characters — lowercase letters, numbers and underscores only." },
      { status: 400 },
    );
  }

  const result = await claimHandle(me, handle);
  if (result === "taken") {
    return NextResponse.json({ error: "taken", detail: "That handle is already taken." }, { status: 409 });
  }
  if (result === "missing") return NextResponse.json({ error: "no_account" }, { status: 404 });
  return NextResponse.json({ handle });
}
