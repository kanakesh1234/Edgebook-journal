/* ------------------------------------------------------------------ */
/*  Pure screen-space geometry for the drawing engine.                 */
/*  No DOM, no chart — unit-testable in plain node.                    */
/* ------------------------------------------------------------------ */

export interface Pt { x: number; y: number }
export interface Rect { x: number; y: number; w: number; h: number }

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Distance from p to the finite segment a–b. */
export function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/**
 * Clip the parametric line a + t·(b−a) to a rectangle, restricted to t ∈ [tMin, tMax]
 * (use −Infinity/Infinity for open ends). Liang–Barsky. Returns null when nothing is visible.
 */
export function clipLine(a: Pt, b: Pt, r: Rect, tMin: number, tMax: number): [Pt, Pt] | null {
  const dx = b.x - a.x, dy = b.y - a.y;
  let t0 = tMin, t1 = tMax;
  const edge = (p: number, q: number): boolean => {
    if (p === 0) return q >= 0;
    const t = q / p;
    if (p < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
    return true;
  };
  if (
    edge(-dx, a.x - r.x) && edge(dx, r.x + r.w - a.x) &&
    edge(-dy, a.y - r.y) && edge(dy, r.y + r.h - a.y)
  ) {
    if (!Number.isFinite(t0) || !Number.isFinite(t1)) return null;
    return [{ x: a.x + t0 * dx, y: a.y + t0 * dy }, { x: a.x + t1 * dx, y: a.y + t1 * dy }];
  }
  return null;
}

export type LineKind = "segment" | "ray" | "extended";

/** The visible piece of a segment / ray / extended line inside `bounds`. */
export function visibleLine(a: Pt, b: Pt, kind: LineKind, bounds: Rect): [Pt, Pt] | null {
  if (a.x === b.x && a.y === b.y) return null;
  if (kind === "segment") return [a, b];
  return clipLine(a, b, bounds, kind === "ray" ? 0 : -Infinity, Infinity);
}

/** Distance from p to a segment / ray / extended line. */
export function distToLine(p: Pt, a: Pt, b: Pt, kind: LineKind): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return dist(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  if (kind === "segment") t = Math.max(0, Math.min(1, t));
  else if (kind === "ray") t = Math.max(0, t);
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function normRect(a: Pt, b: Pt): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

export function inRect(p: Pt, r: Rect, pad = 0): boolean {
  return p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad;
}

/** Distance from p to the outline of a rect (0 when on the border). */
export function distToRectBorder(p: Pt, r: Rect): number {
  const tl = { x: r.x, y: r.y }, tr = { x: r.x + r.w, y: r.y };
  const br = { x: r.x + r.w, y: r.y + r.h }, bl = { x: r.x, y: r.y + r.h };
  return Math.min(distToSegment(p, tl, tr), distToSegment(p, tr, br), distToSegment(p, br, bl), distToSegment(p, bl, tl));
}

/** Is p inside the ellipse inscribed in r? Returns the normalised radius (1 = on the outline). */
export function ellipseRadius(p: Pt, r: Rect): number {
  const rx = r.w / 2, ry = r.h / 2;
  if (rx === 0 || ry === 0) return Infinity;
  const cx = r.x + rx, cy = r.y + ry;
  return Math.hypot((p.x - cx) / rx, (p.y - cy) / ry);
}

export function pointInPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Quantise to a tick grid. */
export function snapTick(price: number, tick: number): number {
  if (!tick || tick <= 0) return price;
  return Math.round(price / tick) * tick;
}

/** Constrain p to be horizontal/vertical relative to origin (Shift while drawing). */
export function constrainAxis(origin: Pt, p: Pt): Pt {
  return Math.abs(p.x - origin.x) >= Math.abs(p.y - origin.y) ? { x: p.x, y: origin.y } : { x: origin.x, y: p.y };
}
