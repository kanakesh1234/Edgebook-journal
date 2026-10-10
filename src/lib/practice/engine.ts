/**
 * Practice engine — builds questions from the trader's OWN journal.
 *
 * Rules:
 *  - Every answer is computed in code from recorded fields. Nothing is
 *    read off a chart and nothing is invented.
 *  - A trade is "usable" as soon as it has a P&L. Extra fields (side, time,
 *    setup, stop/target, lesson…) simply unlock more question types.
 *  - Difficulty is a 1–4 level that decides WHICH questions are allowed and
 *    how close the wrong answers are.
 */
import type { EntryImage, JournalEntry, PracticeProgress } from "@/lib/types";
import { addDays, formatDateMedium, weekdayLong } from "@/lib/format";
import { seededRng, type Rng } from "./math/rng";
import { breakevenWinRate, lossStreakProbability } from "./math/formulas";
import { buildTradeQuestions } from "./chart-questions";
import { hashText } from "./hash.ts";
import { focusOf } from "./focus.ts";
import type { QuestionVisual } from "./ict";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type Level = 1 | 2 | 3 | 4;

export type QuestionKind = "choice" | "number";

export interface PracticeQuestion {
  id: string;
  kind: QuestionKind;
  /** Mastery tag, e.g. "direction", "planned-rr". */
  tag: string;
  level: Level;
  prompt: string;
  /** Only for kind === "choice". */
  choices?: string[];
  /** For "number" this is a numeric string. */
  answer: string;
  /** Allowed absolute error for "number". */
  tolerance?: number;
  unit?: string;
  explanation: string;
  /** Where the evidence comes from, shown above the question. */
  pin: string;
  xp: number;
  /** Stable fingerprint used by the no-repeat history. */
  fp: string;
  source?: "local" | "ai";
  /** Verbatim excerpt of the trader's own words that an AI question is based on. */
  evidence?: string;
  tradeId?: string;
  /** Which part of the game this question belongs to (drives the Matrix / Boss mix). */
  group?: "tm" | "math" | "duel" | "boss" | "ict";
  /** Trades whose saved screenshots are shown above the question. Defaults to [tradeId]. */
  chartTradeIds?: string[];
  /** The question is easier with the second chart — nudges the trader to open Compare. */
  compareHint?: boolean;
  /** Missed before — it is back because the trader answered it wrong last time. */
  retry?: boolean;
  /** A small drawn scene (candles, levels, zones) shown above the question — used by ICT Lab. */
  visual?: QuestionVisual;
  /** Pictures the trader attached to their own question (ICT Lab). Stored in the image store. */
  images?: EntryImage[];
  /** How the trade this question is about went: blunder / slip (a mistake trade) · mixed · clean (done well). Drives the framing, the weight and the revision schedule. */
  focus?: "blunder" | "slip" | "mixed" | "clean";
  /** A mistake-trade question that is back because its revision date has arrived (not because it was missed). */
  revise?: boolean;
  /** The ICT Lab card this question was made from. */
  cardId?: string;
  /** The trader's own "why it's right" note for that card, shown after answering. */
  note?: string;
}

/* ------------------------------------------------------------------ */
/*  Small helpers                                                      */
/* ------------------------------------------------------------------ */

const isNum = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const round = (value: number, decimals = 2) => Number(value.toFixed(decimals));

export function fmtMoney(value: number): string {
  const sign = value < 0 ? "−" : value > 0 ? "+" : "";
  return `${sign}$${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

const sideOf = (entry: JournalEntry): string | null => (entry.direction ? String(entry.direction) : null);

export function tradeLabel(entry: JournalEntry): string {
  const parts = [formatDateMedium(entry.date), entry.instrument || "trade"];
  const side = sideOf(entry);
  if (side) parts.push(cap(side));
  return parts.join(" · ");
}

/* ------------------------------------------------------------------ */
/*  Which trades are usable, and what is missing                       */
/* ------------------------------------------------------------------ */

/** A trade is usable as soon as it has a real P&L number. */
export const isUsable = (entry: JournalEntry) => isNum(entry.pnl);

/* ------------------------------------------------------------------ */
/*  Question constructors                                              */
/* ------------------------------------------------------------------ */

function choiceQ(id: string, tag: string, level: Level, pin: string, prompt: string, answer: string, wrong: string[], explanation: string, rng: Rng): PracticeQuestion | null {
  const distractors = [...new Set(wrong.filter((item) => item && item !== answer))].slice(0, 3);
  if (!distractors.length) return null;
  return { id, fp: id, source: "local", kind: "choice", tag, level, pin, prompt, choices: shuffle([answer, ...distractors], rng), answer, explanation, xp: 10 * level };
}

function numberQ(id: string, tag: string, level: Level, pin: string, prompt: string, answer: number, tolerance: number, unit: string, explanation: string): PracticeQuestion {
  return { id, fp: id, source: "local", kind: "number", tag, level, pin, prompt, answer: String(round(answer, 4)), tolerance, unit, explanation, xp: 12 * level };
}

/* ------------------------------------------------------------------ */
/*  Per-trade questions                                                */
/* ------------------------------------------------------------------ */

function tradeQuestions(entry: JournalEntry, all: JournalEntry[], rng: Rng): PracticeQuestion[] {
  // The label above each question says why this trade is here: a mistake to replay, or something done well.
  const kind = focusOf(entry, all).kind;
  const label = tradeLabel(entry);
  const pin = kind === "blunder" || kind === "slip" ? `Mistake replay · ${label}` : kind === "clean" ? `Done well · ${label}` : label;
  return buildTradeQuestions(entry, all, rng, pin);
}

/* ------------------------------------------------------------------ */
/*  Portfolio math (uses ALL recorded trades)                          */
/* ------------------------------------------------------------------ */

export function portfolioQuestions(all: JournalEntry[], rng: Rng, drawdownLeft: number | null): PracticeQuestion[] {
  const trades = all.filter(isUsable);
  const n = trades.length;
  if (n < 2) return [];
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl < 0);
  const winRate = wins.length / n;
  const pin = `All ${n} recorded trades${n < 20 ? " · small sample" : ""}`;
  const out: PracticeQuestion[] = [];

  const PF = (q: PracticeQuestion): PracticeQuestion => ({ ...q, group: "math" });
  out.push(numberQ("pf:wins", "win-count", 1, pin, `Out of your ${n} recorded trades, how many were winners (P&L above zero)?`, wins.length, 0, "", `${wins.length} of ${n} trades have a positive P&L.`));
  out.push(numberQ("pf:winrate", "win-rate", 2, pin, `What is your win rate across these ${n} trades?`, winRate * 100, 0.6, "%", `${wins.length} ÷ ${n} = ${round(winRate * 100, 1)}%.`));
  const expectancy = trades.reduce((sum, t) => sum + t.pnl, 0) / n;
  out.push(numberQ("pf:expectancy", "expectancy", 3, pin, "What is your average P&L per trade (expectancy in dollars)?", expectancy, Math.max(1, Math.abs(expectancy) * 0.02), "$", `Sum of P&L ÷ ${n} trades = ${fmtMoney(round(expectancy))} per trade.`));

  if (wins.length && losses.length) {
    const avgWin = wins.reduce((s, t) => s + t.pnl, 0) / wins.length;
    const avgLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / losses.length);
    const payoff = avgWin / avgLoss;
    out.push(numberQ("pf:payoff", "payoff", 3, pin, `Average winner is $${round(avgWin)} and average loser is $${round(avgLoss)}. What is your payoff ratio (avg win ÷ avg loss)?`, payoff, 0.05, "R", `${round(avgWin)} ÷ ${round(avgLoss)} = ${round(payoff)}.`));
    out.push(numberQ("pf:breakeven", "breakeven", 3, pin, `With a payoff ratio of ${round(payoff)}, what win rate do you need just to break even?`, breakevenWinRate(payoff) * 100, 0.6, "%", `1 ÷ (1 + ${round(payoff)}) = ${round(breakevenWinRate(payoff) * 100, 1)}%.`));
    if (drawdownLeft != null && drawdownLeft > 0) {
      const fit = Math.floor(drawdownLeft / avgLoss);
      out.push(numberQ("pf:buffer", "buffer", 3, pin, `You have $${Math.round(drawdownLeft)} of drawdown left and your average loser is $${round(avgLoss)}. How many average losses can you afford?`, fit, 0, "losses", `floor(${Math.round(drawdownLeft)} ÷ ${round(avgLoss)}) = ${fit}.`));
    }
  }

  const streak = lossStreakProbability(winRate, 3) * 100;
  out.push(numberQ("pf:streak", "loss-streak", 4, pin, `At your ${round(winRate * 100, 1)}% win rate, what is the chance of 3 losses in a row?`, streak, 0.6, "%", `(1 − ${round(winRate, 3)})³ = ${round(streak, 1)}%.`));

  return shuffle(out.map((q) => ({ ...PF(q), fp: `${q.fp}@n${n}` })), rng);
}

/* ------------------------------------------------------------------ */
/*  Progress helpers (level, rank, streak)                             */
/* ------------------------------------------------------------------ */

export function rankOf(xp: number): string {
  return xp >= 2500 ? "Jonin" : xp >= 1200 ? "Chunin" : "Genin";
}

/** A streak freeze is earned back for every 7 days of unbroken practice, up to two in the bank. */
export const MAX_FREEZES = 2;
export const FREEZE_EVERY = 7;
const earnFreeze = (streak: number, freeze: number) => (streak > 0 && streak % FREEZE_EVERY === 0 ? Math.min(MAX_FREEZES, freeze + 1) : freeze);

/**
 * Streak after practising today. Misses reset it; one missed day can be covered by a freeze.
 * Freezes used to be a one-time gift (1, never refilled), so after the first missed day a player could
 * never be protected again. They are now earned back: every 7th day of streak adds one (max 2).
 */
export function nextStreak(progress: PracticeProgress, today: string): { streak: number; freezeDays: number } {
  const freeze = progress.freezeDays ?? 1;
  const last = progress.lastMissionDate;
  if (!last) return { streak: 1, freezeDays: freeze };
  if (last === today) return { streak: Math.max(1, progress.streak), freezeDays: freeze };
  if (last === addDays(today, -1)) { const streak = progress.streak + 1; return { streak, freezeDays: earnFreeze(streak, freeze) }; }
  if (last === addDays(today, -2) && freeze > 0) { const streak = progress.streak + 1; return { streak, freezeDays: earnFreeze(streak, freeze - 1) }; }
  return { streak: 1, freezeDays: freeze };
}

/** Streak to DISPLAY today: zero once it has actually lapsed. */
export function displayStreak(progress: PracticeProgress, today: string): number {
  const last = progress.lastMissionDate;
  if (!last) return 0;
  if (last === today || last === addDays(today, -1)) return progress.streak;
  if (last === addDays(today, -2) && (progress.freezeDays ?? 1) > 0) return progress.streak;
  return 0;
}

/* ------------------------------------------------------------------ */
/*  Pools for the four game modes                                      */
/* ------------------------------------------------------------------ */

export type GameMode = "matrix" | "time-machine" | "boss";

/** Trades of the "active week": the 7 calendar days ending at the latest trade. Falls back to the latest 10 trades. */
export function weekTrades(all: JournalEntry[]): { trades: JournalEntry[]; label: string } {
  const usable = all.filter(isUsable).sort((a, b) => a.date.localeCompare(b.date));
  if (!usable.length) return { trades: [], label: "No trades yet" };
  const last = usable[usable.length - 1]!.date;
  const from = addDays(last, -6);
  const week = usable.filter((t) => t.date >= from);
  if (week.length >= 2) return { trades: week, label: `${formatDateMedium(from)} – ${formatDateMedium(last)}` };
  const recent = usable.slice(-10);
  return { trades: recent, label: `Latest ${recent.length} trades` };
}

/** Cross-trade questions for the Weekend Boss. */
export function bossQuestions(trades: JournalEntry[], rng: Rng): PracticeQuestion[] {
  const week = trades.filter(isUsable);
  const n = week.length;
  if (n < 2) return [];
  const pin = `Boss week · ${n} trades`;
  const out: Array<PracticeQuestion | null> = [];
  const net = week.reduce((sum, t) => sum + t.pnl, 0);
  const wins = week.filter((t) => t.pnl > 0);
  const losses = week.filter((t) => t.pnl < 0);
  const byPnl = [...week].sort((a, b) => b.pnl - a.pnl);
  const best = byPnl[0]!;
  const worst = byPnl[byPnl.length - 1]!;

  out.push(choiceQ("boss:net-sign", "boss-net", 1, pin, "Was the week net positive, negative or flat?", net > 0 ? "Net positive" : net < 0 ? "Net negative" : "Flat", ["Net positive", "Net negative", "Flat"], `Combined P&L is ${fmtMoney(round(net))}.`, rng));
  out.push(numberQ("boss:wins", "win-count", 1, pin, `How many of the ${n} trades were winners?`, wins.length, 0, "", `${wins.length} of ${n} finished above zero.`));
  out.push(numberQ("boss:net", "boss-net", 3, pin, `What was your combined P&L for these ${n} trades?`, net, Math.max(1, Math.abs(net) * 0.01), "$", `Sum of all trades = ${fmtMoney(round(net))}.`));
  out.push(numberQ("boss:winrate", "win-rate", 2, pin, `What was the win rate across these ${n} trades?`, (wins.length / n) * 100, 0.6, "%", `${wins.length} ÷ ${n} = ${round((wins.length / n) * 100, 1)}%.`));
  out.push(numberQ("boss:avg", "expectancy", 3, pin, "What was the average P&L per trade?", net / n, Math.max(1, Math.abs(net / n) * 0.02), "$", `${fmtMoney(round(net))} ÷ ${n} = ${fmtMoney(round(net / n))}.`));
  out.push(numberQ("boss:spread", "spread", 3, pin, "What is the gap between your best and worst trade (best minus worst)?", best.pnl - worst.pnl, 1, "$", `${fmtMoney(best.pnl)} − (${fmtMoney(worst.pnl)}) = ${fmtMoney(round(best.pnl - worst.pnl))}.`));

  const dates = [...new Set(week.map((t) => t.date))];
  if (dates.length >= 3) {
    const label = (d: string) => formatDateMedium(d);
    out.push(choiceQ("boss:worst-day", "boss-day", 2, pin, "Which day had your single biggest loss?", label(worst.date), dates.filter((d) => d !== worst.date).map(label), `${tradeLabel(worst)} lost ${fmtMoney(worst.pnl)}.`, rng));
    out.push(choiceQ("boss:best-day", "boss-day", 2, pin, "Which day had your single biggest win?", label(best.date), dates.filter((d) => d !== best.date).map(label), `${tradeLabel(best)} made ${fmtMoney(best.pnl)}.`, rng));
  }
  const perDay = new Map<string, number>();
  for (const t of week) perDay.set(weekdayLong(t.date), (perDay.get(weekdayLong(t.date)) ?? 0) + 1);
  const busiest = [...perDay.entries()].sort((a, b) => b[1] - a[1])[0];
  if (busiest && perDay.size >= 2 && [...perDay.values()].filter((v) => v === busiest[1]).length === 1) {
    out.push(choiceQ("boss:busiest", "boss-day", 2, pin, "Which weekday did you trade most often?", busiest[0], [...perDay.keys()].filter((d) => d !== busiest[0]).concat(["Monday", "Friday"].filter((d) => !perDay.has(d))), `${busiest[1]} trades were recorded on ${busiest[0]}.`, rng));
  }
  if (wins.length && losses.length) {
    const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    out.push(numberQ("boss:pf", "profit-factor", 4, pin, `Gross profit is $${round(grossWin)} and gross loss is $${round(grossLoss)}. What is the profit factor?`, grossWin / grossLoss, 0.05, "x", `${round(grossWin)} ÷ ${round(grossLoss)} = ${round(grossWin / grossLoss)}.`));
    out.push(numberQ("boss:need", "breakeven", 4, pin, `Your average winner is $${round(grossWin / wins.length)} and average loser is $${round(grossLoss / losses.length)}. What win rate do you need to break even?`, breakevenWinRate(grossWin / wins.length / (grossLoss / losses.length)) * 100, 0.6, "%", "Break-even win rate = loss ÷ (win + loss)."));
  }
  const rs = week.map((t) => t.rr).filter(isNum);
  if (rs.length >= 2) {
    const total = rs.reduce((a, b) => a + b, 0);
    out.push(numberQ("boss:r", "r-total", 3, pin, `Your recorded R multiples were ${rs.map((r) => `${r}R`).join(", ")}. What is the net R for the week?`, total, 0.05, "R", `Sum of R multiples = ${round(total)}R.`));
  }
  const bestWorst = [best.id, worst.id].filter((v, i, a) => a.indexOf(v) === i);
  const weekIds = [...week].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8).map((t) => t.id);
  const weekKey = hashText(week.map((t) => t.id).sort().join(","));
  return out.filter((q): q is PracticeQuestion => q != null).map((q) => ({
    ...q,
    fp: `${q.fp}@${weekKey}`,
    group: "boss" as const,
    chartTradeIds: q.id === "boss:worst-day" ? [worst.id] : q.id === "boss:best-day" ? [best.id] : q.id === "boss:spread" ? bestWorst : weekIds,
  }));
}

export interface PoolOptions {
  mode: GameMode;
  trades: JournalEntry[];
  all: JournalEntry[];
  seed: number;
  drawdownLeft: number | null;
}

/** Every candidate question for a mode, across ALL levels. `assembleSession` then applies the no-repeat ledger and the mix. */
export function buildPool(options: PoolOptions): PracticeQuestion[] {
  const rng = seededRng(options.seed);
  const trades = options.trades.filter(isUsable);
  const questions: PracticeQuestion[] = [];

  if (options.mode === "boss") {
    questions.push(...bossQuestions(trades, rng));
    for (const t of trades) questions.push(...tradeQuestions(t, options.all, rng));
    questions.push(...portfolioQuestions(options.all, rng, options.drawdownLeft).filter((q) => q.level >= 3));
  } else if (options.mode === "time-machine") {
    // Chart-based revision: process, notes, behaviour, timing, management — no calculators.
    for (const t of trades) questions.push(...tradeQuestions(t, options.all, rng).filter((q) => q.group === "tm"));
  } else {
    // Matrix = Time Machine (charts) + trade math + Math Duel (added by the page).
    for (const t of trades) questions.push(...tradeQuestions(t, options.all, rng));
  }

  const seen = new Set<string>();
  return shuffle(questions, rng).filter((q) => (seen.has(q.id) ? false : (seen.add(q.id), true)));
}
