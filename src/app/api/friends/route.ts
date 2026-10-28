import { NextResponse } from "next/server";
import { clientKey, rateLimited, sessionEmail } from "@/lib/server/auth";
import { getAccount, findByHandle } from "@/lib/server/accounts";
import { listFor, respond, sendRequest, terminate } from "@/lib/server/friends";
import { publicMetricsFor } from "@/lib/server/metrics";

export const dynamic = "force-dynamic";

/** Safe public display name — NEVER falls back to an email address. */
function safeDisplayName(name?: string | null, handle?: string | null): string {
  const first = name?.trim().split(/\s+/)[0] ?? "";
  if (first && !first.includes("@")) return first.slice(0, 40);
  return handle || "Trader";
}

/** GET — friends list (with competition-safe metrics) + pending requests + caller's own handle. */
export async function GET(request: Request) {
  const me = sessionEmail(request);
  if (!me) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });

  const url = new URL(request.url);
  const searchHandle = url.searchParams.get("search");

  // Search by @handle — returns only handle + safe display name, never email.
  if (searchHandle) {
    if (rateLimited(`friend-search:${clientKey(request, me)}`, 30, 60_000)) {
      return NextResponse.json({ error: "rate_limited" }, { status: 429 });
    }
    const target = await findByHandle(searchHandle.slice(0, 40));
    if (!target || target.email.toLowerCase() === me.toLowerCase()) {
      return NextResponse.json({ results: [] });
    }
    return NextResponse.json({
      results: [{ handle: target.handle, displayName: safeDisplayName(target.name, target.handle) }],
    });
  }

  if (rateLimited(`friends-list:${clientKey(request, me)}`, 120, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  // Fetch records and caller's own account in parallel
  const [records, myAccount] = await Promise.all([listFor(me), getAccount(me)]);

  const pendingIncoming: { id: string; handle?: string; displayName: string }[] = [];
  const pendingOutgoing: { id: string; handle?: string; displayName: string }[] = [];
  const friends: ({ id: string } & NonNullable<Awaited<ReturnType<typeof publicMetricsFor>>>)[] = [];

  // Resolve all friend records in parallel instead of a sequential N+1 loop
  await Promise.all(
    records.map(async (r) => {
      const isOutgoing = r.from.toLowerCase() === me.toLowerCase();
      const otherEmail = isOutgoing ? r.to : r.from;
      const direction = isOutgoing ? "outgoing" : "incoming";

      if (r.status === "pending") {
        const acct = await getAccount(otherEmail);
        const item = {
          id: r.id,
          handle: acct?.handle,
          displayName: safeDisplayName(acct?.name, acct?.handle),
        };
        if (direction === "incoming") pendingIncoming.push(item);
        else pendingOutgoing.push(item);
      } else if (r.status === "accepted") {
        const metrics = await publicMetricsFor(otherEmail);
        if (metrics) friends.push({ id: r.id, ...metrics });
      }
    }),
  );

  friends.sort((a, b) => b.processScore - a.processScore);
  return NextResponse.json({
    myHandle: myAccount?.handle ?? null,
    friends,
    pendingIncoming,
    pendingOutgoing,
  });
}

/** POST — actions: request | respond | remove | block. */
export async function POST(request: Request) {
  const me = sessionEmail(request);
  if (!me) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });

  if (rateLimited(`friends:${clientKey(request, me)}`, 60, 60_000)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const body = {
    action: typeof raw.action === "string" ? raw.action : "",
    handle: typeof raw.handle === "string" ? raw.handle.trim().slice(0, 40) : "",
    recordId: typeof raw.recordId === "string" ? raw.recordId.trim().slice(0, 80) : "",
    status: (raw.status === "accepted" ? "accepted" : raw.status === "declined" ? "declined" : null) as
      | "accepted"
      | "declined"
      | null,
  };

  if (body.action === "request") {
    if (!body.handle) return NextResponse.json({ error: "handle_required" }, { status: 400 });
    const target = await findByHandle(body.handle);
    if (!target) return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (target.email.toLowerCase() === me.toLowerCase()) return NextResponse.json({ error: "self" }, { status: 400 });
    const record = await sendRequest(me, target.email);
    if (!record) return NextResponse.json({ error: "already_pending_or_friends" }, { status: 409 });
    return NextResponse.json({ ok: true, status: record.status });
  }

  if (body.action === "respond" && body.recordId && body.status) {
    const record = await respond(body.recordId, me, body.status);
    if (!record) return NextResponse.json({ error: "not_permitted" }, { status: 403 });
    return NextResponse.json({ ok: true, status: record.status });
  }

  if (body.action === "remove" && body.recordId) {
    const record = await terminate(body.recordId, me, false);
    if (!record) return NextResponse.json({ error: "not_permitted" }, { status: 403 });
    return NextResponse.json({ ok: true });
  }

  if (body.action === "block" && body.recordId) {
    const record = await terminate(body.recordId, me, true);
    if (!record) return NextResponse.json({ error: "not_permitted" }, { status: 403 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "unknown_action" }, { status: 400 });
}
