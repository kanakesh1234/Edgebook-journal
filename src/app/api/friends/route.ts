import { NextResponse } from "next/server";
import { getGoogleConfig } from "@/lib/server/google-config";
import { APP_SESSION_COOKIE, openAppSession, readCookie } from "@/lib/server/session";
import { getAccount, findByHandle } from "@/lib/server/accounts";
import { friendEmails, findRecord, listFor, respond, sendRequest, terminate } from "@/lib/server/friends";
import { publicMetricsFor } from "@/lib/server/metrics";

export const dynamic = "force-dynamic";

function sessionEmail(request: Request): string | null {
  const config = getGoogleConfig();
  const cookie = readCookie(request, APP_SESSION_COOKIE);
  return config && cookie ? openAppSession(cookie, config.tokenSecret)?.email ?? null : null;
}

/** GET — friends list (with competition-safe metrics) + pending requests. */
export async function GET(request: Request) {
  const me = sessionEmail(request);
  if (!me) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });

  const url = new URL(request.url);
  const searchHandle = url.searchParams.get("search");

  // Search by @handle — returns only handle + name, never email.
  if (searchHandle) {
    const target = findByHandle(searchHandle);
    if (!target || target.email === me) return NextResponse.json({ results: [] });
    return NextResponse.json({ results: [{ handle: target.handle, displayName: target.name.split(" ")[0] }] });
  }

  const records = listFor(me);
  const pendingIncoming = [];
  const pendingOutgoing = [];
  const friends = [];

  for (const r of records) {
    const otherEmail = r.from === me ? r.to : me;
    const direction = r.from === me ? "outgoing" : "incoming";
    const acct = getAccount(otherEmail);
    if (r.status === "pending" && direction === "incoming") {
      pendingIncoming.push({ id: r.id, handle: acct?.handle, displayName: acct?.name?.split(" ")[0] ?? otherEmail });
    } else if (r.status === "pending" && direction === "outgoing") {
      pendingOutgoing.push({ id: r.id, handle: acct?.handle, displayName: acct?.name?.split(" ")[0] ?? otherEmail });
    } else if (r.status === "accepted") {
      const metrics = await publicMetricsFor(otherEmail);
      if (metrics) friends.push({ id: r.id, ...metrics });
    }
  }

  friends.sort((a, b) => b.processScore - a.processScore);
  return NextResponse.json({ friends, pendingIncoming, pendingOutgoing });
}

/** POST — actions: request | respond | remove | block. */
export async function POST(request: Request) {
  const me = sessionEmail(request);
  if (!me) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    action?: string;
    handle?: string;
    recordId?: string;
    status?: "accepted" | "declined";
    block?: boolean;
  };

  if (body.action === "request") {
    if (!body.handle) return NextResponse.json({ error: "handle_required" }, { status: 400 });
    const target = getAccount(body.handle.toLowerCase().replace(/^@/, ""));
    if (!target) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (target.email === me) return NextResponse.json({ error: "self" }, { status: 400 });
    const record = sendRequest(me, target.email);
    if (!record) return NextResponse.json({ error: "already_pending_or_friends" }, { status: 409 });
    return NextResponse.json({ ok: true, status: record.status });
  }

  if (body.action === "respond" && body.recordId && body.status) {
    const record = respond(body.recordId, me, body.status);
    if (!record) return NextResponse.json({ error: "not_permitted" }, { status: 403 });
    return NextResponse.json({ ok: true, status: record.status });
  }

  if (body.action === "remove" && body.recordId) {
    const record = terminate(body.recordId, me, false);
    if (!record) return NextResponse.json({ error: "not_permitted" }, { status: 403 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "block" && body.recordId) {
    const record = terminate(body.recordId, me, true);
    if (!record) return NextResponse.json({ error: "not_permitted" }, { status: 403 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
