"use client";

import { useEffect, useId, useMemo } from "react";
import { motion } from "motion/react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { useBacktest } from "@/lib/backtesting/store";
import { formatMoney, formatPct, formatSignedMoney } from "@/lib/format";
import { generateTradesCsv, downloadCsv } from "@/lib/backtesting/csv-export";
import type { SimTrade } from "@/lib/backtesting/engine/order-engine";
import EJMark from "./ej-mark";
import AnimatedNumber from "./ej-number";
import { GlassIconButton, IconClose, PrimaryButton, QuietButton } from "@/components/journal/flow-ui";

interface SessionResultsProps {
  onReturnToSessions: () => void;
}

const APPLE_EASE = [0.22, 1, 0.36, 1] as const;

function buildEquityPoints(trades: SimTrade[], start: number): number[] {
  let bal = start;
  const pts = [bal];
  for (const t of trades) {
    bal += t.netPnl;
    pts.push(bal);
  }
  return pts;
}

function buildInsights(trades: SimTrade[], profitFactor: number, maxDrawdown: number, breachReason?: string | null) {
  const out: Array<{ tone: "good" | "warn" | "neutral"; text: string }> = [];
  if (breachReason) {
    out.push({ tone: "warn", text: `Rule limit triggered · ${breachReason}` });
  }
  if (trades.length === 0) {
    out.push({ tone: "neutral", text: "Completed pass — no orders executed." });
    return out;
  }

  const wins = trades.filter((t) => t.netPnl > 0);
  const losses = trades.filter((t) => t.netPnl < 0);
  const avgWin = wins.length ? wins.reduce((s, t) => s + t.netPnl, 0) / wins.length : 0;
  const avgLoss = losses.length ? Math.abs(losses.reduce((s, t) => s + t.netPnl, 0) / losses.length) : 0;

  if (avgWin > 0 && avgLoss > 0) {
    const rr = avgWin / avgLoss;
    out.push({
      tone: rr >= 1.5 ? "good" : rr < 0.9 ? "warn" : "neutral",
      text: `Avg payoff ${rr.toFixed(2)}R (${formatSignedMoney(avgWin)} vs −${formatMoney(avgLoss)})`,
    });
  } else if (profitFactor >= 1.5 && Number.isFinite(profitFactor)) {
    out.push({ tone: "good", text: `Strong expectancy · ${profitFactor.toFixed(2)} profit factor` });
  }

  const held = trades.filter((t) => t.exitTime && t.entryTime).map((t) => Math.max(0, (t.exitTime! - t.entryTime) / 60));
  if (held.length > 0) {
    const avgMin = Math.round(held.reduce((s, m) => s + m, 0) / held.length);
    out.push({
      tone: "neutral",
      text: avgMin >= 60 ? `Avg hold ${Math.round(avgMin / 60)}h ${avgMin % 60}m` : `Avg hold ${Math.max(1, avgMin)}m`,
    });
  }

  if (!breachReason) {
    out.push({
      tone: maxDrawdown === 0 ? "good" : "neutral",
      text: maxDrawdown === 0 ? "Zero closed drawdown" : `Max drawdown contained at ${formatMoney(maxDrawdown)}`,
    });
  }

  return out.slice(0, 3);
}

export default function SessionResults({ onReturnToSessions }: SessionResultsProps) {
  const config = useBacktest((s) => s.config);
  const accountState = useBacktest((s) => s.accountState);
  const closedTrades = useBacktest((s) => s.closedTrades);
  const showResults = useBacktest((s) => s.showResults);
  const setShowResults = useBacktest((s) => s.setShowResults);
  const status = useBacktest((s) => s.status);
  const gid = useId().replace(/:/g, "");

  const visible = showResults && !!config && !!accountState;

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowResults(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible, setShowResults]);

  const points = useMemo(
    () => (config ? buildEquityPoints(closedTrades, config.startingBalance) : []),
    [closedTrades, config],
  );

  const insights = useMemo(() => {
    if (!accountState) return [];
    return buildInsights(
      closedTrades,
      accountState.profitFactor,
      accountState.maxDrawdown,
      accountState.breachInfo?.reason ?? null,
    );
  }, [closedTrades, accountState]);

  if (!visible || !config || !accountState || typeof document === "undefined") return null;

  const hasTrades = accountState.totalTrades > 0;
  const isBreached = status === "breached";
  const net = accountState.netPnl;
  const returnPct = config.startingBalance > 0 ? (net / config.startingBalance) * 100 : 0;
  const tone = net > 0 ? "profit" : net < 0 ? "loss" : "flat";
  const toneText = tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : "text-ink";
  const tonePill =
    tone === "profit"
      ? "bg-profit/12 text-profit"
      : tone === "loss"
        ? "bg-loss/12 text-loss"
        : "bg-ink/[0.06] text-muted";

  const total = accountState.winCount + accountState.lossCount;
  const winShare = total > 0 ? (accountState.winCount / total) * 100 : 0;
  const instruments = (config.instruments || []).join(" · ") || config.instrumentSymbol;
  const profitFactor = !hasTrades
    ? "—"
    : accountState.profitFactor === Infinity
      ? "∞"
      : accountState.profitFactor.toFixed(2);

  // Build crisp Apple-style bezier sparkline across points
  const W = 440;
  const H = 86;
  const lo = points.length ? Math.min(...points) : config.startingBalance;
  const hi = points.length ? Math.max(...points) : config.startingBalance;
  const span = hi - lo || 1;
  const coords = points.map((v, i) => [
    points.length <= 1 ? W : (i / (points.length - 1)) * W,
    10 + (1 - (v - lo) / span) * (H - 20),
  ]);
  const linePath =
    coords.length <= 1
      ? `M0 ${H / 2} L${W} ${H / 2}`
      : coords.reduce((acc, [x, y], i) => {
          if (i === 0) return `M${x.toFixed(1)} ${y.toFixed(1)}`;
          const [px, py] = coords[i - 1];
          const cx = ((px + x) / 2).toFixed(1);
          return `${acc} C${cx} ${py.toFixed(1)} ${cx} ${y.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
        }, "");
  const areaPath = `${linePath} L${W} ${H} L0 ${H} Z`;
  const curveColor = net >= 0 ? "var(--profit)" : "var(--loss)";

  const handleExportCsv = () => {
    const csvContent = generateTradesCsv(closedTrades, config);
    downloadCsv(csvContent, `${config.sessionName || "backtest"}-trades.csv`);
  };

  return createPortal(
    <motion.div
      className="fixed inset-0 z-[80] flex items-end justify-center bg-black/55 p-0 backdrop-blur-2xl sm:items-center sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.24 }}
      onClick={() => setShowResults(false)}
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label={isBreached ? "Account breached" : "Session results"}
        initial={{ opacity: 0, y: 20, scale: 0.965 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.46, ease: APPLE_EASE }}
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[92dvh] w-full max-w-[520px] flex-col overflow-hidden rounded-t-[30px] border border-line bg-overlay/95 text-ink shadow-overlay backdrop-saturate-150 dark:border-white/[0.1] sm:rounded-[30px]"
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 pt-6 sm:px-8 sm:pt-7">
          {/* Quiet Top Header */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <EJMark size={22} title="" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={cn("h-1.5 w-1.5 rounded-full", isBreached ? "bg-loss" : "bg-profit")} />
                  <p className="truncate text-[11.5px] font-medium tracking-[-0.005em] text-muted">
                    {isBreached ? "Breached" : "Session complete"} · {instruments} · {config.timeframe}
                  </p>
                </div>
                <h2 className="mt-0.5 truncate font-display text-[19px] font-semibold tracking-[-0.02em] text-ink">
                  {config.sessionName}
                </h2>
              </div>
            </div>
            <GlassIconButton label="Close and resume session" onClick={() => setShowResults(false)}>
              <IconClose />
            </GlassIconButton>
          </div>

          {/* Hero P&L + Smooth Equity Sparkline */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.08, ease: APPLE_EASE }}
            className="mt-6 rounded-[24px] border border-line-soft/90 bg-ink/[0.025] px-5 pb-4 pt-5 dark:border-white/[0.06] dark:bg-white/[0.025]"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className={cn("text-[42px] font-semibold leading-none tracking-[-0.04em] tabular-nums sm:text-[46px]", toneText)}>
                <AnimatedNumber value={net} from={0} ms={320} format={(n) => formatSignedMoney(n)} />
              </p>
              <span className={cn("rounded-full px-2.5 py-1 text-[12px] font-semibold tabular-nums", tonePill)}>
                {returnPct > 0 ? "+" : returnPct < 0 ? "−" : ""}
                {Math.abs(returnPct).toFixed(2)}%
              </span>
            </div>
            <p className="mt-1.5 text-[12.5px] text-faint tabular-nums">
              {formatMoney(config.startingBalance)} → {formatMoney(accountState.balance)}
            </p>

            {/* Micro Equity Curve */}
            <div className="mt-4">
              <svg viewBox={`0 0 ${W} ${H}`} className="block h-[76px] w-full overflow-visible" aria-hidden>
                <defs>
                  <linearGradient id={`sr-g-${gid}`} x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor={curveColor} stopOpacity="0.22" />
                    <stop offset="100%" stopColor={curveColor} stopOpacity="0" />
                  </linearGradient>
                </defs>
                <motion.path
                  d={areaPath}
                  fill={`url(#sr-g-${gid})`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.65, delay: 0.25 }}
                />
                <motion.path
                  d={linePath}
                  fill="none"
                  stroke={curveColor}
                  strokeWidth={2.2}
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.9, delay: 0.14, ease: APPLE_EASE }}
                />
              </svg>
            </div>

            {/* Win / Loss Ratio Capsule */}
            <div className="mt-3 flex h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.08]">
              {hasTrades && (
                <>
                  <motion.div
                    className="h-full bg-profit"
                    initial={{ width: 0 }}
                    animate={{ width: `${winShare}%` }}
                    transition={{ duration: 0.7, ease: APPLE_EASE, delay: 0.2 }}
                  />
                  <motion.div
                    className="h-full bg-loss"
                    initial={{ width: 0 }}
                    animate={{ width: `${100 - winShare}%` }}
                    transition={{ duration: 0.7, ease: APPLE_EASE, delay: 0.2 }}
                  />
                </>
              )}
            </div>

            {/* Unified 3-column Metric Strip */}
            <div className="mt-4 grid grid-cols-3 divide-x divide-line-soft border-t border-line-soft/80 pt-3.5 text-center dark:divide-white/[0.06] dark:border-white/[0.06]">
              <div>
                <p className="text-[11px] font-medium text-faint">Win rate</p>
                <p className="mt-0.5 text-[18px] font-semibold tabular-nums tracking-[-0.02em] text-ink">
                  {hasTrades ? formatPct(accountState.winRate) : "—"}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-faint">Profit factor</p>
                <p className="mt-0.5 text-[18px] font-semibold tabular-nums tracking-[-0.02em] text-ink">
                  {profitFactor}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-faint">Trades</p>
                <p className="mt-0.5 text-[18px] font-semibold tabular-nums tracking-[-0.02em] text-ink">
                  {accountState.totalTrades}
                </p>
              </div>
            </div>
          </motion.div>

          {/* Premium Micro-Insights (Zero Clutter) */}
          {insights.length > 0 && (
            <motion.ul
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.22, ease: APPLE_EASE }}
              className="mt-4 space-y-2"
            >
              {insights.map((ins, i) => (
                <li
                  key={i}
                  className="flex items-center gap-3 rounded-2xl border border-line-soft/80 bg-surface/65 px-4 py-2.5 text-[13px] text-ink dark:border-white/[0.06]"
                >
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      ins.tone === "good" ? "bg-profit" : ins.tone === "warn" ? "bg-loss" : "bg-gold",
                    )}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 leading-snug">{ins.text}</span>
                </li>
              ))}
            </motion.ul>
          )}
        </div>

        {/* Clean Action Footer */}
        <div className="flex flex-col-reverse gap-2 border-t border-line-soft bg-surface/60 px-6 py-4 pb-[max(1rem,var(--safe-bottom,0px))] sm:flex-row sm:items-center sm:px-8">
          <div className="sm:mr-auto">
            <QuietButton onClick={handleExportCsv}>Export CSV</QuietButton>
          </div>
          <TintedButton onClick={() => setShowResults(false)}>Resume</TintedButton>
          <PrimaryButton onClick={onReturnToSessions}>Done</PrimaryButton>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

function TintedButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex h-11 items-center justify-center whitespace-nowrap rounded-full bg-ink/[0.07] px-5 text-[15px] font-semibold tracking-[-0.01em] text-ink transition-all duration-200 hover:bg-ink/[0.11] active:scale-[0.97]"
    >
      {children}
    </button>
  );
}
