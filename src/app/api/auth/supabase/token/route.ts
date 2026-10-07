import { NextResponse } from "next/server";
import { sessionOf } from "@/lib/server/auth";
import { issueSupabaseWorkingMemoryToken } from "@/lib/server/supabase-identity";

export const dynamic = "force-dynamic";

/**
 * Exchanges an existing, HTTP-only Edgebook session for a short-lived JWT
 * accepted by Supabase. The browser cannot select or alter the user ID.
 */
export async function GET(request: Request) {
  const session = sessionOf(request);
  if (!session) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });

  const issued = issueSupabaseWorkingMemoryToken(session);
  if (!issued) {
    return NextResponse.json({ error: "supabase_identity_bridge_not_configured" }, { status: 503 });
  }

  return NextResponse.json(issued, {
    headers: { "Cache-Control": "no-store" },
  });
}
