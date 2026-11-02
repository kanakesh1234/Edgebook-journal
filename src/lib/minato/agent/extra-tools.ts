/**
 * EXTRA TOOLS — pure, read-only analytics the base tool set could not express.
 *
 *  get_daily_summaries  one row per trading day (P&L, trades, wins/losses, rule breaches) — "how was my week?"
 *  get_risk_profile     the trader's REAL stop distances and sizes from their journal, plus what drawdown room
 *                       and the losing-streak distribution imply for risk per trade and contracts.
 *                       Replaces asking "what is your typical stop?" when the journal already knows.
 *  get_data_coverage    what the journal does and does not contain, so missing information is stated, not guessed.
 *
 * Everything here is computed from the trader's own records for this request. Nothing is cached.
 */
import type { JournalEntry } from "@/lib/types";
import { computeStats } from "@/lib/stats";
import { evaluateRules } from "@/lib/rules";
import { newestFirst } from "../setup-analytics";
import { computeStreakTool, resolveInstrumentSpec } from "../tools";
import type { TraderDatabaseContext } from "../db-tools";

const r2 = (n: number) => Math.round(n * 100) / 100;
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const pct = (xs: number[], p: number) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))]!;
};
const inRange = (d: string, from?: string | null, to?: string | null) => (!from || d >= from) && (!to || d <= to);

/* ------------------------------------------------------------------ */
/*  get_daily_summaries                                                */
/* ------------------------------------------------------------------ */

export function dailySummaries(db: TraderDatabaseContext, args: { dateFrom?: string; dateTo?: string; limit?: number; offset?: number; sortBy?: string }) {
  const pool = newestFirst(db.entries).filter((e) => inRange(e.date, args.dateFrom, args.dateTo));
  const violations = evaluateRules(pool as JournalEntry[], db.settings);
  const vByDate = new Map<string, number>();
  for (const v of violations) vByDate.set(v.date, (vByDate.get(v.date) ?? 0) + 1);

  const days = new Map<string, JournalEntry[]>();
  for (const e of pool) (days.get(e.date) ?? days.set(e.date, []).get(e.date)!).push(e);

  const rows = [...days.entries()].map(([date, es]) => {
    const wins = es.filter((e) => e.pnl > 0).length;
    const losses = es.filter((e) => e.pnl < 0).length;
    const best = es.reduce((a, b) => (b.pnl > a.pnl ? b : a));
    const worst = es.reduce((a, b) => (b.pnl < a.pnl ? b : a));
    return {
      date,
      weekday: new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
      trades: es.length,
      wins,
      losses,
      netPnl: r2(es.reduce((s, e) => s + e.pnl, 0)),
      bestTrade: { id: best.id, pnl: r2(best.pnl), setup: best.setup || null },
      worstTrade: { id: worst.id, pnl: r2(worst.pnl), setup: worst.setup || null },
      ruleBreaches: vByDate.get(date) ?? 0,
    };
  });

  const noTrade = (db.dayLogs ?? []).filter((d) => inRange(d.date, args.dateFrom, args.dateTo)).map((d) => ({ date: d.date, reason: d.reason ?? null }));

  const sortBy = args.sortBy ?? "newest";
  if (sortBy === "oldest") rows.sort((a, b) => a.date.localeCompare(b.date));
  else if (sortBy === "best") rows.sort((a, b) => b.netPnl - a.netPnl);
  else if (sortBy === "worst") rows.sort((a, b) => a.netPnl - b.netPnl);
  else rows.sort((a, b) => b.date.localeCompare(a.date));

  const limit = Math.min(90, Math.max(1, Math.trunc(args.limit ?? 30)));
  const offset = Math.max(0, Math.trunc(args.offset ?? 0));
  const green = rows.filter((r) => r.netPnl > 0).length;
  const red = rows.filter((r) => r.netPnl < 0).length;
  return {
    totalTradingDays: rows.length,
    greenDays: green,
    redDays: red,
    flatDays: rows.length - green - red,
    netPnl: r2(rows.reduce((s, r) => s + r.netPnl, 0)),
    returned: Math.max(0, Math.min(limit, rows.length - offset)),
    offset,
    hasMore: offset + limit < rows.length,
    days: rows.slice(offset, offset + limit),
    noTradeDays: noTrade.slice(-20),
  };
}

/* ------------------------------------------------------------------ */
/*  get_risk_profile                                                   */
/* ------------------------------------------------------------------ */

export function riskProfile(db: TraderDatabaseContext, args: { instrument?: string }) {
  const entries = newestFirst(db.entries);
  const settings = db.settings;
  const stats = computeStats(entries, settings);
  const wanted = args.instrument?.trim().toUpperCase() || null;

  // Realised stop distance per instrument, from trades that recorded both an entry and a stop.
  const by = new Map<string, { stops: number[]; qty: number[]; losses: number[]; trades: number; withStop: number }>();
  for (const e of entries) {
    const key = (e.instrument || "UNKNOWN").toUpperCase();
    if (wanted && !key.startsWith(wanted)) continue;
    const b = by.get(key) ?? { stops: [], qty: [], losses: [], trades: 0, withStop: 0 };
    b.trades++;
    if (typeof e.entryPrice === "number" && typeof e.stopLoss === "number" && Number.isFinite(e.entryPrice) && Number.isFinite(e.stopLoss)) {
      const pts = Math.abs(e.entryPrice - e.stopLoss);
      if (pts > 0) { b.stops.push(pts); b.withStop++; }
    }
    if (typeof e.quantity === "number" && e.quantity > 0) b.qty.push(e.quantity);
    if (e.pnl < 0) b.losses.push(Math.abs(e.pnl));
    by.set(key, b);
  }

  const streak = computeStreakTool({ entries, runs: 5_000, seed: 42 });
  const p95 = streak.monteCarlo.p95MaxStreak;
  const ddLimit = settings.maxDrawdown || null;
  const room = stats.drawdownCushion != null ? Math.max(0, stats.drawdownCushion) : ddLimit != null ? Math.max(0, ddLimit - stats.drawdown) : null;

  const dailyRule = settings.rules?.rules.find((r) => r.id === "risk.max-daily-loss" && r.enabled)?.params?.limit;
  const todayLimit = settings.dayLimits?.[db.today] ?? (typeof dailyRule === "number" ? dailyRule : null) ?? db.semanticParams?.dailyLossLimit ?? null;

  // Risk-per-trade ceilings, each with the reason a trader can check.
  const ceilings: { basis: string; riskPerTrade: number; why: string }[] = [];
  if (room != null && room > 0 && p95 > 0) {
    ceilings.push({
      basis: "drawdown_room_vs_bad_losing_run",
      riskPerTrade: r2(room / p95),
      why: `Drawdown room ${r2(room)} ÷ ${p95} losses in a row (95th-percentile run over ${streak.horizonTrades} trades at ${Math.round(streak.winRate * 1000) / 10}% win rate).`,
    });
    ceilings.push({
      basis: "drawdown_room_with_one_loss_buffer",
      riskPerTrade: r2(room / (p95 + 1)),
      why: `Same, with one extra loss of buffer (${p95 + 1} losses).`,
    });
  }
  if (typeof todayLimit === "number" && todayLimit > 0) {
    ceilings.push({ basis: "daily_loss_limit_two_losses", riskPerTrade: r2(todayLimit / 2), why: `Daily loss limit ${todayLimit} ÷ 2, so two full losses stay inside the day's limit.` });
  }
  if (db.semanticParams?.riskDollars) ceilings.push({ basis: "trader_saved_risk", riskPerTrade: db.semanticParams.riskDollars, why: "Risk per trade the trader saved to memory." });
  else if (db.semanticParams?.riskPct) ceilings.push({ basis: "trader_saved_risk_pct", riskPerTrade: r2(stats.currentEquity * (db.semanticParams.riskPct / 100)), why: `${db.semanticParams.riskPct}% of current equity (saved preference).` });

  const binding = ceilings.length ? Math.min(...ceilings.map((c) => c.riskPerTrade)) : null;

  const instruments = [...by.entries()]
    .sort((a, b) => b[1].trades - a[1].trades)
    .slice(0, 4)
    .map(([symbol, b]) => {
      const spec = resolveInstrumentSpec(symbol);
      const medStop = median(b.stops);
      const sizing = medStop && binding
        ? {
            atMedianStop: {
              stopPoints: r2(medStop),
              dollarsPerContract: r2(medStop * spec.pointValue),
              maxContractsAtBindingCeiling: Math.floor(binding / (medStop * spec.pointValue)),
            },
          }
        : null;
      return {
        symbol,
        pointValue: spec.pointValue,
        trades: b.trades,
        tradesWithRecordedStop: b.withStop,
        stopPoints: b.stops.length
          ? { median: r2(median(b.stops)!), average: r2(b.stops.reduce((s, x) => s + x, 0) / b.stops.length), p90: r2(pct(b.stops, 0.9)!), smallest: r2(Math.min(...b.stops)), largest: r2(Math.max(...b.stops)) }
          : null,
        contractsTraded: b.qty.length ? { median: median(b.qty), largest: Math.max(...b.qty) } : null,
        realisedLoss: b.losses.length ? { average: r2(b.losses.reduce((s, x) => s + x, 0) / b.losses.length), largest: r2(Math.max(...b.losses)), median: r2(median(b.losses)!) } : null,
        ...(sizing ?? {}),
      };
    });

  const gaps: string[] = [];
  if (!instruments.some((i) => i.stopPoints)) gaps.push("No trade has both an entry price and a stop-loss recorded, so the trader's typical stop distance can't be measured from the journal.");
  if (room == null) gaps.push("No drawdown limit is configured, so drawdown-based risk ceilings can't be computed.");
  if (stats.drawdownCushion == null && ddLimit == null) gaps.push("Drawdown limit unknown.");

  return {
    scope: wanted ? `instrument ${wanted}` : "all instruments in scope",
    account: {
      currentEquity: r2(stats.currentEquity),
      drawdownLimit: ddLimit,
      drawdownUsed: r2(stats.drawdown),
      drawdownRoom: room != null ? r2(room) : null,
      dailyLossLimit: todayLimit,
    },
    losingStreaks: {
      tradeWinRatePct: Math.round(streak.winRate * 1000) / 10,
      sampleTrades: streak.sampleTrades,
      historicalMaxLosingStreak: streak.historicalMaxLosingStreak,
      expectedMaxOverHorizon: streak.monteCarlo.meanMaxStreak,
      p95Max: p95,
      p99Max: streak.monteCarlo.p99MaxStreak,
      horizonTrades: streak.horizonTrades,
      caveat: streak.sampleSizeCaveat,
    },
    riskPerTradeCeilings: ceilings,
    bindingCeilingPerTrade: binding,
    instruments,
    savedPreferences: {
      riskDollars: db.semanticParams?.riskDollars ?? null,
      riskPct: db.semanticParams?.riskPct ?? null,
      stopPoints: db.semanticParams?.stopPoints ?? null,
    },
    dataGaps: gaps,
  };
}

/* ------------------------------------------------------------------ */
/*  get_data_coverage                                                  */
/* ------------------------------------------------------------------ */

export function dataCoverage(db: TraderDatabaseContext) {
  const es = db.entries;
  const n = es.length;
  const count = (f: (e: JournalEntry) => boolean) => es.filter(f).length;
  const dates = es.map((e) => e.date).sort();
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  const c = {
    trades: n,
    firstTradeDate: dates[0] ?? null,
    lastTradeDate: dates[n - 1] ?? null,
    withEntryPrice: count((e) => num(e.entryPrice)),
    withExitPrice: count((e) => num(e.exitPrice)),
    withStopLoss: count((e) => num(e.stopLoss)),
    withTakeProfit: count((e) => num(e.takeProfit)),
    withQuantity: count((e) => num(e.quantity)),
    withEntryAndExitTimes: count((e) => !!e.entryTime && !!e.exitTime),
    withNamedSetup: count((e) => !!e.setup?.trim()),
    withRMultiple: count((e) => num(e.rr)),
    withWrittenNotes: count((e) => !!e.notes?.trim()),
    withReflection: count((e) => !!e.reflection),
    withStructuredReview: count((e) => !!e.review),
    withPsychologyReview: count((e) => !!e.review?.psychology),
    withProcessVerdict: count((e) => e.review?.outcome?.processVerdict != null),
    withPreTradeChecklist: count((e) => !!e.preTradeChecklist?.length),
    preTradePlans: db.plans?.length ?? 0,
    noTradeDayLogs: db.dayLogs?.length ?? 0,
    activeRules: (db.settings.rules?.rules ?? []).filter((r) => r.enabled).length,
    playbookSetups: (db.settings.playbook ?? []).length,
  };
  const missing: string[] = [];
  const share = (k: number) => (n ? Math.round((k / n) * 100) : 0);
  if (n === 0) missing.push("The journal has no trades in scope.");
  else {
    if (c.withStopLoss < n) missing.push(`Only ${c.withStopLoss} of ${n} trades have a stop-loss recorded (${share(c.withStopLoss)}%).`);
    if (c.withEntryPrice < n) missing.push(`Only ${c.withEntryPrice} of ${n} trades have an entry price recorded.`);
    if (c.withStructuredReview < n) missing.push(`Only ${c.withStructuredReview} of ${n} trades have a structured review, so process/psychology findings rest on those trades alone.`);
    if (c.withNamedSetup < n) missing.push(`${n - c.withNamedSetup} trades have no setup name, so setup rankings exclude them.`);
    if (c.withPsychologyReview === 0) missing.push("No trade has psychology answers yet, so emotional patterns can't be measured.");
    if (c.withWrittenNotes + c.withReflection === 0) missing.push("No written notes or reflections exist yet.");
  }
  return { coverage: c, missing };
}

/* ------------------------------------------------------------------ */
/*  Helper for the brief & checkpoints                                 */
/* ------------------------------------------------------------------ */

export function todaySnapshot(entries: readonly JournalEntry[], today: string) {
  const todays = entries.filter((e) => e.date === today);
  return {
    date: today,
    trades: todays.length,
    wins: todays.filter((e) => e.pnl > 0).length,
    losses: todays.filter((e) => e.pnl < 0).length,
    netPnl: r2(todays.reduce((s, e) => s + e.pnl, 0)),
  };
}
