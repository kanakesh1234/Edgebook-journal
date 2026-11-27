"use client";

import { useSyncExternalStore } from "react";

export type DeviceTier = "mobile" | "tablet" | "desktop";

const MOBILE_QUERY = "(max-width: 767.98px)";
const DESKTOP_QUERY = "(min-width: 1280px)";

function getSnapshot(): DeviceTier {
  if (typeof window === "undefined") return "desktop";
  if (window.matchMedia(MOBILE_QUERY).matches) return "mobile";
  if (window.matchMedia(DESKTOP_QUERY).matches) return "desktop";
  return "tablet";
}

function getServerSnapshot(): DeviceTier {
  return "desktop";
}

function subscribe(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  const mMob = window.matchMedia(MOBILE_QUERY);
  const mDesk = window.matchMedia(DESKTOP_QUERY);
  mMob.addEventListener("change", cb);
  mDesk.addEventListener("change", cb);
  return () => {
    mMob.removeEventListener("change", cb);
    mDesk.removeEventListener("change", cb);
  };
}

/**
 * Matches the app shell's Tailwind breakpoint tiers:
 *   mobile  < 768px   (< md)
 *   tablet  768–1279  (md .. xl-1)
 *   desktop ≥ 1280px  (xl+)
 */
export function useDeviceTier(): DeviceTier {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
