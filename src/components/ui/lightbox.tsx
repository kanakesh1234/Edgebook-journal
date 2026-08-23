"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";

/** Fullscreen image viewer with fade/zoom transitions. */
export function Lightbox({
  src,
  alt,
  onClose,
}: {
  src: string | null;
  alt?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!src) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [src, onClose]);

  return (
    <AnimatePresence>
      {src && typeof document !== "undefined" ? (
        <motion.div
          key="lightbox"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          onClick={onClose}
          className="fixed inset-0 z-[90] flex cursor-zoom-out items-center justify-center bg-black/85 p-4 backdrop-blur-sm sm:p-10"
          role="dialog"
          aria-modal="true"
          aria-label={alt ?? "Screenshot viewer"}
        >
          <motion.img
            src={src}
            alt={alt ?? ""}
            initial={{ scale: 0.92, y: 16 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="max-h-full max-w-full rounded-xl border border-white/10 object-contain shadow-2xl"
            draggable={false}
          />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
