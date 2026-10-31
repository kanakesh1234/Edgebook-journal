/**
 * MINATO MEMORY: typed tiers with a traceable, reversible lifecycle.
 *
 *  - WORKING     the live chat thread, today's brief and held feelings. Already exists (`MinatoBrain.days`, `mind`);
 *                it is deliberately NOT duplicated here.
 *  - EPISODIC    "what happened": one short record per notable trade, born with the trade's own date, forgotten fast.
 *  - SEMANTIC    "what tends to be true of this trader": beliefs with a status, confidence and evidence, forgotten slowly.
 *  - PROCEDURAL  "what works for this trader": measured associations between a routine and a better outcome.
 *
 * Lifecycle rules (all pure functions, no I/O, no model calls):
 *  - DEDUPLICATE  an observation with a known id updates that item instead of adding a copy.
 *  - SUPERSEDE    two opposite poles of one axis cannot both be live: the better-evidenced one wins, the other keeps its
 *                 evidence and is marked `superseded` (never deleted), the way a temporal knowledge graph invalidates an edge.
 *  - CONTRADICT   if the newer pole is weaker, the old belief becomes `contested` instead of being replaced.
 *  - DECAY        retention falls with time since the claim was last confirmed; repeated confirmation slows it.
 *  - CONSOLIDATE  episodes that already back a stable belief stop competing for attention once they age.
 *  - FORGET       items fall to `retired` (restorable). The trader can also reject a belief; it only returns on materially
 *                 new evidence. The Drive journal is never touched, so the underlying evidence always survives.
 */

export type MemoryKind = "episodic" | "semantic" | "procedural";
export type MemoryTopic = "execution" | "risk" | "emotion" | "strategy" | "timing" | "habit" | "preference" | "fact";
export type MemoryStatus = "hypothesis" | "supported" | "established" | "contested" | "superseded" | "retired";
export type MemoryOrigin = "journal" | "derived" | "chat" | "user";
export type Polarity = "risk" | "strength" | "neutral";

export interface EvidenceRef { entryId?: string; date: string; note?: string }

export interface MemorySnapshot {
  status: MemoryStatus; confidence: number; n: number; against: number; text: string; supersededBy?: string;
}
export interface MemoryEvent {
  at: number;
  op: "created" | "reinforced" | "weakened" | "revised" | "superseded" | "contested" | "retired" | "decayed" | "consolidated" | "restored" | "rejected";
  why: string;
  /** State before this event, so it can be undone. */
  prev?: MemorySnapshot;
}

export interface MemoryItem {
  id: string;
  kind: MemoryKind;
  topic: MemoryTopic;
  text: string;
  /** ≤ 48 chars, for headlines and collapsed rows. */
  short: string;
  /** `fact` = a recorded count; `inference` = an interpretation of those counts (always an association, never a cause). */
  stance: "fact" | "inference";
  polarity: Polarity;
  status: MemoryStatus;
  /** 0–1. For statistical beliefs: the posterior probability that the difference is real. */
  confidence: number;
  /** Supporting observations / against. */
  n: number;
  against: number;
  /** Mutually exclusive claims about the same thing share an axis and differ by pole. */
  axis?: string;
  pole?: string;
  evidence: EvidenceRef[];
  tags: string[];
  links: string[];
  origin: MemoryOrigin;
  pinned?: boolean;
  firstSeen: number;
  lastSeen: number;
  lastReinforced: number;
  supersededBy?: string;
  log: MemoryEvent[];
}

export interface MemoryGap { topic: string; have: number; need: number; note: string }

export interface MemoryStore {
  v: 1;
  items: Record<string, MemoryItem>;
  /** Beliefs the trader rejected → the evidence count at that moment. They only resurface on materially new evidence. */
  rejected: Record<string, { at: number; n: number }>;
  gaps: MemoryGap[];
  coverage: { trades: number; withProcess: number };
  cursor: { sig: string; day: string };
  updatedAt: number;
}

export const emptyMemory = (): MemoryStore => ({
  v: 1, items: {}, rejected: {}, gaps: [], coverage: { trades: 0, withProcess: 0 }, cursor: { sig: "", day: "" }, updatedAt: 0,
});

export interface Observation {
  id: string;
  kind: MemoryKind;
  topic: MemoryTopic;
  text: string;
  short: string;
  stance: "fact" | "inference";
  polarity: Polarity;
  /** The evidence level the engine claims for this observation. */
  level: "hypothesis" | "supported" | "established";
  confidence: number;
  n: number;
  against?: number;
  axis?: string;
  pole?: string;
  evidence: EvidenceRef[];
  tags?: string[];
  links?: string[];
  origin: MemoryOrigin;
  /** When the thing happened (episodes are born with the trade's own date). Defaults to now. */
  at?: number;
  /** Does seeing this again confirm it (reset the decay clock)? Re-emitted beliefs do; re-scanned episodes do not. */
  touch?: boolean;
  /** Add `n` to the running count (chat statements) instead of replacing it (recomputed statistics). */
  cumulative?: boolean;
  pinned?: boolean;
}

const DAY = 86_400_000;
export const HALF_LIFE_DAYS: Record<MemoryKind, number> = { episodic: 45, semantic: 180, procedural: 240 };
export const RETIRE_BELOW: Record<MemoryKind, number> = { episodic: 0.15, semantic: 0.08, procedural: 0.08 };
export const MAX_ACTIVE = 120;
export const MAX_RETIRED = 60;
const MAX_EVIDENCE = 5;
const MAX_LOG = 4;
const LEVEL: Record<string, number> = { hypothesis: 1, contested: 1, supported: 2, established: 3 };

export const isActive = (it: MemoryItem) => it.status === "hypothesis" || it.status === "supported" || it.status === "established" || it.status === "contested";

const snap = (it: MemoryItem): MemorySnapshot => ({ status: it.status, confidence: it.confidence, n: it.n, against: it.against, text: it.text, supersededBy: it.supersededBy });
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);

function withEvent(it: MemoryItem, ev: MemoryEvent): MemoryItem {
  return { ...it, log: [...it.log, ev].slice(-MAX_LOG) };
}

/** How much of a memory is still "live": halves every half-life; each confirmation lengthens the half-life. */
export function retention(it: MemoryItem, now: number): number {
  if (it.pinned) return 1;
  const days = Math.max(0, (now - it.lastReinforced) / DAY);
  const hl = HALF_LIFE_DAYS[it.kind] * (1 + 0.5 * Math.log2(1 + Math.min(it.n, 20)));
  return Math.pow(0.5, days / hl);
}

const tokens = (s: string) => new Set(s.toLowerCase().replace(/[^\p{L}\p{N}\s]+/gu, " ").split(/\s+/).filter((w) => w.length >= 3));
export function jaccard(a: string, b: string): number {
  const A = tokens(a), B = tokens(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

/* ------------------------------ observe ------------------------------ */

/**
 * Fold one observation into the store. Returns the same object if nothing changed.
 * Handles dedupe, resurfacing after a rejection, revival after decay, and axis conflicts (supersede / contest).
 */
export function observe(store: MemoryStore, obs: Observation, now: number): MemoryStore {
  const rej = store.rejected[obs.id];
  let rejected = store.rejected;
  if (rej) {
    // The trader said this was not accurate. Only materially new evidence brings it back.
    if (obs.n < Math.max(rej.n * 2, rej.n + 4)) return store;
    rejected = { ...rejected };
    delete rejected[obs.id];
  }

  let id = obs.id;
  let existing = store.items[id];
  if (!existing && (obs.origin === "chat" || obs.origin === "user")) {
    // Free-text memories dedupe by similarity instead of id.
    const twin = Object.values(store.items).find((x) => isActive(x) && x.kind === obs.kind && x.topic === obs.topic && jaccard(x.text, obs.text) >= 0.7);
    if (twin) { id = twin.id; existing = twin; }
  }

  const at = obs.at ?? now;
  const touch = obs.touch !== false;
  let item: MemoryItem;

  if (!existing) {
    item = {
      id, kind: obs.kind, topic: obs.topic, text: clip(obs.text, 280), short: clip(obs.short, 48), stance: obs.stance, polarity: obs.polarity,
      status: obs.level, confidence: round2(obs.confidence), n: obs.n, against: obs.against ?? 0, axis: obs.axis, pole: obs.pole,
      evidence: obs.evidence.slice(0, MAX_EVIDENCE), tags: obs.tags ?? [], links: obs.links ?? [], origin: obs.origin, pinned: obs.pinned,
      firstSeen: at, lastSeen: at, lastReinforced: at, log: [{ at: now, op: "created", why: "first observed" }],
    };
  } else {
    const before = snap(existing);
    // Anything the system retired or superseded may return when evidence does. A trader's rejection was handled above.
    const wasGone = existing.status === "retired" || existing.status === "superseded";
    const n = obs.cumulative ? existing.n + obs.n : obs.n;
    const status: MemoryStatus = wasGone || existing.status === "contested" ? obs.level : mergeLevel(existing.status, obs.level, obs.cumulative === true);
    const conf = obs.cumulative ? Math.min(0.97, Math.max(existing.confidence, obs.confidence)) : obs.confidence;
    const changed = status !== existing.status || Math.abs(conf - existing.confidence) >= 0.05 || n !== existing.n || wasGone || (obs.text !== existing.text && !obs.cumulative);
    item = {
      ...existing,
      text: obs.cumulative ? existing.text : clip(obs.text, 280),
      short: obs.cumulative ? existing.short : clip(obs.short, 48),
      status, confidence: round2(conf), n,
      against: obs.against ?? existing.against,
      evidence: mergeEvidence(obs.evidence, existing.evidence),
      tags: [...new Set([...existing.tags, ...(obs.tags ?? [])])].slice(0, 8),
      links: [...new Set([...existing.links, ...(obs.links ?? [])])].slice(0, 8),
      supersededBy: wasGone ? undefined : existing.supersededBy,
      lastSeen: Math.max(existing.lastSeen, at),
      lastReinforced: touch ? Math.max(existing.lastReinforced, now) : existing.lastReinforced,
      pinned: existing.pinned || obs.pinned,
    };
    if (changed) {
      const op = wasGone ? "restored" : conf < existing.confidence - 0.04 || LEVEL[status] < LEVEL[existing.status] ? "weakened" : conf > existing.confidence + 0.04 || n > existing.n ? "reinforced" : "revised";
      item = withEvent(item, { at: now, op, why: wasGone ? "evidence returned" : "re-evaluated against the journal", prev: before });
    }
  }

  let items: Record<string, MemoryItem> = { ...store.items, [item.id]: item };

  // Axis conflicts: one live pole per axis.
  if (item.axis && isActive(item)) {
    for (const other of Object.values(items)) {
      if (other.id === item.id || other.axis !== item.axis || other.pole === item.pole || !isActive(other)) continue;
      const stronger = LEVEL[item.status] > LEVEL[other.status] || (LEVEL[item.status] === LEVEL[other.status] && item.confidence >= other.confidence - 0.02);
      if (stronger) {
        items[other.id] = withEvent({ ...other, status: "superseded", supersededBy: item.id }, { at: now, op: "superseded", why: `newer evidence points the other way: “${item.short}”`, prev: snap(other) });
        items[item.id] = { ...items[item.id], links: [...new Set([...items[item.id].links, other.id])].slice(0, 8) };
      } else if (other.status !== "contested" && LEVEL[other.status] >= 2) {
        items[other.id] = withEvent({ ...other, status: "contested", against: other.against + 1 }, { at: now, op: "contested", why: `recent evidence leans the other way: “${item.short}”`, prev: snap(other) });
      }
    }
  }

  return { ...store, items, rejected };
}

function mergeLevel(prev: MemoryStatus, next: Observation["level"], cumulative: boolean): MemoryStatus {
  if (cumulative) return LEVEL[next] > (LEVEL[prev] ?? 1) ? next : (prev as MemoryStatus);
  return next; // recomputed statistics replace the previous verdict, up or down
}
function mergeEvidence(next: EvidenceRef[], prev: EvidenceRef[]): EvidenceRef[] {
  const seen = new Set<string>();
  const out: EvidenceRef[] = [];
  for (const e of [...next, ...prev]) {
    const key = e.entryId ?? `${e.date}:${e.note ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
    if (out.length >= MAX_EVIDENCE) break;
  }
  return out;
}
const round2 = (x: number) => Math.round(x * 100) / 100;

/* --------------------- reconcile what the data stopped saying --------------------- */

/**
 * After a full evaluation pass: any derived belief whose axis was TESTED with enough data this pass but was not
 * re-emitted is no longer supported by the journal. Strong beliefs become `contested`; weak ones are retired.
 */
export function reconcileAxes(store: MemoryStore, emitted: Set<string>, tested: Set<string>, now: number): MemoryStore {
  let items = store.items;
  let changed = false;
  for (const it of Object.values(store.items)) {
    if (!isActive(it) || it.origin !== "derived" || !it.axis || !tested.has(it.axis) || emitted.has(it.id) || it.pinned) continue;
    if (!changed) { items = { ...items }; changed = true; }
    if (it.status === "hypothesis" || it.status === "contested") {
      items[it.id] = withEvent({ ...it, status: "retired", against: it.against + 1 }, { at: now, op: "retired", why: "the journal no longer supports this", prev: snap(it) });
    } else {
      items[it.id] = withEvent({ ...it, status: "contested", against: it.against + 1 }, { at: now, op: "contested", why: "recent trades no longer show this clearly", prev: snap(it) });
    }
  }
  return changed ? { ...store, items } : store;
}

/* ------------------------------ forgetting ------------------------------ */

/** Retire memories whose retention has fallen below their tier's floor. Never touches pinned or user-stated items. */
export function decayPass(store: MemoryStore, now: number): MemoryStore {
  let items = store.items;
  let changed = false;
  for (const it of Object.values(store.items)) {
    if (!isActive(it) || it.pinned || it.origin === "user") continue;
    if (retention(it, now) >= RETIRE_BELOW[it.kind]) continue;
    if (!changed) { items = { ...items }; changed = true; }
    items[it.id] = withEvent({ ...it, status: "retired" }, { at: now, op: "decayed", why: "not confirmed for a long time", prev: snap(it) });
  }
  return changed ? { ...store, items } : store;
}

/**
 * Episodes that already back a live belief stop taking space once they are three weeks old. They are retired, linked to the
 * belief, and remain restorable; the belief keeps the evidence references.
 */
export function consolidate(store: MemoryStore, now: number): MemoryStore {
  const backed = new Map<string, string>();
  for (const it of Object.values(store.items)) {
    if (it.kind === "episodic" || !isActive(it) || (it.status !== "supported" && it.status !== "established")) continue;
    for (const ev of it.evidence) if (ev.entryId) backed.set(ev.entryId, it.id);
  }
  let items = store.items;
  let changed = false;
  for (const it of Object.values(store.items)) {
    if (it.kind !== "episodic" || !isActive(it) || it.pinned) continue;
    const entryId = it.evidence[0]?.entryId;
    const owner = entryId ? backed.get(entryId) : undefined;
    if (!owner || now - it.firstSeen < 21 * DAY) continue;
    if (!changed) { items = { ...items }; changed = true; }
    items[it.id] = withEvent({ ...it, status: "retired", links: [...new Set([...it.links, owner])] }, { at: now, op: "consolidated", why: "folded into a longer-term belief", prev: snap(it) });
  }
  return changed ? { ...store, items } : store;
}

/** Keep the store bounded: retire the least valuable live items, then drop the oldest retired ones. */
export function compact(store: MemoryStore, now: number): MemoryStore {
  const all = Object.values(store.items);
  const active = all.filter(isActive);
  const retired = all.filter((x) => !isActive(x));
  if (active.length <= MAX_ACTIVE && retired.length <= MAX_RETIRED) return store;
  let items = { ...store.items };
  if (active.length > MAX_ACTIVE) {
    const worst = active.filter((x) => !x.pinned && x.origin !== "user")
      .sort((a, b) => retention(a, now) * (0.4 + a.confidence) - retention(b, now) * (0.4 + b.confidence))
      .slice(0, active.length - MAX_ACTIVE);
    for (const it of worst) items[it.id] = withEvent({ ...it, status: "retired" }, { at: now, op: "retired", why: "memory is full; least useful goes first", prev: snap(it) });
  }
  const nowRetired = Object.values(items).filter((x) => !isActive(x) && !x.pinned && x.origin !== "user").sort((a, b) => a.lastSeen - b.lastSeen);
  const overflow = Object.values(items).filter((x) => !isActive(x)).length - MAX_RETIRED;
  for (const it of nowRetired.slice(0, Math.max(0, overflow))) delete items[it.id];
  return { ...store, items };
}

/* ----------------------- trader-facing, reversible actions ----------------------- */

/** "That's not accurate." The belief is retired and only resurfaces on materially new evidence. */
export function rejectMemory(store: MemoryStore, id: string, now: number): MemoryStore {
  const it = store.items[id];
  if (!it) return store;
  return {
    ...store,
    items: { ...store.items, [id]: withEvent({ ...it, status: "retired", pinned: false }, { at: now, op: "rejected", why: "trader said this is not accurate", prev: snap(it) }) },
    rejected: { ...store.rejected, [id]: { at: now, n: it.n } },
  };
}

/** Bring back anything retired, superseded or rejected. */
export function restoreMemory(store: MemoryStore, id: string, now: number): MemoryStore {
  const it = store.items[id];
  if (!it || isActive(it)) return store;
  const lastLive = [...it.log].reverse().find((e) => e.prev && e.prev.status !== "retired" && e.prev.status !== "superseded")?.prev;
  const rejected = { ...store.rejected };
  delete rejected[id];
  return {
    ...store,
    rejected,
    items: {
      ...store.items,
      [id]: withEvent({ ...it, status: lastLive?.status ?? "hypothesis", supersededBy: undefined, lastReinforced: now }, { at: now, op: "restored", why: "restored by the trader", prev: snap(it) }),
    },
  };
}

/**
 * "Clear what Minato remembers": everything is removed except what the trader stated themselves is also removed.
 * The ids are remembered as rejected, so a belief only returns if the journal later shows materially more evidence for it.
 */
export function clearMemory(store: MemoryStore, now: number): MemoryStore {
  const rejected = { ...store.rejected };
  for (const it of Object.values(store.items)) if (it.origin !== "user") rejected[it.id] = { at: now, n: it.n };
  return { ...store, items: {}, rejected, gaps: [], updatedAt: now };
}

export function pinMemory(store: MemoryStore, id: string, pinned: boolean): MemoryStore {
  const it = store.items[id];
  if (!it || !!it.pinned === pinned) return store;
  return { ...store, items: { ...store.items, [id]: { ...it, pinned } } };
}

/** Undo the most recent change to one item (best-effort: restores the stored previous snapshot). */
export function undoLast(store: MemoryStore, id: string): MemoryStore {
  const it = store.items[id];
  const last = it?.log[it.log.length - 1];
  if (!it || !last?.prev) return store;
  const { supersededBy, ...rest } = it;
  return { ...store, items: { ...store.items, [id]: { ...rest, ...last.prev, supersededBy: last.prev.supersededBy, log: it.log.slice(0, -1) } } };
}

/* -------------------------------- queries -------------------------------- */

export const activeItems = (s: MemoryStore | undefined | null): MemoryItem[] => (s ? Object.values(s.items).filter(isActive) : []);
export const inactiveItems = (s: MemoryStore | undefined | null): MemoryItem[] =>
  (s ? Object.values(s.items).filter((x) => !isActive(x)).sort((a, b) => b.lastSeen - a.lastSeen) : []);

export const CONFIDENCE_LABEL: Record<string, string> = {
  hypothesis: "Possible", supported: "Likely", established: "Established", contested: "Mixed signals", superseded: "Replaced", retired: "Forgotten",
};
