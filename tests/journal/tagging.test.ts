import { strict as assert } from "node:assert";
import type { JournalEntry, TradePlan } from "../../src/lib/types.ts";
import { mistakeOf, mistakeTagsOf, needsTagReview, classifyLocal } from "../../src/lib/mistakes.ts";
import { buildBundle, hasWords, type TagBundle, type TagInputs } from "../../src/lib/tagging/evidence.ts";
import { decide, scanBundle } from "../../src/lib/tagging/policy.ts";
import { groundRun, normalise, readModelAnswer, sanitizeBundle, systemPrompt, type ModelRun } from "../../src/lib/tagging/prompt.ts";
import { scanSources, scanText, type ScanSource, type SourceRole } from "../../src/lib/tagging/rules.ts";
import { GOLDEN, type GoldenField } from "./tagging-golden.ts";

let n = 0;
const entry = (extra: Partial<JournalEntry> = {}): JournalEntry => ({ id: `t${++n}`, date: "2026-10-06", pnl: -120, rr: null, instrument: "MNQ", direction: "long", setup: "", notes: "", images: [], createdAt: n, updatedAt: n, ...extra } as JournalEntry);
const plan = (extra: Partial<TradePlan> = {}): TradePlan => ({ id: `p${++n}`, date: "2026-10-06", thesis: "Sweep then reverse", rules: [], status: "executed", createdAt: 1, updatedAt: 1, ...extra });

const ROLE: Record<GoldenField, SourceRole> = { name: "mistake-name", detail: "mistake-detail", poorly: "went-poorly", cause: "cause", lesson: "lesson", improve: "improve", well: "went-well" };
const RULES_MIN = 2;

/* ------------------------------------------------------------------------------------------------------------------ */
/* 1. Offline rules against the golden set                                                                            */
/* ------------------------------------------------------------------------------------------------------------------ */
{
  let tagged = 0, correct = 0, forbidden = 0, silentBroken = 0;
  const misses: string[] = [];
  for (const g of GOLDEN) {
    const sources: ScanSource[] = (Object.entries(g.text) as [GoldenField, string][]).filter(([, t]) => t).map(([f, t], i) => ({ id: `s${i + 1}`, role: ROLE[f], text: t }));
    const top = scanSources(sources).scores.filter((s) => s.score >= RULES_MIN);
    const predicted = top[0]?.key ?? null;
    // The hard guarantee: nothing the reviewer called wrong may ever be offered, in ANY position.
    for (const bad of g.forbid ?? []) if (top.some((s) => s.key === bad)) { forbidden++; misses.push(`${g.id}: offered forbidden "${bad}" (${g.why})`); }
    if (g.rules === "silent") { if (predicted) { silentBroken++; misses.push(`${g.id}: should be silent, said "${predicted}"`); } continue; }
    tagged++;
    if (predicted === g.primary || (predicted && g.alsoOk?.includes(predicted))) correct++;
    else misses.push(`${g.id}: wanted ${g.primary}, got ${predicted}`);
  }
  assert.deepEqual(misses, [], "golden set mismatches:\n" + misses.join("\n"));
  assert.equal(forbidden, 0);
  assert.equal(silentBroken, 0);
  assert.equal(correct, tagged);
  console.log(`  ✓ offline rules vs golden set: ${correct}/${tagged} explicit cases right, ${GOLDEN.length - tagged} deliberately left to AI/human, 0 forbidden tags`);
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* 2. Language: negation, regret, tense, role                                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */
{
  const one = (role: SourceRole, text: string) => scanText({ id: "s1", role, text });
  assert.equal(one("mistake-detail", "I did NOT chase this time").find((h) => h.key === "chased")?.negated, true);
  assert.equal(one("mistake-detail", "I should NOT have moved my stop").find((h) => h.key === "stop")?.negated, false, "regret keeps the mistake");
  assert.equal(one("mistake-detail", "traded without checking the news").find((h) => h.key === "news")?.negated, false, "'without' is not a denial");
  assert.equal(one("mistake-detail", "I never traded the news").find((h) => h.key === "news")?.negated, true);
  assert.equal(one("lesson", "Never chase again").find((h) => h.key === "chased")?.negated, false, "in a lesson, 'never X' means X happened");
  assert.equal(one("lesson", "Wait for the sweep next time").find((h) => h.key === "early")?.negated, false);
  assert.equal(one("mistake-detail", "Wait for the sweep next time").find((h) => h.key === "early"), undefined, "advice is not read in a backward-looking field");
  assert.equal(one("went-well", "Waited for the sweep").find((h) => h.key === "early")?.negated, true, "went-well can only cancel");
  assert.equal(one("went-well", "Chased it and it worked").find((h) => h.key === "chased"), undefined, "went-well never creates a tag");
  // a hit always carries an exact quote of the source
  const text = "Honestly the setup was fine but I moved my stop after price spiked. Then it hit.";
  for (const h of one("mistake-detail", text)) assert.ok(text.includes(h.quote), h.quote);
  // the original callers still work, and now respect negation
  assert.equal(classifyLocal("Ignored CPI and traded anyway").key, "news");
  assert.equal(classifyLocal("I did NOT chase this time, waited for the retest").key, "other");
  assert.equal(classifyLocal("No FOMO today, calm entry").key, "other");
  assert.equal(classifyLocal("Was feeling great and took a bigger position than usual").key, "size");
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* 3. Bundle: every field, once, with its role                                                                        */
/* ------------------------------------------------------------------------------------------------------------------ */
const draftOf = (extra: Partial<TagInputs> = {}): TagInputs => ({ mistake: "other", mistakeOther: "Ignored news", mistakeNote: "Jumped in as CPI printed and got chopped.", lesson: "Check the calendar before the open", followedPlan: false, ...extra });
const bundleFor = (e: JournalEntry, inputs: TagInputs, entries = [e], plans: TradePlan[] = []) => buildBundle(e, entries, plans, inputs);
{
  const e = entry({
    notes: "entry 9:35 AM NY", reflection: { wentWell: "Sized correctly", wentPoorly: "Chased the first candle", cause: "Impatience", followedSetup: false, followedRisk: true, lesson: "Check the calendar before the open", updatedAt: 1 },
    review: { concepts: { used: [], improve: "Read the red-folder list the night before", learned: "News widens spreads" }, followUp: { watchNext: "FOMO after a missed move", conceptMisunderstood: "Thought CPI was low impact", biggestMistake: "Check the calendar before the open" }, plannedVsActual: { deviations: "Skipped the news check" }, postLossGate: { immediateThoughts: "I need that back", intendedNextAction: "Trade again at once", acknowledgedAt: 1 }, psychology: { notes: "Felt rushed" } },
    entryPrice: 100, stopLoss: 95, takeProfit: 115, exitPrice: 110, preTradeChecklist: [{ label: "News checked", confirmed: false }, { label: "Bias set", confirmed: true }],
  });
  const b = bundleFor(e, draftOf());
  const roles = b.sources.map((s) => s.role);
  for (const r of ["mistake-name", "mistake-detail", "went-poorly", "cause", "deviation", "post-loss", "psych-note", "lesson", "improve", "watch-next", "went-well", "note"] as SourceRole[]) assert.ok(roles.includes(r), `missing role ${r}: ${roles.join()}`);
  assert.equal(b.sources.filter((s) => s.text === "Check the calendar before the open").length, 1, "same lesson stored in two places counts once");
  assert.equal(b.sources.find((s) => s.role === "went-well")?.text, "Sized correctly");
  assert.ok(b.facts.some((f) => f.code === "rules-unconfirmed" && f.text.includes("News checked")));
  assert.ok(b.facts.some((f) => f.code === "planned-rr" && f.text.includes("3R")), b.facts.map((f) => f.text).join(" | "));
  assert.ok(b.facts.some((f) => f.code === "target-reached" && f.text.includes("67%")));
  assert.equal(b.declared.mistake, "other");
  assert.ok(new Set(b.sources.map((s) => s.id)).size === b.sources.length);
  assert.ok(hasWords(b));
  // "none" never feeds the mistake-detail field; an empty trade has no words
  assert.ok(!bundleFor(entry(), { mistake: "none", mistakeNote: "ignored" }).sources.some((s) => s.role === "mistake-detail"));
  assert.equal(hasWords(bundleFor(entry(), { mistake: "none" })), false);
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* 4. Grounding: a quote must really be in the trader's words                                                         */
/* ------------------------------------------------------------------------------------------------------------------ */
const mk = (text: Partial<Record<GoldenField, string>>, declared = "other", extra: Partial<TagInputs> = {}) => {
  const e = entry({ reflection: text.poorly || text.well || text.cause ? { wentPoorly: text.poorly, wentWell: text.well, cause: text.cause, followedSetup: null, followedRisk: null, updatedAt: 1 } : undefined });
  return bundleFor(e, { mistake: declared, mistakeOther: text.name, mistakeNote: text.detail, lesson: text.lesson, ...extra });
};
const ai = (model: string, b: TagBundle, key: string, quote: string, src = "s1"): ModelRun => groundRun(model, { tags: [{ key, evidence: [{ src, quote }] }] }, b);
{
  const b = mk({ detail: "Took the long before the 5m closed above, scared it would run without me", well: "No FOMO today, calm entry" });
  assert.equal(ai("m", b, "early", "before the 5m closed above").tags.length, 1);
  assert.equal(ai("m", b, "early", "BEFORE the 5m   closed above!").tags.length, 1, "quotes survive case, spacing and punctuation");
  const fake = ai("m", b, "early", "entered before the sweep completed");
  assert.deepEqual([fake.tags.length, fake.dropped], [0, 1], "a quote that is not in the text is thrown away with its tag");
  assert.equal(ai("m", b, "early", "before the 5m closed above", "s9").tags[0]?.evidence[0]?.src, "s1", "wrong source number is repaired");
  assert.equal(ai("m", b, "fomo", "No FOMO today").tags.length, 0, "went-well text can never support a mistake");
  assert.equal(groundRun("m", { tags: [{ key: "teleported", evidence: [{ src: "s1", quote: "before the 5m closed above" }] }] }, b).tags.length, 0, "unknown key");
  assert.equal(groundRun("m", { tags: [{ key: "early", evidence: [] }] }, b).tags.length, 0, "no evidence, no tag");
  const dn = mk({ detail: "No FOMO today, I did not chase, entered on the plan" });
  assert.equal(ai("m", dn, "fomo", "No FOMO today").tags.length, 0, "a quote the rules read as a denial cannot back that tag");
  assert.equal(ai("m", dn, "chased", "I did not chase").tags.length, 0);
  // raw model text with fences and chatter
  const raw = 'Sure!\n```json\n{"tags":[{"key":"Entered early","evidence":[{"src":"s1","quote":"before the 5m closed above"}]}],"unclear":""}\n```';
  assert.equal(readModelAnswer("m", raw, b)?.tags[0]?.key, "early", "a label is accepted as a key");
  assert.equal(readModelAnswer("m", "I cannot help with that", b), null);
  assert.ok(normalise("It’s  “fine”!") === "it's fine");
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* 5. Policy — what is filed, what is only suggested                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */
{
  const detail = "Took it before the sweep happened, wasn't patient";
  const b = mk({ detail });
  const quote = "Took it before the sweep happened";

  // AI + rules agree → filed.
  let d = decide(b, [ai("modelA", b, "early", quote)]);
  assert.equal(d.tagging.verdict, "filed"); assert.equal(d.tags[0]?.key, "early"); assert.equal(d.tags[0]?.source, "ai");
  assert.ok(d.tags[0]!.evidence.some((e) => detail.includes(e.quote)), "evidence is the trader's own words");

  // AI down: one rules voter on a single field is only a suggestion — never silently filed.
  d = decide(b, []);
  assert.equal(d.tagging.verdict, "suggested"); assert.equal(d.tags.length, 0); assert.equal(d.tagging.degraded, true);
  assert.equal(d.tagging.suggestions[0]?.key, "early");

  // The trader NAMED it in words the rules recognise outright → even offline it is filed.
  const named = mk({ name: "Entered before confirmation", detail: "Saw the wick and jumped in" });
  d = decide(named, []);
  assert.equal(d.tagging.verdict, "filed"); assert.equal(d.tags[0]?.key, "early"); assert.equal(d.tags[0]?.source, "rules");

  // Two fields of the trader's own words agree (detail + lesson) → filed offline.
  d = decide(mk({ detail: "Entered before the close of the candle", lesson: "Wait for the close next time" }), []);
  assert.equal(d.tagging.verdict, "filed"); assert.equal(d.tags[0]?.key, "early");

  // Two models disagree, rules silent → both suggested, nothing filed.
  const vague = mk({ detail: "Entered at a bad spot and it went against me" });
  d = decide(vague, [ai("A", vague, "early", "Entered at a bad spot"), ai("B", vague, "chased", "bad spot and it went against me")]);
  assert.equal(d.tagging.verdict, "suggested"); assert.equal(d.tags.length, 0); assert.equal(d.tagging.suggestions.length, 2);

  // Two models agree, rules silent → filed (consensus of independent voters).
  d = decide(vague, [ai("A", vague, "early", "Entered at a bad spot"), ai("B", vague, "early", "bad spot")]);
  assert.equal(d.tagging.verdict, "filed"); assert.equal(d.tags[0]?.voters.length, 2);

  // A contradiction in the trader's own words caps it at "suggested" even with two voters.
  const contra = mk({ poorly: "Entered early at the open, took the signal", well: "Waited for the sweep and was patient" });
  d = decide(contra, [ai("A", contra, "early", "Entered early at the open")]);
  assert.equal(d.tags.length, 0, "went-well says they waited for the sweep: do not file");
  assert.equal(d.tagging.suggestions[0]?.key, "early");

  // Every model that answered declined to tag → rules alone must be much surer to even suggest.
  const abstain: ModelRun = { model: "A", tags: [], unclear: "clean process", dropped: 0 };
  d = decide(b, [abstain]);
  assert.equal(d.tags.length, 0); assert.equal(d.tagging.suggestions.length, 0, "AI abstained and rules were only moderately sure");

  // No model, no rules, no data → "unsure", never a guess.
  assert.equal(decide(mk({ detail: "asdf qwer" }), []).tagging.verdict, "unsure");

  // Fabricated or ungrounded AI answers carry no weight.
  d = decide(vague, [ai("A", vague, "revenge", "I was angry and wanted it back")]);
  assert.equal(d.tagging.verdict, "unsure");
}
{
  // The trader's own pick is final; machine agreement may add a secondary tag and warn about a likely mis-tap.
  const b = mk({ detail: "I chased the move, bought after it had already run" }, "size");
  const d = decide(b, [ai("A", b, "chased", "bought after it had already run")]);
  assert.equal(d.tags[0]?.key, "size"); assert.equal(d.tags[0]?.source, "preset"); assert.equal(d.tags[0]?.primary, true);
  assert.equal(d.tags.find((t) => t.key === "chased")?.primary, false);
  assert.deepEqual([d.tagging.conflict?.declared, d.tagging.conflict?.better], ["size", "chased"]);
  assert.ok(d.tagging.conflict?.quote);

  // …but if the pick has support in the text, no conflict is raised.
  const ok = mk({ detail: "Took 4 contracts instead of 2, then I also chased" }, "size");
  assert.equal(decide(ok, [ai("A", ok, "chased", "then I also chased")]).tagging.conflict, undefined);

  // A category picked by hand is never overridden.
  const hand = mk({ name: "Panic after a loss", detail: "Afraid it would run without me" }, "other", { pickedCategory: "revenge" });
  const dh = decide(hand, [ai("A", hand, "fomo", "Afraid it would run without me")]);
  assert.equal(dh.tags[0]?.key, "revenge"); assert.equal(dh.tags[0]?.source, "you"); assert.equal(dh.tags[0]?.support, 1);
  assert.equal(dh.tags.find((t) => t.key === "fomo")?.primary, false, "two independent voters agree on FOMO: filed as secondary, never as primary");
  const lone = mk({ name: "Panic after a loss", detail: "Entered at a bad spot" }, "other", { pickedCategory: "revenge" });
  const dl = decide(lone, [ai("A", lone, "early", "Entered at a bad spot")]);
  assert.deepEqual(dl.tags.map((t) => t.key), ["revenge"]);
  assert.ok(dl.tagging.suggestions.some((s) => s.key === "early"), "one voter disagreeing is offered, not imposed");

  // "No mistake" is the trader's call: the machine can only ask.
  const none = mk({ poorly: "Entered before the sweep happened" }, "none");
  const dn = decide(none, [ai("A", none, "early", "Entered before the sweep happened")]);
  assert.equal(dn.tags.length, 0); assert.equal(dn.tagging.suggestions[0]?.key, "early"); assert.equal(dn.tagging.verdict, "suggested");
  assert.equal(decide(mk({}, "none"), []).tagging.verdict, "none");

  // A generic cause explains WHY, so a concrete behaviour wins the primary slot.
  const mix = mk({ detail: "I was frustrated and tilted, so I entered before confirmation" });
  const dm = decide(mix, [ai("A", mix, "tilt", "frustrated and tilted"), ai("B", mix, "tilt", "tilted"), ai("C", mix, "early", "entered before confirmation")]);
  assert.equal(dm.tags[0]?.key, "early"); assert.ok(dm.tags.some((t) => t.key === "tilt" && !t.primary));

  // At most three filed tags.
  const many = mk({ detail: "Chased after the move, entered before confirmation, took 4 contracts instead of 2, ignored the news and then revenge traded" });
  const dd = decide(many, [ai("A", many, "chased", "Chased after the move"), ai("B", many, "chased", "Chased"), ai("A2", many, "early", "entered before confirmation"), ai("B2", many, "early", "before confirmation")]);
  assert.ok(dd.tags.length <= 3);
}
{
  // Measured facts: a data voter plus the trader's words files a tag; a data fact alone only asks.
  const e = entry({ entryTime: "14:05" });
  const p = plan({ newsEvents: [{ name: "FOMC", time: "14:00" }] });
  const withWords = bundleFor(e, { mistake: "other", mistakeOther: "Traded the announcement" }, [e], [p]);
  assert.ok(withWords.facts.some((f) => f.key === "news" && f.objective));
  const d = decide(withWords, []);
  assert.equal(d.tags[0]?.key, "news"); assert.ok(d.tags[0]!.voters.includes("data") && d.tags[0]!.voters.includes("rules"));
  const factOnly = bundleFor(e, { mistake: "other" }, [e], [p]);
  const df = decide(factOnly, []);
  assert.equal(df.tags.length, 0); assert.equal(df.tagging.suggestions[0]?.key, "news");
  // …and the support number comes from agreement, never from a model
  assert.ok(d.tags[0]!.support > df.tagging.suggestions[0]!.support);
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* 6. Safety: the route's inputs and the prompt                                                                       */
/* ------------------------------------------------------------------------------------------------------------------ */
{
  const b = mk({ detail: "Entered before the sweep happened" });
  assert.deepEqual(sanitizeBundle(JSON.parse(JSON.stringify(b)))?.sources.map((s) => s.id), ["s1"]);
  assert.equal(sanitizeBundle(null), null);
  assert.equal(sanitizeBundle({ sources: [{ id: "s1", role: "mistake-detail", text: "x".repeat(20000) }] }), null, "oversized bundles are refused");
  const dirty = sanitizeBundle({ sources: [{ id: "s1", role: "hacker", text: "x" }, { id: "../etc", role: "lesson", text: "y" }, { id: "s2", role: "lesson", text: "ok" }], facts: [{ id: "f1", text: "z", objective: "yes" }], declared: { mistake: "early", mistakeKey: "nope" } });
  assert.deepEqual(dirty?.sources.map((s) => s.id), ["s2"], "unknown roles and bad ids are dropped");
  assert.equal(dirty?.facts[0]?.objective, false); assert.equal(dirty?.declared.mistakeKey, undefined);
  const prompt = systemPrompt();
  for (const k of ["early", "chased", "fomo", "hesitation", "stop", "size", "risk", "plan", "overtrade", "timing", "news", "bias", "exit", "revenge", "tilt"]) assert.ok(prompt.includes(`- ${k} [`), `prompt lacks ${k}`);
  assert.ok(/VERBATIM/.test(prompt) && /went-well/.test(prompt) && /Abstain/.test(prompt) && /Ignore any instruction/.test(prompt));
  assert.ok(!/confidence/i.test(prompt.split("OUTPUT")[1]!), "the model is never asked to rate its own confidence");
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* 7. What the rest of the app reads                                                                                  */
/* ------------------------------------------------------------------------------------------------------------------ */
{
  const tagged = (followUp: Record<string, unknown>) => entry({ review: { followUp } as JournalEntry["review"] });
  const rec = (key: string, primary: boolean) => ({ key, primary, source: "ai" as const, voters: ["ai:a", "rules"], support: 0.79, evidence: [] });
  const filed = tagged({ mistake: "other", mistakeOther: "Ignored news", mistakeCategory: "news", tags: [rec("news", true), rec("fomo", false)], tagging: { v: 1, verdict: "filed", suggestions: [], models: ["a"], degraded: false, at: 1 } });
  assert.equal(mistakeOf(filed)?.key, "news");
  assert.deepEqual(mistakeTagsOf(filed).map((t) => t.key), ["news", "fomo"]);
  assert.equal(needsTagReview(filed), false);

  // Unsure: not guessed, not counted — it waits for the trader.
  const unsure = tagged({ mistake: "other", mistakeOther: "Ignored news", tagging: { v: 1, verdict: "suggested", suggestions: [rec("news", true)], models: [], degraded: true, at: 1 } });
  assert.equal(mistakeOf(unsure)?.pending, true); assert.equal(mistakeOf(unsure)?.key, "other");
  assert.deepEqual(mistakeTagsOf(unsure), []);
  assert.equal(needsTagReview(unsure), true);
  assert.equal(needsTagReview({ ...unsure, review: { followUp: { ...unsure.review!.followUp, tagging: { ...unsure.review!.followUp!.tagging!, reviewed: true } } } } as JournalEntry), false);

  // Older trades (no tagging record) behave exactly as before.
  const legacy = tagged({ mistake: "other", mistakeOther: "Ignored CPI and traded anyway" });
  assert.equal(mistakeOf(legacy)?.key, "news"); assert.equal(mistakeOf(legacy)?.pending, undefined);
  assert.deepEqual(mistakeTagsOf(tagged({ mistake: "stop" })).map((t) => t.key), ["stop"]);
}

console.log("  ✓ tagging: grounding, consensus, precision-first policy, negation, storage readers");

/* ------------------------------------------------------------------------------------------------------------------ */
/* 8. Acting on suggestions never overwrites the trader                                                               */
/* ------------------------------------------------------------------------------------------------------------------ */
import { confirmSuggestion, dismissSuggestions, mergeRecheck } from "../../src/lib/tagging/apply.ts";
import { inputsFromEntry } from "../../src/lib/tagging/evidence.ts";
{
  const sug = (key: string) => ({ key, primary: false, source: "ai" as const, voters: ["ai:a"], support: 0.62, evidence: [{ src: "s1", role: "mistake-detail", quote: "x" }] });
  const f0 = { mistake: "other", mistakeOther: "x", tagging: { v: 1 as const, verdict: "suggested" as const, suggestions: [sug("early"), sug("fomo")], conflict: { declared: "other", better: "early" }, models: ["a"], degraded: false, at: 1 } };
  const f1 = confirmSuggestion(f0, "early");
  assert.equal(f1.mistakeCategory, "early"); assert.equal(f1.mistakeCategorySource, "you"); assert.equal(f1.tags?.[0]?.primary, true); assert.equal(f1.tags?.[0]?.confirmed, true);
  assert.deepEqual(f1.tagging?.suggestions.map((s) => s.key), ["fomo"]); assert.equal(f1.tagging?.verdict, "filed"); assert.equal(f1.tagging?.conflict, undefined);
  const f2 = confirmSuggestion(f1, "fomo");
  assert.deepEqual(f2.tags?.map((t) => [t.key, t.primary]), [["early", true], ["fomo", false]], "a second confirm becomes secondary");
  assert.equal(f2.tagging?.reviewed, true);
  assert.equal(dismissSuggestions(f0).tagging?.reviewed, true); assert.equal(dismissSuggestions(f0).tagging?.suggestions.length, 0);
  assert.equal(confirmSuggestion({ mistake: "other" }, "stop").tags?.[0]?.key, "stop", "works with no tagging record at all");

  // Re-check keeps what the trader owns, replaces machine tags, and files nothing new on one voter.
  const own = { key: "revenge", primary: true, source: "you" as const, voters: ["you"], support: 1, evidence: [], confirmed: true };
  const machine = { key: "early", primary: false, source: "ai" as const, voters: ["ai:a", "rules"], support: 0.79, evidence: [] };
  const saved = { mistake: "other", mistakeCategory: "revenge", mistakeCategorySource: "you" as const, tags: [own, machine] };
  const b = mk({ detail: "Entered at a bad spot" }, "other");
  const redo = mergeRecheck(saved, { tags: [], tagging: { v: 1, verdict: "suggested", suggestions: [{ ...machine, voters: ["ai:b"], support: 0.62 }], models: ["b"], degraded: false, at: 2 } });
  assert.deepEqual(redo.tags?.map((t) => t.key), ["revenge"], "the old machine tag goes, the trader's stays");
  assert.equal(redo.mistakeCategory, "revenge"); assert.equal(redo.tagging?.suggestions[0]?.key, "early");
  void b;
  // …and a saved manual pick is carried into the next check
  assert.equal(inputsFromEntry(entry({ review: { followUp: saved } as JournalEntry["review"] })).pickedCategory, "revenge");
  assert.equal(inputsFromEntry(entry({ review: { followUp: { mistake: "early", mistakeCategory: "early", mistakeCategorySource: "preset" } } as JournalEntry["review"] })).pickedCategory, undefined);
}
console.log("  ✓ tagging: confirm / dismiss / re-check never overwrite the trader");
