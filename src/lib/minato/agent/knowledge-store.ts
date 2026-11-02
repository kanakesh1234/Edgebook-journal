/**
 * KNOWLEDGE STORE — MINATO's persistent contextual memory about one trader.
 *
 * This is NOT model training and never claims to be. It is a durable, per-trader notebook the agent reads
 * at the start of every turn and writes to when it learns something worth keeping: stated goals and rules,
 * strategy intentions, decisions the trader made in chat, conclusions drawn from their records (with the date
 * they were true), conversation summaries and a once-a-day progress checkpoint.
 *
 * Ownership & security
 *  - Rows are keyed by the verified Edgebook identity (`g_<google subject>`), minted server-side only.
 *  - Access goes through Supabase PostgREST with the short-lived RLS JWT from supabase-identity.ts, so the
 *    existing row-level-security policy (`user_id = auth.jwt()->>'edgebook_user_id'`) is what enforces isolation —
 *    not application code alone. A caller can never pick another trader's id.
 *
 * Freshness rule (the point of the `asOf` field)
 *  - Stored observations are context, never evidence. Live journal data always wins; the prompt says so and
 *    every stored insight carries the date it was last confirmed.
 */
import type { AppSession } from "@/lib/server/session";

export const INSIGHT_KINDS = [
  "strategy", "strength", "weakness", "mistake", "risk", "emotion", "habit", "goal", "decision", "preference", "progress", "fact", "conversation",
] as const;
export type InsightKind = (typeof INSIGHT_KINDS)[number];
export type InsightSource = "trader_stated" | "analysis" | "conversation" | "checkpoint";

export interface Insight {
  id: string;
  kind: InsightKind;
  content: string;
  evidence: string[];
  source: InsightSource;
  confidence: number;
  status: "active" | "superseded" | "deleted";
  timesSeen: number;
  firstSeen: string;
  lastSeen: string;
  /** The date of the data this observation was drawn from (null for things the trader simply said). */
  asOf: string | null;
  data: Record<string, unknown>;
}

export interface InsightInput {
  kind: InsightKind;
  content: string;
  evidence?: string[];
  source: InsightSource;
  confidence?: number;
  asOf?: string | null;
  data?: Record<string, unknown>;
  /** Override the dedupe key (e.g. one checkpoint per day). */
  fingerprint?: string;
  /** An older insight this one replaces (it is marked superseded, not deleted). */
  supersedesId?: string;
}

export type SaveResult = { ok: true; id: string; created: boolean } | { ok: false; error: string };

export interface KnowledgeStore {
  readonly backend: "supabase" | "memory" | "none";
  list(o?: { kinds?: readonly InsightKind[]; query?: string; limit?: number; includeInactive?: boolean }): Promise<Insight[]>;
  save(input: InsightInput): Promise<SaveResult>;
  /** The most recent progress checkpoint dated before `beforeDate` (or any, when omitted). */
  latestCheckpoint(beforeDate?: string): Promise<Insight | null>;
}

/* ------------------------------------------------------------------ */
/*  Shared helpers                                                     */
/* ------------------------------------------------------------------ */

export function fingerprintOf(kind: string, content: string): string {
  const norm = content.toLowerCase().replace(/[^a-z0-9$%]+/g, " ").trim().slice(0, 180);
  let h = 5381;
  for (let i = 0; i < norm.length; i++) h = ((h << 5) + h + norm.charCodeAt(i)) | 0;
  return `${kind}:${(h >>> 0).toString(16)}`;
}

export function normalizeInput(i: InsightInput): { ok: true; value: Required<Pick<InsightInput, "kind" | "content" | "source">> & InsightInput } | { ok: false; error: string } {
  if (!INSIGHT_KINDS.includes(i.kind)) return { ok: false, error: `kind must be one of ${INSIGHT_KINDS.join(", ")}` };
  const content = String(i.content ?? "").replace(/\s+/g, " ").trim();
  if (content.length < 8) return { ok: false, error: "content is too short to be useful" };
  if (content.length > 600) return { ok: false, error: "content is too long (max 600 characters); summarise" };
  if (/(sk-[a-z0-9_-]{16,}|\b\d{13,19}\b|password|api[_ -]?key)/i.test(content)) return { ok: false, error: "content looks like a secret or account number and was not stored" };
  const confidence = Math.max(0, Math.min(1, typeof i.confidence === "number" ? i.confidence : i.source === "trader_stated" ? 0.95 : 0.7));
  return {
    ok: true,
    value: {
      ...i,
      content,
      confidence,
      evidence: (i.evidence ?? []).map((e) => String(e).slice(0, 160)).slice(0, 6),
      asOf: i.asOf && /^\d{4}-\d{2}-\d{2}$/.test(i.asOf) ? i.asOf : null,
    },
  };
}

function scoreInsight(x: Insight, words: string[]): number {
  const text = `${x.kind} ${x.content}`.toLowerCase();
  let s = 0;
  for (const w of words) if (text.includes(w)) s += 1;
  return s;
}

const STOP = new Set(["the", "a", "an", "and", "or", "of", "to", "in", "on", "for", "my", "me", "i", "is", "are", "was", "what", "how", "about", "do", "does", "did", "you", "know", "with", "this", "that"]);
export function queryWords(q?: string): string[] {
  return (q ?? "").toLowerCase().split(/[^a-z0-9$%+]+/).filter((w) => w.length > 2 && !STOP.has(w));
}

/** Rank: keyword relevance first (when a query is given), then confidence and recency. */
export function rankInsights(items: Insight[], query?: string, limit = 12): Insight[] {
  const words = queryWords(query);
  return [...items]
    .map((x) => ({ x, s: words.length ? scoreInsight(x, words) : 0 }))
    .filter((r) => !words.length || r.s > 0)
    .sort((a, b) => b.s - a.s || b.x.confidence - a.x.confidence || b.x.lastSeen.localeCompare(a.x.lastSeen))
    .slice(0, limit)
    .map((r) => r.x);
}

/* ------------------------------------------------------------------ */
/*  In-memory store (tests, local development without Supabase)         */
/* ------------------------------------------------------------------ */

export class MemoryKnowledgeStore implements KnowledgeStore {
  readonly backend = "memory" as const;
  readonly rows = new Map<string, Insight & { fingerprint: string }>();
  private seq = 0;
  private readonly clock: () => Date;
  constructor(clock: () => Date = () => new Date()) { this.clock = clock; }

  async list(o: { kinds?: readonly InsightKind[]; query?: string; limit?: number; includeInactive?: boolean } = {}): Promise<Insight[]> {
    const all = [...this.rows.values()].filter((r) => (o.includeInactive || r.status === "active") && (!o.kinds || o.kinds.includes(r.kind)));
    return rankInsights(all, o.query, o.limit ?? 12);
  }

  async save(input: InsightInput): Promise<SaveResult> {
    const n = normalizeInput(input);
    if (!n.ok) return n;
    const v = n.value;
    const fp = v.fingerprint ?? fingerprintOf(v.kind, v.content);
    const now = this.clock().toISOString();
    const existing = [...this.rows.values()].find((r) => r.fingerprint === fp && r.status === "active");
    if (v.supersedesId) {
      const old = this.rows.get(v.supersedesId);
      if (old) old.status = "superseded";
    }
    if (existing) {
      existing.timesSeen += 1;
      existing.lastSeen = now;
      existing.confidence = Math.max(existing.confidence, v.confidence ?? 0);
      existing.content = v.content;
      existing.asOf = v.asOf ?? existing.asOf;
      existing.data = v.data ?? existing.data;
      existing.evidence = [...new Set([...(v.evidence ?? []), ...existing.evidence])].slice(0, 6);
      return { ok: true, id: existing.id, created: false };
    }
    const id = `ins_${++this.seq}_${now.slice(11, 19).replace(/:/g, "")}`;
    this.rows.set(id, {
      id, kind: v.kind, content: v.content, evidence: v.evidence ?? [], source: v.source, confidence: v.confidence ?? 0.7,
      status: "active", timesSeen: 1, firstSeen: now, lastSeen: now, asOf: v.asOf ?? null, data: v.data ?? {}, fingerprint: fp,
    });
    return { ok: true, id, created: true };
  }

  async latestCheckpoint(beforeDate?: string): Promise<Insight | null> {
    const cps = [...this.rows.values()].filter((r) => r.status === "active" && r.source === "checkpoint" && (!beforeDate || (r.asOf ?? "") < beforeDate));
    cps.sort((a, b) => (b.asOf ?? "").localeCompare(a.asOf ?? ""));
    return cps[0] ?? null;
  }
}

/* ------------------------------------------------------------------ */
/*  Supabase store (RLS enforced by the minted identity token)          */
/* ------------------------------------------------------------------ */

interface Row {
  id: string; user_id: string; kind: InsightKind; content: string; evidence: string[] | null; source: InsightSource; confidence: number;
  status: "active" | "superseded" | "deleted"; times_seen: number; first_seen: string; last_seen: string; as_of: string | null;
  data: Record<string, unknown> | null; fingerprint: string;
}
const toInsight = (r: Row): Insight => ({
  id: r.id, kind: r.kind, content: r.content, evidence: r.evidence ?? [], source: r.source, confidence: r.confidence, status: r.status,
  timesSeen: r.times_seen, firstSeen: r.first_seen, lastSeen: r.last_seen, asOf: r.as_of, data: r.data ?? {},
});

export class SupabaseKnowledgeStore implements KnowledgeStore {
  readonly backend = "supabase" as const;
  private failures = 0;
  private readonly cfg: { url: string; anonKey: string; token: string; userId: string; fetchImpl?: typeof fetch; timeoutMs?: number };
  constructor(cfg: { url: string; anonKey: string; token: string; userId: string; fetchImpl?: typeof fetch; timeoutMs?: number }) { this.cfg = cfg; }

  private get table() { return `${this.cfg.url.replace(/\/$/, "")}/rest/v1/minato_trader_knowledge`; }
  private headers(extra: Record<string, string> = {}) {
    return { apikey: this.cfg.anonKey, Authorization: `Bearer ${this.cfg.token}`, "Content-Type": "application/json", ...extra };
  }
  private async call(url: string, init: RequestInit): Promise<Response | null> {
    if (this.failures >= 2) return null; // stop hammering a database that is down for this request
    try {
      const res = await (this.cfg.fetchImpl ?? fetch)(url, { ...init, signal: AbortSignal.timeout(this.cfg.timeoutMs ?? 6_000) });
      if (!res.ok) { this.failures++; return res; }
      return res;
    } catch {
      this.failures++;
      return null;
    }
  }

  async list(o: { kinds?: readonly InsightKind[]; query?: string; limit?: number; includeInactive?: boolean } = {}): Promise<Insight[]> {
    const q = new URLSearchParams({ select: "*", user_id: `eq.${this.cfg.userId}`, order: "last_seen.desc", limit: "300" });
    if (!o.includeInactive) q.set("status", "eq.active");
    if (o.kinds?.length) q.set("kind", `in.(${o.kinds.join(",")})`);
    const res = await this.call(`${this.table}?${q}`, { headers: this.headers() });
    if (!res?.ok) return [];
    const rows = (await res.json().catch(() => [])) as Row[];
    return rankInsights(Array.isArray(rows) ? rows.map(toInsight) : [], o.query, o.limit ?? 12);
  }

  async save(input: InsightInput): Promise<SaveResult> {
    const n = normalizeInput(input);
    if (!n.ok) return n;
    const v = n.value;
    const fp = v.fingerprint ?? fingerprintOf(v.kind, v.content);
    const now = new Date().toISOString();

    const find = await this.call(`${this.table}?${new URLSearchParams({ select: "*", user_id: `eq.${this.cfg.userId}`, fingerprint: `eq.${fp}`, status: "eq.active", limit: "1" })}`, { headers: this.headers() });
    if (!find?.ok) return { ok: false, error: "memory store unavailable" };
    const found = (await find.json().catch(() => [])) as Row[];

    let id: string;
    let created = false;
    if (found[0]) {
      const cur = found[0];
      const patch = {
        content: v.content, last_seen: now, times_seen: (cur.times_seen ?? 1) + 1, confidence: Math.max(cur.confidence ?? 0, v.confidence ?? 0),
        as_of: v.asOf ?? cur.as_of, data: v.data ?? cur.data ?? {}, evidence: [...new Set([...(v.evidence ?? []), ...(cur.evidence ?? [])])].slice(0, 6),
      };
      const r = await this.call(`${this.table}?${new URLSearchParams({ id: `eq.${cur.id}`, user_id: `eq.${this.cfg.userId}` })}`, { method: "PATCH", headers: this.headers({ Prefer: "return=minimal" }), body: JSON.stringify(patch) });
      if (!r?.ok) return { ok: false, error: "memory store unavailable" };
      id = cur.id;
    } else {
      id = `ins_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
      const row = {
        id, user_id: this.cfg.userId, kind: v.kind, content: v.content, evidence: v.evidence ?? [], source: v.source, confidence: v.confidence ?? 0.7,
        status: "active", times_seen: 1, first_seen: now, last_seen: now, as_of: v.asOf ?? null, data: v.data ?? {}, fingerprint: fp,
      };
      const r = await this.call(this.table, { method: "POST", headers: this.headers({ Prefer: "return=minimal" }), body: JSON.stringify(row) });
      if (!r?.ok) return { ok: false, error: "memory store unavailable" };
      created = true;
    }
    if (v.supersedesId && v.supersedesId !== id) {
      await this.call(`${this.table}?${new URLSearchParams({ id: `eq.${v.supersedesId}`, user_id: `eq.${this.cfg.userId}` })}`, {
        method: "PATCH", headers: this.headers({ Prefer: "return=minimal" }), body: JSON.stringify({ status: "superseded" }),
      });
    }
    return { ok: true, id, created };
  }

  async latestCheckpoint(beforeDate?: string): Promise<Insight | null> {
    const q = new URLSearchParams({ select: "*", user_id: `eq.${this.cfg.userId}`, source: "eq.checkpoint", status: "eq.active", order: "as_of.desc", limit: "1" });
    if (beforeDate) q.set("as_of", `lt.${beforeDate}`);
    const res = await this.call(`${this.table}?${q}`, { headers: this.headers() });
    if (!res?.ok) return null;
    const rows = (await res.json().catch(() => [])) as Row[];
    return rows[0] ? toInsight(rows[0]) : null;
  }
}

/** A store that remembers nothing — used when no identity is available (never throws). */
export const NullKnowledgeStore: KnowledgeStore = {
  backend: "none",
  async list() { return []; },
  async save() { return { ok: false, error: "memory is not available for this session" }; },
  async latestCheckpoint() { return null; },
};

/**
 * Build the store for a request. Supabase when the identity bridge is configured; otherwise a clear, honest
 * "none" (production) — never a silent process-local fake that would pretend to persist across requests.
 */
export async function openKnowledgeStore(session: AppSession | null, env: NodeJS.ProcessEnv = process.env): Promise<KnowledgeStore> {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!session?.sub || !url || !anonKey) return NullKnowledgeStore;
  const { issueSupabaseWorkingMemoryToken } = await import("@/lib/server/supabase-identity");
  const issued = issueSupabaseWorkingMemoryToken(session);
  if (!issued) return NullKnowledgeStore;
  return new SupabaseKnowledgeStore({ url, anonKey, token: issued.token, userId: `g_${session.sub}` });
}
