/**
 * Validates question batches proposed by the AI model.
 *
 * The model is treated as an untrusted writer:
 *  - math answers are NEVER taken from the model; it supplies an arithmetic
 *    expression and the answer is computed here with a safe evaluator
 *  - every number the model uses must appear in the question text, and for
 *    "trade" questions it must come from the trader's recorded fields
 *  - concept questions must quote a real excerpt of the trader's own notes
 *  - near-duplicates of anything already asked are dropped
 */
import { seededRng } from "./math/rng";
import type { Level, PracticeQuestion } from "./engine";
import { hashText } from "./history";

export interface EvidenceTrade {
  id: string;
  label: string;
  date: string;
  instrument?: string;
  direction?: string | null;
  setup?: string;
  pnl: number;
  rr?: number | null;
  entryTime?: string;
  exitTime?: string;
  entryPrice?: number | null;
  exitPrice?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  quantity?: number | null;
  notes?: string;
  lesson?: string;
  mistake?: string;
  followedPlan?: boolean | null;
}

/* ------------------------- safe arithmetic ------------------------- */

export function evalExpression(source: string): number | null {
  const text = source.replace(/×/g, "*").replace(/÷/g, "/").replace(/−/g, "-").replace(/\s+/g, "");
  if (!text || text.length > 120 || !/^[0-9.+\-*/()]+$/.test(text)) return null;
  let pos = 0;
  let failed = false;
  const peek = () => text[pos];
  const factor = (): number => {
    const c = peek();
    if (c === "-") { pos++; return -factor(); }
    if (c === "+") { pos++; return factor(); }
    if (c === "(") {
      pos++;
      const inner = expr();
      if (peek() !== ")") failed = true; else pos++;
      return inner;
    }
    const match = /^\d+(\.\d+)?|^\.\d+/.exec(text.slice(pos));
    if (!match) { failed = true; return 0; }
    pos += match[0].length;
    return Number(match[0]);
  };
  const term = (): number => {
    let value = factor();
    while (!failed && (peek() === "*" || peek() === "/")) {
      const op = text[pos++];
      const right = factor();
      if (op === "/") { if (right === 0) { failed = true; return 0; } value /= right; } else value *= right;
    }
    return value;
  };
  function expr(): number {
    let value = term();
    while (!failed && (peek() === "+" || peek() === "-")) {
      const op = text[pos++];
      const right = term();
      value = op === "+" ? value + right : value - right;
    }
    return value;
  }
  const result = expr();
  return !failed && pos === text.length && Number.isFinite(result) ? result : null;
}

/** Numbers written in a text, with dates and clock times removed first. */
export function numbersIn(text: string): number[] {
  const cleaned = text.replace(/\d{4}-\d{2}-\d{2}/g, " ").replace(/\b\d{1,2}:\d{2}\b/g, " ");
  return (cleaned.match(/\d[\d,]*\.?\d*/g) ?? []).map((raw) => Number(raw.replace(/,/g, ""))).filter(Number.isFinite);
}

const near = (a: number, b: number) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));

function allowedNumbers(trades: EvidenceTrade[]): number[] {
  const out: number[] = [];
  const push = (value: unknown) => { if (typeof value === "number" && Number.isFinite(value)) out.push(value, Math.abs(value)); };
  for (const t of trades) {
    [t.pnl, t.rr, t.entryPrice, t.exitPrice, t.stopLoss, t.takeProfit, t.quantity].forEach(push);
    for (const clock of [t.entryTime, t.exitTime]) {
      const m = /^(\d{1,2}):(\d{2})/.exec(clock ?? "");
      if (m) out.push(Number(m[1]), Number(m[2]));
    }
  }
  return out;
}

/* ------------------------- formatting & helpers ------------------------- */

export function formatAnswer(value: number, unit: string): string {
  const body = Number(value.toFixed(Math.abs(value) >= 100 ? 1 : 2)).toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (unit === "$") return value < 0 ? `−$${body.replace("-", "")}` : `$${body}`;
  if (unit === "%") return `${body}%`;
  return unit ? `${body}${unit === "x" ? "x" : ` ${unit}`}` : body;
}

function mathChoices(answer: number, unit: string, seed: number): string[] | null {
  const raw = [answer * 2, answer / 2, -answer, answer * 1.25, answer * 0.75, answer + (Math.abs(answer) >= 10 ? 10 : 1), answer - (Math.abs(answer) >= 10 ? 10 : 1), answer * 10];
  const rng = seededRng(seed);
  const shuffled = [...raw].sort(() => rng.next() - 0.5);
  const correct = formatAnswer(answer, unit);
  const picks: string[] = [];
  for (const value of shuffled) {
    const text = formatAnswer(value, unit);
    if (text !== correct && !picks.includes(text) && !(answer > 0 && value < 0 && unit !== "$" && unit !== "R")) picks.push(text);
    if (picks.length === 3) break;
  }
  if (picks.length < 3) return null;
  return [correct, ...picks].sort(() => rng.next() - 0.5);
}

const tokens = (text: string) => new Set(text.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((word) => word.length > 3));

function similar(a: string, b: string): boolean {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return false;
  let shared = 0;
  ta.forEach((word) => { if (tb.has(word)) shared++; });
  return shared / Math.min(ta.size, tb.size) >= 0.65;
}

const norm = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();
const FORBIDDEN = /\b(will price|price will|go up|go down|buy now|sell now|guaranteed|next candle|prediction for)\b/i;
/** Lookup trivia the trader finds pointless (calendar questions, "what day was it"). */
const TRIVIA = /\b(which|what) (day|weekday|day of the week)\b|\bday of the week\b|\bwhat (month|year|date)\b/i;

/* ------------------------- main validator ------------------------- */

export interface AiRaw {
  type?: unknown; tradeId?: unknown; level?: unknown; tag?: unknown; prompt?: unknown;
  choices?: unknown; answerIndex?: unknown; explanation?: unknown; evidence?: unknown;
  expression?: unknown; unit?: unknown; uses?: unknown;
}

export function parseJsonLoose(text: string): unknown {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); } catch { return null; }
}

const str = (value: unknown, max: number): string | null => (typeof value === "string" && value.trim().length > 0 && value.length <= max ? value.trim() : null);
const clampLevel = (value: unknown): Level => { const n = Math.round(Number(value)); return (n >= 1 && n <= 4 ? n : 2) as Level; };

export function validateAiBatch(parsed: unknown, trades: EvidenceTrade[], avoid: string[], limit: number): PracticeQuestion[] {
  const list = parsed && typeof parsed === "object" && Array.isArray((parsed as { questions?: unknown }).questions) ? ((parsed as { questions: unknown[] }).questions as AiRaw[]) : [];
  const byId = new Map(trades.map((t) => [t.id, t]));
  const allowed = allowedNumbers(trades);
  const kept: PracticeQuestion[] = [];
  const asked = [...avoid];

  for (const item of list) {
    if (!item || typeof item !== "object" || kept.length >= limit) continue;
    const prompt = str(item.prompt, 420);
    const explanation = str(item.explanation, 520);
    if (!prompt || prompt.length < 15 || !explanation || FORBIDDEN.test(prompt) || TRIVIA.test(prompt)) continue;
    if (asked.some((previous) => similar(previous, prompt))) continue;
    const trade = typeof item.tradeId === "string" ? byId.get(item.tradeId) : undefined;
    const level = clampLevel(item.level);
    const tag = typeof item.tag === "string" && /^[a-z][a-z-]{1,23}$/.test(item.tag) ? item.tag : item.type === "math" ? "ai-math" : "concept";
    const pin = trade?.label ?? "Your recent trades";
    const id = `ai:${hashText(norm(prompt))}`;

    if (item.type === "concept") {
      const choices = Array.isArray(item.choices) ? item.choices.map((c) => (typeof c === "string" ? c.trim() : "")) : [];
      const index = Number(item.answerIndex);
      const evidence = str(item.evidence, 260);
      if (choices.length !== 4 || choices.some((c) => !c || c.length > 150) || new Set(choices.map(norm)).size !== 4) continue;
      if (!Number.isInteger(index) || index < 0 || index > 3 || !evidence || evidence.length < 12) continue;
      // The excerpt must really exist in the trader's own words.
      const source = trades.filter((t) => !trade || t.id === trade.id).map((t) => norm([t.notes, t.lesson, t.mistake, t.setup].filter(Boolean).join(" . "))).join(" . ");
      if (!source.includes(norm(evidence).replace(/[“”"']/g, ""))  && !source.includes(norm(evidence))) continue;
      const answer = choices[index]!;
      const rng = seededRng(parseInt(id.slice(3), 36) || 7);
      const shuffled = [...choices].sort(() => rng.next() - 0.5);
      kept.push({ id, fp: id, source: "ai", tradeId: trade?.id, kind: "choice", tag, level, pin, prompt, choices: shuffled, answer, explanation, evidence, xp: 10 * level });
      asked.push(prompt);
      continue;
    }

    if (item.type === "math") {
      const expression = str(item.expression, 120);
      const unit = typeof item.unit === "string" && ["$", "R", "%", "pts", "x", "contracts", "trades", ""].includes(item.unit) ? item.unit : "";
      if (!expression) continue;
      const answer = evalExpression(expression);
      if (answer == null || Math.abs(answer) > 1e7) continue;
      const inPrompt = numbersIn(prompt);
      const inExpression = (expression.match(/\d+\.?\d*/g) ?? []).map(Number);
      if (inExpression.some((n) => !inPrompt.some((p) => near(p, n)))) continue;
      // The answer must not simply be a number already written in the question (e.g. "1R is $80 — what is 1R?").
      if (Math.abs(answer) > 4 && inPrompt.some((p) => near(p, Math.abs(answer)))) continue;
      if (item.uses === "trade" && inPrompt.some((p) => p > 4 && !allowed.some((a) => near(a, p)))) continue;
      const choices = mathChoices(answer, unit, parseInt(id.slice(3), 36) || 11);
      if (!choices) continue;
      const steps = `${expression.replace(/\*/g, "×").replace(/\//g, "÷")} = ${formatAnswer(answer, unit)}`;
      kept.push({ id, fp: id, source: "ai", tradeId: trade?.id, kind: "choice", tag, level, pin, prompt, choices, answer: formatAnswer(answer, unit), explanation: `${explanation} (${steps})`, xp: 12 * level });
      asked.push(prompt);
    }
  }
  return kept;
}

export function buildAiPrompt(args: { mode: string; level: number; count: number; trades: EvidenceTrade[]; avoid: string[]; weakTags: string[] }): { system: string; user: string } {
  const levelGuide: Record<number, string> = {
    1: "L1 recognition: simple recall of what the trader recorded.",
    2: "L2 recall: remember their own reasoning, setup rules and lessons.",
    3: "L3 application: R-multiple, risk, reward and expectancy math using their numbers, or applying their rule to a variation.",
    4: "L4 prediction/analysis: multi-step reasoning, what-if variations of their own rule, probability and expectancy across trades.",
  };
  const system = [
    "You write practice questions for ONE trader, using ONLY the EVIDENCE JSON provided. Return JSON only, no prose, no markdown.",
    'Schema: {"questions":[ concept | math ]}',
    'concept: {"type":"concept","tradeId":"<id>","level":1-4,"tag":"<short-kebab>","prompt":"...","choices":["a","b","c","d"],"answerIndex":0-3,"explanation":"why, 1-2 sentences","evidence":"<verbatim excerpt of 12-25 words copied from that trade\'s notes/lesson/mistake>"}',
    'math: {"type":"math","tradeId":"<id or null>","level":1-4,"tag":"<short-kebab>","prompt":"... include every number the maths needs ...","expression":"(19570-19562)/8","unit":"$|R|%|pts|x|contracts|trades","uses":"trade|hypothetical","explanation":"how to solve"}',
    "RULES:",
    "- Never invent trades, prices, results or rules. Concept questions must be answerable from the evidence text; the correct option must follow from it, distractors must be plausible but wrong.",
    "- No market predictions, no reading prices off charts, no buy/sell advice.",
    "- For math give an arithmetic EXPRESSION only (digits, + - * / and brackets); never give the answer. Every number in the expression must also appear in the prompt. If uses is \"trade\", the numbers must come from the evidence.",
    "- Vary the style: why-questions, rule checks, what-if changes, mistake spotting, scenario application. Do not ask the same thing twice.",
    "- NEVER ask calendar trivia (what weekday a date was) and NEVER ask for a number that is already written in the question.",
    "- Prefer questions about the trader's own reasoning and repeated mistakes: compare trades in EVIDENCE, ask which mistake keeps repeating, what likely causes it, and what the trader's own rule says to do instead.",
    "- Do NOT repeat or paraphrase anything in AVOID.",
    "- If a trade has no notes/lesson text, write math questions for it instead of concept questions.",
  ].join("\n");
  const user = JSON.stringify({
    mode: args.mode,
    target: `Produce ${args.count} questions around difficulty level ${args.level}; include some at level ${Math.max(1, args.level - 1)} and ${Math.min(4, args.level + 1)}.`,
    difficulty: levelGuide,
    weakTopics: args.weakTags.slice(0, 5),
    AVOID: args.avoid.slice(-40),
    EVIDENCE: args.trades.map((t) => ({ ...t, notes: t.notes?.slice(0, 600), lesson: t.lesson?.slice(0, 300), mistake: t.mistake?.slice(0, 300) })),
  });
  return { system, user };
}
