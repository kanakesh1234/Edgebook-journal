"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useDragControls, useReducedMotion, type PanInfo } from "motion/react";
import { cn } from "@/lib/utils";
import { CheckIcon, SearchIcon, SlidersIcon, XIcon } from "@/components/ui/icons";

/* ------------------------------------------------------------------ */
/*  Motion + button tokens                                             */
/* ------------------------------------------------------------------ */

export const EASE = [0.16, 1, 0.3, 1] as const;
export const SPRING = { type: "spring", stiffness: 420, damping: 36 } as const;

export const btnPrimary =
  "inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-control bg-gold-strong px-4 text-sm font-semibold tracking-[-0.01em] text-on-gold transition-[background-color,transform] duration-200 hover:bg-gold-strong-hover active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";
export const btn =
  "inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-control border border-line bg-raised px-4 text-sm font-medium tracking-[-0.01em] text-ink transition-[background-color,border-color,transform] duration-200 hover:border-line-strong active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";
export const btnDanger =
  "inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-control border border-loss/35 bg-loss/[0.07] px-4 text-sm font-semibold tracking-[-0.01em] text-loss transition-[background-color,transform] duration-200 hover:bg-loss/[0.14] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40";
/** Quiet text button used in sheet headers (Edit, Done, Make primary). */
export const btnText =
  "inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[14px] font-medium text-gold-deep transition-[background-color,transform,opacity] duration-150 hover:bg-gold/10 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40 dark:text-gold";

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/* ------------------------------------------------------------------ */
/*  Icons local to the Lab                                             */
/* ------------------------------------------------------------------ */

export function DotsIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} width="1em" height="1em" aria-hidden>
      <circle cx="5.5" cy="12" r="1.7" />
      <circle cx="12" cy="12" r="1.7" />
      <circle cx="18.5" cy="12" r="1.7" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Segmented control — Apple style, one thumb gliding between options */
/* ------------------------------------------------------------------ */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  layoutId,
  className,
  size = "md",
  role = "tablist",
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
  label: string;
  layoutId: string;
  className?: string;
  size?: "sm" | "md";
  role?: "tablist" | "radiogroup";
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const tabs = role === "tablist";

  const onKey = (e: ReactKeyboardEvent) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const i = options.findIndex((o) => o.id === value);
    const n = (i + (e.key === "ArrowRight" ? 1 : -1) + options.length) % options.length;
    onChange(options[n].id);
    refs.current[n]?.focus();
  };

  return (
    <div
      role={role}
      aria-label={label}
      onKeyDown={onKey}
      className={cn("relative inline-flex max-w-full overflow-x-auto rounded-[12px] bg-ink/[0.05] p-[3px] [scrollbar-width:none]", className)}
    >
      {options.map((o, i) => {
        const active = o.id === value;
        return (
          <button
            key={o.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role={tabs ? "tab" : "radio"}
            aria-selected={tabs ? active : undefined}
            aria-checked={tabs ? undefined : active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.id)}
            className={cn(
              "relative isolate flex-1 whitespace-nowrap rounded-[9px] font-medium tracking-[-0.005em] transition-colors duration-200 sm:flex-none",
              size === "md" ? "h-8 px-3.5 text-[13px]" : "h-7 px-3 text-[12.5px]",
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

/* ------------------------------------------------------------------ */
/*  Popover + menu items — the one place a material is used            */
/* ------------------------------------------------------------------ */

const menuSurface = "rounded-[14px] border border-line bg-overlay/95 p-1.5 shadow-overlay backdrop-blur-2xl";

export function Popover({
  trigger,
  children,
  width = 232,
  align = "right",
}: {
  trigger: (p: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  width?: number;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", down);
    window.addEventListener("keydown", key, true);
    return () => {
      document.removeEventListener("pointerdown", down);
      window.removeEventListener("keydown", key, true);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            style={{ width }}
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.1 } }}
            transition={SPRING}
            className={cn(
              "absolute top-[calc(100%+6px)] z-50 max-w-[calc(100vw-24px)]",
              align === "right" ? "right-0 origin-top-right" : "left-0 origin-top-left",
              menuSurface,
            )}
          >
            {children(() => setOpen(false))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function MenuItem({
  children,
  onClick,
  checked,
  icon,
  danger,
}: {
  children: ReactNode;
  onClick: () => void;
  checked?: boolean;
  icon?: ReactNode;
  danger?: boolean;
}) {
  const radio = checked !== undefined;
  return (
    <button
      type="button"
      role={radio ? "menuitemradio" : "menuitem"}
      aria-checked={radio ? checked : undefined}
      onClick={onClick}
      className={cn(
        "flex h-9 w-full items-center gap-2 rounded-[8px] pl-1.5 pr-2.5 text-left text-[14px] outline-none transition-colors",
        "hover:bg-ink/[0.07] focus-visible:bg-ink/[0.07] active:bg-ink/[0.11]",
        danger ? "text-loss" : "text-ink",
      )}
    >
      <span className="grid h-4 w-4 shrink-0 place-items-center [&>svg]:h-4 [&>svg]:w-4">
        {radio ? checked && <CheckIcon className="h-3.5 w-3.5 text-gold" /> : icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}

export const MenuHeading = ({ children }: { children: ReactNode }) => (
  <p className="px-2.5 pb-1 pt-2 text-[12px] font-semibold text-faint">{children}</p>
);
export const MenuDivider = () => <div className="mx-1 my-1.5 h-px bg-line-soft" />;

/** Compact ⋯ menu used on cards and in sheet headers. */
export type KebabItem = { label: string; onClick: () => void; danger?: boolean; icon?: ReactNode } | "divider";

export function KebabMenu({ label, items, className }: { label: string; items: KebabItem[]; className?: string }) {
  return (
    <div className={className}>
      <Popover
        width={208}
        trigger={({ toggle, open }) => (
          <button
            type="button"
            aria-label={label}
            title={label}
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={toggle}
            className={cn(
              "grid h-11 w-11 place-items-center rounded-full text-faint outline-none transition-[background-color,color,transform] duration-150 sm:h-9 sm:w-9",
              "hover:bg-ink/[0.06] hover:text-ink active:scale-[0.92] focus-visible:ring-2 focus-visible:ring-gold-strong/50",
              open && "bg-ink/[0.08] text-ink",
            )}
          >
            <DotsIcon className="h-[18px] w-[18px]" />
          </button>
        )}
      >
        {(close) =>
          items.map((it, i) =>
            it === "divider" ? (
              <MenuDivider key={`d${i}`} />
            ) : (
              <MenuItem
                key={it.label}
                icon={it.icon}
                danger={it.danger}
                onClick={() => {
                  close();
                  it.onClick();
                }}
              >
                {it.label}
              </MenuItem>
            ),
          )
        }
      </Popover>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Toolbar: search field + sort/filter menu                           */
/* ------------------------------------------------------------------ */

export function SearchField({
  value,
  onChange,
  placeholder,
  inputRef,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  return (
    <label className="relative min-w-0 flex-1">
      <span className="sr-only">{placeholder}</span>
      <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-faint" />
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            if (value) onChange("");
            else inputRef.current?.blur();
          }
        }}
        type="text"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        className="h-10 w-full rounded-control border border-line bg-raised pl-10 pr-10 text-base text-ink transition-[border-color,box-shadow] duration-200 placeholder:text-faint hover:border-line-strong focus:border-gold/60 focus:outline-none focus:ring-4 focus:ring-gold/10 sm:text-[15px]"
      />
      {value ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-faint transition-colors hover:text-ink"
        >
          <XIcon className="h-4 w-4" />
        </button>
      ) : (
        <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-line bg-canvas/60 px-1.5 py-0.5 font-mono text-[11px] text-faint lg:block">
          /
        </kbd>
      )}
    </label>
  );
}

export interface MenuGroup {
  label: string;
  value: string;
  options: { id: string; label: string }[];
  onChange: (id: string) => void;
}

export function FilterSortMenu({
  label,
  groups,
  dirty,
  onReset,
}: {
  label: string;
  groups: MenuGroup[];
  dirty: boolean;
  onReset: () => void;
}) {
  return (
    <Popover
      width={236}
      trigger={({ toggle, open }) => (
        <button
          type="button"
          aria-label={dirty ? `${label}, changed` : label}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={toggle}
          className={cn(
            "relative inline-flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-control border bg-raised text-[14px] font-medium transition-colors duration-200 hover:text-ink sm:w-auto sm:px-3.5",
            dirty || open ? "border-gold/50 text-gold-deep dark:text-gold" : "border-line text-muted hover:border-line-strong",
          )}
        >
          <SlidersIcon className="h-[18px] w-[18px]" />
          <span className="hidden sm:inline">{label}</span>
          {dirty && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-gold-strong ring-2 ring-canvas" />}
        </button>
      )}
    >
      {(close) => (
        <>
          {groups.map((g, gi) => (
            <div key={g.label}>
              {gi > 0 && <MenuDivider />}
              <MenuHeading>{g.label}</MenuHeading>
              {g.options.map((o) => (
                <MenuItem
                  key={o.id}
                  checked={g.value === o.id}
                  onClick={() => {
                    g.onChange(o.id);
                    close();
                  }}
                >
                  {o.label}
                </MenuItem>
              ))}
            </div>
          ))}
          {dirty && (
            <>
              <MenuDivider />
              <MenuItem
                onClick={() => {
                  onReset();
                  close();
                }}
              >
                Reset
              </MenuItem>
            </>
          )}
        </>
      )}
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/*  Small pieces                                                       */
/* ------------------------------------------------------------------ */

export type Tone = "gold" | "profit" | "loss" | "info" | "neutral";

const pillTone: Record<Tone, string> = {
  gold: "border-gold/30 bg-gold/[0.09] text-gold-deep dark:text-gold",
  profit: "border-profit/25 bg-profit/[0.09] text-profit",
  loss: "border-loss/25 bg-loss/[0.08] text-loss",
  info: "border-info/25 bg-info/[0.09] text-info",
  neutral: "border-line bg-ink/[0.04] text-muted",
};

export function StatusPill({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex h-[22px] shrink-0 items-center gap-1 rounded-full border px-2 text-[11.5px] font-medium", pillTone[tone], className)}>
      {children}
    </span>
  );
}

export function Monogram({ name, className }: { name: string; className?: string }) {
  const ch = (name.trim()[0] ?? "·").toUpperCase();
  return (
    <span
      aria-hidden
      className={cn(
        "grid h-10 w-10 shrink-0 place-items-center rounded-[12px] border border-line bg-raised text-[16px] font-semibold text-gold shadow-panel",
        className,
      )}
    >
      {ch}
    </span>
  );
}

export function Chip({ children }: { children: ReactNode }) {
  return <span className="inline-flex h-6 items-center rounded-full border border-line bg-raised px-2.5 text-[12px] font-medium text-muted">{children}</span>;
}

export function SectionLabel({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn("text-[11px] font-medium uppercase tracking-[0.1em] text-faint", className)}>{children}</h3>;
}

/** A thin progress bar that fills in once, on mount. */
export function Progress({
  value,
  tone,
  size = "md",
  label,
  delay = 0.1,
  ticks,
}: {
  /** Fractions (0–1) to mark with a faint notch, e.g. milestones. */
  ticks?: number[];
  value: number;
  tone?: "profit" | "loss";
  size?: "md" | "lg";
  label: string;
  delay?: number;
}) {
  const reduce = useReducedMotion();
  const pct = Math.min(1, Math.max(0, value));
  return (
    <div className="lb-track relative" data-size={size === "lg" ? "lg" : undefined} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct * 100)} aria-label={label}>
      <motion.div
        className="lb-fill"
        data-tone={tone}
        initial={reduce ? false : { width: 0 }}
        animate={{ width: `${pct * 100}%` }}
        transition={{ duration: reduce ? 0 : 0.9, delay: reduce ? 0 : delay, ease: EASE }}
      />
      {ticks?.map((t) => (
        <span key={t} aria-hidden className="absolute inset-y-0 w-px bg-canvas/80" style={{ left: `${t * 100}%` }} />
      ))}
    </div>
  );
}

/** Enter/exit/reflow wrapper for grid cards. The hover lift lives on the inner card in CSS. */
export function CardMotion({ index, children }: { index: number; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      layout={reduce ? false : "position"}
      initial={reduce ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
      transition={{ duration: 0.38, delay: Math.min(index * 0.03, 0.15), ease: EASE }}
      className="min-w-0"
    >
      {children}
    </motion.div>
  );
}

export function ResultsLine({ children, trailing }: { children: ReactNode; trailing?: ReactNode }) {
  return (
    <div className="mb-4 flex min-h-8 flex-wrap items-center justify-between gap-x-4 gap-y-1">
      <p className="text-[13px] text-muted" aria-live="polite">
        {children}
      </p>
      {trailing}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sheet — side panel on tablet/desktop, bottom sheet on phones       */
/* ------------------------------------------------------------------ */

let scrollLocks = 0;
function lockScroll() {
  if (scrollLocks++ === 0) document.documentElement.style.overflow = "hidden";
}
function unlockScroll() {
  if (--scrollLocks <= 0) {
    scrollLocks = 0;
    document.documentElement.style.overflow = "";
  }
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Sheet({
  open,
  onClose,
  label,
  actions,
  footer,
  locked,
  children,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  /** Right side of the sheet's top bar. */
  actions?: ReactNode;
  footer?: ReactNode;
  /** Another overlay (e.g. a confirmation) is on top: ignore Escape. */
  locked?: boolean;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const controls = useDragControls();
  const reduce = useReducedMotion();
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const lockedRef = useRef(locked);
  lockedRef.current = locked;

  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement as HTMLElement | null;
    lockScroll();
    const t = window.setTimeout(() => {
      const el = panelRef.current;
      if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
    }, 40);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !lockedRef.current && !e.defaultPrevented) onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      unlockScroll();
      trigger?.focus?.({ preventScroll: true });
    };
  }, [open]);

  useLayoutEffect(() => {
    if (open) setScrolled(false);
  }, [open]);

  if (typeof document === "undefined") return null;

  const phone = window.matchMedia("(max-width: 639.98px)").matches;
  const hidden = reduce ? { opacity: 0 } : phone ? { opacity: 1, y: "100%" } : { opacity: 0, x: 36 };
  const shown = reduce ? { opacity: 1 } : phone ? { opacity: 1, y: 0 } : { opacity: 1, x: 0 };

  const trapTab = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const nodes = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((n) => n.offsetParent !== null);
    if (nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.y > 110 || info.velocity.y > 600) onCloseRef.current();
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="scrim"
            className="lb-scrim"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            key="panel"
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={label}
            tabIndex={-1}
            className="lb-sheet"
            initial={hidden}
            animate={shown}
            exit={hidden}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 40, mass: 0.9 }}
            drag={phone && !reduce ? "y" : false}
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            dragSnapToOrigin
            onDragEnd={onDragEnd}
            onKeyDown={trapTab}
          >
            <div className="lb-grab" onPointerDown={(e) => controls.start(e)} aria-hidden="true" />
            <div className={cn("flex items-center justify-between gap-2 border-b px-3 py-2.5 transition-colors duration-200 sm:px-4 sm:pt-3.5", scrolled ? "border-line-soft" : "border-transparent")}>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="grid h-10 w-10 place-items-center rounded-full text-muted outline-none transition-[background-color,color,transform] hover:bg-ink/[0.06] hover:text-ink active:scale-[0.92] focus-visible:ring-2 focus-visible:ring-gold-strong/50 sm:h-9 sm:w-9"
              >
                <XIcon className="h-[18px] w-[18px]" />
              </button>
              <div className="flex items-center gap-1">{actions}</div>
            </div>
            <div className="lb-sheet-body" onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 4)}>
              {children}
            </div>
            {footer && <div className="lb-sheet-foot">{footer}</div>}
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/** Keeps rendering the last non-null value so a sheet can finish its exit animation. */
export function useRetained<T>(value: T | null): T | null {
  const ref = useRef<T | null>(value);
  if (value !== null) ref.current = value;
  return value ?? ref.current;
}
