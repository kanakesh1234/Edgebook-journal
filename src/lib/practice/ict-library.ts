/**
 * ICT Lab library — how the trader's questions are organised.
 *
 * Same idea as the Journal: one flat pile of cards, seen through a "lens" (All · Needs practice · a concept · a tag),
 * then filtered, sorted and (by default) grouped by concept. Nothing here is stored except `concept` and `tags` on
 * each card; every list, count and folder is derived.
 *
 * Pure functions only (no React, no storage).
 */
import type { IctCard } from "./progress-ext.ts";
import { ICT_TOPICS } from "./ict.ts";

export const MAX_CONCEPT = 40;
export const MAX_TAG = 24;
export const MAX_TAGS = 6;
export const UNSORTED = "Unsorted";
/** A played card below this accuracy (%) counts as needing practice. */
export const NEEDS_BELOW = 70;
export const STRONG_FROM = 80;

/* -------------------------------- text -------------------------------- */

export const cleanConcept = (text: string) => text.replace(/\s+/g, " ").trim().slice(0, MAX_CONCEPT);
const key = (text: string) => text.trim().toLowerCase();

/** "#NY Open!" → "ny-open". Letters, numbers, "-" and "_" only. */
export function normTag(text: string): string {
  return text
    .replace(/^#+/, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_-]/gu, "")
    .toLowerCase()
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_TAG);
}

export function normTags(list: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const t = normTag(raw);
    if (t && !seen.has(t)) { seen.add(t); out.push(t); }
  }
  return out.slice(0, MAX_TAGS);
}

/** Typing "fair value gap" when "Fair Value Gap" already exists reuses the existing spelling, so folders never split. */
export function canonConcept(input: string, cards: readonly IctCard[]): string {
  const next = cleanConcept(input);
  if (!next) return "";
  const hit = cards.map((c) => cleanConcept(c.concept ?? "")).find((c) => c && key(c) === key(next));
  return hit ?? next;
}

/* ------------------------------- per card ------------------------------- */

export const conceptOf = (card: IctCard) => cleanConcept(card.concept ?? "") || UNSORTED;
export const tagsOf = (card: IctCard) => card.tags ?? [];
export const accuracy = (card: IctCard): number | null => ((card.seen ?? 0) > 0 ? Math.round(((card.correct ?? 0) / (card.seen ?? 1)) * 100) : null);
export const needsPractice = (card: IctCard) => { const a = accuracy(card); return a === null || a < NEEDS_BELOW; };

/* -------------------------------- facets -------------------------------- */

export interface Facet { key: string; count: number; seen: number; correct: number }

function facets(cards: readonly IctCard[], keys: (c: IctCard) => string[]): Facet[] {
  // Keyed case-insensitively (the first spelling seen is the one shown), so "FVG" and "fvg" can never split into two folders.
  const map = new Map<string, Facet>();
  for (const c of cards) for (const k of keys(c)) {
    const f = map.get(key(k)) ?? { key: k, count: 0, seen: 0, correct: 0 };
    f.count++; f.seen += c.seen ?? 0; f.correct += c.correct ?? 0;
    map.set(key(k), f);
  }
  return [...map.values()];
}

/** Concepts with their question counts: biggest first, A–Z on ties, "Unsorted" always last. */
export function conceptFacets(cards: readonly IctCard[]): Facet[] {
  return facets(cards, (c) => [conceptOf(c)]).sort((a, b) => (a.key === UNSORTED ? 1 : 0) - (b.key === UNSORTED ? 1 : 0) || b.count - a.count || a.key.localeCompare(b.key));
}
export function tagFacets(cards: readonly IctCard[]): Facet[] {
  return facets(cards, tagsOf).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** Concept names to offer while writing a question: the trader's own first, then the built-in ICT topics. */
export function conceptSuggestions(cards: readonly IctCard[], limit = 8): string[] {
  const own = conceptFacets(cards).filter((f) => f.key !== UNSORTED).map((f) => f.key);
  // Compare singular/plural alike, so "Fair value gap" hides the built-in "Fair value gaps".
  const loose = (t: string) => key(t).replace(/s$/, "");
  const seen = new Set(own.map(loose));
  const builtIn = ICT_TOPICS.map((t) => t.label).filter((l) => !seen.has(loose(l)));
  return [...own, ...builtIn].slice(0, limit);
}

/** Tags already used, most used first, minus the ones already on this question. */
export function tagSuggestions(cards: readonly IctCard[], chosen: readonly string[], limit = 8): string[] {
  const have = new Set(chosen);
  return tagFacets(cards).map((f) => f.key).filter((t) => !have.has(t)).slice(0, limit);
}

/* --------------------------------- lens --------------------------------- */

export type Lens = { kind: "all" } | { kind: "practice" } | { kind: "concept"; name: string } | { kind: "tag"; name: string };
export type StatusFilter = "any" | "new" | "weak" | "strong";
export type SortKey = "concept" | "newest" | "oldest" | "weakest";

export function inLens(cards: readonly IctCard[], lens: Lens): IctCard[] {
  switch (lens.kind) {
    case "practice": return cards.filter(needsPractice);
    case "concept": return cards.filter((c) => key(conceptOf(c)) === key(lens.name));
    case "tag": return cards.filter((c) => tagsOf(c).includes(lens.name));
    default: return [...cards];
  }
}

export function filterCards(cards: readonly IctCard[], f: { status: StatusFilter; photo: boolean; query: string }): IctCard[] {
  let out = [...cards];
  if (f.status === "new") out = out.filter((c) => (c.seen ?? 0) === 0);
  else if (f.status === "weak") out = out.filter((c) => { const a = accuracy(c); return a !== null && a < NEEDS_BELOW; });
  else if (f.status === "strong") out = out.filter((c) => { const a = accuracy(c); return a !== null && a >= STRONG_FROM; });
  if (f.photo) out = out.filter((c) => c.images.length > 0);
  const terms = f.query.trim().toLowerCase().split(/\s+/).map((t) => t.replace(/^#/, "")).filter(Boolean);
  if (terms.length) {
    out = out.filter((c) => {
      const hay = [c.question, c.answer, c.notes ?? "", conceptOf(c), ...tagsOf(c)].join(" ").toLowerCase();
      return terms.every((t) => hay.includes(t));
    });
  }
  return out;
}

export function sortCards(cards: readonly IctCard[], sort: SortKey): IctCard[] {
  const newest = (a: IctCard, b: IctCard) => b.createdAt - a.createdAt;
  return [...cards].sort((a, b) => {
    switch (sort) {
      case "oldest": return a.createdAt - b.createdAt;
      case "weakest": {
        const x = accuracy(a), y = accuracy(b);
        if (x === null && y === null) return newest(a, b);
        if (x === null) return 1;
        if (y === null) return -1;
        return x - y || newest(a, b);
      }
      default: return newest(a, b);
    }
  });
}

/* ------------------------------- summaries ------------------------------- */

export interface Summary { count: number; seen: number; correct: number; acc: number | null; needs: number }
export function summarize(cards: readonly IctCard[]): Summary {
  let seen = 0, correct = 0, needs = 0;
  for (const c of cards) { seen += c.seen ?? 0; correct += c.correct ?? 0; if (needsPractice(c)) needs++; }
  return { count: cards.length, seen, correct, acc: seen > 0 ? Math.round((correct / seen) * 100) : null, needs };
}

export interface ConceptGroup { concept: string; items: IctCard[]; summary: Summary }
/** Groups an already-sorted list by concept, in the sidebar's order (biggest concept first, "Unsorted" last). */
export function groupByConcept(cards: readonly IctCard[]): ConceptGroup[] {
  const order = conceptFacets(cards).map((f) => f.key);
  const buckets = new Map<string, IctCard[]>();
  for (const c of cards) { const k = key(conceptOf(c)); (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(c); }
  return order.map((concept) => ({ concept, items: buckets.get(key(concept)) ?? [], summary: summarize(buckets.get(key(concept)) ?? []) }));
}
