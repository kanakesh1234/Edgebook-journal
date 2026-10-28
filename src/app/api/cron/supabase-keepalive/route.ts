import crypto from "node:crypto";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function safeBearerMatch(authHeader: string | null, secret: string): boolean {
  if (!authHeader || !secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  const actual = Buffer.from(authHeader, "utf8");
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

/**
 * Keeps the Supabase project from being auto-paused for inactivity.
 * Secured with constant-time Bearer token comparison against CRON_SECRET.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || !safeBearerMatch(request.headers.get("authorization"), secret)) {
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
    const hint = res.status === 404 ? "Run supabase/migrations/002_keepalive.sql in the Supabase SQL editor." : undefined;
    return NextResponse.json({ ok: res.ok, status: res.status, hint }, { status: res.ok ? 200 : 502 });
  } catch {
    return NextResponse.json(
      { ok: false, error: "unreachable", hint: "If the project is paused, restore it from the Supabase dashboard." },
      { status: 502 },
    );
  }
}
