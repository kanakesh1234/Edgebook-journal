import type { AiBrainDailyRecord, AiBrainMemory, JournalEntry, PlaybookSetup, TradePlan } from "./types";
import { categoryOf, isMistakeKey, mistakeLabel, mistakeOf, mistakeTagsOf, type MistakeKey } from "./mistakes";
import { dayTrades } from "./risk";
import { scanSources, type ScanSource } from "./tagging/rules";
import type { TagBundle } from "./tagging/evidence";
import { groundRun, type ModelRun } from "./tagging/prompt";

/**
 * EDGEBOOK ADAPTIVE AI BRAIN
 *
 * Learns continuously from the trader's recorded entries, plans, playbook rules, and autopsy reflections,
 * and persists its cumulative understanding in Google Drive (`settings.aiBrain` in `journal.json`).
 */

export interface LearnedTagSuggestion {
  key: MistakeKey;
  label: string;
  confidence: number;
  reason: string;
  source: "text" | "emotion" | "setup" | "session" | "history";
}

export interface BrainCalibration {
  totalTrades: number;
  reviewedTrades: number;
  linkedPlans: number;
  learnedTokens: number;
  calibrationPct: number;
  tier: "Seed" | "Calibrating" | "Calibrated" | "High-Precision";
}

export interface PreTradeThoughtAnalysis {
  hasTrigger: boolean;
  hasInvalidation: boolean;
  hasPatienceGuard: boolean;
  badge: "Ready to execute" | "Sharp If → Then" | "Add invalidation" | "Define trigger";
  tone: "good" | "gold" | "info";
  insight: string;
}

export interface PreTradeBrainRead {
  calibration: BrainCalibration;
  headline: string;
  subline: string;
  suggestedWatch: LearnedTagSuggestion[];
  setupInsight: string | null;
  emotionInsight: string | null;
  clarityScore: number;
  thoughtAnalysis: PreTradeThoughtAnalysis;
}

export interface PeriodThoughtAnalysis {
  totalTrades: number;
  plannedTrades: number;
  unplannedTrades: number;
  plannedWinRate: number | null;
  unplannedWinRate: number | null;
  ifThenCount: number;
  watchPreventedCount: number;
  topTheme: string | null;
  sampleThoughts: { date: string; text: string; pnl: number | null }[];
  headline: string;
  subline: string;
  chipText: string;
}

const STOP_WORDS = new Set([
  "the", "and", "for", "that", "this", "with", "from", "was", "were", "have", "had", "has", "not", "but",
  "you", "your", "my", "our", "trade", "traded", "trading", "price", "market", "into", "out", "when", "then",
  "just", "very", "too", "some", "all", "any", "can", "will", "would", "could", "should", "about", "after", "before",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));
}

export function computeBrainCalibration(
  entries: JournalEntry[],
  plans: TradePlan[],
  learnedTokenCount = 0,
): BrainCalibration {
  const totalTrades = entries.length;
  const reviewedTrades = entries.filter((e) => e.reviewStatus === "reviewed" || !!e.review?.followUp?.mistake).length;
  const linkedPlans = plans.length;
  const units = reviewedTrades * 2 + linkedPlans * 1 + Math.max(0, totalTrades - reviewedTrades) * 0.6;
  const calibrationPct = totalTrades === 0 && linkedPlans === 0
    ? 35
    : Math.min(98, Math.max(38, Math.round(38 + 60 * (1 - Math.exp(-units / 24)))));
  const tier: BrainCalibration["tier"] =
    units >= 45 ? "High-Precision" : units >= 18 ? "Calibrated" : units >= 6 ? "Calibrating" : "Seed";
  return {
    totalTrades,
    reviewedTrades,
    linkedPlans,
    learnedTokens: learnedTokenCount,
    calibrationPct,
    tier,
  };
}

export function buildPersonalBrain(entries: JournalEntry[], plans: TradePlan[], prevMemory?: AiBrainMemory | null) {
  const planById = new Map(plans.map((p) => [p.id, p]));
  const planOf = (e: JournalEntry) =>
    (e.planId ? planById.get(e.planId) : undefined) ??
    plans.find((p) => p.linkedTradeId === e.id) ??
    plans.find((p) => p.date === e.date);

  const tagCounts = new Map<MistakeKey, number>();
  const tokenTagCounts = new Map<string, Map<MistakeKey, number>>();

  if (prevMemory?.learnedVocabulary) {
    for (const [word, mapObj] of Object.entries(prevMemory.learnedVocabulary)) {
      const m = new Map<MistakeKey, number>();
      for (const [k, cnt] of Object.entries(mapObj)) {
        if (isMistakeKey(k) && typeof cnt === "number" && cnt > 0) {
          m.set(k, Math.min(cnt, 3));
        }
      }
      if (m.size > 0) tokenTagCounts.set(word, m);
    }
  }

  const emotionStats = new Map<string, { n: number; wins: number; pnl: number; mistakes: Map<MistakeKey, number> }>();
  const setupStats = new Map<string, { n: number; wins: number; pnl: number; mistakes: Map<MistakeKey, number> }>();
  const afterLossMistakes = new Map<MistakeKey, number>();
  let afterLossTotal = 0;
  let afterLossWins = 0;

  let linkedCount = 0;
  let followedPlanCount = 0;
  let watchPreventedCount = 0;
  let watchRepeatedCount = 0;

  const byDay = new Map<string, JournalEntry[]>();
  for (const e of entries) {
    const list = byDay.get(e.date);
    if (list) list.push(e);
    else byDay.set(e.date, [e]);
  }

  const dailyRecords: AiBrainDailyRecord[] = [];

  for (const [date, dayList] of [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const ordered = dayTrades(date, dayList);
    let dayPnl = 0;
    let dayFollowed = 0;
    let dayReviewed = 0;
    const dayEmotions = new Map<string, number>();
    const dayMistakes = new Map<MistakeKey, number>();

    ordered.forEach((e, idx) => {
      dayPnl += e.pnl;
      const hadLossBefore = idx > 0 && ordered.slice(0, idx).some((prev) => prev.pnl < 0);
      const plan = planOf(e);
      const tags = mistakeTagsOf(e);
      const primaryMistake = mistakeOf(e);
      const allKeys = new Set<MistakeKey>(tags.map((t) => t.key));
      if (primaryMistake && primaryMistake.key !== "other") allKeys.add(primaryMistake.key);

      for (const k of allKeys) dayMistakes.set(k, (dayMistakes.get(k) ?? 0) + 1);

      if (plan) {
        linkedCount++;
        if (e.review?.outcome?.followedPlan === true) followedPlanCount++;
        const watched = plan.watchMistakes ?? [];
        if (watched.length > 0) {
          const repeated = watched.some((w) => isMistakeKey(w) && allKeys.has(w));
          if (repeated) watchRepeatedCount++;
          else if (e.reviewStatus === "reviewed" || e.review?.followUp?.mistake === "none") watchPreventedCount++;
        }
      }

      if (e.review?.outcome?.followedPlan != null) {
        dayReviewed++;
        if (e.review.outcome.followedPlan) dayFollowed++;
      }

      if (hadLossBefore) {
        afterLossTotal++;
        if (e.pnl > 0) afterLossWins++;
        for (const k of allKeys) afterLossMistakes.set(k, (afterLossMistakes.get(k) ?? 0) + 1);
      }

      const emo = (plan?.emotionalState || e.review?.psychology?.emotionBefore || e.review?.psychology?.emotionAfter || "").toUpperCase();
      if (emo) {
        dayEmotions.set(emo, (dayEmotions.get(emo) ?? 0) + 1);
        const st = emotionStats.get(emo) ?? { n: 0, wins: 0, pnl: 0, mistakes: new Map() };
        st.n++;
        if (e.pnl > 0) st.wins++;
        st.pnl += e.pnl;
        for (const k of allKeys) st.mistakes.set(k, (st.mistakes.get(k) ?? 0) + 1);
        emotionStats.set(emo, st);
      }

      const setupKey = (e.setup || e.setupId || plan?.playbookName || "").trim().toLowerCase();
      if (setupKey) {
        const st = setupStats.get(setupKey) ?? { n: 0, wins: 0, pnl: 0, mistakes: new Map() };
        st.n++;
        if (e.pnl > 0) st.wins++;
        st.pnl += e.pnl;
        for (const k of allKeys) st.mistakes.set(k, (st.mistakes.get(k) ?? 0) + 1);
        setupStats.set(setupKey, st);
      }

      if (allKeys.size > 0) {
        const textBlob = [
          e.review?.followUp?.mistakeOther,
          e.review?.followUp?.mistakeNote,
          e.reflection?.wentPoorly,
          e.reflection?.cause,
          e.reflection?.lesson,
          e.review?.followUp?.biggestMistake,
          e.notes,
          plan?.thesis,
          plan?.emotionalNote,
          plan?.whatCouldBreakPlan,
        ]
          .filter(Boolean)
          .join(" ");
        const words = new Set(tokenize(textBlob));
        for (const k of allKeys) {
          tagCounts.set(k, (tagCounts.get(k) ?? 0) + 1);
          for (const w of words) {
            const m = tokenTagCounts.get(w) ?? new Map<MistakeKey, number>();
            m.set(k, (m.get(k) ?? 0) + 1);
            tokenTagCounts.set(w, m);
          }
        }
      }
    });

    const topEmo = [...dayEmotions.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const topMistakeKey = [...dayMistakes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const planRate = dayReviewed > 0 ? Math.round((dayFollowed / dayReviewed) * 100) / 100 : null;
    const summaryParts = [
      `${ordered.length} trade${ordered.length === 1 ? "" : "s"} (${dayPnl >= 0 ? "+" : "−"}$${Math.abs(Math.round(dayPnl))})`,
      topEmo ? `felt ${topEmo.toLowerCase()}` : null,
      topMistakeKey ? `main leak: ${mistakeLabel(topMistakeKey)}` : "clean execution",
    ].filter(Boolean);

    dailyRecords.push({
      date,
      trades: ordered.length,
      netPnl: Math.round(dayPnl * 100) / 100,
      dominantEmotion: topEmo,
      mainMistake: topMistakeKey,
      planFollowedRate: planRate,
      summary: summaryParts.join(" · "),
      updatedAt: Date.now(),
    });
  }

  return {
    tagCounts,
    tokenTagCounts,
    emotionStats,
    setupStats,
    afterLossMistakes,
    afterLossTotal,
    afterLossWins,
    planToAutopsy: {
      linkedCount,
      followedPlanCount,
      watchPreventedCount,
      watchRepeatedCount,
    },
    dailyRecords: dailyRecords.slice(-60),
    calibration: computeBrainCalibration(entries, plans, tokenTagCounts.size),
  };
}

export function syncAiBrainMemory(
  entries: JournalEntry[],
  plans: TradePlan[],
  _playbook: PlaybookSetup[] = [],
  prevMemory?: AiBrainMemory | null,
): AiBrainMemory {
  const b = buildPersonalBrain(entries, plans, prevMemory);

  const vocabEntries = [...b.tokenTagCounts.entries()]
    .map(([word, map]) => {
      const total = [...map.values()].reduce((s, n) => s + n, 0);
      const obj: Record<string, number> = {};
      for (const [k, cnt] of map.entries()) obj[k] = cnt;
      return { word, total, obj };
    })
    .filter((x) => x.total >= 2)
    .sort((a, b2) => b2.total - a.total)
    .slice(0, 120);

  const learnedVocabulary: Record<string, Record<string, number>> = {};
  for (const item of vocabEntries) {
    learnedVocabulary[item.word] = item.obj;
  }

  const emotionProfile: AiBrainMemory["emotionProfile"] = {};
  for (const [emo, st] of b.emotionStats.entries()) {
    const topMistakes: Record<string, number> = {};
    for (const [k, cnt] of st.mistakes.entries()) topMistakes[k] = cnt;
    emotionProfile[emo] = {
      n: st.n,
      wins: st.wins,
      netPnl: Math.round(st.pnl * 100) / 100,
      topMistakes,
    };
  }

  const setupProfile: AiBrainMemory["setupProfile"] = {};
  for (const [su, st] of b.setupStats.entries()) {
    const topMistakes: Record<string, number> = {};
    for (const [k, cnt] of st.mistakes.entries()) topMistakes[k] = cnt;
    setupProfile[su] = {
      n: st.n,
      wins: st.wins,
      netPnl: Math.round(st.pnl * 100) / 100,
      topMistakes,
    };
  }

  return {
    v: 1,
    updatedAt: Date.now(),
    totalTradesAnalyzed: b.calibration.totalTrades,
    reviewedTradesAnalyzed: b.calibration.reviewedTrades,
    plansAnalyzed: b.calibration.linkedPlans,
    calibrationPct: b.calibration.calibrationPct,
    tier: b.calibration.tier,
    learnedVocabulary,
    emotionProfile,
    setupProfile,
    planToAutopsy: b.planToAutopsy,
    dailyUnderstandings: b.dailyRecords,
    // Minato's layer is owned by the chat; the journal sync must never wipe it.
    minato: prevMemory?.minato,
  };
}

/**
 * Live pre-trade analysis for Plan & Record ("Plan", "Thought", and "Mistakes to watch").
 */
export function analyzePreTradeThought(
  draft: {
    date: string;
    thesis: string;
    emotion?: string;
    emotionReason?: string;
    newsEvents?: { name: string; time?: string }[];
    instrument?: string;
    draw?: string;
    invalidation?: string;
    breakPlan?: string;
    playbookId?: string;
    playbookName?: string;
  },
  entries: JournalEntry[],
  plans: TradePlan[],
  _playbook?: PlaybookSetup[],
  persistedMemory?: AiBrainMemory | null,
): PreTradeBrainRead {
  const brain = buildPersonalBrain(entries, plans, persistedMemory);
  const suggestions = new Map<MistakeKey, LearnedTagSuggestion>();

  const upsert = (s: LearnedTagSuggestion) => {
    const prev = suggestions.get(s.key);
    if (!prev || s.confidence > prev.confidence) {
      suggestions.set(s.key, s);
    }
  };

  const writtenSources: ScanSource[] = [
    { id: "s1", role: "psych-note" as const, text: draft.emotionReason ?? "" },
    { id: "s2", role: "watch-next" as const, text: draft.breakPlan ?? "" },
    { id: "s3", role: "note" as const, text: draft.thesis ?? "" },
    { id: "s4", role: "note" as const, text: draft.invalidation ?? "" },
  ].filter((s) => s.text.trim().length > 0);

  if (writtenSources.length > 0) {
    const scan = scanSources(writtenSources);
    for (const ks of scan.scores.slice(0, 4)) {
      if (ks.score >= 1.2 && ks.key !== "other") {
        const hitQuote = ks.hits[0]?.quote ?? "";
        upsert({
          key: ks.key,
          label: mistakeLabel(ks.key),
          confidence: Math.min(0.95, 0.55 + ks.score * 0.1),
          reason: hitQuote ? `Detected in your note: “${hitQuote.slice(0, 70)}”` : `Matches wording in your pre-trade thought`,
          source: "text",
        });
      }
    }

    const draftTokens = tokenize(writtenSources.map((s) => s.text).join(" "));
    const vocabScores = new Map<MistakeKey, { score: number; matchedWord: string }>();
    for (const tok of draftTokens) {
      const m = brain.tokenTagCounts.get(tok);
      if (!m) continue;
      for (const [k, count] of m.entries()) {
        if (count < 2) continue;
        const cur = vocabScores.get(k) ?? { score: 0, matchedWord: tok };
        cur.score += count;
        vocabScores.set(k, cur);
      }
    }
    for (const [k, info] of vocabScores.entries()) {
      if (info.score >= 2) {
        upsert({
          key: k,
          label: mistakeLabel(k),
          confidence: Math.min(0.9, 0.52 + info.score * 0.08),
          reason: `Your Drive Brain links “${info.matchedWord}” with ${mistakeLabel(k).toLowerCase()} in past autopsies`,
          source: "history",
        });
      }
    }
  }

  const emo = (draft.emotion ?? "").toUpperCase();
  const emoMap: Partial<Record<string, { key: MistakeKey; why: string }>> = {
    FOMO: { key: "fomo", why: "You marked feeling FOMO — watch for chasing extended candles or entering before candle closure." },
    ANXIOUS: { key: "exit", why: "When feeling anxious, traders most often cut winners early or micromanage stops." },
    UNCERTAIN: { key: "hesitation", why: "Uncertainty often leads to hesitating on the real trigger and entering late." },
    "REVENGE-PRONE": { key: "revenge", why: "Feeling revenge-prone — strictly enforce your 1-trade reset and normal contract size." },
    FRUSTRATED: { key: "tilt", why: "Frustration increases the risk of forcing a marginal setup outside your rules." },
    CONFIDENT: { key: "size", why: "High confidence can tempt oversizing — keep contract size locked to your plan." },
  };
  if (emo && emoMap[emo]) {
    const target = emoMap[emo]!;
    upsert({
      key: target.key,
      label: mistakeLabel(target.key),
      confidence: 0.78,
      reason: target.why,
      source: "emotion",
    });
  }

  let emotionInsight: string | null = null;
  if (emo) {
    const es = brain.emotionStats.get(emo);
    if (es && es.n >= 2) {
      const wr = Math.round((es.wins / es.n) * 100);
      const topM = [...es.mistakes.entries()].sort((a, b) => b[1] - a[1])[0];
      emotionInsight = `When feeling ${emo.toLowerCase()}, you've won ${wr}% across ${es.n} trades${topM ? ` (top trap: ${mistakeLabel(topM[0])}, ${topM[1]}×)` : ""}.`;
      if (topM && topM[1] >= 1) {
        upsert({
          key: topM[0],
          label: mistakeLabel(topM[0]),
          confidence: Math.min(0.92, 0.65 + topM[1] * 0.08),
          reason: `Occurred ${topM[1]}× in your past trades when feeling ${emo.toLowerCase()}.`,
          source: "emotion",
        });
      }
    }
  }

  const todayList = dayTrades(draft.date, entries);
  const lossesToday = todayList.filter((e) => e.pnl < 0).length;
  if (lossesToday > 0) {
    const topAfterLoss = [...brain.afterLossMistakes.entries()].sort((a, b) => b[1] - a[1])[0];
    const key = topAfterLoss ? topAfterLoss[0] : "revenge";
    upsert({
      key,
      label: mistakeLabel(key),
      confidence: 0.9,
      reason: `You have ${lossesToday} loss${lossesToday > 1 ? "es" : ""} earlier today — ${mistakeLabel(key).toLowerCase()} is the #1 post-loss risk.`,
      source: "session",
    });
  }
  if (todayList.length >= 2) {
    upsert({
      key: "overtrade",
      label: mistakeLabel("overtrade"),
      confidence: 0.85,
      reason: `This will be trade #${todayList.length + 1} today — guard against overtrading.`,
      source: "session",
    });
  }
  if ((draft.newsEvents?.length ?? 0) > 0) {
    const names = draft.newsEvents!.map((n) => n.name).filter(Boolean).join(", ");
    upsert({
      key: "news",
      label: mistakeLabel("news"),
      confidence: 0.84,
      reason: `Scheduled news today (${names || "red-folder event"}) — wait for post-release structure.`,
      source: "session",
    });
  }

  let setupInsight: string | null = null;
  const setupLookup = (draft.playbookId || draft.playbookName || "").trim().toLowerCase();
  const setupByName = (draft.playbookName || "").trim().toLowerCase();
  const st = brain.setupStats.get(setupLookup) ?? (setupByName ? brain.setupStats.get(setupByName) : undefined);
  if (st && st.n >= 2) {
    const wr = Math.round((st.wins / st.n) * 100);
    const topM = [...st.mistakes.entries()].sort((a, b) => b[1] - a[1])[0];
    setupInsight = `${draft.playbookName || "Selected setup"}: ${wr}% win rate over ${st.n} trades${topM ? ` · most frequent leak is ${mistakeLabel(topM[0])} (${topM[1]}×)` : ""}.`;
    if (topM) {
      upsert({
        key: topM[0],
        label: mistakeLabel(topM[0]),
        confidence: Math.min(0.92, 0.68 + topM[1] * 0.07),
        reason: `Most frequent mistake on ${draft.playbookName || "this setup"} (${topM[1]} of ${st.n} trades).`,
        source: "setup",
      });
    }
  }

  const topGlobal = [...brain.tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  for (const [k, count] of topGlobal) {
    if (!suggestions.has(k) && count >= 1) {
      upsert({
        key: k,
        label: mistakeLabel(k),
        confidence: Math.min(0.82, 0.5 + count * 0.06),
        reason: `Recurring pattern in your journal (${count} recorded ${count === 1 ? "trade" : "trades"}).`,
        source: "history",
      });
    }
  }

  // Analyze the quality & structure of the trader's pre-trade thoughts
  const allThoughtText = [draft.breakPlan, draft.draw, draft.invalidation, draft.thesis].filter(Boolean).join(" ");
  const hasTrigger = /\b(if|when|sweep|sweeps|close|closes|smt|fvg|displacement|break|reclaim|tap|trigger|→|->)\b/i.test(allThoughtText);
  const hasInvalidation = /\b(invalid|invalidates|cut|stop|sl|below|above|lose|loses|wrong|abort|cancel)\b/i.test(allThoughtText);
  const hasPatienceGuard = /\b(wait|sit|hands|chop|patience|no\s+revenge|zero\s+revenge|confirm|body\s+close)\b/i.test(allThoughtText);

  let clarityScore = 25;
  if (draft.thesis.trim().length >= 15) clarityScore += 20;
  if (draft.emotion) clarityScore += 15;
  if (hasTrigger) clarityScore += 18;
  if (hasInvalidation) clarityScore += 12;
  if (hasPatienceGuard) clarityScore += 10;
  clarityScore = Math.min(100, clarityScore);

  const badge: PreTradeThoughtAnalysis["badge"] =
    hasTrigger && hasInvalidation
      ? "Ready to execute"
      : hasTrigger
        ? "Sharp If → Then"
        : (draft.breakPlan ?? "").trim().length > 0
          ? "Add invalidation"
          : "Define trigger";

  const tone: PreTradeThoughtAnalysis["tone"] =
    hasTrigger && hasInvalidation ? "good" : hasTrigger ? "gold" : "info";

  const sortedSuggestions = [...suggestions.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 5);

  const thoughtInsight =
    hasTrigger && hasInvalidation
      ? emotionInsight ?? setupInsight ?? "Trigger and invalidation are locked — execute without hesitation."
      : hasTrigger
        ? "Clear entry trigger defined — add where the setup invalidates so exits stay objective."
        : sortedSuggestions[0]
          ? `Watch for ${sortedSuggestions[0].label.toLowerCase()} today — add an If → Then rule above.`
          : "Add an If → Then scenario so your entry and invalidation are decided before the candle forms.";

  const headline =
    setupInsight ??
    emotionInsight ??
    (brain.calibration.totalTrades > 0
      ? `AI Brain synced across ${brain.calibration.totalTrades} trades (${brain.calibration.reviewedTrades} autopsies).`
      : "AI Brain is active — every plan and autopsy sharpens its personal accuracy.");

  const subline =
    sortedSuggestions.length > 0
      ? `Top watch for this trade: ${sortedSuggestions.slice(0, 2).map((s) => s.label).join(" & ")}.`
      : "Define where liquidity sits and what invalidates your read before choosing your setup.";

  return {
    calibration: brain.calibration,
    headline,
    subline,
    suggestedWatch: sortedSuggestions,
    setupInsight,
    emotionInsight,
    clarityScore,
    thoughtAnalysis: {
      hasTrigger,
      hasInvalidation,
      hasPatienceGuard,
      badge,
      tone,
      insight: thoughtInsight,
    },
  };
}

/**
 * Analyzes pre-trade thoughts (`plans` + `entry.notes`) across a Weekly or Monthly review window
 * so Weekly and Monthly Reviews surface AI Thought insights alongside setup & mistake metrics.
 */
export function analyzePeriodThoughts(
  entries: JournalEntry[],
  plans: TradePlan[],
  startDate: string,
  endDate: string,
): PeriodThoughtAnalysis {
  const periodEntries = entries.filter((e) => e.date >= startDate && e.date <= endDate);
  const periodPlans = plans.filter((p) => p.date >= startDate && p.date <= endDate);
  const planById = new Map(plans.map((p) => [p.id, p]));

  const planForEntry = (e: JournalEntry): TradePlan | undefined =>
    (e.planId ? planById.get(e.planId) : undefined) ??
    periodPlans.find((p) => p.linkedTradeId === e.id) ??
    periodPlans.find((p) => p.date === e.date);

  const plannedList: JournalEntry[] = [];
  const unplannedList: JournalEntry[] = [];
  let ifThenCount = 0;
  let watchPreventedCount = 0;

  const themeCounts = new Map<string, number>([
    ["Liquidity sweep & 5m close", 0],
    ["SMT divergence confirmation", 0],
    ["Patience in chop / open", 0],
    ["Strict invalidation & stop respect", 0],
  ]);

  const sampleThoughts: { date: string; text: string; pnl: number | null }[] = [];

  for (const p of periodPlans) {
    const raw = [p.whatCouldBreakPlan, p.preSessionProcess, p.drawOnLiquidity, p.invalidation, p.thesis]
      .filter(Boolean)
      .join(" · ")
      .trim();
    if (!raw) continue;
    if (/\b(if|when|→|->)\b/i.test(raw)) ifThenCount++;
    if (/\b(sweep|liquidity|5m|close)\b/i.test(raw)) themeCounts.set("Liquidity sweep & 5m close", (themeCounts.get("Liquidity sweep & 5m close") ?? 0) + 1);
    if (/\b(smt|divergence)\b/i.test(raw)) themeCounts.set("SMT divergence confirmation", (themeCounts.get("SMT divergence confirmation") ?? 0) + 1);
    if (/\b(chop|sit\s+on\s+hands|wait|patience)\b/i.test(raw)) themeCounts.set("Patience in chop / open", (themeCounts.get("Patience in chop / open") ?? 0) + 1);
    if (/\b(invalid|cut|stop|sl|revenge)\b/i.test(raw)) themeCounts.set("Strict invalidation & stop respect", (themeCounts.get("Strict invalidation & stop respect") ?? 0) + 1);

    const linked = periodEntries.find((e) => e.planId === p.id || e.id === p.linkedTradeId || e.date === p.date);
    const snippet = (p.whatCouldBreakPlan || p.preSessionProcess || p.thesis || "").trim();
    if (snippet && sampleThoughts.length < 3) {
      sampleThoughts.push({ date: p.date, text: snippet, pnl: linked ? linked.pnl : null });
    }
  }

  for (const e of periodEntries) {
    const pl = planForEntry(e);
    const hasThought = Boolean(pl && (pl.whatCouldBreakPlan?.trim() || pl.preSessionProcess?.trim() || pl.thesis?.trim()));
    if (hasThought) {
      plannedList.push(e);
      const watched = pl?.watchMistakes ?? [];
      if (watched.length > 0) {
        const entryMistakes = new Set(mistakeTagsOf(e).map((t) => t.key));
        const repeated = watched.some((w) => isMistakeKey(w) && entryMistakes.has(w));
        if (!repeated) watchPreventedCount++;
      }
    } else {
      unplannedList.push(e);
    }
  }

  const plannedWinRate = plannedList.length > 0 ? plannedList.filter((e) => e.pnl > 0).length / plannedList.length : null;
  const unplannedWinRate = unplannedList.length > 0 ? unplannedList.filter((e) => e.pnl > 0).length / unplannedList.length : null;
  const topThemeEntry = [...themeCounts.entries()].filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1])[0];
  const topTheme = topThemeEntry ? topThemeEntry[0] : null;

  let headline = "Log pre-trade thoughts in Plan & Record";
  let subline = "Writing one If → Then thought before entry lets the AI compare your pre-trade read against actual execution.";
  let chipText = "Write a clear If → Then thought before every entry.";

  if (plannedList.length > 0) {
    const pWr = Math.round((plannedWinRate ?? 0) * 100);
    if (unplannedList.length > 0 && unplannedWinRate != null) {
      const uWr = Math.round(unplannedWinRate * 100);
      headline = `${pWr}% win rate when pre-trade thoughts were logged (${plannedList.length}/${periodEntries.length} trades)`;
      subline =
        pWr >= uWr
          ? `Planned trades outperformed unplanned trades (${pWr}% vs ${uWr}%)${topTheme ? ` · top focus: ${topTheme.toLowerCase()}` : ""}.`
          : `Logged pre-trade thoughts on ${plannedList.length} trades (${pWr}% won)${watchPreventedCount > 0 ? ` and avoided flagged mistake traps ${watchPreventedCount}×` : ""}.`;
      chipText = `Logged pre-trade thoughts on ${plannedList.length}/${periodEntries.length} trades (${pWr}% win rate vs ${uWr}% unplanned).`;
    } else {
      headline = `${plannedList.length} of ${periodEntries.length} trades backed by pre-trade thoughts (${pWr}% win rate)`;
      subline = topTheme
        ? `Primary pre-trade thought focus: ${topTheme}${watchPreventedCount > 0 ? ` · ${watchPreventedCount} flagged mistake traps avoided` : ""}.`
        : `Consistent pre-trade planning across ${plannedList.length} ${plannedList.length === 1 ? "session" : "sessions"}.`;
      chipText = `Backed ${plannedList.length}/${periodEntries.length} trades with pre-trade If → Then thoughts (${pWr}% win rate).`;
    }
  } else if (periodPlans.length > 0) {
    headline = `${periodPlans.length} pre-trade ${periodPlans.length === 1 ? "thought" : "thoughts"} logged · no trades triggered`;
    subline = topTheme ? `Focused on ${topTheme.toLowerCase()} and stayed disciplined.` : "Planned ahead and waited for A+ confirmation.";
    chipText = `Logged ${periodPlans.length} pre-trade ${periodPlans.length === 1 ? "plan" : "plans"} and stayed patient when setups didn't trigger.`;
  }

  return {
    totalTrades: periodEntries.length,
    plannedTrades: plannedList.length,
    unplannedTrades: unplannedList.length,
    plannedWinRate,
    unplannedWinRate,
    ifThenCount,
    watchPreventedCount,
    topTheme,
    sampleThoughts,
    headline,
    subline,
    chipText,
  };
}

/**
 * Guaranteed server/local AI tagging voter (`edgebook-brain-v2`) when external LLM providers
 * are rate-limited, offline, or fail to return valid JSON.
 */
export function synthesizeBrainTagRun(bundle: TagBundle): ModelRun {
  const scan = scanSources(bundle.sources.map((s) => ({ id: s.id, role: s.role, text: s.text })));
  const rawTags: { key: string; evidence: { src: string; quote: string }[] }[] = [];

  for (const f of bundle.facts) {
    if (f.key && isMistakeKey(f.key) && f.key !== "other") {
      rawTags.push({
        key: f.key,
        evidence: [{ src: f.id, quote: f.text.slice(0, 180) }],
      });
    }
  }

  for (const ks of scan.scores) {
    if (ks.score < 1.5 || ks.key === "other") continue;
    const validHits = ks.hits.filter((h) => !h.negated && h.role !== "went-well" && h.quote.trim().length >= 4);
    if (validHits.length === 0) continue;
    const existing = rawTags.find((t) => t.key === ks.key);
    const evs = validHits.slice(0, 2).map((h) => ({ src: h.sourceId, quote: h.quote }));
    if (existing) {
      existing.evidence.push(...evs);
    } else {
      rawTags.push({ key: ks.key, evidence: evs });
    }
  }

  if (rawTags.length === 0) {
    const semanticPatterns: { key: MistakeKey; rx: RegExp }[] = [
      { key: "early", rx: /\b(before\s+\w+\s+closed|too\s+soon|jumped\s+the\s+gun|anticipated|no\s+confirmation|didn't\s+wait|did\s+not\s+wait)\b/i },
      { key: "chased", rx: /\b(already\s+moved|already\s+ran|late\s+entry|chasing|after\s+the\s+move|extended\s+candle)\b/i },
      { key: "stop", rx: /\b(moved\s+sl|widened\s+sl|pulled\s+stop|no\s+stop|removed\s+stop|dragged\s+stop)\b/i },
      { key: "exit", rx: /\b(closed\s+early|cut\s+winner|scared\s+of\s+pullback|took\s+profit\s+too\s+soon|held\s+loser)\b/i },
      { key: "size", rx: /\b(too\s+many\s+contracts|heavy\s+size|over\s*leveraged|doubled\s+up|added\s+to\s+loser)\b/i },
      { key: "revenge", rx: /\b(make\s+it\s+back|win\s+it\s+back|right\s+after\s+loss|tilted\s+after)\b/i },
      { key: "bias", rx: /\b(against\s+htf|counter\s+trend|fought\s+the\s+trend|wrong\s+bias)\b/i },
      { key: "timing", rx: /\b(lunch\s+hour|outside\s+killzone|chop\s+session|bad\s+time|late\s+session)\b/i },
    ];
    for (const src of bundle.sources) {
      if (src.role === "went-well") continue;
      for (const sp of semanticPatterns) {
        const m = src.text.match(sp.rx);
        if (m && m[0]) {
          rawTags.push({ key: sp.key, evidence: [{ src: src.id, quote: m[0] }] });
        }
      }
    }
  }

  return groundRun("edgebook-brain-v2", { tags: rawTags.slice(0, 3), unclear: rawTags.length === 0 ? "No clear process mistake quote found." : "" }, bundle);
}

export function summarizeTradeMistakeForFeed(
  entry: JournalEntry,
  _allEntries: JournalEntry[],
  plans: TradePlan[],
): {
  tone: "loss" | "gold" | "profit";
  badge: string;
  headline: string;
  subline: string;
} {
  const primary = mistakeOf(entry);
  const allTags = mistakeTagsOf(entry);
  const f = entry.review?.followUp;
  const refl = entry.reflection;
  const plan = plans.find((p) => p.id === entry.planId) ?? plans.find((p) => p.date === entry.date);

  const blunderLabels: Record<number, string> = { 1: "Slip", 2: "Costly Mistake", 3: "Blunder" };

  if (primary && !primary.pending) {
    const secondary = allTags
      .filter((t) => t.key !== primary.key)
      .slice(0, 2)
      .map((t) => t.label);
    const badge = (primary.level && blunderLabels[primary.level]) || (entry.pnl < 0 ? "Mistake" : "Process Slip");
    const headline = [
      primary.text && primary.key === "other" ? primary.text : primary.label,
      secondary.length > 0 ? `+ ${secondary.join(", ")}` : null,
    ]
      .filter(Boolean)
      .join(" · ");

    const rawNote =
      f?.mistakeNote?.trim() ||
      refl?.wentPoorly?.trim() ||
      refl?.cause?.trim() ||
      f?.biggestMistake?.trim() ||
      refl?.lesson?.trim() ||
      f?.audit?.reason?.trim() ||
      categoryOf(primary.key)?.hint ||
      "Review entry timing and rule confirmation before executing this setup.";

    return {
      tone: primary.level && primary.level >= 2 ? "loss" : entry.pnl < 0 ? "loss" : "gold",
      badge,
      headline,
      subline: rawNote,
    };
  }

  const unconfirmedPre = (entry.preTradeChecklist ?? []).filter((r) => !r.confirmed);
  const skippedPlanRules = (plan?.rules ?? []).filter((r) => r.state !== "ready");
  if (unconfirmedPre.length > 0 || skippedPlanRules.length > 0) {
    const count = unconfirmedPre.length || skippedPlanRules.length;
    const firstRule = unconfirmedPre[0]?.label || skippedPlanRules[0]?.label || "setup rule";
    const lessonText =
      f?.biggestMistake?.trim() ||
      refl?.lesson?.trim() ||
      entry.notes?.trim() ||
      `Entered with "${firstRule.replace(/^Rule \d+:\s*/i, "")}" unconfirmed — confirm all setup rules before entry.`;
    return {
      tone: entry.pnl < 0 ? "loss" : "gold",
      badge: "Rule Skipped",
      headline: `Skipped ${count} pre-trade ${count === 1 ? "rule" : "rules"} on ${entry.setup || entry.instrument}`,
      subline: lessonText,
    };
  }

  if (f?.mistake === "none" || entry.review?.outcome?.followedPlan === true) {
    const takeaway =
      f?.biggestMistake?.trim() ||
      refl?.lesson?.trim() ||
      refl?.wentWell?.trim() ||
      entry.notes?.trim() ||
      (entry.pnl < 0
        ? "Valid loss — followed plan and respected stop loss without emotional deviation."
        : "Clean A+ process — waited for setup confirmation and executed according to plan.");
    return {
      tone: "profit",
      badge: "No Mistake",
      headline: entry.pnl < 0 ? "Clean execution · Valid planned loss" : "Clean execution · Plan followed",
      subline: takeaway,
    };
  }

  const noteScan = scanSources([
    { id: "s1", role: "mistake-detail", text: entry.notes ?? "" },
    { id: "s2", role: "lesson", text: refl?.lesson ?? "" },
  ]);
  if (noteScan.scores.length > 0 && noteScan.scores[0]!.score >= 1.5) {
    const topKey = noteScan.scores[0]!.key;
    return {
      tone: entry.pnl < 0 ? "loss" : "gold",
      badge: "Spotted in Notes",
      headline: `${mistakeLabel(topKey)} · flagged from trade notes`,
      subline: entry.notes?.trim() || categoryOf(topKey)?.hint || "Complete the trade review to lock in this lesson.",
    };
  }

  if (entry.pnl < 0) {
    return {
      tone: "gold",
      badge: "Needs Autopsy",
      headline: `Unreviewed loss on ${entry.instrument}${entry.setup ? ` (${entry.setup})` : ""}`,
      subline: entry.notes?.trim() || "Tap Trade to complete a 30-second autopsy so the AI Brain can track what went wrong.",
    };
  }

  return {
    tone: "profit",
    badge: "Clean Trade",
    headline: `Disciplined execution on ${entry.setup || entry.instrument}`,
    subline: entry.notes?.trim() || refl?.lesson?.trim() || "No rule violations or risk breaches detected on this trade.",
  };
}
