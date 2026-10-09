import { strict as assert } from "node:assert";
import { modeStats, overallAccuracy, recommendMode } from "../../src/lib/practice/coach.ts";

const perf = (entries: Record<string, [number, number]>) => ({
  xp: 0, streak: 0,
  modePerformance: Object.fromEntries(Object.entries(entries).map(([k, [correct, attempts]]) => [k, { correct, attempts }])),
});

// ---- stats
assert.deepEqual(modeStats(undefined, "matrix"), { attempts: 0, correct: 0, accuracy: null });
assert.equal(modeStats(perf({ matrix: [6, 8] }), "matrix").accuracy, 0.75);
assert.equal(overallAccuracy(undefined), null);
// per-trade copies ("matrix:abc") are skipped so nothing is counted twice
assert.equal(overallAccuracy(perf({ matrix: [6, 10], "matrix:t1": [3, 3], boss: [4, 10] })), 0.5);

// ---- a brand-new player starts with the mixed run
assert.deepEqual(recommendMode({ progress: undefined, locked: {} })?.mode, "matrix");
assert.match(recommendMode({ progress: undefined, locked: {} })!.reason, /mixed run/i);

// ---- locked modes are never recommended
assert.equal(recommendMode({ progress: undefined, locked: { matrix: "Add a trade", "time-machine": "Add a trade", boss: "Needs two trades" } })?.mode, "math-duel");
assert.equal(recommendMode({ progress: undefined, locked: { matrix: "x", "time-machine": "x", "math-duel": "x", boss: "x", ict: "x" } }), null);
// when only one mode is open, don't pretend it is the "weakest"
const only = recommendMode({ progress: perf({ "math-duel": [8, 10] }), locked: { matrix: "x", "time-machine": "x", boss: "x", ict: "x" } })!;
assert.equal(only.mode, "math-duel");
assert.doesNotMatch(only.reason, /weakest/i);

// ---- an unplayed mode comes before specialising
const partial = recommendMode({ progress: perf({ matrix: [9, 10], "time-machine": [9, 10], "math-duel": [9, 10], ict: [9, 10] }), locked: {} })!;
assert.equal(partial.mode, "boss");
assert.match(partial.reason, /haven't played/i);

// ---- once everything is played, the weakest mode wins
const weak = recommendMode({ progress: perf({ matrix: [9, 10], "time-machine": [5, 10], "math-duel": [8, 10], boss: [9, 10], ict: [9, 10] }), locked: {} })!;
assert.equal(weak.mode, "time-machine");
assert.match(weak.reason, /50%/);

// ---- near-ties rotate to whichever has had fewer rounds
const tie = recommendMode({ progress: perf({ matrix: [16, 20], "time-machine": [8, 10], "math-duel": [9, 10], boss: [9, 10], ict: [9, 10] }), locked: {} })!;
assert.equal(tie.mode, "time-machine");
assert.match(tie.reason, /evenly matched/i);

console.log("coach tests passed");
