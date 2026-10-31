/**
 * Memory retrieval for one question.
 *
 *  1. FILTER   metadata first: only live memories, only the kinds/topics the routed intent cares about (relaxed if that leaves too few).
 *  2. EXPAND   a small trading-domain synonym list widens the query ("fomo" also finds "chased" and "urgency").
 *  3. RANK     two independent rankers over the same pool: BM25 (lexical) and the existing hashed-embedding index (`buildRecall`).
 *  4. FUSE     Reciprocal Rank Fusion (k = 60), which needs no score calibration between the two rankers.
 *  5. RERANK   multiply by what the memory is worth right now: confidence, retention (decay), evidence status, topic fit, pin/importance.
 *              Relevance only lifts an item; a memory with no word overlap can still surface if the intent makes it important.
 *  6. DIVERSIFY Maximal Marginal Relevance + Token Budget enforcement so retrieved memories always fit inside the prompt budget.
 *
 * This is a feature-based reranker, not a neural cross-encoder: nothing here calls a model.
 */
import { buildRecall } from "./brain-ml";
import { activeItems, jaccard, retention, type MemoryItem, type MemoryKind, type MemoryStore } from "./memory";
import type { ContextPlan } from "./router";

const STOP = new Set("the and for that this with from was were have had has not but you your are what when why how can could should would about into just very also than then them they their there which while been being does did done get got make made like some any all out our its it's i'm ive i've im me my mine".split(" "));
const stem = (w: string) => (w.length > 5 ? w.replace(/(ing|ed|es|s)$/, "") : w);
const toks = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ").split(/\s+/).filter((w) => w.length >= 3 && !STOP.has(w)).map(stem);

const SYNONYMS: [RegExp, string][] = [
  [/\bfomo\b|\bmissing out\b|\bchas\w*/i, "chased early urgency missed entry"],
  [/\brevenge\b|\btilt\w*|\bmake it back\b|\bwin it back\b/i, "tilt revenge after loss urge"],
  [/\bstop\b|\bstoploss\b|\bstop loss\b/i, "moved stop widened risk stop size points"],
  [/\bsiz\w*|\boversiz\w*|\bcontracts?\b|\bmicro\b|\bmini\b|\bnq\b|\bmnq\b/i, "size sizing larger increased risk contracts stop points"],
  [/\bloss(es)?\b|\blosing\b|\bdrawdown\b|\bstreak\b/i, "after loss losing drawdown limit"],
  [/\bmindset\b|\bfeel\w*|\bemotion\w*|\bpsycholog\w*/i, "feeling felt told anxious frustrated calm"],
  [/\bdisciplin\w*|\brules?\b|\bprocess\b/i, "process rules broke plan"],
  [/\bplan\w*|\bprep\w*/i, "plan written routine before"],
  [/\bmorning\b|\bopen\b|\btime\b|\bsession\b/i, "time hour entered window session"],
  [/\bsetups?\b|\bplaybook\b|\bstrateg\w*/i, "setup playbook clean process rule"],
  [/\bimprov\w*|\bbetter\b|\bprogress\w*|\blately\b/i, "improving trend steady recent"],
  [/\bweak\w*|\bstrength\w*|\bhabit\w*|\bpattern\w*/i, "habit pattern recurring"],
];

export function expandQuery(q: string): string {
  const extra: string[] = [];
  for (const [re, add] of SYNONYMS) if (re.test(q)) extra.push(add);
  return extra.length ? `${q} ${extra.join(" ").split(" ").slice(0, 14).join(" ")}` : q;
}

const doc = (it: MemoryItem) => `${it.text} ${it.short} ${it.tags.join(" ")}`;

function bm25(items: MemoryItem[], query: string): Map<string, number> {
  const docs = items.map((it) => toks(doc(it)));
  const N = Math.max(1, docs.length);
  const avg = docs.reduce((s, d) => s + d.length, 0) / N || 1;
  const df = new Map<string, number>();
  for (const d of docs) for (const t of new Set(d)) df.set(t, (df.get(t) ?? 0) + 1);
  const q = [...new Set(toks(query))];
  const out = new Map<string, number>();
  items.forEach((it, i) => {
    const tf = new Map<string, number>();
    for (const t of docs[i]) tf.set(t, (tf.get(t) ?? 0) + 1);
    let s = 0;
    for (const t of q) {
      const f = tf.get(t);
      if (!f) continue;
      const idf = Math.log(1 + (N - (df.get(t) ?? 0) + 0.5) / ((df.get(t) ?? 0) + 0.5));
      s += idf * ((f * 2.2) / (f + 1.2 * (0.25 + 0.75 * (docs[i].length / avg))));
    }
    if (s > 0) out.set(it.id, s);
  });
  return out;
}

const STATUS_W: Record<string, number> = { established: 1, supported: 0.95, hypothesis: 0.8, contested: 0.6 };
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export interface Retrieved { item: MemoryItem; score: number; why: string[] }

export interface RetrievalDebugLog {
  id: string;
  at: number;
  query: string;
  intent: string;
  category?: string;
  toolsCalled: string[];
  tokenBudget: number;
  tokensUsed: number;
  retrieved: { id: string; kind: MemoryKind; short: string; score: number; why: string[] }[];
}

export function retrieveMemories(store: MemoryStore | undefined | null, query: string, plan: Pick<ContextPlan, "memory">, now: number): Retrieved[] {
  const all = activeItems(store);
  const { k, kinds, topics, tokenBudget = 900 } = plan.memory;
  if (!all.length || k <= 0) return [];

  // 1. metadata filter, relaxed in steps so a narrow intent never returns nothing while useful memories exist
  const byKind = (xs: MemoryItem[]) => (kinds ? xs.filter((x) => kinds.includes(x.kind) || x.origin === "user") : xs);
  const byTopic = (xs: MemoryItem[]) => (topics ? xs.filter((x) => topics.includes(x.topic) || x.origin === "user" || x.topic === "fact") : xs);
  let pool = byTopic(byKind(all));
  if (pool.length < Math.min(k, 3)) pool = byKind(all);
  if (pool.length < Math.min(k, 3)) pool = all;
  const topicFit = (x: MemoryItem) => (!topics || topics.includes(x.topic) || x.origin === "user" ? 1 : 0.7);

  // 2–4. expand, rank twice (BM25 keyword + feature-hash embedding), fuse via RRF
  const q = expandQuery(query);
  const lex = bm25(pool, q);
  const lexRank = [...lex.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
  const recall = buildRecall(pool.map((x) => ({ id: x.id, date: iso(x.lastSeen), kind: "saved" as const, text: doc(x) })));
  const denseRank = recall.search(q, pool.length).map((r) => r.id);
  const rrf = new Map<string, number>();
  const why = new Map<string, string[]>();
  const fuse = (ids: string[], label: string) => ids.forEach((id, i) => { rrf.set(id, (rrf.get(id) ?? 0) + 1 / (60 + i + 1)); (why.get(id) ?? why.set(id, []).get(id)!).push(label); });
  fuse(lexRank, "keywords");
  fuse(denseRank, "embedding");
  const maxRrf = Math.max(1e-9, ...rrf.values());

  // 5. rerank by hybrid score: relevance + confidence + recency/retention + status + importance/pin
  const scored = pool.map((it) => {
    const rel = (rrf.get(it.id) ?? 0) / maxRrf;
    const ret = retention(it, now);
    const importanceBoost = it.origin === "user" ? 1.25 : it.pinned ? 1.15 : 1.0;
    const prior = (0.4 + 0.6 * it.confidence) * (0.35 + 0.65 * ret) * (STATUS_W[it.status] ?? 0.7) * topicFit(it) * importanceBoost;
    const reasons = [...(why.get(it.id) ?? [])];
    if (topicFit(it) === 1 && topics) reasons.push("topic fit");
    if (it.pinned || it.origin === "user") reasons.push("pinned/user fact");
    if (ret > 0.85) reasons.push("recent");
    return { it, score: (0.5 + 0.5 * rel) * prior, why: reasons };
  }).sort((a, b) => b.score - a.score);

  // 6. MMR diversification within tokenBudget
  const top = scored[0]?.score || 1;
  const chosen: typeof scored = [];
  const rest = [...scored];
  let tokensUsed = 0;

  while (chosen.length < k && rest.length) {
    let bestI = 0, bestV = -Infinity;
    rest.forEach((c, i) => {
      const sim = chosen.length ? Math.max(...chosen.map((s) => jaccard(s.it.text, c.it.text))) : 0;
      const v = 0.7 * (c.score / top) - 0.3 * sim;
      if (v > bestV) { bestV = v; bestI = i; }
    });
    const candidate = rest.splice(bestI, 1)[0];
    const itemTokens = Math.ceil((candidate.it.text.length + candidate.it.short.length + 32) / 3.7);
    if (tokensUsed + itemTokens > tokenBudget && chosen.length > 0) {
      continue;
    }
    tokensUsed += itemTokens;
    chosen.push(candidate);
  }
  return chosen.map((c) => ({ item: c.it, score: Math.round(c.score * 1000) / 1000, why: c.why }));
}

/* ============================ what the model sees ============================ */

export interface BeliefOut {
  say: string;
  kind: MemoryKind;
  strength: "possible" | "likely" | "established" | "mixed signals";
  confidence: number;
  basedOn: number;
  /** recorded = a count from the journal; inferred = an interpretation of counts (an association, never a cause). */
  stance: "recorded" | "inferred";
  lastConfirmed: string;
  evidence?: string[];
}
export interface MemoryPayload {
  beliefs: BeliefOut[];
  insufficient: string[];
  debug?: {
    retrievedCount: number;
    tokenBudget: number;
    tokensUsed: number;
    items: { id: string; kind: MemoryKind; short: string; score: number; why: string[] }[];
  };
}

const STRENGTH: Record<string, BeliefOut["strength"]> = { hypothesis: "possible", supported: "likely", established: "established", contested: "mixed signals" };

export function memoryForModel(store: MemoryStore | undefined | null, query: string, plan: Pick<ContextPlan, "memory">, now: number): MemoryPayload {
  const got = retrieveMemories(store, query, plan, now);
  const insufficient: string[] = [];
  if (plan.memory.gaps && store) {
    for (const g of store.gaps.slice(0, 3)) insufficient.push(`${g.topic}: not enough data yet (${g.note})`);
    const c = store.coverage;
    if (c.trades >= 5 && c.withProcess < c.trades * 0.5) insufficient.push(`only ${c.withProcess} of ${c.trades} trades have review answers, so process patterns rest on a partial picture`);
  }
  const beliefs: BeliefOut[] = got.map(({ item: it }) => ({
    say: it.text, kind: it.kind, strength: STRENGTH[it.status] ?? "possible", confidence: it.confidence, basedOn: it.n,
    stance: it.stance === "fact" ? "recorded" : "inferred", lastConfirmed: iso(it.lastReinforced),
    ...(it.evidence.length ? { evidence: it.evidence.slice(0, 2).map((e) => `${e.date}${e.note ? `: ${e.note}` : ""}`) } : {}),
  }));
  const tokensUsed = Math.ceil(JSON.stringify({ beliefs, insufficient }).length / 3.7);
  return {
    beliefs,
    insufficient,
    debug: {
      retrievedCount: got.length,
      tokenBudget: plan.memory.tokenBudget ?? 900,
      tokensUsed,
      items: got.map((g) => ({
        id: g.item.id,
        kind: g.item.kind,
        short: g.item.short,
        score: g.score,
        why: g.why,
      })),
    },
  };
}
