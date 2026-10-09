/* Run: node --experimental-strip-types tests/friends/state.test.ts */
import { strict as assert } from "node:assert";
import {
  cleanName,
  compareMetrics,
  deriveView,
  initialState,
  normalizeHandle,
  parseSnapshot,
  reducer,
  relationFor,
  sortFriends,
  type Action,
  type FriendsState,
  type Metrics,
  type Snapshot,
} from "../../src/components/friends/friends-state.ts";

const metrics = (handle: string, over: Partial<Metrics> = {}): Metrics => ({
  handle,
  displayName: handle.toUpperCase(),
  trades: 10,
  totalPnl: 100,
  returnPct: 1,
  winRate: 50,
  processScore: 50,
  edgePoints: 100,
  ...over,
});

const snap = (over: Partial<Snapshot> = {}): Snapshot => ({ friends: [], incoming: [], outgoing: [], ...over });
const run = (actions: Action[], from: FriendsState = initialState) => actions.reduce(reducer, from);

let tests = 0;
const test = (name: string, fn: () => void) => {
  fn();
  tests += 1;
  console.log(`  ✓ ${name}`);
};

console.log("friends-state");

test("loading → ready on first snapshot; load error only when there is nothing to show", () => {
  assert.equal(initialState.load, "loading");
  const failed = run([{ type: "load/fail", reason: "network" }]);
  assert.equal(failed.load, "error");
  assert.equal(failed.loadError, "network");
  const retried = reducer(failed, { type: "load/retry" });
  assert.equal(retried.load, "loading");
  const ready = run([{ type: "snapshot", data: snap(), startedAt: 1 }]);
  assert.equal(ready.load, "ready");
  // A later poll failure keeps the data and just flags it.
  const stale = reducer(ready, { type: "load/fail", reason: "network" });
  assert.equal(stale.load, "ready");
  assert.equal(stale.refreshFailed, true);
  assert.equal(reducer(stale, { type: "snapshot", data: snap(), startedAt: 2 }).refreshFailed, false);
});

test("sending a request appears instantly, before the server answers", () => {
  const s = run([
    { type: "snapshot", data: snap(), startedAt: 1 },
    { type: "op/start", op: { key: "a", kind: "send", handle: "kai_1", displayName: "Kai", tmpId: "tmp-a" } },
  ]);
  const v = deriveView(s);
  assert.equal(v.outgoing.length, 1);
  assert.equal(v.outgoing[0].handle, "kai_1");
  assert.equal(v.outgoing[0].sending, true);
  assert.equal(v.outgoing[0].syncing, true);
});

test("a stale poll that started BEFORE the send settled cannot erase the optimistic row", () => {
  let s = run([
    { type: "snapshot", data: snap(), startedAt: 1 },
    { type: "op/start", op: { key: "a", kind: "send", handle: "kai_1", displayName: "Kai", tmpId: "tmp-a" } },
    { type: "op/settle", key: "a", at: 5 },
  ]);
  // Poll began at clock 3 (before the settle at 5) and returns without the request.
  s = reducer(s, { type: "snapshot", data: snap(), startedAt: 3 });
  assert.equal(deriveView(s).outgoing.length, 1, "row must survive a stale snapshot");
  assert.equal(deriveView(s).outgoing[0].sending, false);
  assert.equal(deriveView(s).outgoing[0].syncing, true);
});

test("a snapshot fetched AFTER settle reconciles: temp row becomes the real one, same key", () => {
  let s = run([
    { type: "snapshot", data: snap(), startedAt: 1 },
    { type: "op/start", op: { key: "a", kind: "send", handle: "Kai_1", displayName: "Kai", tmpId: "tmp-a" } },
    { type: "op/settle", key: "a", at: 5 },
  ]);
  const before = deriveView(s).outgoing[0];
  s = reducer(s, { type: "snapshot", data: snap({ outgoing: [{ id: "fr-real", handle: "kai_1", displayName: "Kai" }] }), startedAt: 6 });
  assert.equal(s.ops.length, 0, "op dropped once the server has seen it");
  const after = deriveView(s).outgoing;
  assert.equal(after.length, 1, "no duplicate");
  assert.equal(after[0].id, "fr-real");
  assert.equal(after[0].syncing, false);
  assert.equal(after[0].key, before.key, "React key is stable across the swap, so there is no remount");
});

test("a failed send rolls back instantly", () => {
  const s = run([
    { type: "snapshot", data: snap(), startedAt: 1 },
    { type: "op/start", op: { key: "a", kind: "send", handle: "kai_1", displayName: "Kai", tmpId: "tmp-a" } },
    { type: "op/fail", key: "a" },
  ]);
  assert.equal(deriveView(s).outgoing.length, 0);
});

test("accepting moves a request into Friends immediately, with stats still syncing", () => {
  let s = run([
    { type: "snapshot", data: snap({ incoming: [{ id: "fr-1", handle: "ana", displayName: "Ana" }] }), startedAt: 1 },
    { type: "op/start", op: { key: "a", kind: "accept", id: "fr-1", handle: "ana", displayName: "Ana" } },
  ]);
  let v = deriveView(s);
  assert.equal(v.incoming.length, 0);
  assert.equal(v.friends.length, 1);
  assert.equal(v.friends[0].metrics, null);
  assert.equal(v.friends[0].syncing, true);
  assert.equal(v.friends[0].id, "fr-1");
  // Server confirms with real stats.
  s = run([
    { type: "op/settle", key: "a", at: 4 },
    { type: "snapshot", data: snap({ friends: [{ id: "fr-1", ...metrics("ana", { processScore: 80 }) }] }), startedAt: 5 },
  ], s);
  v = deriveView(s);
  assert.equal(v.friends.length, 1, "no duplicate after reconcile");
  assert.equal(v.friends[0].metrics?.processScore, 80);
  assert.equal(v.friends[0].syncing, false);
});

test("a failed accept restores the request and removes the optimistic friend", () => {
  const s = run([
    { type: "snapshot", data: snap({ incoming: [{ id: "fr-1", handle: "ana", displayName: "Ana" }] }), startedAt: 1 },
    { type: "op/start", op: { key: "a", kind: "accept", id: "fr-1", handle: "ana", displayName: "Ana" } },
    { type: "op/fail", key: "a" },
  ]);
  const v = deriveView(s);
  assert.equal(v.incoming.length, 1);
  assert.equal(v.friends.length, 0);
});

test("decline / cancel / remove hide the row until the server agrees, and stay hidden through stale polls", () => {
  const base = snap({
    friends: [{ id: "f1", ...metrics("bo") }],
    incoming: [{ id: "i1", handle: "cy", displayName: "Cy" }],
    outgoing: [{ id: "o1", handle: "di", displayName: "Di" }],
  });
  let s = run([
    { type: "snapshot", data: base, startedAt: 1 },
    { type: "op/start", op: { key: "1", kind: "remove", id: "f1" } },
    { type: "op/start", op: { key: "2", kind: "decline", id: "i1" } },
    { type: "op/start", op: { key: "3", kind: "cancel", id: "o1" } },
    { type: "op/settle", key: "1", at: 10 },
    { type: "op/settle", key: "2", at: 11 },
    { type: "op/settle", key: "3", at: 12 },
  ]);
  let v = deriveView(s);
  assert.deepEqual([v.friends.length, v.incoming.length, v.outgoing.length], [0, 0, 0]);
  s = reducer(s, { type: "snapshot", data: base, startedAt: 8 }); // stale
  v = deriveView(s);
  assert.deepEqual([v.friends.length, v.incoming.length, v.outgoing.length], [0, 0, 0]);
  s = reducer(s, { type: "snapshot", data: snap(), startedAt: 13 }); // fresh
  assert.equal(s.ops.length, 0);
});

test("a hidden-then-failed removal brings the friend back", () => {
  const s = run([
    { type: "snapshot", data: snap({ friends: [{ id: "f1", ...metrics("bo") }] }), startedAt: 1 },
    { type: "op/start", op: { key: "1", kind: "remove", id: "f1" } },
    { type: "op/fail", key: "1" },
  ]);
  assert.equal(deriveView(s).friends.length, 1);
});

test("an in-flight op is never dropped by a snapshot (not settled yet)", () => {
  const s = run([
    { type: "snapshot", data: snap(), startedAt: 1 },
    { type: "op/start", op: { key: "a", kind: "send", handle: "kai_1", displayName: "Kai", tmpId: "tmp-a" } },
    { type: "snapshot", data: snap(), startedAt: 9 },
  ]);
  assert.equal(s.ops.length, 1);
  assert.equal(deriveView(s).outgoing.length, 1);
});

test("out-of-order snapshots are ignored", () => {
  const s = run([
    { type: "snapshot", data: snap({ friends: [{ id: "f1", ...metrics("new") }] }), startedAt: 7 },
    { type: "snapshot", data: snap(), startedAt: 4 },
  ]);
  assert.equal(deriveView(s).friends.length, 1);
});

test("a request the other person already sent us is not duplicated by an optimistic send", () => {
  const s = run([
    { type: "snapshot", data: snap({ incoming: [{ id: "i1", handle: "kai_1", displayName: "Kai" }] }), startedAt: 1 },
    { type: "op/start", op: { key: "a", kind: "send", handle: "kai_1", displayName: "Kai", tmpId: "tmp-a" } },
  ]);
  const v = deriveView(s);
  assert.equal(v.outgoing.length, 0);
  assert.equal(v.incoming.length, 1);
});

test("relationFor is case-insensitive and tells friend / incoming / outgoing / none", () => {
  const s = run([
    {
      type: "snapshot",
      startedAt: 1,
      data: snap({
        friends: [{ id: "f1", ...metrics("bo") }],
        incoming: [{ id: "i1", handle: "cy", displayName: "Cy" }],
        outgoing: [{ id: "o1", handle: "di", displayName: "Di" }],
      }),
    },
  ]);
  const v = deriveView(s);
  assert.equal(relationFor(v, "BO").relation, "friend");
  assert.equal(relationFor(v, "cy").relation, "incoming");
  assert.equal(relationFor(v, "Di").relation, "outgoing");
  assert.equal(relationFor(v, "zed").relation, "none");
});

test("never surfaces an email address as a name", () => {
  assert.equal(cleanName("someone@example.com", "someone"), "someone");
  assert.equal(cleanName(undefined, "kai_1"), "kai_1");
  assert.equal(cleanName("  Kai ", "kai_1"), "Kai");
  const s = run([{ type: "snapshot", data: snap({ incoming: [{ id: "i1", handle: "kai_1", displayName: "kai@x.io" }] }), startedAt: 1 }]);
  assert.equal(deriveView(s).incoming[0].displayName, "kai_1");
});

test("handle normalisation matches the server rule", () => {
  assert.equal(normalizeHandle("  @Trader_001 "), "trader_001");
  assert.equal(normalizeHandle("@@x"), "x");
});

test("sorting: by process by default, unsynced friends sink, ties fall back to name", () => {
  const view = deriveView(
    run([
      {
        type: "snapshot",
        startedAt: 1,
        data: snap({
          friends: [
            { id: "1", ...metrics("a", { displayName: "Zed", processScore: 70, edgePoints: 5, winRate: 90 }) },
            { id: "2", ...metrics("b", { displayName: "Amy", processScore: 70, edgePoints: 50, winRate: 10 }) },
            { id: "3", ...metrics("c", { displayName: "Max", processScore: 95, edgePoints: 1, winRate: null }) },
          ],
        }),
      },
      { type: "op/start", op: { key: "x", kind: "accept", id: "9", handle: "new", displayName: "New" } },
    ]),
  );
  assert.deepEqual(sortFriends(view.friends, "process").map((f) => f.displayName), ["Max", "Amy", "Zed", "New"]);
  assert.deepEqual(sortFriends(view.friends, "points").map((f) => f.displayName), ["Amy", "Zed", "Max", "New"]);
  assert.deepEqual(sortFriends(view.friends, "win").map((f) => f.displayName), ["Zed", "Amy", "Max", "New"]);
});

test("parseSnapshot tolerates garbage", () => {
  assert.deepEqual(parseSnapshot(null), snap());
  assert.deepEqual(parseSnapshot({ friends: "nope", pendingIncoming: [{ id: 3 }, { id: "ok" }] }).incoming, [{ id: "ok" }]);
  assert.equal(parseSnapshot({ friends: [{ id: "1" }] }).friends.length, 0, "a friend without a handle is dropped");
});

test("head to head: scored rows decide the lead, trading days are informational", () => {
  const me = metrics("me", { processScore: 80, edgePoints: 10, winRate: 40, returnPct: 5, trades: 3 });
  const them = metrics("kai", { processScore: 60, edgePoints: 90, winRate: 40, returnPct: -2, trades: 99 });
  const v = compareMetrics(me, them);
  assert.equal(v.scored, 4);
  assert.equal(v.yourLeads, 2); // process, return
  assert.equal(v.theirLeads, 1); // points
  assert.equal(v.rows.find((r) => r.key === "win")?.lead, "tie");
  assert.equal(v.rows.find((r) => r.key === "trades")?.lead, null);
  // A missing win rate can't be compared.
  assert.equal(compareMetrics({ ...me, winRate: null }, them).rows.find((r) => r.key === "win")?.lead, "tie");
});

console.log(`\n${tests} passed`);
