"use client";

import { motion } from "motion/react";
import type { JournalEntry } from "@/lib/types";
import { formatSignedMoney, monthName, relativeDayLabel, weekdayShort } from "@/lib/format";
import { useImageUrls } from "@/lib/hooks";
import { Pill } from "@/components/ui/misc";
import {
  ImageIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { EASE } from "@/components/landing/reveal";

export function EntryCard({
  entry,
  index = 0,
  onOpen,
}: {
  entry: JournalEntry;
  index?: number;
  onOpen: (entry: JournalEntry) => void;
}) {
  const urls = useImageUrls(entry.images.map((i) => i.id));
  const rel = relativeDayLabel(entry.date);
  const d = new Date(entry.date + "T00:00:00");
  const dayNum = d.getDate();
  const month = monthName(d.getMonth()).slice(0, 3);
  const wd = weekdayShort(entry.date);

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.45, delay: Math.min(index * 0.05, 0.3), ease: EASE }}
      whileHover={{ y: -4 }}
      className="panel panel-hover group flex cursor-pointer flex-col overflow-hidden"
      onClick={() => onOpen(entry)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(entry);
        }
      }}
      aria-label={`Journal entry ${entry.date}, ${formatSignedMoney(entry.pnl)}`}
    >
      {/* Visual */}
      <div className={cn("relative bg-canvas", entry.images.length === 2 ? "grid grid-cols-2 gap-px" : "")}>
        {entry.images.length > 0 ? (
          entry.images.map((img, i) => {
            const url = urls[img.id];
            return (
              <div
                key={img.id}
                className={cn(
                  "relative aspect-[16/9] overflow-hidden",
                  i === 1 && entry.images.length === 2 && "border-l border-line",
                )}
              >
                {url ? (
                  <img
                    src={url}
                    alt=""
                    loading="lazy"
                    draggable={false}
                    className="h-full w-full object-cover opacity-90 transition-all duration-500 group-hover:scale-[1.04] group-hover:opacity-100"
                  />
                ) : (
                  <div className="h-full w-full animate-pulse bg-raised" />
                )}
              </div>
            );
          })
        ) : (
          <div className="dot-backdrop relative flex aspect-[16/7] items-center justify-center">
              <span
                className={cn(
                  "kpi text-3xl transition-transform duration-500 group-hover:scale-110",
                  entry.pnl >= 0 ? "text-profit/25" : "text-loss/25",
                )}
              >
              {entry.pnl > 0 ? "+" : ""}
              {Math.abs(Math.round(entry.pnl))}
            </span>
          </div>
        )}

        {/* P&L badge */}
        <span
          className={cn(
            "num absolute left-3 top-3 rounded-lg border px-2 py-1 text-xs backdrop-blur-md",
            entry.pnl > 0
              ? "border-profit/40 bg-canvas/80 text-profit"
              : entry.pnl < 0
                ? "border-loss/40 bg-canvas/80 text-loss"
                : "border-line bg-canvas/70 text-muted",
          )}
        >
          {formatSignedMoney(entry.pnl)}
        </span>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-baseline justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <span className="font-display text-lg font-bold leading-none text-ink">{dayNum}</span>
            <span className="text-xs font-medium uppercase tracking-wide text-faint">{month}</span>
            <span className="text-xs text-faint">·</span>
            <span className="text-xs text-muted">{wd}</span>
            {rel && (
              <span className="rounded-full border border-gold/25 bg-gold/[0.07] px-1.5 py-0.5 text-[10px] font-semibold text-gold">
                {rel}
              </span>
            )}
          </div>
          {entry.rr != null && (
              <span
                className={cn(
                  "num text-xs",
                  entry.rr > 0 ? "text-info" : "text-faint",
                )}
              >
              {entry.rr > 0 ? "+" : ""}
              {entry.rr}R
            </span>
          )}
        </div>

        {(entry.instrument !== "—" || entry.setup || entry.direction) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {entry.instrument !== "—" && (
              <Pill className="font-mono !py-0.5 !text-[10px] !text-ink">{entry.instrument}</Pill>
            )}
            {entry.direction && (
              <Pill
                className={cn(
                  "!py-0.5 !text-[10px]",
                  entry.direction === "long"
                    ? "!border-profit/25 !text-profit"
                    : "!border-loss/25 !text-loss",
                )}
              >
                {entry.direction === "long" ? (
                  <TrendingUpIcon className="h-3 w-3" />
                ) : (
                  <TrendingDownIcon className="h-3 w-3" />
                )}
                {entry.direction}
              </Pill>
            )}
            {entry.setup && (
              <Pill className="max-w-full truncate !border-gold/20 !py-0.5 !text-[10px] !text-gold">
                {entry.setup}
              </Pill>
            )}
          </div>
        )}

        <p className="mt-2.5 line-clamp-2 min-h-10 flex-1 text-[13px] leading-relaxed text-muted">
          {entry.notes || <span className="italic text-faint">No notes for this session.</span>}
        </p>

        {entry.images.length > 0 && (
          <p className="mt-2.5 flex items-center gap-1.5 text-[11px] text-faint">
            <ImageIcon className="h-3.5 w-3.5" />
            {entry.images.length} screenshot{entry.images.length > 1 ? "s" : ""}
          </p>
        )}
      </div>
    </motion.article>
  );
}
