import { strict as assert } from "node:assert";
import { UpstreamError, createLseClient, createMemo, parseRetryAfter } from "../../src/lib/server/lse-client.ts";

const noSleep = async () => {};
const chunk = { start: "2026-10-01", end: "2026-10-02", limit: 2000 };
const ok = (rows: unknown[]) => new Response(JSON.stringify(rows), { status: 200 });
const status = (n: number, headers: Record<string, string> = {}) => new Response("{}", { status: n, headers });

async function main() {
  // ---- Retry-After parsing
  assert.equal(parseRetryAfter("3"), 3);
  assert.equal(parseRetryAfter(null), undefined);
  assert.equal(parseRetryAfter("Wed, 21 Oct 2026 07:28:05 GMT", Date.parse("Wed, 21 Oct 2026 07:28:00 GMT")), 5);

  // ---- 429s are retried and the request ultimately succeeds (the original bug: first 429 was fatal)
  {
    let calls = 0;
    const waits: number[] = [];
    const c = createLseClient({
      fetchImpl: (async () => (++calls <= 2 ? status(429, { "retry-after": "1" }) : ok([{ ts: "2026-10-01 13:30:00.000000", open: 1 }]))) as typeof fetch,
      sleep: async (ms) => { waits.push(ms); },
    });
    const rows = await c.fetchChunk("k", "NQ.F", "1m", chunk);
    assert.equal(rows.length, 1);
    assert.equal(calls, 3, "two 429s then success");
    assert.deepEqual(waits, [1100, 1100], "honours Retry-After");
  }

  // ---- persistent 429 → rate_limited error after maxAttempts (not an infinite loop)
  {
    let calls = 0;
    const c = createLseClient({ fetchImpl: (async () => { calls++; return status(429); }) as typeof fetch, sleep: noSleep, maxAttempts: 3 });
    await assert.rejects(c.fetchChunk("k", "NQ.F", "1m", chunk), (e: unknown) => e instanceof UpstreamError && e.kind === "rate_limited");
    assert.equal(calls, 3);
  }

  // ---- 5xx and network errors are retried; 404 / 401 are not
  {
    let calls = 0;
    const c = createLseClient({
      fetchImpl: (async () => { calls++; if (calls === 1) throw new Error("socket hang up"); if (calls === 2) return status(503); return ok([]); }) as typeof fetch,
      sleep: noSleep,
    });
    assert.deepEqual(await c.fetchChunk("k", "NQ.F", "1m", chunk), []);
    assert.equal(calls, 3);

    for (const [code, kind] of [[404, "unknown_symbol"], [401, "provider"]] as const) {
      let n = 0;
      const c2 = createLseClient({ fetchImpl: (async () => { n++; return status(code); }) as typeof fetch, sleep: noSleep });
      await assert.rejects(c2.fetchChunk("k", "NQ.F", "1m", chunk), (e: unknown) => e instanceof UpstreamError && e.kind === kind);
      assert.equal(n, 1, `HTTP ${code} must not be retried`);
    }
  }

  // ---- the gate: never more than maxInflight simultaneous upstream calls, even for a 12-request burst
  {
    let active = 0, peak = 0;
    const c = createLseClient({
      maxInflight: 2,
      fetchImpl: (async () => { active++; peak = Math.max(peak, active); await new Promise((r) => setTimeout(r, 5)); active--; return ok([]); }) as typeof fetch,
      sleep: noSleep,
    });
    await Promise.all(Array.from({ length: 12 }, () => c.fetchChunk("k", "NQ.F", "1m", chunk)));
    assert.equal(peak, 2, "burst is queued, not fired at once");
  }

  // ---- memo: concurrent identical requests share ONE upstream call; failures are not remembered
  {
    let runs = 0;
    const m = createMemo<number>(60_000, 5);
    const slow = async () => { runs++; await new Promise((r) => setTimeout(r, 5)); return 42; };
    const [a, b] = await Promise.all([m.run("k", slow), m.run("k", slow)]);
    assert.equal(a.value + b.value, 84);
    assert.equal(runs, 1, "StrictMode double-fire = one upstream fetch");
    assert.equal((await m.run("k", slow)).hit, true, "then served from memory");
    assert.equal(runs, 1);

    const f = createMemo<number>(60_000, 5);
    await assert.rejects(f.run("x", async () => { throw new Error("boom"); }));
    assert.equal((await f.run("x", async () => 7)).value, 7, "a failure is retried, not cached");

    // not cacheable (e.g. empty / truncated) → recomputed
    const e = createMemo<number>(60_000, 5);
    let n = 0;
    await e.run("y", async () => ++n, (v) => v > 5);
    await e.run("y", async () => ++n, (v) => v > 5);
    assert.equal(n, 2);

    // bounded size, oldest evicted
    const small = createMemo<number>(60_000, 2);
    for (const k of ["a", "b", "c"]) await small.run(k, async () => 1);
    assert.equal(small.size(), 2);
  }

  console.log("lse-client tests passed");
}

await main();
