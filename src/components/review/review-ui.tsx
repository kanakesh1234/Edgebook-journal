"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, animate, motion, useReducedMotion } from "motion/react";
import { Sym, type SymName } from "@/components/journal/symbols";
import { EASE, SPRING } from "@/components/journal/journal-ui";
import { formatMoney, formatSignedMoney } from "@/lib/format";
import { useApp } from "@/lib/store";
import type { ProcessGrade } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { SaveState } from "./use-review-notes";

/* ─────────────────────────────────────────────────────────────
   Formatting
───────────────────────────────────────────────────────────── */

export const useMoney = () => {
  const currency = useApp((s) => s.settings.currency);
  return { money: (n: number) => formatMoney(n, currency, { decimals: Math.abs(n) % 1 ? 2 : 0 }), signed: (n: number) => formatSignedMoney(n, currency) };
};
export const fmtPct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);
export const fmtR = (n: number | null) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(2)}R`);
export const tone = (n: number | null) => (n == null || n === 0 ? "text-ink" : n > 0 ? "text-profit" : "text-loss");

/** The sections of each review, in order. Drives the floating section index. */
export type SectionDef = { id: string; label: string; icon: SymName };
export const WEEKLY_SECTIONS: SectionDef[] = [
  { id: "a1", label: "Scorecard", icon: "gauge" },
  { id: "a2", label: "Daily log", icon: "list" },
  { id: "a3", label: "Edge & Patterns", icon: "sparkles" },
  { id: "a5", label: "3-Min Ritual", icon: "target" },
];
export const MONTHLY_SECTIONS: SectionDef[] = [
  { id: "b1", label: "Scorecard", icon: "gauge" },
  { id: "b3", label: "Equity curve", icon: "chart" },
  { id: "b2", label: "Session log", icon: "list" },
  { id: "b4", label: "Edge & Prop", icon: "shield" },
  { id: "b6", label: "3-Min Ritual", icon: "target" },
];

/**
 * Apple HIG unhurried progressive reveal hook for review questions:
 * Waits until the user has typed at least `minChars` characters AND paused typing for `delayMs`
 * before latching `true` so the next question never jarringly pops in on the very first keystroke.
 */
export function useReviewSettledReveal(
  text: string,
  alreadyAnsweredDownstream: boolean,
  resetKey: string,
  minChars = 3,
  delayMs = 680,
): { settled: boolean; typing: boolean } {
  const [latched, setLatched] = useState(false);
  useEffect(() => {
    setLatched(false);
  }, [resetKey]);

  const trimmed = text.trim();
  useEffect(() => {
    if (alreadyAnsweredDownstream) {
      setLatched(true);
      return;
    }
    if (trimmed.length < minChars) return;
    const timer = window.setTimeout(() => setLatched(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [trimmed, alreadyAnsweredDownstream, minChars, delayMs]);

  return {
    settled: latched || alreadyAnsweredDownstream,
    typing: !latched && !alreadyAnsweredDownstream && trimmed.length > 0,
  };
}

/* ─────────────────────────────────────────────────────────────
   Motion
───────────────────────────────────────────────────────────── */

/**
 * A number that rolls to its value. Written straight to the DOM so a 60fps tween never re-renders React.
 * `decimals` rounds the in-between frames, so "$1,240" never flickers through "$1,239.87".
 */
export function AnimatedNumber({ value, format, decimals, className, delay = 0.1 }: { value: number; format: (n: number) => string; decimals?: number; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);
  const fmt = useRef(format);
  fmt.current = format;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const dp = decimals ?? (Number.isInteger(value) ? 0 : 2);
    const round = (v: number) => { const k = 10 ** dp; return Math.round(v * k) / k; };
    if (reduce) { el.textContent = fmt.current(value); from.current = value; return; }
    const controls = animate(from.current, value, {
      duration: 0.9, delay, ease: EASE,
      onUpdate: (v) => { el.textContent = fmt.current(round(v)); },
      onComplete: () => { el.textContent = fmt.current(value); },
    });
    from.current = value;
    return () => controls.stop();
  }, [value, decimals, reduce, delay]);
  return <span ref={ref} className={className}>{format(reduce ? value : 0)}</span>;
}

/** A check that draws itself. */
export function DrawCheck({ className, strokeWidth = 3 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={cn("h-3 w-3", className)}>
      <motion.path d="m5 12.5 4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.22, ease: EASE }} />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────
   Structure
───────────────────────────────────────────────────────────── */

/** A section: a gold symbol, a title, one line of context. Content sits directly beneath. */
export function Section({ id, icon, title, hint, aside, children }: { id?: string; /** Kept for call-site compatibility (A.1, B.3 …); the section index replaces it visually. */ code?: string; icon: SymName; title: string; hint?: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-h` : undefined} className="scroll-mt-32">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 id={id ? `${id}-h` : undefined} className="flex items-center gap-2 font-display text-[22px] font-semibold leading-tight tracking-[-0.025em] text-ink">
            <Sym name={icon} className="h-[19px] w-[19px] text-gold" strokeWidth={1.8} />{title}
          </h2>
          {hint && <p className="mt-1 max-w-[72ch] text-pretty text-[14px] leading-snug text-muted">{hint}</p>}
        </div>
        {aside && <div className="shrink-0 pb-0.5">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

export const Card = ({ children, className, pad = true }: { children: ReactNode; className?: string; pad?: boolean }) => (
  <div className={cn("rounded-[22px] border border-line-soft bg-surface shadow-panel", pad && "p-5 sm:p-6", className)}>{children}</div>
);

/** A figure with its label. Unboxed — the surface around it provides the structure. */
export function Kpi({ label, value, sub, valueClass, hint, className }: { label: string; value: ReactNode; sub?: string; valueClass?: string; hint?: string; className?: string }) {
  return (
    <div className={cn("min-w-0", className)} title={hint}>
      <p className="truncate text-[13px] font-medium text-muted">{label}</p>
      <p className={cn("num mt-1 truncate text-[26px] font-semibold leading-none tracking-[-0.03em] text-ink", valueClass)}>{value}</p>
      {sub && <p className="mt-1.5 truncate text-[12.5px] text-faint">{sub}</p>}
    </div>
  );
}

/**
 * A row of figures divided by hairlines. On phones each figure becomes a list row (label left, value right);
 * from `lg` up they sit side by side, label above value.
 */
export function StatStrip({ children, count, className }: { children: ReactNode; count: number; className?: string }) {
  return <div className={cn("divide-y divide-line-soft lg:grid lg:divide-x lg:divide-y-0", className)} style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}>{children}</div>;
}
export function StripCell({ label, value, sub, valueClass, hint }: { label: string; value: ReactNode; sub?: string; valueClass?: string; hint?: string }) {
  return (
    <div title={hint} className="grid min-w-0 grid-cols-[1fr_auto] items-center gap-x-4 px-5 py-3.5 lg:flex lg:flex-col lg:items-stretch lg:gap-0 lg:px-6 lg:py-5">
      <p className="col-start-1 row-start-1 truncate text-[13px] font-medium text-muted lg:order-1">{label}</p>
      <p className={cn("num col-start-2 row-span-2 row-start-1 truncate text-[20px] font-semibold leading-none tracking-[-0.02em] text-ink lg:order-2 lg:mt-2 lg:text-[24px]", valueClass)}>{value}</p>
      {sub && <p className="col-start-1 row-start-2 mt-0.5 truncate text-[12.5px] text-faint lg:order-3 lg:mt-1.5">{sub}</p>}
    </div>
  );
}

/** An inset list, like Settings: rows on one soft surface, hairlines between. */
export function Group({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      {title && <p className="mb-2 px-1 text-[13px] font-medium text-muted">{title}</p>}
      <div className="divide-y divide-line-soft overflow-hidden rounded-[18px] border border-line-soft bg-surface shadow-panel">{children}</div>
    </div>
  );
}
export function StatRow({ label, value, sub, valueClass, onClick, hint }: { label: string; value: ReactNode; sub?: string; valueClass?: string; onClick?: () => void; hint?: string }) {
  const body = (
    <>
      <span className="min-w-0 flex-1 text-left"><span className="block truncate text-[14.5px] text-ink">{label}</span>{sub && <span className="block truncate text-[12.5px] text-faint">{sub}</span>}</span>
      <span className={cn("num shrink-0 text-[16px] font-semibold tracking-[-0.01em] text-ink", valueClass)}>{value}</span>
      {onClick && <Sym name="chevronRight" className="h-4 w-4 text-faint transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2} />}
    </>
  );
  const cls = "flex min-h-[52px] w-full items-center gap-3 px-4 py-2.5";
  return onClick
    ? <button type="button" title={hint} onClick={onClick} className={cn(cls, "group outline-none transition-colors hover:bg-ink/[0.035] focus-visible:bg-ink/[0.05] active:bg-ink/[0.07]")}>{body}</button>
    : <div title={hint} className={cls}>{body}</div>;
}

export function Chip({ children, tone: t = "neutral", className }: { children: ReactNode; tone?: "neutral" | "good" | "bad" | "gold" | "info"; className?: string }) {
  const c = { neutral: "bg-ink/[0.06] text-muted", good: "bg-profit/12 text-profit", bad: "bg-loss/12 text-loss", gold: "bg-gold/[0.14] text-gold-deep dark:text-gold", info: "bg-info/12 text-info" }[t];
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium leading-none", c, className)}>{children}</span>;
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { id: T; label: string; icon?: SymName }[]; label: string }) {
  const gid = useId();
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-[12px] bg-ink/[0.06] p-[3px]">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button key={o.id} type="button" role="tab" aria-selected={on} onClick={() => onChange(o.id)} className={cn("relative flex h-8 items-center gap-1.5 rounded-[9px] px-3.5 text-[13.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold-strong/50", on ? "text-ink" : "text-muted hover:text-ink")}>
            {on && <motion.span layoutId={`seg-${gid}`} transition={SPRING} className="absolute inset-0 rounded-[9px] bg-raised shadow-[0_1px_2px_rgb(0_0_0/0.1),0_0_0_0.5px_rgb(0_0_0/0.06)]" />}
            <span className="relative flex items-center gap-1.5">{o.icon && <Sym name={o.icon} className="h-[15px] w-[15px]" />}{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Writing
───────────────────────────────────────────────────────────── */

/** A question and its answer field. */
export const Prompt = ({ q, step, done, typing, children, className }: { q: string; step?: number; done?: boolean; typing?: boolean; children: ReactNode; className?: string }) => (
  <div className={className}>
    <div className="mb-2.5 flex items-center justify-between gap-2 px-0.5">
      <div className="flex items-center gap-2.5 min-w-0">
        {step != null && (
          <span
            className={cn(
              "num grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold transition-colors duration-300",
              done
                ? "bg-profit text-white shadow-[0_4px_10px_-2px_rgb(22_163_74/0.4)]"
                : "bg-gold/[0.15] text-gold-deep dark:text-gold",
            )}
          >
            {done ? <DrawCheck className="h-3 w-3" /> : step}
          </span>
        )}
        <p className="text-[15.5px] font-semibold leading-snug tracking-[-0.01em] text-ink">{q}</p>
      </div>
      <AnimatePresence initial={false}>
        {typing && (
          <motion.span
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-medium text-gold"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold-strong" />
            <span>Settling…</span>
          </motion.span>
        )}
      </AnimatePresence>
    </div>
    {children}
  </div>
);

export type SmartChipOption = {
  label: string;
  text: string;
  tone?: "good" | "bad" | "gold" | "ai";
};

/** A writing field that grows with its text. Looks like a note, not a form control. Supports one-tap AI smart chips. */
export function AutoText({ value, onChange, placeholder, label, minRows = 2, maxLength = 4000, className, suggest, chips }: {
  value: string; onChange: (v: string) => void; placeholder?: string; label: string; minRows?: number; maxLength?: number; className?: string;
  /** A factual sentence built from the trader's data that one tap appends. */
  suggest?: { text: string; label?: string } | null;
  /** Multiple one-tap smart chips pre-computed from the period's real trades & AI Brain. */
  chips?: SmartChipOption[];
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => { const el = ref.current; if (!el) return; el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; };
  useLayoutEffect(fit, [value]);
  useEffect(() => { const ro = new ResizeObserver(fit); if (ref.current) ro.observe(ref.current); return () => ro.disconnect(); }, []);
  const words = value.trim() ? value.trim().split(/\s+/).length : 0;

  const allChips: SmartChipOption[] = [
    ...(suggest ? [{ label: suggest.label ?? "Add from your data", text: suggest.text, tone: "gold" as const }] : []),
    ...(chips ?? []),
  ].filter((c) => c.text && !value.includes(c.text));

  const appendText = (snippet: string) => {
    onChange(value.trim() ? `${value.replace(/\s+$/, "")} ${snippet}` : snippet);
  };

  return (
    <div className={cn("group rounded-[18px] border border-line-soft bg-ink/[0.035] transition-[box-shadow,background-color,border-color] duration-200 hover:bg-ink/[0.05] focus-within:border-gold/45 focus-within:bg-raised focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--gold-strong)_18%,transparent),0_8px_24px_-12px_rgb(0_0_0/0.16)]", className)}>
      <textarea
        ref={ref} aria-label={label} value={value} rows={minRows} maxLength={maxLength} placeholder={placeholder} onChange={(e) => onChange(e.target.value)}
        className="block w-full resize-none rounded-[18px] bg-transparent px-4 pb-1.5 pt-3.5 text-[15px] leading-[1.58] text-ink outline-none placeholder:text-faint"
      />
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-2 px-3 pb-2.5 pt-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {allChips.map((chip, idx) => {
            const chipTone =
              chip.tone === "good"
                ? "bg-profit/12 text-profit hover:bg-profit/20"
                : chip.tone === "bad"
                  ? "bg-loss/12 text-loss hover:bg-loss/20"
                  : chip.tone === "ai"
                    ? "bg-gold/15 text-gold-deep hover:bg-gold/25 dark:text-gold"
                    : "bg-gold/[0.12] text-gold-deep hover:bg-gold/[0.2] dark:text-gold";
            return (
              <button
                key={`${chip.label}-${idx}`}
                type="button"
                onClick={() => appendText(chip.text)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-medium outline-none transition-[transform,background-color] focus-visible:ring-2 focus-visible:ring-gold-strong/50 active:scale-[0.96]",
                  chipTone,
                )}
              >
                <Sym name="sparkles" className="h-3 w-3" />
                <span>+ {chip.label}</span>
              </button>
            );
          })}
        </div>
        <span className={cn("num ml-auto text-[11.5px] font-normal transition-opacity duration-200", words ? "text-faint opacity-100" : "opacity-0")}>{words} {words === 1 ? "word" : "words"}</span>
      </div>
    </div>
  );
}

export function LineInput({ value, onChange, placeholder, label, index }: { value: string; onChange: (v: string) => void; placeholder: string; label: string; index?: number }) {
  return (
    <label className="flex items-center gap-3 rounded-[14px] bg-ink/[0.04] px-3.5 transition-[box-shadow,background-color] duration-200 hover:bg-ink/[0.055] focus-within:bg-raised focus-within:shadow-[0_0_0_2px_color-mix(in_srgb,var(--gold-strong)_45%,transparent),0_6px_20px_-10px_rgb(0_0_0/0.18)]">
      {index != null && <span className="num grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-gold/[0.15] text-[12px] font-semibold text-gold-deep dark:text-gold">{index}</span>}
      <input aria-label={label} value={value} maxLength={300} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} className="h-12 min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-faint" />
    </label>
  );
}

const GRADE_TONE: Record<ProcessGrade, string> = { A: "bg-profit/15 text-profit", B: "bg-info/15 text-info", C: "bg-gold/[0.18] text-gold-deep dark:text-gold", D: "bg-loss/15 text-loss" };

export function GradePicker({ value, auto, onChange, compact }: { value: ProcessGrade | null; auto?: boolean; onChange: (g: ProcessGrade | null) => void; compact?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Process grade" className="inline-flex gap-0.5 rounded-[10px] bg-ink/[0.045] p-0.5">
      {(["A", "B", "C", "D"] as ProcessGrade[]).map((g) => {
        const on = value === g;
        return (
          <button key={g} type="button" role="radio" aria-checked={on} title={on && auto ? `${g} — from your trade review. Tap to override.` : `Grade ${g}`} onClick={() => onChange(on && !auto ? null : g)}
            className={cn("grid place-items-center rounded-[8px] font-semibold outline-none transition-[background-color,color,transform] focus-visible:ring-2 focus-visible:ring-gold-strong/50 active:scale-90", compact ? "h-6 w-6 text-[12px]" : "h-8 w-8 text-[13.5px]", on ? GRADE_TONE[g] : "text-faint hover:bg-ink/[0.06] hover:text-ink", on && auto && "ring-1 ring-inset ring-current/30")}>
            {g}
          </button>
        );
      })}
    </div>
  );
}

export function GradeBadge({ grade }: { grade: ProcessGrade | null }) {
  if (!grade) return <span className="text-faint">—</span>;
  return <span className={cn("grid h-6 w-6 place-items-center rounded-[8px] text-[12.5px] font-semibold", GRADE_TONE[grade])}>{grade}</span>;
}

export function SaveIndicator({ state }: { state: SaveState }) {
  const map: Record<SaveState, { t: string; icon: SymName; c: string }> = {
    idle: { t: "Auto-saves to Drive", icon: "shield", c: "text-faint" },
    dirty: { t: "Editing…", icon: "pencil", c: "text-muted" },
    saving: { t: "Saving…", icon: "repeat", c: "text-muted" },
    saved: { t: "Saved to Drive", icon: "check", c: "text-profit" },
    error: { t: "Not saved — retrying on next edit", icon: "xmark", c: "text-loss" },
  };
  const s = map[state];
  return (
    <span role="status" aria-live="polite" className={cn("inline-flex items-center gap-1.5 text-[12.5px] font-medium transition-colors duration-300", s.c)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={state} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} transition={SPRING} className="flex">
          <Sym name={s.icon} className={cn("h-3.5 w-3.5", state === "saving" && "animate-spin")} strokeWidth={2} />
        </motion.span>
      </AnimatePresence>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={s.t} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: 0.14 }}>{s.t}</motion.span>
      </AnimatePresence>
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────
   Tables
───────────────────────────────────────────────────────────── */

/** Horizontally-scrollable table shell — wide tables never push the page sideways. */
export const TableShell = ({ children, min = 720 }: { children: ReactNode; min?: number }) => (
  <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:thin]"><table className="w-full border-separate border-spacing-0 text-[14px]" style={{ minWidth: min }}>{children}</table></div>
);
export const Th = ({ children, className }: { children?: ReactNode; className?: string }) => <th scope="col" className={cn("whitespace-nowrap border-b border-line-soft px-3 pb-2.5 pt-1 text-left text-[12px] font-medium text-faint", className)}>{children}</th>;
/** Long / short as a small tag with a direction arrow. */
export const DirTag = ({ dir }: { dir: string | null }) => dir
  ? <span className="inline-flex items-center gap-1 rounded-full bg-ink/[0.055] px-2 py-0.5 text-[12px] font-medium capitalize text-ink/80"><Sym name={dir === "short" ? "arrowDownRight" : "arrowUpRight"} className="h-3 w-3" strokeWidth={2.2} />{dir}</span>
  : <span className="text-faint">—</span>;

/** `rule={false}` drops the bottom hairline, so several rows can read as one group. */
export const Td = ({ children, className, colSpan, rule = true }: { children?: ReactNode; className?: string; colSpan?: number; rule?: boolean }) => <td colSpan={colSpan} className={cn("px-3 py-3 align-middle text-ink", rule ? "border-b border-line-soft/80" : "border-b border-transparent", className)}>{children}</td>;

export const EvidenceButton = ({ count, onClick, label }: { count: number; onClick: () => void; label: string }) => (
  <button type="button" onClick={onClick} aria-label={label} disabled={count === 0} className="num group inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-full px-2.5 text-[13px] font-semibold text-gold-deep outline-none transition-[background-color,transform] hover:bg-gold/[0.14] focus-visible:ring-2 focus-visible:ring-gold-strong/50 active:scale-95 disabled:pointer-events-none disabled:text-faint dark:text-gold">
    {count}{count > 0 && <Sym name="arrowUpRight" className="h-3 w-3 transition-transform duration-200 group-hover:-translate-y-px group-hover:translate-x-px" strokeWidth={2.2} />}
  </button>
);

/** Last period's commitments, shown at the top of this review to tick off honestly. */
export function CarriedCommitments({ title, items, done, onToggle }: { title: string; items: string[]; done: Record<string, boolean>; onToggle: (i: number, v: boolean) => void }) {
  if (items.length === 0) return null;
  const kept = items.filter((_, i) => done[`prev:${i}`]).length;
  return (
    <Card pad={false} className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-4 sm:px-6">
        <p className="flex min-w-0 items-center gap-2 text-[15px] font-semibold tracking-[-0.01em] text-ink"><Sym name="flag" className="h-[17px] w-[17px] text-gold" />{title}</p>
        <span className="num shrink-0 whitespace-nowrap text-[13px] font-medium text-muted" aria-live="polite">{kept} of {items.length} kept</span>
      </div>
      <div className="mx-5 h-[3px] overflow-hidden rounded-full bg-ink/[0.07] sm:mx-6" aria-hidden>
        <motion.div className="h-full rounded-full bg-profit" initial={false} animate={{ width: `${(kept / items.length) * 100}%` }} transition={SPRING} />
      </div>
      <ul className="mt-1 divide-y divide-line-soft/70">
        {items.map((c, i) => {
          const on = !!done[`prev:${i}`];
          return (
            <li key={i}>
              <button type="button" role="checkbox" aria-checked={on} onClick={() => onToggle(i, !on)} className="group flex w-full items-start gap-3.5 px-5 py-3.5 text-left outline-none transition-colors hover:bg-ink/[0.03] focus-visible:bg-ink/[0.045] sm:px-6">
                <span className={cn("mt-px grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border transition-[background-color,border-color,transform] duration-200 group-active:scale-90", on ? "border-profit bg-profit text-white" : "border-line-strong group-hover:border-faint")}>
                  <AnimatePresence initial={false}>{on && <motion.span key="c" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={SPRING} className="flex"><DrawCheck className="h-3 w-3" /></motion.span>}</AnimatePresence>
                </span>
                <span className={cn("text-[15px] leading-snug transition-colors duration-200", on ? "text-muted line-through decoration-faint/60" : "text-ink")}>{c}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-line-soft/70 px-5 py-3 text-[13px] text-muted sm:px-6">Tick the ones you kept. Be honest — the next review reads this back.</p>
    </Card>
  );
}
