import { strict as assert } from "node:assert";
import { brief, feedbackDwellMs } from "../../src/lib/practice/pacing.ts";

// ---- right answers move on fast, faster in a flow
assert.equal(feedbackDwellMs({ correct: true, combo: 1 }), 520);
assert.equal(feedbackDwellMs({ correct: true, combo: 3 }), 380);
assert.ok(feedbackDwellMs({ correct: true, combo: 5 }) < feedbackDwellMs({ correct: true, combo: 1 }));

// ---- wrong answers wait, scaled to the reading, inside fixed bounds
assert.equal(feedbackDwellMs({ correct: false, combo: 0 }), 1400);
const short = feedbackDwellMs({ correct: false, combo: 0, explanation: "Risk was one R." });
const long = feedbackDwellMs({ correct: false, combo: 0, explanation: "Your stop was moved after entry, so the realised loss was larger than the planned one by almost double the original risk." });
assert.ok(short >= 1400 && long <= 2600 && long > short);
assert.equal(feedbackDwellMs({ correct: false, combo: 0, explanation: "word ".repeat(500) }), 2600);

// ---- brief(): first sentence, readable length
assert.equal(brief(undefined), "");
assert.equal(brief("  "), "");
assert.equal(brief("Risk was one R. The rest is detail."), "Risk was one R.");
assert.equal(brief("No full stop here"), "No full stop here");
assert.equal(brief("Price 1.0850 held. Next."), "Price 1.0850 held.");
const clipped = brief("a ".repeat(200) + "end.", 60);
assert.ok(clipped.length <= 60 && clipped.endsWith("…"));

console.log("pacing tests passed");
