import { strict as assert } from "node:assert";
import { avoidObstacles, fracToXY, overlaps, snapXY, travel, xyToFrac } from "../../src/components/backtesting/fav-geometry.ts";
import { reorder } from "../../src/lib/backtesting/ui-prefs.ts";
import { parseTip } from "../../src/components/backtesting/tip-parse.ts";

const t = travel(1000, 600, 300, 44, { l: 0, t: 0, r: 72, b: 30 });
assert.deepEqual(t, { minX: 8, minY: 8, maxX: 620, maxY: 518 }, "8px margin, clear of price + time scale");
// snapping to edges / corners
assert.deepEqual(snapXY(12, 500, t), { x: 8, y: 500, sx: -1, sy: 0 });
assert.deepEqual(snapXY(615, 515, t), { x: 620, y: 518, sx: 1, sy: 1 });
assert.deepEqual(snapXY(300, 300, t), { x: 300, y: 300, sx: 0, sy: 0 });
assert.equal(snapXY(-50, -50, t).x, 8, "clamped inside");
// fraction round trip survives a resize (edge stays on the edge)
const f = xyToFrac(620, 518, t);
assert.deepEqual(f, { x: 1, y: 1 });
const t2 = travel(700, 400, 300, 44, { l: 0, t: 0, r: 72, b: 30 });
assert.deepEqual(fracToXY(f, t2), { x: t2.maxX, y: t2.maxY });
// obstacle avoidance
const legend = { x: 10, y: 8, w: 400, h: 60 };
const bar = { x: 20, y: 20, w: 300, h: 44 };
assert.ok(overlaps(bar, legend));
const p = avoidObstacles(bar, [legend], t);
assert.ok(!overlaps({ ...bar, ...p }, legend), "moved clear of the legend");
assert.deepEqual(avoidObstacles({ x: 300, y: 300, w: 300, h: 44 }, [legend], t), { x: 300, y: 300 }, "untouched when free");
// reorder
assert.deepEqual(reorder(["a", "b", "c", "d"], 0, 2), ["b", "c", "a", "d"]);
assert.deepEqual(reorder(["a", "b", "c"], 2, 0), ["c", "a", "b"]);
assert.deepEqual(reorder(["a", "b"], 5, 0), ["a", "b"], "out-of-range from is a no-op");
// tooltip parsing
assert.deepEqual(parseTip("Trend line (Alt+T)"), { label: "Trend line", keys: ["Alt", "T"] });
assert.deepEqual(parseTip("Jump to bar (forward only)"), { label: "Jump to bar (forward only)", keys: [] });
assert.deepEqual(parseTip("Step back (←)"), { label: "Step back", keys: ["←"] });
console.log("favorites tests ok");
