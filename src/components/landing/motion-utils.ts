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
