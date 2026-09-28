import { NextResponse } from 'next/server';

/* ------------------------------------------------------------------ */
/*  LSE catalog proxy — discover available symbols                     */
/* ------------------------------------------------------------------ */

const LSE_BASE = 'https://api.londonstrategicedge.com/vault';

let cachedSymbols: string[] | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function GET() {
  const apiKey = process.env.LSE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'LSE_API_KEY not configured', symbols: [] },
      { status: 503 },
    );
  }

  // Return cached catalog if fresh
  if (cachedSymbols && Date.now() - cachedAt < CACHE_TTL_MS) {
    return NextResponse.json({ symbols: cachedSymbols });
  }

  try {
    const res = await fetch(`${LSE_BASE}/catalog`, {
      headers: { 'x-api-key': apiKey },
      cache: 'no-store',
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `LSE catalog error (${res.status})`, symbols: [] },
        { status: 502 },
      );
    }

    const raw = await res.json();

    // Extract symbols — LSE may return various formats
    let symbols: string[] = [];
    if (Array.isArray(raw)) {
      // Could be array of strings or array of objects with symbol field
      symbols = raw.map((item: string | { symbol?: string; ticker?: string; name?: string }) =>
        typeof item === 'string' ? item : (item.symbol || item.ticker || ''),
      ).filter(Boolean);
    } else if (raw.symbols && Array.isArray(raw.symbols)) {
      symbols = raw.symbols;
    } else if (raw.data && Array.isArray(raw.data)) {
      symbols = raw.data.map((item: string | { symbol?: string }) =>
        typeof item === 'string' ? item : (item.symbol || ''),
      ).filter(Boolean);
    }

    cachedSymbols = symbols;
    cachedAt = Date.now();

    return NextResponse.json({ symbols });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to fetch catalog: ${msg}`, symbols: [] },
      { status: 502 },
    );
  }
}
