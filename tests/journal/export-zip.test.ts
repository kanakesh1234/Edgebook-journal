import { strict as assert } from "node:assert";
import { inflateRawSync } from "node:zlib";
import { buildZipBytes, crc32 } from "../../src/lib/zip.ts";
import {
  buildFullExportFiles,
  decodeDataUrl,
  extractLessonMediaUrls,
  type ExportImageAsset,
  type ExportLessonRecord,
} from "../../src/lib/export-zip.ts";
import { defaultSettings, type JournalEntry, type NoTradeLog, type TradePlan } from "../../src/lib/types.ts";

/** Minimal ZIP reader to verify every entry in a generated PKZIP buffer (both STORE and DEFLATE). */
function readZip(buf: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const decoder = new TextDecoder();
  const out = new Map<string, Uint8Array>();

  // Locate EOCD
  let eocdOffset = -1;
  for (let i = buf.byteLength - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  assert.ok(eocdOffset >= 0, "EOCD signature missing");

  const totalEntries = view.getUint16(eocdOffset + 10, true);
  const cdOffset = view.getUint32(eocdOffset + 16, true);

  let pos = cdOffset;
  for (let i = 0; i < totalEntries; i++) {
    assert.equal(view.getUint32(pos, true), 0x02014b50, "Central directory signature mismatch");
    const method = view.getUint16(pos + 10, true);
    const expectedCrc = view.getUint32(pos + 16, true);
    const compSize = view.getUint32(pos + 20, true);
    const uncompSize = view.getUint32(pos + 24, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localOffset = view.getUint32(pos + 42, true);

    const name = decoder.decode(buf.subarray(pos + 46, pos + 46 + nameLen));
    pos += 46 + nameLen + extraLen + commentLen;

    assert.equal(view.getUint32(localOffset, true), 0x04034b50, "Local header signature mismatch");
    const lNameLen = view.getUint16(localOffset + 26, true);
    const lExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const compBytes = buf.subarray(dataStart, dataStart + compSize);

    const raw = method === 0 ? new Uint8Array(compBytes) : new Uint8Array(inflateRawSync(compBytes));
    assert.equal(raw.byteLength, uncompSize, `Uncompressed size mismatch for ${name}`);
    assert.equal(crc32(raw), expectedCrc, `CRC-32 mismatch for ${name}`);
    out.set(name, raw);
  }
  return out;
}

const samplePng = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const sampleJpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 10, 20, 30, 40, 0xff, 0xd9]);

const settings = {
  ...defaultSettings(),
  fullName: "Nandigam Kanakeswara Rao",
  handle: "edge_trader",
  currency: "USD" as const,
  challenges: [
    {
      id: "ch1",
      name: "50K Combine",
      startingBalance: 50000,
      targetBalance: 53000,
      maxDrawdown: 2000,
      drawdownMode: "dynamic" as const,
      trailingBasis: "eod" as const,
      createdAt: 1000,
    },
  ],
  primaryChallengeId: "ch1",
  playbook: [
    {
      id: "pb1",
      name: "NY SMT Sweep",
      strategy: "Wait for London high sweep and 5m SMT divergence.",
      rules: [{ id: "r1", text: "Wait until 9:33 AM NY" }],
      version: 2,
      createdAt: 1000,
      updatedAt: 2000,
    },
  ],
  reviews: {
    weekly: {
      "2026-11-16": {
        text: { "best-day": "Patience on Tuesday paid off." },
        lists: { commitments: ["No trades before 9:33 AM"] },
        done: { "commitments:0": true },
        dayMarks: { "2026-11-17": { grade: "A" as const } },
        mistakePlans: {},
        updatedAt: 3000,
      },
    },
    monthly: {},
  },
};

const entries: JournalEntry[] = [
  {
    id: "e1",
    date: "2026-11-17",
    pnl: 640,
    rr: 2.5,
    instrument: "MNQ",
    direction: "long",
    setup: "NY SMT Sweep",
    setupId: "pb1",
    challengeId: "ch1",
    planId: "p1",
    entryTime: "09:42",
    exitTime: "10:15",
    entryPrice: 20510,
    exitPrice: 20590,
    stopLoss: 20478,
    takeProfit: 20590,
    quantity: 4,
    notes: "Clean sweep of Asia low, exact SMT on ES, held to draw.",
    images: [{ id: "img1", name: "entry-chart.jpg", width: 1200, height: 800, size: sampleJpg.byteLength }],
    compareImage: { id: "img2", name: "es-compare.png", width: 1200, height: 800, size: samplePng.byteLength },
    reflection: {
      wentWell: "Waited for 9:33 and full candle close.",
      wentPoorly: "Trimmed slightly early.",
      cause: "Followed the written plan.",
      followedSetup: true,
      followedRisk: true,
      lesson: "Trust the full target when SMT is clean.",
      updatedAt: 4000,
    },
    review: {
      execution: { whyEntered: "Confirmed SMT after sweep.", planned: true, followedStop: true },
      psychology: { emotionBefore: "CALM", emotionAfter: "FOCUSED", notes: "Zero urgency." },
      outcome: { processVerdict: "a-plus", followedPlan: true, notes: "Textbook execution." },
      compareInsight: "ES made a higher low while NQ swept.",
    },
    reviewStatus: "reviewed",
    createdAt: 3500,
    updatedAt: 4000,
  },
];

const plans: TradePlan[] = [
  {
    id: "p1",
    date: "2026-11-17",
    challengeId: "ch1",
    playbookId: "pb1",
    playbookName: "NY SMT Sweep",
    instrument: "MNQ",
    bias: "long",
    thesis: "Expecting sweep of Asia low then rally into NY high.",
    emotionalState: "CALM",
    rules: [{ label: "Wait until 9:33 AM NY", state: "ready" }],
    status: "executed",
    linkedTradeId: "e1",
    createdAt: 3000,
    updatedAt: 3500,
  },
];

const dayLogs: NoTradeLog[] = [
  { date: "2026-11-18", reason: "CPI whippy price action — stayed flat.", createdAt: 5000 },
];

const lessons: ExportLessonRecord[] = [
  {
    id: "l1",
    title: "Why Patience Beats Prediction",
    subtitle: "Notes from November",
    html: '<p>Wait for the sweep.</p><img src="/api/lessons/media?id=abc12345.png" />',
    cover: "/api/lessons/media?id=cover999.jpg",
    mine: true,
    likes: 2,
    comments: [{ body: "Great reminder", by: "Nandigam", at: 6000 }],
    createdAt: 5500,
  },
];

const images: ExportImageAsset[] = [
  { id: "img1", zipPath: "pictures/trades/2026-11-17_e1_1_entry-chart.jpg", source: "trade", refId: "e1", originalName: "entry-chart.jpg", bytes: sampleJpg, status: "included" },
  { id: "img2", zipPath: "pictures/trades/2026-11-17_e1_compare_es-compare.png", source: "compare", refId: "e1", originalName: "es-compare.png", bytes: samplePng, status: "included" },
  { id: "lesson:abc12345.png", zipPath: "pictures/lessons/abc12345.png", source: "lesson", originalName: "abc12345.png", bytes: samplePng, status: "included" },
];

// 1. Test data URL decoding & lesson media extraction
{
  const decoded = decodeDataUrl("data:image/png;base64," + Buffer.from(samplePng).toString("base64"));
  assert.ok(decoded);
  assert.equal(decoded.ext, "png");
  assert.deepEqual(decoded.bytes, samplePng);

  const mediaUrls = extractLessonMediaUrls(lessons);
  assert.equal(mediaUrls.length, 2);
  assert.ok(mediaUrls.includes("/api/lessons/media?id=abc12345.png"));
  assert.ok(mediaUrls.includes("/api/lessons/media?id=cover999.jpg"));
}

// 2. Test full export assembly + ZIP round-trip integrity
{
  const { files, manifest } = buildFullExportFiles({
    exportedAt: 1795500000000,
    account: { id: "g_123", name: "Nandigam", email: "trader@example.com", handle: "edge_trader", signInMethod: "google" },
    payload: { entries, settings, dayLogs, plans, version: 2 },
    images,
    lessons,
    backtestSessions: [],
    localStorageData: { "edgebook.theme": "dark" },
  });

  assert.equal(manifest.counts.trades, 1);
  assert.equal(manifest.counts.plans, 1);
  assert.equal(manifest.counts.noTradeDays, 1);
  assert.equal(manifest.counts.picturesIncluded, 3);
  assert.equal(manifest.counts.lessons, 1);

  const zipBytes = await buildZipBytes(files);
  const extracted = readZip(zipBytes);
  const text = (p: string) => new TextDecoder().decode(extracted.get(p));

  // Core files exist
  assert.ok(extracted.has("README.txt"));
  assert.ok(extracted.has("manifest.json"));
  assert.ok(extracted.has("backup/edgebook-backup.json"));
  assert.ok(extracted.has("journal/trades.json"));
  assert.ok(extracted.has("journal/trades.csv"));
  assert.ok(extracted.has("journal/trades-full-transcript.md"));
  assert.ok(extracted.has("journal/plans.md"));
  assert.ok(extracted.has("journal/reviews.md"));
  assert.ok(extracted.has("journal/no-trade-days.csv"));
  assert.ok(extracted.has("stats/summary.json"));
  assert.ok(extracted.has("stats/daily-equity.csv"));
  assert.ok(extracted.has("stats/stats-summary.md"));
  assert.ok(extracted.has("lessons/lessons.json"));
  assert.ok(extracted.has("lessons/lessons-readable.md"));
  assert.ok(extracted.has("pictures/index.json"));
  assert.ok(extracted.has("device-local-data/local-storage.json"));

  // Every recorded word is preserved verbatim
  const transcript = text("journal/trades-full-transcript.md");
  assert.ok(transcript.includes("Clean sweep of Asia low, exact SMT on ES, held to draw."));
  assert.ok(transcript.includes("Trust the full target when SMT is clean."));
  assert.ok(transcript.includes("ES made a higher low while NQ swept."));
  assert.ok(text("journal/plans.md").includes("Expecting sweep of Asia low then rally into NY high."));
  assert.ok(text("journal/reviews.md").includes("Patience on Tuesday paid off."));
  assert.ok(text("journal/no-trade-days.csv").includes("CPI whippy price action"));
  assert.ok(text("lessons/lessons-readable.md").includes("Why Patience Beats Prediction"));
  assert.ok(text("stats/stats-summary.md").includes("50K Combine"));

  // Every binary picture is preserved byte-for-byte
  assert.deepEqual(extracted.get("pictures/trades/2026-11-17_e1_1_entry-chart.jpg"), sampleJpg);
  assert.deepEqual(extracted.get("pictures/trades/2026-11-17_e1_compare_es-compare.png"), samplePng);
  assert.deepEqual(extracted.get("pictures/lessons/abc12345.png"), samplePng);
}

console.log("export-zip tests passed");
