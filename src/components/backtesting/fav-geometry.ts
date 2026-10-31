/* Pure geometry for the floating favorites bar (no DOM) — unit-tested. */

export interface Box { x: number; y: number; w: number; h: number }
export interface Insets { l: number; t: number; r: number; b: number }
export interface Travel { minX: number; minY: number; maxX: number; maxY: number }

export const FAV_MARGIN = 8;
export const DEFAULT_FRAC = { x: 0.5, y: 1 } as const;

/** Allowed range for the bar's top-left corner (8px margin inside the plot area, clear of price/time scales). */
export function travel(stageW: number, stageH: number, barW: number, barH: number, ins: Insets): Travel {
  const minX = ins.l + FAV_MARGIN, minY = ins.t + FAV_MARGIN;
  return {
    minX, minY,
    maxX: Math.max(minX, stageW - ins.r - FAV_MARGIN - barW),
    maxY: Math.max(minY, stageH - ins.b - FAV_MARGIN - barH),
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export const clampXY = (x: number, y: number, t: Travel) => ({ x: clamp(x, t.minX, t.maxX), y: clamp(y, t.minY, t.maxY) });

export function fracToXY(f: { x: number; y: number }, t: Travel) {
  return { x: t.minX + clamp(f.x, 0, 1) * (t.maxX - t.minX), y: t.minY + clamp(f.y, 0, 1) * (t.maxY - t.minY) };
}
export function xyToFrac(x: number, y: number, t: Travel) {
  return {
    x: t.maxX > t.minX ? clamp((x - t.minX) / (t.maxX - t.minX), 0, 1) : 0,
    y: t.maxY > t.minY ? clamp((y - t.minY) / (t.maxY - t.minY), 0, 1) : 0,
  };
}

/** Snap to the 4 edges / corners. sx / sy: -1 = min edge, 1 = max edge, 0 = free. */
export function snapXY(x: number, y: number, t: Travel, threshold = 14) {
  const c = clampXY(x, y, t);
  let sx: -1 | 0 | 1 = 0, sy: -1 | 0 | 1 = 0;
  if (c.x - t.minX < threshold) { c.x = t.minX; sx = -1; } else if (t.maxX - c.x < threshold) { c.x = t.maxX; sx = 1; }
  if (c.y - t.minY < threshold) { c.y = t.minY; sy = -1; } else if (t.maxY - c.y < threshold) { c.y = t.maxY; sy = 1; }
  return { x: c.x, y: c.y, sx, sy };
}

export const overlaps = (a: Box, b: Box, gap = 0) =>
  a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;

/** Nudge the bar out from under obstacles (legend, replay bar, …) to the nearest free spot. */
export function avoidObstacles(box: Box, obstacles: Box[], t: Travel, gap = FAV_MARGIN): { x: number; y: number } {
  const hit = (b: Box) => obstacles.some((o) => overlaps(b, o, 0));
  if (!hit(box)) return { x: box.x, y: box.y };
  let best: { x: number; y: number } | null = null, bestD = Infinity;
  for (const o of obstacles) {
    const cands = [
      { x: o.x - box.w - gap, y: box.y }, { x: o.x + o.w + gap, y: box.y },
      { x: box.x, y: o.y - box.h - gap }, { x: box.x, y: o.y + o.h + gap },
    ];
    for (const c of cands) {
      const p = clampXY(c.x, c.y, t);
      if (hit({ ...box, x: p.x, y: p.y })) continue;
      const d = (p.x - box.x) ** 2 + (p.y - box.y) ** 2;
      if (d < bestD) { bestD = d; best = p; }
    }
  }
  return best ?? { x: box.x, y: box.y };
}
