"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion, type Transition } from "motion/react";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import { haptic } from "@/lib/haptics";

/* ================================================================== */
/*  Springs                                                            */
/*                                                                      */
/*  Apple describes springs as (response, dampingFraction). These      */
/*  convert that to the physical stiffness/damping motion expects:     */
/*     stiffness = (2π / response)²    damping = 4π·ζ / response       */
/* ================================================================== */

export const spring = (response: number, dampingFraction: number): Transition => ({
  type: "spring",
  stiffness: (2 * Math.PI / response) ** 2,
  damping: (4 * Math.PI * dampingFraction) / response,
  mass: 1,
});

/** Controls, toggles, small state changes. */
export const SNAPPY = spring(0.34, 0.88);
/** Layout changes, list inserts/removals. */
export const SMOOTH = spring(0.5, 0.92);
/** Sheets and large surfaces. */
export const SHEET = spring(0.5, 0.88);
/** Confirmations — a touch of overshoot. */
export const BOUNCY = spring(0.42, 0.6);

export const INSTANT: Transition = { duration: 0 };

/* ================================================================== */
/*  Icons                                                              */
/*                                                                      */
/*  Original glyphs drawn on a 24-pt grid with round caps and a        */
/*  regular stroke weight, to sit alongside SF Symbols conventions.    */
/*  (SF Symbols itself is licensed for Apple platforms only, so none   */
/*  of its artwork is used here.)                                      */
/* ================================================================== */

interface IconProps {
  className?: string;
  weight?: number;
}

function Svg({ children, className, weight = 1.8 }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={weight}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("h-5 w-5 shrink-0", className)}
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

type IconC = (p: IconProps) => React.JSX.Element;

export const Icon: Record<
  | "Search" | "Xmark" | "ChevronRight" | "ChevronLeft" | "Check" | "Plus" | "PersonPlus" | "PersonMinus"
  | "Persons" | "Copy" | "Bars" | "Warning" | "Refresh" | "Bolt" | "Target" | "Calendar" | "TrendUp" | "At" | "Clock",
  IconC
> = {
  Search: (p) => (
    <Svg {...p}>
      <circle cx="10.5" cy="10.5" r="6.25" />
      <path d="m15.3 15.3 4.9 4.9" />
    </Svg>
  ),
  Xmark: (p) => (
    <Svg weight={2.1} {...p}>
      <path d="m6.8 6.8 10.4 10.4M17.2 6.8 6.8 17.2" />
    </Svg>
  ),
  ChevronRight: (p) => (
    <Svg weight={2.2} {...p}>
      <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
    </Svg>
  ),
  ChevronLeft: (p) => (
    <Svg weight={2.2} {...p}>
      <path d="M14.5 5.5 8 12l6.5 6.5" />
    </Svg>
  ),
  Check: (p) => (
    <Svg weight={2.3} {...p}>
      <path d="m5 12.8 4.6 4.6L19 7.4" />
    </Svg>
  ),
  Plus: (p) => (
    <Svg weight={2.1} {...p}>
      <path d="M12 5.5v13M5.5 12h13" />
    </Svg>
  ),
  PersonPlus: (p) => (
    <Svg {...p}>
      <circle cx="9.5" cy="8" r="3.6" />
      <path d="M2.9 19.6c.3-3.4 3-5.6 6.6-5.6 1.1 0 2.1.2 3 .6" />
      <path d="M18 14v6M15 17h6" />
    </Svg>
  ),
  PersonMinus: (p) => (
    <Svg {...p}>
      <circle cx="9.5" cy="8" r="3.6" />
      <path d="M2.9 19.6c.3-3.4 3-5.6 6.6-5.6 1.1 0 2.1.2 3 .6" />
      <path d="M15 17h6" />
    </Svg>
  ),
  Persons: (p) => (
    <Svg {...p}>
      <circle cx="9" cy="8.6" r="3.3" />
      <path d="M2.8 19.2c.2-3.2 2.9-5.4 6.2-5.4s6 2.2 6.2 5.4" />
      <path d="M15.4 5.7a3.3 3.3 0 0 1 0 5.8" />
      <path d="M17.6 14.3c2.3.5 3.8 2.3 3.9 4.9" />
    </Svg>
  ),
  Copy: (p) => (
    <Svg {...p}>
      <rect x="8.6" y="8.6" width="11" height="11.6" rx="2.6" />
      <path d="M8.6 15.8H7A2.6 2.6 0 0 1 4.4 13.2V7A2.6 2.6 0 0 1 7 4.4h5.9A2.6 2.6 0 0 1 15.5 7v1.6" />
    </Svg>
  ),
  Bars: (p) => (
    <Svg weight={2.6} {...p}>
      <path d="M6.5 19v-5.5M12 19V5.5M17.5 19v-9" />
    </Svg>
  ),
  Warning: (p) => (
    <Svg {...p}>
      <path d="M12 4.3 21 19.7H3z" />
      <path d="M12 10.2v4.1M12 17.1h.01" />
    </Svg>
  ),
  Refresh: (p) => (
    <Svg {...p}>
      <path d="M19.6 12a7.6 7.6 0 1 1-2.5-5.6" />
      <path d="M18.6 3.4v4.1h-4.1" />
    </Svg>
  ),
  Bolt: (p) => (
    <Svg {...p}>
      <path d="M13.2 3.2 5.8 13.4h5.6l-.6 7.4 7.4-10.2h-5.6z" />
    </Svg>
  ),
  Target: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.2" />
      <circle cx="12" cy="12" r="4.3" />
      <path d="M12 12h.01" strokeWidth={3.4} />
    </Svg>
  ),
  Calendar: (p) => (
    <Svg {...p}>
      <rect x="3.8" y="5.2" width="16.4" height="15" rx="3.4" />
      <path d="M3.8 10.2h16.4M8.2 3.3v3.4M15.8 3.3v3.4" />
    </Svg>
  ),
  TrendUp: (p) => (
    <Svg {...p}>
      <path d="m3.8 16.8 5.6-5.6 3.8 3.8 7-7.2" />
      <path d="M15.4 7.8h4.8v4.8" />
    </Svg>
  ),
  At: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3.7" />
      <path d="M15.7 8.6v5.1a2.5 2.5 0 0 0 5 0V12A8.7 8.7 0 1 0 17.3 18.9" />
    </Svg>
  ),
  Clock: (p) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M12 7.4V12l3.1 1.9" />
    </Svg>
  ),
};

/** Rounded-square icon chip, as used in iOS Settings. */
export function Tile({ children, color, fg = "#fff", size = 30 }: { children: ReactNode; color: string; fg?: string; size?: number }) {
  return (
    <span className="fr-tile fr-squircle" style={{ width: size, height: size, background: color, color: fg }} aria-hidden="true">
      {children}
    </span>
  );
}

/* ================================================================== */
/*  Avatar                                                             */
/* ================================================================== */

const PALETTE: [string, string][] = [
  ["#d2ab63", "#a37a35"], // gold
  ["#86b394", "#54846a"], // sage
  ["#86a3cd", "#5a78a6"], // blue
  ["#b895b0", "#8c6684"], // plum
  ["#cc9684", "#a46655"], // clay
  ["#97a1af", "#6b7685"], // slate
];

function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Stable palette slot for a person. Pass `avoid` to guarantee two people never share a colour. */
export function paletteIndex(seed: string, avoid?: number): number {
  const i = hash(seed.toLowerCase()) % PALETTE.length;
  return avoid !== undefined && i === avoid ? (i + 3) % PALETTE.length : i;
}

/** The deeper tone of a palette slot — used for data bars that should match an avatar. */
export const paletteDeep = (index: number): string => PALETTE[index % PALETTE.length][1];

/** Monogram on a soft gradient — the same idea as Contacts / Messages. */
export function Avatar({
  name,
  seed,
  size = 44,
  layoutId,
  className,
  palette,
}: {
  name: string;
  seed: string;
  size?: number;
  /** Shared-element id so the row's avatar can morph into the card's. */
  layoutId?: string;
  className?: string;
  /** Force a palette slot (see paletteIndex). */
  palette?: number;
}) {
  const reduce = useReducedMotion();
  const [a, b] = PALETTE[(palette ?? paletteIndex(seed)) % PALETTE.length];
  const initial = (name.trim()[0] ?? "?").toUpperCase();
  return (
    <motion.span
      layoutId={reduce ? undefined : layoutId}
      className={cn("fr-avatar", className)}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        fontSize: Math.round(size * 0.44),
        background: `linear-gradient(155deg, ${a}, ${b})`,
      }}
      aria-hidden="true"
    >
      {initial}
    </motion.span>
  );
}

/* ================================================================== */
/*  Inset grouped list                                                 */
/* ================================================================== */

export function Section({
  title,
  trailing,
  footer,
  children,
  className,
}: {
  title?: string;
  trailing?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section aria-labelledby={title ? id : undefined} className={className}>
      {(title || trailing) && (
        <div className="fr-section-head">
          {title && (
            <h2 id={id} className="fr-footnote fr-section-title">
              {title}
            </h2>
          )}
          {trailing}
        </div>
      )}
      {children}
      {footer && <p className="fr-footnote fr-section-foot">{footer}</p>}
    </section>
  );
}

/** The rounded container. Pass `<ListItem>`s as children, usually inside AnimatePresence. */
export function Group({ children, className, style }: { children: ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <ul className={cn("fr-group fr-squircle", className)} style={{ position: "relative", ...style }}>
      {children}
    </ul>
  );
}

/** Row that grows in / shrinks out (requests, sent). */
export function CollapseItem({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.li
      className="fr-li"
      style={{ overflow: "hidden" }}
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={reduce ? INSTANT : { height: SMOOTH, opacity: { duration: 0.2 } }}
    >
      {children}
    </motion.li>
  );
}

/** Row that slides to its new place when the list re-sorts (friends). Use with AnimatePresence mode="popLayout". */
export function LayoutItem({ children }: { children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.li
      layout={reduce ? false : "position"}
      className="fr-li"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={reduce ? INSTANT : { layout: SMOOTH, default: SNAPPY, opacity: { duration: 0.22 } }}
    >
      {children}
    </motion.li>
  );
}

/** Section that collapses away entirely when it has nothing to show. */
export function Collapse({ show, children }: { show: boolean; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          key="collapse"
          className="fr-collapse"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={reduce ? INSTANT : { height: SMOOTH, opacity: { duration: 0.22 } }}
        >
          <div className="fr-collapse-inner">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ================================================================== */
/*  Controls                                                           */
/* ================================================================== */

export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  const id = useId();
  const reduce = useReducedMotion();
  const move = (dir: 1 | -1) => {
    const i = options.findIndex((o) => o.value === value);
    onChange(options[(i + dir + options.length) % options.length].value);
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="fr-segmented fr-squircle"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); move(1); }
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); move(-1); }
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} onClick={() => onChange(o.value)}>
            {on && <motion.span layoutId={`seg-${id}`} className="fr-segmented-thumb" transition={reduce ? INSTANT : SNAPPY} />}
            <span style={{ position: "relative" }}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ================================================================== */
/*  Loading / empty / error                                            */
/* ================================================================== */

export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <ul className="fr-group fr-squircle" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className="fr-li">
          <div className="fr-row" style={{ cursor: "default" }}>
            <span className="fr-skel" style={{ width: 44, height: 44, borderRadius: 22, flex: "none", animationDelay: `${i * 120}ms` }} />
            <span style={{ flex: 1, display: "grid", gap: 8 }}>
              <span className="fr-skel" style={{ height: 13, width: `${42 + ((i * 17) % 22)}%`, animationDelay: `${i * 120}ms` }} />
              <span className="fr-skel" style={{ height: 11, width: `${58 + ((i * 11) % 18)}%`, animationDelay: `${i * 120 + 60}ms` }} />
            </span>
            <span className="fr-skel" style={{ height: 18, width: 30, animationDelay: `${i * 120}ms` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Apple's "content unavailable" pattern: a symbol, a plain-language title, one line of guidance, one action. */
export function Unavailable({
  icon,
  title,
  body,
  action,
  tone = "neutral",
}: {
  icon: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
  tone?: "neutral" | "error";
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={reduce ? INSTANT : SMOOTH}
      className="fr-group fr-squircle"
      style={{ padding: "44px 28px 36px", textAlign: "center" }}
      role={tone === "error" ? "alert" : undefined}
    >
      <span
        className="fr-squircle"
        style={{
          display: "inline-grid",
          placeItems: "center",
          width: 68,
          height: 68,
          borderRadius: 22,
          background: tone === "error" ? "color-mix(in srgb, var(--loss) 12%, transparent)" : "color-mix(in srgb, var(--gold) 14%, transparent)",
          color: tone === "error" ? "var(--loss)" : "var(--gold)",
        }}
        aria-hidden="true"
      >
        {icon}
      </span>
      <h3 className="fr-title2" style={{ marginTop: 18, color: "var(--ink)" }}>
        {title}
      </h3>
      <p className="fr-subhead" style={{ margin: "6px auto 0", maxWidth: 330, color: "var(--muted)" }}>
        {body}
      </p>
      {action && <div style={{ marginTop: 22, display: "flex", justifyContent: "center" }}>{action}</div>}
    </motion.div>
  );
}

/* ================================================================== */
/*  Clipboard                                                          */
/* ================================================================== */

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers / non-secure contexts.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/** `copied` flips true for a moment after a successful copy, so the button can confirm in place. */
export function useCopy() {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const copy = useCallback(async (text: string) => {
    const ok = await copyText(text);
    if (ok) {
      haptic.selection();
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1600);
    } else {
      toast.error("Couldn't copy", "Select the ID and copy it manually.");
    }
    return ok;
  }, []);
  return { copied, copy };
}

/** Cross-fades a button's content (Copy → Copied) with a small spring, like a native label swap. */
export function SwapLabel({ id, children }: { id: string; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.span
        key={id}
        initial={reduce ? false : { opacity: 0, y: 7, scale: 0.92 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: -7, scale: 0.92 }}
        transition={reduce ? INSTANT : SNAPPY}
        style={{ display: "inline-flex", alignItems: "center", gap: 5 }}
      >
        {children}
      </motion.span>
    </AnimatePresence>
  );
}
