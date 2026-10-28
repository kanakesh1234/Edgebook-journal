"use client";

import { Children, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { AnimatePresence, animate, motion, useReducedMotion } from "motion/react";
import { Sym, type SymName } from "@/components/journal/symbols";
import { EASE, SPRING } from "@/components/journal/journal-ui";
import { formatMoney, formatSignedMoney } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { getSyncState, subscribeSyncState } from "@/lib/services/storage";
import { useApp } from "@/lib/store";
import type { ProcessGrade } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { SaveState } from "./use-review-notes";

/* ─────────────────────────────────────────────────────────────
   Apple HIG Motion Curves & Delayed Transitions
───────────────────────────────────────────────────────────── */

/** The iOS sheet & progressive disclosure curve: starts decisively, settles very softly. */
export const REVIEW_SMOOTH = [0.22, 1, 0.36, 1] as const;
export const REVIEW_EXPAND = { duration: 0.68, ease: REVIEW_SMOOTH } as const;
export const REVIEW_COLLAPSE = { duration: 0.32, ease: [0.4, 0, 0.6, 1] as const } as const;

/* ─────────────────────────────────────────────────────────────
   Formatting
───────────────────────────────────────────────────────────── */

export const useMoney = () => {
  const currency = useApp((s) => s.settings.currency);
  return {
    money: (n: number) => formatMoney(n, currency, { decimals: Math.abs(n) % 1 ? 2 : 0 }),
    signed: (n: number) => formatSignedMoney(n, currency),
  };
};
export const fmtPct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);
export const fmtR = (n: number | null) => (n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(2)}R`);
export const tone = (n: number | null) => (n == null || n === 0 ? "text-ink" : n > 0 ? "text-profit" : "text-loss");

export type SectionDef = { id: string; label: string; icon: SymName };
export const WEEKLY_SECTIONS: SectionDef[] = [
  { id: "a1", label: "Scorecard", icon: "gauge" },
  { id: "a2", label: "Session log", icon: "list" },
  { id: "a3", label: "Edge & Thoughts", icon: "sparkles" },
  { id: "a5", label: "3-Min Ritual", icon: "target" },
];
export const MONTHLY_SECTIONS: SectionDef[] = [
  { id: "b1", label: "Scorecard", icon: "gauge" },
  { id: "b4", label: "Edge & Thoughts", icon: "shield" },
  { id: "b2", label: "Session log", icon: "list" },
  { id: "b6", label: "3-Min Ritual", icon: "target" },
];

/**
 * Apple HIG unhurried progressive reveal hook for review questions:
 * - Questions always reveal strictly one by one (`enabled` chains Q2 after Q1, and Q3 after Q2).
 * - When typing manually, waits until at least `minChars` characters are written AND typing pauses for `delayMs` (850ms)
 *   before unfolding the next question (or unfolds after a brief 220ms beat on Enter/blur).
 * - When loading a period that already has written answers, staggers the reveal by 420ms per step so questions still
 *   cascade open one by one smoothly instead of snapping in all at once.
 */
export function useReviewSettledReveal(
  text: string,
  alreadyAnsweredDownstream: boolean,
  resetKey: string,
  minChars = 5,
  delayMs = 850,
  enabled = true,
): { settled: boolean; typing: boolean; triggerChipSettle: () => void } {
  const [latched, setLatched] = useState(false);
  const manualTimer = useRef<number | undefined>(undefined);
  const initialMount = useRef(true);

  useEffect(() => {
    setLatched(false);
    initialMount.current = true;
    window.clearTimeout(manualTimer.current);
  }, [resetKey]);

  useEffect(() => () => window.clearTimeout(manualTimer.current), []);

  const trimmed = text.trim();
  useEffect(() => {
    if (!enabled) {
      setLatched(false);
      return;
    }
    if (trimmed.length === 0 && !alreadyAnsweredDownstream) {
      setLatched(false);
      return;
    }
    if (trimmed.length < minChars && !alreadyAnsweredDownstream) {
      return;
    }
    const wait = initialMount.current && (trimmed.length >= minChars || alreadyAnsweredDownstream) ? 420 : delayMs;
    initialMount.current = false;
    const timer = window.setTimeout(() => setLatched(true), wait);
    return () => window.clearTimeout(timer);
  }, [trimmed, alreadyAnsweredDownstream, minChars, delayMs, enabled]);

  const triggerChipSettle = () => {
    if (!enabled || trimmed.length < 2) return;
    window.clearTimeout(manualTimer.current);
    manualTimer.current = window.setTimeout(() => setLatched(true), 220);
  };

  return {
    settled: enabled && latched,
    typing: enabled && !latched && trimmed.length > 0,
    triggerChipSettle,
  };
}

/* ─────────────────────────────────────────────────────────────
   Motion Primitives
───────────────────────────────────────────────────────────── */

export function SectionReveal({ index = 0, children, className }: { index?: number; children: ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14, filter: "blur(4px)" }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.54, delay: Math.min(index * 0.08, 0.36), ease: REVIEW_SMOOTH }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function QuestionReveal({ children, delay = 0.08, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  const [clip, setClip] = useState(true);
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
      animate={
        reduce
          ? { opacity: 1, transition: { duration: 0.24, delay } }
          : {
              opacity: 1,
              height: "auto",
              transition: {
                height: { ...REVIEW_EXPAND, delay },
                opacity: { duration: 0.42, delay: delay + 0.04, ease: REVIEW_SMOOTH },
              },
            }
      }
      exit={
        reduce
          ? { opacity: 0, transition: { duration: 0.16 } }
          : { opacity: 0, height: 0, transition: { height: REVIEW_COLLAPSE, opacity: { duration: 0.18 } } }
      }
      onAnimationStart={() => setClip(true)}
      onAnimationComplete={() => setClip(false)}
      className={cn("-mx-2 -mb-2 px-2 pb-2", clip && "overflow-hidden", className)}
    >
      <motion.div
        initial={reduce ? false : { opacity: 0, y: 14, filter: "blur(6px)" }}
        animate={
          reduce
            ? undefined
            : {
                opacity: 1,
                y: 0,
                filter: "blur(0px)",
                transition: { duration: 0.58, delay: delay + 0.14, ease: REVIEW_SMOOTH },
              }
        }
        exit={reduce ? undefined : { opacity: 0, y: -6, transition: { duration: 0.18 } }}
        className="border-t border-line-soft/80 pt-7"
      >
        {children}
      </motion.div>
    </motion.div>
  );
}

export function ChipStagger({ children, className, baseDelay = 0.14, stepDelay = 0.045 }: { children: ReactNode; className?: string; baseDelay?: number; stepDelay?: number }) {
  const reduce = useReducedMotion();
  return (
    <div className={className}>
      {Children.toArray(children).map((child, i) => (
        <motion.span
          key={i}
          className="inline-flex"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.97 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.4, ease: REVIEW_SMOOTH, delay: baseDelay + Math.min(i * stepDelay, 0.45) }}
        >
          {child}
        </motion.span>
      ))}
    </div>
  );
}

export function AnimatedNumber({ value, format, decimals, className, delay = 0.12 }: { value: number; format: (n: number) => string; decimals?: number; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);
  const fmt = useRef(format);
  fmt.current = format;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const dp = decimals ?? (Number.isInteger(value) ? 0 : 2);
    const round = (v: number) => {
      const k = 10 ** dp;
      return Math.round(v * k) / k;
    };
    if (reduce) {
      el.textContent = fmt.current(value);
      from.current = value;
      return;
    }
    const controls = animate(from.current, value, {
      duration: 0.85,
      delay,
      ease: EASE,
      onUpdate: (v) => {
        el.textContent = fmt.current(round(v));
      },
      onComplete: () => {
        el.textContent = fmt.current(value);
      },
    });
    from.current = value;
    return () => controls.stop();
  }, [value, decimals, reduce, delay]);
  return (
    <span ref={ref} className={className}>
      {format(reduce ? value : 0)}
    </span>
  );
}

export function DrawCheck({ className, strokeWidth = 3 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={cn("h-3 w-3", className)}>
      <motion.path d="m5 12.5 4.5 4.5L19 7.5" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.24, ease: EASE }} />
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────
   Structure & Apple Squircle Icon Tiles
───────────────────────────────────────────────────────────── */

/** Apple iOS Settings-style colored squircle icon tile. */
export function ReviewIconTile({ tile, icon, className }: { tile: string; icon: SymName; className?: string }) {
  return (
    <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-[10px] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]", tile, className)}>
      <Sym name={icon} className="h-4 w-4" strokeWidth={2.1} />
    </span>
  );
}

export function Section({
  id,
  icon,
  title,
  hint,
  aside,
  children,
}: {
  id?: string;
  code?: string;
  icon?: SymName;
  title: string;
  hint?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-h` : undefined} className="scroll-mt-24">
      <div className="mb-3 flex items-end justify-between gap-4 px-0.5">
        <div className="min-w-0">
          <h2 id={id ? `${id}-h` : undefined} className="flex items-center gap-2 font-display text-[19px] font-semibold leading-tight tracking-[-0.02em] text-ink sm:text-[20px]">
            {icon && <Sym name={icon} className="h-[17px] w-[17px] text-gold" strokeWidth={1.8} />}
            {title}
          </h2>
          {hint && <p className="mt-0.5 max-w-[68ch] text-pretty text-[13px] leading-snug text-muted">{hint}</p>}
        </div>
        {aside && <div className="shrink-0 pb-0.5">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

export const Card = ({ children, className, pad = true }: { children: ReactNode; className?: string; pad?: boolean }) => (
  <div className={cn("rounded-[24px] border border-line-soft bg-surface shadow-panel", pad && "p-5 sm:p-6", className)}>{children}</div>
);

export function Kpi({ label, value, sub, valueClass, hint, className }: { label: string; value: ReactNode; sub?: string; valueClass?: string; hint?: string; className?: string }) {
  return (
    <div className={cn("min-w-0", className)} title={hint}>
      <p className="truncate text-[12px] font-medium text-muted">{label}</p>
      <p className={cn("num mt-0.5 truncate text-[16px] font-semibold leading-snug tracking-[-0.015em] text-ink", valueClass)}>{value}</p>
      {sub && <p className="mt-0.5 truncate text-[12px] text-faint">{sub}</p>}
    </div>
  );
}

export function StatStrip({ children, count, className }: { children: ReactNode; count: number; className?: string }) {
  return (
    <div
      className={cn("divide-y divide-line-soft sm:grid sm:divide-x sm:divide-y-0", className)}
      style={{ gridTemplateColumns: `repeat(${count}, minmax(0, 1fr))` }}
    >
      {children}
    </div>
  );
}

export function StripCell({ label, value, sub, valueClass, hint }: { label: string; value: ReactNode; sub?: string; valueClass?: string; hint?: string }) {
  return (
    <div title={hint} className="grid min-w-0 grid-cols-[1fr_auto] items-center gap-x-4 px-5 py-3 sm:flex sm:flex-col sm:items-stretch sm:gap-0 sm:px-5 sm:py-4">
      <p className="col-start-1 row-start-1 truncate text-[12px] font-medium text-muted sm:order-1">{label}</p>
      <p className={cn("num col-start-2 row-span-2 row-start-1 truncate text-[18px] font-semibold leading-none tracking-[-0.02em] text-ink sm:order-2 sm:mt-1.5 sm:text-[21px]", valueClass)}>{value}</p>
      {sub && <p className="col-start-1 row-start-2 mt-0.5 truncate text-[11.5px] text-faint sm:order-3 sm:mt-1">{sub}</p>}
    </div>
  );
}

export function Group({ title, children, className }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      {title && <p className="mb-2 px-1 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-faint">{title}</p>}
      <div className="divide-y divide-line-soft overflow-hidden rounded-[20px] border border-line-soft bg-surface shadow-panel">{children}</div>
    </div>
  );
}

export function StatRow({ label, value, sub, valueClass, onClick, hint }: { label: string; value: ReactNode; sub?: string; valueClass?: string; onClick?: () => void; hint?: string }) {
  const body = (
    <>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-[13.5px] font-medium text-ink">{label}</span>
        {sub && <span className="block truncate text-[11.5px] text-faint">{sub}</span>}
      </span>
      <span className={cn("num shrink-0 text-[14.5px] font-semibold tracking-[-0.01em] text-ink", valueClass)}>{value}</span>
      {onClick && <Sym name="chevronRight" className="h-4 w-4 text-faint transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2} />}
    </>
  );
  const cls = "flex min-h-[46px] w-full items-center gap-3 px-4 py-2";
  return onClick ? (
    <button
      type="button"
      title={hint}
      onClick={() => {
        haptic.selection();
        onClick();
      }}
      className={cn(cls, "group outline-none transition-colors hover:bg-ink/[0.035] focus-visible:bg-ink/[0.05] active:bg-ink/[0.07]")}
    >
      {body}
    </button>
  ) : (
    <div title={hint} className={cls}>
      {body}
    </div>
  );
}

export function Chip({ children, tone: t = "neutral", className }: { children: ReactNode; tone?: "neutral" | "good" | "bad" | "gold" | "info"; className?: string }) {
  const c = {
    neutral: "bg-ink/[0.055] text-muted",
    good: "bg-profit/12 text-profit",
    bad: "bg-loss/12 text-loss",
    gold: "bg-gold/[0.14] text-gold-deep dark:text-gold",
    info: "bg-info/12 text-info",
  }[t];
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium leading-none", c, className)}>{children}</span>;
}

export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { id: T; label: string; icon?: SymName }[]; label: string }) {
  const gid = useId();
  return (
    <div role="tablist" aria-label={label} className="inline-flex rounded-full bg-ink/[0.06] p-1">
      {options.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => {
              if (!on) haptic.selection();
              onChange(o.id);
            }}
            className={cn(
              "relative flex h-8 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold-strong/50",
              on ? "text-ink" : "text-muted hover:text-ink",
            )}
          >
            {on && <motion.span layoutId={`seg-${gid}`} transition={SPRING} className="absolute inset-0 rounded-full bg-raised shadow-[0_1px_3px_rgb(0_0_0/0.12),0_0_0_0.5px_rgb(0_0_0/0.05)]" />}
            <span className="relative flex items-center gap-1.5">
              {o.icon && <Sym name={o.icon} className="h-[15px] w-[15px]" />}
              {o.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Low-Friction Guided Reflection Primitives (Active Recall)
───────────────────────────────────────────────────────────── */

export const Prompt = ({
  q,
  hint,
  step,
  done,
  typing,
  children,
  className,
}: {
  q: string;
  hint?: string;
  step?: number;
  done?: boolean;
  typing?: boolean;
  children: ReactNode;
  className?: string;
}) => (
  <div className={className}>
    <div className="mb-3 flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2.5">
        {step != null && (
          <span
            className={cn(
              "num grid h-6 w-6 shrink-0 place-items-center rounded-full text-[12px] font-semibold transition-all duration-300",
              done
                ? "bg-profit text-white shadow-[0_4px_10px_-2px_rgb(22_163_74/0.4)]"
                : "bg-gold/[0.15] text-gold-deep dark:text-gold",
            )}
          >
            {done ? <DrawCheck className="h-3 w-3" /> : step}
          </span>
        )}
        <div className="min-w-0">
          <p className="text-[15.5px] font-semibold leading-snug tracking-[-0.015em] text-ink">{q}</p>
          {hint && <p className="mt-0.5 text-[12px] text-faint">{hint}</p>}
        </div>
      </div>
      <AnimatePresence initial={false}>
        {typing && (
          <motion.span
            initial={{ opacity: 0, y: 2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-gold/10 px-2.5 py-0.5 text-[11.5px] font-medium text-gold-deep dark:text-gold"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold-strong" />
            <span>Unfolding next…</span>
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

export function AutoText({
  value,
  onChange,
  onChipSelect,
  placeholder,
  label,
  minRows = 2,
  maxLength = 4000,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onChipSelect?: () => void;
  placeholder?: string;
  label: string;
  minRows?: number;
  maxLength?: number;
  className?: string;
  suggest?: { text: string; label?: string } | null;
  chips?: SmartChipOption[];
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  };
  useLayoutEffect(fit, [value]);
  useEffect(() => {
    const ro = new ResizeObserver(fit);
    if (ref.current) ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="group rounded-[18px] border border-line-soft bg-ink/[0.03] transition-[box-shadow,background-color,border-color] duration-200 hover:bg-ink/[0.045] focus-within:border-gold/45 focus-within:bg-raised focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--gold-strong)_16%,transparent)]">
        <textarea
          ref={ref}
          aria-label={label}
          value={value}
          rows={minRows}
          maxLength={maxLength}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => {
            if (value.trim().length >= 2) onChipSelect?.();
          }}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && value.trim().length >= 2) {
              e.preventDefault();
              onChipSelect?.();
            }
          }}
          className="block w-full resize-none rounded-[18px] bg-transparent px-4 py-3 text-[14.5px] leading-[1.55] text-ink outline-none placeholder:text-faint"
        />
      </div>
    </div>
  );
}

export function LineInput({ value, onChange, placeholder, label, index }: { value: string; onChange: (v: string) => void; placeholder: string; label: string; index?: number }) {
  return (
    <label className="flex items-center gap-3 rounded-[16px] border border-line-soft bg-ink/[0.03] px-3.5 transition-[box-shadow,background-color,border-color] duration-200 hover:bg-ink/[0.045] focus-within:border-gold/45 focus-within:bg-raised focus-within:shadow-[0_0_0_3px_color-mix(in_srgb,var(--gold-strong)_16%,transparent)]">
      {index != null && (
        <span className="num grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-gold/[0.15] text-[12px] font-semibold text-gold-deep dark:text-gold">
          {index}
        </span>
      )}
      <input
        aria-label={label}
        value={value}
        maxLength={300}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 min-w-0 flex-1 bg-transparent text-[14.5px] text-ink outline-none placeholder:text-faint"
      />
    </label>
  );
}

const GRADE_TONE: Record<ProcessGrade, string> = {
  A: "bg-profit/15 text-profit",
  B: "bg-info/15 text-info",
  C: "bg-gold/[0.18] text-gold-deep dark:text-gold",
  D: "bg-loss/15 text-loss",
};

export function GradePicker({ value, auto, onChange, compact }: { value: ProcessGrade | null; auto?: boolean; onChange: (g: ProcessGrade | null) => void; compact?: boolean }) {
  return (
    <div role="radiogroup" aria-label="Process grade" className="inline-flex gap-0.5 rounded-[10px] bg-ink/[0.045] p-0.5">
      {(["A", "B", "C", "D"] as ProcessGrade[]).map((g) => {
        const on = value === g;
        return (
          <button
            key={g}
            type="button"
            role="radio"
            aria-checked={on}
            title={on && auto ? `${g} — from your trade review. Tap to override.` : `Grade ${g}`}
            onClick={() => {
              haptic.selection();
              onChange(on && !auto ? null : g);
            }}
            className={cn(
              "grid place-items-center rounded-[8px] font-semibold outline-none transition-[background-color,color,transform] focus-visible:ring-2 focus-visible:ring-gold-strong/50 active:scale-90",
              compact ? "h-6 w-6 text-[12px]" : "h-7 w-7 text-[13px]",
              on ? GRADE_TONE[g] : "text-faint hover:bg-ink/[0.06] hover:text-ink",
              on && auto && "ring-1 ring-inset ring-current/30",
            )}
          >
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
  const syncState = useSyncExternalStore(subscribeSyncState, getSyncState, () => "synced");
  const isOffline = syncState === "offline-cached";

  const map: Record<SaveState, { t: string; icon: SymName; c: string }> = {
    idle: {
      t: isOffline ? "Cached offline · Syncs when online" : "Synced with Drive",
      icon: isOffline ? "shield" : "check",
      c: isOffline ? "text-gold-deep dark:text-gold" : "text-faint",
    },
    dirty: { t: "Editing…", icon: "pencil", c: "text-muted" },
    saving: { t: isOffline ? "Caching locally…" : "Saving…", icon: "repeat", c: "text-muted" },
    saved: {
      t: isOffline ? "Saved in browser cache" : "Saved to Drive",
      icon: "check",
      c: isOffline ? "text-gold-deep dark:text-gold" : "text-profit",
    },
    error: { t: "Cached locally — retrying Drive", icon: "shield", c: "text-gold-deep dark:text-gold" },
  };
  const s = map[state];
  return (
    <span role="status" aria-live="polite" className={cn("inline-flex items-center gap-1.5 text-[12px] font-medium transition-colors duration-300", s.c)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={`${state}-${isOffline}`} initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} transition={SPRING} className="flex">
          <Sym name={s.icon} className={cn("h-3.5 w-3.5", state === "saving" && "animate-spin")} strokeWidth={2} />
        </motion.span>
      </AnimatePresence>
      <AnimatePresence mode="wait" initial={false}>
        <motion.span key={s.t} initial={{ opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -3 }} transition={{ duration: 0.14 }}>
          {s.t}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

/* ─────────────────────────────────────────────────────────────
   Tables
───────────────────────────────────────────────────────────── */

export const TableShell = ({ children, min = 640 }: { children: ReactNode; min?: number }) => (
  <div className="-mx-1 overflow-x-auto px-1 [scrollbar-width:thin]">
    <table className="w-full border-separate border-spacing-0 text-[13.5px]" style={{ minWidth: min }}>
      {children}
    </table>
  </div>
);

export const Th = ({ children, className }: { children?: ReactNode; className?: string }) => (
  <th scope="col" className={cn("whitespace-nowrap border-b border-line-soft px-3 pb-2.5 pt-1 text-left text-[11.5px] font-medium text-faint", className)}>
    {children}
  </th>
);

export const DirTag = ({ dir }: { dir: string | null }) =>
  dir ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-ink/[0.055] px-2 py-0.5 text-[11.5px] font-medium capitalize text-ink/80">
      <Sym name={dir === "short" ? "arrowDownRight" : "arrowUpRight"} className="h-3 w-3" strokeWidth={2.2} />
      {dir}
    </span>
  ) : (
    <span className="text-faint">—</span>
  );

export const Td = ({ children, className, colSpan, rule = true }: { children?: ReactNode; className?: string; colSpan?: number; rule?: boolean }) => (
  <td colSpan={colSpan} className={cn("px-3 py-3 align-middle text-ink", rule ? "border-b border-line-soft/80" : "border-b border-transparent", className)}>
    {children}
  </td>
);

export const EvidenceButton = ({ count, onClick, label }: { count: number; onClick: () => void; label: string }) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    disabled={count === 0}
    className="num group inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-full px-2.5 text-[13px] font-semibold text-gold-deep outline-none transition-[background-color,transform] hover:bg-gold/[0.14] focus-visible:ring-2 focus-visible:ring-gold-strong/50 active:scale-95 disabled:pointer-events-none disabled:text-faint dark:text-gold"
  >
    {count}
    {count > 0 && <Sym name="arrowUpRight" className="h-3 w-3 transition-transform duration-200 group-hover:-translate-y-px group-hover:translate-x-px" strokeWidth={2.2} />}
  </button>
);

export function CarriedCommitments({ title, items, done, onToggle }: { title: string; items: string[]; done: Record<string, boolean>; onToggle: (i: number, v: boolean) => void }) {
  if (items.length === 0) return null;
  const kept = items.filter((_, i) => done[`prev:${i}`]).length;
  return (
    <Card pad={false} className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-4 sm:px-6">
        <p className="flex min-w-0 items-center gap-2 text-[14.5px] font-semibold tracking-[-0.01em] text-ink">
          <ReviewIconTile tile="bg-gradient-to-b from-gold-strong to-gold-deep" icon="flag" className="h-6 w-6 rounded-[7px]" />
          {title}
        </p>
        <span className="num shrink-0 whitespace-nowrap text-[12.5px] font-medium text-muted" aria-live="polite">
          {kept} of {items.length} kept
        </span>
      </div>
      <ul className="divide-y divide-line-soft/70 border-t border-line-soft/70">
        {items.map((c, i) => {
          const on = !!done[`prev:${i}`];
          return (
            <li key={i}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => {
                  haptic.selection();
                  onToggle(i, !on);
                }}
                className="group flex w-full items-start gap-3.5 px-5 py-3 text-left outline-none transition-colors hover:bg-ink/[0.03] focus-visible:bg-ink/[0.045] sm:px-6"
              >
                <span
                  className={cn(
                    "mt-px grid h-[20px] w-[20px] shrink-0 place-items-center rounded-full border transition-[background-color,border-color,transform] duration-200 group-active:scale-90",
                    on ? "border-profit bg-profit text-white" : "border-line-strong group-hover:border-faint",
                  )}
                >
                  <AnimatePresence initial={false}>
                    {on && (
                      <motion.span key="c" initial={{ scale: 0.4, opacity: 0 }} animate={{ opacity: 1, scale: 1 }} exit={{ scale: 0.4, opacity: 0 }} transition={SPRING} className="flex">
                        <DrawCheck className="h-3 w-3" />
                      </motion.span>
                    )}
                  </AnimatePresence>
                </span>
                <span className={cn("text-[14.5px] leading-snug transition-colors duration-200", on ? "text-muted line-through decoration-faint/60" : "text-ink")}>{c}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
