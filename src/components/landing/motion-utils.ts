import { QUEST_SPECS, awardGameAction, setActiveQuestIndex } from "./game-state";

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
  pageProgress: number;
  theatreMode: boolean;
  activeScene: number;
  sceneTitle: string;
  composureScore: number;
}

export const SCENE_META: { id: number; anchor: string; code: string; title: string }[] =
  QUEST_SPECS.map((q, idx) => ({
    id: idx + 1,
    anchor: q.anchor,
    code: q.code,
    title: q.title.toUpperCase(),
  }));

export const landingScrollState: LandingScrollState = {
  pageProgress: 0,
  theatreMode: false,
  activeScene: 1,
  sceneTitle: "THE PRE-BELL RITUAL",
  composureScore: 84,
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
  const clamped = Math.round(clamp(nextScore, 0, 100));
  const diff = clamped - landingScrollState.composureScore;
  landingScrollState.composureScore = clamped;
  if (diff !== 0) {
    awardGameAction({
      composureDelta: diff,
      xpDelta: diff > 0 ? 15 : 0,
      title: diff > 0 ? "Composure Increased" : "Composure Tested",
      subtitle: `Operator composure now at ${clamped}%`,
      tone: diff > 0 ? "profit" : "loss",
    });
  }
  notifyLandingScroll();
}

export function syncQuestFromScene(sceneNumber: number): void {
  setActiveQuestIndex(Math.max(0, Math.min(QUEST_SPECS.length - 1, sceneNumber - 1)));
}

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
