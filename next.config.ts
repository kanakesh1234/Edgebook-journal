import path from "node:path";
import type { NextConfig } from "next";

/**
 * Pin the workspace root to this directory.
 * A stray package-lock.json in the user's home folder otherwise makes
 * Next.js infer the wrong root ("We detected multiple lockfiles…").
 */
const root = path.dirname(__dirname);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  turbopack: { root },
  outputFileTracingRoot: root,
};

export default nextConfig;
