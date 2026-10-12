/* ------------------------------------------------------------------ */
/*  Journal → replay                                                    */
/*                                                                      */
/*  Turns a journal entry into a backtest session that replays that     */
/*  exact trade: a window that starts a little BEFORE the entry (so the */
/*  setup can be watched forming) and ends a little after the exit,    */
/*  plus a ReplayTradeRef the store uses to execute the trader's real  */
/*  entry / exit when the replay clock reaches them.                   */
/*                                                                      */
/*  Journal times are "HH:MM" in New York trading time (see tz.ts).     */
/* ------------------------------------------------------------------ */

import type { JournalEntry, CurrencyCode } from "../types";
import { TRADING_TZ, zonedToUtc } from "../tz";
import { INSTRUMENTS } from "./instruments";
import type { BacktestConfig, ReplayTradeRef } from "./types";

export const DEFAULT_LEAD_MIN = 20; // minutes of price action shown before the entry
export const DEFAULT_TAIL_MIN = 20; // minutes shown after the exit
const MIN_WINDOW_MIN = 30;

/** "NQ", "MNQZ6", "NQ 12-26", "/ES" → "NQ" | "MNQ" | "ES" … or null if we have no data for it. */
export function instrumentFromJournal(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const up = raw.toUpperCase().replace(/^[A-Z]+:/, "").replace(/^\//, "").trim();
  const bySize = [...INSTRUMENTS].sort((a, b) => b.symbol.length - a.symbol.length);
  for (const i of bySize) {
    if (!up.startsWith(i.symbol)) continue;
    const rest = up.slice(i.symbol.length);
    // exact, a futures month+year code (Z6, H26), or punctuation/space-separated suffix
    if (rest === "" || /^[FGHJKMNQUVXZ]\d{1,2}$/.test(rest) || /^[\s._\-/!]/.test(rest)) return i.symbol;
  }
  return null;
}

const CLOCK = /^(\d{1,2}):(\d{2})/;
function clock(raw: string | undefined | null): string | null {
  const m = raw ? CLOCK.exec(raw.trim()) : null;
  if (!m) return null;
  const h = Number(m[1]), mm = Number(m[2]);
  if (h > 23 || mm > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function nextDay(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

function nyClock(utcSec: number): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TRADING_TZ, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(utcSec * 1000));
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { date: `${g("year")}-${g("month")}-${g("day")}`, time: `${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}` };
}

function sideOf(e: JournalEntry): "buy" | "sell" | null {
  if (e.direction === "long") return "buy";
  if (e.direction === "short") return "sell";
  // No direction recorded: infer it from prices + P&L (profit with exit above entry = long).
  if (e.entryPrice != null && e.exitPrice != null && e.exitPrice !== e.entryPrice && e.pnl !== 0) {
    return (e.exitPrice - e.entryPrice) * e.pnl > 0 ? "buy" : "sell";
  }
  return null;
}

export type ReplayPlan =
  | { ok: true; mode: "trade" | "day"; config: BacktestConfig }
  | { ok: false; reason: string };

export interface ReplayPlanOptions {
  startingBalance: number;
  currency: CurrencyCode;
  leadMinutes?: number;
  tailMinutes?: number;
}

/**
 * Plan a replay for a journal entry.
 *  • entry has an entry time → "trade": window around the trade + scripted execution
 *  • no entry time           → "day": the New York cash session of that date, no script
 */
export function planJournalReplay(entry: JournalEntry, opts: ReplayPlanOptions): ReplayPlan {
  const symbol = instrumentFromJournal(entry.instrument);
  if (!symbol) {
    return { ok: false, reason: `No replay data for “${entry.instrument || "this instrument"}” (available: ${INSTRUMENTS.map((i) => i.symbol).join(", ")}).` };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) return { ok: false, reason: "This entry has no valid trade date." };

  const entryClock = clock(entry.entryTime);
  const side = sideOf(entry);
  const lead = (opts.leadMinutes ?? DEFAULT_LEAD_MIN) * 60;
  const tail = (opts.tailMinutes ?? DEFAULT_TAIL_MIN) * 60;

  let startUtc: number, endUtc: number, ref: ReplayTradeRef | undefined, customStart: string, customEnd: string;
  let mode: "trade" | "day" = "day";

  const entryUtcDate = entryClock ? zonedToUtc(entry.date, `${entryClock}:00`, TRADING_TZ) : null;
  if (entryClock && entryUtcDate && side) {
    mode = "trade";
    const entryUtc = Math.floor(entryUtcDate.getTime() / 1000);
    const exitClock = clock(entry.exitTime);
    let exitUtc: number | null = null;
    if (exitClock) {
      const same = zonedToUtc(entry.date, `${exitClock}:00`, TRADING_TZ);
      let t = same ? Math.floor(same.getTime() / 1000) : null;
      if (t !== null && t < entryUtc) { // overnight hold: exit is on the next calendar day
        const nxt = zonedToUtc(nextDay(entry.date), `${exitClock}:00`, TRADING_TZ);
        t = nxt ? Math.floor(nxt.getTime() / 1000) : null;
      }
      exitUtc = t;
    }
    startUtc = Math.floor((entryUtc - lead) / 60) * 60;
    endUtc = Math.ceil(((exitUtc ?? entryUtc + 30 * 60) + tail) / 60) * 60;
    if (endUtc - startUtc < MIN_WINDOW_MIN * 60) endUtc = startUtc + MIN_WINDOW_MIN * 60;

    const qty = entry.quantity && entry.quantity > 0 ? Math.round(entry.quantity) : 1;
    ref = {
      entryId: entry.id,
      side,
      quantity: qty,
      entryUtc,
      exitUtc,
      entryPrice: entry.entryPrice ?? null,
      exitPrice: entry.exitPrice ?? null,
      stopLoss: entry.stopLoss ?? null,
      takeProfit: entry.takeProfit ?? null,
      journalPnl: entry.pnl,
      label: `${symbol} ${side === "buy" ? "Long" : "Short"} ×${qty}`,
      entryClock,
      exitClock: exitUtc ? clock(entry.exitTime) : null,
    };
    customStart = nyClock(startUtc).time;
    customEnd = nyClock(endUtc).time;
  } else {
    // Fallback: replay that whole day, nothing scripted.
    const s = zonedToUtc(entry.date, "09:30:00", TRADING_TZ);
    const e = zonedToUtc(entry.date, "16:00:00", TRADING_TZ);
    if (!s || !e) return { ok: false, reason: "Couldn't work out the trade's date/time." };
    startUtc = Math.floor(s.getTime() / 1000);
    endUtc = Math.floor(e.getTime() / 1000);
    customStart = "09:30";
    customEnd = "16:00";
  }

  const side$ = ref ? (ref.side === "buy" ? "Long" : "Short") : "";
  const config: BacktestConfig = {
    sessionName: mode === "trade"
      ? `Replay · ${symbol} ${side$} · ${entry.date} ${ref!.entryClock}`
      : `Replay · ${symbol} · ${entry.date}`,
    instruments: [symbol],
    instrumentSymbol: symbol,
    sessionId: "custom",
    customSession: { startTime: customStart, endTime: customEnd, timezone: TRADING_TZ },
    accountType: "personal",
    startingBalance: opts.startingBalance > 0 ? opts.startingBalance : 50000,
    currency: opts.currency,
    periodStartUtc: new Date(startUtc * 1000).toISOString(),
    periodEndUtc: new Date(endUtc * 1000).toISOString(),
    timeframe: "1m",
    replayTrade: ref,
  };
  return { ok: true, mode, config };
}

/** Seconds in a timeframe label ("1m", "5m", "1h", "1D", "30s"). */
export function timeframeSec(tf: string): number {
  const m = /^(\d+)(s|m|h|d|w)$/i.exec(tf.trim());
  if (!m) return 60;
  const n = Number(m[1]);
  switch (m[2].toLowerCase()) {
    case "s": return n;
    case "m": return n * 60;
    case "h": return n * 3600;
    case "d": return n * 86400;
    default: return n * 604800;
  }
}

/**
 * Does the bar starting at `barTime` contain (or, after a data gap, immediately
 * follow) the instant `ts`? `maxLateSec` stops a script from firing hours after
 * the fact, e.g. after the user navigated to another day.
 */
export function barCovers(barTime: number, barSec: number, ts: number, maxLateSec: number | null): boolean {
  if (barTime + barSec <= ts) return false; // bar finished before the moment
  return maxLateSec === null || barTime <= ts + maxLateSec;
}
