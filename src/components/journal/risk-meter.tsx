"use client";

import { motion, useReducedMotion } from "motion/react";
import type { CurrencyCode } from "@/lib/types";
import { formatMoney, formatSignedMoney } from "@/lib/format";
import { RISK_COPY, type DayRisk } from "@/lib/risk";
import { cn } from "@/lib/utils";
import { RiskCompanion } from "./risk-companion/companion";

const TONE = {
  ok: { text: "text-profit", fill: "bg-profit", ring: "ring-profit/15", wash: "bg-profit/[0.06]" },
  near: { text: "text-gold", fill: "bg-gold-strong", ring: "ring-gold/20", wash: "bg-gold/[0.08]" },
  hit: { text: "text-loss", fill: "bg-loss", ring: "ring-loss/20", wash: "bg-loss/[0.07]" },
  over: { text: "text-loss", fill: "bg-loss", ring: "ring-loss/25", wash: "bg-loss/[0.08]" },
} as const;

/**
 * The day's loss budget, measured. Left: how far the day went into the red; right: what you said you'd accept.
 * The bar fills toward the limit and turns from green to gold to red; going past it is shown, not hidden.
 * `label` lets a screen say what the numbers are for (e.g. "If you save this trade").
 */
export function RiskMeter({ risk, currency, label = "Daily loss limit", compact = false, mascot = false, className }: { risk: DayRisk; currency: CurrencyCode; label?: string; compact?: boolean; /** Show the animated companion reacting to this risk. */ mascot?: boolean; className?: string }) {
  const reduce = useReducedMotion();
  const t = TONE[risk.status];
  const fill = Math.min(1, risk.ratio);
  const over = risk.used - risk.limit;
  const recovered = risk.used > 0 && risk.net >= 0;

  return (
    <section aria-label={label} className={cn("rounded-[18px] ring-1 ring-inset", t.wash, t.ring, compact ? "px-4 py-3" : "px-4 py-4", className)}>
      {mascot && <RiskCompanion risk={risk} className={cn("-mx-4 overflow-hidden rounded-t-[18px]", compact ? "-mt-3 mb-2" : "-mt-4 mb-2")} />}
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] font-semibold uppercase tracking-[.1em] text-faint">{label}</p>
        <p role="status" className={cn("flex items-center gap-1.5 text-[12.5px] font-semibold", t.text)}>
          <span aria-hidden className={cn("h-1.5 w-1.5 rounded-full", t.fill)} />
          {RISK_COPY[risk.status]}
        </p>
      </div>

      <div className={cn("flex items-baseline justify-between gap-3", compact ? "mt-1.5" : "mt-2.5")}>
        <p className={cn("kpi tabular-nums text-ink", compact ? "text-[20px]" : "text-[26px]")}>
          {risk.used > 0 ? `−${formatMoney(risk.used, currency)}` : formatMoney(0, currency)}
          <span className="ml-1.5 text-[13px] font-normal text-muted">at the deepest point</span>
        </p>
        <p className="num shrink-0 text-[13px] text-muted">of {formatMoney(risk.limit, currency)}</p>
      </div>

      <div className="relative mt-3 h-2 overflow-hidden rounded-full bg-ink/[0.08]" role="progressbar" aria-label="Share of the daily loss limit used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(Math.min(risk.ratio, 1) * 100)}>
        <motion.div
          className={cn("h-full rounded-full", t.fill)}
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${fill * 100}%` }}
          transition={{ type: "spring", stiffness: 130, damping: 24 }}
        />
        <span aria-hidden className="absolute inset-y-0 left-[75%] w-px bg-canvas/70" />
      </div>

      {!compact && (
        <p className="mt-2.5 text-[13px] leading-snug text-muted">
          {risk.status === "over" ? `Past your limit by ${formatMoney(over, currency)}.`
            : risk.status === "hit" ? "Exactly at the limit you set."
            : `${formatMoney(risk.remaining, currency)} of room left.`}
          {recovered ? ` The day closed ${formatSignedMoney(risk.net, currency)}.` : risk.used > 0 || risk.net !== 0 ? ` Day so far ${formatSignedMoney(risk.net, currency)}.` : ""}
        </p>
      )}
    </section>
  );
}
