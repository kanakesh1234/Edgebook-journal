"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { EASE } from "@/components/landing/reveal";

export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = "neutral",
  delay = 0,
  className,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: "neutral" | "profit" | "loss" | "gold";
  delay?: number;
  className?: string;
}) {
  const toneText =
    tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : tone === "gold" ? "text-gold" : "text-ink";

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: EASE }}
      whileHover={{ y: -3 }}
      className={cn("panel panel-hover relative overflow-hidden p-5", className)}
    >
      <div className="relative flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">{label}</p>
        {icon && (
          <span
            className={cn(
              "grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-raised",
              tone === "profit" && "text-profit",
              tone === "loss" && "text-loss",
              tone === "gold" && "text-gold",
              tone === "neutral" && "text-muted",
            )}
          >
            {icon}
          </span>
        )}
      </div>
      <p className={cn("relative mt-2.5 font-mono text-[26px] font-bold leading-none tabular", toneText)}>
        {value}
      </p>
      {sub && <p className="relative mt-2 text-xs text-muted">{sub}</p>}
    </motion.div>
  );
}
