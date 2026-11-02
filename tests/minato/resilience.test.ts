/**
 * MINATO RESILIENCE — regression tests for the "My reasoning engine rejected the request" outage and the move of
 * Minato's memory from Supabase to Google Drive.
 *
 *  1. Model config: dead slugs are dropped, free chains get the free router, paid chains are left alone.
 *  2. complete(): a dead model (404) is skipped without disabling tools; oversized max_tokens is retried smaller;
 *     when every free model is rejected the live catalogue is consulted.
 *  3. DriveKnowledgeStore against a fake Google Drive: persistence, merge-on-flush, corruption safety, failure.
 *  4. Failed replies are never replayed to the model.
 */
import { strict as assert } from "node:assert";

process.env.OPENROUTER_API_KEY = "sk-or-test-resilience";
const llm = await import("../../src/lib/minato/agent/llm.ts");
const ks = await import("../../src/lib/minato/agent/knowledge-store.ts");
const { isFailedReply } = await import("../../src/lib/minato/agent/failed-reply.ts");

let passed = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); passed++; };
const eq = <T,>(a: T, b: T, m: string) => { assert.deepEqual(a, b, m); passed++; };

/* ------------------------------------------------------------------ */
/*  1 — configuration                                                  */
/* ------------------------------------------------------------------ */
{
  const dead = llm.getAgentLlmConfig({ MINATO_MODEL: "nvidia/nemotron-3-super-120b-a12b:free", MINATO_FALLBACK_MODEL: "z-ai/glm-5.2:free" } as unknown as NodeJS.ProcessEnv)!;
  eq(dead.models, ["nvidia/nemotron-3-super-120b-a12b:free", "openrouter/free"], "the retired glm slug is dropped; the free router closes the chain");
  ok(dead.discover === true, "a free chain may discover live models");

  const empty = llm.getAgentLlmConfig({} as unknown as NodeJS.ProcessEnv)!;
  ok(empty.models.includes("openrouter/free") && !empty.models.includes("z-ai/glm-5.2:free"), "default chain is sane");

  const paid = llm.getAgentLlmConfig({ MINATO_MODELS: "anthropic/claude-sonnet-4.6, z-ai/glm-5.2:free" } as unknown as NodeJS.ProcessEnv)!;
  eq(paid.models, ["anthropic/claude-sonnet-4.6"], "a paid chain is never diluted with free models");
  ok(paid.discover === false, "…and never auto-switches to a free model");

  const custom = llm.getAgentLlmConfig({ MINATO_MODEL: "foo:free", MINATO_LLM_ENDPOINT: "http://localhost:9/v1/chat/completions" } as unknown as NodeJS.ProcessEnv)!;
  ok(custom.discover === false, "discovery is OpenRouter-only");
  const off = llm.getAgentLlmConfig({ MINATO_MODEL: "foo:free", MINATO_DISCOVER_MODELS: "off" } as unknown as NodeJS.ProcessEnv)!;
  ok(off.discover === false, "discovery can be switched off");

  const list = llm.pickFreeToolModels([
    { id: "a/free-tools:free", context_length: 128_000, pricing: { prompt: "0", completion: "0" }, supported_parameters: ["tools", "temperature"] },
    { id: "b/free-notools:free", context_length: 256_000, pricing: { prompt: "0", completion: "0" }, supported_parameters: ["temperature"] },
    { id: "c/paid", context_length: 200_000, pricing: { prompt: "0.000003", completion: "0.000015" }, supported_parameters: ["tools"] },
    { id: "d/free-tiny:free", context_length: 4_000, pricing: { prompt: "0", completion: "0" }, supported_parameters: ["tools"] },
    { id: "e/free-expiring:free", context_length: 300_000, pricing: { prompt: "0", completion: "0" }, supported_parameters: ["tools"], expiration_date: "2026-11-02" },
    { id: "f/free-big:free", context_length: 1_000_000, pricing: { prompt: "0", completion: "0" }, supported_parameters: ["tools"] },
    { id: "openrouter/free", context_length: 200_000, pricing: { prompt: "0", completion: "0" }, supported_parameters: ["tools"] },
  ], [], 5, new Date("2026-11-02T00:00:00Z"));
  eq(list, ["f/free-big:free", "a/free-tools:free"], "only live, free, tool-capable, roomy models — largest first");
  ok(llm.looksLikeDeadModel(404, "") && llm.looksLikeDeadModel(400, "No endpoints found for x:free") && !llm.looksLikeDeadModel(400, "tools not supported"), "dead-model detection");
  ok(llm.looksLikeTokenLimit("max_tokens is too large: 8000") && !llm.looksLikeTokenLimit("tools not supported"), "token-limit detection");
}

/* ------------------------------------------------------------------ */
/*  2 — complete()                                                     */
/* ------------------------------------------------------------------ */
type Body = { model: string; max_tokens: number; tools?: unknown[]; reasoning?: unknown };
const reply = (text = "Hello Nandigam.") => new Response(JSON.stringify({ choices: [{ message: { content: text }, finish_reason: "stop" }] }), { status: 200 });
const fail = (status: number, message: string) => new Response(JSON.stringify({ error: { message } }), { status });
const baseCfg = (models: string[], extra: Record<string, unknown> = {}) => ({ apiKey: "k", models, endpoint: "https://openrouter.ai/api/v1/chat/completions", maxOutputTokens: 8000, temperature: 0.3, reasoningEffort: null, ...extra }) as import("../../src/lib/minato/agent/llm.ts").LlmConfig;
const TOOLS = [{ type: "function" as const, function: { name: "t", description: "d", parameters: {} } }];
const run = (cfg: ReturnType<typeof baseCfg>, fetchImpl: typeof fetch) => llm.complete({ config: cfg, messages: [{ role: "user", content: "hi" }], tools: TOOLS, stream: false, deadline: Date.now() + 60_000, fetchImpl, sleep: async () => undefined });

{
  // A retired model must not flip the whole turn into "tools rejected" text mode.
  const seen: Body[] = [];
  const r = await run(baseCfg(["dead/model:free", "live/model:free"]), (async (_u: string, init: RequestInit) => {
    const b = JSON.parse(String(init.body)) as Body; seen.push(b);
    return b.model === "dead/model:free" ? fail(404, "No endpoints found for dead/model:free.") : reply();
  }) as typeof fetch);
  ok(r.ok && r.model === "live/model:free", "a 404 model is skipped and the next one answers");
  ok(!(r as { toolsRejected?: boolean }).toolsRejected, "a dead model is not mistaken for 'tools unsupported'");
  eq(seen.filter((b) => b.model === "dead/model:free").length, 1, "the dead model is tried once, not four times");
  ok(seen.find((b) => b.model === "live/model:free")!.tools?.length === 1, "native tools are still offered to the live model");
}
{
  // Output budget too large for the model → retry the same model smaller.
  const caps: number[] = [];
  const r = await run(baseCfg(["small/ctx:free"]), (async (_u: string, init: RequestInit) => {
    const b = JSON.parse(String(init.body)) as Body; caps.push(b.max_tokens);
    return b.max_tokens > 4000 ? fail(400, "max_tokens (8000) exceeds the model's output limit of 4096") : reply();
  }) as typeof fetch);
  ok(r.ok, "an oversized max_tokens is retried and succeeds");
  ok(caps.length === 2 && caps[1]! <= 2048 && caps[1]! >= 1024, `smaller budget on retry (${caps.join("→")})`);
}
{
  // Genuine tools refusal still degrades to text-tool mode (existing behaviour preserved).
  const r = await run(baseCfg(["no/tools:free"]), (async (_u: string, init: RequestInit) => {
    const b = JSON.parse(String(init.body)) as Body;
    return b.tools ? fail(400, "tools are not supported by this model") : reply();
  }) as typeof fetch);
  ok(!r.ok && (r as { toolsRejected?: boolean }).toolsRejected === true, "a real tools refusal still reports toolsRejected");
}
{
  // Everything configured is gone → ask the live catalogue and use what it names.
  llm._resetCatalogue();
  const hits: string[] = [];
  const r = await run(baseCfg(["gone/a:free", "gone/b:free", "openrouter/free"], { discover: true, modelsEndpoint: "https://openrouter.ai/api/v1/models" }), (async (u: string, init?: RequestInit) => {
    hits.push(String(u));
    if (String(u).endsWith("/models")) return new Response(JSON.stringify({ data: [
      { id: "gone/a:free", context_length: 900_000, pricing: { prompt: "0", completion: "0" }, supported_parameters: ["tools"] },
      { id: "fresh/model:free", context_length: 128_000, pricing: { prompt: "0", completion: "0" }, supported_parameters: ["tools"] },
      { id: "paid/model", context_length: 128_000, pricing: { prompt: "1", completion: "1" }, supported_parameters: ["tools"] },
    ] }), { status: 200 });
    const b = JSON.parse(String(init!.body)) as Body;
    return b.model === "fresh/model:free" ? reply("Found you.") : fail(404, "No endpoints found for " + b.model);
  }) as typeof fetch);
  ok(r.ok && r.model === "fresh/model:free", "discovery finds a live free model when all configured ones are rejected");
  ok(!hits.some((u) => u.includes("paid/model")), "never a paid model");
  const again = await run(baseCfg(["gone/c:free"], { discover: true }), (async (u: string, init?: RequestInit) => {
    hits.push(String(u));
    if (String(u).endsWith("/models")) throw new Error("catalogue must come from cache");
    const b = JSON.parse(String(init!.body)) as Body;
    return b.model === "fresh/model:free" ? reply() : fail(404, "No endpoints found");
  }) as typeof fetch);
  ok(again.ok, "the catalogue is cached between turns");
}
{
  // Discovery is not used for rate limits / outages, only for "rejected" models, and not when disabled.
  llm._resetCatalogue();
  let asked = false;
  const limited = await run(baseCfg(["busy/a:free"], { discover: true }), (async (u: string) => { if (String(u).endsWith("/models")) asked = true; return fail(429, "rate limited"); }) as typeof fetch);
  ok(!limited.ok && limited.failure === "rate_limited" && !asked, "a rate-limit is reported as a rate-limit, not papered over");
  const off = await run(baseCfg(["gone/z:free"], { discover: false }), (async (u: string) => { if (String(u).endsWith("/models")) asked = true; return fail(404, "No endpoints found for gone/z:free"); }) as typeof fetch);
  ok(!off.ok && off.failure === "bad_request" && !asked, "discovery off → honest failure");
  ok(!off.ok && /gone\/z:free/.test(off.detail ?? ""), "the failure names the model and the provider's reason");
  ok(llm.failureMessage("bad_request").includes("rejected the request"), "user-facing message unchanged");
}

/* ------------------------------------------------------------------ */
/*  3 — Drive knowledge store, against a fake Google Drive              */
/* ------------------------------------------------------------------ */
class FakeDrive {
  files = new Map<string, { id: string; folder: string; name: string; body: string }>();
  calls = 0;
  failWith: number | null = null;
  private n = 0;
  fetch = (async (url: string, init: RequestInit = {}) => {
    this.calls++;
    if (this.failWith) return new Response("{}", { status: this.failWith });
    const u = new URL(url);
    const m = init.method ?? "GET";
    if (m === "GET" && u.pathname === "/drive/v3/files") {
      const q = u.searchParams.get("q") ?? "";
      const name = /name = '([^']+)'/.exec(q)?.[1];
      const folder = /'([^']+)' in parents/.exec(q)?.[1];
      const hit = [...this.files.values()].find((f) => f.name === name && f.folder === folder);
      return new Response(JSON.stringify({ files: hit ? [{ id: hit.id }] : [] }), { status: 200 });
    }
    if (m === "GET" && u.pathname.startsWith("/drive/v3/files/")) {
      const f = [...this.files.values()].find((x) => x.id === u.pathname.split("/").pop());
      return f ? new Response(f.body, { status: 200 }) : new Response("{}", { status: 404 });
    }
    if ((m === "POST" || m === "PATCH") && u.pathname.startsWith("/upload/drive/v3/files")) {
      const text = Buffer.from(init.body as Buffer).toString("utf8");
      const parts = text.split(/--edgebook-[0-9a-f]+/).filter((p) => p.includes("Content-Type"));
      const meta = JSON.parse(parts[0]!.split("\r\n\r\n")[1]!.trim()) as { name: string; parents?: string[] };
      const body = parts[1]!.split("\r\n\r\n").slice(1).join("\r\n\r\n").replace(/\r\n$/, "");
      const existingId = m === "PATCH" ? u.pathname.split("/").pop()! : null;
      const cur = existingId ? [...this.files.values()].find((f) => f.id === existingId) : null;
      if (cur) cur.body = body;
      else { const id = `f${++this.n}`; this.files.set(id, { id, folder: meta.parents![0]!, name: meta.name, body }); }
      return new Response(JSON.stringify({ id: "x" }), { status: 200 });
    }
    return new Response("{}", { status: 400 });
  }) as typeof fetch;
  store(folderId = "journals-1") {
    return new ks.DriveKnowledgeStore({ folderId, run: <T,>(op: (t: string) => Promise<T>) => op("tok"), fetchImpl: this.fetch });
  }
  doc() { const f = [...this.files.values()].find((x) => x.name === ks.KNOWLEDGE_FILE); return f ? JSON.parse(f.body) as { v: number; rows: { id: string; content: string; fingerprint: string; timesSeen: number }[] } : null; }
}
{
  const drive = new FakeDrive();
  const a = drive.store();
  eq(await a.list(), [], "a brand-new trader has an empty notebook (no file yet)");
  const s1 = await a.save({ kind: "goal", content: "Reach $26,000 by the end of November.", source: "trader_stated" });
  ok(s1.ok && s1.created, "save works in memory");
  eq(drive.doc(), null, "nothing is written to Drive until flush (one write per request)");
  await a.save({ kind: "habit", content: "Over-trades after two losses in a row.", source: "analysis", asOf: "2026-11-01" });
  ok(await a.flush(), "flush succeeds");
  eq(drive.doc()!.rows.length, 2, "both notes are persisted in ONE file");
  eq(drive.files.size, 1, "exactly one file in the folder");
  ok([...drive.files.values()][0]!.folder === "journals-1", "…in the trader's own folder");

  const b = drive.store(); // a later request / a different server instance
  const listed = await b.list();
  eq(listed.map((x: { kind: string }) => x.kind).sort(), ["goal", "habit"], "a new request sees what the last one learned");
  ok(new Set(listed.map((x: { id: string }) => x.id)).size === 2 && listed.every((x: { id: string }) => x.id.startsWith("ins_")), "ids are unique across requests");
  const again = await b.save({ kind: "goal", content: "reach $26,000 by the end of november", source: "trader_stated" });
  ok(again.ok && !again.created, "re-stating a known fact reinforces it instead of duplicating");
  await b.flush();
  eq(drive.doc()!.rows.find((r) => /^reach/i.test(r.content))!.timesSeen, 2, "…and the count is persisted");
  const cp = await b.save({ kind: "progress", content: "Equity $25,215, +0.9% since start.", source: "checkpoint", asOf: "2026-11-01", fingerprint: "checkpoint:2026-11-01" });
  ok(cp.ok, "checkpoint saved");
  eq((await b.latestCheckpoint("2026-11-02"))?.asOf, "2026-11-01", "latest checkpoint is found");
}
{
  // Two requests in flight at once: neither erases the other.
  const drive = new FakeDrive();
  const a = drive.store(), b = drive.store();
  await a.list(); await b.list(); // both loaded an empty notebook
  await a.save({ kind: "goal", content: "Reach $26,000 by the end of November.", source: "trader_stated" });
  await b.save({ kind: "risk", content: "Never risk more than $100 per trade.", source: "trader_stated" });
  await a.flush(); await b.flush();
  eq(drive.doc()!.rows.map((r) => r.content).sort(), ["Never risk more than $100 per trade.", "Reach $26,000 by the end of November."], "concurrent flushes merge instead of last-write-wins");
  // The same fact learned by both → one row.
  const c = drive.store(), d = drive.store();
  await c.list(); await d.list();
  await c.save({ kind: "habit", content: "Hesitates on A+ setups after a loss.", source: "analysis" });
  await d.save({ kind: "habit", content: "Hesitates on A+ setups after a loss.", source: "analysis" });
  await c.flush(); await d.flush();
  eq(drive.doc()!.rows.filter((r) => r.content.startsWith("Hesitates")).length, 1, "duplicate facts from two instances collapse");
}
{
  // Drive is down: chat must not break, and nothing is claimed saved.
  const drive = new FakeDrive(); drive.failWith = 503;
  const s = drive.store();
  eq(await s.list(), [], "Drive down → empty memory, no throw");
  const r = await s.save({ kind: "goal", content: "Reach $26,000 by the end of November.", source: "trader_stated" });
  ok(!r.ok, "save reports failure honestly");
  eq(await s.latestCheckpoint(), null, "no checkpoint, no throw");
  ok(drive.calls <= 3, `stops hammering a broken Drive (${drive.calls} calls)`);

  // A corrupt file is never overwritten.
  const d2 = new FakeDrive();
  d2.files.set("c1", { id: "c1", folder: "journals-1", name: ks.KNOWLEDGE_FILE, body: "{ this is not json" });
  const s2 = d2.store();
  eq(await s2.list(), [], "unreadable notebook → empty view");
  ok(!(await s2.save({ kind: "goal", content: "Reach $26,000 by the end of November.", source: "trader_stated" })).ok, "…and saving is refused");
  eq(d2.files.get("c1")!.body, "{ this is not json", "the original file is left untouched for recovery");

  // A failed flush keeps the rows so a later flush can retry.
  const d3 = new FakeDrive();
  const s3 = d3.store();
  await s3.list();
  await s3.save({ kind: "goal", content: "Reach $26,000 by the end of November.", source: "trader_stated" });
  d3.failWith = 500;
  ok(!(await s3.flush()), "flush reports failure");
  d3.failWith = null;
  // (circuit breaker may have tripped for this request; a NEW request still sees an empty file — nothing was lost silently)
  eq(d3.doc(), null, "nothing half-written");

  const none = await ks.openKnowledgeStore(null);
  ok(none.backend === "none" && (await none.save({ kind: "goal", content: "Reach $26,000 by the end of November.", source: "trader_stated" })).ok === false, "no session → no memory, no crash");
}
{
  const mk = (i: number, source: string, status = "active") => ({ id: `r${i}`, kind: "fact", content: `note ${i}`, evidence: [], source, confidence: 0.5, status, timesSeen: 1, firstSeen: `2026-01-${String(1 + (i % 28)).padStart(2, "0")}T00:00:00Z`, lastSeen: `2026-01-${String(1 + (i % 28)).padStart(2, "0")}T00:00:00Z`, asOf: null, data: {}, fingerprint: `fp${i}` });
  const rows = [...Array.from({ length: 300 }, (_, i) => mk(i, "analysis")), ...Array.from({ length: 100 }, (_, i) => mk(1000 + i, "analysis", "superseded")), ...Array.from({ length: 50 }, (_, i) => mk(2000 + i, "trader_stated"))];
  const merged = ks.mergeRows(rows as never, [], 400);
  eq(merged.length, 400, "the file is capped");
  ok(merged.filter((r: { source: string }) => r.source === "trader_stated").length === 50, "what the trader told Minato is never evicted");
  ok(merged.filter((r: { status: string }) => r.status !== "active").length === 50, "superseded notes are evicted first");
}

/* ------------------------------------------------------------------ */
/*  4 — failed replies are not history                                  */
/* ------------------------------------------------------------------ */
{
  ok(isFailedReply({ role: "buddy", text: "anything", isError: true }), "flagged error");
  ok(isFailedReply({ role: "buddy", text: "My reasoning engine rejected the request — the configured model may be unavailable or not support this kind of request." }), "the exact notice from the screenshot is recognised (already saved in existing threads)");
  ok(isFailedReply({ role: "buddy", text: "My reasoning engine rejected the request — … (z-ai/glm-5.2:free: 404 No endpoints found)" }), "…with the new provider detail too");
  ok(isFailedReply({ role: "buddy", text: "I couldn't reach the server. Check your connection and try again." }), "network notice");
  ok(!isFailedReply({ role: "buddy", text: "Your win rate is 63% over 8 trades." }), "a real answer is kept");
  ok(!isFailedReply({ role: "user", text: "My reasoning engine is broken, why?" }), "the trader's own words are never dropped");
}

console.log(`=== MINATO RESILIENCE: ${passed} assertions passed ===`);
