/* ------------------------------------------------------------------ */
/*  Friends state — pure, framework-free.                              */
/*                                                                      */
/*  The UI never edits the server's list directly. It keeps:           */
/*    1. the last SNAPSHOT the server returned, and                    */
/*    2. a list of OPTIMISTIC OPS the user has performed since.        */
/*  What you see is `deriveView(snapshot + ops)`.                      */
/*                                                                      */
/*  An op is dropped when its request fails (instant rollback) or when */
/*  a snapshot arrives that was FETCHED AFTER the op settled — so a    */
/*  slow poll that started before your click can never undo it.        */
/*                                                                      */
/*  No imports from the app: this file is unit-tested with plain node. */
/* ------------------------------------------------------------------ */

export interface Metrics {
  handle: string;
  displayName: string;
  trades: number;
  totalPnl: number;
  returnPct: number;
  winRate: number | null;
  processScore: number;
  challengeProgressPct?: number | null;
  edgePoints: number;
}

export interface ServerFriend extends Metrics {
  id: string;
}

export interface ServerRequest {
  id: string;
  handle?: string;
  displayName?: string;
}

export interface Snapshot {
  friends: ServerFriend[];
  incoming: ServerRequest[];
  outgoing: ServerRequest[];
}

export const EMPTY_SNAPSHOT: Snapshot = { friends: [], incoming: [], outgoing: [] };

/* ---------- Identity helpers ---------- */

/** Mirrors the server's handle rule (api/profile/handle). */
export const HANDLE_RE = /^[a-z0-9_]{3,24}$/;

export const normalizeHandle = (raw: string): string => raw.trim().replace(/^@+/, "").toLowerCase();

const lc = (s?: string) => (s ?? "").toLowerCase();

/**
 * The friends API falls back to the other person's EMAIL when an account has
 * no name. Never put that on screen — use their Connection ID instead.
 */
export function cleanName(name: string | undefined, handle?: string): string {
  const n = (name ?? "").trim();
  if (!n || n.includes("@")) return handle || "Trader";
  return n;
}

/* ---------- Optimistic ops ---------- */

export type Op =
  | { key: string; kind: "send"; handle: string; displayName: string; tmpId: string; settledAt?: number }
  | { key: string; kind: "cancel" | "decline" | "remove"; id: string; settledAt?: number }
  | { key: string; kind: "accept"; id: string; handle: string; displayName: string; settledAt?: number };

export type LoadError = "signed_out" | "network" | "server";

export interface FriendsState {
  snapshot: Snapshot | null;
  /** Logical clock value of the newest snapshot applied (ignores older, out-of-order ones). */
  appliedAt: number;
  ops: Op[];
  load: "loading" | "ready" | "error";
  loadError: LoadError | null;
  /** A background refresh failed while we still have data to show. */
  refreshFailed: boolean;
}

export const initialState: FriendsState = {
  snapshot: null,
  appliedAt: 0,
  ops: [],
  load: "loading",
  loadError: null,
  refreshFailed: false,
};

export type Action =
  | { type: "op/start"; op: Op }
  | { type: "op/settle"; key: string; at: number }
  | { type: "op/fail"; key: string }
  | { type: "snapshot"; data: Snapshot; startedAt: number }
  | { type: "load/fail"; reason: LoadError }
  | { type: "load/retry" };

export function reducer(state: FriendsState, action: Action): FriendsState {
  switch (action.type) {
    case "op/start":
      return { ...state, ops: [...state.ops, action.op] };

    case "op/settle":
      return { ...state, ops: state.ops.map((o) => (o.key === action.key ? { ...o, settledAt: action.at } : o)) };

    case "op/fail":
      return { ...state, ops: state.ops.filter((o) => o.key !== action.key) };

    case "snapshot": {
      if (action.startedAt <= state.appliedAt) return state; // out-of-order response
      return {
        ...state,
        snapshot: action.data,
        appliedAt: action.startedAt,
        // Settled before this fetch began → the server has already seen it.
        ops: state.ops.filter((o) => !(o.settledAt !== undefined && o.settledAt < action.startedAt)),
        load: "ready",
        loadError: null,
        refreshFailed: false,
      };
    }

    case "load/fail":
      if (state.snapshot) return { ...state, refreshFailed: true };
      return { ...state, load: "error", loadError: action.reason };

    case "load/retry":
      return state.snapshot ? { ...state, refreshFailed: false } : { ...state, load: "loading", loadError: null };
  }
}

/* ---------- View model ---------- */

export interface FriendItem {
  id: string;
  /** Stable React key — the handle survives optimistic → server id swaps. */
  key: string;
  handle: string;
  displayName: string;
  /** null while the server hasn't returned stats yet (just accepted). */
  metrics: Metrics | null;
  syncing: boolean;
}

export interface RequestItem {
  id: string;
  key: string;
  handle: string;
  displayName: string;
  /** Not yet confirmed by the server list (id may be temporary). */
  syncing: boolean;
  /** The POST itself is still in flight. */
  sending: boolean;
}

export interface FriendsView {
  friends: FriendItem[];
  incoming: RequestItem[];
  outgoing: RequestItem[];
}

export function deriveView(state: FriendsState): FriendsView {
  const base = state.snapshot ?? EMPTY_SNAPSHOT;
  const hides = (kinds: Op["kind"][], id: string) =>
    state.ops.some((o) => kinds.includes(o.kind) && "id" in o && o.id === id);

  const toRequest = (r: ServerRequest): RequestItem => ({
    id: r.id,
    key: lc(r.handle) || r.id,
    handle: r.handle ?? "",
    displayName: cleanName(r.displayName, r.handle),
    syncing: false,
    sending: false,
  });

  const friends: FriendItem[] = base.friends
    .filter((f) => !hides(["remove"], f.id))
    .map((f) => ({
      id: f.id,
      key: lc(f.handle) || f.id,
      handle: f.handle,
      displayName: cleanName(f.displayName, f.handle),
      metrics: f,
      syncing: false,
    }));
  const incoming = base.incoming.filter((r) => !hides(["accept", "decline"], r.id)).map(toRequest);
  const outgoing = base.outgoing.filter((r) => !hides(["cancel"], r.id)).map(toRequest);

  // Overlay ops add rows only if the server list doesn't already show that person.
  const known = new Set([...friends, ...incoming, ...outgoing].map((x) => lc(x.handle)).filter(Boolean));
  for (const op of state.ops) {
    if (op.kind === "send" && !known.has(lc(op.handle))) {
      known.add(lc(op.handle));
      outgoing.unshift({
        id: op.tmpId,
        key: lc(op.handle),
        handle: op.handle,
        displayName: cleanName(op.displayName, op.handle),
        syncing: true,
        sending: op.settledAt === undefined,
      });
    } else if (op.kind === "accept" && !known.has(lc(op.handle))) {
      known.add(lc(op.handle));
      friends.push({
        id: op.id,
        key: lc(op.handle),
        handle: op.handle,
        displayName: cleanName(op.displayName, op.handle),
        metrics: null,
        syncing: true,
      });
    }
  }
  return { friends, incoming, outgoing };
}

export type Relation = "friend" | "incoming" | "outgoing" | "none";

/** How the viewer is already connected to a handle (used to avoid pointless 409s). */
export function relationFor(view: FriendsView, handle: string): { relation: Relation; displayName?: string; id?: string } {
  const h = lc(handle);
  const f = view.friends.find((x) => lc(x.handle) === h);
  if (f) return { relation: "friend", displayName: f.displayName, id: f.id };
  const i = view.incoming.find((x) => lc(x.handle) === h);
  if (i) return { relation: "incoming", displayName: i.displayName, id: i.id };
  const o = view.outgoing.find((x) => lc(x.handle) === h);
  if (o) return { relation: "outgoing", displayName: o.displayName, id: o.id };
  return { relation: "none" };
}

/* ---------- Sorting ---------- */

export type SortMode = "process" | "points" | "win";

export function sortFriends(list: FriendItem[], mode: SortMode): FriendItem[] {
  const value = (f: FriendItem): number => {
    const m = f.metrics;
    if (!m) return Number.NEGATIVE_INFINITY;
    if (mode === "process") return m.processScore;
    if (mode === "points") return m.edgePoints;
    return m.winRate ?? -1;
  };
  return [...list].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va !== vb) return vb > va ? 1 : -1;
    return a.displayName.localeCompare(b.displayName);
  });
}

/* ---------- Snapshot parsing ---------- */

const asArray = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Defensive: the response crosses a network boundary. */
export function parseSnapshot(raw: unknown): Snapshot {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const friends = asArray<ServerFriend>(d.friends).filter((f) => f && typeof f.id === "string" && typeof f.handle === "string");
  const keepReq = (r: ServerRequest) => r && typeof r.id === "string";
  return {
    friends,
    incoming: asArray<ServerRequest>(d.pendingIncoming).filter(keepReq),
    outgoing: asArray<ServerRequest>(d.pendingOutgoing).filter(keepReq),
  };
}

/* ---------- Error copy ---------- */

export function errorCopy(code: string): { title: string; detail: string } {
  switch (code) {
    case "already_pending_or_friends":
      return { title: "Already connected", detail: "You're friends, or a request is already pending." };
    case "not_found":
      return { title: "No trader found", detail: "Check the Connection ID and try again." };
    case "self":
      return { title: "That's your own ID", detail: "Share it with a friend instead." };
    case "rate_limited":
      return { title: "Too many requests", detail: "Wait a minute, then try again." };
    case "not_logged_in":
      return { title: "Session expired", detail: "Sign in again to continue." };
    case "not_permitted":
      return { title: "That request changed", detail: "Your list is refreshing." };
    case "network":
      return { title: "You're offline", detail: "Check your connection and try again." };
    default:
      return { title: "Something went wrong", detail: "Try again in a moment." };
  }
}

/* ---------- Head to head ---------- */

export interface VersusRow {
  key: "process" | "points" | "win" | "return" | "trades";
  label: string;
  you: number | null;
  them: number | null;
  /** Unit suffix for display. */
  unit: "" | "%" ;
  /** Who leads. `null` = informational row, not scored. */
  lead: "you" | "them" | "tie" | null;
}

export interface Versus {
  rows: VersusRow[];
  yourLeads: number;
  theirLeads: number;
  scored: number;
}

/** Process, Edge Points, win rate and return decide the lead; trade count is shown but never scored. */
export function compareMetrics(me: Metrics, them: Metrics): Versus {
  const decide = (a: number | null, b: number | null): "you" | "them" | "tie" => {
    if (a == null || b == null || a === b) return "tie";
    return a > b ? "you" : "them";
  };
  const rows: VersusRow[] = [
    { key: "process", label: "Process score", you: me.processScore, them: them.processScore, unit: "", lead: decide(me.processScore, them.processScore) },
    { key: "points", label: "Edge Points", you: me.edgePoints, them: them.edgePoints, unit: "", lead: decide(me.edgePoints, them.edgePoints) },
    { key: "win", label: "Win rate", you: me.winRate, them: them.winRate, unit: "%", lead: decide(me.winRate, them.winRate) },
    { key: "return", label: "Return", you: me.returnPct, them: them.returnPct, unit: "%", lead: decide(me.returnPct, them.returnPct) },
    { key: "trades", label: "Trading days", you: me.trades, them: them.trades, unit: "", lead: null },
  ];
  const scoredRows = rows.filter((r) => r.lead !== null);
  return {
    rows,
    yourLeads: scoredRows.filter((r) => r.lead === "you").length,
    theirLeads: scoredRows.filter((r) => r.lead === "them").length,
    scored: scoredRows.length,
  };
}
