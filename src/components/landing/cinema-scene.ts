import {
  clamp,
  easeOutBack,
  easeOutCubic,
  rangeProgress,
  segmentInOut,
  segmentTravel,
  smoothstep,
} from "./timeline";
import { TIMELINE as T } from "./scene-config";

export type SceneVars = Record<string, number>;

const rp = (p: number, r: readonly [number, number]) => rangeProgress(p, r[0], r[1]);

/**
 * Pure function: playhead → every unitless CSS custom property the stage uses.
 * CSS owns the final transforms (landing.css); this only produces normalised numbers.
 * No state, no DOM: calling it with the same p always returns the same frame.
 */
export function computeScene(p: number): SceneVars {
  const intro = smoothstep(rp(p, T.introExit));
  const open = smoothstep(rp(p, T.open));
  const exit = smoothstep(rp(p, T.exit));

  // Narrative envelopes: 0..1 visibility and a signed -1..1 offset (enter from +, leave to -).
  const a = segmentInOut(p, ...T.panelA.in, ...T.panelA.out);
  const aY = segmentTravel(p, ...T.panelA.in, ...T.panelA.out);
  const b = segmentInOut(p, ...T.panelB.in, ...T.panelB.out);
  const bY = segmentTravel(p, ...T.panelB.in, ...T.panelB.out);
  const q = segmentInOut(p, ...T.quote.in, ...T.quote.out);
  const qY = segmentTravel(p, ...T.quote.in, ...T.quote.out);

  // Pop-ups spring in (overshoot) and leave with their parent panel.
  const popA1 = easeOutBack(rp(p, T.popsA[0]!)) * a;
  const popA2 = easeOutBack(rp(p, T.popsA[1]!)) * a;
  const popB1 = easeOutBack(rp(p, T.popsB[0]!)) * b;
  const popB2 = easeOutBack(rp(p, T.popsB[1]!)) * b;

  // World softening is focus support, never permanent fog.
  const cat = easeOutCubic(rp(p, T.catalog));
  // Beat 6 softening, then again (a touch lighter) behind the catalog so the cards read as frosted glass.
  const focus = Math.max(segmentInOut(p, ...T.focus.in, ...T.focus.out), cat * 0.8);
  const ctrl = smoothstep(rp(p, T.controls));

  // Light bloom from behind the doors: swells as they open, dissolves as they pass.
  const glow = open * (1 - 0.85 * exit);

  return {
    p,
    cam: smoothstep(rp(p, T.camera)) + 0.3 * rp(p, [T.camera[1], 1]),
    push: smoothstep(rp(p, T.push)),
    open,
    exit,
    intro,
    a,
    aY,
    b,
    bY,
    q,
    qY,
    popA1,
    popA2,
    popB1,
    popB2,
    focus,
    tint: clamp(focus * 0.45 + cat * 0.05),
    glow,
    cat,
    ctrl,
    rail: rp(p, T.railScrub),
  };
}

/** Name of the beat the playhead is in; exposed as data-beat for QA and debugging. */
export function beatAt(p: number): string {
  if (p < T.introExit[0]) return "hero";
  if (p < T.open[0]) return "intro-exit";
  if (p < T.panelA.in[1]) return "gate-opens";
  if (p < T.panelA.out[0]) return "narrative-a";
  if (p < T.quote.in[0]) return "gate-exits";
  if (p < T.quote.out[1]) return "panorama";
  if (p < T.panelB.out[0]) return "narrative-b";
  if (p < T.catalog[0]) return "refocus";
  if (p < T.controls[0]) return "catalog-enter";
  return "final";
}
