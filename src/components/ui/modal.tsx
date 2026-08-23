"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { XIcon } from "./icons";

const sizes = {
  sm: "max-w-md",
  md: "max-w-xl",
  lg: "max-w-3xl",
  xl: "max-w-5xl",
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  description?: React.ReactNode;
  size?: keyof typeof sizes;
  children: React.ReactNode;
  /** Extra classes on the scrollable body. */
  bodyClassName?: string;
  label?: string;
}

export function Modal({ open, onClose, title, description, size = "md", children, bodyClassName, label }: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const lastActive = useRef<HTMLElement | null>(null);

  // Scroll lock + escape + focus management
  useEffect(() => {
    if (!open) return;
    lastActive.current = document.activeElement as HTMLElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const t = setTimeout(() => panelRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      lastActive.current?.focus?.();
    };
  }, [open, onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="modal-root"
          className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-6"
          initial="hidden"
          animate="visible"
          exit="hidden"
        >
          {/* Backdrop */}
          <motion.button
            aria-label="Close dialog"
            tabIndex={-1}
            variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
            transition={{ duration: 0.22 }}
            onClick={onClose}
            className="absolute inset-0 cursor-default bg-black/65 backdrop-blur-[6px]"
          />

          {/* Panel */}
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={label ?? (typeof title === "string" ? title : undefined)}
            variants={{
              hidden: { opacity: 0, y: 28, scale: 0.985 },
              visible: { opacity: 1, y: 0, scale: 1 },
            }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              "relative flex max-h-[92dvh] w-full flex-col overflow-hidden border border-line-strong bg-surface shadow-[0_40px_120px_-20px_rgba(0,0,0,0.8)] outline-none",
              "rounded-t-2xl sm:rounded-2xl",
              sizes[size],
            )}
          >
            {(title || description) && (
              <header className="flex items-start justify-between gap-4 border-b border-line px-6 pb-4 pt-5">
                <div className="min-w-0">
                  {title && <h2 className="font-display text-lg font-semibold tracking-tight text-ink">{title}</h2>}
                  {description && <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{description}</p>}
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="-mr-2 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg text-faint transition-colors hover:bg-white/5 hover:text-ink"
                >
                  <XIcon className="h-4.5 w-4.5" />
                </button>
              </header>
            )}
            <div className={cn("min-h-0 flex-1 overflow-y-auto", bodyClassName)}>{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
