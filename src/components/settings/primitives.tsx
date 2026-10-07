"use client";

import "./settings.css";
import Link from "next/link";
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/button";
import { ArrowUpRightGlyph, MinusGlyph, PlusGlyph } from "./icons";

/* -------------------------------------------------------------------------- */
/*  Icon tile — solid theme colour, glyph knocked out in the canvas colour.    */
/* -------------------------------------------------------------------------- */

export type Tone = "gold" | "info" | "profit" | "loss" | "ink";
const TILE: Record<Tone, string> = {
  gold: "bg-gold",
  info: "bg-info",
  profit: "bg-profit",
  loss: "bg-loss",
  ink: "bg-ink",
};

export function Tile({ tone = "ink", children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[7px] text-canvas [&>svg]:h-[17px] [&>svg]:w-[17px]",
        TILE[tone],
      )}
    >
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Group — header · surface · footer                                          */
/* -------------------------------------------------------------------------- */

export function Group({
  title,
  footer,
  footerTone = "default",
  children,
  className,
}: {
  title?: string;
  footer?: ReactNode;
  footerTone?: "default" | "error";
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section className={cn("st-section", className)} aria-labelledby={title ? id : undefined}>
      {title && (
        <h3 id={id} className="st-header">
          {title}
        </h3>
      )}
      <div className="st-group">{children}</div>
      {footer && (
        <p className="st-footer" data-tone={footerTone} role={footerTone === "error" ? "alert" : undefined}>
          {footer}
        </p>
      )}
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  Row — static, button, or link                                              */
/* -------------------------------------------------------------------------- */

export interface RowProps {
  icon?: ReactNode;
  tone?: Tone;
  /** Fully custom leading element (e.g. an avatar). */
  leading?: ReactNode;
  large?: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  value?: ReactNode;
  trailing?: ReactNode;
  chevron?: boolean;
  href?: string;
  /** Opens in a new tab and shows the arrow.up.right affordance. */
  newTab?: boolean;
  /** Plain <a> (full navigation) — for API routes such as OAuth. */
  native?: boolean;
  onClick?: () => void;
  selected?: boolean;
  current?: boolean;
  destructive?: boolean;
  centered?: boolean;
  disabled?: boolean;
  busy?: boolean;
}

export function Row(props: RowProps) {
  const {
    icon, tone, leading, large, title, subtitle, value, trailing, chevron, href, newTab, native,
    onClick, selected, current, destructive, centered, disabled, busy,
  } = props;

  const interactive = !!(href || onClick) && !disabled && !busy;

  const body = (
    <>
      {leading ?? (icon ? <Tile tone={tone}>{icon}</Tile> : null)}
      <span className={cn("min-w-0", !centered && "flex-1")}>
        <span className={cn("st-title", destructive && "text-loss", large && "truncate text-[19px] font-semibold tracking-[-0.01em]")}>
          {title}
        </span>
        {subtitle && <span className={cn("st-sub", large && "truncate")}>{subtitle}</span>}
      </span>
      {value != null && <span className="st-value">{value}</span>}
      {trailing}
      {busy && <Spinner className="h-4 w-4 shrink-0 text-muted" />}
      {newTab && <ArrowUpRightGlyph className="h-[15px] w-[15px] shrink-0 text-faint" />}
      {chevron && !busy && <ChevronRightIcon className="st-chev" />}
    </>
  );

  const attrs = {
    className: "st-row",
    "data-icon": icon || leading ? "true" : undefined,
    "data-large": large ? "true" : undefined,
    "data-interactive": interactive ? "true" : undefined,
    "data-selected": selected ? "true" : undefined,
    "data-centered": centered ? "true" : undefined,
    "aria-current": current ? ("true" as const) : undefined,
  };

  if (href && !disabled) {
    if (newTab) {
      return (
        <a {...attrs} href={href} target="_blank" rel="noopener noreferrer">
          {body}
        </a>
      );
    }
    if (native) {
      return (
        <a {...attrs} href={href}>
          {body}
        </a>
      );
    }
    return (
      <Link {...attrs} href={href}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" {...attrs} onClick={onClick} disabled={disabled || busy} aria-busy={busy || undefined}>
        {body}
      </button>
    );
  }
  return <div {...attrs}>{body}</div>;
}

/* -------------------------------------------------------------------------- */
/*  FieldRow — label + borderless input, with a trailing slot for Save         */
/* -------------------------------------------------------------------------- */

export function FieldRow({
  label,
  htmlFor,
  children,
  trailing,
}: {
  label: string;
  htmlFor: string;
  children: ReactNode;
  trailing?: ReactNode;
}) {
  return (
    <div className="st-row" data-field="true">
      <label htmlFor={htmlFor} className="st-field-label">
        {label}
      </label>
      {children}
      {trailing}
    </div>
  );
}

export type SaveState = "idle" | "saving" | "saved";

/** Inline "Save" text button → spinner → check. Hidden while there is nothing to save. */
export function SaveSlot({
  state,
  dirty,
  onSave,
  label,
}: {
  state: SaveState;
  dirty: boolean;
  onSave: () => void;
  label: string;
}) {
  const pop = { initial: { opacity: 0, scale: 0.85 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.85 } };
  return (
    <span className="flex min-w-[44px] shrink-0 justify-end">
      <AnimatePresence mode="wait" initial={false}>
        {state === "saving" ? (
          <motion.span key="saving" {...pop} transition={{ duration: 0.14 }} role="status" aria-label="Saving">
            <Spinner className="h-4 w-4 text-muted" />
          </motion.span>
        ) : state === "saved" ? (
          <motion.span key="saved" {...pop} transition={{ type: "spring", stiffness: 520, damping: 28 }} role="status" aria-label="Saved">
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] text-profit" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m5 12.5 4.5 4.5L19 7.5" />
            </svg>
          </motion.span>
        ) : dirty ? (
          <motion.button key="save" type="button" {...pop} transition={{ duration: 0.14 }} className="st-text-btn" onClick={onSave} aria-label={`Save ${label}`}>
            Save
          </motion.button>
        ) : null}
      </AnimatePresence>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Stepper — iOS-style − | +                                                  */
/* -------------------------------------------------------------------------- */

export function Stepper({
  label,
  onDecrement,
  onIncrement,
  canDecrement,
  canIncrement,
}: {
  label: string;
  onDecrement: () => void;
  onIncrement: () => void;
  canDecrement: boolean;
  canIncrement: boolean;
}) {
  return (
    <span className="st-stepper" role="group" aria-label={label}>
      <button type="button" onClick={onDecrement} disabled={!canDecrement} aria-label={`Decrease ${label.toLowerCase()}`}>
        <MinusGlyph className="h-4 w-4" />
      </button>
      <button type="button" onClick={onIncrement} disabled={!canIncrement} aria-label={`Increase ${label.toLowerCase()}`}>
        <PlusGlyph className="h-4 w-4" />
      </button>
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Avatar — neutral initials                                                  */
/* -------------------------------------------------------------------------- */

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({ name, size = 56 }: { name: string; size?: number }) {
  // The profile photo (square JPEG data-URL) lives in settings.avatar.
  const photo = useApp((s) => (s.settings as { avatar?: string }).avatar);
  if (photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo}
        alt=""
        aria-hidden
        draggable={false}
        className="shrink-0 select-none rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="grid shrink-0 select-none place-items-center rounded-full bg-ink/[0.08] font-medium text-muted"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initialsOf(name) || (
        <svg viewBox="0 0 24 24" width={size * 0.5} height={size * 0.5} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
          <circle cx="12" cy="8.5" r="3.6" />
          <path d="M4.8 19.5c1-3.6 3.9-5.2 7.2-5.2s6.2 1.6 7.2 5.2" />
        </svg>
      )}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*  Navigation bits                                                            */
/* -------------------------------------------------------------------------- */

export function BackButton({ onClick, label = "Settings" }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="st-back" onClick={onClick}>
      <ChevronLeftIcon className="h-[22px] w-[22px]" />
      {label}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  ActionSheet — bottom sheet on phones, compact alert on larger screens      */
/* -------------------------------------------------------------------------- */

export interface SheetAction {
  label: string;
  onClick: () => void;
  destructive?: boolean;
}

export function ActionSheet({
  open,
  onClose,
  title,
  message,
  actions,
  busy = false,
  cancelLabel = "Cancel",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  message?: string;
  actions: SheetAction[];
  busy?: boolean;
  cancelLabel?: string;
}) {
  const reduce = useReducedMotion();
  const panelRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const titleId = useId();
  const descId = useId();

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Safest default for a destructive confirmation: focus lands on Cancel.
    const t = window.setTimeout(() => cancelRef.current?.focus(), 40);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        if (!busyRef.current) onCloseRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const els = Array.from(panelRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])") ?? []);
      if (els.length === 0) return;
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (typeof document === "undefined") return null;

  const surface = "overflow-hidden rounded-[14px] bg-overlay shadow-overlay";

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="sheet-root"
          className="fixed inset-0 z-[80] flex items-end justify-center p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:items-center sm:p-6"
          initial="hidden"
          animate="visible"
          exit="hidden"
        >
          <motion.button
            type="button"
            tabIndex={-1}
            aria-label="Dismiss"
            variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
            transition={{ duration: 0.25 }}
            onClick={() => !busy && onClose()}
            className="absolute inset-0 cursor-default bg-black/40"
          />
          <motion.div
            ref={panelRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={message ? descId : undefined}
            variants={{
              hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 40, scale: 0.98 },
              visible: { opacity: 1, y: 0, scale: 1 },
            }}
            transition={{ type: "spring", stiffness: 420, damping: 38 }}
            className="relative w-full max-w-[400px] outline-none sm:max-w-[340px]"
          >
            <div className={surface}>
              <div className="st-sheet-head px-5 pb-4 pt-5 text-center">
                <h2 id={titleId} className="text-[15px] font-semibold leading-snug text-ink">
                  {title}
                </h2>
                {message && (
                  <p id={descId} className="mt-1 text-[13px] leading-snug text-muted">
                    {message}
                  </p>
                )}
              </div>
              {actions.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  className="st-sheet-btn"
                  data-destructive={a.destructive ? "true" : undefined}
                  disabled={busy}
                  onClick={a.onClick}
                >
                  {busy && <Spinner className="h-4 w-4" />}
                  {a.label}
                </button>
              ))}
            </div>
            <div className={cn(surface, "mt-2")}>
              <button ref={cancelRef} type="button" className="st-sheet-btn font-semibold" onClick={onClose} disabled={busy}>
                {cancelLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
