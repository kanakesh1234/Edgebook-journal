"use client";

import { motion, useReducedMotion } from "motion/react";
import type { JournalEntry } from "@/lib/types";
import { reviewStatusOf } from "@/lib/types";
import { formatDateMedium, formatSignedMoney } from "@/lib/format";
import { useImageUrls } from "@/lib/hooks";
import { CheckIcon, ImageIcon, TrendingDownIcon, TrendingUpIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

const SPRING = { type: "spring", stiffness: 420, damping: 34 } as const;

/** Review state as a quiet dot — never a badge. */
export function ReviewDot({ entry }: { entry: JournalEntry }) {
  const s = entry.reviewStatus ?? reviewStatusOf(entry);
  const map = {
    reviewed: ["bg-profit", "Reviewed"],
    in_progress: ["bg-gold-strong", "Review in progress"],
    incomplete: ["bg-gold-strong", "Review incomplete"],
    not_reviewed: ["bg-line-strong", "Not reviewed"],
  } as const;
  const [cls, label] = map[s] ?? map.not_reviewed;
  return <span role="img" aria-label={label} title={label} className={cn("h-2 w-2 shrink-0 rounded-full", cls)} />;
}

/**
 * One trade, one line of reading: thumbnail · what it was · how it ended.
 * Rendered as a list row (not a tile) so a month of trades scans like a logbook.
 */
export function EntryCard({
  entry,
  index = 0,
  onOpen,
  selectMode = false,
  selected = false,
  onToggle,
  showDate = false,
}: {
  entry: JournalEntry;
  index?: number;
  onOpen: (entry: JournalEntry) => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggle?: (entry: JournalEntry) => void;
  /** Ranked (non-chronological) lists need the date on the row itself. */
  showDate?: boolean;
}) {
  const reduce = useReducedMotion();
  const activate = () => (selectMode && onToggle ? onToggle(entry) : onOpen(entry));
  const urls = useImageUrls(entry.images.slice(0, 1).map((i) => i.id));
  const thumb = entry.images[0] ? urls[entry.images[0].id] : null;
  const tone = entry.pnl > 0 ? "text-profit" : entry.pnl < 0 ? "text-loss" : "text-muted";
  const Dir = entry.direction === "short" ? TrendingDownIcon : TrendingUpIcon;
  const title = [entry.instrument !== "—" ? entry.instrument : null, entry.direction, entry.tradeNumber ? `Trade ${entry.tradeNumber}` : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <motion.article
      layout="position"
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ ...SPRING, delay: Math.min(index * 0.025, 0.2) }}
      whileTap={reduce ? undefined : { scale: 0.985 }}
      onClick={activate}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      }}
      aria-pressed={selectMode ? selected : undefined}
      aria-label={`Trade ${entry.date}, ${formatSignedMoney(entry.pnl)}`}
      className={cn(
        "group flex cursor-pointer items-center gap-3.5 rounded-[18px] border border-line bg-surface p-2.5 pr-4 transition-[border-color,box-shadow,background-color] duration-200",
        "hover:border-line-strong hover:shadow-[0_10px_26px_-16px_rgb(48_40_24/0.3)] dark:hover:shadow-[0_12px_28px_-16px_rgb(0_0_0/0.6)]",
        selectMode && selected && "!border-gold-strong bg-gold/[0.05]",
      )}
    >
      {selectMode && (
        <span
          aria-hidden
          className={cn(
            "ml-1 grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-colors",
            selected ? "border-gold-strong bg-gold-strong text-on-gold" : "border-line-strong text-transparent",
          )}
        >
          <CheckIcon className="h-3 w-3" />
        </span>
      )}

      <div className="relative h-[54px] w-[76px] shrink-0 overflow-hidden rounded-[12px] border border-line-soft bg-canvas">
        {thumb ? (
          <img src={thumb} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.05]" />
        ) : entry.images.length > 0 ? (
          <div className="h-full w-full animate-pulse bg-raised" />
        ) : (
          <div className={cn("grid h-full w-full place-items-center", entry.pnl >= 0 ? "bg-profit/[0.07] text-profit/70" : "bg-loss/[0.07] text-loss/70")}>
            <Dir className="h-5 w-5" />
          </div>
        )}
        {entry.images.length > 1 && (
          <span className="absolute bottom-1 right-1 flex items-center gap-0.5 rounded-full bg-black/55 px-1.5 py-px text-[10px] font-medium text-white backdrop-blur">
            <ImageIcon className="h-2.5 w-2.5" />
            {entry.images.length}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <ReviewDot entry={entry} />
          <p className="truncate text-[14.5px] font-semibold capitalize tracking-[-0.01em] text-ink">
            {title || "Trade"}
          </p>
          {showDate && <span className="shrink-0 text-[12px] text-faint">{formatDateMedium(entry.date)}</span>}
        </div>
        <p className="mt-0.5 truncate text-[13px] text-muted">
          {entry.setup ? <span className="text-gold">{entry.setup}</span> : null}
          {entry.setup && entry.notes ? <span className="text-faint"> · </span> : null}
          {entry.notes || (!entry.setup ? <span className="text-faint">No notes</span> : null)}
        </p>
      </div>

      <div className="shrink-0 text-right">
        <p className={cn("kpi text-[16px] tabular-nums", tone)}>{formatSignedMoney(entry.pnl)}</p>
        {entry.rr != null && <p className="num mt-0.5 text-[12px] text-faint">{entry.rr > 0 ? "+" : ""}{entry.rr}R</p>}
      </div>
    </motion.article>
  );
}
