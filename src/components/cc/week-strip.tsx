"use client";

import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import type { DayResult } from "@/lib/types";
import type { CurrencyCode } from "@/lib/types";
import { addDays, formatSignedMoney, todayKey, weekdayShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EASE } from "@/components/landing/reveal";

/**
 * WeekStrip — the last seven days at a glance.
 * The calendar woven into the command center: every day shows its
 * result; clicking opens the full month in the calendar.
 */
export function WeekStrip({
  byDay,
  currency,
}: {
  byDay: Map<string, DayResult>;
  currency: CurrencyCode;
}) {
  const router = useRouter();
  const today = todayKey();
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));

  return (
    <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
      {days.map((date, i) => {
        const day = byDay.get(date);
        const isToday = date === today;
        const d = new Date(date + "T00:00:00");
        return (
          <motion.button
            key={date}
            onClick={() => router.push("/calendar")}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.05 + i * 0.04, ease: EASE }}
            whileHover={day ? { y: -2 } : undefined}
            aria-label={`${weekdayShort(date)} ${d.getDate()}: ${day ? formatSignedMoney(day.pnl, currency) : "no trades"}`}
            className={cn(
              "flex flex-col items-center gap-1 rounded-control border px-1 py-2.5 transition-colors",
              isToday
                ? "border-gold/50 bg-gold/[0.06]"
                : day
                  ? "border-line bg-raised/60 hover:border-line-strong"
                  : "border-transparent bg-transparent",
            )}
          >
            <span className={cn("text-[10px] font-medium uppercase tracking-wide", isToday ? "text-gold" : "text-faint")}>
              {weekdayShort(date)}
            </span>
            <span className={cn("text-[13px] font-semibold tabular", isToday ? "text-ink" : "text-muted")}>
              {d.getDate()}
            </span>
            {day ? (
              <span
                className={cn(
                  "num text-[10px] leading-none",
                  day.pnl > 0 ? "text-profit" : day.pnl < 0 ? "text-loss" : "text-faint",
                )}
              >
                {formatSignedMoney(day.pnl, currency, { compact: true })}
              </span>
            ) : (
              <span className="text-[10px] leading-none text-faint/60">—</span>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
