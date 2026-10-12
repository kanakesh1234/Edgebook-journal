"use client";

import { useEffect } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { useBacktest } from "@/lib/backtesting/store";
import { formatMoney, formatPct, formatSignedMoney } from "@/lib/format";
import { generateTradesCsv, downloadCsv } from "@/lib/backtesting/csv-export";

interface SessionResultsProps {
  onReturnToSessions: () => void;
}

const EASE = [0.16, 1, 0.3, 1] as const;

export default function SessionResults({ onReturnToSessions }: SessionResultsProps) {
  const config = useBacktest((s) => s.config);
  const accountState = useBacktest((s) => s.accountState);
  const closedTrades = useBacktest((s) => s.closedTrades);
  const showResults = useBacktest((s) => s.showResults);
  const setShowResults = useBacktest((s) => s.setShowResults);
  const status = useBacktest((s) => s.status);

  const visible = showResults && !!config && !!accountState;

  // Escape resumes the session, like dismissing any system sheet.
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowResults(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, setShowResults]);

  if (!visible || !config || !accountState) return null;

  const hasTrades = accountState.totalTrades > 0;
  const isBreached = status === "breached";
  const net = accountState.netPnl;
  const returnPct = config.startingBalance > 0 ? (net / config.startingBalance) * 100 : 0;
  const tone = net > 0 ? "profit" : net < 0 ? "loss" : "flat";
  const toneText = tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : "text-muted";
  const tonePill =
    tone === "profit"
      ? "bg-profit/12 text-profit"
      : tone === "loss"
        ? "bg-loss/12 text-loss"
        : "bg-ink/[0.06] text-muted";

  const total = accountState.winCount + accountState.lossCount;
  const winShare = total > 0 ? (accountState.winCount / total) * 100 : 0;
  const instruments = (config.instruments || []).join(", ") || config.instrumentSymbol;
  const profitFactor = !hasTrades
    ? "—"
    : accountState.profitFactor === Infinity
      ? "∞"
      : accountState.profitFactor.toFixed(2);

  const handleExportCsv = () => {
    const csvContent = generateTradesCsv(closedTrades, config);
    downloadCsv(csvContent, `${config.sessionName || "backtest"}-trades.csv`);
  };

  return (
    <motion.div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-[var(--scrim)] p-0 backdrop-blur-xl sm:items-center sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      onClick={() => setShowResults(false)}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={isBreached ? "Account breached" : "Session complete"}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.42, ease: EASE }}
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[92dvh] w-full max-w-[560px] select-text flex-col overflow-hidden rounded-t-[28px] border border-line bg-overlay/95 text-ink shadow-overlay backdrop-saturate-150 sm:rounded-[28px]"
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-7 pb-6 pt-7 sm:px-8">
          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    isBreached ? "bg-loss" : "bg-gold-strong",
                  )}
                />
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-faint">
                  {isBreached ? "Account breached" : "Session complete"}
                </p>
              </div>
              <h2 className="mt-2 truncate text-[22px] font-semibold tracking-[-0.02em]">
                {config.sessionName}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setShowResults(false)}
              aria-label="Close and resume session"
              className="-mr-2 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink/[0.06] text-muted transition-colors hover:bg-ink/[0.1] hover:text-ink"
            >
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <path d="M3.5 3.5l9 9M12.5 3.5l-9 9" />
              </svg>
            </button>
          </div>

          {/* Hero result */}
          <div className="mt-7 text-center">
            <p className="text-[12px] font-medium text-faint">Net P&amp;L</p>
            <p className={cn("mt-1 text-[52px] font-semibold leading-none tracking-[-0.04em] tabular-nums", toneText)}>
              {formatSignedMoney(net)}
            </p>
            <div className="mt-3 flex items-center justify-center gap-2">
              <span className={cn("rounded-full px-2.5 py-1 text-[12px] font-semibold tabular-nums", tonePill)}>
                {returnPct > 0 ? "+" : returnPct < 0 ? "\u2212" : ""}
                {Math.abs(returnPct).toFixed(2)}%
              </span>
              <span className="text-[12px] text-faint tabular-nums">
                {formatMoney(config.startingBalance)} → {formatMoney(accountState.balance)}
              </span>
            </div>
          </div>

          {/* Win / loss split */}
          <div className="mt-7 rounded-2xl bg-ink/[0.035] p-4">
            <div className="flex items-baseline justify-between">
              <p className="text-[12px] font-medium text-muted">
                {hasTrades ? `${accountState.totalTrades} ${accountState.totalTrades === 1 ? "trade" : "trades"}` : "No trades taken"}
              </p>
              <p className="text-[12px] font-semibold tabular-nums text-ink">
                {hasTrades ? `${formatPct(accountState.winRate)} win rate` : "—"}
              </p>
            </div>
            <div className="mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.08]">
              {hasTrades && (
                <>
                  <motion.div
                    className="h-full bg-profit"
                    initial={{ width: 0 }}
                    animate={{ width: `${winShare}%` }}
                    transition={{ duration: 0.7, ease: EASE, delay: 0.15 }}
                  />
                  <motion.div
                    className="h-full bg-loss"
                    initial={{ width: 0 }}
                    animate={{ width: `${100 - winShare}%` }}
                    transition={{ duration: 0.7, ease: EASE, delay: 0.15 }}
                  />
                </>
              )}
            </div>
            <div className="mt-2.5 flex justify-between text-[12px] tabular-nums">
              <span className="text-muted">
                <span className="font-semibold text-profit">{accountState.winCount}</span> wins
              </span>
              <span className="text-muted">
                <span className="font-semibold text-loss">{accountState.lossCount}</span> losses
              </span>
            </div>
          </div>

          {/* Metric tiles */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Tile label="Profit factor" value={profitFactor} />
            <Tile
              label="Max drawdown"
              value={hasTrades && accountState.maxDrawdown ? formatMoney(accountState.maxDrawdown) : "—"}
              className={hasTrades && accountState.maxDrawdown ? "text-loss" : undefined}
            />
            <Tile
              label="Largest win"
              value={hasTrades && accountState.largestWin ? formatSignedMoney(accountState.largestWin) : "—"}
              className={hasTrades && accountState.largestWin ? "text-profit" : undefined}
            />
            <Tile
              label="Largest loss"
              value={hasTrades && accountState.largestLoss ? formatMoney(accountState.largestLoss) : "—"}
              className={hasTrades && accountState.largestLoss ? "text-loss" : undefined}
            />
          </div>

          {/* Session details */}
          <dl className="mt-5 divide-y divide-line-soft overflow-hidden rounded-2xl border border-line-soft">
            <Row label="Instruments" value={instruments} mono />
            <Row label="Timeframe" value={config.timeframe} mono />
            <Row label="Account" value={config.accountType === "prop" ? "Prop" : "Personal"} />
          </dl>
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse gap-2 border-t border-line-soft bg-surface/60 px-7 py-4 pb-[max(1rem,var(--safe-bottom,0px))] sm:flex-row sm:items-center sm:px-8">
          <PillButton variant="text" onClick={handleExportCsv} className="sm:mr-auto">
            Export CSV
          </PillButton>
          <PillButton variant="tinted" onClick={() => setShowResults(false)}>
            Resume Session
          </PillButton>
          <PillButton variant="filled" onClick={onReturnToSessions}>
            Return to Sessions
          </PillButton>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Tile({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-2xl bg-ink/[0.035] px-4 py-3.5">
      <p className="text-[11px] font-medium text-faint">{label}</p>
      <p className={cn("mt-1 text-[20px] font-semibold tracking-[-0.02em] tabular-nums", className ?? "text-ink")}>{value}</p>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 text-[13px]">
      <dt className="text-muted">{label}</dt>
      <dd className={cn("font-medium text-ink", mono && "font-mono text-[12.5px]")}>{value}</dd>
    </div>
  );
}

function PillButton({
  variant,
  onClick,
  className,
  children,
}: {
  variant: "filled" | "tinted" | "text";
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  const styles = {
    filled: "bg-gold-strong text-on-gold hover:bg-gold-strong-hover shadow-sm",
    tinted: "bg-ink/[0.07] text-ink hover:bg-ink/[0.11]",
    text: "text-muted hover:text-ink hover:bg-ink/[0.05]",
  }[variant];
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      className={cn(
        "inline-flex h-11 items-center justify-center whitespace-nowrap rounded-full px-5 text-[14px] font-semibold tracking-[-0.01em] transition-colors duration-200",
        styles,
        className,
      )}
    >
      {children}
    </motion.button>
  );
}
