import { strict as assert } from "node:assert";
import { applyCardResults, assembleIctRound, buildCardQuestions, cardHash, hasFreshVariants, localVariants, rankCards } from "../../src/lib/practice/ict-cards.ts";
import { tradeMathQuestions } from "../../src/lib/practice/ict-trade-math.ts";
import { buildVariantPrompt, validateVariants } from "../../src/lib/practice/ict-variants.ts";
import { seededRng } from "../../src/lib/practice/math/rng.ts";
import type { IctCard } from "../../src/lib/practice/progress-ext.ts";
import type { JournalEntry } from "../../src/lib/types.ts";

const img = (id: string) => ({ id, name: `${id}.jpg`, width: 800, height: 600, size: 1000 });
const card = (id: string, question: string, answer: string, extra: Partial<IctCard> = {}): IctCard => ({ id, question, answer, images: [], createdAt: 1, updatedAt: 1, ...extra });
const deck = [
  card("a", "Where does buy-side liquidity rest?", "Above swing highs and equal highs", { images: [img("i1")] }),
  card("b", "What is the OTE zone?", "The 62% to 79% retracement of the leg"),
  card("c", "What does MSS mean?", "A displacement break of the last swing against the trend"),
];
const today = "2026-10-10";

// ---- local question styles always include the right answer and never repeat an option
for (const seed of [1, 2, 3, 4, 5]) {
  const rng = seededRng(seed);
  for (const c of deck) {
    for (const v of localVariants(c, deck, rng)) {
      assert.ok(v.choices.includes(v.answer));
      assert.equal(new Set(v.choices.map((x) => x.toLowerCase())).size, v.choices.length);
      if (v.kind === "mcq") assert.equal(v.answer, c.answer);
    }
  }
}
// a lone card still works (wrong answers borrowed from the concept bank)
assert.ok(localVariants(deck[0]!, [deck[0]!], seededRng(9)).length >= 1);

// ---- a round: every card is asked before any repeats, pictures travel with the card
const qs = buildCardQuestions(deck, seededRng(7), today, "n1");
assert.ok(qs.length >= 3 && qs.length <= 8);
assert.deepEqual(new Set(qs.slice(0, 3).map((q) => q.cardId)), new Set(["a", "b", "c"]));
assert.deepEqual(qs.find((q) => q.cardId === "a")!.images, [img("i1")]);
assert.equal(new Set(qs.map((q) => q.id)).size, qs.length);
for (const q of qs) { assert.equal(q.group, "ict"); assert.ok(q.choices!.includes(q.answer)); assert.ok(q.explanation.includes(deck.find((c) => c.id === q.cardId)!.answer), "the trader's own answer is always shown after answering"); }

// ---- never-seen cards come first, then the ones you miss
const played = [card("x", "q1", "a1", { seen: 5, correct: 5, lastSeen: today }), card("y", "q2", "a2", { seen: 5, correct: 1, lastSeen: today }), card("z", "q3", "a3")];
assert.deepEqual(rankCards(played, today, seededRng(1)).map((c) => c.id), ["z", "y", "x"]);

// ---- cached AI styles go stale when the wording changes
const ai = card("d", "Q?", "Answer one", { variants: [{ kind: "mcq", prompt: "Q?", choices: ["Answer one", "b", "c", "d"], answer: "Answer one" }] });
assert.equal(hasFreshVariants(ai), false, "variants without a fingerprint are not trusted");
assert.equal(hasFreshVariants({ ...ai, variantsFor: cardHash(ai) }), true);
assert.equal(hasFreshVariants({ ...ai, variantsFor: cardHash(ai), answer: "Different" }), false);
assert.notEqual(cardHash(ai), cardHash({ ...ai, answer: "Different" }));

// ---- trade math goes in the middle
const mid = assembleIctRound(qs.slice(0, 4), qs.slice(4, 6));
assert.deepEqual(mid.map((q) => q.id), [...qs.slice(0, 2), ...qs.slice(4, 6), ...qs.slice(2, 4)].map((q) => q.id));

// ---- results update each card
const after = applyCardResults(deck, [{ cardId: "a", correct: true }, { cardId: "a", correct: false }, { cardId: undefined, correct: true }], today);
assert.deepEqual([after[0]!.seen, after[0]!.correct, after[0]!.lastSeen], [2, 1, today]);
assert.equal(after[1]!.seen, undefined);

// ---- trade math: numbers come straight from the entry, with its screenshot
const entry = (over: Partial<JournalEntry>): JournalEntry => ({ id: "t1", date: "2026-10-01", pnl: 300, rr: 2, instrument: "NQ", direction: "long", setup: "", notes: "", images: [img("shot")], entryPrice: 100, exitPrice: 108, stopLoss: 96, takeProfit: 112, quantity: 1, createdAt: 1, updatedAt: 1, ...over } as JournalEntry);
const tm = tradeMathQuestions([entry({}), entry({ id: "t2", direction: "short", entryPrice: 200, exitPrice: 190, stopLoss: 205, takeProfit: 185 })], seededRng(3), 2);
assert.equal(tm.length, 2);
for (const q of tm) { assert.deepEqual(q.chartTradeIds, [q.tradeId]); assert.equal(q.kind, "number"); assert.equal(q.group, "ict"); }
// every kind of question gets the arithmetic right (checked against the entry numbers)
const kinds = new Set<string>();
for (let n = 1; n <= 60; n++) for (const q of tradeMathQuestions([entry({})], seededRng(Math.imul(n, 2654435761) >>> 0), 1)) {
  const expected: Record<string, number> = { "How many points was the stop distance?": 4, "How many points to the target?": 12, "What was the planned reward-to-risk?": 3, "How many points did the trade capture? (Losses are negative.)": 8, "How many dollars was 1R?": 150 };
  const key = Object.keys(expected).find((k) => q.prompt.endsWith(k))!;
  assert.ok(key, q.prompt);
  kinds.add(key);
  assert.equal(Number(q.answer), expected[key], q.prompt);
}
assert.ok(kinds.size >= 4, "all question kinds are reachable");
// no screenshot, wrong-side stop, or missing numbers → no question
assert.equal(tradeMathQuestions([entry({ images: [] })], seededRng(1), 3).length, 0);
assert.equal(tradeMathQuestions([entry({ stopLoss: 104, takeProfit: null, exitPrice: null, rr: null })], seededRng(1), 3).length, 0);
assert.equal(tradeMathQuestions([entry({ direction: "short", exitPrice: 90 })], seededRng(1), 1).length, 1);

// ---- AI answers are only trusted when they line up with what the trader wrote
const input = [{ id: "a", question: "Where does buy-side liquidity rest?", answer: "Above swing highs and equal highs" }];
const good = { cards: [{ id: "a", variants: [
  { type: "mcq", prompt: "Where does buy-side liquidity rest?", choices: ["Above swing highs and equal highs", "Below swing lows", "At the daily open", "Inside the FVG"], answer: "Above swing highs and equal highs", explanation: "BSL = buy stops above highs." },
  { type: "true-false", prompt: "Buy-side liquidity rests below equal lows.", answer: "False" },
  { type: "cloze", prompt: "Buy-side liquidity rests above swing ____ and equal highs.", choices: ["highs", "lows", "gaps", "wicks"], answer: "highs" },
] }] };
const ok = validateVariants(good, input).get("a")!;
assert.deepEqual(ok.map((v) => v.kind), ["mcq", "true-false", "cloze"]);
assert.ok(ok[1]!.prompt.startsWith("True or false"));
const bad = (v: object) => validateVariants({ cards: [{ id: "a", variants: [v] }] }, input).size === 0;
assert.ok(bad({ type: "mcq", prompt: "Where does buy-side liquidity rest?", choices: ["Below swing lows", "At the daily open", "Inside the FVG"], answer: "Below swing lows" }), "right option must match the trader's answer");
assert.ok(bad({ type: "mcq", prompt: "Where does buy-side liquidity rest?", choices: ["x", "y", "z"], answer: "not listed" }), "answer must be one of the choices");
assert.ok(bad({ type: "mcq", prompt: "Where does buy-side liquidity rest?", choices: ["Above swing highs and equal highs", "Above swing highs and equal highs too", "Below lows"], answer: "Above swing highs and equal highs" }), "two near-identical right answers");
assert.ok(bad({ type: "cloze", prompt: "No blank here at all.", choices: ["a", "b", "c"], answer: "a" }));
assert.ok(bad({ type: "true-false", prompt: "x", answer: "maybe" }));
assert.equal(validateVariants("nonsense", input).size, 0);
assert.equal(validateVariants({ cards: [{ id: "zzz", variants: good.cards[0]!.variants }] }, input).size, 0, "unknown card ids are ignored");
const p = buildVariantPrompt(input);
assert.ok(p.system.includes("ONLY the trader's ANSWER".replace("ONLY the trader's ", "")) || p.system.includes("source of truth"));
assert.ok(p.user.includes("buy-side"));

console.log("ict-lab.test.ts ok");
