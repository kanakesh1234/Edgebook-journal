/**
 * Turns a raw candidate pool into the pool for one round:
 *   1. drops everything already answered correctly (the no-repeat ledger)
 *   2. lets previously missed questions come back first
 *   3. spreads questions evenly across trades (charts first)
 *   4. mixes groups (Time Machine / math / Math Duel / Boss) by weight
 */
import type { PracticeProgress } from "@/lib/types";
import type { Level, PracticeQuestion } from "./engine";
import { fpKey, readLedger } from "./ledger";

export type Group = NonNullable<PracticeQuestion["group"]>;

export const groupOf = (q: PracticeQuestion): Group =>
  q.group ?? (q.source === "ai" ? (q.tag.includes("math") ? "math" : "tm") : "tm");

export interface AssembleArgs {
  questions: PracticeQuestion[];
  progress: PracticeProgress;
  count: number;
  startLevel: Level;
  /** Relative weights per group. Missing groups get nothing unless others run short. */
  weights: Partial<Record<Group, number>>;
  /** Trade ids that have at least one saved screenshot. */
  hasChart: ReadonlySet<string>;
  /** Extra questions so live difficulty can move up or down. */
  spare?: number;
}

export interface Assembled {
  pool: PracticeQuestion[];
  fresh: number;
  retry: number;
  /** Candidates dropped because they were already answered correctly. */
  retired: number;
}

const tradeKey = (q: PracticeQuestion) => q.tradeId ?? q.chartTradeIds?.[0] ?? "none";

/** Round-robin across trades (trades with charts first); inside a trade, nearest level first. */
function spreadByTrade(list: PracticeQuestion[], startLevel: Level, hasChart: ReadonlySet<string>): PracticeQuestion[] {
  const queues = new Map<string, PracticeQuestion[]>();
  for (const q of list) {
    const key = tradeKey(q);
    queues.set(key, [...(queues.get(key) ?? []), q]);
  }
// AI-written questions lead (they are the point of every round); local ones fill in behind them.
  for (const [key, queue] of queues) queues.set(key, [...queue].sort((a, b) => Number(b.source === "ai") * 1000 - Number(a.source === "ai") * 1000 + Math.abs(a.level - startLevel) - Math.abs(b.level - startLevel)));
  const keys = [...queues.keys()].sort((a, b) => Number(hasChart.has(b)) - Number(hasChart.has(a)));
  const out: PracticeQuestion[] = [];
  for (let round = 0; keys.some((k) => (queues.get(k)?.length ?? 0) > round); round++) {
    for (const key of keys) {
      const next = queues.get(key)?.[round];
      if (next) out.push(next);
    }
  }
  return out;
}

export function assembleSession(args: AssembleArgs): Assembled {
  const { questions, progress, count, startLevel, weights, hasChart } = args;
  const target = count + (args.spare ?? 3);
  const ledger = readLedger(progress);

  let retired = 0;
  const fresh: PracticeQuestion[] = [];
  const retry: PracticeQuestion[] = [];
  const seen = new Set<string>();
  for (const q of questions) {
    if (seen.has(q.fp)) continue;
    seen.add(q.fp);
    const key = fpKey(q.fp);
    if (ledger.done.has(key)) { retired++; continue; }
    if (ledger.missed.has(key)) retry.push({ ...q, retry: true });
    else fresh.push(q);
  }

  const groups = (Object.keys(weights) as Group[]).filter((g) => (weights[g] ?? 0) > 0);
  const ordered = new Map<Group, PracticeQuestion[]>();
  const retryBudget = Math.max(1, Math.ceil(count * 0.3));
  const retryTaken = retry.slice(0, retryBudget);
  for (const g of new Set<Group>([...groups, ...fresh.map(groupOf), ...retryTaken.map(groupOf)])) {
    const mine = fresh.filter((q) => groupOf(q) === g);
    ordered.set(g, [...retryTaken.filter((q) => groupOf(q) === g), ...spreadByTrade(mine, startLevel, hasChart)]);
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

  return { pool, fresh: pool.filter((q) => !q.retry).length, retry: pool.filter((q) => q.retry).length, retired };
}
