"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export function Pill({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-line bg-raised/70 px-2.5 py-1 text-[11px] font-medium tracking-wide text-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}

export const pnlClass = (v: number) =>
  v > 0 ? "text-profit" : v < 0 ? "text-loss" : "text-muted";

export const pnlBgClass = (v: number) =>
  v > 0 ? "bg-profit/10 text-profit border-profit/20" : v < 0 ? "bg-loss/10 text-loss border-loss/25" : "bg-ink/[0.05] text-muted border-line";

export function EmptyState({
  icon,
  title,
  body,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className={cn("panel flex flex-col items-center justify-center px-8 py-16 text-center", className)}
    >
      {icon && (
        <div className="mb-5">
          <div className="grid h-16 w-16 place-items-center rounded-2xl border border-line-strong bg-raised text-gold">
            {icon}
          </div>
        </div>
      )}
      <h3 className="font-display text-lg font-semibold tracking-tight text-ink">{title}</h3>
      {body && <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">{body}</p>}
      {action && <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{action}</div>}
    </motion.div>
  );
}
