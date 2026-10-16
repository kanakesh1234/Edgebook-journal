// Test backend: serves the harness bundle and mocks the app's API routes — including an in-memory
// "Google Drive" with the same GET/PUT contract as /api/drive/data — so persistence can be verified
// end to end without network access or real credentials.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const here = import.meta.dirname;
const PORT = Number(process.env.PORT ?? 4173);

/* ----------------------------- deterministic market ----------------------------- */
const hash = (n) => { let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
/** Smooth-ish random walk anchored at 20000: sum of slow sines + hashed noise, stable for any timestamp. */
const mid = (t) => 20000 + 60 * Math.sin(t / 5400) + 35 * Math.sin(t / 1300 + 1) + 12 * Math.sin(t / 311);
const tick = (v) => Math.round(v * 4) / 4;
export function candleAt(t, secs = 60) {
  const o = mid(t) + (hash(t) - 0.5) * 6, c = mid(t + secs) + (hash(t + 7) - 0.5) * 6;
  const h = Math.max(o, c) + hash(t + 1) * 5, l = Math.min(o, c) - hash(t + 2) * 5;
  return { time: t, open: tick(o), high: tick(h), low: tick(l), close: tick(c), volume: Math.round(200 + hash(t + 3) * 900) };
}
const TF = { "1m": 60, "5m": 300, "15m": 900, "30m": 1800, "1h": 3600, "1D": 86400 };
function candles(symbol, tf, startIso, endIso) {
  const secs = TF[tf] ?? 60;
  const s = Math.floor(Date.parse(startIso) / 1000 / secs) * secs, e = Math.floor(Date.parse(endIso) / 1000);
  const out = [];
  for (let t = s; t < e && out.length < 5000; t += secs) {
    const d = new Date(t * 1000).getUTCDay();
    if (d === 6 || d === 0) continue; // weekends closed
    out.push(candleAt(t, secs));
  }
  return out;
}

/* --------------------------------- fixture --------------------------------- */
const NY = "America/New_York";
function nyToUtcSec(dateStr, hhmm) {
  const [y, m, d] = dateStr.split("-").map(Number), [h, mi] = hhmm.split(":").map(Number);
  let guess = Date.UTC(y, m - 1, d, h + 5, mi);
  for (let i = 0; i < 2; i++) {
    const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: NY, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
    const seen = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour === 24 ? 0 : +p.hour, +p.minute);
    guess += Date.UTC(y, m - 1, d, h, mi) - seen;
  }
  return Math.floor(guess / 1000);
}
const dkey = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;

export function makeFixture(mode = "rich") {
  const now = new Date();
  const setups = [
    { id: "su_orb", name: "Opening range reclaim", purpose: "Fade the first failed break of the 9:30 range.", strategy: "Price sweeps one side of the opening range, closes back inside, and rotates to the other side.", rules: [{ id: "r1", text: "First 5-minute candle defines the range" }, { id: "r2", text: "Sweep must close back inside the range" }, { id: "r3", text: "Stop beyond the sweep wick" }], invalidation: "A full-body close outside the range.", minRR: 2, sessions: ["NY open"], instruments: ["NQ"], active: true, version: 2, createdAt: now - 9e9, updatedAt: now - 1e9 },
    { id: "su_sweep", name: "Liquidity sweep + FVG", purpose: "Enter on the fair-value-gap after a liquidity grab.", rules: [{ id: "r4", text: "Prior high or low is taken" }, { id: "r5", text: "Displacement leaves a clean gap" }, { id: "r6", text: "Enter on the retrace into the gap" }], minRR: 2.5, sessions: ["NY open", "London"], instruments: ["NQ", "ES"], active: true, version: 1, createdAt: now - 8e9, updatedAt: now - 2e9 },
    { id: "su_pull", name: "Trend pullback", purpose: "Join an established trend on a shallow pullback.", rules: [{ id: "r7", text: "Higher-timeframe trend is clear" }, { id: "r8", text: "Pullback holds the 50% level" }], minRR: 1.5, sessions: ["NY"], instruments: ["NQ"], active: true, version: 1, createdAt: now - 7e9, updatedAt: now - 3e9 },
  ];
  const entries = [];
  const times = [["09:41", "10:02"], ["10:12", "10:44"], ["09:36", "09:58"], ["10:31", "11:05"], ["09:48", "10:20"]];
  let n = 0;
  const count = mode === "empty" ? 0 : 34;
  for (let back = 1; entries.length < count && back < 90; back++) {
    const d = new Date(now); d.setDate(d.getDate() - back);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const date = dkey(d);
    const [et, xt] = times[n % times.length];
    const eu = nyToUtcSec(date, et), xu = nyToUtcSec(date, xt);
    const long = n % 3 !== 1;
    const ep = tick(candleAt(Math.floor(eu / 60) * 60).close), xp = tick(candleAt(Math.floor(xu / 60) * 60).close);
    const risk = 18 + (n % 4) * 4;
    const sl = tick(long ? ep - risk : ep + risk), tp = tick(long ? ep + risk * 2.2 : ep - risk * 2.2);
    const pts = (long ? xp - ep : ep - xp);
    const pnl = Math.round(pts * 20 * (1 + (n % 2)));
    const setup = setups[n % 3];
    entries.push({
      id: `fx_${n}`, date, pnl, rr: +(pts / risk).toFixed(1), instrument: "NQ", direction: long ? "long" : "short",
      setup: setup.name, setupId: setup.id, notes: pnl > 0 ? "Waited for the sweep, took the retrace, held to target." : "Entered early before the close back inside — rushed it.",
      images: n % 3 === 0 ? [{ id: `img_${n}`, name: "chart.png", width: 1200, height: 750, size: 90000 }] : [],
      entryTime: et, exitTime: xt, entryPrice: ep, exitPrice: xp, stopLoss: sl, takeProfit: tp, quantity: 1 + (n % 2),
      lessonIds: n % 4 === 0 ? ["ls_1"] : undefined,
      createdAt: eu * 1000, updatedAt: eu * 1000,
    });
    n++;
  }
  const settings = { traderName: "Test Trader", fullName: "Test Trader", startingEquity: 50000, targetEquity: 60000, maxDrawdown: 2500, currency: "USD", playbook: mode === "empty" ? [] : setups, aiPrefs: { includeNotes: true } };
  return { entries, settings, dayLogs: [], plans: [], version: 2 };
}

const LESSONS = [
  ["ls_1", "Why the first break usually fails", "A short note on the opening range", "Most opening breaks are liquidity grabs, not trends.", 3, false],
  ["ls_2", "Sizing down after two losses", "Protect the day, not the ego", "Two losses in a row is information, not a verdict.", 2, true],
  ["ls_3", "Reading displacement", "What a real move looks like", "Displacement leaves gaps. Drift leaves overlap.", 5, true],
  ["ls_4", "A pre-market checklist you will actually use", "Five lines, no more", "If the checklist takes longer than five minutes it will not survive a bad week.", 4, false],
  ["ls_5", "Journaling the trade you did not take", "Skipped valid setups matter", "Your skipped trades are half of your edge data.", 3, true],
].map(([id, title, subtitle, hook, readMins, theirs], i) => ({
  id, title, subtitle, createdAt: Date.now() - i * 86400000 * 2, html: `<p>${hook}</p>`, cover: null, customCover: null,
  excerpt: hook, hook, readMins, author: theirs ? { handle: "mira", name: "Mira" } : { handle: "me", name: "Test" },
  bylines: [], settings: { comments: true, reposts: true }, mine: !theirs, likes: 2 + i, likedByMe: false, reposts: 0, repostedByMe: false,
  savedByMe: false, repostedBy: theirs && i === 2 ? ["Dev"] : [], comments: [],
}));

/* ---------------------------------- server ---------------------------------- */
let mode = process.env.FIXTURE ?? "rich";
let drive = makeFixture(mode);
let driveWrites = 0;
let loggedIn = true;
const unknown = new Set();
const json = (res, body, status = 200) => { res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" }); res.end(JSON.stringify(body)); };
const MIME = { ".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".woff2": "font/woff2", ".woff": "font/woff", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json" };

function chartSvg(id) {
  const seed = [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
  let x = 40, bars = "", y = 220;
  for (let i = 0; i < 38; i++) {
    const o = y, c = y + (hash(seed + i) - 0.46) * 34; const hi = Math.min(o, c) - hash(seed + i + 50) * 14, lo = Math.max(o, c) + hash(seed + i + 90) * 14;
    const up = c < o; y = c;
    bars += `<line x1="${x}" x2="${x}" y1="${hi}" y2="${lo}" stroke="${up ? "#2e9e6b" : "#c4545c"}"/><rect x="${x - 5}" y="${Math.min(o, c)}" width="10" height="${Math.max(3, Math.abs(c - o))}" fill="${up ? "#2e9e6b" : "#c4545c"}"/>`; x += 28;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="750" viewBox="0 0 1200 750"><rect width="1200" height="750" fill="#101418"/><g transform="translate(0,120) scale(1.1,1.4)">${bars}</g><text x="40" y="60" fill="#8b95a1" font-family="sans-serif" font-size="28">NQ · 1m · ${id}</text></svg>`;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const p = url.pathname;
  const body = async () => { const c = []; for await (const x of req) c.push(x); return Buffer.concat(c); };

  // ---- test control
  if (p === "/__test/state") return json(res, { driveWrites, drive, mode });
  if (p === "/__test/reset") { mode = url.searchParams.get("mode") ?? "rich"; drive = makeFixture(mode); driveWrites = 0; loggedIn = true; for (const l of LESSONS) { l.likedByMe = false; l.savedByMe = false; } return json(res, { ok: true, mode }); }
  if (p === "/__test/unknown") return json(res, [...unknown]);

  // ---- API
  if (p === "/api/auth/google/session") return loggedIn ? json(res, { loggedIn: true, user: { id: "u_test", name: "Test Trader", email: "trader@example.com" }, drive: { connected: true, state: "connected" } }) : json(res, { loggedIn: false, user: null, drive: { connected: false, state: "auth_required" } });
  if (p === "/api/drive/data") {
    if (req.method === "GET") return json(res, { payload: drive });
    if (req.method === "PUT") { const b = JSON.parse((await body()).toString()); if (!Array.isArray(b.entries) || typeof b.settings !== "object") return json(res, { error: "invalid_payload" }, 400); drive = { ...b, storedAt: Date.now() }; driveWrites++; return json(res, { ok: true }); }
  }
  if (p.startsWith("/api/drive/image/")) { const id = decodeURIComponent(p.split("/").pop()); res.writeHead(200, { "content-type": "image/svg+xml" }); return res.end(chartSvg(id)); }
  if (p === "/api/lessons") {
    if (req.method === "GET") return json(res, { lessons: mode === "empty" ? [] : LESSONS });
    if (req.method === "POST") { const b = JSON.parse((await body()).toString()); const l = LESSONS.find((x) => x.id === b.id); if (!l) return json(res, { error: "not_found" }, 404); if (b.action === "like") { l.likedByMe = !l.likedByMe; l.likes += l.likedByMe ? 1 : -1; } if (b.action === "save") l.savedByMe = !l.savedByMe; return json(res, { ok: true }); }
  }
  if (p === "/api/market-data") { const q = url.searchParams; const c = candles(q.get("symbol"), q.get("timeframe") ?? "1m", q.get("start"), q.get("end")); return json(res, { candles: c, meta: { symbol: q.get("symbol"), providerSymbol: q.get("symbol"), timeframe: q.get("timeframe"), start: q.get("start"), end: q.get("end"), chunks: 1, upstreamRows: c.length, returned: c.length, truncated: false, firstTime: c[0]?.time ?? null, lastTime: c.at(-1)?.time ?? null } }); }
  if (p === "/api/market-data/catalog") return json(res, { symbols: ["NQ", "ES"] });
  if (p === "/api/friends") return json(res, { friends: [], pendingIncoming: [], pendingOutgoing: [] });
  if (p === "/api/profile/handle") return json(res, { handle: "tester" });
  if (p.startsWith("/api/")) { unknown.add(`${req.method} ${p}`); return json(res, { error: "mock_not_implemented" }, 404); }

  // ---- static
  if (p.startsWith("/dist/")) {
    const f = path.join(here, p);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) { res.writeHead(200, { "content-type": MIME[path.extname(f)] ?? "application/octet-stream", "cache-control": "no-store" }); return fs.createReadStream(f).pipe(res); }
  }
  const pub = path.join(here, "../../public", p);
  if (p !== "/" && fs.existsSync(pub) && fs.statSync(pub).isFile()) { res.writeHead(200, { "content-type": MIME[path.extname(pub)] ?? "application/octet-stream" }); return fs.createReadStream(pub).pipe(res); }
  res.writeHead(200, { "content-type": "text/html" }); res.end(fs.readFileSync(path.join(here, "dist/index.html")));
}).listen(PORT, () => console.log(`harness on :${PORT} (fixture=${mode})`));
