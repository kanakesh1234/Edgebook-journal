/**
 * KNOWLEDGE STORE — MINATO's persistent contextual memory about one trader.
 *
 * This is NOT model training and never claims to be. It is a durable, per-trader notebook the agent reads
 * at the start of every turn and writes to when it learns something worth keeping: stated goals and rules,
 * strategy intentions, decisions the trader made in chat, conclusions drawn from their records (with the date
 * they were true), conversation summaries and a once-a-day progress checkpoint.
 *
 * Storage — Google Drive is the server
 *  - The notebook is ONE JSON file (`minato-knowledge.json`) in the trader's own EdgeBook folder on THEIR Drive,
 *    next to journal.json. There is no other database: isolation is simply "whose Drive token is this".
 *  - The file is read lazily (only when memory is actually consulted), mutated in memory, and written once per
 *    request by `flush()` — which re-reads the file first and merges, so two requests can't erase each other.
 *  - Memory is best-effort: if Drive is slow or unavailable the chat still answers, it just remembers nothing new.
 *
 * Freshness rule (the point of the `asOf` field)
 *  - Stored observations are context, never evidence. Live journal data always wins; the prompt says so and
 *    every stored insight carries the date it was last confirmed.
 */
import type { AppSession } from "@/lib/server/session";
import { getFile, putFile } from "@/lib/server/drive";

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
  readonly backend: "drive" | "memory" | "none";
  list(o?: { kinds?: readonly InsightKind[]; query?: string; limit?: number; includeInactive?: boolean }): Promise<Insight[]>;
  save(input: InsightInput): Promise<SaveResult>;
  /** The most recent progress checkpoint dated before `beforeDate` (or any, when omitted). */
  latestCheckpoint(beforeDate?: string): Promise<Insight | null>;
  /** Persist pending changes. Stores that write through (or hold nothing) may omit it. */
  flush?(): Promise<boolean>;
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
/*  In-memory store (tests, local development without a session)         */
/* ------------------------------------------------------------------ */

export type StoredInsight = Insight & { fingerprint: string };

export class MemoryKnowledgeStore implements KnowledgeStore {
  readonly backend: KnowledgeStore["backend"] = "memory";
  readonly rows = new Map<string, StoredInsight>();
  private seq = 0;
  protected readonly clock: () => Date;
  constructor(clock: () => Date = () => new Date()) { this.clock = clock; }

  /** Hook for stores that persist: called with the id of every row that was created or changed. */
  protected markDirty(_id: string): void { /* in-memory only */ }
  protected newId(now: string): string { return `ins_${++this.seq}_${now.slice(11, 19).replace(/:/g, "")}`; }

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
      if (old) { old.status = "superseded"; this.markDirty(old.id); }
    }
    if (existing) {
      existing.timesSeen += 1;
      existing.lastSeen = now;
      existing.confidence = Math.max(existing.confidence, v.confidence ?? 0);
      existing.content = v.content;
      existing.asOf = v.asOf ?? existing.asOf;
      existing.data = v.data ?? existing.data;
      existing.evidence = [...new Set([...(v.evidence ?? []), ...existing.evidence])].slice(0, 6);
      this.markDirty(existing.id);
      return { ok: true, id: existing.id, created: false };
    }
    const id = this.newId(now);
    this.rows.set(id, {
      id, kind: v.kind, content: v.content, evidence: v.evidence ?? [], source: v.source, confidence: v.confidence ?? 0.7,
      status: "active", timesSeen: 1, firstSeen: now, lastSeen: now, asOf: v.asOf ?? null, data: v.data ?? {}, fingerprint: fp,
    });
    this.markDirty(id);
    return { ok: true, id, created: true };
  }

  async latestCheckpoint(beforeDate?: string): Promise<Insight | null> {
    const cps = [...this.rows.values()].filter((r) => r.status === "active" && r.source === "checkpoint" && (!beforeDate || (r.asOf ?? "") < beforeDate));
    cps.sort((a, b) => (b.asOf ?? "").localeCompare(a.asOf ?? ""));
    return cps[0] ?? null;
  }
}

/* ------------------------------------------------------------------ */
/*  Drive store — one JSON file in the trader's own EdgeBook folder     */
/* ------------------------------------------------------------------ */

export const KNOWLEDGE_FILE = "minato-knowledge.json";
const MAX_ROWS = 400;

interface KnowledgeDoc { v: 1; rows: StoredInsight[] }

const isRow = (r: unknown): r is StoredInsight => {
  const x = r as Partial<StoredInsight> | null;
  return !!x && typeof x.id === "string" && typeof x.content === "string" && typeof x.kind === "string" && INSIGHT_KINDS.includes(x.kind as InsightKind);
};
const normRow = (r: StoredInsight): StoredInsight => ({
  ...r,
  evidence: Array.isArray(r.evidence) ? r.evidence.slice(0, 6) : [],
  confidence: typeof r.confidence === "number" ? r.confidence : 0.7,
  status: r.status === "superseded" || r.status === "deleted" ? r.status : "active",
  timesSeen: typeof r.timesSeen === "number" && r.timesSeen > 0 ? r.timesSeen : 1,
  firstSeen: r.firstSeen || new Date(0).toISOString(),
  lastSeen: r.lastSeen || r.firstSeen || new Date(0).toISOString(),
  asOf: r.asOf ?? null,
  data: r.data && typeof r.data === "object" ? r.data : {},
  fingerprint: r.fingerprint || fingerprintOf(r.kind, r.content),
});

/** Merge this request's changed rows over the freshest copy of the file, collapsing duplicate facts. */
export function mergeRows(remote: StoredInsight[], changed: StoredInsight[], maxRows = MAX_ROWS): StoredInsight[] {
  const byId = new Map<string, StoredInsight>();
  for (const r of remote) byId.set(r.id, r);
  for (const r of changed) byId.set(r.id, r);

  // The same active fact written by two requests (or two server instances) becomes one row.
  const byFp = new Map<string, StoredInsight>();
  for (const r of [...byId.values()].sort((a, b) => a.firstSeen.localeCompare(b.firstSeen))) {
    if (r.status !== "active") continue;
    const keep = byFp.get(r.fingerprint);
    if (!keep) { byFp.set(r.fingerprint, r); continue; }
    const newer = r.lastSeen > keep.lastSeen ? r : keep;
    keep.content = newer.content;
    keep.lastSeen = newer.lastSeen > keep.lastSeen ? newer.lastSeen : keep.lastSeen;
    keep.timesSeen = Math.max(keep.timesSeen, r.timesSeen);
    keep.confidence = Math.max(keep.confidence, r.confidence);
    keep.evidence = [...new Set([...keep.evidence, ...r.evidence])].slice(0, 6);
    keep.asOf = newer.asOf ?? keep.asOf;
    byId.delete(r.id);
  }

  let rows = [...byId.values()];
  if (rows.length > maxRows) {
    // Retire what matters least first: inactive rows, then low-confidence machine notes. Trader-stated notes stay.
    const rank = (r: StoredInsight) => (r.status !== "active" ? 0 : r.source === "trader_stated" ? 3 : r.source === "checkpoint" ? 1 : 2);
    rows = rows
      .sort((a, b) => rank(b) - rank(a) || b.confidence - a.confidence || b.lastSeen.localeCompare(a.lastSeen))
      .slice(0, maxRows);
  }
  return rows;
}

export interface DriveKnowledgeConfig {
  /** Folder that holds the file (the trader's EdgeBook `journals` folder). */
  folderId: string;
  /** Runs a Drive operation with a valid access token (refreshing once on 401). */
  run: <T>(op: (accessToken: string) => Promise<T>) => Promise<T>;
  fetchImpl?: typeof fetch;
  fileName?: string;
  clock?: () => Date;
  maxRows?: number;
}

export class DriveKnowledgeStore extends MemoryKnowledgeStore {
  readonly backend: KnowledgeStore["backend"] = "drive";
  private readonly cfg: DriveKnowledgeConfig;
  private loaded = false;
  private loading: Promise<boolean> | null = null;
  private readonly dirty = new Set<string>();
  private failures = 0;
  /** The stored file exists but could not be parsed: never overwrite it. */
  private unreadable = false;

  constructor(cfg: DriveKnowledgeConfig) {
    super(cfg.clock);
    this.cfg = cfg;
  }

  protected markDirty(id: string): void { this.dirty.add(id); }
  protected newId(): string { return `ins_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; }

  private get file() { return this.cfg.fileName ?? KNOWLEDGE_FILE; }

  private async readRemote(token: string): Promise<StoredInsight[]> {
    const blob = await getFile(token, this.cfg.folderId, this.file, this.cfg.fetchImpl);
    if (!blob) return [];
    let doc: unknown;
    try { doc = JSON.parse(await blob.text()); } catch { this.unreadable = true; throw new Error("minato-knowledge.json is not valid JSON"); }
    const rows = Array.isArray(doc) ? doc : (doc as Partial<KnowledgeDoc> | null)?.rows;
    return Array.isArray(rows) ? rows.filter(isRow).map(normRow) : [];
  }

  private ensureLoaded(): Promise<boolean> {
    if (this.loaded) return Promise.resolve(true);
    if (this.failures >= 2 || this.unreadable) return Promise.resolve(false);
    this.loading ??= (async () => {
      try {
        const rows = await this.cfg.run((t) => this.readRemote(t));
        for (const r of rows) if (!this.rows.has(r.id)) this.rows.set(r.id, r);
        this.loaded = true;
        return true;
      } catch {
        this.failures++;
        return false;
      } finally {
        this.loading = null;
      }
    })();
    return this.loading;
  }

  async list(o: { kinds?: readonly InsightKind[]; query?: string; limit?: number; includeInactive?: boolean } = {}): Promise<Insight[]> {
    if (!(await this.ensureLoaded())) return [];
    return super.list(o);
  }

  async save(input: InsightInput): Promise<SaveResult> {
    if (!(await this.ensureLoaded())) return { ok: false, error: "memory store unavailable" };
    return super.save(input);
  }

  async latestCheckpoint(beforeDate?: string): Promise<Insight | null> {
    if (!(await this.ensureLoaded())) return null;
    return super.latestCheckpoint(beforeDate);
  }

  /** Write pending changes. Re-reads the file first so concurrent requests merge instead of overwriting. */
  async flush(): Promise<boolean> {
    if (this.dirty.size === 0) return true;
    if (this.unreadable || this.failures >= 2) return false;
    const ids = [...this.dirty];
    try {
      await this.cfg.run(async (token) => {
        const remote = await this.readRemote(token);
        const changed = ids.map((id) => this.rows.get(id)).filter((r): r is StoredInsight => !!r);
        const merged = mergeRows(remote, changed, this.cfg.maxRows ?? MAX_ROWS);
        const doc: KnowledgeDoc = { v: 1, rows: merged };
        await putFile(token, this.cfg.folderId, this.file, Buffer.from(JSON.stringify(doc)), "application/json", this.cfg.fetchImpl);
      });
      for (const id of ids) this.dirty.delete(id);
      return true;
    } catch {
      this.failures++;
      return false;
    }
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
 * Build the store for a request: the trader's own Google Drive when a verified session exists, otherwise an honest
 * "none" — never a silent process-local fake that would pretend to persist across requests. Never throws and never
 * waits long: memory is a bonus, answering is the job.
 */
export async function openKnowledgeStore(session: AppSession | null, opts: { timeoutMs?: number } = {}): Promise<KnowledgeStore> {
  if (!session?.sub) return NullKnowledgeStore;
  try {
    const { getAuthedDrive, withDrive, newRequestId } = await import("@/lib/server/authed-drive");
    const timeout = new Promise<null>((r) => setTimeout(() => r(null), opts.timeoutMs ?? 8_000));
    const authed = await Promise.race([getAuthedDrive(), timeout]);
    if (!authed || !authed.ok) return NullKnowledgeStore;
    const drive = authed.drive;
    const requestId = newRequestId();
    return new DriveKnowledgeStore({
      folderId: drive.folders.journals,
      run: (op) => withDrive(drive, "minato-knowledge", requestId, op),
    });
  } catch {
    return NullKnowledgeStore;
  }
}
