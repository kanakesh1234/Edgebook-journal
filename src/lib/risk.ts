import type { JournalEntry, TradePlan } from "./types";

/**
 * Daily loss budget: "how much am I willing to lose today?", set in the plan, compared with what the day really did.
 * "Used" is the deepest the day's running P&L got below zero — recovering later does not un-spend the risk you took.
 */
export type DayRisk = {
  limit: number;
  /** Day's closing P&L so far. */
  net: number;
  /** Deepest the running P&L went below zero (positive number, 0 if never red). */
  used: number;
  /** used / limit, uncapped. */
  ratio: number;
  remaining: number;
  status: "ok" | "near" | "hit" | "over";
};

export const NEAR_RATIO = 0.75;

/**
 * The limit the trader set for a day. The limit set on Home (`dayLimits`) wins; older days, set inside a plan,
 * fall back to the latest plan of that day that carried one.
 */
export function dayLimitFor(date: string, plans: TradePlan[], dayLimits?: Record<string, number>): number | null {
  const set = dayLimits?.[date];
  if (typeof set === "number" && set > 0) return set;
  let best: TradePlan | null = null;
  for (const p of plans) {
    if (p.date !== date || !(typeof p.maxLoss === "number" && p.maxLoss > 0)) continue;
    if (!best || p.createdAt >= best.createdAt) best = p;
  }
  return best?.maxLoss ?? null;
}

const clock = (e: JournalEntry) => (e.entryTime && /^\d{1,2}:\d{2}$/.test(e.entryTime) ? e.entryTime.padStart(5, "0") : "");

/** Trades of one day in the order they happened (entry time, then when they were logged). */
export function dayTrades(date: string, entries: JournalEntry[]): JournalEntry[] {
  return entries.filter((e) => e.date === date).sort((a, b) => clock(a).localeCompare(clock(b)) || a.createdAt - b.createdAt);
}

/** How far below zero the running P&L of these (already ordered) trades got, and where it finished. */
export function deepestLoss(trades: JournalEntry[]): { used: number; net: number } {
  let run = 0, low = 0;
  for (const t of trades) { run += t.pnl; if (run < low) low = run; }
  return { used: low < 0 ? Math.round(-low * 100) / 100 : 0, net: Math.round(run * 100) / 100 || 0 }; // never -0
}

export function riskFor(limit: number | null | undefined, trades: JournalEntry[]): DayRisk | null {
  if (!limit || limit <= 0) return null;
  const { used, net: run } = deepestLoss(trades);
  const ratio = used / limit;
  const status: DayRisk["status"] = ratio > 1 + 1e-9 ? "over" : ratio >= 1 - 1e-9 ? "hit" : ratio >= NEAR_RATIO ? "near" : "ok";
  return { limit, net: run, used, ratio, remaining: Math.max(0, Math.round((limit - used) * 100) / 100), status };
}

export function dayRisk(date: string, entries: JournalEntry[], plans: TradePlan[], dayLimits?: Record<string, number>): DayRisk | null {
  return riskFor(dayLimitFor(date, plans, dayLimits), dayTrades(date, entries));
}

export const RISK_COPY: Record<DayRisk["status"], string> = {
  ok: "Within your limit",
  near: "Close to your limit",
  hit: "Limit reached",
  over: "Over your limit",
};

/** Round a suggested limit to a figure a person would actually type. */
export const niceMoney = (n: number) => (n < 100 ? Math.max(5, Math.round(n / 5) * 5) : n < 1000 ? Math.round(n / 10) * 10 : Math.round(n / 50) * 50);

/** A few round figures to start from: a share of the account when known, else a multiple of the usual loss. */
export function limitSuggestions(entries: JournalEntry[], startingEquity: number): { value: number; note: string }[] {
  const net = entries.reduce((s, e) => s + e.pnl, 0);
  const equity = startingEquity > 0 ? startingEquity + net : 0;
  if (equity > 0) return [0.005, 0.01, 0.02].map((p) => ({ value: niceMoney(equity * p), note: `${p * 100}%` }));
  const losses = entries.filter((e) => e.pnl < 0).map((e) => -e.pnl);
  if (losses.length >= 3) {
    const avg = losses.reduce((a, b) => a + b, 0) / losses.length;
    return [1, 2, 3].map((k) => ({ value: niceMoney(avg * k), note: `${k}× usual loss` }));
  }
  return [];
}
