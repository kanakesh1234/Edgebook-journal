/**
 * Memory evolution: turns the journal (and what the trader tells Minato) into the memory store.
 *
 * Runs on the trader's device, debounced, with NO model calls. It is incremental in two ways:
 *  - a cheap signature (trade count, latest edit, plan count, Mind counters, calendar day) short-circuits the whole pass when nothing changed;
 *  - episodes are keyed by trade id, so re-scanning never duplicates and never refreshes an old episode's decay clock.
 */
import type { JournalEntry, TradePlan } from "../types";
import type { MinatoBrain } from "./brain-ml";
import type { MindState } from "./mind";
import {
  activeItems, compact, consolidate, decayPass, emptyMemory, jaccard, observe, reconcileAxes, rejectMemory,
  type MemoryStore, type Observation,
} from "./memory";
import { understand, type TF } from "./understanding";

const DAY = 86_400_000;
const EPISODE_WINDOW_DAYS = 150;
const MAX_NEW_EPISODES = 30;

const dayKey = (now: number) => new Date(now).toISOString().slice(0, 10);
const noon = (date: string) => new Date(`${date}T12:00:00Z`).getTime();
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20);

function signature(entries: JournalEntry[], plans: TradePlan[], mind: MindState): string {
  let latest = 0;
  for (const e of entries) if (e.updatedAt > latest) latest = e.updatedAt;
  const stats = Object.entries(mind.stats).map(([k, v]) => `${k}${v?.seen}/${v?.hits}`).join(",");
  return `${entries.length}:${latest}:${plans.length}:${stats}:${mind.notes.filter((n) => n.status === "kept").length}`;
}

/** What the trader wrote about this trade, in their own words (one short snippet). */
function writtenSnippet(e: JournalEntry): string {
  const fu = e.review?.followUp, r = e.reflection;
  const raw = fu?.biggestMistake || fu?.mistakeNote || r?.lesson || r?.wentPoorly || fu?.watchNext || e.notes || "";
  return raw.replace(/\s+/g, " ").trim();
}

/** One short episodic record per notable trade: a process break, or a big result, ideally with the trader's own words. */
export function episodesFrom(tf: TF[], now: number): Observation[] {
  const cutoff = now - EPISODE_WINDOW_DAYS * DAY;
  const abs = tf.map((t) => Math.abs(t.e.pnl)).sort((a, b) => a - b);
  const bigThreshold = tf.length >= 10 ? abs[Math.floor(abs.length * 0.9)] : Infinity;
  return tf
    .filter((t) => noon(t.date) >= cutoff)
    .map((t) => {
      const snippet = writtenSnippet(t.e);
      const big = Math.abs(t.e.pnl) >= bigThreshold && bigThreshold > 0;
      const score = (t.broke ? 2 : 0) + (snippet && (t.broke || t.loss) ? 1 : 0) + (big ? 1 : 0);
      return { t, snippet, score };
    })
    .filter((x) => x.score >= 2 || (x.score >= 1 && x.t.broke))
    .sort((a, b) => b.score - a.score || b.t.date.localeCompare(a.t.date))
    .slice(0, MAX_NEW_EPISODES)
    .map(({ t, snippet }): Observation => {
      const outcome = t.win ? "win" : t.loss ? "loss" : "flat";
      const what = t.e.setup?.trim() || t.e.instrument || "trade";
      const why = t.reasons.slice(0, 2).join(", ");
      return {
        id: `ep:${t.e.id}`, kind: "episodic", topic: t.broke ? "execution" : "fact",
        text: `${t.date} ${what}: ${outcome}${why ? `; ${why}` : ""}${snippet ? ` — you wrote: “${clip(snippet, 110)}”` : ""}`,
        short: `${t.date} ${outcome}${t.reasons[0] ? ` · ${t.reasons[0]}` : ""}`,
        stance: "fact", polarity: t.broke ? "risk" : "neutral", level: "supported", confidence: 0.9, n: 1,
        evidence: [{ entryId: t.e.id, date: t.date }], tags: [t.e.setup ? `setup:${slug(t.e.setup)}` : "", t.e.instrument ? `instr:${slug(t.e.instrument)}` : ""].filter(Boolean),
        origin: "journal", at: noon(t.date), touch: false,
      };
    });
}

/** Fold the journal into memory. Returns the SAME brain object when nothing changed. */
export function evolveMemory(brain: MinatoBrain, entries: JournalEntry[], plans: TradePlan[], now: number): MinatoBrain {
  const day = dayKey(now);
  const sig = signature(entries, plans, brain.mind);
  const prev = brain.memory ?? emptyMemory();
  if (prev.cursor.sig === sig && prev.cursor.day === day) return brain;

  const u = understand(entries, plans, brain.mind);
  let s: MemoryStore = prev;
  const emitted = new Set<string>();
  for (const o of u.observations) { s = observe(s, o, now); emitted.add(o.id); }
  s = reconcileAxes(s, emitted, new Set(u.tested), now);
  for (const o of episodesFrom(u.features, now)) s = observe(s, o, now);
  s = consolidate(s, now);
  s = decayPass(s, now);
  s = compact(s, now);
  return { ...brain, memory: { ...s, gaps: u.gaps, coverage: u.coverage, cursor: { sig, day }, updatedAt: now } };
}

/* ------------------------- what the trader tells Minato ------------------------- */

const REMEMBER = /^\s*(?:please\s+)?remember(?:\s+that)?[:,]?\s+([\s\S]{8,240})$/i;
const FORGET = /^\s*(?:please\s+)?forget(?:\s+(?:about|that|what i said about))?[:,]?\s+([\s\S]{3,160})$/i;

/**
 * "Remember that I only trade the NY open." → a pinned memory that keeps the trader's attribution.
 * "Forget the thing about Mondays." → the closest live memory is retired (restorable from the Mind tab).
 */
export function applyDirectives(brain: MinatoBrain, text: string, now: number): { brain: MinatoBrain; remembered?: string; forgotten?: string } {
  const store = brain.memory ?? emptyMemory();
  const rem = text.match(REMEMBER);
  if (rem) {
    const said = rem[1].replace(/\s+/g, " ").trim().replace(/[.!]+$/, "");
    const o: Observation = {
      id: `usr:${slug(said)}`, kind: "semantic", topic: "fact", text: `You told me: ${clip(said, 220)}`, short: clip(said, 48), stance: "fact", polarity: "neutral",
      level: "supported", confidence: 0.9, n: 1, evidence: [{ date: dayKey(now), note: "said in chat" }], origin: "user", pinned: true, cumulative: true,
    };
    return { brain: { ...brain, memory: observe(store, o, now) }, remembered: said };
  }
  const fg = text.match(FORGET);
  if (fg) {
    const target = fg[1].trim();
    let best: { id: string; score: number; short: string } | null = null;
    for (const it of activeItems(store)) {
      if (it.kind === "episodic" && !/\b20\d{2}-\d{2}-\d{2}\b/.test(target)) continue;
      const score = Math.max(jaccard(it.text, target), jaccard(it.short, target));
      if (score >= 0.2 && (!best || score > best.score)) best = { id: it.id, score, short: it.short };
    }
    if (best) return { brain: { ...brain, memory: rejectMemory(store, best.id, now) }, forgotten: best.short };
  }
  return { brain };
}
