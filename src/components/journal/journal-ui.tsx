"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Sym, type SymName } from "./symbols";
import { cn } from "@/lib/utils";

export const SPRING = { type: "spring", stiffness: 420, damping: 36 } as const;
export const EASE = [0.32, 0.72, 0, 1] as const;

/** Toolbar-weight icon button: no border, a soft fill on hover/press. */
export function IconButton({
  label, icon, onClick, active, disabled, dot, className, ...rest
}: {
  label: string; icon: SymName; onClick?: () => void; active?: boolean; disabled?: boolean; dot?: boolean; className?: string;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "className">) {
  return (
    <button
      type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
      className={cn(
        "relative grid h-8 w-8 shrink-0 place-items-center rounded-[9px] text-ink/75 outline-none transition-[background-color,transform,color] duration-150",
        "hover:bg-ink/[0.06] hover:text-ink active:scale-[0.94] active:bg-ink/[0.1] focus-visible:ring-2 focus-visible:ring-gold-strong/50 disabled:pointer-events-none disabled:opacity-30",
        active && "bg-ink/[0.08] text-ink", className,
      )}
      {...rest}
    >
      <Sym name={icon} />
      {dot && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-gold-strong" />}
    </button>
  );
}

/** The one place a material is used: floating menus. */
const surface =
  "rounded-[14px] bg-surface/90 p-1.5 shadow-[0_12px_40px_-8px_rgb(0_0_0/0.28),0_0_0_0.5px_rgb(0_0_0/0.12)] backdrop-blur-2xl dark:shadow-[0_12px_40px_-8px_rgb(0_0_0/0.6),0_0_0_0.5px_rgb(255_255_255/0.12)]";

export function Popover({
  trigger, children, width = 232,
}: {
  trigger: (p: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", down); document.removeEventListener("keydown", key); };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu" style={{ width }}
            initial={{ opacity: 0, scale: 0.96, y: -4 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, transition: { duration: 0.1 } }}
            transition={SPRING}
            className={cn("absolute right-0 top-[calc(100%+6px)] z-50 origin-top-right", surface)}
          >
            {children(() => setOpen(false))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Right-click menu, clamped to the viewport. */
export function ContextMenu({ x, y, onClose, children }: { x: number; y: number; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  useLayoutEffect(() => {
    const r = ref.current?.getBoundingClientRect();
    if (r) setPos({ x: Math.min(x, window.innerWidth - r.width - 8), y: Math.min(y, window.innerHeight - r.height - 8) });
  }, [x, y]);
  useEffect(() => {
    const down = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", down);
    document.addEventListener("keydown", key);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => { document.removeEventListener("pointerdown", down); document.removeEventListener("keydown", key); window.removeEventListener("scroll", onClose, true); window.removeEventListener("resize", onClose); };
  }, [onClose]);
  return (
    <motion.div
      ref={ref} role="menu" style={{ left: pos.x, top: pos.y, width: 216 }}
      initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, transition: { duration: 0.08 } }} transition={SPRING}
      className={cn("fixed z-[60] origin-top-left", surface)}
    >
      {children}
    </motion.div>
  );
}

export function MenuItem({
  children, onClick, checked, icon, danger, hint,
}: { children: ReactNode; onClick: () => void; checked?: boolean; icon?: SymName; danger?: boolean; hint?: string }) {
  const radio = checked !== undefined;
  return (
    <button
      type="button" role={radio ? "menuitemradio" : "menuitem"} aria-checked={radio ? checked : undefined} onClick={onClick}
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-[8px] pl-1.5 pr-2.5 text-left text-[14px] outline-none transition-colors",
        "hover:bg-ink/[0.07] focus-visible:bg-ink/[0.07] active:bg-ink/[0.11]", danger ? "text-loss" : "text-ink",
      )}
    >
      <span className="grid h-4 w-4 shrink-0 place-items-center">
        {radio ? checked && <Sym name="check" className="h-3.5 w-3.5 text-gold" strokeWidth={2.2} /> : icon && <Sym name={icon} className="h-4 w-4" />}
      </span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {hint && <span className="text-[12px] text-faint">{hint}</span>}
    </button>
  );
}
export const MenuHeading = ({ children }: { children: ReactNode }) => (
  <p className="px-2.5 pb-1 pt-2 text-[12px] font-semibold text-faint">{children}</p>
);
export const MenuDivider = () => <div className="mx-1 my-1.5 h-px bg-line-soft" />;
