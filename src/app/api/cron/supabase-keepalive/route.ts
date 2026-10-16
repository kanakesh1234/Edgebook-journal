import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Keeps the Supabase project from being auto-paused for inactivity.
 *
 * Supabase pauses free projects after 7 days without database/API activity. Edgebook only talks to Supabase
 * while someone has the app open, so a quiet week would pause it. Vercel Cron (see /vercel.json) calls this
 * every 3 days; it runs one tiny read against `app_keepalive` (supabase/migrations/002_keepalive.sql).
 *
 * Auth: Vercel sends `Authorization: Bearer $CRON_SECRET` when CRON_SECRET is set in the project's env vars.
 * Without that secret the route refuses to run, so it cannot be used by strangers to generate traffic.
 * Supabase is advisory working memory here — a failure never touches Drive data.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return NextResponse.json({ ok: false, error: "supabase_not_configured" }, { status: 500 });

  try {
    const res = await fetch(`${url}/rest/v1/app_keepalive?select=id&limit=1`, {
      headers: { apikey: key },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    // 200 = query ran. 404 = project is awake but the table is missing (run migration 002) — still counts as contact.
    const hint = res.status === 404 ? "Run supabase/migrations/002_keepalive.sql in the Supabase SQL editor." : undefined;
    return NextResponse.json({ ok: res.ok, status: res.status, hint }, { status: res.ok ? 200 : 502 });
  } catch (err) {
    // Paused projects fail to connect. Say so plainly.
    return NextResponse.json(
      { ok: false, error: "unreachable", message: err instanceof Error ? err.message : "Request failed", hint: "If the project is paused, restore it from the Supabase dashboard." },
      { status: 502 },
    );
  }
}
