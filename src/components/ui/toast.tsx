"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { AnimatePresence, motion } from "motion/react";
import { cn, uid } from "@/lib/utils";
import { AlertTriangleIcon, CheckCircleIcon, InfoIcon, SparklesIcon, XIcon } from "./icons";

export type ToastKind = "success" | "error" | "info" | "celebrate";

interface ToastItem {
  id: string;
  kind: ToastKind;
  title: string;
  message?: string;
}

interface ToastStore {
  toasts: ToastItem[];
  push(kind: ToastKind, title: string, message?: string): void;
  dismiss(id: string): void;
}

export const useToasts = create<ToastStore>((set) => ({
  toasts: [],
  push: (kind, title, message) => {
    const id = uid("t");
    set((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, title, message }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, kind === "error" ? 5200 : 3800);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

export const toast = {
  success: (title: string, message?: string) => useToasts.getState().push("success", title, message),
  error: (title: string, message?: string) => useToasts.getState().push("error", title, message),
  info: (title: string, message?: string) => useToasts.getState().push("info", title, message),
  celebrate: (title: string, message?: string) => useToasts.getState().push("celebrate", title, message),
};

const kindStyles: Record<ToastKind, { ring: string; icon: React.ReactNode; bar: string }> = {
  success: {
    ring: "border-profit/25",
    bar: "bg-gradient-to-b from-profit/70 to-transparent",
    icon: <CheckCircleIcon className="h-4.5 w-4.5 text-profit" />,
  },
  error: {
    ring: "border-loss/30",
    bar: "bg-gradient-to-b from-loss/70 to-transparent",
    icon: <AlertTriangleIcon className="h-4.5 w-4.5 text-loss" />,
  },
  info: {
    ring: "border-line-strong",
    bar: "bg-gradient-to-b from-info/60 to-transparent",
    icon: <InfoIcon className="h-4.5 w-4.5 text-info" />,
  },
  celebrate: {
    ring: "border-gold/35",
    bar: "bg-gradient-to-b from-gold/80 to-transparent",
    icon: <SparklesIcon className="h-4.5 w-4.5 text-gold" />,
  },
};

function ToastCard({ item }: { item: ToastItem }) {
  const dismiss = useToasts((s) => s.dismiss);
  const style = kindStyles[item.kind];
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 18, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, x: 40, transition: { duration: 0.2 } }}
      transition={{ type: "spring", stiffness: 420, damping: 32 }}
      className={cn(
        "pointer-events-auto relative flex w-[340px] max-w-[calc(100vw-2rem)] items-start gap-3 overflow-hidden rounded-panel border bg-overlay/95 py-3 pl-4 pr-9 shadow-overlay backdrop-blur-md",
        style.ring,
      )}
      role="status"
    >
      <span className={cn("absolute inset-y-0 left-0 w-[3px]", style.bar)} aria-hidden />
      <span className="mt-0.5 shrink-0">{style.icon}</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{item.title}</p>
        {item.message && <p className="mt-0.5 text-[13px] leading-snug text-muted">{item.message}</p>}
      </div>
      <button
        onClick={() => dismiss(item.id)}
        aria-label="Dismiss notification"
        className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-md text-faint hover:bg-ink/[0.05] hover:text-ink"
      >
        <XIcon className="h-3.5 w-3.5" />
      </button>
    </motion.div>
  );
}

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  const [mounted, setMounted] = useState(false);

  // Portals must only appear after hydration to avoid SSR mismatches.
  useEffect(() => setMounted(true), []);

  // Clear pending toasts on unmount.
  useEffect(() => () => useToasts.setState({ toasts: [] }), []);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div className="pointer-events-none fixed bottom-24 right-5 z-[100] flex flex-col-reverse gap-2.5">
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => (
          <ToastCard key={t.id} item={t} />
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
