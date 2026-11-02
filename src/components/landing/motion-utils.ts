export const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Smoothstep — gentle in, gentle out. */
export const smooth = (t: number) => {
  const x = clamp(t);
  return x * x * (3 - 2 * x);
};

/** Smootherstep (Ken Perlin's quintic curve) for camera splines. */
export const smoother = (t: number) => {
  const x = clamp(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

export const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia(REDUCED_QUERY).matches;

export function isLowPowerDevice(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & {
    deviceMemory?: number;
    connection?: { saveData?: boolean };
  };
  if (nav.connection?.saveData) return true;
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory <= 2) return true;
  if (typeof nav.hardwareConcurrency === "number" && nav.hardwareConcurrency <= 2) return true;
  return false;
}

export type TheatreActId =
  | "hero"
  | "film"
  | "ritual"
  | "gap"
  | "minato"
  | "drive"
  | "toolkit"
  | "finale";

export type QualityTier = "high" | "medium" | "low";

export interface TheatreState {
  /** Raw normalized scroll progress across the whole landing page [0..1] */
  rawScroll: number;
  /** Damped scroll progress driving the 3D Catmull-Rom spline [0..1] */
  splineProgress: number;
  /** Normalized scroll velocity [-1..1] */
  velocity: number;
  /** Active camera stop ("act") */
  activeAct: TheatreActId;
  /** Act-local progress values [0..1] */
  heroProgress: number;
  filmProgress: number;
  ritualProgress: number;
  /** Active station in Daily Ritual [0..4] */
  ritualStep: number;
  /** Plan vs. execution split factor [0..1]: 1 = wide split, 0 = converged */
  gapSplit: number;
  minatoProgress: number;
  driveProgress: number;
  toolkitProgress: number;
  finaleProgress: number;
  /** How much the calm cream surface fades out the dark 3D canvas [0..1] */
  creamMix: number;
  /** Desktop cursor parallax [-1..1] */
  pointerX: number;
  pointerY: number;
  targetPointerX: number;
  targetPointerY: number;
  /** Runtime adaptive quality tier */
  quality: QualityTier;
  /** Current measured FPS */
  fps: number;
  /** Current draw call count */
  drawCalls: number;
  /** Current DPR applied to the WebGL canvas */
  activeDpr: number;
  /** Whether the user manually selected a ritual step */
  manualRitualStep: number | null;
}

/**
 * Shared singleton mutable state read by the 60fps WebGL loop and updated by
 * GSAP ScrollTrigger / Lenis without causing React re-renders on every frame.
 */
export const theatreState: TheatreState = {
  rawScroll: 0,
  splineProgress: 0,
  velocity: 0,
  activeAct: "hero",
  heroProgress: 0,
  filmProgress: 0,
  ritualProgress: 0,
  ritualStep: 0,
  gapSplit: 1,
  minatoProgress: 0,
  driveProgress: 0,
  toolkitProgress: 0,
  finaleProgress: 0,
  creamMix: 0,
  pointerX: 0,
  pointerY: 0,
  targetPointerX: 0,
  targetPointerY: 0,
  quality: "high",
  fps: 60,
  drawCalls: 0,
  activeDpr: 1.5,
  manualRitualStep: null,
};

type Listener = (state: TheatreState) => void;
const actListeners = new Set<Listener>();

export function subscribeTheatreUi(fn: Listener): () => void {
  actListeners.add(fn);
  return () => {
    actListeners.delete(fn);
  };
}

export function notifyTheatreUi(): void {
  actListeners.forEach((fn) => fn(theatreState));
}

/**
 * Compute scroll progress [0..1] for an element between two viewport anchor ratios.
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
  const endY = vh * (opts.endRatio ?? 0.25);
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
