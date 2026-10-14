"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { JournalEntry, TradePlan } from "@/lib/types";
import { outlookNow, outlookWithAi, type Outlook, type PlanDraft } from "@/lib/prediction";
import { cn } from "@/lib/utils";

/**
 * "What your history says about this plan." Appears before the trade is taken.
 * Shows the offline answer immediately, then upgrades to the AI's reading (which also uses everything the trader wrote today).
 */
const LEAN: Record<Outlook["lean"], { text: string; cls: string }> = {
  favorable: { text: "Looks stronger than usual", cls: "bg-profit/15 text-profit" },
  mixed: { text: "Mixed", cls: "bg-ink/[0.06] text-ink" },
  unfavorable: { text: "Riskier than usual", cls: "bg-loss/15 text-loss" },
  unknown: { text: "Not enough history", cls: "bg-ink/[0.06] text-muted" },
};

export function OutlookCard({ draft, entries, plans }: { draft: PlanDraft; entries: JournalEntry[]; plans: TradePlan[] }) {
  const local = useMemo(() => outlookNow(draft, entries, plans), [draft, entries, plans]);
  const [ai, setAi] = useState<{ key: string; outlook: Outlook } | null>(null);
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string | undefined>();
  const key = JSON.stringify(draft);
  const latest = useRef({ draft, entries, plans });
  latest.current = { draft, entries, plans };

  // Re-ask the AI a moment after the plan or the rules stop changing.
  useEffect(() => {
    if (!draft.thesis.trim()) return;
    const ctl = new AbortController();
    const t = window.setTimeout(async () => {
      setBusy(true); setWhy(undefined);
      const { draft: d, entries: e, plans: p } = latest.current;
      const r = await outlookWithAi(d, e, p, ctl.signal);
      if (ctl.signal.aborted) return;
      setBusy(false);
      if (r.outlook) setAi({ key, outlook: r.outlook }); else { setAi(null); setWhy(r.reason); }
    }, 900);
    return () => { window.clearTimeout(t); ctl.abort(); setBusy(false); };
  }, [key, draft.thesis]);

  const o = ai?.key === key ? ai.outlook : local;
  const lean = LEAN[o.lean];
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-raised" aria-live="polite">
      <div className="flex items-start gap-3 px-3.5 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[15px] font-semibold text-ink">What your history says</p>
            <span className={cn("rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold", lean.cls)}>{lean.text}</span>
          </div>
          <p className="mt-1 text-[13.5px] leading-snug text-muted">{o.headline}</p>
        </div>
        {busy && <span className="mt-1 text-[12px] text-faint">AI reading…</span>}
      </div>
      {o.points.length > 0 && (
        <ul className="space-y-1.5 border-t border-line-soft px-3.5 py-3">
          {o.points.map((p, i) => <li key={i} className="text-[13.5px] leading-snug text-ink">{p}</li>)}
        </ul>
      )}
      {o.watch.length > 0 && (
        <div className="border-t border-line-soft px-3.5 py-3">
          <p className="text-[12px] font-semibold uppercase tracking-[.08em] text-faint">Watch for</p>
          <ul className="mt-1.5 space-y-1">{o.watch.map((w, i) => <li key={i} className="text-[13.5px] leading-snug text-muted">{w}</li>)}</ul>
        </div>
      )}
      <p className="border-t border-line-soft px-3.5 py-2 text-[12px] text-faint">
        {o.source === "ai" ? "AI reading of your plan and past trades." : "Computed from your past trades."}{why && o.source !== "ai" ? ` ${why}` : ""} A guide to your own habits — not a market prediction.
      </p>
    </div>
  );
}
