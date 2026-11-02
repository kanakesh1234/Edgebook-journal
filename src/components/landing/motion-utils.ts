export const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Smoothstep — gentle in, gentle out. */
export const smooth = (t: number) => {
  const x = clamp(t);
  return x * x * (3 - 2 * x);
};

/** Quintic smootherstep for camera-like easing. */
export const smoother = (t: number) => {
  const x = clamp(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

/** Maps `value` within `[inMin, inMax]` to `[0..1]` clamped. */
export const rangeProgress = (value: number, inMin: number, inMax: number) =>
  clamp((value - inMin) / Math.max(0.0001, inMax - inMin), 0, 1);

export const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";
export const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia(REDUCED_QUERY).matches;

export interface LandingScrollState {
  /** Normalized overall page scroll progress [0..1] */
  pageProgress: number;
  /** True when the visitor is immersed inside the full-screen Theatre sequence (#film) */
  theatreMode: boolean;
  /** Current major scene number [1..6] */
  activeScene: number;
  /** Current scene label for the diegetic HUD */
  sceneTitle: string;
  /** Player's interactive Composure / Discipline score [0..100] from choices & scroll */
  composureScore: number;
}

export const SCENE_META: { id: number; anchor: string; code: string; title: string }[] = [
  { id: 1, anchor: "#top", code: "CH.01", title: "THE ENTRANCE" },
  { id: 2, anchor: "#film", code: "CH.02", title: "THE INNER FILM" },
  { id: 3, anchor: "#how", code: "CH.03", title: "THE DECISION" },
  { id: 4, anchor: "#gap", code: "CH.04", title: "THE REFLECTION" },
  { id: 5, anchor: "#drive", code: "CH.05", title: "THE EXPERIENCE" },
  { id: 6, anchor: "#finale", code: "CH.06", title: "THE INVITATION" },
];

export const landingScrollState: LandingScrollState = {
  pageProgress: 0,
  theatreMode: false,
  activeScene: 1,
  sceneTitle: "THE ENTRANCE",
  composureScore: 88,
};

type ScrollStateListener = (state: LandingScrollState) => void;
const listeners = new Set<ScrollStateListener>();

export function subscribeLandingScroll(fn: ScrollStateListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function notifyLandingScroll(): void {
  listeners.forEach((fn) => fn(landingScrollState));
}

export function updateComposureScore(nextScore: number): void {
  landingScrollState.composureScore = Math.round(clamp(nextScore, 0, 100));
  notifyLandingScroll();
}

/**
 * Compute scroll progress [0..1] for an element between two viewport anchor ratios.
 * - When `opts.pinned = true`, returns `0` when `el.top == 0` and `1` when `el.bottom == window.innerHeight`.
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
 * Works identically when scrolling forward or backward.
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

/**
 * Smoothly scrolls the window to a specific normalized progress [0..1] inside a pinned container.
 */
export function scrollToPinnedProgress(
  container: HTMLElement | null,
  targetProgress: number,
  smoothBehavior = true,
): void {
  if (!container || typeof window === "undefined") return;
  const rect = container.getBoundingClientRect();
  const scrollable = Math.max(0, container.offsetHeight - window.innerHeight);
  if (scrollable <= 0) return;
  const destY = window.scrollY + rect.top + clamp(targetProgress, 0, 1) * scrollable;
  window.scrollTo({
    top: destY,
    behavior: smoothBehavior && !prefersReducedMotion() ? "smooth" : ("instant" as ScrollBehavior),
  });
}
