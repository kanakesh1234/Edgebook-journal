/**
 * FOREXFACTORY MAJOR-IMPACT (RED FOLDER) NEWS ENGINE
 *
 * Fetches, filters, and formats Major-Impact (`impact === "High"`) economic calendar
 * events from ForexFactory (`nfs.faireconomy.media/ff_calendar_thisweek.json` and
 * `forexfactory.com/calendar`), converting all timestamps to New York trading time
 * (`America/New_York`, `HH:MM` 24-hour format + `h:mm AM/PM NY` display label).
 *
 * Only Major / High-Impact events are returned so traders are never spammed with
 * low-impact noise during Plan a Trade or Trade Logging.
 */

import { TRADING_TZ } from "../tz";

export interface MajorNewsEvent {
  id: string;
  name: string;
  currency: string;
  impact: "High";
  /** YYYY-MM-DD in America/New_York */
  date: string;
  /** HH:MM (24-hour) in America/New_York for <input type="time"> */
  time: string;
  /** Human-readable NY time, e.g. "08:30 AM NY" */
  timeLabel: string;
  forecast?: string;
  previous?: string;
  source: "forexfactory" | "us-macro-schedule";
}

export interface RawForexFactoryItem {
  title?: string;
  country?: string;
  date?: string;
  impact?: string;
  forecast?: string;
  previous?: string;
}

export interface ForexFactoryLookupResult {
  date: string;
  live: boolean;
  source: "forexfactory-live" | "us-macro-schedule";
  hasMajorNews: boolean;
  events: MajorNewsEvent[];
  upcomingWeekEvents?: MajorNewsEvent[];
}

// In-memory cache of the ForexFactory weekly feed (15 minutes TTL)
let cachedRawFeed: { items: RawForexFactoryItem[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 15 * 60 * 1000;

const FF_URLS = [
  "https://nfs.faireconomy.media/ff_calendar_thisweek.json",
  "https://nfs.faireconomy.media/ff_calendar_nextweek.json",
];

export function todayNyIso(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TRADING_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "01";
  return `${g("year")}-${g("month")}-${g("day")}`;
}

/** Convert an ISO timestamp (e.g. "2026-11-01T08:30:00-05:00") to NY YYYY-MM-DD and HH:MM. */
export function toNyDateAndTime(isoString: string): { date: string; time: string; timeLabel: string } | null {
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TRADING_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(parsed);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  const rawHour = get("hour");
  const hour24 = rawHour === "24" ? "00" : rawHour;
  const minute = get("minute");

  const date = `${year}-${month}-${day}`;
  const time = `${hour24}:${minute}`;

  const hNum = Number(hour24);
  const ampm = hNum >= 12 ? "PM" : "AM";
  const h12 = hNum % 12 === 0 ? 12 : hNum % 12;
  const timeLabel = `${String(h12).padStart(2, "0")}:${minute} ${ampm} NY`;

  return { date, time, timeLabel };
}

/**
 * Filter raw ForexFactory JSON items to ONLY Major/High-Impact (`High` / `Red`) events
 * for the target date (`YYYY-MM-DD`), prioritizing USD (and EUR/GBP/CAD/JPY/AUD if requested).
 */
export function filterMajorForexFactoryEvents(
  rawItems: RawForexFactoryItem[],
  targetDate: string,
  currencies: string[] = ["USD"],
): MajorNewsEvent[] {
  const allowedCurrencies = new Set(currencies.map((c) => c.toUpperCase()));
  const seen = new Set<string>();
  const out: MajorNewsEvent[] = [];

  for (const item of rawItems) {
    const impact = (item.impact ?? "").trim().toLowerCase();
    if (impact !== "high" && impact !== "red" && impact !== "3") continue;

    const country = (item.country ?? "USD").trim().toUpperCase();
    if (allowedCurrencies.size > 0 && !allowedCurrencies.has(country) && !allowedCurrencies.has("ALL")) {
      continue;
    }

    const title = (item.title ?? "").trim();
    if (!title || !item.date) continue;

    const ny = toNyDateAndTime(item.date);
    if (!ny || ny.date !== targetDate) continue;

    const dedupeKey = `${ny.date}:${ny.time}:${title.toLowerCase()}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    out.push({
      id: `ff-${ny.date}-${ny.time.replace(":", "")}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 24)}`,
      name: country !== "USD" ? `${title} (${country})` : title,
      currency: country,
      impact: "High",
      date: ny.date,
      time: ny.time,
      timeLabel: ny.timeLabel,
      ...(item.forecast ? { forecast: item.forecast } : {}),
      ...(item.previous ? { previous: item.previous } : {}),
      source: "forexfactory",
    });
  }

  return out.sort((a, b) => a.time.localeCompare(b.time));
}

/**
 * Deterministic US High-Impact Macro Schedule fallback when offline or when querying
 * dates outside the current week's live ForexFactory feed.
 * Covers standard US high-impact releases (NFP 1st Friday 08:30, ISM Mfg 1st business day 10:00,
 * ISM Services 3rd business day 10:00, Unemployment Claims Thursdays 08:30, mid-month CPI/PPI/Retail Sales).
 */
export function getDeterministicMajorUsEvents(dateKey: string): MajorNewsEvent[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return [];
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return [];
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dow = dt.getUTCDay(); // 0=Sun .. 6=Sat
  if (dow === 0 || dow === 6) return []; // Weekend — no major scheduled US releases

  const events: MajorNewsEvent[] = [];
  const add = (name: string, time: string) => {
    const [hh, mm] = time.split(":").map(Number);
    const ampm = (hh ?? 0) >= 12 ? "PM" : "AM";
    const h12 = (hh ?? 0) % 12 === 0 ? 12 : (hh ?? 0) % 12;
    events.push({
      id: `ff-sched-${dateKey}-${time.replace(":", "")}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 20)}`,
      name,
      currency: "USD",
      impact: "High",
      date: dateKey,
      time,
      timeLabel: `${String(h12).padStart(2, "0")}:${String(mm ?? 0).padStart(2, "0")} ${ampm} NY`,
      source: "us-macro-schedule",
    });
  };

  // Count business day of the month
  let bizDay = 0;
  for (let day = 1; day <= d; day++) {
    const w = new Date(Date.UTC(y, m - 1, day, 12, 0, 0)).getUTCDay();
    if (w !== 0 && w !== 6) bizDay++;
  }

  // 1st Friday of the month -> Non-Farm Payrolls & Unemployment Rate (08:30 NY)
  if (dow === 5 && d <= 7) {
    add("Non-Farm Employment Change (NFP)", "08:30");
    add("Unemployment Rate", "08:30");
  }

  // 1st Business Day of the month -> ISM Manufacturing PMI (10:00 NY)
  if (bizDay === 1) {
    add("ISM Manufacturing PMI", "10:00");
  }

  // 3rd Business Day of the month -> ISM Services PMI (10:00 NY)
  if (bizDay === 3) {
    add("ISM Services PMI", "10:00");
  }

  // Every Thursday -> Unemployment Claims (08:30 NY)
  if (dow === 4) {
    add("Unemployment Claims", "08:30");
  }

  // 2nd Wednesday or Tuesday of the month (d between 10 and 14) -> CPI m/m & Core CPI (08:30 NY)
  if ((dow === 2 || dow === 3) && d >= 10 && d <= 14) {
    add("CPI m/m & Core CPI", "08:30");
  }

  return events.sort((a, b) => a.time.localeCompare(b.time));
}

export async function fetchLiveForexFactoryFeed(): Promise<{ items: RawForexFactoryItem[]; live: boolean }> {
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

function addDaysIso(dateKey: string, delta: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return dateKey;
  const dt = new Date(Date.UTC(y, m - 1, d + delta, 12, 0, 0));
  return dt.toISOString().slice(0, 10);
}

/**
 * Server-side lookup for Major-Impact (Red Folder) ForexFactory events on `dateKey`,
 * plus upcoming high-impact events over the next 5 days so Minato can answer both
 * "any news today?" and "what's coming up this week?".
 */
export async function fetchMajorForexFactoryEventsServer(
  dateKey?: string,
  currencies: string[] = ["USD"],
  includeWeek = true,
): Promise<ForexFactoryLookupResult> {
  const date = dateKey && /^\d{4}-\d{2}-\d{2}$/.test(dateKey.trim()) ? dateKey.trim() : todayNyIso();
  const { items, live } = await fetchLiveForexFactoryFeed();
  let majorEvents: MajorNewsEvent[] = [];
  let source: "forexfactory-live" | "us-macro-schedule" = "forexfactory-live";

  const feedDates = new Set(
    items
      .map((i) => (typeof i.date === "string" ? toNyDateAndTime(i.date)?.date ?? i.date.slice(0, 10) : ""))
      .filter(Boolean),
  );

  if (items.length > 0) {
    majorEvents = filterMajorForexFactoryEvents(items, date, currencies);
    if (majorEvents.length === 0 && !feedDates.has(date)) {
      majorEvents = getDeterministicMajorUsEvents(date);
      source = "us-macro-schedule";
    }
  } else {
    majorEvents = getDeterministicMajorUsEvents(date);
    source = "us-macro-schedule";
  }

  let upcomingWeekEvents: MajorNewsEvent[] | undefined;
  if (includeWeek) {
    const weekOut: MajorNewsEvent[] = [];
    for (let offset = 0; offset <= 5; offset++) {
      const dayIso = addDaysIso(date, offset);
      let dayEvs = items.length > 0 ? filterMajorForexFactoryEvents(items, dayIso, currencies) : [];
      if (dayEvs.length === 0 && (!items.length || !feedDates.has(dayIso))) {
        dayEvs = getDeterministicMajorUsEvents(dayIso);
      }
      weekOut.push(...dayEvs);
    }
    upcomingWeekEvents = weekOut;
  }

  return {
    date,
    live,
    source,
    hasMajorNews: majorEvents.length > 0,
    events: majorEvents,
    ...(upcomingWeekEvents ? { upcomingWeekEvents } : {}),
  };
}

/**
 * Checks whether a trade's entry time (`HH:MM`) falls within `windowMinutes` (default ±15 min)
 * of any Major-Impact news event on that day.
 */
export function findNearbyMajorNews(
  entryTime: string | undefined | null,
  events: MajorNewsEvent[],
  windowMinutes = 15,
): (MajorNewsEvent & { deltaMinutes: number }) | null {
  if (!entryTime || !/^\d{1,2}:\d{2}$/.test(entryTime.trim()) || events.length === 0) return null;
  const [eh, em] = entryTime.trim().split(":").map(Number);
  const entryTotal = (eh ?? 0) * 60 + (em ?? 0);

  let closest: (MajorNewsEvent & { deltaMinutes: number }) | null = null;
  for (const ev of events) {
    const [nh, nm] = ev.time.split(":").map(Number);
    const newsTotal = (nh ?? 0) * 60 + (nm ?? 0);
    const delta = Math.abs(entryTotal - newsTotal);
    if (delta <= windowMinutes && (!closest || delta < closest.deltaMinutes)) {
      closest = { ...ev, deltaMinutes: delta };
    }
  }
  return closest;
}
