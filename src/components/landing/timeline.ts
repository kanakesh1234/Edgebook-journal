/**
 * Tiny, dependency-free timeline math. Every visual state on the landing page is a pure
 * function of one number (the playhead p, 0..1), which is what makes scrolling fully
 * reversible and deterministic.
 */

export const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Hermite ease: 0 → 1 with zero velocity at both ends. */
export const smoothstep = (t: number) => {
  const x = clamp(t);
  return x * x * (3 - 2 * x);
};

export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp(t), 3);

/** Slight overshoot, used for "pop-up" cards so they land with a little spring. */
export const easeOutBack = (t: number, s = 1.35) => {
  const x = clamp(t) - 1;
  return 1 + x * x * ((s + 1) * x + s);
};

/** Normalised progress of p inside [a, b], clamped to 0..1. */
export const rangeProgress = (p: number, a: number, b: number) => clamp((p - a) / (b - a));

/**
 * Envelope that eases in over [inA, inB], holds, then eases out over [outA, outB].
 * Returns 0..1. This is the shape of every narrative beat.
 */
export const segmentInOut = (p: number, inA: number, inB: number, outA: number, outB: number) =>
  smoothstep(rangeProgress(p, inA, inB)) * (1 - smoothstep(rangeProgress(p, outA, outB)));

/** Signed travel for an element that enters from one side and leaves on the other: +1 → 0 → -1. */
export const segmentTravel = (p: number, inA: number, inB: number, outA: number, outB: number) =>
  (1 - smoothstep(rangeProgress(p, inA, inB))) - smoothstep(rangeProgress(p, outA, outB));
