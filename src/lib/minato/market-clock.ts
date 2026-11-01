/**
 * Deterministic CME-equity-futures clock (NQ / ES family), in New York time.
 *
 * The model must never guess whether markets are open or whether data is "streaming" — it is told here.
 * Globex week: Sunday 18:00 ET → Friday 17:00 ET, with a daily break 17:00–18:00 ET (Mon–Thu).
 */

export type MarketState = "closed_weekend" | "daily_break" | "open";
export type MarketSession = "asia" | "london" | "ny_premarket" | "ny_open" | "ny_afternoon" | "after_hours" | "closed";

export interface MarketClock {
  weekday: string;
  date: string;
  time: string;
  state: MarketState;
  session: MarketSession;
  /** One plain sentence the model may use verbatim when the trader asks about the market. */
  summary: string;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function nyParts(now: Date) {
  const f = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  const hour = Number(p.hour) % 24;
  const minute = Number(p.minute);
  return {
    weekday: String(p.weekday),
    dow: DAYS.indexOf(String(p.weekday)),
    date: `${p.year}-${p.month}-${p.day}`,
    hour,
    minute,
    time: `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
  };
}

function until(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function marketClock(now: Date = new Date()): MarketClock {
  const n = nyParts(now);
  const mod = n.hour * 60 + n.minute; // minutes since midnight ET
  const base = { weekday: n.weekday, date: n.date, time: n.time };

  const weekendClosed =
    n.dow === 6 || (n.dow === 5 && mod >= 17 * 60) || (n.dow === 0 && mod < 18 * 60);
  if (weekendClosed) {
    // minutes until Sunday 18:00 ET
    const toSunday = n.dow === 5 ? (24 - n.hour) * 60 - n.minute + 24 * 60 + 18 * 60 : n.dow === 6 ? (24 - n.hour) * 60 - n.minute + 18 * 60 : 18 * 60 - mod;
    return {
      ...base,
      state: "closed_weekend",
      session: "closed",
      summary: `Futures are closed for the weekend and reopen Sunday 6:00 PM ET (in ${until(toSunday)}).`,
    };
  }

  if (n.dow >= 1 && n.dow <= 4 && mod >= 17 * 60 && mod < 18 * 60) {
    return { ...base, state: "daily_break", session: "closed", summary: `Daily futures break — trading resumes at 6:00 PM ET (in ${until(18 * 60 - mod)}).` };
  }

  let session: MarketSession;
  if (mod >= 18 * 60 || mod < 3 * 60) session = "asia";
  else if (mod < 8 * 60) session = "london";
  else if (mod < 9 * 60 + 30) session = "ny_premarket";
  else if (mod < 12 * 60) session = "ny_open";
  else if (mod < 16 * 60) session = "ny_afternoon";
  else session = "after_hours";

  const label: Record<MarketSession, string> = {
    asia: "Asia session",
    london: "London session",
    ny_premarket: "NY pre-market (cash open 9:30 AM ET)",
    ny_open: "NY morning session",
    ny_afternoon: "NY afternoon session",
    after_hours: "after the cash close",
    closed: "closed",
  };
  return { ...base, state: "open", session, summary: `Futures are open — ${label[session]}.` };
}
