/**
 * Deterministic journal facts (moved verbatim out of the chat route so they can be tested and routed).
 * Nothing here calls a model.
 */
/* ------------------------------------------------------------------ */
/*  Deep analytics facts — computed in-memory from the loaded journal   */
/* ------------------------------------------------------------------ */

export interface RawEntry {
  id?: string;
  date?: string; pnl?: number; rr?: number | null; instrument?: string;
  setup?: string; entryTime?: string; exitTime?: string;
  entryPrice?: number | null; exitPrice?: number | null;
  stopLoss?: number | null; takeProfit?: number | null; notes?: string;
  direction?: string | null; reviewStatus?: string; images?: unknown[];
  reflection?: { wentWell?: string; wentPoorly?: string; cause?: string; lesson?: string } | null;
  preTradeChecklist?: { label?: string; description?: string; confirmed?: boolean }[];
  review?: {
    plannedVsActual?: { deviations?: string; notes?: string } | null;
    concepts?: { used?: string[]; learned?: string; improve?: string } | null;
    compareInsight?: string | null;
    execution?: { movedStop?: boolean | null; exitedEarly?: boolean | null; chased?: boolean | null };
    outcome?: { followedPlan?: boolean | null; processVerdict?: string } | null;
    psychology?: { emotionBefore?: string; convictionOrUrgency?: string; fomo?: boolean | null; revenge?: boolean | null; fearExit?: boolean | null } | null;
    followUp?: { strongestEvidence?: string; biggestMistake?: string; conceptApplied?: string; conceptMisunderstood?: string; watchNext?: string; mistake?: string; mistakeNote?: string; mistakeOther?: string } | null;
    setup?: { liquiditySwept?: string; sweepTimestamp?: string; smtEvidence?: string; targetDescription?: string; manipulationIdentified?: string } | null;
    postLossGate?: { immediateThoughts?: string; intendedNextAction?: string } | null;
  } | null;
}

export function bucketOf(time?: string): string | null {
  if (!time || !/^\d{2}:\d{2}$/.test(time)) return null;
  const h = Number(time.slice(0, 2));
  const m = Number(time.slice(3, 5));
  const startM = Math.floor(m / 15) * 15;
  const endH = startM === 45 ? h + 1 : h;
  const endM = startM === 45 ? 0 : startM + 15;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(h)}:${p(startM)}–${p(endH)}:${p(endM)}`;
}

export function deepFacts(entries: RawEntry[]) {
  // 15-minute time buckets by entry time (NY)
  const buckets = new Map<string, { n: number; wins: number; pnl: number }>();
  const dows = new Map<string, { n: number; wins: number; pnl: number }>();
  const setups = new Map<string, { n: number; wins: number; pnl: number; totalR: number; rN: number }>();
  let moved = 0, early = 0, chased = 0, plannedYes = 0, plannedNo = 0;
  const conceptOutcomes = new Map<string, { n: number; wins: number }>();

  for (const e of entries) {
    const pnl = typeof e.pnl === "number" ? e.pnl : 0;
    const win = pnl > 0;
    const b = bucketOf(e.entryTime);
    if (b) {
      const s = buckets.get(b) ?? { n: 0, wins: 0, pnl: 0 };
      s.n++; if (win) s.wins++; s.pnl += pnl;
      buckets.set(b, s);
    }
    if (e.date) {
      const dow = new Date(`${e.date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
      const s = dows.get(dow) ?? { n: 0, wins: 0, pnl: 0 };
      s.n++; if (win) s.wins++; s.pnl += pnl;
      dows.set(dow, s);
    }
    const su = (e.setup ?? "").trim() || "unnamed";
    {
      const s = setups.get(su) ?? { n: 0, wins: 0, pnl: 0, totalR: 0, rN: 0 };
      s.n++; if (win) s.wins++; s.pnl += pnl;
      if (typeof e.rr === "number") { s.totalR += e.rr; s.rN++; }
      setups.set(su, s);
    }
    if (e.review?.execution?.movedStop === true) moved++;
    if (e.review?.execution?.exitedEarly === true) early++;
    if (e.review?.execution?.chased === true) chased++;
    if (e.review?.outcome?.followedPlan === true) plannedYes++;
    else if (e.review?.outcome?.followedPlan === false) plannedNo++;
    for (const c of e.review?.concepts?.used ?? []) {
      const s = conceptOutcomes.get(c) ?? { n: 0, wins: 0 };
      s.n++; if (win) s.wins++;
      conceptOutcomes.set(c, s);
    }
  }

  const summarize = <T extends { n: number; wins: number; pnl: number }>(k: string, s: T) => ({
    key: k, trades: s.n, wins: s.wins,
    winRatePct: s.n > 0 ? Math.round((s.wins / s.n) * 100) : 0,
    avgPnl: s.n > 0 ? Math.round((s.pnl / s.n) * 100) / 100 : 0,
    netPnl: Math.round(s.pnl * 100) / 100,
  });

  const rankedBuckets = [...buckets.entries()]
    .map(([k, s]) => ({ ...summarize(k, s), label: `${k} NY` }))
    .sort((a, b2) => a.winRatePct - b2.winRatePct || a.avgPnl - b2.avgPnl);

  return {
    timeWindows: {
      worst: rankedBuckets.filter((b) => b.trades >= 2).slice(0, 3),
      best: rankedBuckets.filter((b) => b.trades >= 2).slice(-3).reverse(),
      sampleNote: "windows with ≥2 trades shown",
    },
    dayOfWeek: [...dows.entries()].map(([k, s]) => summarize(k, s)),
    setupPerformance: [...setups.entries()].map(([k, s]) => ({
      key: k, trades: s.n, wins: s.wins,
      winRatePct: s.n > 0 ? Math.round((s.wins / s.n) * 100) : 0,
      avgPnl: s.n > 0 ? Math.round((s.pnl / s.n) * 100) / 100 : 0,
      avgR: s.rN > 0 ? Math.round((s.totalR / s.rN) * 100) / 100 : null,
    })),
    behaviorCounts: {
      movedStop: moved,
      exitedEarly: early,
      chased,
      followedPlanCount: plannedYes,
      brokePlanCount: plannedNo,
    },
    conceptWinRates: [...conceptOutcomes.entries()].map(([k, s]) => ({
      key: k, trades: s.n, winRatePct: s.n > 0 ? Math.round((s.wins / s.n) * 100) : 0,
    })).sort((a, b2) => b2.trades - a.trades).slice(0, 8),
  };
}

export function buildTradeRows(entries: RawEntry[]) {
  // Per-trade rows so specific-trade questions ("how was my last trade",
  // "the 31 Aug trade") can be answered, AND so the model can genuinely
  // synthesize patterns across the full history rather than aggregate
  // stats alone. Sent in full — the user's own journal, no cap — since
  // per-trade rows are small and this is explicitly meant to be the
  // model's complete view of the account.
  const recentTrades = entries
    .slice()
    .sort((a, b2) => (b2.date ?? "").localeCompare(a.date ?? ""))
    .map((e) => {
      const psych = e.review?.psychology;
      const emotion =
        psych?.fomo === true ? "FOMO"
        : psych?.revenge === true ? "revenge/urgency"
        : psych?.fearExit === true ? "fear/hesitation"
        : psych?.convictionOrUrgency === "conviction" ? "calm"
        : psych?.emotionBefore || null;
      const processVerdict = e.review?.outcome?.processVerdict || null;
      return {
        id: e.id ?? null,
        date: e.date ?? null,
        instrument: e.instrument ?? null,
        direction: e.direction ?? null,
        pnl: typeof e.pnl === "number" ? e.pnl : null,
        rr: typeof e.rr === "number" ? e.rr : null,
        setup: e.setup ?? null,
        entryTime: e.entryTime ?? null,
        exitTime: e.exitTime ?? null,
        entryPrice: typeof e.entryPrice === "number" ? e.entryPrice : null,
        exitPrice: typeof e.exitPrice === "number" ? e.exitPrice : null,
        stopLoss: typeof e.stopLoss === "number" ? e.stopLoss : null,
        takeProfit: typeof e.takeProfit === "number" ? e.takeProfit : null,
        notes: e.notes || null,
        reviewStatus: e.reviewStatus ?? null,
        screenshots: (e.images ?? []).length,
        // The 5 Autopsy answers — all five, not just two of them:
        followedPlan: e.review?.outcome?.followedPlan ?? null, // Q1
        emotion, // Q2
        goodProcessTrade: processVerdict === "a-plus" ? true : processVerdict === "process-failure" ? false : null, // Q3
        mistakeOrLesson: e.review?.followUp?.biggestMistake ?? e.reflection?.lesson ?? null, // Q4
        watchNext: e.review?.followUp?.watchNext ?? null, // Q5
        // Preserve the trader's actual language. This means MINATO can weigh
        // every written observation against outcomes rather than reducing the
        // journal to a statistics table.
        traderWords: {
          notes: e.notes || null,
          reflection: {
            wentWell: e.reflection?.wentWell || null,
            wentPoorly: e.reflection?.wentPoorly || null,
            cause: e.reflection?.cause || null,
            lesson: e.reflection?.lesson || null,
          },
          reviewFollowUp: {
            strongestEvidence: e.review?.followUp?.strongestEvidence || null,
            biggestMistake: e.review?.followUp?.biggestMistake || null,
            conceptApplied: e.review?.followUp?.conceptApplied || null,
            conceptMisunderstood: e.review?.followUp?.conceptMisunderstood || null,
            watchNext: e.review?.followUp?.watchNext || null,
            mistake: e.review?.followUp?.mistake || null,
            mistakeNote: e.review?.followUp?.mistakeNote || null,
            mistakeOther: e.review?.followUp?.mistakeOther || null,
          },
          plannedVsActual: {
            deviations: e.review?.plannedVsActual?.deviations || null,
            notes: e.review?.plannedVsActual?.notes || null,
          },
          concepts: {
            learned: e.review?.concepts?.learned || null,
            improve: e.review?.concepts?.improve || null,
          },
          compareInsight: e.review?.compareInsight || null,
          setupEvidence: {
            liquiditySwept: e.review?.setup?.liquiditySwept || null,
            sweepTimestamp: e.review?.setup?.sweepTimestamp || null,
            smtEvidence: e.review?.setup?.smtEvidence || null,
            targetDescription: e.review?.setup?.targetDescription || null,
            manipulationIdentified: e.review?.setup?.manipulationIdentified || null,
          },
          postLossReflection: {
            immediateThoughts: e.review?.postLossGate?.immediateThoughts || null,
            intendedNextAction: e.review?.postLossGate?.intendedNextAction || null,
          },
          preTradeChecklist: (e.preTradeChecklist ?? []).map((item) => ({
            label: item.label || null,
            description: item.description || null,
            confirmed: item.confirmed === true,
          })),
        },
      };
    });

  // Every written lesson/reflection across the WHOLE journal, oldest to
  // newest, so the model can teach from the user's own past reviews
  // ("learn from my last trades where I write reviews") instead of only
  // ever seeing the aggregated stats.
  const lessons = recentTrades
    .filter((t) => (t.mistakeOrLesson && t.mistakeOrLesson.trim().length > 0) || (t.watchNext && t.watchNext.trim().length > 0))
    .reverse()
    .map((t) => ({ date: t.date, instrument: t.instrument, pnl: t.pnl, mistakeOrLesson: t.mistakeOrLesson, watchNext: t.watchNext }));
  // Keep numerical/execution history separate from the full written record.
  // That lets the model inspect both without paying for the same note twice.
  const traderWords = recentTrades.map((trade) => ({ date: trade.date, instrument: trade.instrument, setup: trade.setup, text: trade.traderWords }));
  const tradeHistory = recentTrades.map(({ traderWords: _traderWords, notes: _notes, ...trade }) => trade);
  return { recentTrades, lessons, traderWords, tradeHistory };
}
