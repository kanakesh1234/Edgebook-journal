"use client";

import { useEffect, useState } from "react";
import { resolveImageUrl } from "./images";
import { dataStore } from "./services/storage";

/** Resolve object URLs for stored image ids (memoized module-level). */
export function useImageUrls(ids: string[]): Record<string, string | null> {
  const key = ids.join("|");
  const [urls, setUrls] = useState<Record<string, string | null>>({});

  useEffect(() => {
    let alive = true;
    const list = key ? key.split("|") : [];
    if (list.length === 0) {
      setUrls({});
      return;
    }
    Promise.all(
      list.map(async (id) => [id, await resolveImageUrl(id, (i) => dataStore.getImage(i))] as const),
    ).then((pairs) => {
      if (!alive) return;
      setUrls(Object.fromEntries(pairs));
    });
    return () => {
      alive = false;
    };
  }, [key]);

  return urls;
}

export function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

/** Animated count-up used by stat cards. */
export function useCountUp(target: number, duration = 900, enabled = true): number {
  const [value, setValue] = useState(enabled ? 0 : target);

  useEffect(() => {
    if (!enabled) {
      setValue(target);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const initial = value;
    const delta = target - initial;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 4);
      setValue(initial + delta * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return value;
}
