export const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Smoothstep — gentle in, gentle out. */
export const smooth = (t: number) => {
  const x = clamp(t);
  return x * x * (3 - 2 * x);
};
export const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia(REDUCED_QUERY).matches;

/**
 * Compute scroll progress [0..1] for an element between two viewport anchor ratios.
 * - `startRatio = 0` means when `el.top` reaches the top of the viewport (`0 * innerHeight`).
 * - `endRatio = 1` for a tall pinned section (`endByBottomOfElement = true`) means when `el.bottom` reaches the bottom of the viewport.
 */
export function computeScrollProgress(
  el: Element,
  opts: { startRatio?: number; endRatio?: number; pinned?: boolean } = {},
): number {
  if (typeof window === "undefined") return 0;
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight || 1;
  if (opts.pinned) {
    const scrollable = Math.max(1, rect.height - vh);
    return clamp(-rect.top / scrollable, 0, 1);
  }
  const startY = vh * (opts.startRatio ?? 0.85);
  const endY = vh * (opts.endRatio ?? 0.35);
  const span = Math.max(1, startY - endY + rect.height * 0.35);
  return clamp((startY - rect.top) / span, 0, 1);
}

/**
 * Subscribe a callback to 60fps scroll & resize updates for a target element.
 * Returns a cleanup function.
 */
export function bindScrollProgress(
  el: Element | null,
  onProgress: (progress: number) => void,
  opts: { startRatio?: number; endRatio?: number; pinned?: boolean } = {},
): () => void {
  if (!el || typeof window === "undefined") return () => undefined;
  let rafId = 0;
  let ticking = false;

  const update = () => {
    ticking = false;
    onProgress(computeScrollProgress(el, opts));
  };

  const requestUpdate = () => {
    if (!ticking) {
      ticking = true;
      rafId = window.requestAnimationFrame(update);
    }
  };

  update();
  window.addEventListener("scroll", requestUpdate, { passive: true });
  window.addEventListener("resize", requestUpdate, { passive: true });

  return () => {
    if (rafId) window.cancelAnimationFrame(rafId);
    window.removeEventListener("scroll", requestUpdate);
    window.removeEventListener("resize", requestUpdate);
  };
}
