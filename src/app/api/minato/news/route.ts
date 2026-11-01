import { NextResponse } from "next/server";
import {
  filterMajorForexFactoryEvents,
  getDeterministicMajorUsEvents,
  type MajorNewsEvent,
  type RawForexFactoryItem,
} from "@/lib/minato/forexfactory";
import { TRADING_TZ } from "@/lib/tz";

export const dynamic = "force-dynamic";

// In-memory cache of the ForexFactory weekly feed (15 minutes TTL)
let cachedRawFeed: { items: RawForexFactoryItem[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 15 * 60 * 1000;

const FF_URLS = [
  "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
  "https://nfs.faireconomy.media/ff_calendar_nextweek.json",
];

function todayNyIso(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TRADING_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "01";
  return `${g("year")}-${g("month")}-${g("day")}`;
}

async function fetchLiveForexFactoryFeed(): Promise<{ items: RawForexFactoryItem[]; live: boolean }> {
  const now = Date.now();
  if (cachedRawFeed && now - cachedRawFeed.fetchedAt < CACHE_TTL_MS) {
    return { items: cachedRawFeed.items, live: true };
  }

  const collected: RawForexFactoryItem[] = [];
  let anySuccess = false;

  for (const url of FF_URLS) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(4500),
      });
      if (res.ok) {
        const data = (await res.json()) as unknown;
        if (Array.isArray(data)) {
          collected.push(...(data as RawForexFactoryItem[]));
          anySuccess = true;
        }
      }
    } catch {
      /* ignore individual endpoint timeout/offline */
    }
  }

  if (anySuccess) {
    cachedRawFeed = { items: collected, fetchedAt: now };
    return { items: collected, live: true };
  }

  return { items: cachedRawFeed?.items ?? [], live: false };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date")?.trim() || todayNyIso();
  const currenciesParam = searchParams.get("currencies")?.trim();
  const currencies = currenciesParam
    ? currenciesParam.split(",").map((c) => c.trim().toUpperCase()).filter(Boolean)
    : ["USD"];

  const { items, live } = await fetchLiveForexFactoryFeed();
  let majorEvents: MajorNewsEvent[] = [];
  let source: "forexfactory-live" | "us-macro-schedule" = "forexfactory-live";

  if (items.length > 0) {
    majorEvents = filterMajorForexFactoryEvents(items, date, currencies);
    // Check if target `date` is covered by the weekly feed at all; if the target date is outside the feed window, use schedule fallback
    const feedDates = new Set(
      items
        .map((i) => (typeof i.date === "string" ? i.date.slice(0, 10) : ""))
        .filter(Boolean),
    );
    if (majorEvents.length === 0 && !feedDates.has(date)) {
      majorEvents = getDeterministicMajorUsEvents(date);
      source = "us-macro-schedule";
    }
  } else {
    majorEvents = getDeterministicMajorUsEvents(date);
    source = "us-macro-schedule";
  }

  return NextResponse.json({
    date,
    live,
    source,
    hasMajorNews: majorEvents.length > 0,
    events: majorEvents,
  });
}
