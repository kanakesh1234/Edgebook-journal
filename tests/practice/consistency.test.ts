import { strict as assert } from "node:assert";
import { addDaysKey, calendarGrid, dateLabel, dayLevel, rangeLabel, summarise, weekdayIndex } from "../../src/lib/practice/consistency.ts";

// ---- date maths is timezone-proof
assert.equal(addDaysKey("2026-10-31", 1), "2026-11-01");
assert.equal(addDaysKey("2026-03-01", -1), "2026-02-28");
assert.equal(weekdayIndex("2026-10-05"), 0); // Monday
assert.equal(weekdayIndex("2026-10-06"), 1); // Tuesday
assert.equal(weekdayIndex("2026-10-11"), 6); // Sunday

// ---- the grid: 5 Monday-first rows, current week last, future days flagged
const today = "2026-10-06";
const grid = calendarGrid(today);
assert.equal(grid.length, 35);
assert.equal(grid[0]!.key, "2026-09-07");
assert.equal(weekdayIndex(grid[0]!.key), 0);
assert.equal(grid[34]!.key, "2026-10-11");
assert.equal(grid.filter((c) => c.future).length, 5);
assert.equal(grid.find((c) => c.key === today)!.future, false);
assert.equal(grid.find((c) => c.key === today)!.day, 6);
// every column is a single weekday
for (let c = 0; c < 7; c++) assert.equal(new Set(grid.filter((_, i) => i % 7 === c).map((x) => weekdayIndex(x.key))).size, 1);
// when today is a Sunday the week is complete, nothing is in the future
assert.equal(calendarGrid("2026-10-11").filter((c) => c.future).length, 0);
// when today is a Monday, six days are still to come
assert.equal(calendarGrid("2026-10-05").filter((c) => c.future).length, 6);

// ---- colour levels
assert.deepEqual([0, 1, 7, 8, 15, 16, 29, 30, 80].map((n) => dayLevel(n)), [0, 1, 1, 2, 2, 3, 3, 4, 4]);
assert.equal(dayLevel(undefined), 0);
assert.equal(dayLevel(undefined, true), 1);   // trained, but no answer count recorded
assert.equal(dayLevel(0, true), 1);

// ---- summary: only past days count, runs break on a missed day
const stats = {
  "2026-09-30": { xp: 10, correct: 5, total: 8 },
  "2026-10-01": { xp: 10, correct: 5, total: 8 },
  "2026-10-03": { xp: 10, correct: 5, total: 8 },
  "2026-10-04": { xp: 10, correct: 5, total: 8 },
  "2026-10-05": { xp: 10, correct: 5, total: 8 },
  "2026-10-09": { xp: 99, correct: 9, total: 99 }, // future: must be ignored
};
const s = summarise(grid, stats, new Set(["2026-10-06"]));
assert.deepEqual(s, { days: 6, longest: 4, answers: 40 }); // 3-4-5-6 Oct is the longest run
assert.deepEqual(summarise(grid, undefined, new Set()), { days: 0, longest: 0, answers: 0 });

// ---- labels
assert.equal(dateLabel("2026-10-06"), "Tue, Oct 6");
assert.equal(rangeLabel(grid), "Sep 7 – Oct 6");

console.log("consistency tests passed");
