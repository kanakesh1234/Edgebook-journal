"use client";

import { useEffect, type RefObject } from "react";

/** Run `cb` when a pointer goes down outside `ref` (or Escape is pressed). */
export function useOutside(ref: RefObject<HTMLElement | null>, active: boolean, cb: () => void) {
  useEffect(() => {
    if (!active) return;
    const down = (e: PointerEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) cb(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") cb(); };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("keydown", key);
    };
  }, [ref, active, cb]);
}

/** "UTC-4" style label for America/New_York at a given instant. */
export function nyOffsetLabel(epochSec: number): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" }).formatToParts(new Date(epochSec * 1000));
    const v = parts.find((p) => p.type === "timeZoneName")?.value ?? "GMT-5";
    return v.replace("GMT", "UTC");
  } catch {
    return "UTC-5";
  }
}
