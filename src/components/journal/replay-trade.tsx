"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { JournalEntry } from "@/lib/types";
import { useApp } from "@/lib/store";
import { toast } from "@/components/ui/toast";
import { useBacktest } from "@/lib/backtesting/store";
import { planJournalReplay, DEFAULT_LEAD_MIN } from "@/lib/backtesting/journal-replay";
import { Sym } from "./symbols";
import { cn } from "@/lib/utils";

/**
 * "Replay this trade": builds a backtest session around the journal entry
 * (starts a few minutes before the entry, ends after the exit) and opens it.
 * The replay then executes the trader's real entry/SL/TP/exit as the clock reaches them.
 */
export function useReplayTrade(entry: JournalEntry | null) {
  const router = useRouter();
  const startingEquity = useApp((s) => s.settings.startingEquity);
  const currency = useApp((s) => s.settings.currency);
  const [busy, setBusy] = useState(false);

  const plan = useMemo(
    () => (entry ? planJournalReplay(entry, { startingBalance: startingEquity, currency }) : null),
    [entry, startingEquity, currency],
  );

  const start = useCallback(async () => {
    if (!plan || !plan.ok || busy) return;
    setBusy(true);
    try {
      const st = useBacktest.getState();
      st.initSession(plan.config);
      await useBacktest.getState().saveSession();
      router.push(`/backtesting/session?id=${useBacktest.getState().sessionId}`);
    } catch {
      toast.error("Couldn’t open the replay", "Please try again.");
      setBusy(false);
    }
  }, [plan, busy, router]);

  return { plan, busy, start };
}

/** Full-width call to action shown with the trade's figures. */
export function ReplayTradeCard({ entry }: { entry: JournalEntry }) {
  const { plan, busy, start } = useReplayTrade(entry);
  if (!plan) return null;
  const ok = plan.ok;
  const trade = ok && plan.mode === "trade";

  return (
    <section aria-label="Replay this trade" className="flex items-center gap-3 rounded-[16px] bg-ink/[0.035] p-3.5 ring-1 ring-inset ring-ink/[0.06]">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] bg-ink/[0.07] text-ink/80">
        <Sym name="play" className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-semibold text-ink">Replay this trade</p>
        <p className="text-[13px] leading-snug text-muted">
          {!ok
            ? plan.reason
            : trade
              ? `Watch it unfold from ${DEFAULT_LEAD_MIN} min before your entry, with your real entry, stop, target and exit.`
              : "No entry time was recorded, so this opens that whole session to replay."}
        </p>
      </div>
      <button
        type="button" onClick={start} disabled={!ok || busy}
        className={cn(
          "h-8 shrink-0 rounded-full bg-gold-strong px-4 text-[13.5px] font-semibold text-on-gold outline-none transition-[transform,opacity]",
          "hover:opacity-90 active:scale-95 focus-visible:ring-2 focus-visible:ring-gold-strong/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40",
        )}
      >
        {busy ? "Opening…" : trade ? "Replay" : "Open day"}
      </button>
    </section>
  );
}
