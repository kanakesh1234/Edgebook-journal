/**
 * Builds one 60-second round for any of the four modes.
 *
 * Supply order (nothing here is repeated unless it was answered wrong):
 *   1. questions you missed before          (come back first, capped)
 *   2. AI questions written from your trades (banked ones instantly; otherwise a fresh batch)
 *   3. local questions computed from your journal (always available as the safety net)
 *
 * The AI model is slow (free tier), so a round never waits on it for more than
 * a few seconds: if the batch isn't back in time the round starts on the local
 * questions and the AI batch joins mid-round through `drain()`.
 */
import type { JournalEntry, PracticeProgress } from "@/lib/types";
import { buildPool, isUsable, portfolioQuestions, weekTrades, type PracticeQuestion } from "./engine";
import { seededRng, type Rng } from "./math/rng";
import { readLedger, type LedgerView, fpKey } from "./ledger";
import { assembleSession, groupOf, type Group } from "./session";
import { duelQuestions } from "./duel-questions";
import { fetchAiQuestions } from "./ai-client";
import { recentPrompts } from "./history";
import { readAiBank, readMissed, stashUnused, writeAiBank } from "./bank";
import { tierOf, type ArenaMode } from "./arena";
import type { FamilyRating } from "./math/difficulty";

const FAMILIES = ["breakeven", "expectancy", "sizing", "fees", "streak", "at-least-one", "buffer", "net-positive"] as const;
const ratingsFor = (tier: 1 | 2 | 3 | 4): FamilyRating => Object.fromEntries(FAMILIES.map((f) => [f, { level: tier, weakRounds: 0 }])) as FamilyRating;

const AI_BATCH = 18;
const AI_START_WAIT_MS = 10_000;
const MIN_BANK_TO_SKIP_WAIT = 6;

export interface RoundContext {
  mode: ArenaMode;
  level: number;
  /** Entries already scoped to the active challenge. */
  entries: JournalEntry[];
  progress: PracticeProgress;
  drawdownLeft: number | null;
}

export interface Round {
  mode: ArenaMode;
  level: number;
  initial: PracticeQuestion[];
  note: string | null;
  /** New questions that arrived since the last call (late AI batch, top-ups). Cheap — call after every answer. */
  drain(): PracticeQuestion[];
  /** Ask for more when the runner is running low. Safe to call repeatedly. */
  topUp(): void;
  /** The round is over: anything that arrives later is banked for next time instead. */
  close(): void;
}

export type Prepared = { round: Round } | { empty: string };

const WEIGHTS: Record<ArenaMode, Partial<Record<Group, number>>> = {
  "time-machine": { tm: 1 },
  boss: { boss: 5, tm: 2, math: 3 },
  matrix: { tm: 5, math: 2, duel: 3 },
  "math-duel": { duel: 5, math: 3 },
};

const fitsMode = (mode: ArenaMode, q: PracticeQuestion): boolean => {
  const g = groupOf(q);
  if (mode === "matrix") return true;
  if (mode === "time-machine") return g === "tm";
  if (mode === "boss") return g !== "duel";
  return g === "duel" || g === "math";
};

const hasText = (e: JournalEntry) => !!(e.notes?.trim() || e.reflection?.lesson || e.review?.followUp?.biggestMistake || e.review?.execution?.whyEntered);

/** Trades the AI writes from: ones with notes and screenshots, and the ones practised least. */
export function pickEvidence(trades: JournalEntry[], perf: NonNullable<PracticeProgress["modePerformance"]>, n: number, rng: Rng): JournalEntry[] {
  return trades
    .map((e) => ({ e, score: (hasText(e) ? 2 : 0) + ((e.images?.length ?? 0) > 0 ? 2 : 0) - Math.min(4, perf[`matrix:${e.id}`]?.attempts ?? 0) * 0.3 + rng.next() * 1.5 }))
    .sort((a, b) => b.score - a.score)
    .slice(0, n)
    .map((item) => item.e);
}

function tradesFor(mode: ArenaMode, entries: JournalEntry[]): JournalEntry[] {
  return mode === "boss" ? weekTrades(entries).trades.filter(isUsable) : entries.filter(isUsable);
}

function localQuestions(ctx: RoundContext, seed: number, ledger: LedgerView): PracticeQuestion[] {
  const trades = tradesFor(ctx.mode, ctx.entries);
  const base = { trades, all: ctx.entries, seed, drawdownLeft: ctx.drawdownLeft };
  const ratings = ratingsFor(tierOf(ctx.level));
  if (ctx.mode === "time-machine") return buildPool({ ...base, mode: "time-machine" });
  if (ctx.mode === "boss") return buildPool({ ...base, mode: "boss" });
  if (ctx.mode === "matrix") return [...buildPool({ ...base, mode: "matrix" }), ...duelQuestions(10, ratings, ledger, seed)];
  const math = buildPool({ ...base, mode: "matrix" }).filter((q) => groupOf(q) === "math");
  return [...duelQuestions(30, ratings, ledger, seed), ...math, ...portfolioQuestions(ctx.entries, seededRng(seed), ctx.drawdownLeft)];
}

function weakTagsOf(progress: PracticeProgress): string[] {
  return [...new Set((progress.seenQuestions ?? []).filter((s) => s.variant === 1).map((s) => s.format))].slice(-5);
}

const delay = (ms: number) => new Promise<null>((resolve) => setTimeout(() => resolve(null), ms));

/** AI questions that are still valid: not retired, and written from a trade that still exists. */
function usableAi(questions: PracticeQuestion[], ids: Set<string>, ledger: LedgerView): PracticeQuestion[] {
  return questions.filter((q) => !ledger.done.has(fpKey(q.fp)) && (!q.tradeId || ids.has(q.tradeId)));
}

async function fetchBatch(ctx: RoundContext, evidence: JournalEntry[], avoid: string[]) {
  return fetchAiQuestions({
    mode: ctx.mode, level: tierOf(ctx.level), arena: ctx.level, count: AI_BATCH, trades: evidence,
    avoid: [...recentPrompts(), ...avoid].slice(-120), weakTags: weakTagsOf(ctx.progress),
  });
}

export async function prepareRound(ctx: RoundContext): Promise<Prepared> {
  const trades = tradesFor(ctx.mode, ctx.entries);
  if (ctx.mode !== "math-duel" && trades.length === 0) return { empty: "Add a trade with a P&L and your first round is ready." };
  if (ctx.mode === "boss" && trades.length < 2) return { empty: "The boss needs two trades in the same week." };

  const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  const rng = seededRng(seed);
  const ledger = readLedger(ctx.progress);
  const ids = new Set(ctx.entries.map((e) => e.id));
  const evidence = pickEvidence(trades, ctx.progress.modePerformance ?? {}, 8, rng);
  const hasChart = new Set(ctx.entries.filter((e) => (e.images?.length ?? 0) > 0).map((e) => e.id));

  const known = new Set<string>();
  const arrived: PracticeQuestion[] = [];
  let closed = false;
  let refilling = false;
  let aiCalls = 0;
  let nextSeed = seed;
  let note: string | null = null;

  const arrive = (questions: PracticeQuestion[]) => {
    const fresh = usableAi(questions, ids, ledger).filter((q) => !known.has(q.fp));
    if (closed) { stashUnused(ctx.mode, fresh); return; }
    for (const q of fresh) known.add(q.fp);
    arrived.push(...fresh);
  };

  // --- AI: banked questions first, otherwise a fresh batch (bounded wait) ---
  const banked = usableAi(readAiBank(ctx.mode), ids, ledger);
  writeAiBank(ctx.mode, []); // taken for this round; unplayed ones are stashed back at the end
  let aiNow = banked;
  if (evidence.length && banked.length < MIN_BANK_TO_SKIP_WAIT) {
    aiCalls++;
    const request = fetchBatch(ctx, evidence, []);
    const first = await Promise.race([request, delay(AI_START_WAIT_MS)]);
    if (first) {
      aiNow = [...banked, ...usableAi(first.questions, ids, ledger)];
      note = first.questions.length ? null : first.note;
    } else {
      void request.then((result) => arrive(result.questions));
    }
  }

  const missed = usableAi(readMissed(ctx.progress), ids, ledger).filter((q) => fitsMode(ctx.mode, q));
  const assembled = assembleSession({
    questions: [...missed, ...aiNow, ...localQuestions(ctx, seed, ledger)],
    progress: ctx.progress,
    count: ctx.mode === "math-duel" ? 24 : 20,
    startLevel: tierOf(ctx.level),
    weights: WEIGHTS[ctx.mode],
    hasChart,
  });
  if (assembled.pool.length < 3) {
    return { empty: assembled.retired > 0 ? "You've answered everything available correctly. New trades or review notes unlock more." : "Not enough recorded data for this mode yet." };
  }
  for (const q of assembled.pool) known.add(q.fp);

  const round: Round = {
    mode: ctx.mode,
    level: ctx.level,
    initial: assembled.pool,
    note,
    drain() { return arrived.splice(0, arrived.length); },
    close() { closed = true; stashUnused(ctx.mode, arrived.splice(0, arrived.length)); },
    topUp() {
      if (closed || refilling) return;
      refilling = true;
      // Local top-up is instant: the duel generator never runs dry.
      if (ctx.mode === "matrix" || ctx.mode === "math-duel") {
        nextSeed = (nextSeed + 7919) >>> 0;
        arrive(duelQuestions(12, ratingsFor(tierOf(ctx.level)), ledger, nextSeed));
      }
      const bank = usableAi(readAiBank(ctx.mode), ids, ledger);
      if (bank.length) { writeAiBank(ctx.mode, []); arrive(bank); refilling = false; return; }
      if (!evidence.length || aiCalls >= 2) { refilling = false; return; }
      aiCalls++;
      void fetchBatch(ctx, evidence, [...known].slice(-40)).then((result) => arrive(result.questions)).finally(() => { refilling = false; });
    },
  };
  return { round };
}

/** Refill the on-device bank in the background so the next round starts instantly. */
export async function warmBank(ctx: RoundContext): Promise<void> {
  if (readAiBank(ctx.mode).length >= 10) return;
  const trades = tradesFor(ctx.mode, ctx.entries);
  if (!trades.length) return;
  const evidence = pickEvidence(trades, ctx.progress.modePerformance ?? {}, 8, seededRng((Date.now() ^ 0x5bd1e995) >>> 0));
  const ledger = readLedger(ctx.progress);
  const ids = new Set(ctx.entries.map((e) => e.id));
  const result = await fetchBatch(ctx, evidence, []);
  const fresh = usableAi(result.questions, ids, ledger);
  if (fresh.length) writeAiBank(ctx.mode, [...readAiBank(ctx.mode), ...fresh]);
}
