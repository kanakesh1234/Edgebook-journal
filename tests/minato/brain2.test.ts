/**
 * MINATO BRAIN 2.0 — regression, calculation, failure-and-recovery and scenario tests.
 * Every section names the production bug or requirement it protects.
 */
import { strict as assert } from "node:assert";
import { respond } from "../../src/lib/minato/respond.ts";
import { classifyLane, quickReply } from "../../src/lib/minato/lane.ts";
import { routeIntent } from "../../src/lib/minato/router.ts";
import { aPlusSummary, newestFirst, setupBreakdown, verdictOf, wantsSetupAnalysis, setupToolResult } from "../../src/lib/minato/setup-analytics.ts";
import { callChat, classifyStatus, summarizeAttempts, failureWording } from "../../src/lib/minato/provider.ts";
import { collectAllowed, correctionPrompt, extractClaims, verifyReply, withUnverifiedNote } from "../../src/lib/minato/verify.ts";
import { parseMinato } from "../../src/lib/minato/format.ts";
import { ctxFor, screenshotJournal, shuffled, trade } from "./brain2-fixtures.ts";

let passed = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); passed++; };
const eq = <T,>(a: T, b: T, m: string) => { assert.deepEqual(a, b, m); passed++; };
const done: Promise<void>[] = [];
const test = (name: string, fn: () => void | Promise<void>) => done.push(Promise.resolve().then(fn).catch((e) => { console.error(`FAIL: ${name}`); throw e; }));

/* ============================ 1. THE SCREENSHOT BUG ============================ */
test("screenshot: 'best A+ setup' gets an A+ answer, not the generic overview", () => {
  const q = "What was the best A+ setup I took I what to analyse them";
  const text = respond(ctxFor(screenshotJournal()), q);
  ok(/A\+/.test(text), "answer talks about A+");
  ok(/Sweep \+ SMT/.test(text), "names the best A+ setup (Sweep + SMT: +$320 across 2 A+ trades)");
  ok(!/Recent momentum|Biggest mistake to eliminate|Ask me about losing streak/.test(text), "no generic overview text");
  ok(/\$320/.test(text), "net P&L of the best A+ setup is exact (120 + 200)");
});

test("screenshot: the same question twice gives the identical answer", () => {
  const q = "What was the best A+ setup I took I what to analyse them";
  const a = respond(ctxFor(screenshotJournal()), q);
  const b = respond(ctxFor(screenshotJournal()), q);
  eq(a, b, "deterministic");
});

test("screenshot: the question is routed to the data lane (it has no 'my')", () => {
  eq(classifyLane("What was the best A+ setup I took I what to analyse them").lane, "data", "A+ question reads the journal");
  eq(classifyLane("best setup").lane, "data", "bare ranking question reads the journal");
  eq(classifyLane("the trade I lost last week").lane, "data", "first-person trade verbs read the journal");
});

/* ================= 2. ORDERING: identical questions, different numbers ================= */
test("entry order sent by the client never changes the answer", () => {
  const j = screenshotJournal();
  const base = respond(ctxFor(j), "how am i doing");
  const baseLast = respond(ctxFor(j), "review my last trade");
  for (const seed of [1, 2, 3, 7, 42]) {
    const s = shuffled(j, seed);
    eq(respond(ctxFor(s), "how am i doing"), base, `overview stable for shuffle ${seed}`);
    eq(respond(ctxFor(s), "review my last trade"), baseLast, `'last trade' stable for shuffle ${seed}`);
  }
});

test("newestFirst: date, then entry time, then createdAt, tolerates missing fields", () => {
  const out = newestFirst([
    trade({ id: "x", date: "2026-10-01", pnl: 1, entryTime: "09:30", createdAt: 1 }),
    trade({ id: "y", date: "2026-10-02", pnl: 1, entryTime: "09:30", createdAt: 1 }),
    trade({ id: "z", date: "2026-10-02", pnl: 1, entryTime: "10:15", createdAt: 1 }),
    { id: "m" } as never,
  ]);
  eq(out.map((e) => e.id), ["z", "y", "x", "m"], "order");
  const input = [trade({ id: "a", date: "2026-01-01", pnl: 1 })];
  newestFirst(input);
  eq(input.length, 1, "input is not mutated");
});

/* ============================ 3. SETUP / A+ CALCULATIONS ============================ */
test("verdictOf maps the stored review verdict", () => {
  eq(verdictOf(trade({ id: "1", date: "d", pnl: 1, verdict: "a-plus" })), "a-plus", "a-plus");
  eq(verdictOf(trade({ id: "1", date: "d", pnl: 1 })), "unrated", "no review");
  eq(verdictOf({ review: { outcome: { processVerdict: "" } } } as never), "unrated", "empty string");
});

test("setupBreakdown: exact sums, win rate excludes breakeven, R average", () => {
  const rows = setupBreakdown([
    trade({ id: "1", date: "d", pnl: 100, setup: "S", rr: 2 }), trade({ id: "2", date: "d", pnl: -50, setup: "S", rr: -1 }),
    trade({ id: "3", date: "d", pnl: 0, setup: "S", rr: 0 }), trade({ id: "4", date: "d", pnl: 30, setup: "T", rr: null }),
  ]).rows;
  const s = rows.find((r) => r.setup === "S")!;
  eq([s.trades, s.wins, s.losses, s.netPnl, s.winRatePct, s.avgR], [3, 1, 1, 50, 50, 0.33], "S row");
  eq(rows.find((r) => r.setup === "T")!.avgR, null, "no R recorded → null, not 0");
  eq(rows[0]!.setup, "S", "ranked by net P&L");
});

test("aPlusSummary: counts, P&L, best setup and honest sample flags", () => {
  const a = aPlusSummary(screenshotJournal());
  eq([a.count, a.rated, a.total, a.netPnl, a.winRatePct], [3, 6, 8, 380, 100], "totals");
  eq(a.best?.setup, "Sweep + SMT", "best");
  ok(a.bySetup.every((r) => r.thin), "n<5 flagged thin");
  eq(a.trades[0]!.id, "a3", "newest A+ trade first");
});

test("wantsSetupAnalysis", () => {
  ok(wantsSetupAnalysis("best A+ setup").aPlus, "A+");
  ok(wantsSetupAnalysis("my a plus trades").aPlus, "a plus");
  ok(wantsSetupAnalysis("which setup works best").setups, "setup ranking");
  ok(!wantsSetupAnalysis("what is a fair value gap").setups, "concept question");
  ok(!wantsSetupAnalysis("I got an A on my exam").aPlus, "'A' alone is not A+");
});

/* ======================= 4. ACCOUNTS WITH LITTLE OR BAD DATA ======================= */
test("no A+ trades → says so, offers a clearly-labelled alternative, never invents", () => {
  const j = screenshotJournal().map((e) => ({ ...e, review: undefined }));
  const text = respond(ctxFor(j as never), "best A+ setup");
  ok(/None of your 8 trades is marked \*\*A\+\*\*/.test(text), text);
  ok(/Best setup, all trades/.test(text), "alternative is labelled as all-trades, not A+");
});

test("empty journal", () => {
  ok(/No trades recorded/.test(respond(ctxFor([]), "which setup is my best")), "setup question");
  ok(/can't answer that one reliably/.test(respond(ctxFor([]), "blorp zzz")), "unmatched question is honest");
});

test("entries with missing / hostile fields never throw", () => {
  const weird = [
    { id: "w1" }, { id: "w2", date: "2026-10-01", pnl: "12" }, { id: "w3", date: "2026-10-02", pnl: null, setup: "  ", review: {} },
    { id: "w4", date: "2026-10-03", pnl: Number.NaN, setup: "X", rr: Infinity },
  ] as never[];
  for (const q of ["best A+ setup", "how am i doing", "which setup is my best", "review my last trade", "mistakes", "when do i trade best"]) {
    try { respond(ctxFor(weird), q); passed++; } catch (e) { assert.fail(`threw on "${q}": ${(e as Error).message}`); }
  }
  const sb = setupBreakdown(weird);
  ok(sb.rows.every((r) => Number.isFinite(r.netPnl)), "no NaN leaks into totals");
});

test("conflicting records: duplicate ids and identical timestamps stay deterministic", () => {
  const dup = [trade({ id: "d", date: "2026-10-01", pnl: 50, setup: "S", verdict: "a-plus" }), trade({ id: "d", date: "2026-10-01", pnl: -20, setup: "S", verdict: "a-plus" })];
  const a = respond(ctxFor(dup), "best A+ setup");
  eq(respond(ctxFor([...dup].reverse()), "best A+ setup"), a, "order-independent");
  ok(/\$30/.test(a), "both records counted (+50 −20 = +30)");
});

test("large history stays fast and correct", () => {
  const big = Array.from({ length: 5000 }, (_, i) => trade({ id: `t${i}`, date: `2026-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`, pnl: i % 3 === 0 ? -50 : 75, setup: `S${i % 7}`, verdict: i % 5 === 0 ? "a-plus" : "" }));
  const t0 = Date.now();
  const a = aPlusSummary(big);
  ok(Date.now() - t0 < 500, "5,000 trades summarised in <500ms");
  eq(a.count, 1000, "every fifth trade is A+");
  eq(setupToolResult(big).all.considered, 5000, "tool covers the whole journal");
});

/* =================== 5. HONEST FALLBACK (no more fake overview) =================== */
test("unmatched question: explains why, names the reason, offers real capabilities", () => {
  const text = respond(ctxFor(screenshotJournal()), "tell me a surprising fact about gold futures", { degraded: "is rate-limited right now" });
  ok(/rate-limited/.test(text), "reason shown");
  ok(!/win rate is/.test(text), "no stats dump");
  const p = parseMinato(text);
  ok(p.visible.some((b) => b.type === "note"), "valid card dialect (note block present)");
  ok(p.visible.some((b) => b.type === "kv"), "valid card dialect (metric row present)");
});

test("overview questions still get the overview", () => {
  ok(/net P&L/.test(respond(ctxFor(screenshotJournal()), "how am i doing")), "overview branch intact");
});

/* ======================= 6. ROUTER / LANE REGRESSIONS ======================= */
test("'help me …' is a request, not small talk", () => {
  eq(routeIntent("Help me reset after today").intent, "planning", "router");
  ok(classifyLane("help me reset after today").reason !== "greeting", "lane");
  eq(routeIntent("help").intent, "chitchat", "bare help is still chitchat");
  eq(classifyLane("help").lane, "chat", "bare help is chat");
  ok(!/I'm Minato/.test(quickReply("help me plan my risk", "Sam") ?? ""), "quick reply does not hijack");
});

test("existing greetings still short-circuit", () => {
  for (const g of ["good morning sensei", "thanks", "hey", "gm"]) eq(classifyLane(g).lane, "chat", g);
});

/* ============================ 7. PROVIDER: FAILURE & RECOVERY ============================ */
const CFG = { apiKey: "sk-test-never-logged", model: "m1", fallbackModel: "m2", models: ["m1", "m2", "m3"] };
const noSleep = async () => {};
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const okBody = (text: string) => ({ choices: [{ message: { content: text } }] });
function scripted(steps: (Response | Error | ((init: RequestInit) => Response))[]) {
  const calls: { model: string; reasoning: boolean; auth: string }[] = [];
  const fetchImpl = (async (_u: unknown, init: RequestInit) => {
    const body = JSON.parse(String(init.body));
    calls.push({ model: body.model, reasoning: !!body.reasoning, auth: String((init.headers as Record<string, string>).Authorization) });
    const step = steps.shift();
    if (!step) throw new Error("script exhausted");
    if (step instanceof Error) throw step;
    return typeof step === "function" ? step(init) : step;
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}
const call = (s: ReturnType<typeof scripted>, extra = {}) =>
  callChat({ config: CFG, messages: [{ role: "user", content: "hi" }], maxTokens: 50, fetchImpl: s.fetchImpl, sleep: noSleep, ...extra });

test("provider: success on first model", async () => {
  const s = scripted([reply(200, okBody("  hello "))]);
  const r = await call(s);
  eq([r.text, r.model, r.failure, r.attempts.length], ["hello", "m1", null, 1], "ok");
});

test("provider: 429 → one back-off retry on the SAME model, then success", async () => {
  const s = scripted([reply(429, {}), reply(200, okBody("recovered"))]);
  const r = await call(s);
  eq(r.text, "recovered", "recovered");
  eq(s.calls.map((c) => c.model), ["m1", "m1"], "retried same model");
  eq(r.attempts.map((a) => a.outcome), ["rate_limited", "ok"], "attempt log");
});

test("provider: persistent 429 moves to the next model; reports why when all fail", async () => {
  const s = scripted([reply(429, {}), reply(429, {}), reply(503, {}), reply(503, {}), reply(429, {}), reply(429, {})]);
  const r = await call(s);
  eq([r.text, r.failure], [null, "rate_limited"], "all failed, reason kept");
  eq([...new Set(s.calls.map((c) => c.model))], ["m1", "m2", "m3"], "walked every model");
  ok(/m1:rate_limited\(429\)/.test(summarizeAttempts(r.attempts)), "diagnostics readable");
});

test("provider: 401 stops immediately (same key for every model)", async () => {
  const s = scripted([reply(401, {}), reply(200, okBody("should not be reached"))]);
  const r = await call(s);
  eq([r.text, r.failure, s.calls.length], [null, "auth", 1], "stopped");
});

test("provider: 402 credits on one model still tries the next", async () => {
  const s = scripted([reply(402, {}), reply(200, okBody("free model worked"))]);
  const r = await call(s);
  eq([r.text, r.model], ["free model worked", "m2"], "fell through");
});

test("provider: 400 with reasoning → retried once without reasoning on the same model", async () => {
  const s = scripted([reply(400, {}), reply(200, okBody("ok"))]);
  const r = await call(s, { reasoning: true });
  eq(s.calls.map((c) => [c.model, c.reasoning]), [["m1", true], ["m1", false]], "dropped reasoning");
  eq(r.text, "ok", "answered");
});

test("provider: HTTP 200 with an error body is a failure, not an answer", async () => {
  const s = scripted([reply(200, { error: { code: 429, message: "slow down" } }), reply(200, okBody("next model"))]);
  const r = await call(s);
  eq(r.attempts[0]!.outcome, "rate_limited", "error body classified");
  eq(r.text, "next model", "recovered");
});

test("provider: empty content, malformed JSON, network error, timeout", async () => {
  const bad = new Response("<html>gateway</html>", { status: 200 });
  const abort = Object.assign(new Error("aborted"), { name: "TimeoutError" });
  const s = scripted([reply(200, { choices: [{ message: { content: "   " } }] }), bad, new TypeError("fetch failed"), new TypeError("fetch failed"), abort, reply(200, okBody("finally"))]);
  const r = await call(s, { maxModels: 5, config: { ...CFG, models: ["m1", "m2", "m3", "m4", "m5"] } });
  const outcomes = r.attempts.map((a) => a.outcome);
  ok(outcomes.includes("empty") && outcomes.includes("bad_response") && outcomes.includes("network") && outcomes.includes("timeout"), `classified: ${outcomes.join(",")}`);
  eq(r.text, "finally", "recovered");
});

test("provider: time budget is enforced", async () => {
  let t = 0;
  const s = scripted([reply(500, {}), reply(500, {}), reply(500, {})]);
  const r = await call(s, { budgetMs: 3_000, now: () => (t += 1_500) });
  ok(r.text === null && r.attempts.length <= 2, `stopped on budget (${r.attempts.length} attempts)`);
});

test("provider: no key → no network call; the key is never in the attempt log", async () => {
  const s = scripted([]);
  const r = await callChat({ config: { ...CFG, apiKey: "" }, messages: [], maxTokens: 1, fetchImpl: s.fetchImpl });
  eq([r.failure, s.calls.length], ["no_key", 0], "no call without key");
  const s2 = scripted([reply(500, {}), reply(500, {})]);
  const r2 = await call(s2);
  ok(!JSON.stringify(r2).includes("sk-test-never-logged"), "key absent from result");
  ok(s2.calls.every((c) => c.auth === "Bearer sk-test-never-logged"), "key is only ever sent as the auth header");
});

test("provider: status classification and wording", () => {
  eq([401, 402, 429, 500, 503, 400, 422].map(classifyStatus), ["auth", "credits", "rate_limited", "server", "server", "bad_request", "bad_request"], "map");
  ok(/rate-limited/.test(failureWording("rate_limited")) && /isn't configured/.test(failureWording("no_key")), "wording");
});

/* ============================ 8. NUMERIC VERIFICATION ============================ */
test("verify: extraction handles signs, thousands, k-suffix, percentages and R", () => {
  const c = extractClaims("**+$1,215.50** net, −$40, $1.2k risk, 63% win, avg **−0.4R**, 2R target");
  eq(c.map((x) => [x.kind, x.value]), [["usd", 1215.5], ["usd", 40], ["usd", 1200], ["pct", 63], ["r", 0.4], ["r", 2]], "claims");
  eq(extractClaims("a 5 minute hold and 3 trades").length, 0, "plain counts are not claims");
});

test("verify: figures present in the facts pass (including rounding and fractions)", () => {
  const facts = { totalPnl: 215, winRatePct: 63, rate: 0.625, avgR: 1.234, nested: { list: [{ pnl: -50.5 }] }, text: "cost 100 over 4 trades" };
  const v = verifyReply("You made **+$215** at a **63%** win rate (62.5%), avg 1.23R, one loss of −$50.5; a $100 cost.", [facts]);
  eq(v.unverified, [], "all traceable");
  ok(v.checked >= 5, "claims were actually checked");
});

test("verify: invented figures are caught", () => {
  const v = verifyReply("You made **$999** with a **88%** win rate.", [{ totalPnl: 215, winRatePct: 63 }]);
  eq(v.unverified.map((c) => c.raw), ["$999", "88%"], "both flagged");
});

test("verify: the trader's own numbers are allowed", () => {
  eq(verifyReply("At a 45% win rate and 2R, expectancy is positive.", [{}, ["if win rate is 45% and RR 2R"]]).unverified, [], "echoing the question is fine");
});

test("verify: unverified note keeps card dialect and sits above the working divider", () => {
  const reply = "Lead with **$999**.\n- **Row** · 1\n---\n**Working**\n- note";
  const v = verifyReply(reply, [{}]);
  const out = withUnverifiedNote(reply, v);
  const p = parseMinato(out);
  ok(p.visible.some((b) => b.type === "note"), "note is visible");
  ok(p.working.length > 0, "working section survives");
  eq(withUnverifiedNote("clean", { checked: 0, unverified: [] }), "clean", "no-op when clean");
  ok(/\$999/.test(correctionPrompt(v)), "correction prompt lists the figure");
});

test("verify: collectAllowed is cycle-safe and bounded", () => {
  const a: Record<string, unknown> = { n: 5 }; a.self = a;
  ok(collectAllowed(a).includes(5), "handles cycles");
});

await Promise.all(done);
console.log(`=== MINATO BRAIN 2.0: ${passed} assertions passed ===`);
