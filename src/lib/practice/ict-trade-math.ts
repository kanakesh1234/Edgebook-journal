/**
 * Math questions about the trader's OWN trades, asked with the trade's saved screenshot above the question.
 * Every number comes straight from the journal entry, so nothing is invented. Pure functions only.
 */
import type { JournalEntry } from "../types.ts";
import type { PracticeQuestion } from "./engine.ts";
import type { Rng } from "./math/rng.ts";

const round = (n: number, d = 2) => Number(n.toFixed(d));
const px = (n: number) => String(round(n, 2));
const money = (n: number) => `${n < 0 ? "−" : ""}$${Math.abs(round(n, 2)).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
const isNum = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

export const hasChart = (e: JournalEntry) => (e.images?.length ?? 0) > 0;

type Build = (e: JournalEntry) => { prompt: string; answer: number; tolerance: number; unit: string; explanation: string; level: 1 | 2 | 3 } | null;

const label = (e: JournalEntry) => `${e.direction ?? "trade"} ${e.instrument || "trade"} on ${e.date}`;

/** Stop and target on the wrong side of entry mean the numbers were typed loosely — skip rather than ask a muddled question. */
const sane = (e: JournalEntry, entry: number, level: number | null | undefined, kind: "stop" | "target") => {
  if (!isNum(level) || level === entry) return false;
  if (!e.direction) return true;
  const below = level < entry;
  return (e.direction === "long") === (kind === "stop" ? below : !below);
};

const BUILDERS: Build[] = [
  (e) => {
    if (!isNum(e.entryPrice) || !sane(e, e.entryPrice, e.stopLoss, "stop")) return null;
    const answer = round(Math.abs(e.entryPrice - e.stopLoss!));
    return { prompt: `${label(e)}: entry ${px(e.entryPrice)}, stop ${px(e.stopLoss!)}. How many points was the stop distance?`, answer, tolerance: 0.01, unit: "pts", level: 1, explanation: `|${px(e.entryPrice)} − ${px(e.stopLoss!)}| = ${px(answer)} points.` };
  },
  (e) => {
    if (!isNum(e.entryPrice) || !sane(e, e.entryPrice, e.takeProfit, "target")) return null;
    const answer = round(Math.abs(e.takeProfit! - e.entryPrice));
    return { prompt: `${label(e)}: entry ${px(e.entryPrice)}, target ${px(e.takeProfit!)}. How many points to the target?`, answer, tolerance: 0.01, unit: "pts", level: 1, explanation: `|${px(e.takeProfit!)} − ${px(e.entryPrice)}| = ${px(answer)} points.` };
  },
  (e) => {
    if (!isNum(e.entryPrice) || !sane(e, e.entryPrice, e.stopLoss, "stop") || !sane(e, e.entryPrice, e.takeProfit, "target")) return null;
    const risk = Math.abs(e.entryPrice - e.stopLoss!);
    const reward = Math.abs(e.takeProfit! - e.entryPrice);
    const answer = round(reward / risk);
    return { prompt: `${label(e)}: entry ${px(e.entryPrice)}, stop ${px(e.stopLoss!)}, target ${px(e.takeProfit!)}. What was the planned reward-to-risk?`, answer, tolerance: 0.05, unit: "R", level: 2, explanation: `Reward ${px(reward)} ÷ risk ${px(risk)} = ${px(answer)}R.` };
  },
  (e) => {
    if (!isNum(e.entryPrice) || !isNum(e.exitPrice) || !e.direction || e.entryPrice === e.exitPrice) return null;
    const answer = round((e.direction === "long" ? 1 : -1) * (e.exitPrice - e.entryPrice));
    return { prompt: `${label(e)}: entered ${px(e.entryPrice)}, exited ${px(e.exitPrice)}. How many points did the trade capture? (Losses are negative.)`, answer, tolerance: 0.01, unit: "pts", level: 2, explanation: `${e.direction === "long" ? `${px(e.exitPrice)} − ${px(e.entryPrice)}` : `${px(e.entryPrice)} − ${px(e.exitPrice)}`} = ${px(answer)} points.` };
  },
  (e) => {
    if (!isNum(e.rr) || !isNum(e.pnl) || Math.abs(e.rr) < 0.2 || e.pnl === 0) return null;
    const answer = round(Math.abs(e.pnl / e.rr), 2);
    return { prompt: `${label(e)} finished ${e.pnl > 0 ? "+" : ""}${px(e.rr)}R for ${money(e.pnl)}. How many dollars was 1R?`, answer, tolerance: Math.max(1, answer * 0.02), unit: "$", level: 3, explanation: `${money(Math.abs(e.pnl))} ÷ ${px(Math.abs(e.rr))}R ≈ ${money(answer)} per R.` };
  },
];

/** Up to `count` questions about different trades that have a saved chart, each showing that chart. */
export function tradeMathQuestions(entries: JournalEntry[], rng: Rng, count: number): PracticeQuestion[] {
  const pool = entries.filter(hasChart);
  const order = [...pool];
  for (let i = order.length - 1; i > 0; i--) { const j = rng.int(0, i); [order[i], order[j]] = [order[j]!, order[i]!]; }
  const out: PracticeQuestion[] = [];
  for (const entry of order) {
    if (out.length >= count) break;
    const options = BUILDERS.map((b, i) => [i, b(entry)] as const).filter(([, q]) => q);
    if (!options.length) continue;
    const [kind, q] = options[rng.int(0, options.length - 1)]!;
    const id = `ictm:${entry.id}:${kind}`;
    out.push({
      id, fp: id, source: "local", tradeId: entry.id, chartTradeIds: [entry.id], kind: "number", tag: "ict-trade-math", group: "ict",
      level: q!.level, pin: `Trade math · ${entry.instrument || "trade"} · ${entry.date}`, prompt: q!.prompt,
      answer: String(q!.answer), tolerance: q!.tolerance, unit: q!.unit, explanation: q!.explanation, xp: 12 * q!.level,
    });
  }
  return out;
}
