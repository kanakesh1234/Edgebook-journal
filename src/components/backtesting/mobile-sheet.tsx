"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { createPortal } from "react-dom";
export { nearestSnapPoint, loupeOffset, isWithinHitArea } from "./mobile-utils";

interface MobileSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  children: React.ReactNode | ((query: string) => React.ReactNode);
}

/**
 * Bottom sheet for mobile / touch interfaces.
 * - Swipe down ≥80px to dismiss
 * - Backdrop tap closes
 * - Escape key closes
 * Only renders the sheet UI on pointer:coarse OR innerWidth ≤820.
 * On desktop it is transparent — callers render their own desktop UI.
 */
export default function MobileSheet({
  open,
  onClose,
  title,
  searchable,
  searchPlaceholder = "Search…",
  children,
}: MobileSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");

  // Swipe-to-dismiss
  const dragY = useRef<number | null>(null);
  const startScrollTop = useRef(0);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const el = sheetRef.current;
    if (!el) return;
    dragY.current = e.touches[0].clientY;
    startScrollTop.current = el.scrollTop;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    const el = sheetRef.current;
    if (!el || dragY.current === null) return;
    const dy = e.touches[0].clientY - dragY.current;
    // Only dismiss-drag when scrolled to top and dragging down
    if (dy > 0 && el.scrollTop <= 0) {
      el.style.transform = `translateY(${dy}px)`;
      el.style.transition = "none";
    }
  }, []);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    const el = sheetRef.current;
    if (!el || dragY.current === null) return;
    const dy = e.changedTouches[0].clientY - dragY.current;
    el.style.transform = "";
    el.style.transition = "";
    if (dy > 80) onClose();
    dragY.current = null;
  }, [onClose]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Reset search when sheet closes
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // Body scroll lock while open
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const content = typeof children === "function" ? children(query) : children;
  const portalHost = document.querySelector(".tv-root") ?? document.body;

  return createPortal(
    <div
      className="ej-sheet-back"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title ?? "Options"}
    >
      <div
        ref={sheetRef}
        className="ej-sheet"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        role="presentation"
      >
        <div className="ej-sheet-handle" aria-hidden="true" />
        {title && <div className="ej-sheet-title">{title}</div>}
        {searchable && (
          <div style={{ padding: "0 12px 8px" }}>
            <input
              className="ej-sheet-search"
              type="search"
              inputMode="search"
              placeholder={searchPlaceholder}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
              style={{ fontSize: 16 }}
            />
          </div>
        )}
        <div className="ej-sheet-scroll">
          {content}
        </div>
      </div>
    </div>,
    portalHost,
  );
}

/** Returns true if the current environment is a touch/mobile context. */
export function isMobileContext(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(pointer: coarse), (max-width: 820px)").matches;
}

/** Reactive hook matching `isMobileContext()` across resizes and pointer capabilities. */
export function useMobileUI(): boolean {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(pointer: coarse), (max-width: 820px)");
    setMobile(mq.matches);
    const onChange = () => setMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return mobile;
}

/** Matches the compact mobile dock media query in ej-responsive.css. */
export function useCompactDock(): boolean {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767.98px), (pointer: coarse) and (max-width: 820px)");
    setCompact(mq.matches);
    const onChange = () => setCompact(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return compact;
}
