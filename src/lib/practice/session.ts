/**
 * Turns a raw candidate pool into the pool for one round:
 *   1. drops everything already answered correctly (the no-repeat ledger) — except mistake-trade questions,
 *      which are scheduled: held back until their revision date, then brought back first
 *   2. lets missed and due-for-revision questions come back first (a bigger slice as the level rises)
 *   3. gives each trade a share of the round in proportion to its weight — a blunder gets 3–6× the questions
 *      of an ordinary trade, a trade done well gets half (see focus.ts)
 *   4. picks questions by the level's tier mix (see curriculum.ts), so a higher level really asks harder things
 *   5. mixes groups (Time Machine / math / Math Duel / Boss) by weight
 */
import type { PracticeProgress } from "@/lib/types";
import type { Level, PracticeQuestion } from "./engine.ts";
import { fpKey, readLedger } from "./ledger.ts";
import { blunderBoost, tierMix } from "./curriculum.ts";
import { isHeld } from "./focus.ts";
import { hashText } from "./hash.ts";
import { seededRng, type Rng } from "./math/rng.ts";

export type Group = NonNullable<PracticeQuestion["group"]>;

export const groupOf = (q: PracticeQuestion): Group =>
  q.group ?? (q.source === "ai" ? (q.tag.includes("math") ? "math" : "tm") : "tm");

export interface AssembleArgs {
  questions: PracticeQuestion[];
  progress: PracticeProgress;
  count: number;
  /** Whole-number tier of the player's level (kept for callers that only know the tier). */
  startLevel: Level;
  /** The arena level itself (1, 2, 3 … open-ended). Drives the tier mix and the revision share. Defaults to the tier. */
  level?: number;
  /** Relative weights per group. Missing groups get nothing unless others run short. */
  weights: Partial<Record<Group, number>>;
  /** Trade ids that have at least one saved screenshot. */
  hasChart: ReadonlySet<string>;
  /** Trade id → share of the round (blunders > 1, trades done well < 1). Missing trades count as 1. */
  tradeWeights?: ReadonlyMap<string, number>;
  /** Extra questions so live difficulty can move up or down. */
  spare?: number;
  /** YYYY-MM-DD. Defaults to the local date. */
  today?: string;
  /** Randomness for tie-breaking, so tests can be exact. */
  seed?: number;
}

export interface Assembled {
  pool: PracticeQuestion[];
  fresh: number;
  retry: number;
  /** Mistake-trade questions that are back because their revision date arrived. */
  revise: number;
  /** Candidates dropped because they were already answered correctly. */
  retired: number;
  /** Candidates held back because their revision date is still in the future. */
  held: number;
}

const tradeKey = (q: PracticeQuestion) => q.tradeId ?? q.chartTradeIds?.[0] ?? "none";

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** A question that comes back is asked in a new order, so the answer cannot be remembered by position. */
function reshuffled(q: PracticeQuestion, today: string): PracticeQuestion {
  if (q.kind !== "choice" || !q.choices || q.choices.length < 2) return q;
  const rng = seededRng(parseInt(hashText(`${q.fp}|${today}`), 36) || 1);
  const choices = [...q.choices];
  for (let i = choices.length - 1; i > 0; i--) { const j = rng.int(0, i); [choices[i], choices[j]] = [choices[j]!, choices[i]!]; }
  return { ...q, choices };
}

/**
 * Per trade, questions are ordered by how much the player's level wants them (tier mix, with a little noise so
 * rounds differ). Trades are then interleaved by weight: a trade with weight 4 is served about four times as often
 * as one with weight 1, but never more than `cap` questions of one trade are taken before the others have had theirs.
 */
function spreadByTrade(list: PracticeQuestion[], level: number, hasChart: ReadonlySet<string>, tradeWeights: ReadonlyMap<string, number> | undefined, cap: number, rng: Rng): PracticeQuestion[] {
  const mix = tierMix(level);
  const desire = (q: PracticeQuestion) => (mix[q.level - 1] ?? 0) * (0.65 + 0.7 * rng.next()) + (q.source === "ai" ? 0.5 : 0);
  const queues = new Map<string, PracticeQuestion[]>();
  for (const q of list) {
    const key = tradeKey(q);
    queues.set(key, [...(queues.get(key) ?? []), q]);
  }
  for (const [key, queue] of queues) queues.set(key, queue.map((q) => ({ q, d: desire(q) })).sort((a, b) => b.d - a.d).map((x) => x.q));
  const share = (key: string) => (tradeWeights?.get(key) ?? 1) * (hasChart.has(key) ? 1.1 : 1);
  const keys = [...queues.keys()].sort((a, b) => share(b) - share(a));
  const taken = new Map<string, number>(keys.map((key) => [key, 0] as [string, number]));
  const out: PracticeQuestion[] = [];
  const limit = keys.length >= 3 ? cap : Infinity;
  for (;;) {
    let best: string | null = null;
    let bestPriority = -1;
    for (const key of keys) {
      const n = taken.get(key)!;
      if (n >= (queues.get(key)?.length ?? 0) || n >= limit) continue;
      const priority = share(key) / (n + 1);
      if (priority > bestPriority) { best = key; bestPriority = priority; }
    }
    if (best == null) break;
    const n = taken.get(best)!;
    out.push(queues.get(best)![n]!);
    taken.set(best, n + 1);
  }
  // Anything the per-trade cap held back still counts when the other trades have run out.
  for (const key of keys) out.push(...(queues.get(key) ?? []).slice(taken.get(key)!));
  return out;
}

export function assembleSession(args: AssembleArgs): Assembled {
  const { questions, progress, count, startLevel, weights, hasChart, tradeWeights } = args;
  const level = args.level ?? startLevel;
  const today = args.today ?? localToday();
  const rng = seededRng(args.seed ?? ((Date.now() ^ 0x9e3779b9) >>> 0));
  const target = count + (args.spare ?? 3);
  const ledger = readLedger(progress);

  let retired = 0;
  let held = 0;
  const fresh: PracticeQuestion[] = [];
  const back: Array<{ q: PracticeQuestion; missed: boolean; due: string; weight: number }> = [];
  const seen = new Set<string>();
  for (const q of questions) {
    if (seen.has(q.fp)) continue;
    seen.add(q.fp);
    const key = fpKey(q.fp);
    if (ledger.done.has(key)) { retired++; continue; }
    const scheduled = ledger.revision.get(key);
    if (isHeld(scheduled, today)) { held++; continue; }
    const missed = ledger.missed.has(key);
    if (missed || scheduled) back.push({ q, missed, due: scheduled?.due ?? today, weight: tradeWeights?.get(tradeKey(q)) ?? 1 });
    else fresh.push(q);
  }

  // Questions coming back: what you got wrong first (worst trades first), then revision that has fallen due (longest overdue first).
  back.sort((a, b) => Number(b.missed) - Number(a.missed) || b.weight - a.weight || a.due.localeCompare(b.due));
  const backBudget = Math.max(1, Math.ceil(count * Math.min(0.5, 0.3 + blunderBoost(level))));
  const backTaken = back.slice(0, backBudget).map(({ q, missed }) => ({ ...reshuffled(q, today), retry: missed || undefined, revise: !missed || undefined }));

  const groups = (Object.keys(weights) as Group[]).filter((g) => (weights[g] ?? 0) > 0);
  const ordered = new Map<Group, PracticeQuestion[]>();
  const perTradeCap = Math.max(3, Math.ceil(target * 0.4));
  for (const g of new Set<Group>([...groups, ...fresh.map(groupOf), ...backTaken.map(groupOf)])) {
    const mine = fresh.filter((q) => groupOf(q) === g);
    ordered.set(g, [...backTaken.filter((q) => groupOf(q) === g), ...spreadByTrade(mine, level, hasChart, tradeWeights, perTradeCap, rng)]);
  }

  // Allocate slots by weight, then let groups with spare questions absorb any shortfall.
  const totalWeight = groups.reduce((sum, g) => sum + (weights[g] ?? 0), 0) || 1;
  const taken = new Map<Group, PracticeQuestion[]>();
  let remaining = target;
  for (const g of groups) {
    const want = Math.max(1, Math.round((target * (weights[g] ?? 0)) / totalWeight));
    const slice = (ordered.get(g) ?? []).slice(0, Math.min(want, remaining));
    taken.set(g, slice);
    remaining -= slice.length;
  }
  const priority = [...groups].sort((a, b) => (weights[b] ?? 0) - (weights[a] ?? 0));
  for (const g of [...priority, ...[...ordered.keys()].filter((k) => !priority.includes(k))]) {
    if (remaining <= 0) break;
    const have = taken.get(g) ?? [];
    const more = (ordered.get(g) ?? []).slice(have.length, have.length + remaining);
    taken.set(g, [...have, ...more]);
    remaining -= more.length;
  }

  // Interleave groups so the round alternates between kinds of questions.
  const lists = [...taken.entries()].sort((a, b) => (weights[b[0]] ?? 0) - (weights[a[0]] ?? 0)).map(([, list]) => list);
  const pool: PracticeQuestion[] = [];
  for (let i = 0; lists.some((l) => l.length > i); i++) for (const list of lists) if (list[i]) pool.push(list[i]!);

  return {
    pool,
    fresh: pool.filter((q) => !q.retry && !q.revise).length,
    retry: pool.filter((q) => q.retry).length,
    revise: pool.filter((q) => q.revise).length,
    retired,
    held,
  };
}
