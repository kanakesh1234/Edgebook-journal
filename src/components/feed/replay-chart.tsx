"use client";

import { useEffect, useState } from "react";
import type { JournalEntry } from "@/lib/types";
import type { ReplayPlan } from "@/lib/backtesting/journal-replay";
import { loadSymbolCandles } from "@/lib/backtesting/data/loader";
import { buildReplayModel, endIdx, type ReplayModel } from "@/lib/feed/replay";

/* -------------------------------- data -------------------------------- */

export type ReplayData =
  | { status: "idle" | "loading" }
  | { status: "ready"; model: ReplayModel; warning: string | null }
  | { status: "error"; message: string };

const cache = new Map<string, Promise<ReplayData>>();

/**
 * Loads the candles around a journal trade using the same planner and loader as the full replay workspace
 * (IndexedDB-cached, one fetch per trade). Only runs while `enabled`, so off-screen cards cost nothing.
 */
export function useReplayData(entry: JournalEntry, plan: ReplayPlan | null, enabled: boolean, attempt = 0): ReplayData {
  const [data, setData] = useState<ReplayData>({ status: "idle" });
  const cfg = plan && plan.ok && plan.mode === "trade" ? plan.config : null;

  useEffect(() => {
    if (!enabled || !cfg || !cfg.replayTrade) return;
    let alive = true;
    const key = `${entry.id}|${entry.updatedAt}|${attempt}`;
    let p = cache.get(key);
    if (!p) {
      const trade = cfg.replayTrade;
      p = loadSymbolCandles(cfg.instrumentSymbol, "1m", cfg.periodStartUtc, cfg.periodEndUtc).then((r): ReplayData => {
        if (r.error || r.candles.length === 0) return { status: "error", message: r.error ?? "No price data was found for this trade." };
        const model = buildReplayModel(r.candles, trade);
        return model ? { status: "ready", model, warning: r.warning } : { status: "error", message: "There isn't enough price data around this trade to replay it." };
      }).catch((): ReplayData => ({ status: "error", message: "Couldn't load price data. Check your connection." }));
      cache.set(key, p);
      void p.then((d) => { if (d.status === "error") cache.delete(key); });
    }
    setData((prev) => (prev.status === "ready" ? prev : { status: "loading" }));
    void p.then((d) => { if (alive) setData(d); });
    return () => { alive = false; };
  }, [enabled, cfg, entry.id, entry.updatedAt, attempt]);

  return data;
}
