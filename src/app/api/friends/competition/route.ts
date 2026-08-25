import { NextResponse } from "next/server";
import { getGoogleConfig } from "@/lib/server/google-config";
import { APP_SESSION_COOKIE, openAppSession, readCookie } from "@/lib/server/session";
import { publicMetricsFor } from "@/lib/server/metrics";

export const dynamic = "force-dynamic";

/**
 * Head-to-head competition between the viewer and one friend.
 * Gated by an accepted friendship; only competition-safe aggregates.
 */
export async function GET(request: Request) {
  const config = getGoogleConfig();
  const cookie = readCookie(request, APP_SESSION_COOKIE);
  const session = config && cookie ? openAppSession(cookie, config.tokenSecret) : null;
  if (!session) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });

  const handle = new URL(request.url).searchParams.get("handle");
  if (!handle) return NextResponse.json({ error: "handle_required" }, { status: 400 });

  const me = await publicMetricsFor(session.email);
  if (!me) return NextResponse.json({ error: "no_metrics" }, { status: 404 });

  const { canSee } = await import("@/lib/server/friends");
  const { findByHandle } = await import("@/lib/server/accounts");
  const targetAccount = findByHandle(handle);
  if (!targetAccount || !canSee(session.email, targetAccount.email)) {
    return NextResponse.json({ error: "not_friends" }, { status: 403 });
  }

  const them = await publicMetricsFor(targetAccount.email);
  if (!them) return NextResponse.json({ error: "no_metrics" }, { status: 404 });

  return NextResponse.json({ me, them });
}
