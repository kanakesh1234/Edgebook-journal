import { NextResponse } from "next/server";
import { getGoogleConfig, isGoogleConfigured } from "@/lib/server/google-config";
import { SESSION_COOKIE, openSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/** Session status for the client: drives the DataStore fallback decision. */
export async function GET(request: Request) {
  const configured = isGoogleConfigured();
  const config = getGoogleConfig();
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${SESSION_COOKIE}=`))
    ?.split("=")
    .slice(1)
    .join("=");

  const session = configured && config && cookie ? openSession(decodeURIComponent(cookie), config.tokenSecret) : null;

  return NextResponse.json({
    configured,
    connected: !!session,
    email: session?.email ?? null,
  });
}
