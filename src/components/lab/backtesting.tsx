"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useBacktest } from "@/lib/backtesting/store";
import type { BacktestSessionSummary } from "@/lib/backtesting/types";
import { formatMoney, formatPct } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { pnlClass } from "@/components/ui/misc";
import { ChevronRightIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { EASE } from "@/components/landing/reveal";

const STATUS: Record<string, { label: string; className: string }> = {
  ready: { label: "Ready", className: "bg-gold/10 text-gold border-gold/20" },
  running: { label: "Running", className: "bg-info/10 text-info border-info/20" },
  paused: { label: "Paused", className: "bg-gold/10 text-gold border-gold/20" },
  completed: { label: "Completed", className: "bg-profit/10 text-profit border-profit/20" },
  terminated: { label: "Stopped", className: "bg-loss/10 text-loss border-loss/20" },
  breached: { label: "Breached", className: "bg-loss/10 text-loss border-loss/20" },
};

/**
 * Backtesting — lives inside the Trading Lab, styled like Setups and Challenges:
 * folder-style cards in a panel. Click a card to reopen that session; the trash
 * icon deletes it. Same store + routes as the old /backtesting page.
 */
export function Backtesting() {
  const router = useRouter();
  const sessions = useBacktest((s) => s.sessions);
  const loading = useBacktest((s) => s.sessionsLoading);
  const loadSessionList = useBacktest((s) => s.loadSessionList);
  const deleteSession = useBacktest((s) => s.deleteSession);
  const [deleting, setDeleting] = useState<BacktestSessionSummary | null>(null);

  useEffect(() => {
    loadSessionList();
  }, [loadSessionList]);

  const create = () => router.push("/backtesting/create");

  return (
    <section id="backtesting" className="panel scroll-mt-6 p-5 sm:p-6" aria-label="Backtesting">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold tracking-tight text-ink">Backtesting</h2>
          <p className="text-xs text-muted">
            Replay historical market sessions and practise your edge. Open a session like a folder to pick up where you left off.
          </p>
        </div>
        <Button variant="gold" size="sm" onClick={create}>
          <PlusIcon className="h-4 w-4" />
          New session
        </Button>
      </div>

      {loading && sessions.length === 0 ? (
        <p className="mt-4 px-4 py-8 text-center text-sm text-faint">Loading sessions…</p>
      ) : sessions.length === 0 ? (
        <p className="mt-4 rounded-control border border-dashed border-line-strong px-4 py-8 text-center text-sm text-muted">
          No backtesting sessions yet. Create one to replay historical data candle by candle and practise your setups.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence initial={false}>
            {sessions.map((s, i) => {
              const status = STATUS[s.status] ?? STATUS.ready;
              return (
                <motion.div
                  key={s.id}
                  layout
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.35, delay: Math.min(i * 0.03, 0.15), ease: EASE }}
                  whileHover={{ y: -3 }}
                  className="group relative rounded-control border border-line bg-raised/60 transition-colors hover:border-gold/40"
                >
                  <button
                    type="button"
                    onClick={() => router.push(`/backtesting/session?id=${s.id}`)}
                    aria-label={`Open session ${s.sessionName}`}
                    className="block w-full rounded-control p-4 pr-12 text-left"
                  >
                    <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
                      <span aria-hidden className="text-base">📁</span>
                      <span className="truncate">{s.sessionName}</span>
                    </p>
                    <p className="mt-1 truncate text-[11px] text-faint">
                      {s.instruments.join(" + ")} · {s.timeframe} · {s.dateRange.start.slice(0, 10)}
                    </p>

                    <div className="mt-3 flex items-end justify-between gap-2">
                      <div>
                        <p className={cn("num text-sm font-semibold", pnlClass(s.netPnl))}>
                          {s.netPnl >= 0 ? "+" : ""}
                          {formatMoney(s.netPnl)}
                        </p>
                        <p className="num text-[11px] text-muted">
                          {s.totalTrades} {s.totalTrades === 1 ? "trade" : "trades"}
                          {s.totalTrades > 0 && <> · {formatPct(s.winRate)} win</>}
                        </p>
                      </div>
                      <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium", status.className)}>
                        {status.label}
                      </span>
                    </div>
                  </button>

                  <ChevronRightIcon className="pointer-events-none absolute right-4 top-4 h-4 w-4 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-gold" />
                  <button
                    type="button"
                    onClick={() => setDeleting(s)}
                    aria-label={`Delete session ${s.sessionName}`}
                    title="Delete session"
                    className="absolute right-2 top-9 grid h-8 w-8 place-items-center rounded-lg text-faint transition-colors hover:bg-loss/10 hover:text-loss"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) deleteSession(deleting.id);
          setDeleting(null);
        }}
        title={`Delete "${deleting?.sessionName ?? ""}"?`}
        body="This permanently deletes the session and its replay results. This cannot be undone."
        confirmLabel="Delete session"
      />
    </section>
  );
}
