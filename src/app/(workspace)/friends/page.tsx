"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { EASE } from "@/components/landing/reveal";
import { Button } from "@/components/ui/button";
import { TextInput } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { TrophyIcon } from "@/components/ui/icons";

interface Metrics {
  handle: string;
  displayName: string;
  trades: number;
  totalPnl: number;
  returnPct: number;
  winRate: number | null;
  processScore: number;
  edgePoints: number;
}

interface FriendRow extends Metrics {
  id: string;
}

/**
 * Friends — add by @handle, requests, head-to-head competition.
 * Only competition-safe aggregate metrics are shared. Virtual Edge
 * Points only — no money, no wagering.
 */
export default function FriendsPage() {
  const [friends, setFriends] = useState<FriendRow[] | null>(null);
  const [pending, setPending] = useState<{ id: string; handle?: string; displayName?: string }[]>([]);
  const [outgoing, setOutgoing] = useState<{ id: string; handle?: string; displayName?: string }[]>([]);
  const [myHandle, setMyHandle] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchResult, setSearchResult] = useState<{ handle: string; displayName: string } | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [headToHead, setHeadToHead] = useState<{ handle: string; me: Metrics; them: Metrics } | null>(null);

  const refresh = useCallback(() => {
    void Promise.all([
      fetch("/api/friends", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch("/api/profile/handle", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([d, p]) => {
      if (d) {
        setFriends(d.friends ?? []);
        setPending(d.pendingIncoming ?? []);
        setOutgoing(d.pendingOutgoing ?? []);
      } else {
        setFriends([]);
      }
      if (p?.handle) setMyHandle(p.handle as string);
    });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const doSearch = async () => {
    setSearchError(null);
    setSearchResult(null);
    if (!search.trim().startsWith("@")) {
      setSearchError("Handles start with @ — e.g. @trader_001");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/friends?search=${encodeURIComponent(search.trim())}`, { cache: "no-store" });
      const d = (await res.json()) as { results?: { handle: string; displayName: string }[] };
      if (d.results && d.results.length > 0) setSearchResult(d.results[0]);
      else setSearchError("No trader found with that handle.");
    } finally {
      setBusy(false);
    }
  };

  const act = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch("/api/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        toast.error(
          d.error === "already_pending_or_friends" ? "Already connected or requested"
          : d.error === "not_found" ? "No trader found with that handle"
          : "That didn't work — try again.",
        );
      } else if (body.action === "respond" && body.status === "accepted") {
        toast.success("Friend added");
      }
      refresh();
      setHeadToHead(null);
    } finally {
      setBusy(false);
    }
  };

  const openCompetition = async (handle: string) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/friends/competition?handle=${encodeURIComponent(handle)}`, { cache: "no-store" });
      if (res.ok) {
        const d = (await res.json()) as { me: Metrics; them: Metrics };
        setHeadToHead({ handle, me: d.me, them: d.them });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="font-display text-[26px] font-semibold tracking-[-0.02em] text-ink sm:text-3xl sm:font-semibold"
        >
          Friends
        </motion.h1>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Compete on process, not profit alone. Friends see only competition-safe aggregate
          metrics — never journals, notes or screenshots.
        </p>
      </header>

      {/* Add friend */}
      <div className="panel p-5">
        <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-faint">Add friend by handle</p>
        {myHandle && (
          <p className="mt-1 text-xs text-muted">
            Your Connection ID:{" "}
            <span className="rounded-md border border-line bg-raised px-1.5 py-0.5 font-mono text-[12px] font-semibold text-ink">@{myHandle}</span>{" "}
            <button
              onClick={() => void navigator.clipboard.writeText(`@${myHandle}`).then(() => toast.success("Copied", "Share it so friends can find you."))}
              className="font-medium text-gold underline-offset-2 hover:underline"
            >
              copy
            </button>
          </p>
        )}
        <div className="mt-2.5 flex gap-2.5">
          <TextInput
            aria-label="Friend handle"
            placeholder="@trader_001"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void doSearch()}
          />
          <Button variant="outline" onClick={() => void doSearch()} disabled={busy || !search.trim()}>
            Search
          </Button>
        </div>
        {searchError && <p className="mt-2 text-xs text-loss">{searchError}</p>}
        {searchResult && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-gold/30 bg-gold/[0.05] px-4 py-3">
            <p className="text-sm text-ink">
              <span className="font-semibold">{searchResult.displayName}</span>{" "}
              <span className="text-muted">{searchResult.handle}</span>
            </p>
            <Button
              variant="gold"
              size="sm"
              disabled={busy}
              onClick={() => void act({ action: "request", handle: searchResult.handle }).then(() => {
                setSearchResult(null);
                setSearch("");
                toast.success("Request sent", "Waiting for them to accept.");
              })}
            >
              Send request
            </Button>
          </div>
        )}
      </div>

      {/* Outgoing requests */}
      {outgoing.length > 0 && (
        <div className="panel p-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-faint">Sent — waiting for a response</p>
          <ul className="mt-2.5 space-y-2">
            {outgoing.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-line bg-raised/60 px-4 py-3">
                <span className="text-sm text-ink">
                  <span className="font-semibold">{p.displayName}</span> <span className="text-muted">{p.handle}</span>
                </span>
                <Button variant="subtle" size="sm" disabled={busy} onClick={() => void act({ action: "remove", recordId: p.id })}>
                  Cancel
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Pending incoming */}
      {pending.length > 0 && (
        <div className="panel p-5">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-faint">Requests</p>
          <ul className="mt-2.5 space-y-2">
            {pending.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-gold/30 bg-gold/[0.05] px-4 py-3">
                <span className="text-sm text-ink">
                  <span className="font-semibold">{p.displayName}</span> <span className="text-muted">{p.handle}</span> wants to compete
                </span>
                <span className="flex gap-2">
                  <Button variant="gold" size="sm" disabled={busy} onClick={() => void act({ action: "respond", recordId: p.id, status: "accepted" })}>
                    Accept
                  </Button>
                  <Button variant="subtle" size="sm" disabled={busy} onClick={() => void act({ action: "respond", recordId: p.id, status: "declined" })}>
                    Decline
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Friends list */}
      {friends === null ? (
        <p className="text-sm text-faint">Loading…</p>
      ) : friends.length === 0 ? (
        <EmptyState
          icon={<TrophyIcon className="h-7 w-7" />}
          title="No friends added yet"
          body="Add friends by their @handle to compare process scores, challenge progress and Edge Points."
        />
      ) : (
        <div className="space-y-3">
          {friends.map((f, i) => (
            <motion.div
              key={f.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.04, ease: EASE }}
              className="panel p-5"
            >
              {headToHead?.handle === f.handle ? (
                <HeadToHead me={headToHead.me} them={headToHead.them} onBack={() => setHeadToHead(null)} />
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-full border border-gold/30 bg-gold/[0.08] text-sm font-bold text-gold">
                      {f.displayName.slice(0, 1).toUpperCase()}
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-ink">{f.displayName} <span className="text-xs font-normal text-faint">{f.handle}</span></p>
                      <p className="num text-xs text-muted">
                        {f.trades} trades · {f.winRate != null ? `${f.winRate}% win` : "—"} · {f.edgePoints} EP
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => void openCompetition(f.handle)}>
                      Head-to-head
                    </Button>
                    <Button variant="subtle" size="sm" disabled={busy} onClick={() => void act({ action: "remove", recordId: f.id })}>
                      Remove
                    </Button>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

function HeadToHead({ me, them, onBack }: { me: Metrics; them: Metrics; onBack: () => void }) {
  const rows: [string, number | string, number | string, boolean][] = [
    ["P&L", `$${me.totalPnl.toLocaleString()}`, `$${them.totalPnl.toLocaleString()}`, me.totalPnl >= them.totalPnl],
    ["Return %", `${me.returnPct}%`, `${them.returnPct}%`, me.returnPct >= them.returnPct],
    ["Win rate", me.winRate != null ? `${me.winRate}%` : "—", them.winRate != null ? `${them.winRate}%` : "—", (me.winRate ?? 0) >= (them.winRate ?? 0)],
    ["Process score", `${me.processScore}`, `${them.processScore}`, me.processScore >= them.processScore],
    ["Edge Points", `${me.edgePoints}`, `${them.edgePoints}`, me.edgePoints >= them.edgePoints],
  ];
  const iWin = me.processScore + me.edgePoints * 0.1 >= them.processScore + them.edgePoints * 0.1;
  return (
    <div>
      <div className="grid grid-cols-3 items-center gap-2 border-b border-line pb-3 text-center">
        <p className="font-display text-lg font-bold text-gold">YOU</p>
        <p className="text-xs font-medium uppercase tracking-widest text-faint">vs</p>
        <p className="font-display text-lg font-bold text-info">{them.displayName}</p>
      </div>
      <dl className="mt-3 space-y-2">
        {rows.map(([label, mine, theirs, lead]) => (
          <div key={label} className="grid grid-cols-3 items-center gap-2 text-[13px]">
            <span className={cn("num text-right font-semibold", lead ? "text-profit" : "text-muted")}>{mine}</span>
            <span className="text-center text-[10px] font-medium uppercase tracking-wider text-faint">{label}</span>
            <span className={cn("num font-semibold", !lead ? "text-profit" : "text-muted")}>{theirs}</span>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-center text-xs text-faint">
        {iWin ? "You're ahead on process + points. Keep the checklist honest." : "Behind on process — the fastest fix is completing every trade review."}
      </p>
      <div className="mt-3 flex justify-center">
        <Button variant="subtle" size="sm" onClick={onBack}>Back</Button>
      </div>
    </div>
  );
}
