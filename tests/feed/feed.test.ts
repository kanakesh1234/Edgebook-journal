import { strict as assert } from "node:assert";
import {
  LIMITS, emptyFeedState, normalizeFeedState, toggleFavorite, createCollection, renameCollection, deleteCollection,
  toggleInCollection, collectionsOf, savedKeys, pruneMissing, recordView, recordReplayDone, recordLessonOpened, daysVisited, setPrefs, trimProgress,
} from "../../src/lib/feed/state.ts";
import { MILESTONES, awardMilestones, milestoneRows } from "../../src/lib/feed/milestones.ts";
import { freshClock, tick, promptFor, extend, remainingMinutes, parseClock, MAX_TICK_MS, SOFT_EXTENSIONS } from "../../src/lib/feed/session.ts";
import { buildReplayModel, frameAt, stepIdx, endIdx, progressOf, idxFromProgress, indexAtOrBefore, CONTEXT_BARS, LEAD_BARS, barDelay } from "../../src/lib/feed/replay.ts";
import { buildFeed, cardsForKeys, diversify, daysBetween, extractVideoUrl, setupStatsFor, keyExists, BATCH_SIZE } from "../../src/lib/feed/build.ts";

let n = 0;
const t = (name: string, fn: () => void) => { fn(); n++; console.log(`  ✅ ${name}`); };
console.log("\n=== Feed ===");

/* ------------------------------- state ------------------------------- */
t("normalize: garbage in → valid empty state with autoplay ON and music OFF", () => {
  for (const bad of [null, undefined, 5, "x", [], { favorites: "no", collections: 7, progress: [], prefs: 3 }]) {
    const s = normalizeFeedState(bad);
    assert.equal(s.v, 1); assert.deepEqual(s.favorites, []); assert.deepEqual(s.collections, []);
    assert.equal(s.prefs.music.enabled, false, "music must default OFF");
    assert.equal(s.prefs.autoplayReplay, true, "autoplay must default ON for active feed items");
  }
  const explicitOff = normalizeFeedState({ prefs: { autoplayReplay: false } });
  assert.equal(explicitOff.prefs.autoplayReplay, false, "explicitly disabled autoplay is preserved");
});
t("normalize: dedupes, caps and drops malformed items", () => {
  const favorites = [...Array(LIMITS.favorites + 50).keys()].map((i) => `trade:${i}`).concat(["trade:1", 5 as never, "", "x".repeat(200)]);
  const s = normalizeFeedState({ favorites, collections: [{ id: "a", name: "  ", items: [] }, { id: "b", name: "B".repeat(99), items: ["trade:1", "trade:1"] }, { id: "b", name: "dup id", items: [] }] });
  assert.equal(s.favorites.length, LIMITS.favorites);
  assert.equal(new Set(s.favorites).size, s.favorites.length);
  assert.equal(s.collections.length, 1);
  assert.equal(s.collections[0].name.length, LIMITS.nameLength);
  assert.deepEqual(s.collections[0].items, ["trade:1"]);
});
t("normalize: clamps prefs and survives a JSON round trip", () => {
  const s = normalizeFeedState({ prefs: { dailyMinutes: 99999, haptics: false, music: { enabled: true, volume: 7, source: "custom:abc" } } });
  assert.equal(s.prefs.dailyMinutes, 600); assert.equal(s.prefs.haptics, false);
  assert.equal(s.prefs.music.volume, 1); assert.equal(s.prefs.music.enabled, true);
  assert.deepEqual(normalizeFeedState(JSON.parse(JSON.stringify(s))), s);
});
t("persisted state stays tiny even at every cap (≪ 4 MB journal limit)", () => {
  let s = emptyFeedState();
  for (let c = 0; c < LIMITS.collections; c++) {
    const r = createCollection(s, `Collection ${c}`, `c${c}`, 1); assert.ok(r.ok); s = r.state;
    for (let i = 0; i < LIMITS.itemsPerCollection; i++) s = toggleInCollection(s, `c${c}`, `trade:${"x".repeat(20)}${i}`);
  }
  for (let i = 0; i < LIMITS.favorites; i++) s = toggleFavorite(s, `lesson:${"y".repeat(20)}${i}`);
  const bytes = JSON.stringify(s).length;
  assert.ok(bytes < 400_000, `feed state is ${bytes} bytes`);
});
t("favorites toggle, newest first, cap enforced", () => {
  let s = toggleFavorite(emptyFeedState(), "trade:a"); s = toggleFavorite(s, "lesson:b");
  assert.deepEqual(s.favorites, ["lesson:b", "trade:a"]);
  s = toggleFavorite(s, "trade:a"); assert.deepEqual(s.favorites, ["lesson:b"]);
  let full = emptyFeedState();
  for (let i = 0; i < LIMITS.favorites; i++) full = toggleFavorite(full, `trade:${i}`);
  assert.equal(toggleFavorite(full, "trade:new"), full, "over the cap is refused, state untouched");
});
t("collections: create/rename/delete with validation", () => {
  let s = emptyFeedState();
  assert.deepEqual(createCollection(s, "   ", "x", 1), { state: s, ok: false, reason: "empty" });
  const a = createCollection(s, "  NY   open  ", "c1", 5); assert.ok(a.ok); s = a.state;
  assert.equal(s.collections[0].name, "NY open", "whitespace collapsed");
  const dup = createCollection(s, "ny OPEN", "c2", 6); assert.ok(!dup.ok && dup.reason === "duplicate");
  s = renameCollection(s, "c1", "Morning"); assert.equal(s.collections[0].name, "Morning");
  const b = createCollection(s, "Other", "c2", 7); assert.ok(b.ok); s = b.state;
  assert.equal(renameCollection(s, "c2", "morning"), s, "rename onto an existing name is refused");
  s = toggleInCollection(s, "c1", "trade:1"); s = toggleInCollection(s, "c2", "trade:1");
  assert.deepEqual(collectionsOf(s, "trade:1").map((c) => c.id), ["c1", "c2"]);
  s = toggleInCollection(s, "c1", "trade:1"); assert.deepEqual(collectionsOf(s, "trade:1").map((c) => c.id), ["c2"]);
  s = deleteCollection(s, "c2"); assert.equal(s.collections.length, 1);
  let capped = emptyFeedState();
  for (let i = 0; i < LIMITS.collections; i++) { const r = createCollection(capped, `n${i}`, `i${i}`, 0); assert.ok(r.ok); capped = r.state; }
  const over = createCollection(capped, "one more", "z", 0); assert.ok(!over.ok && over.reason === "limit");
});
t("savedKeys unions favorites and collections; pruneMissing drops dead refs only", () => {
  let s = toggleFavorite(emptyFeedState(), "trade:a"); s = toggleFavorite(s, "trade:gone");
  const c = createCollection(s, "C", "c", 0); assert.ok(c.ok); s = toggleInCollection(c.state, "c", "lesson:l1"); s = toggleInCollection(s, "c", "trade:gone");
  assert.deepEqual([...savedKeys(s)].sort(), ["lesson:l1", "trade:a", "trade:gone"]);
  const p = pruneMissing(s, (k) => k !== "trade:gone");
  assert.deepEqual(p.favorites, ["trade:a"]); assert.deepEqual(p.collections[0].items, ["lesson:l1"]);
  assert.equal(pruneMissing(p, () => true), p, "nothing to prune → same object (no needless save)");
});
t("progress: views count, replays count once, history trimmed", () => {
  let s = recordView(emptyFeedState(), "2026-10-01"); s = recordView(s, "2026-10-01");
  assert.equal(s.progress.day["2026-10-01"].cards, 2); assert.equal(s.progress.totalCards, 2);
  s = recordReplayDone(s, "trade:a", "2026-10-01"); const again = recordReplayDone(s, "trade:a", "2026-10-02");
  assert.equal(again, s, "re-watching a replay does not inflate progress");
  s = recordLessonOpened(s, "lesson:x", "2026-10-02"); assert.equal(recordLessonOpened(s, "lesson:x", "2026-10-03"), s);
  assert.equal(daysVisited(s), 2);
  let long = emptyFeedState();
  for (let d = 1; d <= 90; d++) long = recordView(long, `2026-${String(1 + Math.floor((d - 1) / 28)).padStart(2, "0")}-${String(1 + ((d - 1) % 28)).padStart(2, "0")}`);
  assert.ok(Object.keys(trimProgress(long).progress.day).length <= LIMITS.dayHistory);
  assert.equal(long.progress.totalCards, 90, "lifetime total survives day trimming");
});
t("setPrefs validates through normalize", () => {
  const s = setPrefs(emptyFeedState(), { dailyMinutes: -5, music: { volume: 3, enabled: true } });
  assert.equal(s.prefs.dailyMinutes, 0); assert.equal(s.prefs.music.volume, 1); assert.equal(s.prefs.music.enabled, true);
});

/* ----------------------------- milestones ----------------------------- */
t("milestones: awarded once, never revoked, no streak concept", () => {
  assert.ok(!MILESTONES.some((m) => /streak/i.test(m.id + m.title)), "no streak milestones");
  let s = emptyFeedState();
  assert.equal(awardMilestones(s, 1).earned.length, 0);
  s = recordReplayDone(s, "trade:a", "2026-10-01");
  const r = awardMilestones(s, 99); assert.deepEqual(r.earned.map((m) => m.id), ["first-replay"]); s = r.state;
  assert.equal(awardMilestones(s, 100).earned.length, 0, "not re-announced");
  s = { ...s, progress: { ...s.progress, replays: [] } }; // data later reduced
  const rows = milestoneRows(s); assert.ok(rows.find((x) => x.def.id === "first-replay")!.done, "earned stays earned");
  assert.equal(rows.find((x) => x.def.id === "first-replay")!.at, 99);
});
t("milestones: days-7 counts ANY seven days (gaps are fine)", () => {
  let s = emptyFeedState();
  for (const d of ["01", "03", "09", "10", "20", "21", "30"]) s = recordView(s, `2026-09-${d}`);
  assert.ok(awardMilestones(s, 1).earned.some((m) => m.id === "days-7"));
});

/* ------------------------------- session ------------------------------- */
t("session: counts active time, caps a single tick, rolls over at midnight", () => {
  let c = freshClock("2026-10-01");
  c = tick(c, 1000, "2026-10-01"); assert.equal(c.ms, 1000);
  c = tick(c, 3_600_000, "2026-10-01"); assert.equal(c.ms, 1000 + MAX_TICK_MS, "a sleeping laptop is not an hour of use");
  const next = tick(c, 1000, "2026-10-02"); assert.equal(next.day, "2026-10-02"); assert.equal(next.ms, 1000);
  assert.equal(tick(c, -50, "2026-10-01").ms, c.ms);
});
t("session: break → extend → soft 'enough'; 0 minutes = no limit", () => {
  let c = { ...freshClock("d"), ms: 19 * 60_000 };
  assert.equal(promptFor(c, 20), "none"); assert.equal(remainingMinutes(c, 20), 1);
  c = { ...c, ms: 20 * 60_000 }; assert.equal(promptFor(c, 20), "break");
  for (let i = 0; i < SOFT_EXTENSIONS; i++) { c = extend(c); c = { ...c, ms: (20 + c.extraMin) * 60_000 }; }
  assert.equal(promptFor(c, 20), "enough");
  assert.equal(promptFor({ ...freshClock("d"), ms: 9e9 }, 0), "none"); assert.equal(remainingMinutes(freshClock("d"), 0), null);
  assert.equal(promptFor({ ...freshClock("d"), ms: 9e9 }, -3), "none");
});
t("session: parseClock rejects stale/garbage storage", () => {
  assert.equal(parseClock("junk", "d").ms, 0); assert.equal(parseClock({ day: "old", ms: 5 }, "d").ms, 0);
  assert.equal(parseClock({ day: "d", ms: NaN, extraMin: "x" }, "d").ms, 0);
  assert.equal(parseClock({ day: "d", ms: 1234, extraMin: 5, extensions: 1.9 }, "d").extensions, 1);
});

/* -------------------------------- replay -------------------------------- */
const candles = Array.from({ length: 60 }, (_, i) => ({ time: 1_000_000 + i * 60, open: 100 + i, high: 102 + i, low: 99 + i, close: 101 + i, volume: 10 }));
const ref = (over: Record<string, unknown> = {}) => ({ entryId: "e", side: "buy", quantity: 1, entryUtc: 1_000_000 + 20 * 60 + 5, exitUtc: 1_000_000 + 30 * 60, entryPrice: 120, exitPrice: 130, stopLoss: 115, takeProfit: 140, journalPnl: 200, label: "x", entryClock: "09:31", exitClock: "09:41", ...over }) as never;
t("replay: indexes and context window", () => {
  assert.equal(indexAtOrBefore(candles, 1_000_000 - 1), -1); assert.equal(indexAtOrBefore(candles, 1_000_000 + 61), 1); assert.equal(indexAtOrBefore(candles, 9e9), 59);
  const m = buildReplayModel(candles, ref())!;
  assert.equal(m.entryIdx, 20); assert.equal(m.exitIdx, 30); assert.equal(m.startIdx, 20 - LEAD_BARS); assert.equal(m.viewFrom, 20 - CONTEXT_BARS); assert.ok(m.viewFrom <= m.startIdx, "context is drawn before playback begins"); assert.equal(m.dir, 1); assert.equal(m.exitEstimated, false);
  assert.equal(buildReplayModel(candles.slice(0, 2), ref()), null, "too little data");
  assert.equal(buildReplayModel(candles, ref({ entryUtc: 5 })), null, "entry before the data window");
});
t("replay: long R math — stop = -1R, target at 2.5R, exit uses the journal's exit price", () => {
  const m = buildReplayModel(candles, ref())!;
  assert.equal(frameAt(m, 5).phase, "setup"); assert.equal(frameAt(m, 5).openR, null);
  const open = frameAt(m, 25); assert.equal(open.phase, "open"); assert.equal(open.openPts, candles[25].close - 120);
  assert.equal(open.openR, (candles[25].close - 120) / 5);
  const done = frameAt(m, 31); assert.equal(done.phase, "closed"); assert.ok(done.done); assert.equal(done.openPts, 10); assert.equal(done.openR, 2);
});
t("replay: short side flips the sign; missing stop → no R, no crash", () => {
  const s = buildReplayModel(candles, ref({ side: "sell", entryPrice: 120, exitPrice: 110, stopLoss: 125 }))!;
  assert.equal(frameAt(s, 31).openPts, 10); assert.equal(frameAt(s, 31).openR, 2);
  const nos = buildReplayModel(candles, ref({ stopLoss: null }))!; assert.equal(frameAt(nos, 25).openR, null); assert.ok(frameAt(nos, 25).openPts !== null);
});
t("replay: no recorded exit → estimated end, still bounded", () => {
  const m = buildReplayModel(candles, ref({ exitUtc: null, exitPrice: null }))!;
  assert.ok(m.exitEstimated); assert.equal(m.exitIdx, 35);
  const near = buildReplayModel(candles, ref({ entryUtc: 1_000_000 + 58 * 60, exitUtc: null }))!; assert.ok(near.exitIdx <= near.lastIdx);
});
t("replay: stepping and scrubbing stay inside the playable range", () => {
  const m = buildReplayModel(candles, ref())!;
  assert.equal(stepIdx(m, m.startIdx, -1), m.startIdx); assert.equal(stepIdx(m, endIdx(m), 1), endIdx(m));
  assert.equal(idxFromProgress(m, -1), m.startIdx); assert.equal(idxFromProgress(m, 9), endIdx(m));
  assert.equal(progressOf(m, m.startIdx), 0); assert.equal(progressOf(m, endIdx(m)), 1);
  assert.equal(frameAt(m, -100).idx, m.startIdx); assert.equal(frameAt(m, 1e6).idx, m.lastIdx);
  assert.ok(barDelay(4) < barDelay(2) && barDelay(2) < barDelay(1));
});

/* --------------------------------- feed --------------------------------- */
const D = (back: number) => { const d = new Date(Date.UTC(2026, 9, 14 - back, 12)); return d.toISOString().slice(0, 10); };
const mkEntry = (id: string, back: number, over: Record<string, unknown> = {}) => ({
  id, date: D(back), pnl: 100, rr: 1, instrument: "NQ", direction: "long", setup: "ORB", setupId: "su1", notes: "", images: [],
  entryTime: "09:40", exitTime: "10:00", entryPrice: 100, exitPrice: 110, stopLoss: 95, takeProfit: 120, quantity: 1, createdAt: 0, updatedAt: 0, ...over,
}) as never;
const lesson = (id: string, over: Record<string, unknown> = {}) => ({
  id, title: id, subtitle: "", createdAt: Date.UTC(2026, 9, 12), html: "", cover: null, customCover: null, excerpt: "", hook: "h", readMins: 2, author: { handle: "m", name: "Mira" },
  bylines: [], settings: { comments: true, reposts: true }, mine: false, likes: 0, likedByMe: false, reposts: 0, repostedByMe: false, savedByMe: false, repostedBy: [], comments: [], ...over,
}) as never;
const setup = (id: string, name = "ORB", over: Record<string, unknown> = {}) => ({ id, name, version: 1, createdAt: 0, updatedAt: 0, active: true, ...over }) as never;
const base = (over: Record<string, unknown> = {}) => ({
  entries: [], playbook: [], lessons: [] as never[] | null, state: emptyFeedState(), seen: new Set<string>(), readLessons: new Set<string>(),
  today: D(0), startingBalance: 50000, currency: "USD" as const, ...over,
}) as never as Parameters<typeof buildFeed>[0];

t("feed: empty account → starters, then a clear end", () => {
  const f = buildFeed(base());
  assert.deepEqual(f.filter((c) => c.kind === "starter").map((c) => (c as { id: string }).id).sort(), ["first-lesson", "first-setup", "first-trade"]);
  assert.equal(f.at(-1)!.kind, "end");
});
t("feed: finite batch, always ends with exactly one end card", () => {
  const entries = Array.from({ length: 80 }, (_, i) => mkEntry(`e${i}`, 1 + (i % 60)));
  const f = buildFeed(base({ entries, lessons: Array.from({ length: 20 }, (_, i) => lesson(`l${i}`)) }));
  assert.equal(f.length, BATCH_SIZE + 1); assert.equal(f.filter((c) => c.kind === "end").length, 1);
  assert.equal(new Set(f.map((c) => c.key)).size, f.length, "no duplicate cards");
});
t("feed: deterministic within a day, no randomness", () => {
  const i = base({ entries: Array.from({ length: 30 }, (_, k) => mkEntry(`e${k}`, 1 + k)), lessons: [lesson("a"), lesson("b")] });
  assert.deepEqual(buildFeed(i).map((c) => c.key), buildFeed(i).map((c) => c.key));
});
t("feed: variety — never more than two of a kind in a row while alternatives exist", () => {
  const f = buildFeed(base({ entries: Array.from({ length: 12 }, (_, k) => mkEntry(`e${k}`, 1 + k)), playbook: [setup("su1"), setup("su2", "B")], lessons: [lesson("a"), lesson("b"), lesson("c")] }));
  const body = f.filter((c) => c.kind !== "end");
  for (let k = 2; k < body.length; k++) if (body[k].kind === body[k - 1].kind && body[k].kind === body[k - 2].kind) {
    assert.ok(!body.slice(k + 1).some((c) => c.kind !== body[k].kind), "a run of 3 is only allowed when nothing else is left");
  }
});
t("feed: personalization — saving a setup lifts its trades, and the reason says why", () => {
  const entries = [mkEntry("a", 3, { setupId: "su1" }), mkEntry("b", 3, { setupId: "su2", setup: "Other" })];
  const playbook = [setup("su1", "Opening range"), setup("su2", "Other")];
  const plain = buildFeed(base({ entries, playbook, limit: 10 })).filter((c) => c.kind === "trade");
  let st = toggleFavorite(emptyFeedState(), "setup:su1"); st = toggleFavorite(st, "trade:a");
  const tuned = buildFeed(base({ entries, playbook, state: st, limit: 10 })).filter((c) => c.kind === "trade") as { key: string; reason: string }[];
  assert.equal(tuned[0].key, "trade:a"); assert.match(tuned[0].reason, /saved Opening range/);
  assert.ok(plain.length === 2);
});
t("feed: viewed cards sink; recent losses and best trade get honest reasons", () => {
  const entries = [mkEntry("win", 5, { pnl: 900 }), mkEntry("loss", 2, { pnl: -300 }), mkEntry("meh", 9, { pnl: 10 })];
  const f = buildFeed(base({ entries, limit: 10 })).filter((c) => c.kind === "trade") as { key: string; reason: string }[];
  assert.match(f.find((c) => c.key === "trade:win")!.reason, /best trade/);
  assert.match(f.find((c) => c.key === "trade:loss")!.reason, /recent loss/);
  const seenFirst = buildFeed(base({ entries, limit: 10, seen: new Set([f[0].key]) })).filter((c) => c.kind === "trade");
  assert.notEqual(seenFirst[0].key, f[0].key, "a card you already viewed drops down");
});
t("feed: replayable vs screenshot-only vs plain trades", () => {
  const entries = [mkEntry("r", 1), mkEntry("shot", 2, { entryTime: undefined, images: [{ id: "i", name: "n", width: 1, height: 1, size: 1 }] }), mkEntry("plain", 3, { entryTime: undefined, instrument: "XYZ" })];
  const f = buildFeed(base({ entries })).filter((c) => c.kind === "trade") as { key: string; replayable: boolean; hasImage: boolean }[];
  const g = (k: string) => f.find((c) => c.key === k);
  assert.ok(g("trade:r")!.replayable); assert.ok(!g("trade:shot")!.replayable && g("trade:shot")!.hasImage);
  assert.ok(g("trade:plain") && !g("trade:plain")!.replayable, "sparse journals still get content");
});
t("feed: lessons — community labelled, linked-to-recent-trade boosted, read sinks", () => {
  const entries = [mkEntry("a", 2, { lessonIds: ["linked"] })];
  const lessons = [lesson("linked", { mine: true, author: { handle: "me", name: "Me" } }), lesson("fresh", { createdAt: Date.UTC(2026, 9, 13) }), lesson("old", { createdAt: Date.UTC(2026, 5, 1) })];
  const f = buildFeed(base({ entries, lessons, limit: 10 })).filter((c) => c.kind === "lesson") as { key: string; reason: string; community: boolean }[];
  assert.equal(f[0].key, "lesson:linked"); assert.match(f[0].reason, /Linked to a trade/);
  assert.match(f.find((c) => c.key === "lesson:fresh")!.reason, /New from Mira/); assert.ok(f.find((c) => c.key === "lesson:fresh")!.community);
  const read = buildFeed(base({ entries, lessons, limit: 10, readLessons: new Set(["linked"]) })).filter((c) => c.kind === "lesson");
  assert.notEqual(read[0].key, "lesson:linked");
  assert.equal(buildFeed(base({ lessons: null })).filter((c) => c.kind === "lesson").length, 0, "lessons still loading → none, no crash");
});
t("feed: video extraction from lesson HTML, cover, and trade media", () => {
  assert.equal(extractVideoUrl('<p>Intro</p><video src="/api/lessons/media?id=abc123.mp4" controls></video>'), "/api/lessons/media?id=abc123.mp4");
  assert.equal(extractVideoUrl("<p>No video</p>", "/api/lessons/media?id=clip99.webm"), "/api/lessons/media?id=clip99.webm");
  assert.equal(extractVideoUrl("<p>Text only</p>", "/api/lessons/media?id=img1.png"), null);
  const lWithVid = lesson("v1", { html: '<p>Watch</p><video src="/api/lessons/media?id=vid1.mp4" controls></video>' });
  const cards = buildFeed(base({ lessons: [lWithVid] })).filter((c) => c.kind === "lesson") as { key: string; videoUrl?: string | null }[];
  assert.equal(cards[0].videoUrl, "/api/lessons/media?id=vid1.mp4");
});
t("feed: inactive setups are skipped; stats come from linked trades", () => {
  const s1 = setup("su1", "ORB"), s2 = setup("su2", "Retired", { active: false });
  const entries = [mkEntry("a", 1, { pnl: 50, rr: 2 }), mkEntry("b", 2, { pnl: -20, rr: -1 }), mkEntry("c", 3, { setupId: undefined, setup: "orb", pnl: 10, rr: 1 })];
  const st = setupStatsFor(s1, entries); assert.equal(st.trades, 3); assert.equal(st.wins, 2); assert.ok(Math.abs(st.winRate! - 2 / 3) < 1e-9); assert.ok(Math.abs(st.avgR! - 2 / 3) < 1e-9);
  assert.deepEqual(buildFeed(base({ entries, playbook: [s1, s2] })).filter((c) => c.kind === "setup").map((c) => c.key), ["setup:su1"]);
  assert.equal(setupStatsFor(s2, []).winRate, null);
});
t("feed: cardsForKeys keeps order and silently skips deleted items", () => {
  const i = base({ entries: [mkEntry("a", 1)], playbook: [setup("su1")], lessons: [lesson("l1")] });
  const cards = cardsForKeys(i, ["lesson:l1", "trade:deleted", "trade:a", "setup:su1", "weird:x"]);
  assert.deepEqual(cards.map((c) => c.key), ["lesson:l1", "trade:a", "setup:su1"]);
  assert.ok(cards.every((c) => c.reason === "Saved by you"));
  assert.ok(keyExists(i, "trade:a") && !keyExists(i, "trade:zzz") && !keyExists(i, "weird:x"));
  assert.ok(keyExists({ ...i, lessons: null }, "lesson:anything"), "unknown while lessons load: keep");
});
t("feed: diversify and daysBetween helpers", () => {
  const seq = ["a", "a", "a", "b", "a"].map((kind) => ({ kind }));
  assert.deepEqual(diversify(seq).map((c) => c.kind), ["a", "a", "b", "a", "a"]);
  assert.equal(daysBetween("2026-03-07", "2026-03-09"), 2); assert.equal(daysBetween("2026-10-31", "2026-11-02"), 2);
});

console.log(`\nFeed: ${n} checks passed`);
