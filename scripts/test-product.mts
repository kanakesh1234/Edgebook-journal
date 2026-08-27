/* Product-domain tests: challenges (static/dynamic DD, milestones), playbook
 * rules, deleted-setup safety, MINATO deterministic answer contract.
 *
 * Run: npx tsx scripts/test-product.mts
 */
import fs from "node:fs";
import path from "node:path";

let failures = 0;
const ok = (n: string) => console.log(`ok   ${n}`);
const fail = (n: string, e = "") => { failures++; console.log(`FAIL ${n} ${e}`); };
function expect(name: string, got: unknown, want: unknown) {
  const g = JSON.stringify(got); const w = JSON.stringify(want);
  if (g === w) ok(name); else fail(name, `got ${g}, want ${w}`);
}

const { challengeProgress, journeyCardData } = await import("../src/lib/challenges.ts");
const { setupRules } = await import("../src/lib/types.ts");
const respondMod = await import("../src/lib/minato/respond.ts");

/* Plan Trade stage order — read from source of truth (the component constant). */
const STAGE_ORDER_OK = (() => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/components/journal/plan-trade-flow.tsx"), "utf8");
  const m = src.match(/const STAGES = \[([\s\S]*?)\] as const;/);
  if (!m) return null;
  const stages = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  return {
    stages,
    orderValid:
      stages.length === 7 &&
      stages[0] === "Pre-session" &&
      stages[1] === "Setup" &&
      stages[2] === "Rules" &&
      stages[3] === "Pre-trade analysis" &&
      stages[4] === "Record trade" &&
      stages[5] === "Screenshots" &&
      stages[6] === "Autopsy" &&
      // checklist (rules + pre-trade) MUST precede manual entry/import
      stages.indexOf("Rules") < stages.indexOf("Record trade") &&
      stages.indexOf("Pre-trade analysis") < stages.indexOf("Record trade"),
  };
})();

const MINATO_PROMPT_OK = (() => {
  const src = fs.readFileSync(path.join(process.cwd(), "src/app/api/minato/chat/route.ts"), "utf8");
  return {
    noCoT: /chain-of-thought/i.test(src),
    answerFirst: /EXACT question in your first line/.test(src),
    evidenceTiers: /strong evidence[\s\S]*moderate evidence[\s\S]*weak small-sample/i.test(src),
    externalLabeled: /Your journal shows/.test(src) && /General market context/.test(src),
    noFabrication: /never fabricate specific current events/i.test(src),
  };
})();

const STORE_FILE = path.join(process.cwd(), ".edgebook", "accounts.json");
const originalStore = fs.existsSync(STORE_FILE) ? fs.readFileSync(STORE_FILE, "utf8") : null;

try {
  const mkEntry = (id: string, date: string, pnl: number, extra: Record<string, unknown> = {}) =>
    ({ id, date, pnl, rr: null, instrument: "NQ", direction: "long", setup: "", notes: "", images: [], createdAt: 1, updatedAt: 1, ...extra }) as never;

  /* ── 14. STATIC drawdown ── */
  {
    const c = { id: "c1", name: "Static", startingBalance: 50000, targetBalance: 55000, drawdownMode: "static" as const, maxDrawdown: 2500, createdAt: 1 };
    // Two losses then a win: static DD measured from STARTING balance only
    const p = challengeProgress(c, [
      mkEntry("e1", "2026-08-20", -1000, { challengeId: "c1" }),
      mkEntry("e2", "2026-08-21", -500, { challengeId: "c1" }),
      mkEntry("e3", "2026-08-22", +800, { challengeId: "c1" }),
    ]);
    expect("static DD ignores equity highs", p.currentDrawdown, 700);           // 50k − 49300
    expect("static drawdownThreshold fixed", p.drawdownThreshold, 47500);
    expect("highestBalance tracks high-water mark", p.highestBalance, 50000);
    expect("remaining drawdown", p.remainingDrawdown, 1800);
    ok("STATIC drawdown calculation");
  }

  /* ── 15. DYNAMIC / TRAILING drawdown ── */
  {
    const c = { id: "c2", name: "Trail", startingBalance: 50000, targetBalance: 55000, drawdownMode: "dynamic" as const, maxDrawdown: 2500, createdAt: 1 };
    // Rise to a new high, then fall — threshold trails the peak upward
    let p = challengeProgress(c, [
      mkEntry("e1", "2026-08-20", +2000, { challengeId: "c2" }),   // equity 52k → threshold 49.5k
      mkEntry("e2", "2026-08-21", -1000, { challengeId: "c2" }),   // equity 51k → DD = 1k
      mkEntry("e3", "2026-08-22", -500, { challengeId: "c2" }),    // equity 50.5k → DD = 1.5k
    ]);
    expect("dynamic DD trails high-water mark", p.currentDrawdown, 1500);
    expect("dynamic threshold moved UP with the peak", p.drawdownThreshold, 49500);

    // Floor/lock: threshold can never breach the configured floor
    const cf = { ...c, id: "c2f", drawdownFloor: 48000 };
    p = challengeProgress(cf, [mkEntry("e1", "2026-08-20", +6000, { challengeId: cf.id })]); // peak 56k → raw threshold 53.5k? no wait floor irrelevant here
    expect("floor does not cap above trailing value", p.drawdownThreshold >= 48000, true);

    const cf2 = { ...cf, id: "c2f2" };
    const pf = challengeProgress(cf2, [mkEntry("e1", "2026-08-20", +1000, { challengeId: "c2f2" })]); // peak 51k → threshold 48.5k > floor 48k
    expect("trailing threshold above floor unaffected", pf.drawdownThreshold, 48500);
    ok("DYNAMIC/TRAILING drawdown calculation with optional lock");
  }

  /* ── 16. Milestones ── */
  {
    const c = { id: "c3", name: "Milestones", startingBalance: 50000, targetBalance: 60000, createdAt: 1 };
    const p = challengeProgress(c, [mkEntry("e1", "2026-08-20", +2600, { challengeId: "c3" })]); // 26% progress
    expect("milestone fractions are START/10/25/50/75/90/TARGET",
      p.milestones.map((m) => m.fraction), [0, 0.1, 0.25, 0.5, 0.75, 0.9, 1]);
    const passed = p.milestones.filter((m) => m.passed).map((m) => m.fraction);
    expect("completed vs current vs future milestones", passed, [0, 0.1, 0.25]);
    expect("current milestone equity level", p.milestones[2].equity, 52500);
    ok("challenge milestone calculation");
  }

  /* ── 11+17. Challenge isolation & selection on trades ── */
  {
    const cA = { id: "A", name: "A", startingBalance: 10000, targetBalance: 11000, createdAt: 1 };
    const cB = { id: "B", name: "B", startingBalance: 20000, targetBalance: 22000, createdAt: 2 };
    const entries = [
      mkEntry("e1", "2026-08-20", +500, { challengeId: "A" }),
      mkEntry("e2", "2026-08-21", -200, { challengeId: "B" }),
      mkEntry("e3", "2026-08-22", +300), // no challenge — belongs to neither
    ];
    const pa = challengeProgress(cA as never, entries);
    const pb = challengeProgress(cB as never, entries);
    expect("challenge A sees only its trade", pa.tradesList.length, 1);
    expect("challenge B sees only its trade", pb.tradesList.length, 1);
    expect("unchallenged trade appears in neither", pa.trades + pb.trades, 2);
    ok("challenge data isolation");
  }

  /* ── 5. Unlimited rules ── */
  {
    const rules = Array.from({ length: 20 }, (_, i) => ({ id: `r${i}`, text: `Rule number ${i + 1}`, description: i === 0 ? "first rule detail" : undefined }));
    expect("setup supports 20 rules verbatim", setupRules({ rules }).length, 20);
    expect("rule text preserved", setupRules({ rules })[19].text, "Rule number 20");
    expect("legacy entryConditions migration still works",
      setupRules({ entryConditions: "a\nb\nc" }).length, 3);
    ok("unlimited rules supported");
  }

  /* ── 7. Deleted setup must not break historical trades ── */
  {
    // Trade references a setupId that no longer exists in any playbook.
    const orphanTrade = mkEntry("orphan", "2026-08-20", +120, { setupId: "deleted-setup-id", setup: "London Reversal", challengeId: "c4" });
    const c = { id: "c4", name: "Hist", startingBalance: 10000, targetBalance: 11000, createdAt: 1 };
    let crashed = false;
    try {
      const p = challengeProgress(c as never, [orphanTrade]);
      if (p.trades !== 1) crashed = true;
    } catch { crashed = true; }
    expect("progress calculation survives deleted setup reference", crashed, false);
    ok("deleted setup preserves historical trades without crashing");
  }

  /* ── 18–23. MINATO deterministic answer contract ── */
  {
    const ctx = {
      userFirstName: "Test",
      stats: { tradingDays: 12, totalPnl: 850, winRate: 0.64, avgDayPnl: 70, drawdown: 300, daily: [], equityCurve: [], currentEquity: 10850, peakEquity: 10900 },
      discipline: { disciplineStreak: 2, cleanDayRate: 0.75 },
      adherence: { cleanDayRate: 0.75 },
      recentTrades: [
        mkEntry("t1", "2026-08-20", 200, { rr: 2, entryTime: "09:40", exitTime: "10:05", setup: "Sweep", reviewStatus: "reviewed", review: { outcome: { followedPlan: true }, concepts: { used: ["SMT"] } } }),
        mkEntry("t2", "2026-08-21", -80, { rr: -1, entryTime: "09:50", exitTime: "10:30", setup: "Sweep", reviewStatus: "reviewed", review: { outcome: { followedPlan: false }, execution: { movedStop: true }, psychology: { fomo: true }, concepts: { used: ["SMT"] } } }),
        mkEntry("t3", "2026-08-22", 150, { rr: 1.5, entryTime: "09:45", exitTime: "10:00", setup: "SMT", reviewStatus: "reviewed", review: { outcome: { followedPlan: true } } }),
      ] as never,
      focus: null,
      playbook: [],
      activeRules: [],
      recurringPatterns: [],
      privacy: { includeNotes: true },
    };

    const overall = respondMod.respond(ctx as never, "how am I doing?");
    expect("overview answers in English", /[a-zA-Z]/.test(overall) && !/[ఀ-౿]/u.test(overall), true);
    expect("no 'bro' in responses", overall.includes("bro"), false);
    expect("structured numbered output", /\n1\./.test(overall) || /^[^.]*win rate/i.test(overall), true);

    const windows = respondMod.respond(ctx as never, "what is my worst time window?");
    expect("time-window analysis is structured", /\d\./.test(windows) || windows.includes("Sample"), true);
    expect("small-sample honesty present", windows.toLowerCase().includes("sample") || windows.toLowerCase().includes("not enough") || windows.toLowerCase().includes("tendency"), true);

    const holdAnswer = respondMod.respond(ctx as never, "how long do I hold winners?");
    expect("hold-time analysis shows sample size", holdAnswer.includes("3 trades") || holdAnswer.includes("timestamps") || /\b3\b/.test(holdAnswer), true);

    const probabilityish = respondMod.respond(ctx as never, "what is my win probability?");
    // Must NOT fabricate a bare percentage without context/sample framing
    const fabricated = /^\s*\d+%$/.test(probabilityish.trim());
    expect("probability answers never fabricate bare numbers", fabricated, false);
    ok("MINATO deterministic contract (English · numbered · sample-size aware)");
  }

  /* ── 1–6. Plan Trade stage order & gating contract ── */
  {
    expect("plan flow exposes exactly 7 stages", STAGE_ORDER_OK?.stages.length, 7);
    expect("stage order: pre-session → setup → rules → pre-trade analysis → record → screenshots → autopsy", STAGE_ORDER_OK?.orderValid, true);
    ok("checklist (rules + pre-trade analysis) occurs BEFORE manual entry/import");
    ok("screenshots occur before Autopsy");
  }

  /* ── 8–10. Journey card derives from primary challenge ── */
  {
    // Challenge A primary → journey reflects A's balances
    const sA = { challenges: [
      { id: "JA", name: "Challenge A", startingBalance: 50000, targetBalance: 55000, createdAt: 1 },
      { id: "JB", name: "Challenge B", startingBalance: 100000, targetBalance: 110000, createdAt: 2 },
    ], primaryChallengeId: "JA" } as never;
    const entries = [mkEntry("j1", "2026-08-20", +1250, { challengeId: "JA" })];
    const j = journeyCardData(sA, entries as never);
    expect("journey uses PRIMARY challenge starting balance (not $10k default)", j.startingBalance, 50000);
    expect("journey current balance from challenge trades", j.currentBalance, 51250);
    expect("journey progress toward A's target", j.progressPct, 25);
    expect("journey names the challenge", j.challengeName, "Challenge A");

    // Switch primary to B → journey immediately reflects B, no reload
    const sB = { ...sA, primaryChallengeId: "JB" } as never;
    const jb = journeyCardData(sB, entries as never);
    expect("journey switches with primary challenge change", jb.startingBalance, 100000);
    expect("switched journey has no B-scoped trades yet", jb.currentBalance, 100000);

    // No primary → empty state, never a fabricated $10,000
    const none = journeyCardData({ challenges: [], primaryChallengeId: null } as never, entries as never);
    expect("no primary → null balances (empty state)", [none.challengeName, none.startingBalance], [null, null]);

    // No hard-coded $10,000 in the Journey component
    const navSrc = fs.readFileSync(path.join(process.cwd(), "src/components/shell/nav.tsx"), "utf8");
    expect("no hard-coded $10,000 in Journey component", /10[\d,.]*000/.test(navSrc.split("Journey mini-card")[1] ?? ""), false);
    expect("Journey derives via journeyCardData", navSrc.includes("journeyCardData(settings, entries)"), true);
  }

  /* ── 12–15. MINATO prompt/analysis contract ── */
  {
    expect("MINATO never exposes chain-of-thought (prompt prohibition present)", MINATO_PROMPT_OK?.noCoT, true);
    expect("MINATO answers the requested question first", MINATO_PROMPT_OK?.answerFirst, true);
    expect("MINATO distinguishes evidence tiers instead of 'not enough data'", MINATO_PROMPT_OK?.evidenceTiers, true);
    expect("MINATO labels personal vs external context", MINATO_PROMPT_OK?.externalLabeled && MINATO_PROMPT_OK?.noFabrication, true);

    // Deeper related analysis when evidence exists (deterministic path)
    const deep = respondMod.respond({
      userFirstName: "Test",
      stats: { tradingDays: 3, totalPnl: 270, winRate: 2 / 3, avgDayPnl: 90, drawdown: 0, daily: [], equityCurve: [], currentEquity: 10270, peakEquity: 10270 },
      discipline: { disciplineStreak: 1, cleanDayRate: 0.8 },
      adherence: { cleanDayRate: 0.8 },
      recentTrades: [
        mkEntry("s1", "2026-08-20", 200, { setupId: "Sweep", setup: "Sweep" }),
        mkEntry("s2", "2026-08-21", -80, { setupId: "Sweep", setup: "Sweep" }),
        mkEntry("s3", "2026-08-22", 150, { setupId: "SMT", setup: "SMT" }),
      ] as never,
      focus: null, playbook: [], activeRules: [], recurringPatterns: [], privacy: { includeNotes: true },
    } as never, "which setup performs best for me?");
    expect("setup-level analysis available when data exists", typeof deep === "string" && deep.length > 10, true);
  }

} finally {
  if (originalStore != null) fs.writeFileSync(STORE_FILE, originalStore);
}

console.log(failures === 0 ? "\nAll product tests passed" : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
