import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

/**
 * Production-grade security middleware for Vercel & local environments:
 *  1. Refreshes Supabase auth session cookies.
 *  2. Enforces strict CSRF & Cross-Site Request protection on all mutating `/api/*` requests:
 *     - Blocks `Sec-Fetch-Site: cross-site` mutations immediately.
 *     - Validates `Origin` (or `Referer` fallback when `Origin` is absent) against the request's host.
 *  3. Attaches hardened HTTP security headers (CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy,
 *     Permissions-Policy, COOP, CORP, X-Permitted-Cross-Domain-Policies).
 */
const isDev = process.env.NODE_ENV !== "production";

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.googleusercontent.com",
  "media-src 'self' blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""} https://*.supabase.co`,
  "frame-src https://www.youtube.com https://www.youtube-nocookie.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

function extractHost(urlOrOrigin: string | null): string {
  if (!urlOrOrigin) return "";
  try {
    return new URL(urlOrOrigin).host.toLowerCase();
  } catch {
    return "";
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/") && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    // 1. Modern Fetch Metadata defense: block cross-site state-changing requests immediately
    const fetchSite = request.headers.get("sec-fetch-site");
    if (fetchSite === "cross-site") {
      return NextResponse.json({ error: "cross_site_request_blocked" }, { status: 403 });
    }

    // 2. Origin / Referer host verification against active host headers
    const allowedHosts = [
      request.headers.get("host"),
      request.headers.get("x-forwarded-host"),
    ]
      .filter((h): h is string => !!h)
      .flatMap((h) => h.split(","))
      .map((h) => h.trim().toLowerCase());

    const originHeader = request.headers.get("origin");
    const refererHeader = request.headers.get("referer");
    const sourceHost = extractHost(originHeader) || extractHost(refererHeader);

    if (originHeader || refererHeader) {
      if (!sourceHost || !allowedHosts.includes(sourceHost)) {
        return NextResponse.json({ error: "cross_site_request_blocked" }, { status: 403 });
      }
    } else if (!isDev) {
      // In production on Vercel, browser mutations always carry Origin, Referer, or Sec-Fetch-Site: same-origin
      if (fetchSite !== "same-origin" && fetchSite !== "same-site") {
        return NextResponse.json({ error: "missing_origin_blocked" }, { status: 403 });
      }
    }
  }

  // Refresh Supabase auth session — produces a response with updated cookies
  const { response: res } = updateSession(request);

  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-DNS-Prefetch-Control", "off");
  res.headers.set("X-Permitted-Cross-Domain-Policies", "none");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()");
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  res.headers.set("Cross-Origin-Resource-Policy", "same-origin");

  if (!isDev) {
    res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
    res.headers.set("Content-Security-Policy", CSP);
  }
  if (pathname.startsWith("/api/")) {
    res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.headers.set("Pragma", "no-cache");
  }
  return res;
}

export const config = {
  // Skip static build assets and image files; everything else (pages + API) gets the headers.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|woff2?)$).*)"],
};
