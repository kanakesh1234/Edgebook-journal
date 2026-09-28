"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { CandlestickIcon } from "@/components/ui/icons";
import { EmptyState, pnlClass } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { formatMoney, formatPct } from "@/lib/format";
import { useBacktest } from "@/lib/backtesting/store";
import type { BacktestSessionSummary } from "@/lib/backtesting/types";

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  ready: { label: "Ready", className: "bg-gold/10 text-gold border-gold/20" },
  running: { label: "Running", className: "bg-info/10 text-info border-info/20" },
  paused: { label: "Paused", className: "bg-gold/10 text-gold border-gold/20" },
  completed: { label: "Completed", className: "bg-profit/10 text-profit border-profit/20" },
  terminated: { label: "Stopped", className: "bg-loss/10 text-loss border-loss/20" },
  breached: { label: "Breached", className: "bg-loss/10 text-loss border-loss/20" },
};

function SessionCard({ session, onOpen, onDelete }: {
  session: BacktestSessionSummary;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const status = STATUS_LABELS[session.status] ?? STATUS_LABELS.ready;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-control border border-line bg-surface overflow-hidden"
    >
      {/* Card header — always visible */}
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-raised/40"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-raised text-gold">
              <CandlestickIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-semibold text-ink">
                {session.sessionName}
              </p>
              <p className="text-[11px] text-faint">
                {session.instruments.join(" + ")} · {session.timeframe} ·{" "}
                {session.sessionWindow.startTime}–{session.sessionWindow.endTime}
              </p>
            </div>
          </div>
        </div>

        <div className="hidden items-center gap-4 sm:flex">
          <div className="text-right">
            <p className={cn("text-sm font-semibold tabular-nums", pnlClass(session.netPnl))}>
              {session.netPnl >= 0 ? "+" : ""}{formatMoney(session.netPnl)}
            </p>
            <p className="text-[11px] text-faint">{session.totalTrades} trades</p>
          </div>
          <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", status.className)}>
            {status.label}
          </span>
        </div>

        <svg
          className={cn("h-4 w-4 shrink-0 text-faint transition-transform", expanded && "rotate-180")}
          viewBox="0 0 20 20" fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>

      {/* Expanded details */}
      {expanded && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          className="border-t border-line"
        >
          <div className="grid grid-cols-2 gap-3 px-5 py-4 sm:grid-cols-4">
            <Stat label="Starting" value={formatMoney(session.startingBalance)} />
            <Stat label="Ending" value={formatMoney(session.endingBalance)} className={pnlClass(session.netPnl)} />
            <Stat label="Win Rate" value={formatPct(session.winRate)} />
            <Stat label="Profit Factor" value={session.profitFactor === Infinity ? "∞" : session.profitFactor.toFixed(2)} />
            <Stat label="Max Drawdown" value={formatMoney(session.maxDrawdown)} className="text-loss" />
            <Stat label="Account" value={session.accountType === "prop" ? "Prop" : "Personal"} />
            <Stat label="Date Range" value={session.dateRange.start.slice(0, 10)} />
            <Stat label="Last Modified" value={new Date(session.lastModified).toLocaleDateString()} />
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
            <Button variant="ghost" size="sm" onClick={onDelete} className="text-loss">
              Delete
            </Button>
            <Button variant="gold" size="sm" onClick={onOpen}>
              Open Session
            </Button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-faint">{label}</p>
      <p className={cn("mt-0.5 text-sm font-semibold tabular-nums text-ink", className)}>{value}</p>
    </div>
  );
}

export default function BacktestingPage() {
  const router = useRouter();
  const sessions = useBacktest((s) => s.sessions);
  const loading = useBacktest((s) => s.sessionsLoading);
  const loadSessionList = useBacktest((s) => s.loadSessionList);
  const deleteSession = useBacktest((s) => s.deleteSession);

  useEffect(() => {
    loadSessionList();
  }, [loadSessionList]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-control border border-line bg-raised text-gold">
            <CandlestickIcon className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-display text-xl font-semibold text-ink">Backtesting</h1>
            <p className="text-sm text-faint">Replay historical sessions and practice your edge.</p>
          </div>
        </div>
        <Button variant="gold" onClick={() => router.push("/backtesting/create")}>
          + Create Session
        </Button>
      </header>

      {loading ? (
        <div className="grid min-h-[200px] place-items-center">
          <p className="text-sm text-faint">Loading sessions…</p>
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<CandlestickIcon className="h-7 w-7" />}
          title="No backtesting sessions yet"
          body="Create your first session to start replaying historical market data and practicing your trading edge."
          action={
            <Button variant="gold" onClick={() => router.push("/backtesting/create")}>
              + Create Session
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              onOpen={() => router.push(`/backtesting/session?id=${session.id}`)}
              onDelete={() => deleteSession(session.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
