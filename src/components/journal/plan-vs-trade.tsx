"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import type { JournalEntry } from "@/lib/types";
import { useApp } from "@/lib/store";
import { reviewPlanForEntry, type CheckStatus, type PlanVerdict } from "@/lib/plan-review";
import { Sym } from "./symbols";
import { cn } from "@/lib/utils";

/**
 * "Plan vs. what you did" — the trader's own pre-trade read, shown in the journal next to the trade,
 * followed by a check-by-check comparison (direction, setup rules, target, invalidation, news, loss limit).
 */
const VERDICT: Record<PlanVerdict, { label: string; tone: string; ring: string }> = {
  followed: { label: "Followed the plan", tone: "bg-profit/[0.12] text-profit", ring: "bg-profit/[0.05] ring-profit/[0.14]" },
  partly: { label: "Partly followed", tone: "bg-gold/[0.16] text-gold", ring: "bg-gold/[0.06] ring-gold/[0.18]" },
  departed: { label: "Left the plan", tone: "bg-loss/[0.12] text-loss", ring: "bg-loss/[0.05] ring-loss/[0.14]" },
  unknown: { label: "Plan on record", tone: "bg-ink/[0.07] text-muted", ring: "bg-ink/[0.03] ring-ink/[0.06]" },
};

function Mark({ status }: { status: CheckStatus }) {
  const cls = status === "match" ? "bg-profit/15 text-profit" : status === "miss" ? "bg-loss/15 text-loss" : status === "partial" ? "bg-gold/20 text-gold" : "bg-ink/[0.07] text-faint";
  return (
    <span className={cn("mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full", cls)}>
      {status === "match" ? <Sym name="check" className="h-3 w-3" strokeWidth={2.6} />
        : status === "miss" ? <Sym name="xmark" className="h-3 w-3" strokeWidth={2.6} />
        : <span className="h-[2px] w-2 rounded-full bg-current" />}
    </span>
  );
}

export function PlanVsTrade({ entry }: { entry: JournalEntry }) {
  const plans = useApp((s) => s.plans);
  const entries = useApp((s) => s.entries);
  const dayLimits = useApp((s) => s.settings.dayLimits);
  const r = useMemo(() => reviewPlanForEntry(entry, plans, entries, dayLimits), [entry, plans, entries, dayLimits]);
  if (!r) return null;
  const v = VERDICT[r.verdict];
  const p = r.plan;

  return (
    <section aria-label="Plan versus what you did" className="space-y-3">
      <div className="flex items-center gap-2.5 px-1">
        <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[7px] text-white shadow-[inset_0_0.5px_0_rgb(255_255_255/0.4),0_0.5px_1px_rgb(0_0_0/0.18)]" style={{ background: "#0a84ff" }}>
          <Sym name="target" className="h-[15px] w-[15px]" strokeWidth={1.9} />
        </span>
        <h3 className="flex-1 text-[15px] font-semibold tracking-[-0.015em] text-ink">Plan vs. what you did</h3>
        <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-[12.5px] font-semibold", v.tone)}>
          {v.label}{r.score != null && <span className="num ml-1.5 opacity-70">{r.score}%</span>}
        </span>
      </div>

      <div className={cn("rounded-[16px] p-4 ring-1 ring-inset", v.ring)}>
        {p.thesis && (
          <blockquote className="rounded-[12px] border-l-[3px] border-gold-strong/50 bg-surface/70 px-3.5 py-2.5 text-[14.5px] leading-relaxed text-ink [overflow-wrap:anywhere]">
            <span className="mb-0.5 block text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">Your read{p.emotionalState ? ` · felt ${p.emotionalState.toLowerCase()}` : ""}</span>
            <span className="whitespace-pre-line">{p.thesis}</span>
            {p.emotionalNote && <span className="mt-1.5 block text-[13px] text-muted">“{p.emotionalNote}”</span>}
          </blockquote>
        )}
        <p className="mt-3 text-[14px] font-medium leading-snug text-ink">{r.headline}</p>

        {r.checks.length > 0 && (
          <ul className="mt-3 divide-y divide-line-soft overflow-hidden rounded-[12px] bg-surface/70 ring-1 ring-inset ring-ink/[0.05]">
            {r.checks.map((c, i) => (
              <motion.li
                key={c.id}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1], delay: Math.min(i * 0.045, 0.3) }}
                className="flex items-start gap-3 px-3.5 py-2.5"
              >
                <Mark status={c.status} />
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-faint">{c.label}</p>
                  <p className="mt-0.5 text-[13.5px] leading-snug text-muted"><span className="text-faint">Plan · </span>{c.planned}</p>
                  <p className={cn("text-[13.5px] leading-snug", c.status === "miss" ? "font-medium text-loss" : "text-ink")}><span className="font-normal text-faint">Trade · </span>{c.actual}</p>
                </div>
              </motion.li>
            ))}
          </ul>
        )}

        {p.whatCouldBreakPlan && (
          <p className="mt-3 text-[13px] leading-snug text-muted"><span className="font-medium text-ink">What could break the plan: </span>{p.whatCouldBreakPlan}</p>
        )}
        {r.readDirection && r.checks.some((c) => c.id === "direction" && c.planned.includes("your words")) && (
          <p className="mt-2 text-[12px] text-faint">Direction is read from the words in your plan, so treat it as a guide.</p>
        )}
      </div>
    </section>
  );
}
