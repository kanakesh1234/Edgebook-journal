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

/** Shared keyboard path for menus: ↑↓ Home End move, Esc closes (and never leaks to the workspace shortcuts). */
export function onMenuKeyDown(e: { key: string; preventDefault(): void; stopPropagation(): void }, root: HTMLElement | null, close: () => void) {
  if (!root) return;
  const k = e.key;
  if (k === "Escape") { e.preventDefault(); e.stopPropagation(); close(); return; }
  if (k !== "ArrowDown" && k !== "ArrowUp" && k !== "Home" && k !== "End") return;
  const items = Array.from(root.querySelectorAll<HTMLElement>('[role^="menuitem"]:not(:disabled)'));
  if (!items.length) return;
  e.preventDefault(); e.stopPropagation();
  const i = items.indexOf(document.activeElement as HTMLElement);
  const n = k === "Home" ? 0 : k === "End" ? items.length - 1 : k === "ArrowDown" ? i + 1 : i < 0 ? items.length - 1 : i - 1;
  items[(n + items.length) % items.length].focus();
}

/** Focus the first (or checked) menu item when a menu opens. */
export function focusFirstItem(root: HTMLElement | null) {
  if (!root) return;
  (root.querySelector<HTMLElement>('[aria-checked="true"], .is-active, .is-on[role^="menuitem"]') ?? root.querySelector<HTMLElement>('[role^="menuitem"]:not(:disabled)'))?.focus({ preventScroll: true });
}
