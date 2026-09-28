"use client";

import { cn } from "@/lib/utils";
import { useBacktest } from "@/lib/backtesting/store";
import { formatMoney, formatPct } from "@/lib/format";
import { pnlClass } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { generateTradesCsv, downloadCsv } from "@/lib/backtesting/csv-export";

interface SessionResultsProps {
  onReturnToSessions: () => void;
}

export default function SessionResults({ onReturnToSessions }: SessionResultsProps) {
  const config = useBacktest((s) => s.config);
  const accountState = useBacktest((s) => s.accountState);
  const closedTrades = useBacktest((s) => s.closedTrades);
  const showResults = useBacktest((s) => s.showResults);
  const setShowResults = useBacktest((s) => s.setShowResults);
  const status = useBacktest((s) => s.status);

  if (!showResults || !config || !accountState) return null;

  const returnPct = config.startingBalance > 0
    ? ((accountState.netPnl / config.startingBalance) * 100).toFixed(2)
    : "0.00";
  const isBreached = status === "breached";

  const handleExportCsv = () => {
    const csvContent = generateTradesCsv(closedTrades, config);
    downloadCsv(csvContent, `${config.sessionName || "backtest"}-trades.csv`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="flex w-full max-w-2xl flex-col gap-5 rounded-xl border border-white/10 bg-[#1e222d] p-6 text-white shadow-2xl">
        {/* Header */}
        <div className="border-b border-white/10 pb-4">
          <h2 className={cn("text-xl font-bold", isBreached ? "text-loss" : "text-white")}>
            {isBreached ? "Account Breached" : "Session Complete"}
          </h2>
          <p className="mt-1 text-[13px] text-white/50">{config.sessionName}</p>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-3 gap-5">
          <div className="space-y-3">
            <Stat label="Starting Balance" value={formatMoney(config.startingBalance)} />
            <Stat label="Ending Balance" value={formatMoney(accountState.balance)} />
            <Stat label="Net P&L" value={`${accountState.netPnl >= 0 ? "+" : ""}${formatMoney(accountState.netPnl)}`} className={pnlClass(accountState.netPnl)} />
            <Stat label="Return %" value={`${parseFloat(returnPct) >= 0 ? "+" : ""}${returnPct}%`} className={pnlClass(accountState.netPnl)} />
          </div>

          <div className="space-y-3">
            <Stat label="Total Trades" value={String(accountState.totalTrades)} />
            <Stat label="Wins" value={String(accountState.winCount)} className="text-profit" />
            <Stat label="Losses" value={String(accountState.lossCount)} className="text-loss" />
            <Stat label="Win Rate" value={formatPct(accountState.winRate)} />
          </div>

          <div className="space-y-3">
            <Stat label="Profit Factor" value={accountState.profitFactor === Infinity ? "∞" : accountState.profitFactor.toFixed(2)} />
            <Stat label="Max Drawdown" value={formatMoney(accountState.maxDrawdown)} className="text-loss" />
            <Stat label="Largest Win" value={formatMoney(accountState.largestWin)} className="text-profit" />
            <Stat label="Largest Loss" value={formatMoney(accountState.largestLoss)} className="text-loss" />
          </div>
        </div>

        {/* Session metadata */}
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-black/20 p-3 text-[12px] text-white/60">
          <div><span className="text-white/40">Instruments:</span> {(config.instruments || []).join(", ") || config.instrumentSymbol}</div>
          <div><span className="text-white/40">Timeframe:</span> {config.timeframe}</div>
          <div><span className="text-white/40">Account:</span> {config.accountType === "prop" ? "Prop" : "Personal"}</div>
          <div><span className="text-white/40">Trades:</span> {closedTrades.length}</div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-2 border-t border-white/10 pt-4">
          <Button variant="outline" onClick={handleExportCsv} className="mr-auto">
            Export CSV
          </Button>
          <Button variant="ghost" onClick={() => setShowResults(false)}>
            Resume Session
          </Button>
          <Button variant="gold" onClick={onReturnToSessions}>
            Return to Sessions
          </Button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <p className="text-[10px] text-white/40">{label}</p>
      <p className={cn("text-[15px] font-semibold tabular-nums", className)}>{value}</p>
    </div>
  );
}
