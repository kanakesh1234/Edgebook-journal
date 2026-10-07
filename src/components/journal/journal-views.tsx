"use client";

import { memo } from "react";
import type { JournalEntry } from "@/lib/types";
import { reviewStatusOf } from "@/lib/types";
import { relativeDayLabel } from "@/lib/format";
import { useImageUrls } from "@/lib/hooks";
import { Sym } from "./symbols";
import { dayShort, groupMonthDay, monthLabel, pathLabel, pct, tradeTitle, type Node } from "./journal-model";
import { cn } from "@/lib/utils";

export type Money = (n: number) => string;
const tone = (n: number) => (n > 0 ? "text-profit" : n < 0 ? "text-loss" : "text-muted");

export type RowProps = {
  money: Money; selectMode: boolean; selectedIds: Set<string>;
  onOpen: (e: JournalEntry) => void;
  onToggle: (e: JournalEntry, shift: boolean) => void;
  onContext: (e: JournalEntry, x: number, y: number) => void;
};

/** Leading-edge dot, like an unread mark: present only when the trade still needs a review. */
function ReviewMark({ entry }: { entry: JournalEntry }) {
  const s = entry.reviewStatus ?? reviewStatusOf(entry);
  if (s === "reviewed") return <span className="w-2 shrink-0" />;
  return <span role="img" aria-label="Needs review" title="Needs review" className="h-2 w-2 shrink-0 rounded-full bg-gold-strong" />;
}

function SelectDot({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border transition-all duration-200", on ? "scale-100 border-gold-strong bg-gold-strong text-on-gold" : "border-line-strong text-transparent")}>
      <Sym name="check" className="h-3 w-3" strokeWidth={2.6} />
    </span>
  );
}

function useThumb(entry: JournalEntry) {
  const urls = useImageUrls(entry.images.slice(0, 1).map((i) => i.id));
  return entry.images[0] ? urls[entry.images[0].id] : null;
}

/* ───────────── List row ───────────── */
export const TradeRow = memo(function TradeRow({ entry, showDate, p }: { entry: JournalEntry; showDate?: boolean; p: RowProps }) {
  const thumb = useThumb(entry);
  const selected = p.selectedIds.has(entry.id);
  return (
    <button
      type="button" role="listitem"
      onClick={(e) => (p.selectMode ? p.onToggle(entry, e.shiftKey) : p.onOpen(entry))}
      onContextMenu={(e) => { e.preventDefault(); p.onContext(entry, e.clientX, e.clientY); }}
      aria-pressed={p.selectMode ? selected : undefined}
      className={cn(
        "relative flex w-full items-center gap-3 rounded-[12px] px-2.5 py-2 text-left outline-none transition-colors duration-150",
        "after:absolute after:bottom-0 after:left-[88px] after:right-2.5 after:h-px after:bg-line-soft last:after:hidden",
        "hover:bg-ink/[0.04] active:bg-ink/[0.07] focus-visible:ring-2 focus-visible:ring-gold-strong/50",
        selected && "bg-gold/[0.11] hover:bg-gold/[0.13]",
      )}
    >
      {p.selectMode ? <SelectDot on={selected} /> : <ReviewMark entry={entry} />}
      <div className="relative h-[42px] w-[62px] shrink-0 overflow-hidden rounded-[9px] bg-ink/[0.05]">
        {thumb ? (
          <img src={thumb} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
        ) : entry.images.length > 0 ? (
          <div className="h-full w-full animate-pulse bg-ink/[0.06]" />
        ) : (
          <div className={cn("grid h-full w-full place-items-center", tone(entry.pnl))}>
            <Sym name={entry.direction === "short" ? "arrowDownRight" : "arrowUpRight"} className="h-5 w-5 opacity-70" />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium capitalize tracking-[-0.01em] text-ink">
          {tradeTitle(entry)}
          {entry.tradeNumber ? <span className="ml-2 font-normal text-faint">Trade {entry.tradeNumber}</span> : null}
        </p>
        <p className="mt-px truncate text-[13px] text-muted">
          {showDate && <span>{dayShort(entry.date)}{entry.setup || entry.notes ? " · " : ""}</span>}
          {entry.setup}
          {entry.setup && entry.notes ? " · " : ""}
          {entry.notes || (!entry.setup && !showDate ? <span className="text-faint">No notes</span> : null)}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className={cn("kpi text-[15px] tabular-nums", tone(entry.pnl))}>{p.money(entry.pnl)}</p>
        {entry.rr != null && <p className="num mt-px text-[12px] text-faint">{entry.rr > 0 ? "+" : ""}{entry.rr}R</p>}
      </div>
    </button>
  );
});

/* ───────────── Grid tile ───────────── */
export const TradeTile = memo(function TradeTile({ entry, showDate, p, anchor }: { entry: JournalEntry; showDate?: boolean; p: RowProps; anchor?: string }) {
  const thumb = useThumb(entry);
  const selected = p.selectedIds.has(entry.id);
  const unreviewed = (entry.reviewStatus ?? reviewStatusOf(entry)) !== "reviewed";
  return (
    <button
      type="button" role="listitem"
      onClick={(e) => (p.selectMode ? p.onToggle(entry, e.shiftKey) : p.onOpen(entry))}
      onContextMenu={(e) => { e.preventDefault(); p.onContext(entry, e.clientX, e.clientY); }}
      aria-pressed={p.selectMode ? selected : undefined}
      id={anchor} className="group block w-full scroll-mt-[calc(var(--tb)+56px)] text-left outline-none"
    >
      <div className={cn(
        "relative aspect-[4/3] overflow-hidden rounded-[14px] bg-ink/[0.05] transition-[transform,box-shadow] duration-200 ease-out",
        "group-hover:shadow-[0_8px_24px_-12px_rgb(0_0_0/0.35)] group-active:scale-[0.98] group-focus-visible:ring-2 group-focus-visible:ring-gold-strong/60",
        selected && "ring-[3px] ring-gold-strong",
      )}>
        {thumb ? (
          <img src={thumb} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
        ) : entry.images.length > 0 ? (
          <div className="h-full w-full animate-pulse" />
        ) : (
          <div className={cn("grid h-full w-full place-items-center", tone(entry.pnl))}>
            <Sym name={entry.direction === "short" ? "arrowDownRight" : "arrowUpRight"} className="h-8 w-8 opacity-50" strokeWidth={1.3} />
          </div>
        )}
        {p.selectMode && <span className="absolute left-2 top-2"><SelectDot on={selected} /></span>}
        {!p.selectMode && unreviewed && <span aria-label="Needs review" className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-gold-strong ring-2 ring-white/70" />}
        {entry.images.length > 1 && (
          <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/45 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-md">
            <Sym name="photo" className="h-3 w-3" />{entry.images.length}
          </span>
        )}
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2 px-0.5">
        <p className="truncate text-[14px] font-medium capitalize text-ink">{tradeTitle(entry)}</p>
        <p className={cn("kpi shrink-0 text-[14px] tabular-nums", tone(entry.pnl))}>{p.money(entry.pnl)}</p>
      </div>
      <p className="truncate px-0.5 text-[12.5px] text-muted">{[showDate ? dayShort(entry.date) : null, entry.setup, entry.rr != null ? `${entry.rr > 0 ? "+" : ""}${entry.rr}R` : null].filter(Boolean).join(" · ") || "\u00A0"}</p>
    </button>
  );
});

/* ───────────── Timeline: list or grid, grouped by month (list also by day) ───────────── */
export function Timeline({ entries, layout, grouped, p }: { entries: JournalEntry[]; layout: "list" | "grid"; grouped: boolean; p: RowProps }) {
  const gridCls = "grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-[repeat(auto-fill,minmax(224px,1fr))]";
  const rows = (items: JournalEntry[], showDate: boolean) => (
    <div role="list" className="-mx-2.5">{items.map((e) => <TradeRow key={e.id} entry={e} showDate={showDate} p={p} />)}</div>
  );
  const tiles = (items: JournalEntry[]) => {
    const seen = new Set<string>();
    return (
      <div role="list" className={gridCls}>
        {items.map((e) => { const first = !seen.has(e.date); seen.add(e.date); return <TradeTile key={e.id} entry={e} showDate p={p} anchor={first ? `day-${e.date}` : undefined} />; })}
      </div>
    );
  };

  if (!grouped) return layout === "list" ? rows(entries, true) : tiles(entries);

  const groups = groupMonthDay(entries);
  const showMonths = groups.length > 1;
  return (
    <div>
      {groups.map((g) => (
        <section key={g.key} aria-label={monthLabel(g.key)} className="mb-12">
          {showMonths && (
            <div className="sticky top-[var(--tb)] z-10 mb-1 flex items-baseline justify-between bg-canvas/85 py-3 backdrop-blur-md">
              <h2 className="text-[19px] font-semibold tracking-[-0.02em] text-ink">{monthLabel(g.key)}</h2>
              <p className="num text-[13px] text-muted">
                {g.summary.count} {g.summary.count === 1 ? "trade" : "trades"} <span className="mx-1 text-faint">·</span><span className={tone(g.summary.net)}>{p.money(g.summary.net)}</span>
              </p>
            </div>
          )}
          {layout === "grid" ? (
            <div className={showMonths ? "pt-1" : ""}>{tiles(g.days.flatMap((d) => d.items))}</div>
          ) : (
            g.days.map((d) => {
              const rel = relativeDayLabel(d.date);
              return (
                <div key={d.date} id={`day-${d.date}`} className="mb-3 scroll-mt-[calc(var(--tb)+56px)]">
                  <div className="flex items-baseline justify-between pb-1 pt-3">
                    <p className="text-[13px] font-semibold text-ink/80">{dayShort(d.date)}{rel && <span className="ml-2 font-medium text-gold">{rel}</span>}</p>
                    <p className={cn("num text-[13px]", tone(d.net))}>{p.money(d.net)}</p>
                  </div>
                  {rows(d.items, false)}
                </div>
              );
            })
          )}
        </section>
      ))}
    </div>
  );
}

/* ───────────── Folder level (Year / Month / Day) ───────────── */
export function FolderList({ nodes, onOpen, money }: { nodes: Node[]; onOpen: (key: string) => void; money: Money }) {
  return (
    <div role="list" className="-mx-2.5">
      {nodes.map((n) => {
        const day = n.key.length === 10;
        return (
          <button
            key={n.key} type="button" role="listitem" onClick={() => onOpen(n.key)}
            className="group relative flex w-full items-center gap-3.5 rounded-[12px] px-2.5 py-3 text-left outline-none transition-colors duration-150 after:absolute after:bottom-0 after:left-[52px] after:right-2.5 after:h-px after:bg-line-soft last:after:hidden hover:bg-ink/[0.04] active:bg-ink/[0.07] focus-visible:ring-2 focus-visible:ring-gold-strong/50"
          >
            <Sym name={day ? "calendar" : "folder"} className="h-[26px] w-[26px] text-gold-strong" strokeWidth={1.4} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[16px] font-medium tracking-[-0.01em] text-ink">{day ? dayShort(n.key) : pathLabel(n.key)}</p>
              <p className="text-[13px] text-muted">{n.count} {n.count === 1 ? "trade" : "trades"}, {pct(n.wins, n.count)} won</p>
            </div>
            <p className={cn("kpi text-[15px] tabular-nums", tone(n.net))}>{money(n.net)}</p>
            <Sym name="chevronRight" className="h-3.5 w-3.5 text-faint transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2} />
          </button>
        );
      })}
    </div>
  );
}
