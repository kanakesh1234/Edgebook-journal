"use client";

/**
 * Shared pieces for the calm journaling flow (Plan & Record, Autopsy).
 *
 * Liquid Glass is used ONLY on navigation and controls: the top bar, the bottom
 * action bar, round icon buttons and segmented switches. Everything you read or
 * type into (cards, inputs, checklists) is a solid, quiet Edgebook surface.
 */
import { Children, useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/button";
import { haptic } from "@/lib/haptics";

export const FLOW_EASE = [0.16, 1, 0.3, 1] as const;
/** Height/opacity transition for steps that unfold in or out. */
/** Critically-damped spring (no bounce): Apple's default for anything the user can interrupt. */
export const FLOW_EXPAND = { type: "spring", duration: 0.5, bounce: 0 } as const;
/** Quick cross-fade for one-line micro feedback. */
export const FLOW_FADE = { duration: 0.16 } as const;

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
      className={cn("grid h-11 w-11 place-items-center rounded-full text-ink transition-all duration-200 hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-40", glass.control)}
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
        <div className="w-11">{onBack && <GlassIconButton label="Back" onClick={onBack}><IconBack /></GlassIconButton>}</div>
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
  const dx = reduce ? 0 : 28;
  return (
    <AnimatePresence mode="wait" initial={false} custom={dir}>
      <motion.div
        key={stepKey}
        custom={dir}
        variants={{
          enter: (d: number) => ({ opacity: 0, x: d * dx }),
          // Arrive on a spring; leave quickly so the next screen never waits on the last.
          center: { opacity: 1, x: 0, transition: { type: "spring", duration: 0.45, bounce: 0 } },
          exit: (d: number) => ({ opacity: 0, x: -d * (dx * 0.5), transition: { duration: 0.14, ease: "easeIn" } }),
        }}
        initial="enter"
        animate="center"
        exit="exit"
      >
        {children}
      </motion.div>
    </AnimatePresence>
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

/* ------------------- icon tiles + glyphs (SF Symbols style) -------------------
 * One stroke weight (2.2), round caps/joins, 24-grid — so every glyph reads as one family,
 * like SF Symbols at "regular" weight. Tiles are the iOS Settings-style colored squircle. */

const glyph = "h-[17px] w-[17px]";
const G = ({ children, w = 2.2 }: { children: React.ReactNode; w?: number }) => (
  <svg viewBox="0 0 24 24" className={glyph} fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);
/** arrow.down.right — entering the market */
export const GlyphArrowIn = () => <G><path d="M7 7l10 10M17 8v9H8" /></G>;
/** arrow.up.right — leaving the market */
export const GlyphArrowOut = () => <G><path d="M7 17 17 7M8 7h9v9" /></G>;
/** timer */
export const GlyphTimer = () => <G><circle cx="12" cy="13.5" r="7" /><path d="M12 10v3.8l2.4 1.4M9.5 3.5h5" /></G>;
/** flag */
export const GlyphFlag = () => <G><path d="M6 21V4.5M6 5h11l-2.2 3.8L17 12.5H6" /></G>;

/** Colored squircle that carries a glyph (iOS Settings-style row icon). */
export function IconTile({ tile, children }: { tile: string; children: React.ReactNode }) {
  return <span className={cn("grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]", tile)}>{children}</span>;
}

/* ------------------------- reveal / stagger / stepper ------------------------- */

/**
 * Height/opacity unfold for content that appears in place (wrap in <AnimatePresence>).
 * Clips ONLY while animating, so focus rings and shadows of fields inside are never cut off at rest.
 */
export function Collapse({ children, id, className }: { children: React.ReactNode; id?: string; className?: string }) {
  const [clip, setClip] = useState(true);
  return (
    <motion.div
      id={id}
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={FLOW_EXPAND}
      onAnimationStart={() => setClip(true)}
      onAnimationComplete={() => setClip(false)}
      // 8px of built-in room on the sides and bottom (cancelled by negative margins, so layout is unchanged):
      // a focus ring (4px) or shadow can never be cut, even while the wrapper is still clipping.
      className={cn("-mx-2 -mb-2 px-2 pb-2", clip && "overflow-hidden", className)}
    >
      {children}
    </motion.div>
  );
}

/**
 * A question unfolds when it appears (and folds away when it leaves, if wrapped in <AnimatePresence>).
 * The 32px lead-in lives INSIDE the step, so collapsing it leaves no stray gap. Clipping applies only
 * while animating, so focus rings are never cut off. `focus` moves the caret into the first field.
 */
export function Reveal({ children, focus = false, delay = 0 }: { children: React.ReactNode; focus?: boolean; delay?: number }) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLElement>(null);
  const [clip, setClip] = useState(true);
  useEffect(() => {
    if (!focus) return;
    const t = window.setTimeout(() => ref.current?.querySelector<HTMLElement>("textarea, input")?.focus({ preventScroll: true }), 160 + delay * 1000);
    return () => window.clearTimeout(t);
  }, [focus, delay]);
  const hidden = reduce ? { opacity: 0 } : { opacity: 0, height: 0 };
  const shown = reduce ? { opacity: 1 } : { opacity: 1, height: "auto" };
  return (
    <motion.section
      ref={ref}
      initial={hidden}
      animate={shown}
      exit={hidden}
      transition={reduce ? { duration: 0.18 } : { ...FLOW_EXPAND, delay }}
      onAnimationStart={() => setClip(true)}
      onAnimationComplete={() => setClip(false)}
      // Same built-in room as Collapse: focus rings and shadows are never cut.
      className={cn("-mx-2 -mb-2 px-2 pb-2", clip && "overflow-hidden")}
    >
      <div className="pt-8">{children}</div>
    </motion.section>
  );
}

/** Children rise in one after another. `delay` is the gap (seconds) between children. */
export function Stagger({ children, className, delay = 0.05 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <div className={className}>
      {Children.toArray(children).map((child, i) => (
        <motion.span
          key={i}
          className="inline-flex"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: FLOW_EASE, delay: Math.min(i * delay, 0.6) }}
        >
          {child}
        </motion.span>
      ))}
    </div>
  );
}

/** Two-segment − / + control. Press and hold to repeat. `onStep` receives -1 or +1. */
export function Stepper({ label, onStep, canDecrement = true, canIncrement = true }: { label: string; onStep: (delta: number) => void; canDecrement?: boolean; canIncrement?: boolean }) {
  const hold = useRef<number | null>(null);
  const stop = useCallback(() => {
    if (hold.current !== null) {
      window.clearTimeout(hold.current);
      hold.current = null;
    }
  }, []);
  useEffect(() => stop, [stop]);

  const start = (delta: number) => {
    stop();
    haptic.selection();
    onStep(delta);
    let wait = 420;
    const tick = () => {
      haptic.selection();
      onStep(delta);
      wait = Math.max(70, wait * 0.8);
      hold.current = window.setTimeout(tick, wait);
    };
    hold.current = window.setTimeout(tick, wait);
  };

  const seg = "grid h-full w-12 place-items-center text-[22px] font-medium leading-none text-ink transition-colors hover:bg-ink/[0.05] active:bg-ink/[0.09] disabled:pointer-events-none disabled:text-faint/50 select-none touch-none";
  const handlers = (delta: number) => ({
    onPointerDown: (e: React.PointerEvent) => { if (e.pointerType === "mouse" && e.button !== 0) return; start(delta); },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    // Keyboard activation (Enter / Space) arrives as a click with detail 0.
    onClick: (e: React.MouseEvent) => { if (e.detail === 0) { haptic.selection(); onStep(delta); } },
  });

  return (
    <div role="group" aria-label={label} className="flex h-14 shrink-0 items-stretch divide-x divide-line overflow-hidden rounded-2xl border border-line bg-raised">
      <button type="button" aria-label={`Decrease ${label.toLowerCase()}`} disabled={!canDecrement} className={seg} {...handlers(-1)}>−</button>
      <button type="button" aria-label={`Increase ${label.toLowerCase()}`} disabled={!canIncrement} className={seg} {...handlers(1)}>+</button>
    </div>
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
          <motion.span initial={{ opacity: 0, scale: 0.5 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.5 }} className="grid h-4 w-4 place-items-center rounded-full bg-profit/15 text-profit">
            <IconCheck className="h-2.5 w-2.5" />
          </motion.span>
        )}
      </AnimatePresence>
    </label>
  );
}

const box =
  "w-full rounded-2xl border border-line bg-raised px-4 py-3 text-[16px] leading-snug text-ink placeholder:text-faint " +
  "transition-[border-color,box-shadow] duration-200 hover:border-line-strong focus:border-gold/60 focus:outline-none focus:ring-4 focus:ring-gold/10";

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
      className={cn("inline-flex min-h-11 items-center rounded-full border px-4 py-2 text-[15px] font-medium transition-all duration-150 active:scale-[0.96]", selected ? on : "border-line bg-raised text-muted hover:border-line-strong hover:text-ink")}
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
export function Segmented<T extends string>({ value, options, onChange, layoutId = "seg-pill", compact = false, label }: { value: T; options: { id: T; label: string }[]; onChange: (id: T) => void; /** Unique per instance when two switches can be on screen together. */ layoutId?: string; compact?: boolean; label?: string }) {
  return (
    <div role="tablist" aria-label={label} className={cn("relative inline-grid rounded-full p-1", glass.control)} style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button key={o.id} type="button" role="tab" aria-selected={value === o.id} onClick={() => { if (value !== o.id) haptic.selection(); onChange(o.id); }} className={cn("relative z-10 rounded-full font-medium transition-colors", compact ? "px-3.5 py-1 text-[13px]" : "px-5 py-1.5 text-[14px]", value === o.id ? "text-ink" : "text-muted hover:text-ink")}>
          {value === o.id && <motion.span layoutId={layoutId} transition={{ type: "spring", stiffness: 500, damping: 36 }} className="absolute inset-0 -z-10 rounded-full bg-surface shadow-[0_1px_3px_rgb(0_0_0/0.12)]" />}
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
export function Disclosure({ label, children, defaultOpen = false, autoFocusOnOpen = false }: { label: string; children: React.ReactNode; defaultOpen?: boolean; /** Move focus to the first field when the user opens it. */ autoFocusOnOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useRef(`d-${Math.random().toString(36).slice(2, 8)}`).current;
  const body = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; } // never steal focus on mount
    if (!open || !autoFocusOnOpen) return;
    const t = window.setTimeout(() => body.current?.querySelector<HTMLElement>("input, textarea")?.focus({ preventScroll: true }), 240);
    return () => window.clearTimeout(t);
  }, [open, autoFocusOnOpen]);
  return (
    <div>
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => { haptic.selection(); setOpen((o) => !o); }} className="flex min-h-11 items-center gap-1.5 text-[15px] font-medium text-muted transition-colors hover:text-ink">
        {label}
        <IconChevron open={open} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <Collapse id={id}>
            <div ref={body} className="-mx-1 space-y-5 px-1 pb-1 pt-3">{children}</div>
          </Collapse>
        )}
      </AnimatePresence>
    </div>
  );
}
