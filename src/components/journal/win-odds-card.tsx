"use client";

import { useMemo } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { JournalEntry, TradePlan } from "@/lib/types";
import { winOddsNow, type PlanDraft, type WinOdds } from "@/lib/prediction";
import { cn } from "@/lib/utils";

/**
 * "How likely is this trade to win or lose?" — worked out from the trader's own past trades, and it moves as the plan
 * changes (a ticked rule, a different feeling). Replaces the wordy "what your history says" write-up.
 */
const CONFIDENCE: Record<"low" | "medium" | "high", string> = { low: "Low confidence", medium: "Medium confidence", high: "High confidence" };

export function WinOddsCard({ draft, entries, plans }: { draft: PlanDraft; entries: JournalEntry[]; plans: TradePlan[] }) {
  const odds: WinOdds = useMemo(() => winOddsNow(draft, entries, plans), [draft, entries, plans]);
  const reduce = useReducedMotion();

  if (odds.status === "thin") {
    return (
      <section aria-label="Chance this trade wins" className="rounded-2xl border border-line bg-raised px-4 py-3.5">
        <p className="text-[15px] font-semibold text-ink">Chance this trade wins</p>
        <p className="mt-1 text-[13.5px] leading-snug text-muted">
          Not enough history yet. This appears after {odds.needed} logged trades — you have {odds.n}.
        </p>
      </section>
    );
  }

  return (
    <section aria-label="Chance this trade wins" aria-live="polite" className="overflow-hidden rounded-2xl border border-line bg-raised">
      <div className="px-4 pb-4 pt-3.5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[15px] font-semibold text-ink">Chance this trade wins</p>
          <span className="rounded-full bg-ink/[0.06] px-2.5 py-0.5 text-[12px] font-medium text-muted">{CONFIDENCE[odds.confidence]}</span>
        </div>

        <div className="mt-3 flex items-end justify-between gap-3">
          <p className="kpi tabular-nums text-[30px] leading-none text-profit">
            {odds.win}%<span className="ml-1.5 text-[13px] font-medium text-muted">win</span>
          </p>
          <p className="kpi tabular-nums text-[30px] leading-none text-loss">
            <span className="mr-1.5 text-[13px] font-medium text-muted">loss</span>{odds.loss}%
          </p>
        </div>

        {/* One bar, two shares: win grows from the left, loss is the remainder. */}
        <div className="mt-3 flex h-2 gap-[3px] overflow-hidden rounded-full" role="img" aria-label={`${odds.win}% win, ${odds.loss}% loss`}>
          <motion.div className={cn("h-full rounded-full bg-profit")} initial={reduce ? false : { width: 0 }} animate={{ width: `${odds.win}%` }} transition={{ type: "spring", stiffness: 130, damping: 24 }} />
          <div className="h-full min-w-0 flex-1 rounded-full bg-loss/80" />
        </div>

        <p className="mt-3 text-[13px] leading-snug text-muted">
          {odds.basis ? `Closest match: ${odds.basis.n} ${odds.basis.label}. ` : ""}From your {odds.n} past trades.
        </p>
      </div>
      <p className="border-t border-line-soft px-4 py-2 text-[12px] text-faint">A guide to your own habits — not a market prediction.</p>
    </section>
  );
}
