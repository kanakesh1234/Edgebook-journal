import { NextResponse } from "next/server";
import { clientKey, rateLimited, sessionEmail } from "@/lib/server/auth";
import { findByHandle } from "@/lib/server/accounts";
import { canSee } from "@/lib/server/friends";
import { publicMetricsFor } from "@/lib/server/metrics";

export const dynamic = "force-dynamic";

/**
 * Head-to-head competition between the viewer and one friend.
 * Gated by an accepted friendship; only competition-safe aggregates.
 */
export async function GET(request: Request) {
  const email = sessionEmail(request);
  if (!email) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });

  if (rateLimited(`competition:${clientKey(request, email)}`, 60, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const handle = new URL(request.url).searchParams.get("handle")?.trim().slice(0, 40);
  if (!handle || !/^[a-zA-Z0-9_@]{2,40}$/.test(handle)) {
    return NextResponse.json({ error: "handle_required" }, { status: 400 });
  }

  const targetAccount = await findByHandle(handle);
  if (!targetAccount || !(await canSee(email, targetAccount.email))) {
    return NextResponse.json({ error: "not_friends" }, { status: 403 });
  }

  // Compute both metrics in parallel
  const [me, them] = await Promise.all([
    publicMetricsFor(email),
    publicMetricsFor(targetAccount.email),
  ]);

  if (!me || !them) return NextResponse.json({ error: "no_metrics" }, { status: 404 });

  return NextResponse.json({ me, them });
}
