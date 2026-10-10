/**
 * ICT Lab — the trader's own questions.
 *
 * The trader writes a question, attaches pictures and types the answer. Each time it is played it is asked in a
 * different way (multiple choice, true/false, fill-in-the-blank). AI writes the good versions; this file makes
 * sure the game still works without it by building simpler versions from the trader's other answers.
 *
 * Pure functions only (no React, no storage, no network).
 */
import type { IctCard, IctVariant } from "./progress-ext.ts";
import type { PracticeQuestion } from "./engine.ts";
import type { Rng } from "./math/rng.ts";
import { CONCEPTS } from "./ict.ts";

export const MAX_QUESTION = 600;
export const MAX_ANSWER = 400;
export const MAX_NOTES = 400;
export const ROUND_CARD_QUESTIONS = 8;

const clean = (text: string) => text.replace(/\s+/g, " ").trim();
const same = (a: string, b: string) => clean(a).toLowerCase() === clean(b).toLowerCase();
const unique = (items: string[]) => { const seen = new Set<string>(); return items.filter((t) => { const k = clean(t).toLowerCase(); if (!k || seen.has(k)) return false; seen.add(k); return true; }); };

function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) { const j = rng.int(0, i); [out[i], out[j]] = [out[j]!, out[i]!]; }
  return out;
}

/** Changes whenever the question or answer changes, so cached AI variants never describe an old card. */
export function cardHash(card: Pick<IctCard, "question" | "answer">): string {
  const text = `${clean(card.question)}\n${clean(card.answer)}`;
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

export const hasFreshVariants = (card: IctCard) => !!card.variants?.length && card.variantsFor === cardHash(card);

/** Question styles that need no AI: multiple choice and true/false built from the trader's other answers. */
export function localVariants(card: IctCard, pool: IctCard[], rng: Rng): IctVariant[] {
  const answer = clean(card.answer);
  const others = unique(pool.filter((c) => c.id !== card.id).map((c) => clean(c.answer)).filter((a) => a && !same(a, answer)));
  // With only a few cards, borrow plausible wrong answers from the built-in ICT concept bank.
  const filler = unique(CONCEPTS.flatMap((c) => [c.answer, ...c.wrong]).filter((a) => !same(a, answer)));
  const wrong = unique([...shuffle(others, rng), ...shuffle(filler, rng)]).slice(0, 3);
  if (wrong.length < 2) return [];
  const note = card.notes ? ` ${clean(card.notes)}` : "";

  const truth = rng.next() < 0.5;
  const shown = truth ? answer : wrong[0]!;
  return [
    { kind: "mcq", prompt: clean(card.question), choices: shuffle([answer, ...wrong], rng), answer },
    { kind: "true-false", prompt: `True or false: ${clean(card.question)} — ${shown}`, choices: ["True", "False"], answer: truth ? "True" : "False", explanation: truth ? `Correct: ${answer}.${note}` : `Not quite — it is ${answer}, not ${shown}.${note}` },
  ];
}

/** The variants to play: AI-written ones when they are current, otherwise the local ones. */
export function variantsOf(card: IctCard, pool: IctCard[], rng: Rng): IctVariant[] {
  return hasFreshVariants(card) ? card.variants! : localVariants(card, pool, rng);
}

const dayGap = (from: string | undefined, today: string) => (from ? Math.max(0, Math.round((Date.parse(today) - Date.parse(from)) / 86_400_000)) : 30);

/** Which cards deserve to be asked next: never-seen first, then the ones you miss, then the ones you have not seen for a while. */
export function rankCards(cards: IctCard[], today: string, rng: Rng): IctCard[] {
  const score = (c: IctCard) => {
    const seen = c.seen ?? 0;
    if (seen === 0) return 100 + rng.next();
    const miss = 1 - (c.correct ?? 0) / seen;
    return miss * 50 + Math.min(30, dayGap(c.lastSeen, today)) + rng.next() * 5;
  };
  return cards.map((c) => [c, score(c)] as const).sort((a, b) => b[1] - a[1]).map(([c]) => c);
}

export function cardQuestion(card: IctCard, variant: IctVariant, nonce: string, slot: number): PracticeQuestion {
  const explanation = [variant.explanation, variant.explanation?.includes(clean(card.answer)) ? "" : `Your answer: ${clean(card.answer)}`, card.notes ? clean(card.notes) : ""].filter(Boolean).join(" · ");
  const id = `ictc:${card.id}:${nonce}:${slot}`;
  return {
    id, fp: id, source: "local", kind: "choice", tag: "ict-card", level: 2, group: "ict",
    pin: "ICT Lab · your question", prompt: variant.prompt, choices: variant.choices, answer: variant.answer,
    explanation, xp: 12, images: card.images, cardId: card.id, note: card.notes ? clean(card.notes) : undefined,
  };
}

/**
 * Up to `max` card questions. Every card is asked once before any is asked twice, and a card that comes back is
 * asked in a different style than last time.
 */
export function buildCardQuestions(cards: IctCard[], rng: Rng, today: string, nonce: string, max = ROUND_CARD_QUESTIONS): PracticeQuestion[] {
  const ranked = rankCards(cards, today, rng);
  const styles = new Map(ranked.map((c) => [c.id, variantsOf(c, cards, rng)] as const));
  const out: PracticeQuestion[] = [];
  for (let pass = 0; pass < 3 && out.length < max; pass++) {
    for (const card of ranked) {
      const list = styles.get(card.id)!;
      if (pass >= list.length || out.length >= max) continue;
      out.push(cardQuestion(card, list[((card.seen ?? 0) + pass) % list.length]!, nonce, pass));
    }
  }
  return out;
}

/** Card questions first half, trade-math questions in the middle, card questions second half. */
export function assembleIctRound(cardQs: PracticeQuestion[], mathQs: PracticeQuestion[]): PracticeQuestion[] {
  const mid = Math.ceil(cardQs.length / 2);
  return [...cardQs.slice(0, mid), ...mathQs, ...cardQs.slice(mid)];
}

/** How the saved cards did in a round: question → card id → correct. */
export function applyCardResults(cards: IctCard[], results: Array<{ cardId?: string; correct: boolean }>, today: string): IctCard[] {
  const byCard = new Map<string, { seen: number; correct: number }>();
  for (const r of results) if (r.cardId) { const c = byCard.get(r.cardId) ?? { seen: 0, correct: 0 }; c.seen++; if (r.correct) c.correct++; byCard.set(r.cardId, c); }
  if (!byCard.size) return cards;
  return cards.map((card) => { const r = byCard.get(card.id); return r ? { ...card, seen: (card.seen ?? 0) + r.seen, correct: (card.correct ?? 0) + r.correct, lastSeen: today } : card; });
}
