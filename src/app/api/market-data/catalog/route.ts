import { NextResponse } from "next/server";
import { clientKey, rateLimited, sessionEmail } from "@/lib/server/auth";
import { getLseApiKey } from "@/lib/server/lse-key";

/* ------------------------------------------------------------------ */
/*  LSE catalog proxy — discover available symbols                     */
/* ------------------------------------------------------------------ */

const LSE_BASE = "https://api.londonstrategicedge.com/vault";

let cachedSymbols: string[] | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function GET(request: Request) {
  const me = sessionEmail(request);
  if (!me) return NextResponse.json({ error: "not_logged_in", symbols: [] }, { status: 401 });
  if (rateLimited(`market-catalog:${clientKey(request, me)}`, 30, 60_000)) {
    return NextResponse.json({ error: "rate_limited", symbols: [] }, { status: 429 });
  }

  const apiKey = getLseApiKey();
  if (!apiKey) {
    return NextResponse.json(
      { error: "LSE_API_KEY not configured", symbols: [] },
      { status: 503 },
    );
  }

  if (cachedSymbols && Date.now() - cachedAt < CACHE_TTL_MS) {
    return NextResponse.json({ symbols: cachedSymbols });
  }

  try {
    const res = await fetch(`${LSE_BASE}/catalog`, {
      headers: { "x-api-key": apiKey },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `LSE catalog error (${res.status})`, symbols: [] },
        { status: 502 },
      );
    }

    const raw = await res.json();

    let symbols: string[] = [];
    if (Array.isArray(raw)) {
      symbols = raw
        .map((item: string | { symbol?: string; ticker?: string; name?: string }) =>
          typeof item === "string" ? item : item.symbol || item.ticker || "",
        )
        .filter(Boolean);
    } else if (raw.symbols && Array.isArray(raw.symbols)) {
      symbols = raw.symbols;
    } else if (raw.data && Array.isArray(raw.data)) {
      symbols = raw.data
        .map((item: string | { symbol?: string }) => (typeof item === "string" ? item : item.symbol || ""))
        .filter(Boolean);
    }

    cachedSymbols = symbols;
    cachedAt = Date.now();

    return NextResponse.json({ symbols });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch catalog from market data provider.", symbols: [] },
      { status: 502 },
    );
  }
}
