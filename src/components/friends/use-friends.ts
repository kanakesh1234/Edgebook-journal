"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { toast } from "@/components/ui/toast";
import { haptic } from "@/lib/haptics";
import {
  cleanName,
  deriveView,
  errorCopy,
  initialState,
  parseSnapshot,
  reducer,
  type FriendItem,
  type Op,
  type RequestItem,
  type Snapshot,
} from "./friends-state";

/**
 * How often to re-check for requests other people sent you.
 * The list endpoint also computes every friend's stats, so this is deliberately
 * unhurried; focus / reconnect / your own actions refresh immediately.
 */
export const POLL_MS = 20_000;
const REFOCUS_MIN_MS = 4_000;
const CHANNEL = "edgebook:friends";

export type MutationResult = { ok: true } | { ok: false; error: string };

async function post(body: Record<string, unknown>): Promise<MutationResult> {
  let res: Response;
  try {
    res = await fetch("/api/friends", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, error: "network" };
  }
  if (res.ok) return { ok: true };
  const d = (await res.json().catch(() => ({}))) as { error?: unknown };
  const code =
    typeof d.error === "string" ? d.error : res.status === 429 ? "rate_limited" : res.status === 401 ? "not_logged_in" : "unknown";
  return { ok: false, error: code };
}

export interface MyHandle {
  status: "loading" | "ready" | "error";
  handle: string | null;
}

/**
 * Everything the Friends screen needs, as one reactive source of truth.
 *
 *  - Mutations update the screen on the same frame (optimistic), then reconcile.
 *  - A background poll, tab focus, reconnect, and other open tabs all feed the same state.
 *  - Failures roll back and explain themselves.
 */
export function useFriends() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [me, setMe] = useState<MyHandle>({ status: "loading", handle: null });

  // Logical clock shared by "fetch started" and "op settled" — see friends-state.ts.
  const clock = useRef(0);
  const opSeq = useRef(0);
  const inflight = useRef(false);
  const queued = useRef(false);
  const alive = useRef(true);
  const lastFetchEnd = useRef(0);
  const seenIncoming = useRef<Set<string> | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);

  const announceArrivals = useCallback((data: Snapshot) => {
    const prev = seenIncoming.current;
    seenIncoming.current = new Set(data.incoming.map((r) => r.id));
    if (!prev) return; // first load: nothing is "new"
    const fresh = data.incoming.filter((r) => !prev.has(r.id));
    if (fresh.length === 0) return;
    haptic.selection();
    if (fresh.length === 1) {
      toast.info("New friend request", `${cleanName(fresh[0].displayName, fresh[0].handle)} wants to compete.`);
    } else {
      toast.info(`${fresh.length} new friend requests`, "Review them under Requests.");
    }
  }, []);

  const fetchSnapshot = useCallback(async (): Promise<void> => {
    // One fetch at a time; a request made meanwhile re-runs right after, so it
    // always starts AFTER whatever triggered it.
    if (inflight.current) {
      queued.current = true;
      return;
    }
    inflight.current = true;
    const startedAt = ++clock.current;
    try {
      const res = await fetch("/api/friends", { cache: "no-store" });
      if (!alive.current) return;
      if (res.status === 401) {
        dispatch({ type: "load/fail", reason: "signed_out" });
      } else if (!res.ok) {
        dispatch({ type: "load/fail", reason: "server" });
      } else {
        const data = parseSnapshot(await res.json());
        if (!alive.current) return;
        dispatch({ type: "snapshot", data, startedAt });
        announceArrivals(data);
      }
    } catch {
      if (alive.current) dispatch({ type: "load/fail", reason: "network" });
    } finally {
      inflight.current = false;
      lastFetchEnd.current = Date.now();
      if (queued.current && alive.current) {
        queued.current = false;
        void fetchSnapshot();
      }
    }
  }, [announceArrivals]);

  /* ---------- Live updates: initial load, poll, focus, reconnect, other tabs ---------- */
  useEffect(() => {
    alive.current = true;
    void fetchSnapshot();

    const visible = () => document.visibilityState === "visible";
    const poll = window.setInterval(() => {
      if (visible()) void fetchSnapshot();
    }, POLL_MS);
    const wake = () => {
      if (visible() && Date.now() - lastFetchEnd.current > REFOCUS_MIN_MS) void fetchSnapshot();
    };
    const reconnect = () => void fetchSnapshot();

    window.addEventListener("focus", wake);
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", reconnect);

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(CHANNEL);
      bc.onmessage = () => void fetchSnapshot();
      channel.current = bc;
    } catch {
      /* BroadcastChannel unsupported — polling still covers it */
    }

    return () => {
      alive.current = false;
      window.clearInterval(poll);
      window.removeEventListener("focus", wake);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", reconnect);
      bc?.close();
      channel.current = null;
    };
  }, [fetchSnapshot]);

  /* ---------- Your own Connection ID ---------- */
  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile/handle", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("handle"))))
      .then((d: { handle?: unknown }) => {
        if (!cancelled) setMe({ status: "ready", handle: typeof d.handle === "string" && d.handle ? d.handle : null });
      })
      .catch(() => {
        if (!cancelled) setMe({ status: "error", handle: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------- Mutations ---------- */

  /** Show the change now, tell the server, then either reconcile or roll back. */
  const runOp = useCallback(
    async (op: Op, body: Record<string, unknown>): Promise<MutationResult> => {
      dispatch({ type: "op/start", op });
      const result = await post(body);
      if (result.ok) {
        dispatch({ type: "op/settle", key: op.key, at: ++clock.current });
        try {
          channel.current?.postMessage("changed");
        } catch {
          /* channel closed */
        }
        void fetchSnapshot();
      } else {
        dispatch({ type: "op/fail", key: op.key });
        const copy = errorCopy(result.error);
        toast.error(copy.title, copy.detail);
        haptic.error();
        // The screen was wrong about the server — find out how.
        if (result.error === "already_pending_or_friends" || result.error === "not_permitted") void fetchSnapshot();
      }
      return result;
    },
    [fetchSnapshot],
  );

  const nextKey = () => `op${++opSeq.current}`;

  const send = useCallback(
    async (person: { handle: string; displayName: string }) => {
      const key = nextKey();
      const result = await runOp(
        { key, kind: "send", handle: person.handle, displayName: person.displayName, tmpId: `tmp-${key}` },
        { action: "request", handle: person.handle },
      );
      if (result.ok) {
        haptic.success();
        toast.success("Request sent", `Waiting for ${person.displayName} to accept.`);
      }
      return result;
    },
    [runOp],
  );

  const accept = useCallback(
    async (item: RequestItem) => {
      const result = await runOp(
        { key: nextKey(), kind: "accept", id: item.id, handle: item.handle, displayName: item.displayName },
        { action: "respond", recordId: item.id, status: "accepted" },
      );
      if (result.ok) {
        haptic.success();
        toast.success("Friend added", `You and ${item.displayName} can now compare.`);
      }
      return result;
    },
    [runOp],
  );

  const decline = useCallback(
    (item: RequestItem) =>
      runOp({ key: nextKey(), kind: "decline", id: item.id }, { action: "respond", recordId: item.id, status: "declined" }),
    [runOp],
  );

  const cancel = useCallback(
    async (item: RequestItem): Promise<MutationResult> => {
      // A just-sent request has a temporary id until the server list confirms it.
      if (item.syncing) return { ok: false, error: "unknown" };
      return runOp({ key: nextKey(), kind: "cancel", id: item.id }, { action: "remove", recordId: item.id });
    },
    [runOp],
  );

  const remove = useCallback(
    async (friend: FriendItem) => {
      if (friend.syncing) return { ok: false, error: "unknown" } as const;
      const result = await runOp({ key: nextKey(), kind: "remove", id: friend.id }, { action: "remove", recordId: friend.id });
      if (result.ok) toast.info("Friend removed", `${friend.displayName} no longer sees your stats.`);
      return result;
    },
    [runOp],
  );

  const retry = useCallback(() => {
    dispatch({ type: "load/retry" });
    void fetchSnapshot();
  }, [fetchSnapshot]);

  const view = useMemo(() => deriveView(state), [state]);

  return {
    view,
    load: state.load,
    loadError: state.loadError,
    refreshFailed: state.refreshFailed,
    me,
    send,
    accept,
    decline,
    cancel,
    remove,
    retry,
  };
}

export type FriendsApi = ReturnType<typeof useFriends>;
