"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useApp } from "@/lib/store";
import type { TradePlan } from "@/lib/types";
import { PLAN_EMOTIONS } from "@/lib/types";
import { formatDateMedium } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EASE } from "@/components/landing/reveal";

const STATUS_STYLE: Record<TradePlan["status"], { label: string; cls: string }> = {
  planned: { label: "Planned", cls: "border-line-strong bg-raised text-muted" },
  ready: { label: "Ready to wait", cls: "border-info/30 bg-info/[0.06] text-info" },
  active: { label: "Active", cls: "border-gold/40 bg-gold/[0.08] text-gold" },
  executed: { label: "Executed", cls: "border-profit/40 bg-profit/[0.08] text-profit" },
  not_executed: { label: "Not executed", cls: "border-line bg-raised text-faint" },
  invalidated: { label: "Invalidated", cls: "border-loss/30 bg-loss/[0.06] text-loss" },
  cancelled: { label: "Cancelled", cls: "border-line bg-raised text-faint" },
};

/** Active pre-trade plans with status transitions. */
export function PlansList({ plans }: { plans: TradePlan[] }) {
  const active = plans.filter((p) => !["executed", "cancelled", "not_executed"].includes(p.status));
  const past = plans.filter((p) => ["executed", "cancelled", "not_executed"].includes(p.status));

  if (plans.length === 0) return null;

  return (
    <div className="space-y-3">
      {active.length > 0 && (
        <div className="space-y-2">
          {active.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.04, ease: EASE }}
              className="panel p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                    {p.instrument ?? p.playbookName ?? "Planned session"}
                    <span className={cn("rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide", STATUS_STYLE[p.status].cls)}>
                      {STATUS_STYLE[p.status].label}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-faint">
                    {formatDateMedium(p.date)} · {p.playbookName ?? "no playbook"}{p.emotionalState ? ` · ${p.emotionalState.charAt(0)}${p.emotionalState.slice(1).toLowerCase()}` : ""}
                  </p>
                </div>
                <PlanStatusActions plan={p} />
              </div>
              {p.thesis && <p className="mt-2 line-clamp-2 text-[13px] leading-relaxed text-muted">“{p.thesis}”</p>}
              {p.rules.length > 0 && (
                <p className="mt-1.5 text-[11px] text-faint">
                  {p.rules.filter((r) => r.state === "ready").length}/{p.rules.length} rules ready
                </p>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {past.length > 0 && (
        <details className="panel px-4 py-3">
          <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-faint">
            Past plans ({past.length})
          </summary>
          <ul className="mt-2 divide-y divide-line-soft">
            {past.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                <span className="min-w-0">
                  <span className="font-medium text-ink">{p.instrument ?? p.playbookName ?? "Plan"}</span>
                  <span className="ml-2 text-xs text-faint">{formatDateMedium(p.date)}</span>
                  {p.linkedTradeId && (
                    <Link href={`/review/${p.linkedTradeId}`} className="ml-2 text-xs font-medium text-gold hover:text-gold-deep">
                      View trade →
                    </Link>
                  )}
                </span>
                <span className={cn("rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase", STATUS_STYLE[p.status].cls)}>
                  {STATUS_STYLE[p.status].label}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function PlanStatusActions({ plan }: { plan: TradePlan }) {
  const savePlan = useApp((s) => s.savePlan);
  const act = (status: TradePlan["status"]) => void savePlan({ ...plan, status, updatedAt: Date.now() });

  return (
    <div className="flex shrink-0 gap-1.5">
      {plan.status === "planned" && (
        <button onClick={() => act("ready")} className="rounded-lg border border-info/30 bg-info/[0.06] px-2.5 py-1 text-[11px] font-semibold text-info hover:bg-info/[0.12]">
          Ready
        </button>
      )}
      {(plan.status === "ready" || plan.status === "active") && (
        <>
          <button onClick={() => act("executed")} className="rounded-lg border border-profit/30 bg-profit/[0.07] px-2.5 py-1 text-[11px] font-semibold text-profit hover:bg-profit/[0.14]">
            Executed
          </button>
          <button onClick={() => act("not_executed")} className="rounded-lg border border-line px-2.5 py-1 text-[11px] font-semibold text-faint hover:text-ink">
            No trade
          </button>
        </>
      )}
      {plan.status !== "cancelled" && plan.status !== "invalidated" && (
        <button onClick={() => act("invalidated")} className="rounded-lg border border-line px-2.5 py-1 text-[11px] font-semibold text-faint hover:text-loss hover:border-loss/30">
          Invalidate
        </button>
      )}
    </div>
  );
}
