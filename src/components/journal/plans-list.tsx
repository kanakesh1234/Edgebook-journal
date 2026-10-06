"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useApp } from "@/lib/store";
import type { TradePlan } from "@/lib/types";
import { formatDateMedium } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EASE } from "@/components/landing/reveal";
import { Disclosure } from "@/components/journal/flow-ui";

const STATUS: Record<TradePlan["status"], { label: string; dot: string; text: string }> = {
  planned: { label: "Planned", dot: "bg-faint", text: "text-muted" },
  ready: { label: "Ready to wait", dot: "bg-info", text: "text-info" },
  active: { label: "Active", dot: "bg-gold-strong", text: "text-gold" },
  executed: { label: "Executed", dot: "bg-profit", text: "text-profit" },
  not_executed: { label: "Not executed", dot: "bg-faint", text: "text-faint" },
  invalidated: { label: "Invalidated", dot: "bg-loss", text: "text-loss" },
  cancelled: { label: "Cancelled", dot: "bg-faint", text: "text-faint" },
};

const CLOSED: TradePlan["status"][] = ["executed", "cancelled", "not_executed"];

function StatusMark({ status }: { status: TradePlan["status"] }) {
  const s = STATUS[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-[12px] font-medium", s.text)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}

/**
 * Plans on Home: only what is still open gets a surface. Finished plans are
 * one quiet disclosure away — available, never in the way.
 */
export function PlansList({ plans }: { plans: TradePlan[] }) {
  const active = plans.filter((p) => !CLOSED.includes(p.status));
  const past = plans.filter((p) => CLOSED.includes(p.status));

  if (plans.length === 0) return null;

  return (
    <section className="space-y-4" aria-label="Plans">
      {active.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-base font-semibold tracking-tight text-ink">Open plans</h2>
            <span className="num text-[12px] text-faint">{active.length}</span>
          </div>
          <ul className="panel divide-y divide-line overflow-hidden">
            {active.map((p, i) => {
              const ready = p.rules.filter((r) => r.state === "ready").length;
              return (
                <motion.li
                  key={p.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: i * 0.04, ease: EASE }}
                  className="px-5 py-4 sm:px-6"
                >
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">
                          {p.instrument ?? p.playbookName ?? "Planned session"}
                        </span>
                        <StatusMark status={p.status} />
                      </p>
                      <p className="mt-0.5 text-[12.5px] text-faint">
                        {formatDateMedium(p.date)} · {p.playbookName ?? "no playbook"}
                        {p.emotionalState ? ` · ${p.emotionalState.charAt(0)}${p.emotionalState.slice(1).toLowerCase()}` : ""}
                        {p.rules.length > 0 ? ` · ${ready}/${p.rules.length} rules ready` : ""}
                      </p>
                      {p.thesis && <p className="mt-2 line-clamp-2 text-[14px] leading-relaxed text-muted">“{p.thesis}”</p>}
                    </div>
                    <PlanStatusActions plan={p} />
                  </div>
                </motion.li>
              );
            })}
          </ul>
        </div>
      )}

      {past.length > 0 && (
        <Disclosure label={`Past plans (${past.length})`}>
          <ul className="divide-y divide-line-soft">
            {past.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-3 py-2.5 text-[13.5px]">
                <span className="min-w-0 truncate">
                  <span className="font-medium text-ink">{p.instrument ?? p.playbookName ?? "Plan"}</span>
                  <span className="ml-2 text-[12.5px] text-faint">{formatDateMedium(p.date)}</span>
                  {p.linkedTradeId && (
                    <Link href={`/review/${p.linkedTradeId}`} className="ml-3 text-[12.5px] font-medium text-gold hover:underline">
                      View trade →
                    </Link>
                  )}
                </span>
                <StatusMark status={p.status} />
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
    </section>
  );
}

/** One clear next step per plan; the rest stay quiet text. */
function PlanStatusActions({ plan }: { plan: TradePlan }) {
  const savePlan = useApp((s) => s.savePlan);
  const act = (status: TradePlan["status"]) => void savePlan({ ...plan, status, updatedAt: Date.now() });

  const primary = "h-8 rounded-full border px-3.5 text-[13px] font-semibold transition-colors active:scale-[0.97]";
  const quiet = "h-8 rounded-full px-2.5 text-[13px] font-medium text-faint transition-colors hover:text-ink";

  return (
    <div className="flex shrink-0 items-center gap-1">
      {plan.status === "planned" && (
        <button onClick={() => act("ready")} className={cn(primary, "border-info/35 bg-info/[0.07] text-info hover:bg-info/[0.14]")}>
          Mark ready
        </button>
      )}
      {(plan.status === "ready" || plan.status === "active") && (
        <>
          <button onClick={() => act("executed")} className={cn(primary, "border-profit/35 bg-profit/[0.07] text-profit hover:bg-profit/[0.14]")}>
            Executed
          </button>
          <button onClick={() => act("not_executed")} className={quiet}>
            No trade
          </button>
        </>
      )}
      {plan.status !== "cancelled" && plan.status !== "invalidated" && (
        <button onClick={() => act("invalidated")} className={cn(quiet, "hover:text-loss")}>
          Invalidate
        </button>
      )}
    </div>
  );
}
