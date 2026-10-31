"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Smooth number transition for balance / P&L (display only, ≤ 250 ms).
 *
 * The span has NO React children: text is written straight to the DOM from a rAF loop, so a
 * replay tick never re-renders anything beyond this leaf, and the final frame is always the exact
 * formatted `value` (animation can never leave a wrong number on screen).
 */
export default function AnimatedNumber({
  value, format, className, ms = 240, from, tau,
}: { value: number; format: (n: number) => string; className?: string; ms?: number; /** trailing time-constant (ms): the number glides after its target like a live ticker */ tau?: number; /** animate from this value on first paint */ from?: number }) {
  const el = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(from ?? null);
  const raf = useRef(0);
  const fmt = useRef(format);
  fmt.current = format;

  useLayoutEffect(() => {
    const node = el.current;
    if (!node) return;
    cancelAnimationFrame(raf.current);
    const from = shown.current;
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (from === null || reduce || from === value || !Number.isFinite(value) || !Number.isFinite(from) || document.hidden) {
      shown.current = value;
      node.textContent = fmt.current(value);
      return;
    }
    if (tau) {
      let last = performance.now();
      const chase = (now: number) => {
        const dt = Math.min(100, now - last); last = now;
        let v = shown.current ?? value;
        v += (value - v) * (1 - Math.exp(-dt / tau));
        const done = Math.abs(value - v) < 0.005;
        if (done) v = value;
        shown.current = v;
        node.textContent = fmt.current(v);
        if (!done) raf.current = requestAnimationFrame(chase);
      };
      raf.current = requestAnimationFrame(chase);
      return () => cancelAnimationFrame(raf.current);
    }
    const t0 = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const e = 1 - Math.pow(1 - k, 3); // ease-out cubic
      if (k >= 1) {
        shown.current = value;
        node.textContent = fmt.current(value); // exact final value
        return;
      }
      const v = from + (value - from) * e;
      shown.current = v;
      node.textContent = fmt.current(v);
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [value, ms, tau]);

  return <span ref={el} className={className} />;
}
