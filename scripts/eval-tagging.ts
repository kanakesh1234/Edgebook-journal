/**
 * Measures the tagger against tests/journal/tagging-golden.ts.
 *
 *   npm run eval:tagging            offline: rules + data only (no network)
 *   OPENROUTER_API_KEY=… npm run eval:tagging   live: also asks MINATO_MODEL and MINATO_FALLBACK_MODEL, exactly like the route
 *
 * Reports what matters for trust: of the tags that would be FILED, how many are right (precision), how many wrong
 * ones slipped through (must be 0), and how much is left as a suggestion for the trader (the price of precision).
 */
import type { JournalEntry } from "../src/lib/types.ts";
import { buildBundle } from "../src/lib/tagging/evidence.ts";
import { decide, scanBundle } from "../src/lib/tagging/policy.ts";
import { readModelAnswer, systemPrompt, userPayload, type ModelRun } from "../src/lib/tagging/prompt.ts";
import { GOLDEN } from "../tests/journal/tagging-golden.ts";

const key = process.env.OPENROUTER_API_KEY;
const models = key ? [...new Set([process.env.MINATO_MODEL ?? "nvidia/nemotron-3-super-120b-a12b:free", process.env.MINATO_FALLBACK_MODEL ?? "z-ai/glm-5.2:free"])] : [];

async function ask(model: string, bundle: ReturnType<typeof buildBundle>): Promise<ModelRun | null> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST", signal: AbortSignal.timeout(30_000), headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, temperature: 0, max_tokens: 500, response_format: { type: "json_object" }, messages: [{ role: "system", content: systemPrompt() }, { role: "user", content: userPayload(bundle) }] }),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return readModelAnswer(model, j.choices?.[0]?.message?.content ?? "", bundle);
  } catch { return null; }
}

let n = 0;
let filed = 0, filedRight = 0, wrong: string[] = [], suggestedOnly = 0, unsure = 0, truthCases = 0, found = 0, cleanCases = 0, cleanFalse = 0;
for (const g of GOLDEN) {
  const e = { id: `g${++n}`, date: "2026-10-06", pnl: -100, rr: null, instrument: "MNQ", direction: "long", setup: "", notes: "", images: [], createdAt: n, updatedAt: n,
    reflection: g.text.poorly || g.text.cause || g.text.well ? { wentPoorly: g.text.poorly, cause: g.text.cause, wentWell: g.text.well, followedSetup: null, followedRisk: null, updatedAt: 1 } : undefined,
    review: g.text.improve ? { concepts: { used: [], improve: g.text.improve } } : undefined } as JournalEntry;
  const b = buildBundle(e, [e], [], { mistake: g.declared ?? "other", mistakeOther: g.text.name, mistakeNote: g.text.detail, lesson: g.text.lesson });
  const runs = (await Promise.all(models.map((m) => ask(m, b)))).filter((r): r is ModelRun => !!r);
  const d = decide(b, runs, scanBundle(b));
  const ok = new Set([g.primary, ...(g.secondary ?? []), ...(g.alsoOk ?? [])].filter(Boolean));
  for (const t of d.tags) { filed++; if (ok.has(t.key as never) && !(g.forbid ?? []).includes(t.key as never)) filedRight++; else wrong.push(`${g.id}: filed "${t.key}" (truth: ${g.primary ?? "no mistake"})`); }
  if (g.primary) { truthCases++; if (d.tags.some((t) => t.key === g.primary) || d.tagging.suggestions.some((s) => s.key === g.primary) || (g.alsoOk ?? []).some((k) => d.tags.some((t) => t.key === k))) found++; if (d.tags.length === 0 && d.tagging.suggestions.length > 0) suggestedOnly++; if (d.tagging.verdict === "unsure") unsure++; }
  else { cleanCases++; if (d.tags.length > 0) cleanFalse++; }
}
const pct = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)}%` : "n/a");
console.log(`\nMode: ${models.length ? `LIVE (${models.join(" + ")})` : "OFFLINE (rules + data only)"}   cases: ${GOLDEN.length}\n`);
console.log(`Filed tags            ${filed}`);
console.log(`  precision           ${pct(filedRight, filed)}   ← the number to protect`);
console.log(`  wrong tags filed    ${wrong.length}`);
console.log(`Cases with a mistake  ${truthCases}`);
console.log(`  right tag found     ${pct(found, truthCases)}  (filed or suggested)`);
console.log(`  left as suggestion  ${pct(suggestedOnly, truthCases)}  (trader confirms with one tap)`);
console.log(`  declined entirely   ${pct(unsure, truthCases)}`);
console.log(`Clean cases           ${cleanCases}, falsely tagged: ${cleanFalse}`);
if (wrong.length) console.log("\nWrong tags:\n" + wrong.map((w) => "  - " + w).join("\n"));
process.exitCode = wrong.length ? 1 : 0;
