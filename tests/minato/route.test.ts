/**
 * MINATO chat route — end-to-end through the real POST handler with a mocked OpenRouter.
 * Covers: model down / rate-limited / out of credits, hallucinated numbers, retry-and-recover, privacy of the lean lane,
 * rate limiting, empty journals, and that no secret ever appears in a response.
 */
import { strict as assert } from "node:assert";
import { screenshotJournal, shuffled } from "./brain2-fixtures.ts";

process.env.OPENROUTER_API_KEY = "sk-or-test-SECRET-123";
process.env.MINATO_MODEL = "test/primary";
process.env.MINATO_FALLBACK_MODEL = "test/fallback";
delete process.env.VERCEL;

const { POST } = await import("../../src/app/api/minato/chat/route.ts");

let passed = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); passed++; };
const eq = <T,>(a: T, b: T, m: string) => { assert.deepEqual(a, b, m); passed++; };

const Q_SCREENSHOT = "What was the best A+ setup I took I what to analyse them";
let ipCounter = 0;
const realFetch = globalThis.fetch;

interface Sent { model: string; body: string }
function mockModel(handler: (n: number, req: Sent) => Response | Error) {
  const sent: Sent[] = [];
  globalThis.fetch = (async (_url: unknown, init: RequestInit) => {
    const body = String(init.body);
    const req = { model: JSON.parse(body).model as string, body };
    sent.push(req);
    const r = handler(sent.length, req);
    if (r instanceof Error) throw r;
    return r;
  }) as typeof fetch;
  return sent;
}
const json = (status: number, b: unknown) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
const says = (text: string) => json(200, { choices: [{ message: { content: text } }] });

async function ask(question: string, o: { entries?: unknown[]; ip?: string; keyless?: boolean } = {}) {
  const req = new Request("http://localhost/api/minato/chat", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": o.ip ?? `10.0.0.${++ipCounter}` },
    body: JSON.stringify({ messages: [{ role: "user", text: question }], entries: o.entries ?? screenshotJournal(), journalProvided: true, traderName: "Test" }),
  });
  const res = await POST(req);
  const text = await res.text();
  ok(!text.includes("sk-or-test-SECRET-123"), "API key never appears in a response");
  return { status: res.status, ...(JSON.parse(text) as { text?: string; meta?: Record<string, any>; fallback?: boolean; needs?: string }) };
}

/* 1 — THE BUG: every model is rate-limited. Must degrade to a real A+ answer, not the generic overview. */
{
  const sent = mockModel(() => json(429, { error: { message: "rate limit" } }));
  const r = await ask(Q_SCREENSHOT);
  ok(/Sweep \+ SMT/.test(r.text!) && /A\+/.test(r.text!), `A+ answer survives a dead model: ${r.text}`);
  ok(!/Recent momentum|Ask me about losing streak/.test(r.text!), "no generic overview");
  eq([r.meta!.deterministic, r.meta!.degraded.kind], [true, "rate_limited"], "failure is reported in meta, not hidden");
  ok(/test\/primary:rate_limited\(429\)/.test(r.meta!.degraded.diagnostics), "diagnostics name the failing model");
  ok(sent.length >= 2 && sent.length <= 8, `bounded retries (${sent.length} calls)`);
}

/* 2 — model works and its numbers are real */
{
  mockModel(() => says("Your best A+ setup is **Sweep + SMT**: **+$320** across **2** A+ trades.\n- **All A+ trades** · 3 · +$380"));
  const r = await ask(Q_SCREENSHOT);
  eq(r.meta!.deterministic, false, "model answer used");
  eq(r.meta!.verification.unverified, [], "all figures traced to the journal facts");
  ok(r.meta!.verification.checked >= 2, "figures were actually checked");
  ok(r.meta!.toolsCalled.includes("setupPerformance"), "setup tool ran server-side");
  ok(!/Not found in your journal/.test(r.text!), "no warning when clean");
}

/* 3 — model invents a number, then corrects itself on the retry */
{
  const sent = mockModel((n) => says(n === 1 ? "Best A+ setup is **Sweep + SMT** at **+$999**." : "Best A+ setup is **Sweep + SMT** at **+$320**."));
  const r = await ask(Q_SCREENSHOT);
  ok(!/999/.test(r.text!) && /\$320/.test(r.text!), `corrected answer used: ${r.text}`);
  eq([r.meta!.verification.retried, sent.length], [true, 2], "exactly one corrective retry");
  ok(/not in the data/i.test(sent[1]!.body), "retry tells the model which figure was unsupported");
}

/* 4 — model keeps inventing: the answer is kept but honestly flagged */
{
  mockModel(() => says("Best A+ setup is **Sweep + SMT** at **+$999**."));
  const r = await ask(Q_SCREENSHOT);
  ok(/> Not found in your journal data: \+?\$999/.test(r.text!), `flagged: ${r.text}`);
  eq(r.meta!.verification.unverified, ["+$999"], "meta lists the unverifiable figure exactly as written");
}

/* 5 — out of credits / bad credentials: classified, one call for auth */
{
  const sent = mockModel(() => json(401, {}));
  const r = await ask(Q_SCREENSHOT);
  eq([r.meta!.degraded.kind, sent.length], ["auth", 1], "auth failure stops after one call");
  ok(/Sweep \+ SMT/.test(r.text!), "still answers from the journal");
  mockModel(() => json(402, {}));
  eq((await ask(Q_SCREENSHOT)).meta!.degraded.kind, "credits", "credits classified");
}

/* 6 — model unreachable. Lean lane: the route hands off to the client's local provider (which uses the same honest respond()). */
{
  mockModel(() => new TypeError("fetch failed"));
  const lean = await ask("tell me a surprising fact about gold futures");
  eq([lean.fallback, lean.text], [true, ""], "lean lane signals fallback instead of inventing text");
  // Data lane with no deterministic answer: honest, specific, no stats dump.
  const r = await ask("what did I do on gold futures");
  ok(/can't answer that one reliably/.test(r.text!) && /couldn't be reached/.test(r.text!), r.text!);
  ok(!/win rate/.test(r.text!), "never a fake overview");
}

/* 7 — no API key at all */
{
  const saved = process.env.OPENROUTER_API_KEY; delete process.env.OPENROUTER_API_KEY;
  mockModel(() => { throw new Error("must not be called"); });
  const r = await ask(Q_SCREENSHOT);
  eq(r.meta!.degraded.kind, "no_key", "reported");
  ok(/Sweep \+ SMT/.test(r.text!), "answers anyway");
  process.env.OPENROUTER_API_KEY = saved;
}

/* 8 — the client's entry order must not change the answer */
{
  mockModel(() => json(503, {}));
  const base = await ask("how am i doing");
  for (const seed of [3, 11, 99]) {
    eq((await ask("how am i doing", { entries: shuffled(screenshotJournal(), seed) })).text, base.text, `stable for ordering ${seed}`);
  }
}

/* 9 — privacy: greetings use the lean lane and never carry the journal to the model */
{
  const sent = mockModel(() => says("Good morning, Test."));
  const r = await ask("good morning sensei");
  eq(r.meta!.lane, "chat", "lean lane");
  ok(sent.length === 1 && !/Sweep|a1|2026-10/.test(sent[0]!.body), "journal data not sent to the model");
}

/* 10 — empty journal */
{
  mockModel(() => { throw new Error("must not be called"); });
  ok(/journal is empty/i.test((await ask("best A+ setup", { entries: [] })).text!), "empty account handled before any model call");
}

/* 11 — hostile / malformed input never 500s */
{
  mockModel(() => json(503, {}));
  for (const entries of [[null], [{}], [{ id: 1, pnl: "x", date: 5 }], "nope" as unknown as unknown[]]) {
    const r = await ask("best A+ setup", { entries });
    ok(r.status < 500, `malformed entries handled (${JSON.stringify(entries).slice(0, 30)})`);
  }
}

/* 12 — rate limit: the 31st request in the window from one client is refused */
{
  mockModel(() => says("ok"));
  let last = 0;
  for (let i = 0; i < 31; i++) last = (await ask("good morning", { ip: "203.0.113.9" })).status;
  eq(last, 429, "rate limited after 30 requests");
}

/* 13 — sanitiser: drops what cannot be analysed, counts it, repairs nothing */
{
  const { sanitizeEntries } = await import("../../src/lib/minato/sanitize.ts");
  const r = sanitizeEntries([null, 5, [], {}, { date: "2026-10-01", pnl: "12.5" }, { date: "bad", pnl: 1 }, { date: "2026-10-02", pnl: Number.NaN }, { date: "2026-10-03", pnl: -4 }]);
  eq([r.entries.length, r.dropped], [2, 6], "kept 2, dropped 6");
  eq(r.entries[0]!.pnl, 12.5, "numeric string coerced to a number");
  eq(sanitizeEntries("nope"), { entries: [], dropped: 0 }, "non-array");
  mockModel(() => json(503, {}));
  const res = await ask("how am i doing", { entries: [...screenshotJournal(), null, { id: "junk" }] });
  eq(res.meta!.droppedEntries, 2, "route reports how many entries it ignored");
}

globalThis.fetch = realFetch;
console.log(`=== MINATO ROUTE: ${passed} assertions passed ===`);
