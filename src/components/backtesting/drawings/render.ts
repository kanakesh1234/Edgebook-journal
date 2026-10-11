/* ------------------------------------------------------------------ */
/*  Drawing renderer + hit-testing.                                    */
/*  One place knows what each tool looks like and where it can be      */
/*  grabbed, so painting and picking can never disagree.               */
/* ------------------------------------------------------------------ */

import type { DrawingObject } from "@/lib/backtesting/types";
import { FIB_LEVELS, TOOLS } from "@/lib/backtesting/drawings/tools";
import {
  distToLine, distToSegment, ellipseRadius, inRect, normRect, pointInPolygon, visibleLine,
  type LineKind, type Pt, type Rect,
} from "@/lib/backtesting/drawings/geometry";
import type { Projector } from "./projector";

export interface RenderEnv {
  proj: Projector;
  w: number;
  h: number;
  tick: number;
  pointValue: number;
  /** Chart background is dark → label text/handle fills adapt. */
  dark: boolean;
}

export type Hit = { kind: "handle"; index: number } | { kind: "body" };

const FONT = "12px -apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif";
const FONT_BOLD = "600 12px -apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif";

/* ------------------------------ formatting ------------------------------ */

export function fmtPrice(p: number): string {
  return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtSigned(p: number): string {
  return (p > 0 ? "+" : p < 0 ? "−" : "") + fmtPrice(Math.abs(p));
}

export function fmtDuration(sec: number): string {
  const s = Math.abs(Math.round(sec));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d${h ? ` ${h}h` : ""}`;
  if (h > 0) return `${h}h${m ? ` ${m}m` : ""}`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

/* ------------------------------ resolve ------------------------------ */

/** Screen points for a drawing, or null if any anchor can't be placed right now. */
export function resolve(d: DrawingObject, env: RenderEnv): Pt[] | null {
  const out: Pt[] = [];
  for (const p of d.points) {
    const s = env.proj.toPt(p.time, p.price);
    if (!s) return null;
    out.push(s);
  }
  return out.length ? out : null;
}

const needs = (d: DrawingObject): number => {
  const def = TOOLS[d.type];
  return def.points === "free" ? 2 : def.points === 1 && (d.type === "long-position" || d.type === "short-position") ? 3 : def.points;
};

export function isComplete(d: DrawingObject): boolean {
  return d.points.length >= needs(d);
}

/** Corner handles of a box-style drawing (order: p0, (p1.x,p0.y), p1, (p0.x,p1.y)). */
const boxCorners = (S: Pt[]): Pt[] => [
  { x: S[0].x, y: S[0].y }, { x: S[1].x, y: S[0].y }, { x: S[1].x, y: S[1].y }, { x: S[0].x, y: S[1].y },
];

export function handlesOf(d: DrawingObject, S: Pt[]): Pt[] {
  if (d.type === "brush") return [];
  if (d.type === "text" || d.type === "emoji") return [];
  if (TOOLS[d.type].box && S.length >= 2) return boxCorners(S);
  if (d.type === "long-position" || d.type === "short-position") return S.length >= 3 ? [S[0], { x: S[1].x, y: S[1].y }, { x: S[1].x, y: S[2].y }] : S;
  if (d.type === "horizontal-line") return [S[0]];
  return S;
}

/** Horizontal price markers the price axis should show for this drawing. */
export function axisPrices(d: DrawingObject): number[] {
  if (d.type === "horizontal-line" || d.type === "horizontal-ray" || d.type === "cross-line") return [d.points[0].price];
  return [];
}

/* ------------------------------ painting helpers ------------------------------ */

function applyStroke(ctx: CanvasRenderingContext2D, d: DrawingObject, bump = 0) {
  ctx.strokeStyle = d.color;
  ctx.lineWidth = Math.max(1, d.lineWidth + bump);
  ctx.setLineDash(d.lineStyle === "dashed" ? [7, 5] : d.lineStyle === "dotted" ? [2, 4] : []);
  ctx.lineCap = d.lineStyle === "dotted" ? "round" : "butt";
  ctx.lineJoin = "round";
}

function line(ctx: CanvasRenderingContext2D, a: Pt, b: Pt) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}

function fillShape(ctx: CanvasRenderingContext2D, color: string, alpha: number, draw: () => void) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  draw();
  ctx.fill();
  ctx.restore();
}

function chip(
  ctx: CanvasRenderingContext2D, lines: string[], cx: number, cy: number,
  bg: string, fg = "#fff", align: "center" | "left" | "right" = "center",
) {
  ctx.save();
  ctx.font = FONT_BOLD;
  ctx.setLineDash([]);
  const pad = 6, lh = 15;
  const w = Math.max(...lines.map((t) => ctx.measureText(t).width)) + pad * 2;
  const h = lines.length * lh + 6;
  const x = align === "center" ? cx - w / 2 : align === "left" ? cx : cx - w;
  const y = cy - h / 2;
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 4);
  ctx.fill();
  ctx.fillStyle = fg;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  lines.forEach((t, i) => ctx.fillText(t, x + w / 2, y + 3 + lh / 2 + i * lh));
  ctx.restore();
}

function arrowHead(ctx: CanvasRenderingContext2D, from: Pt, to: Pt, size: number) {
  const ang = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.save();
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - size * Math.cos(ang - Math.PI / 7), to.y - size * Math.sin(ang - Math.PI / 7));
  ctx.lineTo(to.x - size * Math.cos(ang + Math.PI / 7), to.y - size * Math.sin(ang + Math.PI / 7));
  ctx.closePath();
  ctx.fillStyle = ctx.strokeStyle as string;
  ctx.fill();
  ctx.restore();
}

function dashedArrow(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, color: string) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.setLineDash([]);
  line(ctx, a, b);
  arrowHead(ctx, a, b, 7);
  ctx.restore();
}

/** Metrics shared by the range/measure/info tools. */
function metrics(d: DrawingObject, env: RenderEnv) {
  const p0 = d.points[0], p1 = d.points[1];
  const dp = p1.price - p0.price;
  const pct = p0.price ? (dp / p0.price) * 100 : 0;
  const ticks = env.tick ? Math.round(dp / env.tick) : 0;
  const bars = Math.round(env.proj.timeToLogical(p1.time) - env.proj.timeToLogical(p0.time));
  const dt = p1.time - p0.time;
  const priceTxt = `${fmtSigned(dp)} (${pct >= 0 ? "" : "−"}${Math.abs(pct).toFixed(2)}%) ${ticks}`;
  const timeTxt = `${bars} bars, ${fmtDuration(dt)}`;
  return { dp, pct, ticks, bars, dt, priceTxt, timeTxt };
}

/* ------------------------------ main painter ------------------------------ */

export function paintDrawing(
  ctx: CanvasRenderingContext2D, d: DrawingObject, env: RenderEnv,
  state: { selected: boolean; hovered: boolean },
) {
  const S = resolve(d, env);
  if (!S) return;
  const bounds: Rect = { x: 0, y: 0, w: env.w, h: env.h };
  const bump = state.hovered && !state.selected ? 1 : 0;
  const alpha = d.fillOpacity ?? TOOLS[d.type].fillOpacity ?? 0.15;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, env.w, env.h);
  ctx.clip();
  applyStroke(ctx, d, bump);

  switch (d.type) {
    case "trend-line":
    case "ray":
    case "extended-line":
    case "info-line": {
      const kind: LineKind = d.type === "ray" ? "ray" : d.type === "extended-line" ? "extended" : "segment";
      if (S.length < 2) break;
      const seg = visibleLine(S[0], S[1], kind, bounds);
      if (seg) line(ctx, seg[0], seg[1]);
      if (d.type === "info-line" && d.points.length >= 2) {
        const m = metrics(d, env);
        chip(ctx, [m.priceTxt, m.timeTxt], (S[0].x + S[1].x) / 2, (S[0].y + S[1].y) / 2 - 26, d.color);
      }
      break;
    }
    case "arrow": {
      if (S.length < 2) break;
      line(ctx, S[0], S[1]);
      arrowHead(ctx, S[0], S[1], 10 + d.lineWidth * 2);
      break;
    }
    case "horizontal-line":
      line(ctx, { x: 0, y: S[0].y }, { x: env.w, y: S[0].y });
      break;
    case "horizontal-ray":
      line(ctx, { x: S[0].x, y: S[0].y }, { x: env.w, y: S[0].y });
      break;
    case "vertical-line":
      line(ctx, { x: S[0].x, y: 0 }, { x: S[0].x, y: env.h });
      break;
    case "cross-line":
      line(ctx, { x: 0, y: S[0].y }, { x: env.w, y: S[0].y });
      line(ctx, { x: S[0].x, y: 0 }, { x: S[0].x, y: env.h });
      break;

    case "parallel-channel": {
      if (S.length < 2) break;
      const [a, b] = S;
      if (S.length === 2) { line(ctx, a, b); break; }
      const off = channelOffset(S);
      const a2 = { x: a.x, y: a.y + off }, b2 = { x: b.x, y: b.y + off };
      fillShape(ctx, d.color, alpha, () => {
        ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(b2.x, b2.y); ctx.lineTo(a2.x, a2.y); ctx.closePath();
      });
      line(ctx, a, b);
      line(ctx, a2, b2);
      ctx.setLineDash([5, 4]);
      ctx.globalAlpha = 0.7;
      line(ctx, { x: a.x, y: a.y + off / 2 }, { x: b.x, y: b.y + off / 2 });
      ctx.globalAlpha = 1;
      break;
    }

    case "fib-retracement": {
      if (S.length < 2) break;
      const [a, b] = S;
      const xl = Math.min(a.x, b.x), xr = Math.max(a.x, b.x);
      const p0 = d.points[0].price, p1 = d.points[1].price;
      const yAt = (L: number) => b.y - (b.y - a.y) * L;
      for (let i = 0; i < FIB_LEVELS.length - 1; i++) {
        const y1 = yAt(FIB_LEVELS[i].v), y2 = yAt(FIB_LEVELS[i + 1].v);
        fillShape(ctx, FIB_LEVELS[i + 1].color, alpha, () => ctx.rect(xl, Math.min(y1, y2), xr - xl, Math.abs(y2 - y1)));
      }
      ctx.font = FONT;
      ctx.textBaseline = "middle";
      for (const lv of FIB_LEVELS) {
        const y = yAt(lv.v);
        ctx.strokeStyle = lv.color;
        ctx.setLineDash([]);
        line(ctx, { x: xl, y }, { x: xr, y });
        const price = p1 - (p1 - p0) * lv.v;
        const txt = `${lv.v} (${fmtPrice(price)})`;
        ctx.fillStyle = lv.color;
        const tw = ctx.measureText(txt).width;
        if (xl - 6 - tw >= 2) { ctx.textAlign = "right"; ctx.fillText(txt, xl - 6, y); }
        else { ctx.textAlign = "left"; ctx.fillText(txt, xl + 6, y - 8); }
      }
      ctx.strokeStyle = "#787B86";
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      line(ctx, a, b);
      break;
    }

    case "long-position":
    case "short-position": {
      if (S.length < 3) break;
      const long = d.type === "long-position";
      const [e, tp, sl] = S;
      const xl = Math.min(e.x, tp.x), xr = Math.max(e.x, tp.x), cx = (xl + xr) / 2;
      const profit = "#089981", loss = "#F23645";
      fillShape(ctx, profit, 0.22, () => ctx.rect(xl, Math.min(e.y, tp.y), xr - xl, Math.abs(tp.y - e.y)));
      fillShape(ctx, loss, 0.22, () => ctx.rect(xl, Math.min(e.y, sl.y), xr - xl, Math.abs(sl.y - e.y)));
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = profit; line(ctx, { x: xl, y: tp.y }, { x: xr, y: tp.y });
      ctx.strokeStyle = loss; line(ctx, { x: xl, y: sl.y }, { x: xr, y: sl.y });
      ctx.strokeStyle = "#787B86"; line(ctx, { x: xl, y: e.y }, { x: xr, y: e.y });
      const entry = d.points[0].price, tpP = d.points[1].price, slP = d.points[2].price;
      const reward = Math.abs(tpP - entry), risk = Math.abs(entry - slP);
      const lbl = (name: string, delta: number) => {
        const pct = entry ? (delta / entry) * 100 : 0;
        const tk = env.tick ? Math.round(delta / env.tick) : 0;
        return `${name}: ${fmtPrice(delta)} (${pct.toFixed(2)}%) ${tk}, $${fmtPrice(delta * env.pointValue)}`;
      };
      chip(ctx, [lbl("Target", reward)], cx, tp.y + (long ? -13 : 13), profit);
      chip(ctx, [lbl("Stop", risk)], cx, sl.y + (long ? 13 : -13), loss);
      chip(ctx, [`Risk/Reward: ${risk > 0 ? (reward / risk).toFixed(2) : "—"}`], cx, e.y, "#363A45");
      break;
    }

    case "price-range": {
      if (S.length < 2) break;
      const r = normRect(S[0], S[1]);
      const m = metrics(d, env);
      fillShape(ctx, d.color, alpha, () => ctx.rect(r.x, r.y, r.w, r.h));
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      line(ctx, { x: r.x, y: S[0].y }, { x: r.x + r.w, y: S[0].y });
      line(ctx, { x: r.x, y: S[1].y }, { x: r.x + r.w, y: S[1].y });
      const cx = r.x + r.w / 2;
      dashedArrow(ctx, { x: cx, y: S[0].y }, { x: cx, y: S[1].y }, d.color);
      chip(ctx, [m.priceTxt], cx, m.dp >= 0 ? S[1].y - 14 : S[1].y + 14, d.color);
      break;
    }
    case "date-range": {
      if (S.length < 2) break;
      const r = normRect(S[0], S[1]);
      const m = metrics(d, env);
      fillShape(ctx, d.color, alpha, () => ctx.rect(r.x, 0, r.w, env.h));
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      line(ctx, { x: S[0].x, y: 0 }, { x: S[0].x, y: env.h });
      line(ctx, { x: S[1].x, y: 0 }, { x: S[1].x, y: env.h });
      const cy = (S[0].y + S[1].y) / 2;
      dashedArrow(ctx, { x: S[0].x, y: cy }, { x: S[1].x, y: cy }, d.color);
      chip(ctx, [m.timeTxt], r.x + r.w / 2, cy - 16, d.color);
      break;
    }
    case "date-price-range":
    case "measure": {
      if (S.length < 2) break;
      const r = normRect(S[0], S[1]);
      const m = metrics(d, env);
      const col = d.type === "measure" ? (m.dp >= 0 ? "#2962FF" : "#F23645") : d.color;
      fillShape(ctx, col, alpha, () => ctx.rect(r.x, r.y, r.w, r.h));
      ctx.strokeStyle = col;
      ctx.setLineDash([]);
      ctx.lineWidth = 1;
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      dashedArrow(ctx, { x: cx, y: S[0].y }, { x: cx, y: S[1].y }, col);
      dashedArrow(ctx, { x: S[0].x, y: cy }, { x: S[1].x, y: cy }, col);
      chip(ctx, [m.priceTxt, m.timeTxt], cx, m.dp >= 0 ? r.y - 28 : r.y + r.h + 28, col);
      break;
    }

    case "rectangle": {
      if (S.length < 2) break;
      const r = normRect(S[0], S[1]);
      fillShape(ctx, d.color, alpha, () => ctx.rect(r.x, r.y, r.w, r.h));
      ctx.strokeRect(r.x, r.y, r.w, r.h);
      break;
    }
    case "ellipse": {
      if (S.length < 2) break;
      const r = normRect(S[0], S[1]);
      const draw = () => ctx.ellipse(r.x + r.w / 2, r.y + r.h / 2, Math.max(0.5, r.w / 2), Math.max(0.5, r.h / 2), 0, 0, Math.PI * 2);
      fillShape(ctx, d.color, alpha, draw);
      ctx.beginPath(); draw(); ctx.stroke();
      break;
    }
    case "triangle": {
      if (S.length < 2) break;
      fillShape(ctx, d.color, alpha, () => {
        ctx.moveTo(S[0].x, S[0].y);
        for (let i = 1; i < S.length; i++) ctx.lineTo(S[i].x, S[i].y);
        ctx.closePath();
      });
      ctx.beginPath();
      ctx.moveTo(S[0].x, S[0].y);
      for (let i = 1; i < S.length; i++) ctx.lineTo(S[i].x, S[i].y);
      if (S.length === 3) ctx.closePath();
      ctx.stroke();
      break;
    }
    case "brush": {
      if (S.length < 2) break;
      ctx.beginPath();
      ctx.moveTo(S[0].x, S[0].y);
      for (let i = 1; i < S.length - 1; i++) {
        const mx = (S[i].x + S[i + 1].x) / 2, my = (S[i].y + S[i + 1].y) / 2;
        ctx.quadraticCurveTo(S[i].x, S[i].y, mx, my);
      }
      ctx.lineTo(S[S.length - 1].x, S[S.length - 1].y);
      ctx.stroke();
      break;
    }
    case "text": {
      const box = textBox(ctx, d, S[0]);
      ctx.setLineDash([]);
      ctx.font = `${d.fontSize ?? 14}px -apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, sans-serif`;
      ctx.fillStyle = d.color;
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      (d.text ?? "").split("\n").forEach((ln, i) => ctx.fillText(ln, box.x, box.y + i * (d.fontSize ?? 14) * 1.25));
      if (state.selected || state.hovered) {
        ctx.strokeStyle = d.color; ctx.globalAlpha = 0.5; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        ctx.strokeRect(box.x - 3, box.y - 3, box.w + 6, box.h + 6);
      }
      break;
    }
    case "emoji": {
      ctx.setLineDash([]);
      ctx.font = `${d.fontSize ?? 26}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(d.emoji ?? "⭐", S[0].x, S[0].y);
      if (state.selected || state.hovered) {
        const s = (d.fontSize ?? 26) * 0.7;
        ctx.strokeStyle = "#2962FF"; ctx.globalAlpha = 0.6; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
        ctx.strokeRect(S[0].x - s, S[0].y - s, s * 2, s * 2);
      }
      break;
    }
  }
  ctx.restore();

  if (state.selected && !d.hidden) paintHandles(ctx, d, S, env);
}

function paintHandles(ctx: CanvasRenderingContext2D, d: DrawingObject, S: Pt[], env: RenderEnv) {
  const hs = handlesOf(d, S);
  ctx.save();
  ctx.setLineDash([]);
  for (const h of hs) {
    if (h.x < -10 || h.x > env.w + 10 || h.y < -10 || h.y > env.h + 10) continue;
    ctx.beginPath();
    ctx.arc(h.x, h.y, 5, 0, Math.PI * 2);
    ctx.fillStyle = env.dark ? "#131722" : "#ffffff";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = d.locked ? "#787B86" : "#2962FF";
    ctx.stroke();
  }
  ctx.restore();
}

/** Perpendicular (vertical) offset of the parallel channel's second line, in px. */
export function channelOffset(S: Pt[]): number {
  const [a, b, c] = S;
  const dx = b.x - a.x;
  const baseY = dx === 0 ? a.y : a.y + ((b.y - a.y) * (c.x - a.x)) / dx;
  return c.y - baseY;
}

let measureCtx: CanvasRenderingContext2D | null = null;
function mctx(): CanvasRenderingContext2D | null {
  if (!measureCtx && typeof document !== "undefined") measureCtx = document.createElement("canvas").getContext("2d");
  return measureCtx;
}

function textBox(ctx: CanvasRenderingContext2D | null, d: DrawingObject, at: Pt): Rect {
  const c = ctx ?? mctx();
  const fs = d.fontSize ?? 14;
  const lines = (d.text ?? "").split("\n");
  let w = 8;
  if (c) {
    c.save();
    c.font = `${fs}px -apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, sans-serif`;
    w = Math.max(8, ...lines.map((t) => c.measureText(t).width));
    c.restore();
  }
  return { x: at.x, y: at.y - fs / 2, w, h: lines.length * fs * 1.25 };
}

/* ------------------------------ hit testing ------------------------------ */

export function hitTest(
  d: DrawingObject, p: Pt, env: RenderEnv, selected: boolean, tol = 6,
): Hit | null {
  if (d.hidden) return null;
  const S = resolve(d, env);
  if (!S) return null;
  const bounds: Rect = { x: 0, y: 0, w: env.w, h: env.h };

  if (selected && !d.locked) {
    const hs = handlesOf(d, S);
    for (let i = 0; i < hs.length; i++) {
      if (Math.hypot(p.x - hs[i].x, p.y - hs[i].y) <= tol + 3) return { kind: "handle", index: i };
    }
  }

  const body = (): boolean => {
    switch (d.type) {
      case "trend-line": case "info-line": case "arrow":
        return S.length >= 2 && distToLine(p, S[0], S[1], "segment") <= tol;
      case "ray":
        return S.length >= 2 && distToLine(p, S[0], S[1], "ray") <= tol;
      case "extended-line":
        return S.length >= 2 && distToLine(p, S[0], S[1], "extended") <= tol;
      case "horizontal-line": return Math.abs(p.y - S[0].y) <= tol;
      case "horizontal-ray": return Math.abs(p.y - S[0].y) <= tol && p.x >= S[0].x - tol;
      case "vertical-line": return Math.abs(p.x - S[0].x) <= tol;
      case "cross-line": return Math.abs(p.y - S[0].y) <= tol || Math.abs(p.x - S[0].x) <= tol;
      case "parallel-channel": {
        if (S.length < 2) return false;
        if (S.length === 2) return distToLine(p, S[0], S[1], "segment") <= tol;
        const off = channelOffset(S);
        const a2 = { x: S[0].x, y: S[0].y + off }, b2 = { x: S[1].x, y: S[1].y + off };
        return (
          distToLine(p, S[0], S[1], "segment") <= tol || distToLine(p, a2, b2, "segment") <= tol ||
          pointInPolygon(p, [S[0], S[1], b2, a2])
        );
      }
      case "fib-retracement": {
        if (S.length < 2) return false;
        const [a, b] = S;
        const xl = Math.min(a.x, b.x), xr = Math.max(a.x, b.x);
        if (distToSegment(p, a, b) <= tol) return true;
        const ys = FIB_LEVELS.map((lv) => b.y - (b.y - a.y) * lv.v);
        if (p.x >= xl - tol && p.x <= xr + tol && ys.some((y) => Math.abs(p.y - y) <= tol)) return true;
        return inRect(p, { x: xl, y: Math.min(...ys), w: xr - xl, h: Math.max(...ys) - Math.min(...ys) });
      }
      case "long-position": case "short-position": {
        if (S.length < 3) return false;
        const xl = Math.min(S[0].x, S[1].x), xr = Math.max(S[0].x, S[1].x);
        const yt = Math.min(S[1].y, S[2].y), yb = Math.max(S[1].y, S[2].y);
        return inRect(p, { x: xl, y: yt, w: xr - xl, h: yb - yt }, 2);
      }
      case "date-range": {
        if (S.length < 2) return false;
        const r = normRect(S[0], S[1]);
        return p.x >= r.x - tol && p.x <= r.x + r.w + tol;
      }
      case "price-range": case "date-price-range": case "measure": case "rectangle": {
        if (S.length < 2) return false;
        return inRect(p, normRect(S[0], S[1]), 2);
      }
      case "ellipse": {
        if (S.length < 2) return false;
        return ellipseRadius(p, normRect(S[0], S[1])) <= 1.05;
      }
      case "triangle": {
        if (S.length < 2) return false;
        for (let i = 0; i < S.length - 1; i++) if (distToSegment(p, S[i], S[i + 1]) <= tol) return true;
        if (S.length === 3) {
          if (distToSegment(p, S[2], S[0]) <= tol) return true;
          return pointInPolygon(p, S);
        }
        return false;
      }
      case "brush": {
        for (let i = 0; i < S.length - 1; i++) if (distToSegment(p, S[i], S[i + 1]) <= tol + 1) return true;
        return false;
      }
      case "text": {
        const b = textBox(null, d, S[0]);
        return inRect(p, b, 4);
      }
      case "emoji": {
        const s = (d.fontSize ?? 26) * 0.7;
        return inRect(p, { x: S[0].x - s, y: S[0].y - s, w: s * 2, h: s * 2 });
      }
    }
    return false;
  };

  // Cheap reject for offscreen-only lines is unnecessary — pointer is always on screen.
  void bounds; void visibleLine;
  return body() ? { kind: "body" } : null;
}
