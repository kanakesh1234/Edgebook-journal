import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

/**
 * Runs before every request:
 *  1. Refreshes Supabase auth session cookies.
 *  2. Blocks cross-site writes to /api (CSRF): a browser POST/PUT/DELETE coming from another website is refused.
 *  3. Adds security headers (no framing, no MIME sniffing, strict referrer, locked-down content policy).
 */
const isDev = process.env.NODE_ENV !== "production";

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""} https://*.supabase.co`,
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    if (origin) {
      let originHost = "";
      try { originHost = new URL(origin).host; } catch { /* invalid origin → refused below */ }
      const hosts = [request.headers.get("host"), request.headers.get("x-forwarded-host")].filter(Boolean);
      if (!originHost || !hosts.includes(originHost)) {
        return NextResponse.json({ error: "cross_site_request_blocked" }, { status: 403 });
      }
    }
  }

  // Refresh Supabase auth session — produces a response with updated cookies
  const { response: res } = updateSession(request);

  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  if (!isDev) {
    res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
    res.headers.set("Content-Security-Policy", CSP);
  }
  if (pathname.startsWith("/api/")) res.headers.set("Cache-Control", "no-store");
  return res;
}

export const config = {
  // Skip static build assets and image files; everything else (pages + API) gets the headers.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?)$).*)"],
};

