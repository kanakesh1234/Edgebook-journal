/**
 * AI rewrites of a trader's own question into other question styles — prompt and strict validation.
 * The trader's typed answer is the only source of truth: anything the model returns that does not line up
 * with it is thrown away, and the game falls back to local question styles. Pure functions only.
 */
import type { IctVariant } from "./progress-ext.ts";

export interface VariantInputCard { id: string; question: string; answer: string; notes?: string }

const STOP = new Set(["the", "and", "for", "are", "was", "that", "with", "this", "from", "has", "have", "not", "but", "its", "into", "than", "then", "when", "which", "price"]);
const tokens = (text: string) => new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 3 && !STOP.has(t)));
const norm = (text: string) => text.replace(/\s+/g, " ").trim();

/** Share of `a`'s meaningful words that also appear in `b`. */
function overlap(a: string, b: string): number {
  const ta = tokens(a);
  if (!ta.size) return norm(a).toLowerCase() === norm(b).toLowerCase() ? 1 : 0;
  const tb = tokens(b);
  let hit = 0;
  for (const t of ta) if (tb.has(t)) hit++;
  return hit / ta.size;
}

export function buildVariantPrompt(cards: VariantInputCard[]): { system: string; user: string } {
  const system = [
    "You turn a trader's own ICT / smart-money revision question into other question styles for a quiz game.",
    "The trader's ANSWER is the only source of truth. Never add facts, never correct it, never contradict it.",
    "For each card return up to three variants:",
    '- "mcq": the question as multiple choice. 4 choices. The correct choice restates the trader\'s answer in the same meaning. The 3 wrong choices must be plausible ICT / trading ideas that are clearly different and definitely wrong.',
    '- "true-false": one self-contained statement. When it is meant to be false, change one key detail of the trader\'s answer. answer is "True" or "False".',
    '- "cloze": a sentence taken from the question + answer with the key term replaced by ____, plus 4 choices where one is the missing term from the trader\'s answer.',
    "Keep the trader's language and terminology. Keep every prompt under 300 characters and every choice under 120.",
    'Return ONLY JSON: {"cards":[{"id":"...","variants":[{"type":"mcq","prompt":"...","choices":["..","..","..",".."],"answer":"<exactly one of choices>","explanation":"..."}, {"type":"true-false","prompt":"...","answer":"True","explanation":".."}, {"type":"cloze","prompt":"... ____ ...","choices":["..","..","..",".."],"answer":"..."}]}]}',
  ].join("\n");
  const user = JSON.stringify({ cards: cards.map((c) => ({ id: c.id, question: c.question, answer: c.answer, notes: c.notes ?? "" })) });
  return { system, user };
}

const asText = (v: unknown, max: number) => (typeof v === "string" ? norm(v).slice(0, max) : "");

function validateOne(raw: unknown, card: VariantInputCard): IctVariant | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const type = r.type;
  const prompt = asText(r.prompt, 320);
  const explanation = asText(r.explanation, 240) || undefined;
  if (prompt.length < 8) return null;

  if (type === "true-false") {
    const answer = r.answer === true || r.answer === "True" || r.answer === "true" ? "True" : r.answer === false || r.answer === "False" || r.answer === "false" ? "False" : null;
    if (!answer) return null;
    return { kind: "true-false", prompt: prompt.toLowerCase().startsWith("true or false") ? prompt : `True or false: ${prompt}`, choices: ["True", "False"], answer, explanation };
  }

  if (type !== "mcq" && type !== "cloze") return null;
  const choices = [...new Set((Array.isArray(r.choices) ? r.choices : []).map((c) => asText(c, 140)).filter(Boolean))];
  const answer = asText(r.answer, 140);
  if (choices.length < 3 || choices.length > 4 || !choices.includes(answer)) return null;
  if (type === "cloze" && !prompt.includes("____")) return null;
  // The right option must line up with what the trader actually wrote…
  const source = `${card.answer} ${type === "cloze" ? card.question : ""}`;
  if (overlap(answer, source) < (type === "cloze" ? 0.5 : 0.34) && overlap(card.answer, answer) < 0.34) return null;
  // …and no wrong option may say (almost) the same thing, or the question has two right answers.
  if (type === "mcq" && choices.some((c) => c !== answer && overlap(c, answer) >= 0.75 && overlap(answer, c) >= 0.75)) return null;
  return { kind: type, prompt, choices, answer, explanation };
}

/** Keeps only variants that are well-formed and consistent with the card. Never throws. */
export function validateVariants(raw: unknown, cards: VariantInputCard[]): Map<string, IctVariant[]> {
  const out = new Map<string, IctVariant[]>();
  const list = raw && typeof raw === "object" && Array.isArray((raw as { cards?: unknown }).cards) ? ((raw as { cards: unknown[] }).cards) : [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const id = (item as { id?: unknown }).id;
    const card = cards.find((c) => c.id === id);
    if (!card) continue;
    const variants = (Array.isArray((item as { variants?: unknown }).variants) ? (item as { variants: unknown[] }).variants : []).map((v) => validateOne(v, card)).filter((v): v is IctVariant => v != null);
    const seen = new Set<string>();
    const kept = variants.filter((v) => (seen.has(v.kind) ? false : (seen.add(v.kind), true))).slice(0, 3);
    if (kept.length) out.set(card.id, kept);
  }
  return out;
}
