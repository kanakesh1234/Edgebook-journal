"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { EASE } from "@/components/landing/reveal";
import { EmptyState } from "@/components/ui/misc";
import { TrophyIcon } from "@/components/ui/icons";

interface RankingRow {
  handle: string;
  isViewer: boolean;
  trades: number;
  winRate: number | null;
  profitFactor: number | null;
  expectancy: number | null;
  consistency: number | null;
  totalPnl: number;
  score: number;
}

/**
 * Ranking — process-weighted leaderboard.
 * Consistency 40% · win rate 30% · profit factor + expectancy 30%.
 * Only intentionally-public aggregate metrics are shown.
 */
export default function RankingPage() {
  const [tab, setTab] = useState<"global" | "friends">("global");
  const [rows, setRows] = useState<RankingRow[] | null>(null);
  const [friends, setFriends] = useState<RankingRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((scope: "global" | "friends") => {
    void fetch(`/api/ranking?scope=${scope}`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          setError(j.error ?? "unavailable");
          setRows([]);
          return;
        }
        const j = (await r.json()) as { rows: RankingRow[] };
        if (scope === "friends") setFriends(j.rows);
        else setRows(j.rows);
      })
      .catch(() => {
        setError("network");
        setRows([]);
      });
  }, []);

  useEffect(() => {
    load("global");
  }, [load]);

  const showFriends = () => {
    setTab("friends");
    if (friends === null) load("friends");
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
          Ranking
        </motion.h1>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Process-weighted leaderboard: consistency 40% · win rate 30% · profit factor &amp;
          expectancy 30%. Journal contents stay private — only aggregate metrics are shown.
        </p>
      </header>

      <div className="grid grid-cols-2 gap-1 rounded-control border border-line bg-canvas/60 p-1" role="tablist" aria-label="Ranking scope">
        {([["global", "Global"], ["friends", "Friends"]] as const).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => (id === "friends" ? showFriends() : setTab("global"))}
            className={cn(
              "rounded-lg py-2 text-sm font-medium transition-colors",
              tab === id ? "text-ink" : "text-faint hover:text-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "friends" && friends !== null && friends.length === 0 && error === "not_logged_in" ? null : null}

      {tab === "friends" ? (
        friends === null ? (
          <p className="text-sm text-faint">Loading…</p>
        ) : friends.length === 0 ? (
          <EmptyState
            icon={<TrophyIcon className="h-7 w-7" />}
            title="No friends yet"
            body="Add friends by their @handle to compete on process scores and Edge Points."
          />
        ) : null
      ) : rows === null ? (
        <p className="text-sm text-faint">Loading rankings…</p>
      ) : error ? (
        <EmptyState
          icon={<TrophyIcon className="h-7 w-7" />}
          title={error === "not_logged_in" ? "Sign in to view rankings" : "Rankings unavailable"}
          body={
            error === "not_logged_in"
              ? "Rankings are visible to signed-in Edge Book traders."
              : error === "google_not_configured"
                ? "Google persistence isn't configured on this server yet."
                : "Rankings couldn't be loaded. Please try again."
          }
        />
      ) : false ? (
        <EmptyState
          icon={<TrophyIcon className="h-7 w-7" />}
          title="Not enough traders yet"
          body="Rankings appear once traders have recorded at least a few sessions."
        />
      ) : (
        <div className="panel overflow-hidden">
          <div className="grid grid-cols-[2.5rem_1fr_repeat(3,minmax(0,4.5rem))_3.5rem] gap-2 border-b border-line bg-raised/60 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-faint sm:grid-cols-[3rem_1fr_repeat(5,minmax(0,5rem))_3.5rem]">
            <span>#</span>
            <span>Trader</span>
            <span className="hidden text-right sm:block">Trades</span>
            <span className="text-right">Win %</span>
            <span className="hidden text-right sm:block">PF</span>
            <span className="hidden text-right sm:block">Expect.</span>
            <span className="text-right">Score</span>
          </div>
          <ul className="divide-y divide-line-soft">
            {rows.map((r, i) => (
              <motion.li
                key={r.handle}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: i * 0.04, ease: EASE }}
                className={cn(
                  "grid grid-cols-[2.5rem_1fr_repeat(3,minmax(0,4.5rem))_3.5rem] items-center gap-2 px-4 py-3 text-[13px] sm:grid-cols-[3rem_1fr_repeat(5,minmax(0,5rem))_3.5rem]",
                  r.isViewer && "bg-gold/[0.05]",
                )}
              >
                <span className={cn("num font-bold", i === 0 ? "text-gold" : "text-faint")}>{i + 1}</span>
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate font-medium text-ink">{r.handle}</span>
                  {r.isViewer && (
                    <span className="shrink-0 rounded-full border border-gold/40 bg-gold/[0.08] px-1.5 py-px text-[9px] font-bold uppercase text-gold">
                      you
                    </span>
                  )}
                </span>
                <span className="num hidden text-right text-muted sm:block">{r.trades}</span>
                <span className="num text-right text-muted">{r.winRate != null ? `${r.winRate}%` : "—"}</span>
                <span className="num hidden text-right text-muted sm:block">{r.profitFactor ?? "—"}</span>
                <span className="num hidden text-right text-muted sm:block">{r.expectancy != null ? `$${r.expectancy}` : "—"}</span>
                <span className="num text-right font-bold text-ink">{r.score}</span>
              </motion.li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs leading-relaxed text-faint">
        Rankings intentionally exclude journal text, screenshots, notes and any private data.
        P&L is shown as context — the score rewards consistency and process.
      </p>
    </div>
  );
}
