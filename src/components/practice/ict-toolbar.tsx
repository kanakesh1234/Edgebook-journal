"use client";

import type { RefObject } from "react";
import { motion } from "motion/react";
import { Sym, type SymName } from "@/components/journal/symbols";
import { IconButton, MenuDivider, MenuHeading, MenuItem, Popover, SPRING } from "@/components/journal/journal-ui";
import type { SortKey, StatusFilter } from "@/lib/practice/ict-library";
import { cn } from "@/lib/utils";

export type ViewMode = "list" | "grid" | "folders";
export type Crumb = { label: string; onClick: () => void };

const VIEWS: { id: ViewMode; label: string; icon: SymName }[] = [
  { id: "list", label: "List", icon: "list" },
  { id: "grid", label: "Grid", icon: "grid" },
  { id: "folders", label: "Concepts", icon: "folder" },
];
const SORTS: { id: SortKey; label: string }[] = [
  { id: "concept", label: "By concept" }, { id: "newest", label: "Newest first" }, { id: "oldest", label: "Oldest first" }, { id: "weakest", label: "Weakest first" },
];
const STATUSES: { id: StatusFilter; label: string }[] = [
  { id: "any", label: "All questions" }, { id: "new", label: "Not played yet" }, { id: "weak", label: "Needs practice" }, { id: "strong", label: "Strong" },
];

/** The Journal's toolbar, with the filters that make sense for a deck of questions. */
export function IctToolbar(p: {
  view: ViewMode; onView: (v: ViewMode) => void;
  crumbs: Crumb[]; onUp?: () => void; onSidebar: () => void;
  query: string; onQuery: (q: string) => void; searchRef: RefObject<HTMLInputElement | null>;
  status: StatusFilter; onStatus: (s: StatusFilter) => void; photo: boolean; onPhoto: (on: boolean) => void;
  sort: SortKey; onSort: (s: SortKey) => void;
}) {
  const filterCount = (p.status !== "any" ? 1 : 0) + (p.photo ? 1 : 0);
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-2 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-0.5">
        <IconButton label="Toggle sidebar" icon="sidebar" onClick={p.onSidebar} />
        {p.onUp && <IconButton label="Back" icon="chevronLeft" onClick={p.onUp} />}
        {p.crumbs.length > 1 && (
          <nav aria-label="Location" className="ml-1 hidden min-w-0 items-center sm:flex">
            {p.crumbs.map((c, i) => {
              const last = i === p.crumbs.length - 1;
              return (
                <span key={i} className="flex min-w-0 items-center">
                  {i > 0 && <Sym name="chevronRight" className="mx-0.5 h-3 w-3 text-faint" strokeWidth={2} />}
                  <button
                    type="button" onClick={c.onClick} aria-current={last ? "page" : undefined} disabled={last}
                    className={cn("truncate rounded-md px-1.5 py-1 text-[14px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold-strong/50", last ? "font-semibold text-ink" : "text-muted hover:text-ink")}
                  >
                    {c.label}
                  </button>
                </span>
              );
            })}
          </nav>
        )}
      </div>

      <div className="flex items-center gap-1">
        <div role="radiogroup" aria-label="View" className="mr-1 flex h-8 items-center rounded-[10px] bg-ink/[0.06] p-0.5">
          {VIEWS.map((v) => {
            const on = p.view === v.id;
            return (
              <button
                key={v.id} type="button" role="radio" aria-checked={on} aria-label={v.label} title={v.label} onClick={() => p.onView(v.id)}
                className={cn("relative grid h-7 w-8 place-items-center rounded-[8px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold-strong/50 sm:w-9", on ? "text-ink" : "text-muted hover:text-ink")}
              >
                {on && <motion.span layoutId="ict-view-thumb" transition={SPRING} className="absolute inset-0 rounded-[8px] bg-surface shadow-[0_1px_3px_rgb(0_0_0/0.14),0_0_0_0.5px_rgb(0_0_0/0.06)]" />}
                <Sym name={v.icon} className="relative h-[17px] w-[17px]" />
              </button>
            );
          })}
        </div>

        <Popover trigger={({ toggle, open }) => <IconButton label="Filter" icon="filter" onClick={toggle} active={open} dot={filterCount > 0} />}>
          {(close) => (
            <>
              <MenuHeading>Show</MenuHeading>
              {STATUSES.map((s) => <MenuItem key={s.id} checked={p.status === s.id} onClick={() => { p.onStatus(s.id); close(); }}>{s.label}</MenuItem>)}
              <MenuDivider />
              <MenuItem icon="photo" onClick={() => { p.onPhoto(!p.photo); close(); }} hint={p.photo ? "On" : undefined}>Only with a chart</MenuItem>
              {filterCount > 0 && (
                <>
                  <MenuDivider />
                  <MenuItem onClick={() => { p.onStatus("any"); p.onPhoto(false); close(); }}>Clear filters</MenuItem>
                </>
              )}
            </>
          )}
        </Popover>

        <Popover width={200} trigger={({ toggle, open }) => <IconButton label="Sort" icon="sort" onClick={toggle} active={open} dot={p.sort !== "concept"} />}>
          {(close) => (
            <>
              <MenuHeading>Sort by</MenuHeading>
              {SORTS.map((s) => <MenuItem key={s.id} checked={p.sort === s.id} onClick={() => { p.onSort(s.id); close(); }}>{s.label}</MenuItem>)}
            </>
          )}
        </Popover>
      </div>

      <label className="group order-last flex h-8 w-full items-center rounded-[10px] bg-ink/[0.06] pl-2.5 pr-1.5 transition-[width,background-color] duration-300 focus-within:bg-ink/[0.08] focus-within:ring-2 focus-within:ring-gold-strong/40 md:order-none md:w-48 md:focus-within:w-72">
        <Sym name="search" className="h-4 w-4 text-faint" />
        <input
          ref={p.searchRef} aria-label="Search questions" placeholder="Search" value={p.query} onChange={(e) => p.onQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Escape") { p.onQuery(""); (e.target as HTMLInputElement).blur(); } }}
          className="min-w-0 flex-1 bg-transparent px-2 text-[14px] text-ink outline-none placeholder:text-faint"
        />
        {p.query ? (
          <button type="button" aria-label="Clear search" onClick={() => p.onQuery("")} className="grid h-5 w-5 place-items-center rounded-full bg-ink/15 text-ink/70 transition-transform active:scale-90">
            <Sym name="xmark" className="h-2.5 w-2.5" strokeWidth={2.4} />
          </button>
        ) : (
          <kbd className="pointer-events-none hidden rounded-[5px] px-1.5 font-mono text-[11px] text-faint md:block">/</kbd>
        )}
      </label>
    </div>
  );
}
