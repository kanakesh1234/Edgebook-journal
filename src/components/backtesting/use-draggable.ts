"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Makes a floating bar movable anywhere inside its positioned parent (the chart stage),
 * like TradingView's replay / drawing bars. Drag the grip; double-click the grip to reset.
 * Position is an offset from the bar's CSS default (--dx / --dy), saved per device and
 * re-clamped on resize so the bar can never end up off-screen. Works with mouse, pen and touch.
 */
export function useDraggable(storageKey: string) {
  const ref = useRef<HTMLDivElement>(null);
  const pos = useRef({ dx: 0, dy: 0 });
  const drag = useRef<{ sx: number; sy: number; dx: number; dy: number; minX: number; maxX: number; minY: number; maxY: number } | null>(null);
  const key = `edgebook.tv.pos.${storageKey}`;

  const apply = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--dx", `${pos.current.dx}px`);
    el.style.setProperty("--dy", `${pos.current.dy}px`);
  }, []);

  /** Allowed offset range so the whole bar stays inside the parent. */
  const bounds = useCallback(() => {
    const el = ref.current, parent = el?.offsetParent as HTMLElement | null;
    if (!el || !parent) return null;
    const r = el.getBoundingClientRect(), p = parent.getBoundingClientRect();
    const baseL = r.left - pos.current.dx, baseT = r.top - pos.current.dy;
    return { minX: p.left - baseL, maxX: p.right - baseL - r.width, minY: p.top - baseT, maxY: p.bottom - baseT - r.height };
  }, []);

  const clamp = useCallback(() => {
    const b = bounds();
    if (!b) return;
    pos.current = {
      dx: Math.min(Math.max(pos.current.dx, Math.min(b.minX, 0)), Math.max(b.maxX, 0)),
      dy: Math.min(Math.max(pos.current.dy, Math.min(b.minY, 0)), Math.max(b.maxY, 0)),
    };
    apply();
  }, [apply, bounds]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw) { const v = JSON.parse(raw) as { dx: number; dy: number }; if (Number.isFinite(v.dx) && Number.isFinite(v.dy)) pos.current = v; }
    } catch { /* ignore */ }
    apply(); clamp();
    const parent = ref.current?.offsetParent as HTMLElement | null;
    const ro = parent && typeof ResizeObserver !== "undefined" ? new ResizeObserver(clamp) : null;
    if (parent) ro?.observe(parent);
    window.addEventListener("resize", clamp);
    return () => { ro?.disconnect(); window.removeEventListener("resize", clamp); };
  }, [key, apply, clamp]);

  const save = () => { try { localStorage.setItem(key, JSON.stringify(pos.current)); } catch { /* ignore */ } };

  const gripProps = {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const b = bounds();
      if (!b) return;
      e.preventDefault(); e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      drag.current = { sx: e.clientX, sy: e.clientY, dx: pos.current.dx, dy: pos.current.dy, ...b };
      ref.current?.classList.add("is-dragging");
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const d = drag.current;
      if (!d) return;
      pos.current = {
        dx: Math.min(Math.max(d.dx + e.clientX - d.sx, d.minX), d.maxX),
        dy: Math.min(Math.max(d.dy + e.clientY - d.sy, d.minY), d.maxY),
      };
      apply();
    },
    onPointerUp: () => { if (drag.current) { drag.current = null; ref.current?.classList.remove("is-dragging"); save(); } },
    onPointerCancel: () => { drag.current = null; ref.current?.classList.remove("is-dragging"); save(); },
    onDoubleClick: () => { pos.current = { dx: 0, dy: 0 }; apply(); save(); },
    "data-tip": "Drag to move · double-click to reset",
    role: "separator" as const,
    "aria-label": "Move toolbar",
  };

  return { ref, gripProps };
}
