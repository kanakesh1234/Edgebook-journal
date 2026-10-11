/* ------------------------------------------------------------------ */
/*  DrawingController — mouse + keyboard behaviour of the drawing      */
/*  layer: create (click-click or click-drag), select, move, resize,   */
/*  erase, box-zoom, undo/redo, delete, copy/paste, Shift-constrain.   */
/*                                                                      */
/*  Listens in the CAPTURE phase on the chart container so it can      */
/*  claim a gesture before lightweight-charts starts panning, and      */
/*  steps aside (does nothing) when the pointer is not on a drawing.   */
/* ------------------------------------------------------------------ */

import type { IChartApi, ISeriesApi, SeriesType } from "lightweight-charts";
import { useBacktest } from "@/lib/backtesting/store";
import type { DrawingObject, DrawingToolType } from "@/lib/backtesting/types";
import { TOOLS, isDrawingTool } from "@/lib/backtesting/drawings/tools";
import { constrainAxis, dist, type Pt } from "@/lib/backtesting/drawings/geometry";
import { uid } from "@/lib/utils";
import { hitTest, isComplete, type Hit, type RenderEnv, resolve } from "./render";
import type { DrawingsPrimitive } from "./primitive";
import type { Projector } from "./projector";

export interface ControllerDeps {
  container: HTMLElement;
  chart: IChartApi;
  series: ISeriesApi<SeriesType>;
  proj: Projector;
  primitive: DrawingsPrimitive;
  getSymbol: () => string;
  getTick: () => number;
  getEnv: () => RenderEnv | null;
  /** Ask the UI to open the inline text editor for a text drawing. */
  editText: (id: string) => void;
  /** Replay "Jump to": user clicked a bar while selecting. */
  pickBar: (time: number) => void;
}

interface Creating {
  d: DrawingObject;
  tool: DrawingToolType;
  /** Anchors already fixed; d.points[placed] is the live (preview) one. */
  placed: number;
  pressed: boolean;
  down: Pt;
  moved: boolean;
}

interface Dragging {
  id: string;
  handle: number | null;
  start: Pt;
  orig: DrawingObject;
  origLogical: number[];
  origY: number[];
  recorded: boolean;
}

const LINEISH = new Set<DrawingToolType>(["trend-line", "ray", "info-line", "extended-line", "arrow", "measure", "price-range", "date-range", "date-price-range"]);

export class DrawingController {
  private creating: Creating | null = null;
  private dragging: Dragging | null = null;
  private zoomStart: Pt | null = null;
  private swallow = false;
  private clip: DrawingObject | null = null;
  private lastPos: Pt | null = null;

  constructor(private d: ControllerDeps) {}

  attach(): () => void {
    const c = this.d.container;
    const opt = { capture: true } as const;
    c.addEventListener("pointerdown", this.onDown, opt);
    c.addEventListener("pointermove", this.onMove, opt);
    c.addEventListener("pointerup", this.onUp, opt);
    c.addEventListener("pointercancel", this.onUp, opt);
    c.addEventListener("mousedown", this.onCompat, opt);
    c.addEventListener("touchstart", this.onCompat, opt);
    c.addEventListener("dblclick", this.onDbl, opt);
    window.addEventListener("keydown", this.onKey);
    return () => {
      c.removeEventListener("pointerdown", this.onDown, opt);
      c.removeEventListener("pointermove", this.onMove, opt);
      c.removeEventListener("pointerup", this.onUp, opt);
      c.removeEventListener("pointercancel", this.onUp, opt);
      c.removeEventListener("mousedown", this.onCompat, opt);
      c.removeEventListener("touchstart", this.onCompat, opt);
      c.removeEventListener("dblclick", this.onDbl, opt);
      window.removeEventListener("keydown", this.onKey);
    };
  }

  /* ---------------- helpers ---------------- */

  private st() { return useBacktest.getState(); }
  private sym() { return this.d.getSymbol(); }
  private list(): DrawingObject[] { return this.st().drawings[this.sym()] || []; }

  private pos(e: { clientX: number; clientY: number }): Pt {
    const r = this.d.container.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private inPane(p: Pt): boolean {
    const { w, h } = this.d.proj.paneSize();
    return p.x >= 0 && p.y >= 0 && p.x <= w && p.y <= h;
  }

  private locked(d: DrawingObject): boolean { return !!d.locked || this.st().drawingsLocked; }

  /** Top-most drawing under the pointer (selected one wins so its handles stay grabbable). */
  pick(p: Pt): { d: DrawingObject; hit: Hit } | null {
    const env = this.d.getEnv();
    if (!env || this.st().drawingsHidden) return null;
    const list = this.list();
    const sel = list.find((d) => d.id === this.st().selectedDrawingId);
    if (sel) {
      const hit = hitTest(sel, p, env, true);
      if (hit) return { d: sel, hit };
    }
    for (let i = list.length - 1; i >= 0; i--) {
      const hit = hitTest(list[i], p, env, false);
      if (hit) return { d: list[i], hit };
    }
    return null;
  }

  private snap(p: Pt) {
    return this.d.proj.snap(p.x, p.y, this.st().magnetMode, this.d.getTick());
  }

  private styleFor(tool: DrawingToolType): Pick<DrawingObject, "color" | "lineWidth" | "lineStyle" | "fillOpacity" | "fontSize"> {
    const def = TOOLS[tool];
    const saved = this.st().toolStyles[tool] || {};
    return {
      color: saved.color ?? def.color,
      lineWidth: saved.lineWidth ?? def.lineWidth,
      lineStyle: saved.lineStyle ?? def.lineStyle,
      fillOpacity: saved.fillOpacity ?? def.fillOpacity,
      fontSize: saved.fontSize,
    };
  }

  private fresh(tool: DrawingToolType, first: { time: number; price: number }): DrawingObject {
    const d: DrawingObject = {
      id: uid("drw"),
      type: tool,
      points: [first, { ...first }],
      ...this.styleFor(tool),
    };
    if (tool === "emoji") d.emoji = this.st().activeEmoji;
    if (tool === "measure") d.temp = true;
    return d;
  }

  /** Long/short tool: one click drops entry + target + stop, sized from what is on screen. */
  private positionPoints(tool: DrawingToolType, at: { time: number; price: number }, p: Pt) {
    const proj = this.d.proj;
    const { h } = proj.paneSize();
    const tick = this.d.getTick();
    const upY = proj.yToPrice(Math.max(0, p.y - h * 0.07));
    let risk = upY === null ? tick * 20 : Math.abs(upY - at.price);
    risk = Math.max(tick * 4, Math.round(risk / tick) * tick);
    const long = tool === "long-position";
    const l = proj.timeToLogical(at.time);
    const tRight = proj.logicalToTime(Math.round(l) + 12);
    return [
      at,
      { time: tRight, price: at.price + (long ? 2 : -2) * risk },
      { time: tRight, price: at.price + (long ? -1 : 1) * risk },
    ];
  }

  private commit(d: DrawingObject) {
    const st = this.st();
    st.addDrawing(this.sym(), d);
    this.d.primitive.set({ preview: null });
    this.creating = null;
    if (d.temp) st.selectDrawing(null); else st.selectDrawing(d.id);
    if (!st.stayInDrawing) st.setActiveDrawingTool("cursor");
    if (d.type === "text") this.d.editText(d.id);
  }

  private cancelCreate() {
    this.creating = null;
    this.d.primitive.set({ preview: null });
  }

  /* ---------------- pointer: down ---------------- */

  private onCompat = (e: Event) => {
    if (this.swallow) e.stopPropagation();
  };

  private claim(e: PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    this.swallow = true;
    this.d.chart.applyOptions({ handleScroll: false, handleScale: false });
    try { this.d.container.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
  }

  private release(e?: PointerEvent) {
    this.swallow = false;
    this.d.chart.applyOptions({
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
    });
    if (e) { try { this.d.container.releasePointerCapture(e.pointerId); } catch { /* already released */ } }
  }

  private onDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    const p = this.pos(e);
    if (!this.inPane(p)) return; // axes keep their own drag-to-scale behaviour
    const st = this.st();
    this.lastPos = p;

    // Replay "Jump to": next click on a bar fast-forwards there.
    if (st.selectingBar) {
      const t = this.d.proj.xToTime(p.x);
      this.claim(e);
      this.release(e);
      if (t !== null) this.d.pickBar(t);
      return;
    }

    st.removeTempDrawings(this.sym());

    // Second/third click of a click-click drawing.
    if (this.creating && !this.creating.pressed) {
      this.claim(e);
      this.placeNext(p, e.shiftKey);
      return;
    }

    const tool = st.activeDrawingTool;

    if (tool === "zoom") {
      this.claim(e);
      this.zoomStart = p;
      return;
    }

    if (tool === "eraser") {
      const hit = this.pick(p);
      if (hit && !this.locked(hit.d)) {
        this.claim(e);
        st.removeDrawing(this.sym(), hit.d.id);
        this.release(e);
      }
      return;
    }

    if (isDrawingTool(tool)) {
      this.claim(e);
      this.startCreate(tool, p);
      return;
    }

    // Cursor modes: select / drag.
    const hit = this.pick(p);
    if (!hit) {
      if (st.selectedDrawingId) st.selectDrawing(null);
      return; // let the chart pan
    }
    this.claim(e);
    st.selectDrawing(hit.d.id);
    if (this.locked(hit.d)) { this.release(e); return; }
    const proj = this.d.proj;
    this.dragging = {
      id: hit.d.id,
      handle: hit.hit.kind === "handle" ? hit.hit.index : null,
      start: p,
      orig: hit.d,
      origLogical: hit.d.points.map((q) => proj.timeToLogical(q.time)),
      origY: hit.d.points.map((q) => proj.toY(q.price) ?? 0),
      recorded: false,
    };
  };

  private startCreate(tool: DrawingToolType, p: Pt) {
    const s = this.snap(p);
    if (!s) { this.release(); return; }
    const def = TOOLS[tool];
    const d = this.fresh(tool, s);

    if (tool === "long-position" || tool === "short-position") {
      d.points = this.positionPoints(tool, s, p);
      this.commit(d);
      this.release();
      return;
    }
    if (def.points === 1) {
      d.points = [s];
      this.commit(d);
      this.release();
      return;
    }
    if (def.points === "free") {
      d.points = [s];
      this.creating = { d, tool, placed: 0, pressed: true, down: p, moved: false };
      this.d.primitive.set({ preview: { ...d } });
      return;
    }
    this.creating = { d, tool, placed: 1, pressed: true, down: p, moved: false };
    this.d.primitive.set({ preview: { ...d, points: [...d.points] } });
  }

  private placeNext(p: Pt, shift: boolean) {
    const c = this.creating;
    if (!c) return;
    const s = this.constrained(c, p, shift);
    if (!s) return;
    c.d.points[c.placed] = s;
    c.placed++;
    const need = TOOLS[c.tool].points as number;
    if (c.placed >= need) {
      this.commit({ ...c.d, points: c.d.points.slice(0, need) });
      this.release();
    } else {
      c.d.points.push({ ...s });
      this.d.primitive.set({ preview: { ...c.d, points: [...c.d.points] } });
    }
  }

  /** Snap + (Shift) axis-lock relative to the previous anchor. */
  private constrained(c: Creating, p: Pt, shift: boolean) {
    let q = p;
    if (shift && LINEISH.has(c.tool) && c.placed >= 1) {
      const prev = this.d.proj.toPt(c.d.points[c.placed - 1].time, c.d.points[c.placed - 1].price);
      if (prev) q = constrainAxis(prev, p);
    }
    return this.snap(q);
  }

  /* ---------------- pointer: move ---------------- */

  private onMove = (e: PointerEvent) => {
    const p = this.pos(e);
    this.lastPos = p;

    if (this.zoomStart) {
      const a = this.zoomStart;
      this.d.primitive.set({ zoomBox: { x: Math.min(a.x, p.x), y: Math.min(a.y, p.y), w: Math.abs(p.x - a.x), h: Math.abs(p.y - a.y) } });
      return;
    }

    const c = this.creating;
    if (c) {
      if (c.pressed && dist(p, c.down) > 4) c.moved = true;
      if (c.tool === "brush") {
        if (c.pressed) {
          const last = c.d.points[c.d.points.length - 1];
          const lp = this.d.proj.toPt(last.time, last.price);
          const s = this.d.proj.yToPrice(p.y);
          const t = this.d.proj.xToLogical(p.x);
          if (s !== null && t !== null && (!lp || dist(lp, p) >= 3)) {
            c.d.points.push({ time: this.d.proj.logicalToTime(t), price: s });
            this.d.primitive.set({ preview: { ...c.d, points: [...c.d.points] } });
          }
        }
        return;
      }
      const s = this.constrained(c, p, e.shiftKey);
      if (s) {
        c.d.points[c.placed] = s;
        this.d.primitive.set({ preview: { ...c.d, points: [...c.d.points] } });
      }
      return;
    }

    const dr = this.dragging;
    if (dr) {
      this.drag(dr, p, e.shiftKey);
      return;
    }

    // Idle hover feedback.
    if (e.buttons !== 0 || !this.inPane(p)) {
      if (this.d.primitive.hoverId) this.d.primitive.set({ hoverId: null });
      return;
    }
    const tool = this.st().activeDrawingTool;
    if (tool && tool !== "cursor" && tool !== "crosshair" && tool !== "dot" && tool !== "pointer" && tool !== "eraser") return;
    const hit = this.pick(p);
    const id = hit?.d.id ?? null;
    if (id !== this.d.primitive.hoverId) this.d.primitive.set({ hoverId: id });
    this.d.container.style.cursor = hit
      ? this.locked(hit.d) ? "not-allowed" : hit.hit.kind === "handle" ? "grab" : "pointer"
      : "";
  };

  private drag(dr: Dragging, p: Pt, shift: boolean) {
    const st = this.st();
    const proj = this.d.proj;
    const tick = this.d.getTick();
    if (!dr.recorded && dist(p, dr.start) < 2) return;
    if (!dr.recorded) { st.beginDrawingEdit(this.sym()); dr.recorded = true; }

    const orig = dr.orig;
    let points = orig.points.map((q) => ({ ...q }));

    if (dr.handle === null) {
      const dBars = Math.round((p.x - dr.start.x) / proj.pxPerBar());
      const dy = p.y - dr.start.y;
      points = points.map((q, i) => {
        const price = proj.yToPrice(dr.origY[i] + dy);
        return {
          time: proj.logicalToTime(dr.origLogical[i] + dBars),
          price: price === null ? q.price : Math.round(price / tick) * tick,
        };
      });
    } else {
      let q = p;
      if (shift && LINEISH.has(orig.type) && orig.points.length >= 2) {
        const other = dr.handle === 0 ? 1 : 0;
        const o = proj.toPt(orig.points[other].time, orig.points[other].price);
        if (o) q = constrainAxis(o, p);
      }
      const s = proj.snap(q.x, q.y, st.magnetMode, tick);
      if (!s) return;
      points = this.applyHandle(orig, points, dr.handle, s);
    }
    st.updateDrawing(this.sym(), dr.id, { points }, false);
  }

  private applyHandle(
    d: DrawingObject, pts: Array<{ time: number; price: number }>, i: number, s: { time: number; price: number },
  ) {
    if (TOOLS[d.type].box && pts.length >= 2) {
      if (i === 0) pts[0] = { ...s };
      else if (i === 1) { pts[1] = { ...pts[1], time: s.time }; pts[0] = { ...pts[0], price: s.price }; }
      else if (i === 2) pts[1] = { ...s };
      else { pts[0] = { ...pts[0], time: s.time }; pts[1] = { ...pts[1], price: s.price }; }
      return pts;
    }
    if ((d.type === "long-position" || d.type === "short-position") && pts.length >= 3) {
      if (i === 0) pts[0] = { ...s };
      else if (i === 1) { pts[1] = { ...s }; pts[2] = { ...pts[2], time: s.time }; }
      else { pts[2] = { ...s }; pts[1] = { ...pts[1], time: s.time }; }
      return pts;
    }
    pts[i] = { ...s };
    return pts;
  }

  /* ---------------- pointer: up ---------------- */

  private onUp = (e: PointerEvent) => {
    const p = this.pos(e);

    if (this.zoomStart) {
      this.finishZoom(this.zoomStart, p);
      this.zoomStart = null;
      this.d.primitive.set({ zoomBox: null });
      this.release(e);
      const st = this.st();
      if (!st.stayInDrawing) st.setActiveDrawingTool("cursor");
      return;
    }

    const c = this.creating;
    if (c && c.pressed) {
      c.pressed = false;
      if (c.tool === "brush") {
        if (c.d.points.length >= 2) this.commit({ ...c.d });
        else this.cancelCreate();
        this.release(e);
        return;
      }
      if (c.moved) {
        const s = this.constrained(c, p, e.shiftKey);
        if (s) {
          c.d.points[c.placed] = s;
          c.placed++;
          const need = TOOLS[c.tool].points as number;
          if (c.placed >= need) {
            this.commit({ ...c.d, points: c.d.points.slice(0, need) });
          } else {
            c.d.points.push({ ...s });
            this.d.primitive.set({ preview: { ...c.d, points: [...c.d.points] } });
          }
        }
      }
      // A plain click keeps the drawing open: the next click places the next anchor.
      this.release(e);
      return;
    }

    if (this.dragging) {
      this.dragging = null;
      this.release(e);
      return;
    }
    if (this.swallow) this.release(e);
  };

  private finishZoom(a: Pt, b: Pt) {
    const w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
    if (w < 8 || h < 8) return;
    const proj = this.d.proj;
    const l0 = proj.xToLogical(Math.min(a.x, b.x)), l1 = proj.xToLogical(Math.max(a.x, b.x));
    const pHi = proj.yToPrice(Math.min(a.y, b.y)), pLo = proj.yToPrice(Math.max(a.y, b.y));
    if (l0 === null || l1 === null || pHi === null || pLo === null) return;
    this.d.chart.timeScale().setVisibleLogicalRange({ from: l0, to: l1 });
    this.d.series.priceScale().setAutoScale(false);
    this.d.series.priceScale().setVisibleRange({ from: pLo, to: pHi });
    useBacktest.getState().setScale({ auto: false });
  }

  /* ---------------- double click / keys ---------------- */

  private onDbl = (e: MouseEvent) => {
    const p = this.pos(e);
    if (!this.inPane(p)) return;
    const hit = this.pick(p);
    if (hit?.d.type === "text" && !this.locked(hit.d)) {
      e.stopPropagation();
      this.d.editText(hit.d.id);
    }
  };

  private onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
    const st = this.st();
    const sym = this.sym();
    const mod = e.ctrlKey || e.metaKey;

    if (e.key === "Escape") {
      if (this.creating) this.cancelCreate();
      if (this.zoomStart) { this.zoomStart = null; this.d.primitive.set({ zoomBox: null }); }
      if (st.selectingBar) st.setSelectingBar(false);
      st.removeTempDrawings(sym);
      if (st.selectedDrawingId) st.selectDrawing(null);
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && st.selectedDrawingId) {
      const d = this.list().find((x) => x.id === st.selectedDrawingId);
      if (d && !this.locked(d)) { e.preventDefault(); st.removeDrawing(sym, d.id); }
      return;
    }
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) st.redoDrawing(sym); else st.undoDrawing(sym); return; }
    if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); st.redoDrawing(sym); return; }
    if (mod && e.key.toLowerCase() === "c" && st.selectedDrawingId) {
      this.clip = this.list().find((x) => x.id === st.selectedDrawingId) ?? null;
      return;
    }
    if (mod && e.key.toLowerCase() === "v" && this.clip) {
      e.preventDefault();
      const copy: DrawingObject = {
        ...this.clip,
        id: uid("drw"),
        locked: false,
        points: this.clip.points.map((q) => ({ time: q.time + this.d.proj.barSec * 3, price: q.price })),
      };
      st.addDrawing(sym, copy);
      st.selectDrawing(copy.id);
      this.clip = copy;
    }
  };

  /** True while a drawing is mid-creation (UI can show a hint). */
  get isCreating(): boolean { return !!this.creating; }

  /** Used by the UI to know where a context-menu click landed. */
  hitAt(p: Pt) { return this.pick(p); }
}

// Re-exported so chart.tsx doesn't need to import render.ts for these.
export { isComplete, resolve };
