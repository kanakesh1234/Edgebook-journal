import { strict as assert } from "node:assert";
import {
  clipLine, constrainAxis, distToLine, distToSegment, ellipseRadius, pointInPolygon, snapTick, visibleLine,
} from "../../src/lib/backtesting/drawings/geometry.ts";
import { TOOLS, isDrawingTool } from "../../src/lib/backtesting/drawings/tools.ts";
import { Projector, timeframeSeconds } from "../../src/components/backtesting/drawings/projector.ts";
import { useBacktest } from "../../src/lib/backtesting/store.ts";
import type { DrawingObject } from "../../src/lib/backtesting/types.ts";

// ---- geometry
assert.equal(distToSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 5);
assert.equal(distToSegment({ x: 15, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }), 5, "clamped to segment end");
assert.equal(distToLine({ x: 15, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 }, "extended"), 3, "extended line has no end");
assert.equal(distToLine({ x: -5, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }, "ray"), 5, "ray stops at its origin");
const R = { x: 0, y: 0, w: 100, h: 50 };
const ray = visibleLine({ x: 10, y: 10 }, { x: 20, y: 10 }, "ray", R)!;
assert.deepEqual([ray[0].x, ray[1].x], [10, 100], "ray runs to the right edge");
const ext = visibleLine({ x: 10, y: 10 }, { x: 20, y: 10 }, "extended", R)!;
assert.deepEqual([ext[0].x, ext[1].x], [0, 100], "extended line spans the pane");
assert.equal(clipLine({ x: 200, y: 200 }, { x: 300, y: 300 }, R, 0, 1), null, "fully offscreen segment");
assert.equal(pointInPolygon({ x: 2, y: 2 }, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }]), true);
assert.equal(pointInPolygon({ x: 9, y: 9 }, [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 10 }]), false);
assert.ok(ellipseRadius({ x: 50, y: 25 }, R) < 0.01 && Math.abs(ellipseRadius({ x: 100, y: 25 }, R) - 1) < 1e-9);
assert.equal(snapTick(100.13, 0.25), 100.25);
assert.deepEqual(constrainAxis({ x: 0, y: 0 }, { x: 10, y: 3 }), { x: 10, y: 0 });
assert.deepEqual(constrainAxis({ x: 0, y: 0 }, { x: 2, y: 9 }), { x: 0, y: 9 });

// ---- tool registry
assert.ok(isDrawingTool("fib-retracement") && !isDrawingTool("cursor") && !isDrawingTool("pointer") && !isDrawingTool(null));
for (const [id, def] of Object.entries(TOOLS)) assert.equal(def.id, id);

// ---- projector: times extrapolate past both ends and round-trip on bars
const times = [1000, 1060, 1120, 1180];
const fakeChart = { timeScale: () => ({ logicalToCoordinate: (l: number) => l * 10, coordinateToLogical: (x: number) => x / 10 }), paneSize: () => ({ width: 500, height: 300 }) };
const fakeSeries = { priceToCoordinate: (p: number) => 1000 - p, coordinateToPrice: (y: number) => 1000 - y };
const proj = new Projector({
  chart: fakeChart as never, series: fakeSeries as never,
  getTimes: () => times, getBarSec: () => 60,
  getCandles: () => times.map((t) => ({ time: t, open: 100, high: 110, low: 90, close: 105, volume: 0 })),
});
assert.equal(proj.timeToLogical(1120), 2);
assert.equal(proj.timeToLogical(1090), 1.5, "between bars interpolates");
assert.equal(proj.timeToLogical(1180 + 120), 3 + 2, "future time extrapolates by bar length");
assert.equal(proj.logicalToTime(5), 1180 + 120);
assert.equal(proj.logicalToTime(-1), 940);
for (const t of [940, 1000, 1120, 1300]) assert.equal(proj.logicalToTime(proj.timeToLogical(t)), t, `round trip ${t}`);
assert.equal(proj.xToTime(21), 1120, "pointer snaps to the nearest bar");
assert.deepEqual(proj.snap(20, 893, "off", 0.25), { time: 1120, price: 107 });
assert.equal(proj.snap(20, 893, "strong", 0.25)!.price, 105, "strong magnet pulls to the nearest of the bar's O/H/L/C");
assert.equal(proj.snap(20, 908, "weak", 0.25)!.price, 90, "weak magnet snaps when close to an OHLC value");
assert.equal(proj.snap(20, 700, "weak", 0.25)!.price, 300, "weak magnet leaves far-away prices alone");
assert.equal(timeframeSeconds("4h"), 14400);
assert.equal(timeframeSeconds("1D"), 86400);

// ---- store: drawing undo/redo, locking, temp cleanup, alerts
const S = "NQ";
const mk = (id: string, extra: Partial<DrawingObject> = {}): DrawingObject => ({ id, type: "trend-line", points: [{ time: 1, price: 1 }, { time: 2, price: 2 }], color: "#fff", lineWidth: 1, ...extra });
useBacktest.setState({ drawings: { [S]: [] }, drawHistory: { past: {}, future: {} }, selectedDrawingId: null });
const st = () => useBacktest.getState();
st().addDrawing(S, mk("a"));
st().addDrawing(S, mk("b"));
assert.equal(st().drawings[S].length, 2);
st().undoDrawing(S);
assert.deepEqual(st().drawings[S].map((d) => d.id), ["a"]);
st().redoDrawing(S);
assert.deepEqual(st().drawings[S].map((d) => d.id), ["a", "b"]);
st().undoDrawing(S); st().addDrawing(S, mk("c"));
assert.equal(st().drawHistory.future[S].length, 0, "a new edit clears redo");
st().beginDrawingEdit(S);
st().updateDrawing(S, "a", { points: [{ time: 5, price: 5 }, { time: 6, price: 6 }] }, false);
st().undoDrawing(S);
assert.equal(st().drawings[S].find((d) => d.id === "a")!.points[0].time, 1, "one drag = one undo step");
st().selectDrawing("a"); st().removeDrawing(S, "a");
assert.equal(st().selectedDrawingId, null, "removing the selected drawing clears selection");
st().addDrawing(S, mk("m", { temp: true }));
st().removeTempDrawings(S);
assert.ok(!st().drawings[S].some((d) => d.temp), "measure drawings vanish on next click");
const clone = st().cloneDrawing(S, "c")!;
assert.notEqual(clone, "c");
st().updateDrawing(S, "c", { hidden: true });
st().setDrawingsHidden(true); st().setDrawingsHidden(false);
assert.ok(!st().drawings[S].some((d) => d.hidden), "showing all drawings revives individually hidden ones");
st().addAlert(S, 123.5, "up");
assert.equal(st().alerts.length, 1);
st().removeAlert(st().alerts[0].id);
assert.equal(st().alerts.length, 0);
st().setOrderQty(0); assert.equal(st().orderQty, 1, "quantity never drops below 1");
console.log("drawings.test.ts ok");

// ---- renderer smoke test: every tool paints and can be picked without throwing
import { paintDrawing, hitTest, handlesOf, resolve, isComplete } from "../../src/components/backtesting/drawings/render.ts";
const calls: string[] = [];
const ctx = new Proxy({}, {
  get: (_t, k: string) => (k === "measureText" ? () => ({ width: 50 }) : (...a: unknown[]) => { calls.push(k + a.length); }),
  set: () => true,
}) as unknown as CanvasRenderingContext2D;
const env = { proj, w: 500, h: 300, tick: 0.25, pointValue: 2, dark: true };
const pts = [{ time: 1000, price: 100 }, { time: 1120, price: 120 }, { time: 1180, price: 90 }];
for (const def of Object.values(TOOLS)) {
  const n = def.points === "free" ? 4 : def.id === "long-position" || def.id === "short-position" ? 3 : def.points;
  const d: DrawingObject = {
    id: def.id, type: def.id, color: def.color, lineWidth: def.lineWidth, text: "hi", emoji: "⭐",
    points: (def.points === "free" ? [...pts, { time: 1200, price: 95 }] : pts).slice(0, n),
  };
  assert.ok(isComplete(d), `${def.id} complete`);
  calls.length = 0;
  paintDrawing(ctx, d, env, { selected: true, hovered: false });
  assert.ok(calls.length > 0, `${def.id} painted something`);
  const S = resolve(d, env)!;
  assert.ok(S && S.length === d.points.length);
  // picking right on the first anchor must hit (handle when selected, body/handle otherwise)
  const hs = handlesOf(d, S);
  if (hs.length) assert.deepEqual(hitTest(d, hs[0], env, true), { kind: "handle", index: 0 }, `${def.id} handle 0 pickable`);
  assert.equal(hitTest({ ...d, hidden: true }, S[0], env, false), null, `${def.id} hidden is not pickable`);
  assert.equal(hitTest(d, { x: -500, y: -500 }, env, false), null, `${def.id} far miss`);
}
console.log("renderer smoke ok");
