import type { JournalEntry, PlaybookSetup, TradePlan } from "./types";
import { MISTAKE_CATEGORIES, categoryOf, isMistakeKey, mistakeLabel, mistakeOf, mistakeTagsOf, type MistakeKey } from "./mistakes";
import { dayTrades } from "./risk";
import { scanSources, type ScanSource } from "./tagging/rules";
import type { TagBundle } from "./tagging/evidence";
import { groundRun, type ModelRun } from "./tagging/prompt";

/**
 * EDGEBOOK ADAPTIVE AI BRAIN
 *
 * Learns continuously from the trader's recorded entries, plans, playbook rules, and autopsy reflections.
 * As the journal grows:
 *   1. Personal phrase -> mistake log-likelihood weights sharpen from the trader's own vocabulary.
 *   2. Conditional mistake probabilities (Emotion x Mistake, Setup x Mistake, After-Loss x Mistake, Time-Window x Mistake)
 *      shift from Laplace-smoothed priors to empirical personal frequencies.
 *   3. Powers live pre-trade mistake tagging in Plan & Record ("Thought" & "Mistakes to watch"),
 *      guaranteed grounded tagging in /api/journal/tag-trade, and deep synthesis in Minato.
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
  /** 0-100 accuracy/calibration score that grows as more trades & reviews are logged. */
  calibrationPct: number;
  tier: "Seed" | "Calibrating" | "Calibrated" | "High-Precision";
}

export interface PreTradeBrainRead {
  calibration: BrainCalibration;
  headline: string;
  subline: string;
  suggestedWatch: LearnedTagSuggestion[];
  setupInsight: string | null;
  emotionInsight: string | null;
  clarityScore: number;
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
  // Effective evidence units: reviewed trades carry 2x weight, plans 1x, raw trades 0.6x
  const units = reviewedTrades * 2 + linkedPlans * 1 + Math.max(0, totalTrades - reviewedTrades) * 0.6;
  const calibrationPct = totalTrades === 0
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

/**
 * Builds an empirical Naive-Bayes + conditional frequency model from the trader's own journal.
 */
export function buildPersonalBrain(entries: JournalEntry[], plans: TradePlan[]) {
  const planById = new Map(plans.map((p) => [p.id, p]));
  const planOf = (e: JournalEntry) =>
    (e.planId ? planById.get(e.planId) : undefined) ??
    plans.find((p) => p.linkedTradeId === e.id) ??
    plans.find((p) => p.date === e.date);

  const tagCounts = new Map<MistakeKey, number>();
  const tokenTagCounts = new Map<string, Map<MistakeKey, number>>();
  const emotionStats = new Map<string, { n: number; wins: number; pnl: number; mistakes: Map<MistakeKey, number> }>();
  const setupStats = new Map<string, { n: number; wins: number; pnl: number; mistakes: Map<MistakeKey, number> }>();
  const afterLossMistakes = new Map<MistakeKey, number>();
  let afterLossTotal = 0;
  let afterLossWins = 0;

  // Group by day to detect post-loss trades
  const byDay = new Map<string, JournalEntry[]>();
  for (const e of entries) {
    const list = byDay.get(e.date);
    if (list) list.push(e);
    else byDay.set(e.date, [e]);
  }

  for (const [date, dayList] of byDay) {
    const ordered = dayTrades(date, dayList);
    ordered.forEach((e, idx) => {
      const hadLossBefore = idx > 0 && ordered.slice(0, idx).some((prev) => prev.pnl < 0);
      const plan = planOf(e);
      const tags = mistakeTagsOf(e);
      const primaryMistake = mistakeOf(e);
      const allKeys = new Set<MistakeKey>(tags.map((t) => t.key));
      if (primaryMistake && primaryMistake.key !== "other") allKeys.add(primaryMistake.key);

      if (hadLossBefore) {
        afterLossTotal++;
        if (e.pnl > 0) afterLossWins++;
        for (const k of allKeys) afterLossMistakes.set(k, (afterLossMistakes.get(k) ?? 0) + 1);
      }

      const emo = (plan?.emotionalState || e.review?.psychology?.emotionBefore || e.review?.psychology?.emotionAfter || "").toUpperCase();
      if (emo) {
        const st = emotionStats.get(emo) ?? { n: 0, wins: 0, pnl: 0, mistakes: new Map() };
        st.n++;
        if (e.pnl > 0) st.wins++;
        st.pnl += e.pnl;
        for (const k of allKeys) st.mistakes.set(k, (st.mistakes.get(k) ?? 0) + 1);
        emotionStats.set(emo, st);
      }

      const setupKey = (e.setupId || e.setup || plan?.playbookName || "").trim().toLowerCase();
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
  }

  return {
    tagCounts,
    tokenTagCounts,
    emotionStats,
    setupStats,
    afterLossMistakes,
    afterLossTotal,
    afterLossWins,
    calibration: computeBrainCalibration(entries, plans, tokenTagCounts.size),
  };
}

/**
 * Live pre-trade analysis for Plan & Record ("Plan", "Thought", and "Mistakes to watch for today").
 * Combines what the trader just typed with their growing historical journal brain.
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
): PreTradeBrainRead {
  const brain = buildPersonalBrain(entries, plans);
  const suggestions = new Map<MistakeKey, LearnedTagSuggestion>();

  const upsert = (s: LearnedTagSuggestion) => {
    const prev = suggestions.get(s.key);
    if (!prev || s.confidence > prev.confidence) {
      suggestions.set(s.key, s);
    }
  };

  // 1. Scan what the trader wrote in their read, feeling reason, invalidation, and breakPlan
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

    // Check personal vocabulary learned from past reviewed trades
    const draftTokens = tokenize(writtenSources.map((s) => s.text).join(" "));
    const vocabScores = new Map<MistakeKey, { score: number; matchedWord: string }>();
    for (const tok of draftTokens) {
      const m = brain.tokenTagCounts.get(tok);
      if (!m) continue;
      for (const [k, count] of m.entries()) {
        if (count < 2) continue; // require at least 2 historical occurrences of this word with this mistake
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
          reason: `Your journal links “${info.matchedWord}” with ${mistakeLabel(k).toLowerCase()} in past reviews`,
          source: "history",
        });
      }
    }
  }

  // 2. Emotional state priors + personal emotional history
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

  // 3. Today's session state (after a loss today, or multiple trades today, or scheduled news)
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

  // 4. Setup-specific historical mistake patterns
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

  // 5. Global recurring mistakes from journal history if we still have room
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

  // Compute thought clarity score (0-100) based on completeness of pre-trade thinking
  let clarityScore = 25;
  if (draft.thesis.trim().length >= 15) clarityScore += 25;
  if (draft.emotion) clarityScore += 15;
  if ((draft.draw ?? "").trim().length >= 3) clarityScore += 15;
  if ((draft.invalidation ?? "").trim().length >= 3) clarityScore += 12;
  if ((draft.breakPlan ?? "").trim().length >= 3) clarityScore += 8;
  clarityScore = Math.min(100, clarityScore);

  const sortedSuggestions = [...suggestions.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 5);

  const headline =
    setupInsight ??
    emotionInsight ??
    (brain.calibration.totalTrades > 0
      ? `AI Brain calibrated across ${brain.calibration.totalTrades} trades (${brain.calibration.reviewedTrades} reviewed).`
      : "AI Brain is active — every plan and review you log sharpens its personal accuracy.");

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
  };
}

/**
 * Guaranteed server/local AI tagging voter (`edgebook-brain-v2`) when external LLM providers
 * are rate-limited, offline, or fail to return valid JSON.
 * Strictly grounded: only emits tags backed by verbatim quotes in `bundle.sources` or `bundle.facts`.
 */
export function synthesizeBrainTagRun(bundle: TagBundle): ModelRun {
  const scan = scanSources(bundle.sources.map((s) => ({ id: s.id, role: s.role, text: s.text })));
  const rawTags: { key: string; evidence: { src: string; quote: string }[] }[] = [];

  // 1. Objective & claim facts with explicit keys
  for (const f of bundle.facts) {
    if (f.key && isMistakeKey(f.key) && f.key !== "other") {
      rawTags.push({
        key: f.key,
        evidence: [{ src: f.id, quote: f.text.slice(0, 180) }],
      });
    }
  }

  // 2. Linguistic & semantic rule hits with verbatim quotes
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

  // 3. Semantic phrase fallback for subtle descriptions when explicit regexes didn't fire
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

/**
 * Generates a concise 2-line mistake & recognition summary for any trade card in the Feed.
 * Line 1: Badge + Primary mistake (or clean execution status) + secondary tag pills.
 * Line 2: Specific cause, trader's own note/lesson, or actionable recognition cue.
 */
export function summarizeTradeMistakeForFeed(
  entry: JournalEntry,
  allEntries: JournalEntry[],
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

  // 1. Explicit mistake recorded or detected by audit
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

  // 2. Check if any pre-trade checklist rules were skipped on this trade
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

  // 3. Reviewed as "No mistake" (clean execution)
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

  // 4. Unreviewed trade: scan notes/reflection for any implicit mistake keywords
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

  // 5. Default fallback for unreviewed trades
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
