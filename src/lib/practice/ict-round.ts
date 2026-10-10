import type { JournalEntry } from "@/lib/types";
import type { PracticeProgress } from "@/lib/types";
import type { IctCard, IctVariant } from "./progress-ext";
import type { Round } from "./round";
import { seededRng } from "./math/rng";
import { assembleIctRound, buildCardQuestions, cardHash, hasFreshVariants, rankCards, ROUND_CARD_QUESTIONS } from "./ict-cards";
import { tradeMathQuestions } from "./ict-trade-math";

/** Asks the server to rewrite cards into other question styles. Never throws; returns what it got. */
export async function fetchCardVariants(cards: IctCard[], timeoutMs = 11_000): Promise<{ variants: Map<string, IctVariant[]>; note: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("/api/practice/ict-variants", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
      body: JSON.stringify({ cards: cards.map((c) => ({ id: c.id, question: c.question, answer: c.answer, notes: c.notes })) }),
    });
    const data = (await res.json().catch(() => null)) as { variants?: Array<{ id: string; variants: IctVariant[] }>; reason?: string } | null;
    const map = new Map((data?.variants ?? []).map((v) => [v.id, v.variants] as const));
    return { variants: map, note: map.size ? null : data?.reason ?? "AI unavailable — used simple question styles." };
  } catch {
    return { variants: new Map(), note: "AI unavailable — used simple question styles." };
  } finally {
    clearTimeout(timer);
  }
}

export type PreparedIct = { round: Round; freshVariants: Map<string, { hash: string; variants: IctVariant[] }> } | { empty: string };

/**
 * Builds one ICT Lab round from the trader's own cards, with trade-math questions (and the trade's screenshot)
 * in the middle. Cards that have no current AI versions are sent to the AI once; the answer is cached on the card.
 */
export async function prepareIctRound(args: { cards: IctCard[]; entries: JournalEntry[]; progress: PracticeProgress; today: string; level: number }): Promise<PreparedIct> {
  const { cards, entries, today, level } = args;
  if (cards.length === 0) return { empty: "Add your first ICT question to start a round." };

  const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  const rng = seededRng(seed);

  // Only the cards this round will actually use need AI versions.
  const needed = rankCards(cards, today, seededRng(seed)).slice(0, ROUND_CARD_QUESTIONS);
  const stale = needed.filter((c) => !hasFreshVariants(c)).slice(0, 6);
  const fresh = new Map<string, { hash: string; variants: IctVariant[] }>();
  let note: string | null = null;
  if (stale.length) {
    const got = await fetchCardVariants(stale);
    for (const [id, variants] of got.variants) { const card = stale.find((c) => c.id === id); if (card) fresh.set(id, { hash: cardHash(card), variants }); }
    note = got.variants.size ? null : got.note;
  }
  const playable = cards.map((c) => { const f = fresh.get(c.id); return f ? { ...c, variants: f.variants, variantsFor: f.hash } : c; });

  const cardQs = buildCardQuestions(playable, rng, today, seed.toString(36));
  if (cardQs.length === 0) return { empty: "Add at least one more question — a round needs a few different answers to build choices from." };
  const mathQs = tradeMathQuestions(entries, rng, cardQs.length >= 6 ? 3 : cardQs.length >= 3 ? 2 : 1);

  const round: Round = { mode: "ict", level, initial: assembleIctRound(cardQs, mathQs), note, drain: () => [], topUp: () => {}, close: () => {}, discard: () => {} };
  return { round, freshVariants: fresh };
}
