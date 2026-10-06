import path from "node:path";
import type { NextConfig } from "next";

/**
 * Pin the workspace root to this directory — but only for local dev.
 * A stray package-lock.json in the user's home folder otherwise makes
 * Next.js infer the wrong root ("We detected multiple lockfiles…").
 * On Vercel the project already sits at the top level, so applying this
 * there double-joins the path (path0/path0) and breaks the build.
 */
const root = process.env.VERCEL ? undefined : path.dirname(__dirname);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false, // don't advertise the framework in every response
  ...(root ? { turbopack: { root }, outputFileTracingRoot: root } : {}),
  // Matrix is one mode of Practice now: trade pickers, mode pickers and per-trade tests are gone.
  // Any old link or bookmark lands on the Practice home, where the coach picks what is next.
  async redirects() {
    return [{ source: "/practice/matrix/:path*", destination: "/practice", permanent: false }];
  },
};

export default nextConfig;
