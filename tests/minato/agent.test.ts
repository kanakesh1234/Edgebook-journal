/**
 * MINATO AGENT — tests.
 *
 * The real POST handler runs end to end against a scripted OpenAI-compatible model (native tool calls, SSE
 * streaming, failures, hostile output). Covers the twelve scenarios in the brief plus the building blocks.
 */
import { strict as assert } from "node:assert";
import { gzipSync } from "node:zlib";
import { shuffled, trade } from "./brain2-fixtures.ts";
import type { JournalEntry } from "../../src/lib/types.ts";

process.env.OPENROUTER_API_KEY = "sk-or-test-SECRET-999";
process.env.MINATO_MODELS = "test/m1,test/m2";
delete process.env.VERCEL;
delete process.env.MINATO_MODEL;
delete process.env.MINATO_FALLBACK_MODEL;

const { POST, GET } = await import("../../src/app/api/minato/chat/route.ts");
const { computeDataRev, slimEntry, _clearSnapshotCache } = await import("../../src/lib/minato/agent/data-source.ts");
const { _resetGuards } = await import("../../src/lib/minato/agent/guards.ts");
const { streamMinato } = await import("../../src/lib/minato/agent/client.ts");
const { calculate } = await import("../../src/lib/minato/agent/safe-math.ts");
const { validateArgs } = await import("../../src/lib/minato/agent/schema.ts");
const { createStreamCleaner } = await import("../../src/lib/minato/agent/stream-clean.ts");
const tools = await import("../../src/lib/minato/agent/tools.ts");
const { MemoryKnowledgeStore, SupabaseKnowledgeStore, fingerprintOf } = await import("../../src/lib/minato/agent/knowledge-store.ts");
const { dailySummaries, riskProfile, dataCoverage } = await import("../../src/lib/minato/agent/extra-tools.ts");
const { parseReflection } = await import("../../src/lib/minato/agent/memory-update.ts");
const { buildSystemPrompt } = await import("../../src/lib/minato/agent/prompt.ts");

let passed = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); passed++; };
const eq = <T,>(a: T, b: T, m: string) => { assert.deepEqual(a, b, m); passed++; };
const quiet = <T,>(f: () => T): T => { const i = console.info, w = console.warn; console.info = () => undefined; console.warn = () => undefined; try { return f(); } finally { console.info = i; console.warn = w; } };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
console.info = () => undefined; // route logs one line per request

/* ------------------------------------------------------------------ */
/*  Scripted model                                                     */
/* ------------------------------------------------------------------ */

interface Req { model: string; messages: { role: string; content: string | null; tool_calls?: { id: string; function: { name: string; arguments: string } }[]; tool_call_id?: string }[]; tools?: { function: { name: string } }[]; tool_choice?: string; stream: boolean }
interface Turn { text?: string[]; calls?: { name: string; args?: unknown; raw?: string }[]; status?: number; delayMs?: number }
const enc = new TextEncoder();
const realFetch = globalThis.fetch;
let reqs: Req[] = [];
let reflections = 0;

function sse(turn: Turn): Response {
  const parts: string[] = [];
  for (const t of turn.text ?? []) parts.push(`data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`);
  (turn.calls ?? []).forEach((c, i) => {
    const raw = c.raw ?? JSON.stringify(c.args ?? {});
    parts.push(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: i, id: `call_${i}`, type: "function", function: { name: c.name, arguments: "" } }] } }] })}\n\n`);
    const mid = Math.floor(raw.length / 2);
    for (const piece of [raw.slice(0, mid), raw.slice(mid)]) parts.push(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: i, function: { arguments: piece } }] } }] })}\n\n`);
  });
  parts.push(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: turn.calls?.length ? "tool_calls" : "stop" }] })}\n\n`, "data: [DONE]\n\n");
  const body = new ReadableStream<Uint8Array>({
    async start(c) { if (turn.delayMs) await sleep(turn.delayMs); for (const p of parts) { c.enqueue(enc.encode(p)); await sleep(1); } c.close(); },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function mockModel(script: (n: number, req: Req) => Turn) {
  reqs = []; reflections = 0;
  globalThis.fetch = (async (_u: unknown, init: RequestInit) => {
    const req = JSON.parse(String(init.body)) as Req;
    if (req.messages[0]?.content?.startsWith("You maintain a trader's long-term notes")) {
      reflections++;
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"notes":[]}' } }] }), { status: 200 });
    }
    reqs.push(req);
    const turn = script(reqs.length, req);
    if (turn.status && turn.status >= 400) return new Response(JSON.stringify({ error: { message: "x" } }), { status: turn.status });
    return sse(turn);
  }) as typeof fetch;
  return reqs;
}

/* ------------------------------------------------------------------ */
/*  Request helpers                                                    */
/* ------------------------------------------------------------------ */

let ipN = 0;
type Ev = { t: string; x?: string; text?: string; actions?: unknown[]; meta?: Record<string, any>; code?: string; message?: string };
interface Journal { entries: JournalEntry[]; settings?: Record<string, unknown>; plans?: unknown[]; dayLogs?: unknown[] }
const SETTINGS = { startingEquity: 25000, targetEquity: 26000, maxDrawdown: 500, currency: "USD", fullName: "Nandigam K", playbook: [], dayLimits: {} };

function bodyFor(question: string, j: Journal | null, o: { history?: { role: string; text: string }[]; withSnapshot?: boolean; rid?: string } = {}) {
  const settings = j?.settings ?? SETTINGS;
  const entries = (j?.entries ?? []).map((e) => slimEntry(e as unknown as Record<string, unknown>));
  const rev = computeDataRev({ entries, plans: j?.plans ?? [], dayLogs: j?.dayLogs ?? [], settings });
  return {
    requestId: o.rid ?? `r${++ipN}-${Math.random()}`,
    messages: [...(o.history ?? []), { role: "user", text: question }],
    traderName: "Nandigam",
    dataRev: rev,
    ...(o.withSnapshot === false ? {} : { snapshot: { entries, plans: j?.plans ?? [], dayLogs: j?.dayLogs ?? [], settings } }),
    semanticParams: {},
  };
}

async function readEvents(res: Response): Promise<Ev[]> {
  const text = await res.text();
  assert.ok(!text.includes("sk-or-test-SECRET-999"), "the API key never appears in any response");
  passed++;
  return text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

async function call(body: unknown, o: { ip?: string; gzip?: boolean } = {}) {
  const raw = JSON.stringify(body);
  const req = new Request("http://localhost/api/minato/chat", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": o.ip ?? `10.1.0.${++ipN}`, ...(o.gzip ? { "x-minato-encoding": "gzip" } : {}) },
    body: o.gzip ? gzipSync(Buffer.from(raw)) : raw,
  });
  const res = await POST(req);
  return res;
}

async function ask(question: string, j: Journal | null, o: Parameters<typeof bodyFor>[2] & { ip?: string; gzip?: boolean } = {}) {
  const res = await call(bodyFor(question, j, o), o);
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("ndjson")) return { status: res.status, events: [] as Ev[], json: JSON.parse(await res.text()) as Record<string, any> };
  const events = await readEvents(res);
  await sleep(25); // let background memory work settle
  return { status: res.status, events, json: null as Record<string, any> | null };
}
const done = (evs: Ev[]) => evs.find((e) => e.t === "done");
const streamed = (evs: Ev[]) => evs.filter((e) => e.t === "delta").map((e) => e.x).join("");

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const base = (): JournalEntry[] => [
  trade({ id: "a1", date: "2026-10-20", pnl: 120, setup: "Sweep + SMT", verdict: "a-plus", entryTime: "09:40" }),
  trade({ id: "a2", date: "2026-10-21", pnl: 200, setup: "Sweep + SMT", verdict: "a-plus", entryTime: "09:35" }),
  trade({ id: "a3", date: "2026-10-22", pnl: 60, setup: "Retest", verdict: "a-plus", entryTime: "10:05" }),
  trade({ id: "b1", date: "2026-10-23", pnl: -80, setup: "Retest", verdict: "process-failure", entryTime: "10:20" }),
  trade({ id: "b2", date: "2026-10-24", pnl: -45, setup: "Sweep + SMT", verdict: "process-failure", entryTime: "09:50" }),
  trade({ id: "c1", date: "2026-10-27", pnl: 40, setup: "Retest", verdict: "process-success", entryTime: "09:45" }),
  trade({ id: "c2", date: "2026-10-28", pnl: -70, setup: "Retest", entryTime: "10:30" }),
  trade({ id: "c3", date: "2026-10-29", pnl: 15, setup: "Sweep + SMT", entryTime: "09:55" }),
];
const withStops = (es: JournalEntry[]): JournalEntry[] => es.map((e, i) => ({ ...e, entryPrice: 20000 + i, stopLoss: 20000 + i - (i % 2 ? 24 : 20), quantity: 2 }) as JournalEntry);
const big = (n: number): JournalEntry[] => {
  let s = 7; const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(2024, 0, 2 + Math.floor(i / 3))); const date = d.toISOString().slice(0, 10);
    return { ...trade({ id: `big${i}`, date, pnl: r() < 0.45 ? -(40 + Math.round(r() * 60)) : 60 + Math.round(r() * 120), setup: i % 2 ? "Retest" : "Sweep", createdAt: i, entryTime: `09:${String(30 + (i % 25)).padStart(2, "0")}` }), updatedAt: i, entryPrice: 18000, stopLoss: 17980, quantity: 1 } as JournalEntry;
  });
};
const J = (entries: JournalEntry[], extra: Partial<Journal> = {}): Journal => ({ entries, ...extra });

const say = (...t: string[]): Turn => ({ text: t });
const callTools = (...c: NonNullable<Turn["calls"]>): Turn => ({ calls: c });
const toolMsgs = (r: Req) => r.messages.filter((m) => m.role === "tool").map((m) => JSON.parse(m.content!));

/* ================================================================== */
/*  1 — General question: one model call, live stream, brief in prompt */
/* ================================================================== */
{
  const sent = mockModel(() => say("Good ", "afternoon, ", "Nandigam. ", "What are we working on?"));
  const r = await ask("good afternoon", J(base()));
  eq(r.status, 200, "stream opens");
  eq(sent.length, 1, "a greeting costs exactly one model call");
  ok(r.events[0]!.t === "start", "stream announces itself immediately");
  eq(r.events.filter((e) => e.t === "delta").length, 4, "text arrives as it is generated (4 deltas)");
  eq(streamed(r.events), "Good afternoon, Nandigam. What are we working on?", "deltas concatenate to the answer");
  eq(done(r.events)!.text, "Good afternoon, Nandigam. What are we working on?", "done carries the authoritative answer");
  ok(sent[0]!.stream === true && sent[0]!.tools!.length >= 16, "native tools are actually sent to the model (the old engine never sent them)");
  const sys = sent[0]!.messages[0]!.content!;
  ok(sys.includes("TRADER BRIEF") && sys.includes('"trader":"Nandigam"'), "live brief in the system prompt");
  ok(sys.includes("25215") || sys.includes("25,215") || /currentEquity\\?":25/.test(sys), "brief carries live account numbers");
  ok(!JSON.stringify(r.events).includes("tool_call"), "no internals in the stream");
}

/* ================================================================== */
/*  2 — Multi-query: parallel tools, silent rounds, final streamed      */
/* ================================================================== */
{
  const sent = mockModel((n) =>
    n === 1
      ? callTools({ name: "get_performance_metrics", args: { sections: ["summary", "setups"] } }, { name: "get_rule_violations", args: {} }, { name: "get_journal_entries", args: { limit: 5 } })
      : say("Your **trade win rate is 63%** over 8 trades; ", "the weakest area is the Retest setup."));
  const r = await ask("Why am I consistently losing?", J(base()));
  eq(sent.length, 2, "one retrieval round + one answer round");
  const tm = toolMsgs(sent[1]!);
  eq(tm.length, 3, "all three tool results returned to the model");
  ok(sent[1]!.messages.some((m) => m.role === "assistant" && m.tool_calls?.length === 3), "assistant tool_calls echoed back");
  ok(sent[1]!.messages.filter((m) => m.role === "tool").every((m) => typeof m.tool_call_id === "string"), "tool results carry call ids");
  ok(tm[0].winRateTradePct !== undefined && tm[0].setupBreakdown !== undefined, "only the requested sections came back");
  ok(tm[0].aPlusSummary === undefined && tm[0].sessionWindows === undefined, "unrequested sections were NOT dumped");
  eq(streamed(r.events), done(r.events)!.text, "streamed text equals final text");
  ok(!r.events.some((e) => e.t === "delta" && /get_performance|tool/i.test(e.x ?? "")), "tool names never reach the trader");
  eq(done(r.events)!.meta!.tools, ["get_performance_metrics", "get_rule_violations", "get_journal_entries"], "meta records what was retrieved");
  eq(done(r.events)!.meta!.verification.unverified, [], "63% is verified against retrieved data");
}

/* ================================================================== */
/*  3 — Historical comparison + the model calculates through the tool   */
/* ================================================================== */
{
  const sent = mockModel((n, req) => {
    if (n === 1) return callTools({ name: "compare_trading_periods", args: { mode: "first_half_vs_second_half" } }, { name: "get_psychology_patterns" });
    if (n === 2) return callTools({ name: "calculate", args: { expression: "round(470/7, 2)" } });
    const calc = toolMsgs(req).find((t) => t.result !== undefined)!;
    return say(`Risk about **$${calc.rounded}** per trade.`);
  });
  const r = await ask("Am I improving psychologically?", J(withStops(base())));
  eq(sent.length, 3, "two retrieval rounds then the answer");
  const cmp = toolMsgs(sent[1]!)[0];
  ok(cmp.earlierPeriod && cmp.recentPeriod && cmp.deltas, "period comparison returned both periods and deltas");
  eq(cmp.earlierPeriod.trades + cmp.recentPeriod.trades, 8, "the two periods partition the 8 trades");
  ok(/\$67\.14/.test(done(r.events)!.text!), "answer uses the calculator's figure");
  eq(done(r.events)!.meta!.verification.unverified, [], "calculator output counts as verified data");
}

/* ================================================================== */
/*  4 — Missing information is stated, not invented                     */
/* ================================================================== */
{
  const cov = dataCoverage({ entries: base(), settings: SETTINGS as never, traderName: "T", today: "2026-11-01" } as never);
  ok(cov.missing.some((m) => /stop-loss/.test(m)) && cov.coverage.withStopLoss === 0, "coverage reports no stop-losses");
  const rp = riskProfile({ entries: base(), settings: SETTINGS as never, traderName: "T", today: "2026-11-01", semanticParams: {} } as never, {}) as any;
  ok(rp.dataGaps.some((g: string) => /stop/i.test(g)), "risk profile admits it cannot measure the stop");
  ok(rp.instruments[0].stopPoints === undefined || rp.instruments[0].stopPoints === null, "no stop distance is fabricated");
}

/* ================================================================== */
/*  5 — The screenshot question: risk per trade + MNQ sizing from data   */
/* ================================================================== */
{
  const j = J(withStops(base()));
  const rp = riskProfile({ entries: j.entries, settings: { ...SETTINGS, maxDrawdown: 500 } as never, traderName: "T", today: "2026-11-01", semanticParams: {} } as never, { instrument: "MNQ" }) as any;
  const mnq = rp.instruments[0];
  eq(mnq.symbol, "MNQ", "MNQ profile built");
  ok(mnq.stopPoints.median >= 20 && mnq.stopPoints.median <= 24, `typical stop measured from the journal: ${mnq.stopPoints.median}`);
  ok(rp.riskPerTradeCeilings.length >= 2 && rp.bindingCeilingPerTrade > 0, "ceilings with reasons");
  ok(mnq.atMedianStop.maxContractsAtBindingCeiling >= 1, `contracts at the binding ceiling: ${mnq.atMedianStop.maxContractsAtBindingCeiling}`);

  const sent = mockModel((n) => (n === 1 ? callTools({ name: "get_risk_profile", args: { instrument: "MNQ" } }) : say("**$", "the answer**")));
  await ask("ok nice so how much can I risk per trade so that it is safe and position sizing in mnq", j, { history: [{ role: "user", text: "with my win rate what is the max losing streak possible" }, { role: "buddy", text: "At your **62.5% win rate**, a bad run reaches 7." }] });
  ok(sent[0]!.messages.some((m) => m.role === "assistant" && /62\.5%/.test(m.content ?? "")), "prior turns are in the conversation, so 'ok nice so how much…' is understood as a follow-up");
  ok(sent[0]!.messages[sent[0]!.messages.length - 1]!.content!.startsWith("ok nice so how much"), "the original wording reaches the model untouched (no regex lane rewrote it)");
  ok(!JSON.stringify(sent[0]!.messages).includes("Got it."), "there is no 'Got it.' shortcut anywhere");
}

/* ================================================================== */
/*  6 — Thousands of trades: speed, paging, compressed upload           */
/* ================================================================== */
{
  const entries = big(3200);
  const t0 = Date.now();
  const sent = mockModel((n) =>
    n === 1 ? callTools({ name: "get_trading_history", args: { outcome: "loss", sortBy: "lowest_pnl", limit: 5, offset: 10 } }, { name: "get_daily_summaries", args: { limit: 5, sortBy: "worst" } }, { name: "get_performance_metrics", args: { sections: ["summary", "setups"] } }) : say("Done."));
  const r = await ask("what are my worst losses", J(entries), { gzip: true });
  const ms = Date.now() - t0;
  ok(ms < 8000, `3,200-trade question end to end in ${ms}ms`);
  const [hist, days, perf] = toolMsgs(sent[1]!);
  eq(hist.returnedCount, 5, "paged 5 rows");
  eq(hist.offset, 10, "offset honoured");
  ok(hist.totalMatchingTrades > 1000 && hist.hasMore === true, `totals cover everything matching (${hist.totalMatchingTrades}), not just the page`);
  ok(hist.trades[0].pnl <= hist.trades[4].pnl, "sorted ascending by P&L");
  eq(days.days.length, 5, "daily summaries paged");
  ok(days.days[0].netPnl <= days.days[1].netPnl, "worst days first");
  eq(perf.sampleTrades, 3200, "metrics span all 3,200 trades");
  eq(done(r.events)!.meta!.droppedEntries, 0, "nothing dropped");
  const sizes = sent[1]!.messages.filter((m) => m.role === "tool").map((m) => m.content!.length);
  ok(sizes.every((n) => n < 30_000), `tool results stay bounded (${sizes.join(", ")} chars)`);
}

/* ================================================================== */
/*  7 — New entries and changed rules are never masked by a cache       */
/* ================================================================== */
{
  _clearSnapshotCache();
  const ip = "10.9.9.9";
  const j1 = J(base());
  mockModel(() => say("ok one"));
  const first = await ask("hello there", j1, { ip, rid: "x1" });
  eq(done(first.events)!.meta!.droppedEntries, 0, "first request with snapshot works");

  // Same revision, no snapshot → served from the verified cache.
  mockModel(() => say("ok two"));
  const cached = await ask("hello again", j1, { ip, withSnapshot: false, rid: "x2" });
  ok(done(cached.events), "unchanged journal: answered from cache without re-upload");

  // A new trade changes the revision → the server refuses to use the old copy.
  const j2 = J([...base(), trade({ id: "n1", date: "2026-10-30", pnl: -500, setup: "Retest" })]);
  const stale = await ask("hello once more", j2, { ip, withSnapshot: false, rid: "x3" });
  ok(stale.events.some((e) => e.t === "need_data") && !done(stale.events), "new trade → need_data, old cache NOT used");

  const sent = mockModel((n) => (n === 1 ? callTools({ name: "get_account_statistics" }, { name: "get_trading_history", args: { limit: 1 } }) : say("seen")));
  await ask("what was my last trade", j2, { ip, rid: "x4" });
  const [acct, hist] = toolMsgs(sent[1]!);
  eq(hist.trades[0].id, "n1", "the newest trade is visible immediately");
  eq(hist.totalMatchingTrades, 9, "9 trades now");
  ok(acct.drawdown.used >= 500, "drawdown reflects the new loss");
  ok(sent[0]!.messages[0]!.content!.includes('"totalTrades":9'), "brief reflects the new trade");

  // Updated rules: the revision moves and the profile shows the new limit.
  const rules = { rules: [{ id: "risk.max-daily-loss", kind: "risk", label: "Maximum daily loss", description: "", enabled: true, params: { limit: 150 } }] };
  const j3 = J(j2.entries, { settings: { ...SETTINGS, rules } });
  ok(computeDataRev({ entries: j3.entries, settings: j3.settings }) !== computeDataRev({ entries: j2.entries, settings: j2.settings }), "rule change changes the revision");
  const sent2 = mockModel((n) => (n === 1 ? callTools({ name: "get_trader_profile" }) : say("fine")));
  await ask("what are my rules", j3, { ip, rid: "x5" });
  eq(toolMsgs(sent2[1]!)[0].activeGuardrailRules[0].params.limit, 150, "profile shows the UPDATED limit");

  // An edit that keeps the id but changes P&L must also change the revision.
  const edited = j1.entries.map((e, i) => (i === 0 ? { ...e, pnl: 999 } : e));
  ok(computeDataRev({ entries: edited }) !== computeDataRev({ entries: j1.entries }), "editing a trade changes the revision");
  ok(computeDataRev({ entries: shuffled(j1.entries, 3) }) === computeDataRev({ entries: j1.entries }), "revision ignores ordering");
}

/* ================================================================== */
/*  8 — Model/API failures                                              */
/* ================================================================== */
{
  // 429 on the first model → second model answers; no error shown.
  const sent = mockModel((n, req) => (req.model === "test/m1" ? { status: 429 } : say("Recovered answer.")));
  const r = await ask("how am i doing", J(base()));
  eq(done(r.events)!.text, "Recovered answer.", "falls back to the next model on rate limit");
  eq(done(r.events)!.meta!.model, "test/m2", "meta names the model that answered");
  ok(sent.length >= 2 && sent.length <= 4, `bounded retries (${sent.length})`);

  // Everything down → honest error, no canned answer, bounded calls.
  const dead = mockModel(() => ({ status: 503 }));
  const e = await ask("how am i doing", J(base()));
  const err = e.events.find((x) => x.t === "error")!;
  eq(err.code, "server", "classified failure");
  ok(/reasoning engine/.test(err.message!) && !done(e.events), "plain honest message; no fake answer");
  ok(dead.length <= 6, `no retry storm (${dead.length} calls)`);

  // Bad key → stops immediately.
  const auth = mockModel(() => ({ status: 401 }));
  const a = await ask("hi there", J(base()));
  eq(a.events.find((x) => x.t === "error")!.code, "auth", "auth failure reported");
  eq(auth.length, 1, "no retries on a rejected key");

  // Out of credits.
  mockModel(() => ({ status: 402 }));
  eq((await ask("hi there", J(base()))).events.find((x) => x.t === "error")!.code, "credits", "credits failure reported");

  // Stream dies mid-answer on model 1 → partial is retracted, model 2 completes.
  let k = 0;
  mockModel((n, req) => {
    if (req.model === "test/m1") { k++; return { text: ["Half an ans"], status: undefined, calls: [{ name: "x", raw: "{" }] } as Turn; }
    return say("Complete answer.");
  });
  const m = await ask("how am i doing", J(base()));
  ok(k >= 1 && done(m.events), "a model that emits an unknown tool then nothing is survived");
}

/* ================================================================== */
/*  9 — Memory (database) failures never break an answer                */
/* ================================================================== */
{
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const store = new SupabaseKnowledgeStore({
    url: "https://x.supabase.co", anonKey: "anon", token: "jwt-abc", userId: "g_123",
    fetchImpl: (async (url: string, init: RequestInit) => { calls.push({ url, headers: init.headers as Record<string, string> }); return new Response("boom", { status: 500 }); }) as typeof fetch,
  });
  eq(await store.list(), [], "list degrades to empty on database failure");
  const sv = await store.save({ kind: "goal", content: "Reach $26,000 by end of November.", source: "trader_stated" });
  ok(!sv.ok, "save reports failure honestly (never claims success)");
  ok(calls.every((c) => c.headers.Authorization === "Bearer jwt-abc" && c.headers.apikey === "anon"), "every call carries the RLS identity token");
  ok(calls.every((c) => !c.url.includes("user_id=eq.g_999")), "never addresses another trader");
  ok(calls.length <= 3, `circuit-breaks after repeated failure (${calls.length} calls)`);

  const mem = new MemoryKnowledgeStore();
  const ctx = { db: { entries: base(), settings: SETTINGS, traderName: "T", today: "2026-11-01" }, knowledge: mem, clientBeliefs: [{ say: "Tends to over-trade after a loss" }], today: "2026-11-01" } as any;
  const s1 = await tools.runTool("save_trader_insight", { kind: "goal", content: "Reach $26,000 by the end of November.", source: "trader_stated" }, ctx);
  ok((s1.value as any).saved === true && (s1.value as any).created === true, "insight saved");
  const s2 = await tools.runTool("save_trader_insight", { kind: "goal", content: "reach $26,000 by the end of november", source: "trader_stated" }, ctx);
  eq((s2.value as any).created, false, "the same fact reinforces instead of duplicating");
  eq(mem.rows.size, 1, "one row");
  const found = await tools.runTool("search_trader_memory", { query: "goal november" }, ctx);
  eq((found.value as any).notes.length, 1, "search finds it");
  eq(((found.value as any).localBeliefs ?? []).length, 0, "unrelated local belief filtered out by query");
  const bad = await tools.runTool("save_trader_insight", { kind: "fact", content: "my api key is sk-abcdefghijklmnopqrstuvwxyz", source: "trader_stated" }, ctx);
  ok((bad.value as any).saved === false, "secrets are refused");
  const older = (await mem.list({ kinds: ["goal"] }))[0]!;
  await tools.runTool("save_trader_insight", { kind: "goal", content: "New goal: reach $27,000 by December 15.", source: "trader_stated", supersedesId: older.id }, ctx);
  eq((await mem.list({ kinds: ["goal"] })).map((x) => x.content), ["New goal: reach $27,000 by December 15."], "superseded notes drop out of active memory");
  ok(fingerprintOf("goal", "A  b!") === fingerprintOf("goal", "a b"), "fingerprint ignores case/punctuation");
  eq(parseReflection('noise {"notes":[{"kind":"goal","content":"Wants 2 trades max per day.","source":"trader_stated"},{"kind":"bogus","content":"x"},{"kind":"progress","content":"no"}]}').length, 1, "reflection output is validated");
}

/* ================================================================== */
/* 10 — Concurrency and duplicates                                      */
/* ================================================================== */
{
  _resetGuards();
  mockModel((n, req) => ({ ...say(`answer for ${req.messages[req.messages.length - 1]!.content}`), delayMs: 40 }));
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => ask(`question number ${i}`, J(base()), { ip: `10.7.0.${i}` })));
  ok(results.every((r, i) => done(r.events)!.text === `answer for question number ${i}`), "six concurrent traders each get their own answer");

  // Same trader, same message twice at once → second is rejected, first answered.
  _resetGuards();
  mockModel(() => ({ ...say("slow"), delayMs: 120 }));
  const body = bodyFor("how am i doing", J(base()), { rid: "dup1" });
  const [a, b] = await Promise.all([call(body, { ip: "10.8.0.1" }), call(body, { ip: "10.8.0.1" })]);
  eq([a.status, b.status].sort(), [200, 409], "duplicate submission rejected with 409");
  await readEvents(a.status === 200 ? a : b);

  // Same trader fanning out four different messages → concurrency cap.
  _resetGuards();
  mockModel(() => ({ ...say("slow"), delayMs: 150 }));
  const rs = await Promise.all([1, 2, 3, 4].map((i) => call(bodyFor(`distinct question ${i}`, J(base())), { ip: "10.8.0.2" })));
  eq(rs.map((r) => r.status).sort(), [200, 200, 200, 429], "per-trader concurrency cap");
  for (const r of rs) if (r.status === 200) await readEvents(r);
}

/* ================================================================== */
/* 11 — Invalid / hostile tool calls                                    */
/* ================================================================== */
{
  const sent = mockModel((n) => {
    if (n === 1) return callTools(
      { name: "drop_database", args: {} },
      { name: "get_trading_history", args: { dateFrom: "yesterday", limit: "5" } },
      { name: "get_trading_history", raw: "{not json" },
      { name: "get_trading_history", args: { sql: "SELECT * FROM users", outcome: "WIN", limit: "3" } },
    );
    return say("Handled.");
  });
  const r = await ask("show trades", J(base()));
  ok(done(r.events), "hostile tool calls do not break the turn");
  const res = toolMsgs(sent[1]!);
  eq(res[0].error, "unknown_tool", "unknown tool rejected");
  ok(res[0].available.includes("get_trading_history"), "model is told what exists");
  eq(res[1].error, "invalid_arguments", "bad date rejected with a reason");
  ok(/dateFrom/.test(res[1].problems[0]), "problem names the field");
  eq(res[2].error, "invalid_arguments", "malformed JSON rejected");
  ok(res[3].returnedCount === 3 && res[3].trades.every((t: any) => t.pnl > 0), "numeric strings and enum case are coerced");
  ok(JSON.stringify(res[3]).includes("ignored unknown parameter(s): sql"), "unknown parameters (SQL) are dropped, never executed");

  // Endless tool requests are cut off and the model is forced to answer.
  const loop = mockModel((n, req) => (req.tool_choice === "none" ? say("Forced answer from gathered data.") : callTools({ name: "get_account_statistics" }, { name: "get_trader_profile" }, { name: "get_data_coverage" }, { name: "get_risk_profile" }, { name: "get_performance_metrics", args: { dateFrom: `2026-10-${String(10 + (n % 15)).padStart(2, "0")}` } }, { name: "get_rule_violations", args: { dateFrom: `2026-09-${String(10 + (n % 15)).padStart(2, "0")}` } })));
  const lr = await ask("analyse everything forever", J(base()));
  eq(done(lr.events)!.text, "Forced answer from gathered data.", "runaway loop ends in a forced final answer");
  ok(loop.length <= 9, `model calls bounded (${loop.length})`);
  ok(loop[loop.length - 1]!.tool_choice === "none", "final round forbids further tool calls");

  // Same call repeated → deduplicated, not re-executed.
  const rep = mockModel((n, req) => (n <= 3 ? callTools({ name: "get_account_statistics" }) : say("Stopped repeating.")));
  const rr = await ask("again", J(base()));
  ok(done(rr.events), "repeated identical calls still terminate");
  ok(rep.length <= 6, `repeat detection bounded the loop (${rep.length})`);
}

/* ================================================================== */
/* 12 — Long conversations                                              */
/* ================================================================== */
{
  const history = Array.from({ length: 60 }, (_, i) => ({ role: i % 2 ? "buddy" : "user", text: `${i % 2 ? "reply" : "turn"} ${i} ${"x".repeat(i % 7 === 0 ? 9500 : 120)}` }));
  const sent = mockModel(() => say("Still tracking."));
  const r = await ask("and what about last week", J(base()), { history });
  ok(done(r.events), "60-turn history accepted");
  const convo = sent[0]!.messages.filter((m) => m.role !== "system");
  ok(convo.length <= 40, `conversation bounded to 40 turns (${convo.length})`);
  ok(convo.every((m) => (m.content?.length ?? 0) <= 8000), "each turn capped at 8,000 characters");
  eq(convo[convo.length - 1]!.content, "and what about last week", "the newest question is last and intact");

  // Huge tool results are compacted before the next call.
  const sent2 = mockModel((n) => (n <= 5 ? callTools({ name: "get_trading_history", args: { limit: 50, offset: n * 50 } }) : say("ok")));
  const rr = await ask("page through everything", J(big(1500)));
  ok(done(rr.events), "many large tool rounds complete");
  ok(sent2.length >= 2, "multi-round retrieval happened");
}

/* ================================================================== */
/* 13 — Streaming behaviour                                             */
/* ================================================================== */
{
  // Text before a tool call is retracted, never part of the answer.
  mockModel((n) => (n === 1 ? { text: ["Let me look that up… "], calls: [{ name: "get_account_statistics" }] } : say("Final **answer** only.")));
  const r = await ask("how close am i to target", J(base()));
  const idx = r.events.findIndex((e) => e.t === "reset");
  ok(idx > 0, "preamble text was retracted with a reset event");
  eq(done(r.events)!.text, "Final **answer** only.", "retracted text is not in the final answer");
  eq(r.events.filter((e) => e.t === "delta").map((e) => e.x).slice(-1)[0], "Final **answer** only.", "final answer streamed after the reset");

  // <think> blocks and a role label never reach the screen, even split across chunks.
  mockModel(() => say("<thi", "nk>secret plan</thi", "nk>Minato: Your ", "drawdown room is **intact**."));
  const t = await ask("drawdown room", J(base()));
  ok(!streamed(t.events).includes("secret") && !streamed(t.events).toLowerCase().includes("minato:"), "think-blocks and labels are filtered live");
  eq(done(t.events)!.text, "Your drawdown room is **intact**.", "clean final text");

  // Text-tool fallback for models without native tool support.
  let textMode = false;
  const tm = mockModel((n, req) => {
    if (req.tools) return { status: 400 };
    textMode = true;
    const last = req.messages[req.messages.length - 1]!.content ?? "";
    return /TOOL RESULTS/.test(last) ? say("Drawdown room is **intact**, fully.") : say('<tool_call>{"name":"get_account_statistics","arguments":{}}</tool_call>');
  });
  const tr = await ask("how much drawdown room", J(base()));
  ok(textMode && done(tr.events)!.meta!.textMode === true, "switches to the text-tool protocol when native tools are rejected");
  eq(done(tr.events)!.text, "Drawdown room is **intact**, fully.", "answer delivered through the fallback protocol");
  ok(!streamed(tr.events).includes("tool_call"), "protocol markup is never shown");
  ok(tm.every((q) => q.messages[0]!.content!.includes("TOOL PROTOCOL") || q.tools), "fallback prompt explains the protocol");
}

/* ================================================================== */
/* 14 — Grounding                                                       */
/* ================================================================== */
{
  mockModel(() => say("You are up **$9,999** and your win rate is 99%."));
  const r = await ask("how am i doing", J(base()));
  const d = done(r.events)!;
  ok(d.meta!.verification.unverified.length >= 2, "invented figures are detected");
  ok(/Not found in your data|Not found in your journal data/.test(d.text!) , "an honest note is added; the model's words are not rewritten");
  mockModel(() => say("Your **net P&L is +$240** on 8 trades."));
  const ok2 = await ask("pnl", J(base()));
  eq(done(ok2.events)!.meta!.verification.unverified, [], "figures from the live brief verify without any tool call");
}

/* ================================================================== */
/* 15 — Auth, validation, client handshake                              */
/* ================================================================== */
{
  process.env.VERCEL = "1";
  const res = await call(bodyFor("hi", J(base())));
  eq(res.status, 401, "unauthenticated requests are refused in deployed environments");
  delete process.env.VERCEL;

  const bad = await call({ messages: [{ role: "buddy", text: "x" }] });
  eq(bad.status, 400, "last message must be from the trader");
  const garbage = await POST(new Request("http://localhost/api/minato/chat", { method: "POST", headers: { "x-forwarded-for": "10.5.5.5" }, body: "{nope" }));
  eq(garbage.status, 400, "malformed JSON is a clean 400");
  const huge = await POST(new Request("http://localhost/api/minato/chat", { method: "POST", headers: { "x-forwarded-for": "10.5.5.6", "content-length": String(99 * 1024 * 1024) }, body: "{}" }));
  eq(huge.status, 413, "oversized bodies are refused");

  // Client module end to end: first call has no snapshot → need_data → resend → streamed answer.
  _clearSnapshotCache();
  mockModel(() => say("Streaming ", "to the ", "client."));
  const j = J(base());
  const seen: string[] = [];
  const b = bodyFor("hello", j, { withSnapshot: false });
  const out = await streamMinato({
    body: b as unknown as Record<string, unknown>,
    getSnapshot: () => ({ entries: j.entries.map((e) => slimEntry(e as never)), plans: [], dayLogs: [], settings: SETTINGS }),
    onText: (t) => seen.push(t),
    fetchImpl: (async (_u: string, init: RequestInit) => POST(new Request("http://localhost/api/minato/chat", { method: "POST", headers: { ...(init.headers as object), "x-forwarded-for": "10.6.6.6" }, body: init.body as BodyInit }))) as typeof fetch,
  });
  ok(out.ok && out.text === "Streaming to the client.", "client handshake resolves need_data transparently");
  ok(seen.length >= 3 && seen[0] === "Streaming " && seen[seen.length - 1] === "Streaming to the client.", "client receives the growing answer");
  ok(seen.every((s, i) => i === 0 || s.startsWith(seen[i - 1]!)), "text only ever grows while streaming");
}

/* ================================================================== */
/* 16 — Building blocks                                                 */
/* ================================================================== */
{
  eq(calculate("round(470/7, 2)").rounded, 67.14, "calculator");
  eq(calculate("45% * 200").rounded, 90, "percent literal");
  eq(calculate("max(2,3)+exp(0)").rounded, 4, "functions do not collide with the 'x' multiplier");
  for (const bad of ["process.exit()", "constructor", "1/0", "((("]) { let threw = false; try { calculate(bad); } catch { threw = true; } ok(threw, `rejects ${bad}`); }

  const schema = { properties: { n: { type: "integer" as const, minimum: 1, maximum: 5 }, d: { type: "string" as const, pattern: /^\d{4}-\d{2}-\d{2}$/, patternHint: "YYYY-MM-DD" } }, required: ["n"] };
  const v1 = validateArgs(schema, { n: "9", extra: 1 });
  ok(v1.ok && (v1 as any).value.n === 5 && (v1 as any).notes.length === 2, "coerce, clamp, drop unknown");
  ok(!validateArgs(schema, {}).ok && !validateArgs(schema, { n: 1, d: "tomorrow" }).ok, "required and format enforced");
  ok(!validateArgs(schema, [1]).ok, "arrays are not argument objects");

  const c = createStreamCleaner(); let o = ""; for (const p of ["a < b ", "and c<d ", "fine"]) o += c.push(p); o += c.flush();
  eq(o, "a < b and c<d fine", "ordinary angle brackets pass through");

  const cl = tools.clampResult({ trades: Array.from({ length: 500 }, (_, i) => ({ id: i, note: "x".repeat(200) })) }, 5_000);
  ok(cl.json.length <= 5_000 && cl.truncated && cl.json.includes("_truncated"), "oversized results are shortened and flagged");

  const ds = dailySummaries({ entries: base(), settings: SETTINGS as never, traderName: "T", today: "2026-11-01", dayLogs: [{ date: "2026-10-25", createdAt: 1, reason: "weekend" }] } as never, { limit: 3, sortBy: "worst" });
  eq(ds.totalTradingDays, 8, "daily summaries group by date");
  eq(ds.days[0]!.date, "2026-10-23", "worst day (−$80) comes first");
  ok(ds.days[0]!.netPnl <= ds.days[1]!.netPnl, "sorted worst → best");
  eq(ds.noTradeDays.length, 1, "no-trade days included");

  const prompt = buildSystemPrompt({ trader: "N" });
  ok(/Never reveal tools/.test(prompt) && /ONLY with `calculate`/.test(prompt) && /live data wins/.test(prompt), "prompt carries the grounding, secrecy and freshness rules");
  ok(!/\bgood morning\b.*->/i.test(prompt), "no canned replies in the prompt");
}

/* ================================================================== */
/* 17 — Diagnosable failures + probe endpoint                           */
/* ================================================================== */
{
  // Every model returns 404 "no such model": the trader gets a specific message and the log gets the provider's reason.
  const warns: string[] = [];
  const w = console.warn; console.warn = (...a: unknown[]) => { warns.push(a.join(" ")); };
  globalThis.fetch = (async (_u: unknown, init: RequestInit) => {
    const req = JSON.parse(String(init.body));
    if (req.messages[0]?.content?.startsWith("You maintain")) return new Response("{}", { status: 500 });
    return new Response(JSON.stringify({ error: { message: "No endpoints found for test/m1", code: 404 } }), { status: 404 });
  }) as typeof fetch;
  const r = await ask("hello", J(base()));
  console.warn = w;
  const err = r.events.find((e) => e.t === "error")!;
  eq(err.code, "bad_request", "404 from every model is reported as a rejected request");
  ok(/rejected the request/.test(err.message!) && /model may be unavailable/.test(err.message!), "message points at the model, not a vague failure");
  ok(String((err as any).diag).includes("No endpoints found"), "diagnostic carries the provider's own reason");
  ok(warns.some((x) => x.includes("No endpoints found")), "the server log carries the same reason");
  ok(!JSON.stringify(r.events).includes("sk-or-test"), "no secret in diagnostics");

  // A model that streams only empty content is reported as empty, not as success.
  mockModel(() => ({ text: [""] }));
  const e2 = await ask("hello", J(base()));
  eq(e2.events.find((e) => e.t === "error")!.code, "empty", "empty replies are surfaced");

  // Probe endpoint reports per-model status without exposing the key.
  globalThis.fetch = (async (_u: unknown, init: RequestInit) => {
    const m = JSON.parse(String(init.body)).model;
    return m === "test/m1" ? new Response(JSON.stringify({ error: { message: "model retired" } }), { status: 404 }) : new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
  }) as typeof fetch;
  const pr = await GET(new Request("http://localhost/api/minato/chat?probe=1", { headers: { "x-forwarded-for": "10.2.2.2" } }));
  const body = await pr.text();
  ok(!body.includes("sk-or-test-SECRET-999"), "probe never returns the key");
  const pj = JSON.parse(body);
  eq(pj.probe.map((p: any) => [p.model, p.ok]), [["test/m1", false], ["test/m2", true]], "probe shows which configured model actually works");
  ok(pj.probe[0].error.includes("model retired"), "probe shows the provider's error text");
}

globalThis.fetch = realFetch;
console.log(`=== MINATO AGENT: ${passed} assertions passed ===`);
