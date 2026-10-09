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
import type { JournalEntry, PracticeProgress } from "@/lib/types";
import { addDays, formatDateMedium, weekdayLong } from "@/lib/format";
import { seededRng, type Rng } from "./math/rng";
import { breakevenWinRate, lossStreakProbability } from "./math/formulas";
import { buildTradeQuestions, MATH_TAGS } from "./chart-questions";
import { hashText } from "./history";
import type { QuestionVisual } from "./ict";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type Level = 1 | 2 | 3 | 4;

export const LEVELS: { level: Level; name: string; blurb: string }[] = [
  { level: 1, name: "Recognition", blurb: "Spot the facts you recorded" },
  { level: 2, name: "Recall", blurb: "Remember times, setups and lessons" },
  { level: 3, name: "Application", blurb: "Do the R, risk and expectancy math" },
  { level: 4, name: "Prediction", blurb: "Forecast your own stats and streak odds" },
];

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
}

export type Bucket = "best" | "breakeven" | "worst";
export type SessionMode = "revision" | "mixed";

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

const tradeLabelNoSide = (entry: JournalEntry) => `${formatDateMedium(entry.date)} ${entry.instrument || "trade"}`;

function lessonOf(entry: JournalEntry): string | null {
  const candidates = [
    entry.review?.followUp?.biggestMistake,
    entry.reflection?.lesson,
    entry.review?.followUp?.watchNext,
  ];
  for (const value of candidates) if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return null;
}

function followedPlanOf(entry: JournalEntry): boolean | null {
  const fromReview = entry.review?.outcome?.followedPlan;
  if (typeof fromReview === "boolean") return fromReview;
  const fromReflection = entry.reflection?.followedSetup;
  return typeof fromReflection === "boolean" ? fromReflection : null;
}

function hourOf(entry: JournalEntry): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(entry.entryTime ?? "");
  if (!match) return null;
  const hour = Number(match[1]);
  return hour >= 0 && hour <= 23 ? hour : null;
}

function clockMinutes(value: string | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value ?? "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

const windowLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00–${String(hour).padStart(2, "0")}:59 NY`;

/* ------------------------------------------------------------------ */
/*  Which trades are usable, and what is missing                       */
/* ------------------------------------------------------------------ */

/** A trade is usable as soon as it has a real P&L number. */
export const isUsable = (entry: JournalEntry) => isNum(entry.pnl);

/** Plain-language hints for fields that would unlock more question types. */
export function unlockHints(entries: JournalEntry[]): string[] {
  const usable = entries.filter(isUsable);
  if (!usable.length) return [];
  const hints: string[] = [];
  if (!usable.some((e) => isNum(e.entryPrice) && isNum(e.stopLoss) && isNum(e.takeProfit))) hints.push("Add entry, stop and target prices to unlock planned reward-to-risk questions.");
  if (!usable.some((e) => hourOf(e) != null)) hints.push("Add entry times to unlock time-window questions.");
  if (!usable.some((e) => lessonOf(e))) hints.push("Write a lesson in a trade review to unlock fill-in-the-blank questions.");
  if (!usable.some((e) => isNum(e.rr) && e.rr !== 0)) hints.push("Record the R multiple on trades to unlock 1R-in-dollars questions.");
  if (!usable.some((e) => e.setup && e.setup.trim())) hints.push("Name the setup on trades to unlock setup questions.");
  return hints;
}

/** Best / break-even / worst trades by P&L. Each can be empty. */
export function classify(entries: JournalEntry[]): Record<Bucket, JournalEntry | null> {
  const usable = entries.filter(isUsable);
  if (!usable.length) return { best: null, breakeven: null, worst: null };
  const sorted = [...usable].sort((a, b) => b.pnl - a.pnl);
  const best = sorted[0]!;
  const worst = sorted.length > 1 ? sorted[sorted.length - 1]! : null;
  const middle = sorted.slice(1, -1);
  const meanAbs = usable.reduce((sum, e) => sum + Math.abs(e.pnl), 0) / usable.length;
  const flatLimit = meanAbs * 0.1;
  let breakeven: JournalEntry | null = null;
  const pool = middle.length ? middle : usable.filter((e) => Math.abs(e.pnl) <= flatLimit);
  for (const entry of pool) if (!breakeven || Math.abs(entry.pnl) < Math.abs(breakeven.pnl)) breakeven = entry;
  return { best, breakeven, worst };
}

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

/** Wrong dollar amounts. `spread` shrinks as the level rises. */
function nearMoney(value: number, level: Level, rng: Rng): string[] {
  const factors = level <= 1 ? [-1, 2, 0.5, 3] : level === 2 ? [0.7, 1.3, -1, 1.6] : [0.85, 1.15, 0.9, 1.1];
  return shuffle(factors, rng).map((f) => fmtMoney(round(value * f, 2)));
}

/* ------------------------------------------------------------------ */
/*  Per-trade questions                                                */
/* ------------------------------------------------------------------ */

function tradeQuestions(entry: JournalEntry, all: JournalEntry[], rng: Rng): PracticeQuestion[] {
  return buildTradeQuestions(entry, all, rng, tradeLabel(entry));
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
/*  Session builder                                                    */
/* ------------------------------------------------------------------ */

/** Highest-allowed level first, ties random, one question per tag. */
function rank(pool: PracticeQuestion[], level: Level, rng: Rng): PracticeQuestion[] {
  const allowed = shuffle(pool.filter((q) => q.level <= level), rng).sort((a, b) => b.level - a.level);
  const seenTags = new Set<string>();
  const unique: PracticeQuestion[] = [];
  for (const q of allowed) {
    if (seenTags.has(q.tag)) continue;
    seenTags.add(q.tag);
    unique.push(q);
  }
  return unique;
}

export interface SessionOptions {
  mode: SessionMode;
  /** Trades to revise. */
  trades: JournalEntry[];
  /** Every trade — used for distractors and portfolio math. */
  all: JournalEntry[];
  level: Level;
  count: number;
  seed: number;
  drawdownLeft: number | null;
}

export function buildSession(options: SessionOptions): PracticeQuestion[] {
  const rng = seededRng(options.seed);
  const trades = options.trades.filter(isUsable);
  const perTrade = trades.map((trade) => rank(tradeQuestions(trade, options.all, rng), options.level, rng));
  const portfolio = rank(portfolioQuestions(options.all, rng, options.drawdownLeft), options.level, rng);
  const questions: PracticeQuestion[] = [];

  if (options.mode === "revision") {
    for (let round = 0; questions.length < options.count; round++) {
      let added = false;
      for (const pool of perTrade) {
        const next = pool[round];
        if (next) { questions.push(next); added = true; }
        if (questions.length >= options.count) break;
      }
      if (!added) break;
    }
    return questions.slice(0, options.count);
  }

  // "Math + revision": recall a fact about each trade, then do math on it.
  for (const pool of perTrade) {
    const recall = pool.find((q) => !MATH_TAGS.has(q.tag) && q.kind === "choice");
    const math = pool.find((q) => MATH_TAGS.has(q.tag));
    if (recall) questions.push(recall);
    if (math) questions.push(math);
  }
  for (const q of portfolio) {
    if (questions.length >= options.count) break;
    questions.push(q);
  }
  // Last resort: top up with more per-trade questions so short journals still get a full run.
  for (let round = 0; questions.length < options.count && round < 8; round++) {
    for (const pool of perTrade) {
      const next = pool.find((q) => !questions.some((existing) => existing.id === q.id));
      if (next && questions.length < options.count) questions.push(next);
    }
  }
  return questions.slice(0, options.count);
}

/* ------------------------------------------------------------------ */
/*  Progress helpers (level, rank, streak)                             */
/* ------------------------------------------------------------------ */

const LEVEL_KEY = "level:practice";

export function levelFromProgress(progress: PracticeProgress): Level {
  const stored = progress.masteryByTag?.[LEVEL_KEY];
  return stored && stored >= 1 && stored <= 4 ? (Math.round(stored) as Level) : 1;
}

export function levelAfter(level: Level, accuracy: number): Level {
  if (accuracy >= 0.8) return Math.min(4, level + 1) as Level;
  if (accuracy < 0.5) return Math.max(1, level - 1) as Level;
  return level;
}

export const LEVEL_MASTERY_KEY = LEVEL_KEY;

export function rankOf(xp: number): string {
  return xp >= 2500 ? "Jonin" : xp >= 1200 ? "Chunin" : "Genin";
}

/** Streak after practising today. Misses reset it; one missed day can be covered by a freeze. */
export function nextStreak(progress: PracticeProgress, today: string): { streak: number; freezeDays: number } {
  const freeze = progress.freezeDays ?? 1;
  const last = progress.lastMissionDate;
  if (!last) return { streak: 1, freezeDays: freeze };
  if (last === today) return { streak: Math.max(1, progress.streak), freezeDays: freeze };
  if (last === addDays(today, -1)) return { streak: progress.streak + 1, freezeDays: freeze };
  if (last === addDays(today, -2) && freeze > 0) return { streak: progress.streak + 1, freezeDays: freeze - 1 };
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
