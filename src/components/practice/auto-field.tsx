"use client";

import { useLayoutEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * A text area that sizes itself to what is written: it starts at `minRows`, grows line by line,
 * and only scrolls once it reaches `maxVh` of the screen. It re-measures when the width changes
 * (rotating a phone, resizing the window), so wrapped lines never get clipped.
 * Same surface as the Plan Trade fields: 16px type (no iOS zoom), 2xl corners, a soft gold focus ring.
 */
export function AutoField({ className, minRows = 2, maxVh = 40, value, count, ...props }: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "rows"> & { minRows?: number; maxVh?: number; /** Shows "n/max" in the corner once near the limit. */ count?: { n: number; max: number } }) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const fit = () => {
    const el = ref.current;
    if (!el) return;
    const max = Math.round(window.innerHeight * (maxVh / 100));
    el.style.height = "auto";
    const next = Math.min(el.scrollHeight, Math.max(max, 96));
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > next ? "auto" : "hidden";
  };

  useLayoutEffect(fit, [value, maxVh]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let width = el.clientWidth;
    const ro = new ResizeObserver(() => { if (el.clientWidth !== width) { width = el.clientWidth; fit(); } });
    ro.observe(el);
    return () => ro.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const near = count && count.n > count.max * 0.85;
  return (
    <div className="relative">
      <textarea
        ref={ref}
        rows={minRows}
        value={value}
        className={cn(
          "block w-full resize-none rounded-2xl border border-line bg-raised px-4 py-3.5 text-[16px] leading-[1.5] tracking-[-0.011em] text-ink placeholder:text-faint sm:text-[17px] lg:px-5",
          "transition-[border-color,box-shadow] duration-200 hover:border-line-strong focus:border-gold/60 focus:outline-none focus:ring-4 focus:ring-gold/10 aria-[invalid=true]:border-loss/55",
          near && "pb-8",
          className,
        )}
        {...props}
      />
      {near && <span aria-hidden className="pointer-events-none absolute bottom-2.5 right-4 text-[11.5px] tabular-nums text-faint">{count.n}/{count.max}</span>}
    </div>
  );
}
