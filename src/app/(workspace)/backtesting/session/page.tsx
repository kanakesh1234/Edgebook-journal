"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { instrumentBySymbol } from "@/lib/backtesting/instruments";
import { sessionById } from "@/lib/backtesting/sessions";
import type { BacktestConfig } from "@/lib/backtesting/types";
import { Button } from "@/components/ui/button";
import { CandlestickIcon } from "@/components/ui/icons";
import { formatMoney } from "@/lib/format";

/**
 * Terminal shell — PHASE 1 placeholder.
 *
 * Confirms the config the setup screen produced. The chart, replay engine,
 * order ticket, drawing tools and results screen land in Phases 2-9. This
 * route exists now so the setup → terminal handoff is real, not deferred.
 */
export default function BacktestSessionPage() {
  const router = useRouter();
  const [config, setConfig] = useState<BacktestConfig | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem("edgebook.backtesting.pendingConfig");
    if (!raw) {
      setMissing(true);
      return;
    }
    try {
      setConfig(JSON.parse(raw) as BacktestConfig);
    } catch {
      setMissing(true);
    }
  }, []);

  if (missing) {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-16 text-center">
        <p className="text-sm text-faint">No backtest configuration found.</p>
        <Button variant="outline" onClick={() => router.push("/backtesting")}>
          Back to setup
        </Button>
      </div>
    );
  }

  if (!config) return null;

  const instrument = instrumentBySymbol(config.instrumentSymbol);
  const session = sessionById(config.sessionId);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-control border border-line bg-raised text-gold">
            <CandlestickIcon className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-display text-xl font-semibold text-ink">
              {instrument?.symbol ?? config.instrumentSymbol} · {session.label}
            </h1>
            <p className="text-sm text-faint">
              {formatMoney(config.startingBalance, config.currency)} starting balance ·{" "}
              {config.accountType === "prop" ? "Prop account" : "Personal account"} · {config.timeframe}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => router.push("/backtesting")}>
          New setup
        </Button>
      </header>

      <div className="grid min-h-[420px] place-items-center rounded-control border border-dashed border-line-strong bg-surface p-8 text-center">
        <div className="max-w-sm space-y-2">
          <CandlestickIcon className="mx-auto h-6 w-6 text-faint" />
          <p className="text-sm font-medium text-ink">Chart and replay engine coming next</p>
          <p className="text-[13px] leading-relaxed text-faint">
            This session is configured and validated — the tick-based chart, replay controls, order ticket and drawing
            tools land in the next implementation phases. No placeholder or simulated price data is shown here.
          </p>
        </div>
      </div>

      <details className="rounded-control border border-line bg-raised/60 p-4 text-[13px] text-muted">
        <summary className="cursor-pointer font-medium text-ink">Validated configuration</summary>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-[12px] text-faint">
          {JSON.stringify(config, null, 2)}
        </pre>
      </details>
    </div>
  );
}
