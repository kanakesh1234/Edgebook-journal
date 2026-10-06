"use client";

/**
 * Shared pieces for the calm journaling flow (Plan & Record, Autopsy).
 *
 * Liquid Glass is used ONLY on navigation and controls: the top bar, the bottom
 * action bar, round icon buttons and segmented switches. Everything you read or
 * type into (cards, inputs, checklists) is a solid, quiet Edgebook surface.
 */
import { Children, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/button";
import { haptic } from "@/lib/haptics";

export const FLOW_EASE = [0.16, 1, 0.3, 1] as const;
/**
 * Motion language (after Apple's SwiftUI spring model: a spring is defined by duration + bounce).
 *  - SPRING  ≈ SwiftUI .snappy: quick, tiny bounce — used for everything that moves or resizes.
 *  - FADE    quick ease-out for opacity, so content never lags behind its own movement.
 *  - POP     a livelier spring for small confirmations (check marks).
 */
export const FLOW_SPRING = { type: "spring", duration: 0.4, bounce: 0.1 } as const;
export const FLOW_FADE = { duration: 0.26, ease: [0.22, 1, 0.36, 1] } as const;
export const FLOW_POP = { type: "spring", duration: 0.32, bounce: 0.35 } as const;
/** Height/opacity expand + collapse: spring for size, fast fade for opacity. */
export const FLOW_EXPAND = { ...FLOW_SPRING, opacity: FLOW_FADE } as const;

/** Glass recipes — translucency + blur + a hairline highlight. */
export const glass = {
  bar: "bg-surface/70 backdrop-blur-xl backdrop-saturate-150",
  control:
    "border border-white/60 bg-surface/55 backdrop-blur-xl backdrop-saturate-150 " +
    "shadow-[inset_0_1px_0_rgb(255_255_255/0.6),0_2px_8px_-2px_rgb(0_0_0/0.10)] " +
    "dark:border-white/10 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_2px_8px_-2px_rgb(0_0_0/0.4)]",
};

/* -------------------------------- icons -------------------------------- */

const svg = "h-[18px] w-[18px]";
export const IconBack = () => (
  <svg viewBox="0 0 24 24" className={svg} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m15 5-7 7 7 7" /></svg>
);
export const IconClose = () => (
  <svg viewBox="0 0 24 24" className={svg} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const IconCheck = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={cn("h-3.5 w-3.5", className)} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);
const IconChevron = ({ open }: { open: boolean }) => (
  <svg viewBox="0 0 24 24" className={cn("h-4 w-4 transition-transform duration-200", open && "rotate-180")} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
);

/* -------------------------------- frame -------------------------------- */

export function GlassIconButton({ label, onClick, children, disabled }: { label: string; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn("grid h-9 w-9 place-items-center rounded-full text-ink transition-all duration-200 hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-40", glass.control)}
    >
      {children}
    </button>
  );
}

/**
 * Sheet layout used inside <Modal>: a glass top bar, quiet scrolling content,
 * and a glass action bar. Both bars are sticky, so content softly blurs under them.
 */
export function SheetFrame({ onClose, onBack, hint, actions, children }: { onClose: () => void; onBack?: () => void; hint?: React.ReactNode; actions: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[30rem] flex-col">
      <header className={cn("sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between px-4", glass.bar)}>
        <div className="w-9">{onBack && <GlassIconButton label="Back" onClick={onBack}><IconBack /></GlassIconButton>}</div>
        <GlassIconButton label="Close" onClick={onClose}><IconClose /></GlassIconButton>
      </header>
      <div className="flex-1 px-7 pb-8 pt-2 sm:px-10">{children}</div>
      <footer className={cn("sticky bottom-0 z-20 flex shrink-0 items-center justify-between gap-4 border-t border-line/60 px-5 py-3.5", glass.bar)}>
        <div className="min-w-0 flex-1 text-[12.5px] text-faint">{hint}</div>
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      </footer>
    </div>
  );
}

/** Slide + fade between steps; direction follows forward/back. */
export function StepTransition({ stepKey, dir, children }: { stepKey: string; dir: 1 | -1; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  const dx = reduce ? 0 : 18;
  return (
    <AnimatePresence mode="wait" initial={false} custom={dir}>
      <motion.div
        key={stepKey}
        custom={dir}
        variants={{
          enter: (d: number) => ({ opacity: 0, x: d * dx }),
          center: { opacity: 1, x: 0 },
          exit: (d: number) => ({ opacity: 0, x: -d * (dx * 0.6) }),
        }}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ duration: 0.22, ease: FLOW_EASE }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/**
 * A newly revealed question UNFOLDS: its height opens with the snappy spring while it fades in,
 * exactly like the "Yes → add event" list. The gap above it (the parent's space-y) is folded into the
 * animation, so nothing jumps. Place Reveals in a container WITHOUT space-y-* (each Reveal brings its own 28px lead-in). Clipping applies only while animating, so focus rings are never cut off.
 * `focus` puts the cursor in its first field once it starts opening (without scrolling the sheet).
 * Reduce Motion: plain crossfade.
 */
export function Reveal({ children, delay = 0, focus = false, gap = true }: { children: React.ReactNode; delay?: number; focus?: boolean; gap?: boolean }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(false);
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  useEffect(() => {
    if (!shown || !focus) return;
    const t = window.setTimeout(() => ref.current?.querySelector<HTMLElement>("input, textarea")?.focus({ preventScroll: true }), 90 + delay * 1000);
    return () => window.clearTimeout(t);
  }, [shown, focus, delay]);
  const hidden = reduce ? { opacity: 0 } : { opacity: 0, height: 0 };
  const visible = reduce ? { opacity: 1 } : { opacity: 1, height: "auto" };
  return (
    <motion.section
      ref={ref}
      initial={hidden}
      animate={shown ? visible : hidden}
      transition={reduce ? { duration: 0.18 } : { ...FLOW_SPRING, delay, opacity: { ...FLOW_FADE, delay } }}
      onAnimationComplete={() => { if (shown) setSettled(true); }}
      className={cn(!settled && "overflow-hidden")}
    >
      <div className={gap ? "pt-7" : undefined}>{children}</div>
    </motion.section>
  );
}

/** Children cascade in one after another (chips, options). Late additions animate in on their own. */
export function Stagger({ children, className, step = 0.04, delay = 0 }: { children: React.ReactNode; className?: string; step?: number; delay?: number }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const item = {
    hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 8 },
    show: { opacity: 1, y: 0, transition: reduce ? { duration: 0.15 } : { ...FLOW_SPRING, opacity: FLOW_FADE } },
  };
  return (
    <motion.div className={className} initial="hidden" animate={shown ? "show" : "hidden"} variants={{ hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : step, delayChildren: delay } } }}>
      {Children.toArray(children).map((c, i) => (
        <motion.div key={(c as { key?: string | number }).key ?? i} variants={item}>{c}</motion.div>
      ))}
    </motion.div>
  );
}

/** One quiet line of micro-feedback; cross-fades when the text changes. */
export function Hint({ text, tone = "muted" }: { text: string | null; tone?: "muted" | "warn" | "ok" }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      {text && (
        <motion.span
          key={text}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.16 }}
          className={cn("block truncate", tone === "warn" && "text-loss", tone === "ok" && "text-profit")}
        >
          {text}
        </motion.span>
      )}
    </AnimatePresence>
  );
}

/* ------------------------------- controls ------------------------------- */

export function PrimaryButton({ children, onClick, disabled, loading }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean; loading?: boolean }) {
  const off = disabled || loading;
  return (
    <button
      type="button"
      disabled={off}
      onClick={onClick}
      className={cn(
        "relative inline-flex h-11 items-center justify-center whitespace-nowrap rounded-full px-6 text-[15px] font-semibold tracking-[-0.01em] transition-all duration-200",
        disabled
          ? "cursor-not-allowed bg-ink/[0.07] text-faint"
          : "bg-gradient-to-b from-gold-strong to-gold-deep text-on-gold shadow-[0_6px_14px_-6px_var(--gold-strong),inset_0_1px_0_rgb(255_255_255/0.28)] hover:brightness-110 active:scale-[0.97]",
      )}
    >
      {loading && <Spinner className="absolute h-4 w-4" />}
      <span className={cn(loading && "opacity-0")}>{children}</span>
    </button>
  );
}

export function QuietButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick} className="rounded-full px-3 py-2 text-[14px] font-medium text-muted transition-colors hover:text-ink disabled:opacity-40">
      {children}
    </button>
  );
}

/** Apple-style back button: leading chevron + "Back", quiet until hovered. */
export function BackButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={() => { haptic.selection(); onClick(); }} className="inline-flex items-center gap-0.5 rounded-full py-2 pl-2 pr-3.5 text-[15px] font-medium text-muted transition-all hover:text-ink active:scale-[0.96] disabled:opacity-40">
      <IconBack />
      Back
    </button>
  );
}

export function StepTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="text-[28px] font-semibold leading-[1.1] tracking-[-0.025em] text-ink sm:text-[32px]">{title}</h2>
      {subtitle && <p className="mt-2 text-[15px] leading-snug text-muted">{subtitle}</p>}
    </div>
  );
}

/** A tiny label that gains a check mark once its field is satisfied. */
export function Label({ children, done, hint, htmlFor }: { children: React.ReactNode; done?: boolean; hint?: string; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="flex items-center gap-2 text-[13px] font-medium text-muted">
      <span>{children}</span>
      {hint && <span className="text-[12px] font-normal text-faint">{hint}</span>}
      <AnimatePresence initial={false}>
        {done && (
          <motion.span initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} transition={FLOW_POP} className="grid h-4 w-4 place-items-center rounded-full bg-profit/15 text-profit">
            <IconCheck className="h-2.5 w-2.5" />
          </motion.span>
        )}
      </AnimatePresence>
    </label>
  );
}

const box =
  "w-full rounded-2xl border border-line bg-raised px-4 py-3 text-[16px] leading-snug text-ink placeholder:text-faint " +
  "transition-[border-color,box-shadow] duration-100 hover:border-line-strong focus:border-gold/60 focus:outline-none focus:ring-4 focus:ring-gold/10";

export function TextBox({ className, ...props }: Omit<React.InputHTMLAttributes<HTMLInputElement>, "ref">) {
  return <input className={cn(box, className)} {...props} />;
}
export function TextBlock({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(box, "min-h-24 resize-none", className)} {...props} />;
}

export function Chip({ selected, onClick, children, tone = "gold" }: { selected: boolean; onClick: () => void; children: React.ReactNode; tone?: "gold" | "profit" | "loss" }) {
  const on = tone === "profit" ? "border-profit/50 bg-profit/10 text-profit" : tone === "loss" ? "border-loss/50 bg-loss/10 text-loss" : "border-gold/55 bg-gold/10 text-gold";
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={() => { haptic.selection(); onClick(); }}
      className={cn("rounded-full border px-4 py-2 text-[14px] font-medium transition-all duration-150 active:scale-[0.96]", selected ? on : "border-line bg-raised text-muted hover:border-line-strong hover:text-ink")}
    >
      {children}
    </button>
  );
}

/** Elegant selectable card (radio semantics). */
export function ChoiceCard({ selected, onClick, title, meta }: { selected: boolean; onClick: () => void; title: string; meta?: string }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={() => { haptic.selection(); onClick(); }}
      className={cn(
        "relative w-full rounded-[22px] border px-5 py-4 text-left transition-all duration-200 active:scale-[0.985]",
        selected ? "border-gold/60 bg-gold/[0.07] shadow-[0_10px_24px_-14px_var(--gold-strong)]" : "border-line bg-raised hover:border-line-strong hover:shadow-rest",
      )}
    >
      <span className="block truncate pr-7 text-[16px] font-semibold tracking-[-0.01em] text-ink">{title}</span>
      {meta && <span className="mt-0.5 block truncate text-[13px] text-muted">{meta}</span>}
      <span className={cn("absolute right-4 top-4 grid h-5 w-5 place-items-center rounded-full border transition-all duration-200", selected ? "border-gold bg-gold-strong text-on-gold" : "border-line-strong text-transparent")}>
        <IconCheck className="h-3 w-3" />
      </span>
    </button>
  );
}

/** Minimal interactive checklist row. */
export function CheckRow({ checked, onClick, title, note }: { checked: boolean; onClick: () => void; title: string; note?: string }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => { haptic.selection(); onClick(); }}
      className={cn("flex w-full items-start gap-3.5 rounded-2xl border px-4 py-3.5 text-left transition-all duration-200 active:scale-[0.99]", checked ? "border-profit/35 bg-profit/[0.06]" : "border-line bg-raised hover:border-line-strong")}
    >
      <span className={cn("mt-px grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border transition-all duration-200", checked ? "border-profit bg-profit text-canvas" : "border-line-strong text-transparent")}>
        <IconCheck className="h-3 w-3" />
      </span>
      <span className="min-w-0">
        <span className={cn("block text-[15px] leading-snug transition-colors", checked ? "text-ink" : "text-ink/90")}>{title}</span>
        {note && <span className="mt-0.5 block text-[13px] leading-snug text-muted">{note}</span>}
      </span>
    </button>
  );
}

/** Glass segmented switch (a control, so it may use glass). */
/** Equal-width segments (Apple HIG). `fullWidth` stretches the control to its container. */
export function Segmented<T extends string>({ value, options, onChange, fullWidth = false }: { value: T; options: { id: T; label: string }[]; onChange: (id: T) => void; fullWidth?: boolean }) {
  const reduce = useReducedMotion();
  return (
    <div role="tablist" className={cn("relative rounded-full p-1", fullWidth ? "grid w-full" : "inline-grid", glass.control)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id} onClick={() => { if (o.id !== value) haptic.selection(); onChange(o.id); }} className={cn("relative z-10 rounded-full px-5 py-1.5 text-[14px] font-medium transition-colors", value === o.id ? "text-ink" : "text-muted hover:text-ink")}>
          {value === o.id && <motion.span layoutId="seg-pill" transition={reduce ? { duration: 0 } : FLOW_SPRING} className="absolute inset-0 -z-10 rounded-full bg-surface shadow-[0_1px_3px_rgb(0_0_0/0.12)]" />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Two big answers (e.g. Yes / No) as quiet cards. */
export function BinaryChoice({ value, onChange, options }: { value: boolean | null; onChange: (v: boolean) => void; options: [string, string] }) {
  return (
    <div className="grid grid-cols-2 gap-3" role="group">
      {([[options[0], true, "profit"], [options[1], false, "loss"]] as const).map(([label, v, tone]) => (
        <button
          key={label}
          type="button"
          aria-pressed={value === v}
          onClick={() => { haptic.selection(); onChange(v); }}
          className={cn(
            "rounded-2xl border py-3.5 text-[16px] font-semibold transition-all duration-150 active:scale-[0.97]",
            value === v ? (tone === "profit" ? "border-profit/50 bg-profit/10 text-profit" : "border-loss/50 bg-loss/10 text-loss") : "border-line bg-raised text-muted hover:border-line-strong hover:text-ink",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Progressive disclosure: optional detail stays tucked away until asked for. */
export function Disclosure({ label, children, defaultOpen = false, autoFocusOnOpen = false }: { label: string; children: React.ReactNode; defaultOpen?: boolean; autoFocusOnOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useRef(`d-${Math.random().toString(36).slice(2, 8)}`).current;
  const bodyRef = useRef<HTMLDivElement>(null);
  // Clip only while the height animates; once settled, let focus rings render in full.
  const [settled, setSettled] = useState(defaultOpen);

  // Opt-in: when the user opens the section, put the cursor in its first field.
  useEffect(() => {
    if (!open || !autoFocusOnOpen) return;
    const t = window.setTimeout(() => bodyRef.current?.querySelector<HTMLElement>("input, textarea")?.focus({ preventScroll: true }), 60);
    return () => window.clearTimeout(t);
  }, [open, autoFocusOnOpen]);
  return (
    <div>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 text-[14px] font-medium text-muted transition-colors hover:text-ink">
        {label}
        <IconChevron open={open} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={id} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={FLOW_EXPAND} onAnimationStart={() => setSettled(false)} onAnimationComplete={() => setSettled(true)} className={cn(!settled && "overflow-hidden")}>
            <div ref={bodyRef} className="-mx-2 space-y-5 px-2 pb-2 pt-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Stepper — Apple HIG: "a two-segment control" that sits NEXT TO a field showing the value
 * (the stepper itself shows no value). Press and hold to repeat; Shift-click steps by 10.
 * Pass a functional updater as `onStep` so repeated steps never read stale state.
 */
export function Stepper({ label, onStep, canDecrement = true }: { label: string; onStep: (delta: number) => void; canDecrement?: boolean }) {
  const delay = useRef<number | undefined>(undefined);
  const repeat = useRef<number | undefined>(undefined);
  const stop = () => { window.clearTimeout(delay.current); window.clearInterval(repeat.current); };
  useEffect(() => stop, []);

  const press = (dir: 1 | -1) => (e: React.PointerEvent) => {
    const step = dir * (e.shiftKey ? 10 : 1);
    haptic.selection();
    onStep(step);
    stop();
    delay.current = window.setTimeout(() => {
      repeat.current = window.setInterval(() => { haptic.selection(); onStep(step); }, 90);
    }, 450);
  };
  // Keyboard activation (Enter / Space) arrives as a click with detail 0; pointer presses are handled above.
  const key = (dir: 1 | -1) => (e: React.MouseEvent) => { if (e.detail === 0) onStep(dir); };

  const seg = "grid h-full w-12 touch-manipulation select-none place-items-center text-ink transition-colors hover:bg-ink/[0.05] active:bg-ink/[0.12] disabled:pointer-events-none disabled:opacity-35";
  const icon = "h-4 w-4";
  return (
    <div role="group" aria-label={label} className="inline-flex h-11 shrink-0 items-stretch overflow-hidden rounded-xl bg-ink/[0.06]" onContextMenu={(e) => e.preventDefault()}>
      <button type="button" aria-label={`Decrease ${label.toLowerCase()}`} disabled={!canDecrement} onPointerDown={press(-1)} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop} onClick={key(-1)} className={seg}>
        <svg viewBox="0 0 24 24" className={icon} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M6 12h12" /></svg>
      </button>
      <span aria-hidden className="my-2.5 w-px bg-line-strong" />
      <button type="button" aria-label={`Increase ${label.toLowerCase()}`} onPointerDown={press(1)} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop} onClick={key(1)} className={seg}>
        <svg viewBox="0 0 24 24" className={icon} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
      </button>
    </div>
  );
}
