"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { btnPrimary } from "./buttons";
import { Portal } from "./portal";
import { plural } from "./format";

/* ------------------------------ Filter model ------------------------------ */

export type Tab = "all" | "saved" | "yours" | "friends";
export type LengthFilter = "any" | "quick" | "medium" | "deep";
export type StatusFilter = "any" | "unread" | "reading" | "read";
export type SortKey = "newest" | "liked";

export interface Filters {
  tab: Tab;
  query: string;
  length: LengthFilter;
  status: StatusFilter;
  sort: SortKey;
}

export const DEFAULT_FILTERS: Filters = { tab: "all", query: "", length: "any", status: "any", sort: "newest" };

export const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "saved", label: "Saved" },
  { id: "yours", label: "Yours" },
  { id: "friends", label: "Friends" },
];

export const LENGTH_OPTIONS: { id: LengthFilter; label: string }[] = [
  { id: "any", label: "Any" },
  { id: "quick", label: "Under 5 min" },
  { id: "medium", label: "5–10 min" },
  { id: "deep", label: "Over 10 min" },
];

export const STATUS_OPTIONS: { id: StatusFilter; label: string }[] = [
  { id: "any", label: "Any" },
  { id: "unread", label: "Unread" },
  { id: "reading", label: "In progress" },
  { id: "read", label: "Read" },
];

export const SORT_OPTIONS: { id: SortKey; label: string }[] = [
  { id: "newest", label: "Newest" },
  { id: "liked", label: "Most liked" },
];

export const matchesLength = (mins: number, f: LengthFilter) =>
  f === "any" || (f === "quick" ? mins < 5 : f === "medium" ? mins >= 5 && mins <= 10 : mins > 10);

/* -------------------------------- Segmented -------------------------------- */

/** Apple-style segmented control: a quiet track with a single raised thumb that glides between options. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  layoutId,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
  label: string;
  layoutId: string;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("relative inline-flex rounded-[12px] bg-ink/[0.05] p-[3px]", className)}>
      {options.map((o) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.id)}
            className={cn(
              "relative isolate h-8 flex-1 whitespace-nowrap rounded-[9px] px-3.5 text-[13px] font-medium tracking-[-0.005em] transition-colors duration-200 md:flex-none",
              active ? "text-ink" : "text-muted hover:text-ink",
            )}
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 -z-10 rounded-[9px] border border-line bg-raised shadow-panel"
                transition={{ type: "spring", stiffness: 520, damping: 40 }}
              />
            )}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------ Filter panel ------------------------------- */

function ChoiceGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-faint">{label}</p>
      <div role="radiogroup" aria-label={label} className="mt-2.5 flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={o.id === value}
            className="fp-chip"
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Secondary filters, shown only on request.
 * Phones get a bottom sheet; tablet and desktop get a popover anchored under the Filter button.
 * Changes apply live; the primary button reports the result count and closes.
 */
export function FilterPanel({
  anchor,
  filters,
  resultCount,
  dirty,
  onChange,
  onReset,
  onClose,
}: {
  anchor: React.RefObject<HTMLElement | null>;
  filters: Filters;
  resultCount: number;
  dirty: boolean;
  onChange: (patch: Partial<Filters>) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [phone] = useState(() => typeof window !== "undefined" && window.matchMedia("(max-width: 639.98px)").matches);

  // Anchor the popover (≥ sm) to the Filter button; follows scroll/resize while open.
  useLayoutEffect(() => {
    const place = () => {
      const r = anchor.current?.getBoundingClientRect();
      if (r) setPos({ top: Math.round(r.bottom + 8), right: Math.max(12, Math.round(window.innerWidth - r.right)) });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, { passive: true });
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place);
    };
  }, [anchor]);

  useEffect(() => {
    const trigger = anchor.current;
    panelRef.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      trigger?.focus({ preventScroll: true });
    };
  }, [anchor, onClose]);

  const style = pos ? ({ "--fp-top": `${pos.top}px`, "--fp-right": `${pos.right}px` } as React.CSSProperties) : undefined;

  return (
    <Portal>
      <motion.div
        key="scrim"
        className="fp-scrim"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        aria-hidden="true"
      />
      <motion.div
        key="panel"
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Filter lessons"
        tabIndex={-1}
        className="fp"
        style={style}
        initial={{ opacity: 0, y: phone ? 48 : -6, scale: phone ? 1 : 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: phone ? 48 : -6, scale: phone ? 1 : 0.98 }}
        transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="fp-grab" aria-hidden="true" />
        <div className="flex items-center justify-between">
          <h2 className="text-[17px] font-semibold tracking-[-0.015em] text-ink">Filters</h2>
          <button
            type="button"
            onClick={onReset}
            disabled={!dirty}
            className="-mr-2 h-9 rounded-lg px-2 text-[13px] font-medium text-gold-deep transition-opacity hover:opacity-80 disabled:pointer-events-none disabled:text-faint dark:text-gold"
          >
            Reset
          </button>
        </div>

        <div className="mt-4 space-y-5">
          <ChoiceGroup label="Reading time" value={filters.length} options={LENGTH_OPTIONS} onChange={(length) => onChange({ length })} />
          <ChoiceGroup label="Progress" value={filters.status} options={STATUS_OPTIONS} onChange={(status) => onChange({ status })} />
          <ChoiceGroup label="Sort by" value={filters.sort} options={SORT_OPTIONS} onChange={(sort) => onChange({ sort })} />
        </div>

        <button type="button" className={cn(btnPrimary, "mt-6 h-11 w-full")} onClick={onClose}>
          {resultCount === 0 ? "No lessons match" : `Show ${plural(resultCount, "lesson")}`}
        </button>
      </motion.div>
    </Portal>
  );
}

/** Wrapper so callers get exit animations without importing AnimatePresence. */
export function FilterPanelPresence({ open, ...props }: { open: boolean } & React.ComponentProps<typeof FilterPanel>) {
  return <AnimatePresence>{open && <FilterPanel key="fp" {...props} />}</AnimatePresence>;
}
