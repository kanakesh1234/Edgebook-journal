/* ------------------------------------------------------------------ */
/*  Complete Account Data Archive (ZIP)                                */
/*                                                                      */
/*  Packages every single line of recorded data, every word written,    */
/*  every computed statistic, every backtest, lesson, AI memory,        */
/*  local draft, and every picture into a single downloadable .zip.     */
/* ------------------------------------------------------------------ */

import type {
  Challenge,
  JournalEntry,
  JournalSettings,
  NoTradeLog,
  TradePlan,
} from "./types";
import { checklistItems } from "./types";
import { computeStats, currentStreak } from "./stats";
import { challengeProgress, scopeToPrimary } from "./challenges";
import { disciplineSummary } from "./discipline";
import { holdTimeStats, formatHold } from "./holdtime";
import { mistakeIndex, mistakeTagsOf } from "./mistakes";
import { ruleStats } from "./rule-stats";
import { setupStats, tradesForSetup } from "./setup-stats";
import { timeWindowAnalytics } from "./time-patterns";
import { currencySymbol } from "./format";
import { generateTradesCsv } from "./backtesting/csv-export";
import type { PersistedSession } from "./backtesting/persistence";
import type { JournalPayload } from "./services/storage";
import { buildZipBlob, type ZipEntryInput } from "./zip";

/* ----------------------------- public types ----------------------------- */

export interface ExportProgress {
  stage: "preparing" | "images" | "extras" | "zipping" | "done";
  label: string;
  completed?: number;
  total?: number;
}

export interface ExportLessonRecord {
  id: string;
  title: string;
  subtitle?: string;
  html?: string;
  cover?: string | null;
  customCover?: string | null;
  excerpt?: string;
  hook?: string;
  readMins?: number;
  createdAt?: number;
  author?: { handle?: string; name?: string };
  bylines?: string[];
  mine?: boolean;
  likes?: number;
  likedByMe?: boolean;
  reposts?: number;
  repostedByMe?: boolean;
  savedByMe?: boolean;
  comments?: Array<{ id?: string; body: string; at?: number; by?: string }>;
}

export interface ExportImageAsset {
  id: string;
  zipPath: string;
  source: "trade" | "compare" | "plan" | "draft" | "avatar" | "lesson";
  refId?: string;
  originalName?: string;
  width?: number;
  height?: number;
  bytes?: Uint8Array;
  status: "included" | "unavailable";
}

export interface ExportAccountMeta {
  id?: string;
  name?: string;
  email?: string;
  fullName?: string;
  handle?: string;
  signInMethod?: "google" | "local";
  driveStatus?: string;
}

export interface FullExportInput {
  exportedAt?: number;
  account: ExportAccountMeta;
  payload: JournalPayload;
  images: ExportImageAsset[];
  lessons?: ExportLessonRecord[];
  backtestSessions?: PersistedSession[];
  friends?: unknown;
  localStorageData?: Record<string, unknown>;
}

export interface ExportManifest {
  format: "edgebook-full-export";
  version: 1;
  exportedAt: string;
  exportedAtMs: number;
  account: ExportAccountMeta;
  counts: {
    trades: number;
    plans: number;
    noTradeDays: number;
    challenges: number;
    playbookSetups: number;
    weeklyReviews: number;
    monthlyReviews: number;
    lessons: number;
    myLessons: number;
    backtestSessions: number;
    backtestTrades: number;
    picturesIncluded: number;
    picturesUnavailable: number;
    localStorageKeys: number;
    totalArchiveFiles: number;
  };
  files: string[];
}

export interface DownloadZipResult {
  filename: string;
  sizeBytes: number;
  manifest: ExportManifest;
}

/* ----------------------------- small helpers ----------------------------- */

function sanitizeFilename(raw: string, fallback = "file"): string {
  const cleaned = raw
    .trim()
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_.-]+|[_.-]+$/g, "");
  return cleaned.slice(0, 80) || fallback;
}

function escCsv(v: unknown): string {
  if (v == null) return "";
  const s = typeof v === "string" ? v : String(v);
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function fmtMoney(n: number, sym: string): string {
  const sign = n < 0 ? "-" : n > 0 ? "+" : "";
  return `${sign}${sym}${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtPct(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
}

function fmtDateMs(ms: number | undefined): string {
  if (!ms || !Number.isFinite(ms)) return "";
  return new Date(ms).toISOString();
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|h[1-6]|li|blockquote|pre|tr)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function decodeDataUrl(dataUrl: string): { bytes: Uint8Array; ext: string; mime: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/i.exec(dataUrl.trim());
  if (!m) return null;
  const mime = m[1]!.toLowerCase();
  const b64 = m[2]!;
  try {
    let bytes: Uint8Array;
    if (typeof atob === "function") {
      const bin = atob(b64);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } else {
      bytes = new Uint8Array(Buffer.from(b64, "base64"));
    }
    const ext =
      mime.includes("png") ? "png" :
      mime.includes("webp") ? "webp" :
      mime.includes("gif") ? "gif" :
      "jpg";
    return { bytes, ext, mime };
  } catch {
    return null;
  }
}

export function extractLessonMediaUrls(lessons: ExportLessonRecord[]): string[] {
  const urls = new Set<string>();
  const re = /\/api\/lessons\/media\?id=[a-z0-9]{6,40}\.[a-z0-9]{2,5}/gi;
  for (const l of lessons) {
    for (const candidate of [l.cover, l.customCover]) {
      if (candidate && candidate.includes("/api/lessons/media?id=")) {
        const hit = candidate.match(re);
        if (hit) hit.forEach((u) => urls.add(u));
      }
    }
    if (l.html) {
      const matches = l.html.match(re);
      if (matches) matches.forEach((u) => urls.add(u));
    }
  }
  return [...urls];
}

/* --------------------------- stats engine --------------------------- */

export function computeAllStats(
  entries: JournalEntry[],
  settings: JournalSettings,
  dayLogs: NoTradeLog[],
  plans: TradePlan[],
) {
  const overall = computeStats(entries, settings);
  const streak = currentStreak(overall.daily);
  const discipline = disciplineSummary(entries, dayLogs);
  const holdTime = holdTimeStats(entries);
  const timePatterns = timeWindowAnalytics(entries);
  const rules = ruleStats(plans, entries);
  const mistakes = mistakeIndex(entries).map((m) => ({
    key: m.key,
    label: m.label,
    count: m.count,
    cost: m.cost,
    tradeIds: [...m.ids],
  }));

  const primary = scopeToPrimary(settings, entries);
  const primaryStats = primary.challenge
    ? {
        challengeId: primary.challenge.id,
        challengeName: primary.challenge.name,
        stats: computeStats(primary.entries, primary.settings),
        progress: {
          ...challengeProgress(primary.challenge, entries),
          tradesList: undefined,
        },
      }
    : null;

  const challenges = (settings.challenges ?? []).map((c) => {
    const p = challengeProgress(c, entries);
    return {
      id: c.id,
      name: c.name,
      startingBalance: p.startingBalance,
      targetBalance: p.targetBalance,
      currentEquity: p.currentEquity,
      highestBalance: p.highestBalance,
      currentPnl: p.currentPnl,
      progressPct: p.progressPct,
      drawdownMode: p.drawdownMode,
      trailingBasis: p.trailingBasis,
      maxDrawdown: p.maxDrawdown,
      currentDrawdown: p.currentDrawdown,
      remainingDrawdown: p.remainingDrawdown,
      maxObservedDrawdown: p.maxObservedDrawdown,
      breached: p.breached,
      reachedTarget: p.reachedTarget,
      trades: p.trades,
      wins: p.wins,
      losses: p.losses,
      winRate: p.winRate,
      avgR: p.avgR,
      ruleAdherence: p.ruleAdherence,
    };
  });

  const setups = (settings.playbook ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    version: s.version,
    ...setupStats(tradesForSetup(s, entries)),
  }));

  // Per-instrument breakdown
  const byInstrument = new Map<string, JournalEntry[]>();
  for (const e of entries) {
    const sym = (e.instrument || "Unspecified").trim();
    const list = byInstrument.get(sym);
    if (list) list.push(e);
    else byInstrument.set(sym, [e]);
  }
  const instruments = [...byInstrument.entries()]
    .map(([instrument, list]) => {
      const wins = list.filter((e) => e.pnl > 0).length;
      const losses = list.filter((e) => e.pnl < 0).length;
      const decided = wins + losses;
      const rrs = list.filter((e) => e.rr != null && Number.isFinite(e.rr)).map((e) => e.rr!);
      return {
        instrument,
        trades: list.length,
        wins,
        losses,
        breakEven: list.length - decided,
        winRate: decided > 0 ? wins / decided : null,
        totalPnl: list.reduce((s, e) => s + e.pnl, 0),
        avgPnl: list.length > 0 ? list.reduce((s, e) => s + e.pnl, 0) / list.length : 0,
        avgR: rrs.length > 0 ? rrs.reduce((s, r) => s + r, 0) / rrs.length : null,
        bestTrade: Math.max(...list.map((e) => e.pnl)),
        worstTrade: Math.min(...list.map((e) => e.pnl)),
      };
    })
    .sort((a, b) => b.trades - a.trades || b.totalPnl - a.totalPnl);

  // Per-trade win/loss summary
  const tradeWins = entries.filter((e) => e.pnl > 0);
  const tradeLosses = entries.filter((e) => e.pnl < 0);
  const tradeBE = entries.filter((e) => e.pnl === 0);
  const grossProfit = tradeWins.reduce((s, e) => s + e.pnl, 0);
  const grossLoss = Math.abs(tradeLosses.reduce((s, e) => s + e.pnl, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? null : 0;

  return {
    tradeSummary: {
      totalTrades: entries.length,
      wins: tradeWins.length,
      losses: tradeLosses.length,
      breakEven: tradeBE.length,
      tradeWinRate: tradeWins.length + tradeLosses.length > 0 ? tradeWins.length / (tradeWins.length + tradeLosses.length) : null,
      grossProfit,
      grossLoss,
      netPnl: overall.totalPnl,
      profitFactor,
      avgWin: tradeWins.length > 0 ? grossProfit / tradeWins.length : null,
      avgLoss: tradeLosses.length > 0 ? -grossLoss / tradeLosses.length : null,
      bestTrade: entries.length > 0 ? Math.max(...entries.map((e) => e.pnl)) : null,
      worstTrade: entries.length > 0 ? Math.min(...entries.map((e) => e.pnl)) : null,
      currentDayStreak: streak,
    },
    overall,
    primaryChallenge: primaryStats,
    challenges,
    setups,
    instruments,
    discipline,
    holdTime,
    timePatterns,
    ruleStats: rules,
    mistakes,
  };
}

/* ----------------------- CSV & Markdown builders ----------------------- */

export function tradesToCsv(
  entries: JournalEntry[],
  plans: TradePlan[],
  challenges: Challenge[],
): string {
  const planMap = new Map(plans.map((p) => [p.id, p]));
  const challengeMap = new Map(challenges.map((c) => [c.id, c.name]));

  const headers = [
    "Trade ID",
    "Date",
    "Challenge",
    "Instrument",
    "Direction",
    "Setup",
    "P&L",
    "R:R",
    "Entry Time",
    "Exit Time",
    "Hold Duration",
    "Entry Price",
    "Exit Price",
    "Stop Loss",
    "Take Profit",
    "Quantity",
    "Review Status",
    "Mistake Tags",
    "Blunder Level",
    "Followed Setup",
    "Followed Risk",
    "Process Verdict",
    "Notes",
    "Reflection - Went Well",
    "Reflection - Went Poorly",
    "Reflection - Cause",
    "Reflection - Lesson",
    "Execution - Why Entered",
    "Psychology - Emotion Before",
    "Psychology - Emotion After",
    "Psychology - Notes",
    "Outcome - Notes",
    "FollowUp - Biggest Mistake",
    "FollowUp - Mistake Note",
    "FollowUp - Watch Next",
    "Compare Insight",
    "Linked Plan Thesis",
    "Pictures",
    "Created At",
    "Updated At",
  ];

  const ordered = [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  const rows = [headers.join(",")];

  for (const e of ordered) {
    const plan = e.planId ? planMap.get(e.planId) : undefined;
    const tags = mistakeTagsOf(e).map((t) => t.label).join("; ");
    const imgs = [
      ...e.images.map((i) => i.name || i.id),
      ...(e.compareImage ? [`compare:${e.compareImage.name || e.compareImage.id}`] : []),
    ].join("; ");

    rows.push(
      [
        e.id,
        e.date,
        e.challengeId ? (challengeMap.get(e.challengeId) ?? e.challengeId) : "",
        e.instrument,
        e.direction ?? "",
        e.setup,
        e.pnl,
        e.rr ?? "",
        e.entryTime ?? "",
        e.exitTime ?? "",
        e.holdDuration ?? "",
        e.entryPrice ?? "",
        e.exitPrice ?? "",
        e.stopLoss ?? "",
        e.takeProfit ?? "",
        e.quantity ?? "",
        e.reviewStatus ?? "",
        tags,
        e.review?.followUp?.blunderLevel ?? "",
        e.reflection?.followedSetup ?? "",
        e.reflection?.followedRisk ?? "",
        e.review?.outcome?.processVerdict ?? "",
        e.notes,
        e.reflection?.wentWell ?? "",
        e.reflection?.wentPoorly ?? "",
        e.reflection?.cause ?? "",
        e.reflection?.lesson ?? "",
        e.review?.execution?.whyEntered ?? "",
        e.review?.psychology?.emotionBefore ?? "",
        e.review?.psychology?.emotionAfter ?? "",
        e.review?.psychology?.notes ?? "",
        e.review?.outcome?.notes ?? "",
        e.review?.followUp?.biggestMistake ?? "",
        e.review?.followUp?.mistakeNote ?? "",
        e.review?.followUp?.watchNext ?? "",
        e.review?.compareInsight ?? "",
        plan?.thesis ?? "",
        imgs,
        fmtDateMs(e.createdAt),
        fmtDateMs(e.updatedAt),
      ]
        .map(escCsv)
        .join(","),
    );
  }

  return rows.join("\n");
}

export function tradesToMarkdown(
  entries: JournalEntry[],
  plans: TradePlan[],
  challenges: Challenge[],
  imagePathById: Map<string, string>,
  currency = "USD",
): string {
  const sym = currencySymbol(currency as Parameters<typeof currencySymbol>[0]);
  const planMap = new Map(plans.map((p) => [p.id, p]));
  const challengeMap = new Map(challenges.map((c) => [c.id, c.name]));
  const ordered = [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);

  const lines: string[] = [
    "# Complete Trade Journal Transcript",
    "",
    `Total recorded trades: ${ordered.length}`,
    "",
  ];

  for (let idx = 0; idx < ordered.length; idx++) {
    const e = ordered[idx]!;
    const ch = e.challengeId ? (challengeMap.get(e.challengeId) ?? e.challengeId) : null;
    lines.push(`## ${idx + 1}. ${e.date} — ${e.instrument || "Trade"} (${e.direction ?? "n/a"}) · ${fmtMoney(e.pnl, sym)}`);
    lines.push("");
    lines.push(`- **ID:** \`${e.id}\``);
    if (ch) lines.push(`- **Challenge:** ${ch}`);
    if (e.setup) lines.push(`- **Setup:** ${e.setup}`);
    if (e.rr != null) lines.push(`- **R:R:** ${e.rr}R`);
    if (e.entryTime || e.exitTime) lines.push(`- **Time (NY):** ${e.entryTime ?? "—"} → ${e.exitTime ?? "—"}${e.holdDuration ? ` (${e.holdDuration})` : ""}`);
    if (e.entryPrice != null || e.exitPrice != null) {
      lines.push(`- **Prices:** Entry ${e.entryPrice ?? "—"} | Exit ${e.exitPrice ?? "—"} | SL ${e.stopLoss ?? "—"} | TP ${e.takeProfit ?? "—"} | Qty ${e.quantity ?? "—"}`);
    }
    if (e.reviewStatus) lines.push(`- **Review Status:** ${e.reviewStatus}`);
    const tags = mistakeTagsOf(e);
    if (tags.length > 0) lines.push(`- **Mistake Tags:** ${tags.map((t) => t.label).join(", ")}`);
    lines.push(`- **Created:** ${fmtDateMs(e.createdAt)} | **Updated:** ${fmtDateMs(e.updatedAt)}`);

    if (e.notes?.trim()) {
      lines.push("", "### Notes", "", e.notes.trim());
    }

    if (e.preTradeChecklist && e.preTradeChecklist.length > 0) {
      lines.push("", "### Pre-Trade Checklist", "");
      for (const item of e.preTradeChecklist) {
        lines.push(`- [${item.confirmed ? "x" : " "}] ${item.label}${item.description ? ` — ${item.description}` : ""}`);
      }
    }

    if (e.checklist) {
      lines.push("", `### Execution Checklist (Trade #${e.checklist.tradeNumber})`, "");
      for (const item of checklistItems(e.checklist)) {
        const mark = item.item.answer === true ? "x" : item.item.answer === false ? "NO" : " ";
        lines.push(`- [${mark}] ${item.label}${item.item.note ? ` — ${item.item.note}` : ""}`);
      }
    }

    if (e.reflection) {
      const r = e.reflection;
      lines.push("", "### Reflection", "");
      if (r.followedSetup != null) lines.push(`- **Followed Setup:** ${r.followedSetup ? "Yes" : "No"}`);
      if (r.followedRisk != null) lines.push(`- **Followed Risk:** ${r.followedRisk ? "Yes" : "No"}`);
      if (r.wentWell?.trim()) lines.push(`- **Went Well:** ${r.wentWell.trim()}`);
      if (r.wentPoorly?.trim()) lines.push(`- **Went Poorly:** ${r.wentPoorly.trim()}`);
      if (r.cause?.trim()) lines.push(`- **Cause:** ${r.cause.trim()}`);
      if (r.lesson?.trim()) lines.push(`- **Lesson:** ${r.lesson.trim()}`);
    }

    if (e.review) {
      const rev = e.review;
      lines.push("", "### Trade Review", "");
      if (rev.plannedVsActual) {
        const pva = rev.plannedVsActual;
        if (pva.followedChecklist != null) lines.push(`- **Followed Checklist:** ${pva.followedChecklist ? "Yes" : "No"}`);
        if (pva.deviations?.trim()) lines.push(`- **Deviations:** ${pva.deviations.trim()}`);
        if (pva.notes?.trim()) lines.push(`- **Planned vs Actual Notes:** ${pva.notes.trim()}`);
      }
      if (rev.setup) {
        const s = rev.setup;
        if (s.liquiditySwept?.trim()) lines.push(`- **Liquidity Swept:** ${s.liquiditySwept.trim()}`);
        if (s.sweepTimestamp?.trim()) lines.push(`- **Sweep Timestamp:** ${s.sweepTimestamp.trim()}`);
        if (s.smtEvidence?.trim()) lines.push(`- **SMT Evidence:** ${s.smtEvidence.trim()}`);
        if (s.targetDescription?.trim()) lines.push(`- **Target:** ${s.targetDescription.trim()}`);
        if (s.manipulationIdentified?.trim()) lines.push(`- **Manipulation:** ${s.manipulationIdentified.trim()}`);
      }
      if (rev.execution) {
        const ex = rev.execution;
        if (ex.whyEntered?.trim()) lines.push(`- **Why Entered:** ${ex.whyEntered.trim()}`);
        if (ex.planned != null) lines.push(`- **Planned:** ${ex.planned ? "Yes" : "No"}`);
        if (ex.correctTime != null) lines.push(`- **Correct Time:** ${ex.correctTime ? "Yes" : "No"}`);
        if (ex.followedStop != null) lines.push(`- **Followed Stop:** ${ex.followedStop ? "Yes" : "No"}`);
        if (ex.movedStop != null) lines.push(`- **Moved Stop:** ${ex.movedStop ? "Yes" : "No"}${ex.movedStopReason ? ` (${ex.movedStopReason})` : ""}`);
        if (ex.exitedEarly != null) lines.push(`- **Exited Early:** ${ex.exitedEarly ? "Yes" : "No"}${ex.exitedEarlyReason ? ` (${ex.exitedEarlyReason})` : ""}`);
        if (ex.chased != null) lines.push(`- **Chased:** ${ex.chased ? "Yes" : "No"}`);
      }
      if (rev.psychology) {
        const p = rev.psychology;
        if (p.emotionBefore?.trim()) lines.push(`- **Emotion Before:** ${p.emotionBefore.trim()}`);
        if (p.emotionAfter?.trim()) lines.push(`- **Emotion After:** ${p.emotionAfter.trim()}`);
        if (p.convictionOrUrgency) lines.push(`- **Conviction/Urgency:** ${p.convictionOrUrgency}`);
        if (p.fomo != null) lines.push(`- **FOMO:** ${p.fomo ? "Yes" : "No"}`);
        if (p.revenge != null) lines.push(`- **Revenge:** ${p.revenge ? "Yes" : "No"}`);
        if (p.fearExit != null) lines.push(`- **Fear Exit:** ${p.fearExit ? "Yes" : "No"}`);
        if (p.makeItBack != null) lines.push(`- **Make It Back:** ${p.makeItBack ? "Yes" : "No"}`);
        if (p.notes?.trim()) lines.push(`- **Psychology Notes:** ${p.notes.trim()}`);
      }
      if (rev.outcome) {
        const o = rev.outcome;
        if (o.processVerdict) lines.push(`- **Process Verdict:** ${o.processVerdict}`);
        if (o.followedPlan != null) lines.push(`- **Followed Plan:** ${o.followedPlan ? "Yes" : "No"}`);
        if (o.goodTradeDespiteLoss != null) lines.push(`- **Good Trade Despite Loss:** ${o.goodTradeDespiteLoss ? "Yes" : "No"}`);
        if (o.badTradeDespiteWin != null) lines.push(`- **Bad Trade Despite Win:** ${o.badTradeDespiteWin ? "Yes" : "No"}`);
        if (o.notes?.trim()) lines.push(`- **Outcome Notes:** ${o.notes.trim()}`);
      }
      if (rev.followUp) {
        const f = rev.followUp;
        if (f.strongestEvidence?.trim()) lines.push(`- **Strongest Evidence:** ${f.strongestEvidence.trim()}`);
        if (f.biggestMistake?.trim()) lines.push(`- **Biggest Mistake:** ${f.biggestMistake.trim()}`);
        if (f.mistake?.trim()) lines.push(`- **Mistake Pick:** ${f.mistake}${f.mistakeOther ? ` (${f.mistakeOther})` : ""}`);
        if (f.mistakeNote?.trim()) lines.push(`- **Mistake Note:** ${f.mistakeNote.trim()}`);
        if (f.conceptApplied?.trim()) lines.push(`- **Concept Applied:** ${f.conceptApplied.trim()}`);
        if (f.conceptMisunderstood?.trim()) lines.push(`- **Concept Misunderstood:** ${f.conceptMisunderstood.trim()}`);
        if (f.watchNext?.trim()) lines.push(`- **Watch Next:** ${f.watchNext.trim()}`);
        if (f.audit) lines.push(`- **Data Audit:** ${f.audit.key} — ${f.audit.reason}`);
      }
      if (rev.concepts) {
        if (rev.concepts.used?.length) lines.push(`- **Concepts Used:** ${rev.concepts.used.join(", ")}`);
        if (rev.concepts.learned?.trim()) lines.push(`- **Learned:** ${rev.concepts.learned.trim()}`);
        if (rev.concepts.improve?.trim()) lines.push(`- **Improve:** ${rev.concepts.improve.trim()}`);
      }
      if (rev.compareInsight?.trim()) lines.push(`- **Compare Insight:** ${rev.compareInsight.trim()}`);
      if (rev.postLossGate) {
        const g = rev.postLossGate;
        lines.push(`- **Post-Loss Gate:** ${[g.emotionalState, g.immediateThoughts, g.intendedNextAction].filter(Boolean).join(" | ")}`);
      }
    }

    const plan = e.planId ? planMap.get(e.planId) : undefined;
    if (plan) {
      lines.push("", `### Linked Pre-Trade Plan (\`${plan.id}\`)`, "");
      if (plan.thesis?.trim()) lines.push(`- **Thesis:** ${plan.thesis.trim()}`);
      if (plan.emotionalState) lines.push(`- **Emotional State:** ${plan.emotionalState}${plan.emotionalNote ? ` — ${plan.emotionalNote}` : ""}`);
    }

    const picList = [...e.images, ...(e.compareImage ? [e.compareImage] : [])];
    if (picList.length > 0) {
      lines.push("", "### Pictures", "");
      for (const img of picList) {
        const zp = imagePathById.get(img.id);
        lines.push(`- ${img.name || img.id}: ${zp ? `\`${zp}\`` : "(unavailable at export time)"}`);
      }
    }

    lines.push("");
  }

  return lines.join("\n");
}

export function plansToMarkdown(plans: TradePlan[], challenges: Challenge[]): string {
  const challengeMap = new Map(challenges.map((c) => [c.id, c.name]));
  const ordered = [...plans].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt);
  const lines: string[] = ["# Pre-Trade Plans", "", `Total plans: ${ordered.length}`, ""];

  for (let i = 0; i < ordered.length; i++) {
    const p = ordered[i]!;
    lines.push(`## ${i + 1}. ${p.date} — ${p.instrument || "Plan"} (${p.status})`);
    lines.push("");
    lines.push(`- **ID:** \`${p.id}\``);
    if (p.challengeId) lines.push(`- **Challenge:** ${challengeMap.get(p.challengeId) ?? p.challengeId}`);
    if (p.playbookName) lines.push(`- **Playbook:** ${p.playbookName}${p.playbookVersion ? ` v${p.playbookVersion}` : ""}`);
    if (p.bias) lines.push(`- **Bias:** ${p.bias}`);
    if (p.emotionalState) lines.push(`- **Emotion:** ${p.emotionalState}${p.emotionalNote ? ` — ${p.emotionalNote}` : ""}`);
    if (p.maxLoss != null) lines.push(`- **Max Loss:** ${p.maxLoss}`);
    if (p.linkedTradeId) lines.push(`- **Linked Trade:** \`${p.linkedTradeId}\``);
    if (p.thesis?.trim()) lines.push("", "**Thesis:**", "", p.thesis.trim());
    if (p.preSessionProcess?.trim()) lines.push("", "**Pre-Session Process:**", "", p.preSessionProcess.trim());
    if (p.drawOnLiquidity?.trim()) lines.push(`- **Draw on Liquidity:** ${p.drawOnLiquidity.trim()}`);
    if (p.drawLevel?.trim()) lines.push(`- **Draw Level:** ${p.drawLevel.trim()}`);
    if (p.liquidityObservations?.trim()) lines.push(`- **Liquidity Observations:** ${p.liquidityObservations.trim()}`);
    if (p.importantLevels?.trim()) lines.push(`- **Important Levels:** ${p.importantLevels.trim()}`);
    if (p.mustHappenBeforeEntry?.trim()) lines.push(`- **Must Happen Before Entry:** ${p.mustHappenBeforeEntry.trim()}`);
    if (p.invalidation?.trim()) lines.push(`- **Invalidation:** ${p.invalidation.trim()}`);
    if (p.expectedSetup?.trim()) lines.push(`- **Expected Setup:** ${p.expectedSetup.trim()}`);
    if (p.expectedTarget?.trim()) lines.push(`- **Expected Target:** ${p.expectedTarget.trim()}`);
    if (p.whatCouldBreakPlan?.trim()) lines.push(`- **What Could Break Plan:** ${p.whatCouldBreakPlan.trim()}`);
    if (p.watchMistakes?.length) lines.push(`- **Watch Mistakes:** ${p.watchMistakes.join(", ")}`);
    if (p.newsEvents?.length) {
      lines.push(`- **News Events:** ${p.newsEvents.map((n) => `${n.name}${n.time ? ` (${n.time})` : ""}`).join(", ")}`);
    }
    if (p.rules?.length) {
      lines.push("", "**Plan Rules:**", "");
      for (const r of p.rules) {
        lines.push(`- [${r.state}] ${r.label}${r.note ? ` — ${r.note}` : ""}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function reviewsToMarkdown(settings: JournalSettings): string {
  const lines: string[] = ["# Weekly & Monthly Reviews", ""];
  const weekly = settings.reviews?.weekly ?? {};
  const monthly = settings.reviews?.monthly ?? {};
  const practiceWeekly = settings.weeklyReviews ?? {};

  const weeklyKeys = Object.keys(weekly).sort();
  if (weeklyKeys.length > 0) {
    lines.push("## Weekly Reviews", "");
    for (const wk of weeklyKeys) {
      const r = weekly[wk]!;
      lines.push(`### Week of ${wk}`, "");
      for (const [k, v] of Object.entries(r.text ?? {})) {
        if (v?.trim()) lines.push(`- **${k}:** ${v.trim()}`);
      }
      for (const [k, list] of Object.entries(r.lists ?? {})) {
        if (list?.length) {
          lines.push(`- **${k}:**`);
          list.forEach((item, idx) => {
            const checked = r.done?.[`${k}:${idx}`] ? "x" : " ";
            lines.push(`  - [${checked}] ${item}`);
          });
        }
      }
      for (const [day, mark] of Object.entries(r.dayMarks ?? {})) {
        lines.push(`- **Day ${day}:** Grade ${mark.grade ?? "—"}${mark.skippedValid ? " · Skipped valid" : ""}${mark.biasLock ? " · Bias lock" : ""}`);
      }
      lines.push("");
    }
  }

  const monthlyKeys = Object.keys(monthly).sort();
  if (monthlyKeys.length > 0) {
    lines.push("## Monthly Reviews", "");
    for (const mo of monthlyKeys) {
      const r = monthly[mo]!;
      lines.push(`### Month ${mo}`, "");
      for (const [k, v] of Object.entries(r.text ?? {})) {
        if (v?.trim()) lines.push(`- **${k}:** ${v.trim()}`);
      }
      for (const [k, list] of Object.entries(r.lists ?? {})) {
        if (list?.length) {
          lines.push(`- **${k}:**`);
          list.forEach((item, idx) => {
            const checked = r.done?.[`${k}:${idx}`] ? "x" : " ";
            lines.push(`  - [${checked}] ${item}`);
          });
        }
      }
      for (const [mk, plan] of Object.entries(r.mistakePlans ?? {})) {
        if (plan?.trim()) lines.push(`- **Mistake Plan (${mk}):** ${plan.trim()}`);
      }
      lines.push("");
    }
  }

  const pKeys = Object.keys(practiceWeekly).sort();
  if (pKeys.length > 0) {
    lines.push("## Practice Weekly Check-Ins", "");
    for (const wk of pKeys) {
      const r = practiceWeekly[wk]!;
      lines.push(`### Week of ${wk}`, "");
      if (r.wentWell?.trim()) lines.push(`- **Went Well:** ${r.wentWell.trim()}`);
      if (r.focus?.trim()) lines.push(`- **Focus:** ${r.focus.trim()}`);
      lines.push("");
    }
  }

  if (weeklyKeys.length === 0 && monthlyKeys.length === 0 && pKeys.length === 0) {
    lines.push("No weekly or monthly reviews recorded yet.");
  }

  return lines.join("\n");
}

export function noTradeDaysToCsv(dayLogs: NoTradeLog[]): string {
  const ordered = [...dayLogs].sort((a, b) => a.date.localeCompare(b.date));
  const rows = ["Date,Reason,Created At"];
  for (const d of ordered) {
    rows.push([d.date, d.reason ?? "", fmtDateMs(d.createdAt)].map(escCsv).join(","));
  }
  return rows.join("\n");
}

export function dailyEquityToCsv(stats: ReturnType<typeof computeStats>): string {
  const rows = ["Date,Trades,Day PnL,Cumulative Equity"];
  const byDate = new Map(stats.daily.map((d) => [d.date, d]));
  for (const pt of stats.equityCurve) {
    const day = byDate.get(pt.date);
    rows.push([pt.date, day?.trades ?? 0, pt.pnl, pt.equity].map(escCsv).join(","));
  }
  return rows.join("\n");
}

export function statsToMarkdown(
  allStats: ReturnType<typeof computeAllStats>,
  settings: JournalSettings,
): string {
  const sym = currencySymbol(settings.currency);
  const { tradeSummary: ts, overall: ov, discipline: disc, holdTime: ht } = allStats;
  const lines: string[] = [
    "# Edgebook Statistics Summary",
    "",
    "## Overall Performance",
    "",
    `- **Total Trades:** ${ts.totalTrades} (${ts.wins} wins / ${ts.losses} losses / ${ts.breakEven} break-even)`,
    `- **Trade Win Rate:** ${fmtPct(ts.tradeWinRate)}`,
    `- **Trading Days:** ${ov.tradingDays} (${ov.winningDays} green / ${ov.losingDays} red / ${ov.breakEvenDays} flat — Day Win Rate ${fmtPct(ov.winRate)})`,
    `- **Net P&L:** ${fmtMoney(ov.totalPnl, sym)}`,
    `- **Gross Profit / Gross Loss:** ${fmtMoney(ts.grossProfit, sym)} / -${sym}${ts.grossLoss.toFixed(2)}`,
    `- **Profit Factor:** ${ts.profitFactor != null ? ts.profitFactor.toFixed(2) : "∞"}`,
    `- **Average Win / Average Loss:** ${ts.avgWin != null ? fmtMoney(ts.avgWin, sym) : "—"} / ${ts.avgLoss != null ? fmtMoney(ts.avgLoss, sym) : "—"}`,
    `- **Average R:R:** ${ov.avgRR != null ? `${ov.avgRR.toFixed(2)}R` : "—"} (${fmtPct(ov.rrCoverage)} coverage)`,
    `- **Current Equity:** ${sym}${ov.currentEquity.toFixed(2)} (Peak: ${sym}${ov.peakEquity.toFixed(2)}, Drawdown: ${sym}${ov.drawdown.toFixed(2)})`,
    `- **Best Day:** ${ov.bestDay ? `${ov.bestDay.date} (${fmtMoney(ov.bestDay.pnl, sym)})` : "—"}`,
    `- **Worst Day:** ${ov.worstDay ? `${ov.worstDay.date} (${fmtMoney(ov.worstDay.pnl, sym)})` : "—"}`,
    `- **Current Day Streak:** ${ts.currentDayStreak}`,
    "",
    "## Discipline",
    "",
    `- **Total Discipline XP:** ${disc.xpTotal} (Last 30d: ${disc.xpLast30})`,
    `- **Discipline Streak:** ${disc.disciplineStreak} weekdays`,
    `- **Completion Rate:** ${fmtPct(disc.completionRate)} (${disc.tradedDays} traded, ${disc.noTradeDays} no-trade, ${disc.missedDays} missed)`,
    "",
    "## Hold Times",
    "",
    `- **Sample Size:** ${ht.sampleSize} trades`,
    `- **Average Hold:** ${formatHold(ht.avgHoldMin)}`,
    `- **Average Win Hold / Median:** ${formatHold(ht.avgWinMin)} / ${formatHold(ht.medianWinMin)}`,
    `- **Average Loss Hold / Median:** ${formatHold(ht.avgLossMin)} / ${formatHold(ht.medianLossMin)}`,
  ];

  if (allStats.challenges.length > 0) {
    lines.push("", "## Challenges", "");
    for (const c of allStats.challenges) {
      lines.push(
        `- **${c.name}:** ${c.trades} trades | Net ${fmtMoney(c.currentPnl, sym)} | Equity ${sym}${c.currentEquity.toFixed(2)} / ${sym}${c.targetBalance.toFixed(2)} (${c.progressPct}%) | Win Rate ${fmtPct(c.winRate)} | Max Observed DD ${sym}${c.maxObservedDrawdown.toFixed(2)}`,
      );
    }
  }

  if (allStats.setups.length > 0) {
    lines.push("", "## Playbook Setups", "");
    for (const s of allStats.setups) {
      lines.push(
        `- **${s.name} (v${s.version}):** ${s.trades} trades | Net ${fmtMoney(s.totalPnl, sym)} | Win Rate ${fmtPct(s.winRate)} | Avg R ${s.avgR != null ? `${s.avgR.toFixed(2)}R` : "—"}`,
      );
    }
  }

  if (allStats.instruments.length > 0) {
    lines.push("", "## Instruments", "");
    for (const inst of allStats.instruments) {
      lines.push(
        `- **${inst.instrument}:** ${inst.trades} trades | Net ${fmtMoney(inst.totalPnl, sym)} | Win Rate ${fmtPct(inst.winRate)} | Avg R ${inst.avgR != null ? `${inst.avgR.toFixed(2)}R` : "—"}`,
      );
    }
  }

  if (allStats.mistakes.length > 0) {
    lines.push("", "## Mistakes", "");
    for (const m of allStats.mistakes) {
      lines.push(`- **${m.label}:** ${m.count} trades | Cost -${sym}${m.cost.toFixed(2)}`);
    }
  }

  if (allStats.ruleStats.length > 0) {
    lines.push("", "## Playbook Rule Adherence", "");
    for (const r of allStats.ruleStats) {
      lines.push(
        `- **${r.text}** (${r.setup || "Setup"}): Skipped ${r.skipped}/${r.planned} (${fmtPct(r.skipRate)}) | Confirmed WR ${fmtPct(r.confirmedWinRate)} vs Skipped WR ${fmtPct(r.skippedWinRate)}`,
      );
    }
  }

  if (allStats.timePatterns.windows.length > 0) {
    lines.push("", "## Time-of-Day Windows (NY)", "");
    for (const w of allStats.timePatterns.windows) {
      lines.push(
        `- **${w.label}:** ${w.trades} trades | Win Rate ${w.winRate != null ? `${w.winRate}%` : "—"} | Total P&L ${fmtMoney(w.totalPnl, sym)} | Avg R ${w.avgR != null ? `${w.avgR}R` : "—"}`,
      );
    }
  }

  return lines.join("\n");
}

export function lessonsToMarkdown(lessons: ExportLessonRecord[]): string {
  const lines: string[] = ["# Lessons", "", `Total lessons exported: ${lessons.length}`, ""];
  for (let i = 0; i < lessons.length; i++) {
    const l = lessons[i]!;
    lines.push(`## ${i + 1}. ${l.title}${l.mine ? " (Yours)" : ""}`);
    if (l.subtitle?.trim()) lines.push(`*${l.subtitle.trim()}*`);
    lines.push("");
    if (l.author?.name || l.author?.handle) {
      lines.push(`- **Author:** ${l.author.name ?? ""}${l.author.handle ? ` (@${l.author.handle})` : ""}`);
    }
    if (l.createdAt) lines.push(`- **Created:** ${fmtDateMs(l.createdAt)}`);
    if (l.bylines?.length) lines.push(`- **Bylines:** ${l.bylines.join(", ")}`);
    lines.push(`- **Likes:** ${l.likes ?? 0} | **Reposts:** ${l.reposts ?? 0} | **Saved:** ${l.savedByMe ? "Yes" : "No"}`);
    if (l.html) {
      lines.push("", stripHtml(l.html));
    }
    if (l.comments && l.comments.length > 0) {
      lines.push("", "### Comments", "");
      for (const c of l.comments) {
        lines.push(`- **${c.by ?? "Trader"}** (${fmtDateMs(c.at)}): ${c.body}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

/* --------------------- pure archive file builder --------------------- */

export function buildFullExportFiles(input: FullExportInput): {
  files: ZipEntryInput[];
  manifest: ExportManifest;
} {
  const exportedAtMs = input.exportedAt ?? Date.now();
  const exportedAtIso = new Date(exportedAtMs).toISOString();
  const entries = input.payload.entries ?? [];
  const settings = input.payload.settings;
  const dayLogs = input.payload.dayLogs ?? [];
  const plans = input.payload.plans ?? [];
  const challenges = settings.challenges ?? [];
  const lessons = input.lessons ?? [];
  const backtests = input.backtestSessions ?? [];
  const localStorageData = input.localStorageData ?? {};

  const files: ZipEntryInput[] = [];
  const addText = (path: string, content: string) => {
    files.push({ path, data: content, mtime: exportedAtMs });
  };
  const addJson = (path: string, value: unknown) => {
    addText(path, JSON.stringify(value, null, 2));
  };

  // Map image IDs to their ZIP path for cross-referencing inside JSON/Markdown
  const imagePathById = new Map<string, string>();
  for (const img of input.images) {
    if (img.status === "included" && img.bytes) {
      imagePathById.set(img.id, img.zipPath);
      files.push({ path: img.zipPath, data: img.bytes, mtime: exportedAtMs, compress: false });
    }
  }

  // 1. Direct re-importable backup + account profile
  addJson("backup/edgebook-backup.json", {
    ...input.payload,
    exportedAt: exportedAtMs,
  });
  addJson("backup/account-profile.json", input.account);

  // 2. Journal — every trade, plan, no-trade log, review, setup, challenge & rule
  const enrichedTrades = entries.map((e) => ({
    ...e,
    exportedPictures: [
      ...e.images.map((img) => ({ ...img, zipPath: imagePathById.get(img.id) ?? null })),
      ...(e.compareImage
        ? [{ ...e.compareImage, isCompare: true, zipPath: imagePathById.get(e.compareImage.id) ?? null }]
        : []),
    ],
  }));
  addJson("journal/trades.json", enrichedTrades);
  addText("journal/trades.csv", tradesToCsv(entries, plans, challenges));
  addText("journal/trades-full-transcript.md", tradesToMarkdown(entries, plans, challenges, imagePathById, settings.currency));

  addJson("journal/plans.json", plans);
  addText("journal/plans.md", plansToMarkdown(plans, challenges));

  addJson("journal/no-trade-days.json", dayLogs);
  addText("journal/no-trade-days.csv", noTradeDaysToCsv(dayLogs));

  addJson("journal/reviews.json", {
    reviews: settings.reviews ?? { weekly: {}, monthly: {} },
    weeklyReviews: settings.weeklyReviews ?? {},
  });
  addText("journal/reviews.md", reviewsToMarkdown(settings));

  addJson("journal/playbook-setups.json", settings.playbook ?? []);
  addJson("journal/challenges.json", challenges);
  addJson("journal/rules.json", {
    rules: settings.rules ?? null,
    dayLimits: settings.dayLimits ?? {},
  });

  // 3. Complete computed statistics
  const allStats = computeAllStats(entries, settings, dayLogs, plans);
  addJson("stats/summary.json", allStats);
  addText("stats/daily-equity.csv", dailyEquityToCsv(allStats.overall));
  addText("stats/stats-summary.md", statsToMarkdown(allStats, settings));

  // 4. Pictures index
  addJson(
    "pictures/index.json",
    input.images.map((img) => ({
      id: img.id,
      zipPath: img.status === "included" ? img.zipPath : null,
      source: img.source,
      refId: img.refId ?? null,
      originalName: img.originalName ?? null,
      width: img.width ?? null,
      height: img.height ?? null,
      sizeBytes: img.bytes?.byteLength ?? null,
      status: img.status,
    })),
  );

  // 5. Lessons
  if (lessons.length > 0) {
    addJson("lessons/lessons.json", lessons);
    addText("lessons/lessons-readable.md", lessonsToMarkdown(lessons));
  } else {
    addJson("lessons/lessons.json", []);
  }

  // 6. Backtesting sessions
  addJson("backtesting/sessions.json", backtests);
  let totalBacktestTrades = 0;
  for (const s of backtests) {
    totalBacktestTrades += s.trades?.length ?? 0;
    const safeName = sanitizeFilename(`${s.config.sessionName || "session"}_${s.id}`, s.id);
    if (s.trades && s.trades.length > 0) {
      addText(`backtesting/sessions/${safeName}-trades.csv`, generateTradesCsv(s.trades, s.config));
    }
  }

  // 7. MINATO AI Brain, Practice & Matrix progression
  addJson("minato-and-practice/ai-brain.json", settings.aiBrain ?? null);
  addJson("minato-and-practice/practice-progress.json", settings.practiceProgress ?? null);
  addJson("minato-and-practice/matrix-progress.json", settings.matrixProgress ?? null);

  // 8. Browser local data & friends
  addJson("device-local-data/local-storage.json", localStorageData);
  if (input.friends !== undefined) {
    addJson("device-local-data/friends.json", input.friends);
  }

  // 9. Manifest & README (added last so file list is exact)
  const picturesIncluded = input.images.filter((i) => i.status === "included").length;
  const picturesUnavailable = input.images.filter((i) => i.status !== "included").length;
  const weeklyReviewsCount =
    Object.keys(settings.reviews?.weekly ?? {}).length + Object.keys(settings.weeklyReviews ?? {}).length;
  const monthlyReviewsCount = Object.keys(settings.reviews?.monthly ?? {}).length;

  const filePaths = ["README.txt", "manifest.json", ...files.map((f) => f.path)];
  const manifest: ExportManifest = {
    format: "edgebook-full-export",
    version: 1,
    exportedAt: exportedAtIso,
    exportedAtMs,
    account: input.account,
    counts: {
      trades: entries.length,
      plans: plans.length,
      noTradeDays: dayLogs.length,
      challenges: challenges.length,
      playbookSetups: (settings.playbook ?? []).length,
      weeklyReviews: weeklyReviewsCount,
      monthlyReviews: monthlyReviewsCount,
      lessons: lessons.length,
      myLessons: lessons.filter((l) => l.mine).length,
      backtestSessions: backtests.length,
      backtestTrades: totalBacktestTrades,
      picturesIncluded,
      picturesUnavailable,
      localStorageKeys: Object.keys(localStorageData).length,
      totalArchiveFiles: filePaths.length,
    },
    files: filePaths,
  };

  const readme = [
    "EDGEBOOK — COMPLETE DATA EXPORT",
    "================================",
    "",
    `Exported At: ${exportedAtIso}`,
    `Account:     ${input.account.fullName || input.account.name || "Trader"}${input.account.email ? ` <${input.account.email}>` : ""}`,
    input.account.handle ? `Handle:      @${input.account.handle}` : null,
    "",
    "CONTENTS SUMMARY",
    "----------------",
    `- Trades:              ${manifest.counts.trades}`,
    `- Pre-Trade Plans:     ${manifest.counts.plans}`,
    `- No-Trade Days:       ${manifest.counts.noTradeDays}`,
    `- Challenges:          ${manifest.counts.challenges}`,
    `- Playbook Setups:     ${manifest.counts.playbookSetups}`,
    `- Weekly Reviews:      ${manifest.counts.weeklyReviews}`,
    `- Monthly Reviews:     ${manifest.counts.monthlyReviews}`,
    `- Lessons:             ${manifest.counts.lessons} (${manifest.counts.myLessons} authored by you)`,
    `- Backtest Sessions:   ${manifest.counts.backtestSessions} (${manifest.counts.backtestTrades} simulated trades)`,
    `- Pictures Included:   ${manifest.counts.picturesIncluded}${manifest.counts.picturesUnavailable > 0 ? ` (${manifest.counts.picturesUnavailable} unavailable at export time)` : ""}`,
    `- Local Browser Keys:  ${manifest.counts.localStorageKeys}`,
    "",
    "FOLDER GUIDE",
    "------------",
    "- backup/              Re-importable Edgebook JSON backup + account profile",
    "- journal/             Trades (JSON, CSV, full word-for-word Markdown), plans, no-trade logs, reviews, setups, challenges, rules",
    "- stats/               Full computed analytics (JSON, daily equity CSV, readable summary)",
    "- pictures/            All trade screenshots, compare charts, profile photo, draft images & lesson media + index.json",
    "- lessons/             Full lessons JSON & readable Markdown",
    "- backtesting/         All backtesting sessions JSON & per-session trade CSVs",
    "- minato-and-practice/ MINATO AI Brain memory, Practice progress & Matrix progress",
    "- device-local-data/   Browser localStorage records (chat threads, drafts, prefs) & friends list",
    "",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");

  const finalFiles: ZipEntryInput[] = [
    { path: "README.txt", data: readme, mtime: exportedAtMs },
    { path: "manifest.json", data: JSON.stringify(manifest, null, 2), mtime: exportedAtMs },
    ...files,
  ];

  return { files: finalFiles, manifest };
}

/* --------------------- browser download orchestrator --------------------- */

async function runPool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      await worker(items[i]!);
    }
  });
  await Promise.all(runners);
}

function collectBrowserLocalStorage(): Record<string, unknown> {
  if (typeof window === "undefined") return {};
  const out: Record<string, unknown> = {};
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      // Skip large redundant Drive mirror copy (already in backup/edgebook-backup.json)
      if (key.startsWith("edgebook:drive-journal:")) continue;
      const raw = window.localStorage.getItem(key);
      if (raw == null) continue;
      try {
        out[key] = JSON.parse(raw);
      } catch {
        out[key] = raw;
      }
    }
  } catch {
    /* private mode / blocked */
  }
  return out;
}

/**
 * Collects EVERY piece of user data across Zustand, IndexedDB, Google Drive,
 * Backtesting, Lessons, Media, and localStorage, packages it into a single .zip,
 * and triggers an immediate download in the browser.
 */
export async function downloadFullDataZip(
  onProgress?: (progress: ExportProgress) => void,
): Promise<DownloadZipResult> {
  const { useApp } = await import("./store");
  const { useUi } = await import("./ui-store");
  const { dataStore, getLocalDraftImage, loadAddTradeDraftCache, loadPlanDraftCache } = await import("./services/storage");
  const { listBacktestSessions, syncBacktestsWithCloud } = await import("./backtesting/persistence");

  onProgress?.({ stage: "preparing", label: "Collecting journal, stats & settings…" });

  const state = useApp.getState();
  const driveStatus = useUi.getState().driveStatus;
  const payload = state.exportPayload();
  const user = state.user;
  const isGoogle = !!user?.id.startsWith("g_");

  const account: ExportAccountMeta = {
    id: user?.id,
    name: user?.name,
    email: user?.email,
    fullName: payload.settings.fullName,
    handle: payload.settings.handle,
    signInMethod: isGoogle ? "google" : "local",
    driveStatus: isGoogle ? driveStatus : "local",
  };

  // 1. Gather every picture to fetch
  interface ImageTask {
    id: string;
    zipPath: string;
    source: ExportImageAsset["source"];
    refId?: string;
    originalName?: string;
    width?: number;
    height?: number;
    fetchBytes: () => Promise<Uint8Array | null>;
  }

  const tasks: ImageTask[] = [];
  const seenImageIds = new Set<string>();
  const images: ExportImageAsset[] = [];

  // 1a. Profile photo (data URL inside settings.avatar)
  const avatarDataUrl = (payload.settings as { avatar?: string }).avatar;
  if (avatarDataUrl) {
    const decoded = decodeDataUrl(avatarDataUrl);
    if (decoded) {
      images.push({
        id: "profile-avatar",
        zipPath: `pictures/profile-avatar.${decoded.ext}`,
        source: "avatar",
        originalName: `profile-avatar.${decoded.ext}`,
        bytes: decoded.bytes,
        status: "included",
      });
    }
  }

  // 1b. Every trade screenshot & compare image
  for (const entry of payload.entries) {
    entry.images.forEach((img, idx) => {
      if (seenImageIds.has(img.id)) return;
      seenImageIds.add(img.id);
      const safeOrig = sanitizeFilename(img.name || `${img.id}.jpg`, `${img.id}.jpg`);
      const ext = safeOrig.includes(".") ? "" : ".jpg";
      tasks.push({
        id: img.id,
        zipPath: `pictures/trades/${entry.date}_${sanitizeFilename(entry.id, "trade")}_${idx + 1}_${safeOrig}${ext}`,
        source: "trade",
        refId: entry.id,
        originalName: img.name,
        width: img.width,
        height: img.height,
        fetchBytes: async () => {
          const blob = await dataStore.getImage(img.id).catch(() => undefined);
          return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
        },
      });
    });

    if (entry.compareImage && !seenImageIds.has(entry.compareImage.id)) {
      const cmp = entry.compareImage;
      seenImageIds.add(cmp.id);
      const safeOrig = sanitizeFilename(cmp.name || `${cmp.id}.jpg`, `${cmp.id}.jpg`);
      const ext = safeOrig.includes(".") ? "" : ".jpg";
      tasks.push({
        id: cmp.id,
        zipPath: `pictures/trades/${entry.date}_${sanitizeFilename(entry.id, "trade")}_compare_${safeOrig}${ext}`,
        source: "compare",
        refId: entry.id,
        originalName: cmp.name,
        width: cmp.width,
        height: cmp.height,
        fetchBytes: async () => {
          const blob = await dataStore.getImage(cmp.id).catch(() => undefined);
          return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
        },
      });
    }
  }

  // 1c. Pre-trade plan screenshots (if not already in trades)
  for (const plan of payload.plans ?? []) {
    for (const imgId of plan.preTradeScreenshotIds ?? []) {
      if (seenImageIds.has(imgId)) continue;
      seenImageIds.add(imgId);
      tasks.push({
        id: imgId,
        zipPath: `pictures/plans/${plan.date}_${sanitizeFilename(plan.id, "plan")}_${sanitizeFilename(imgId, "img")}.jpg`,
        source: "plan",
        refId: plan.id,
        fetchBytes: async () => {
          const blob = await dataStore.getImage(imgId).catch(() => undefined);
          return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
        },
      });
    }
  }

  // 1d. Unsaved local draft images (plan draft + add-trade draft)
  const addDraft = loadAddTradeDraftCache();
  const todayStr = new Date().toISOString().slice(0, 10);
  const planDraft = loadPlanDraftCache(todayStr);
  const draftImgs = [...(addDraft?.images ?? []), ...(planDraft?.images ?? [])];
  for (const img of draftImgs) {
    if (seenImageIds.has(img.id)) continue;
    seenImageIds.add(img.id);
    const safeOrig = sanitizeFilename(img.name || `${img.id}.jpg`, `${img.id}.jpg`);
    tasks.push({
      id: img.id,
      zipPath: `pictures/drafts/${sanitizeFilename(img.id, "draft")}_${safeOrig}`,
      source: "draft",
      originalName: img.name,
      width: img.width,
      height: img.height,
      fetchBytes: async () => {
        const blob =
          (await getLocalDraftImage(img.id).catch(() => undefined)) ??
          (await dataStore.getImage(img.id).catch(() => undefined));
        return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
      },
    });
  }

  // 2. Fetch lessons, backtesting sessions & friends in parallel
  onProgress?.({ stage: "extras", label: "Loading lessons, backtests & friends…" });
  const [lessonsRes, backtestsRes, friendsRes] = await Promise.all([
    fetch("/api/lessons", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ lessons?: ExportLessonRecord[] }>) : null))
      .then((d) => d?.lessons ?? [])
      .catch(() => [] as ExportLessonRecord[]),
    (async () => {
      try {
        await syncBacktestsWithCloud().catch(() => false);
        return await listBacktestSessions();
      } catch {
        return [] as PersistedSession[];
      }
    })(),
    fetch("/api/friends", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : undefined))
      .catch(() => undefined),
  ]);

  // 2b. Queue lesson media/pictures
  const lessonMediaUrls = extractLessonMediaUrls(lessonsRes);
  for (const url of lessonMediaUrls) {
    const idMatch = /id=([a-z0-9]{6,40}\.[a-z0-9]{2,5})/i.exec(url);
    const fileId = idMatch?.[1];
    if (!fileId || seenImageIds.has(`lesson:${fileId}`)) continue;
    seenImageIds.add(`lesson:${fileId}`);
    tasks.push({
      id: `lesson:${fileId}`,
      zipPath: `pictures/lessons/${fileId}`,
      source: "lesson",
      originalName: fileId,
      fetchBytes: async () => {
        const r = await fetch(url, { cache: "force-cache" }).catch(() => null);
        if (!r || !r.ok) return null;
        return new Uint8Array(await r.arrayBuffer());
      },
    });
  }

  // 3. Download all queued pictures with bounded concurrency & live progress
  if (tasks.length > 0) {
    let completed = 0;
    onProgress?.({
      stage: "images",
      label: `Collecting pictures (0/${tasks.length})…`,
      completed: 0,
      total: tasks.length,
    });
    await runPool(tasks, 4, async (task) => {
      const bytes = await task.fetchBytes().catch(() => null);
      images.push({
        id: task.id,
        zipPath: task.zipPath,
        source: task.source,
        refId: task.refId,
        originalName: task.originalName,
        width: task.width,
        height: task.height,
        bytes: bytes ?? undefined,
        status: bytes ? "included" : "unavailable",
      });
      completed++;
      onProgress?.({
        stage: "images",
        label: `Collecting pictures (${completed}/${tasks.length})…`,
        completed,
        total: tasks.length,
      });
    });
  }

  // 4. Collect localStorage & assemble ZIP
  onProgress?.({ stage: "zipping", label: "Building ZIP archive…" });
  const localStorageData = collectBrowserLocalStorage();
  const { files, manifest } = buildFullExportFiles({
    account,
    payload,
    images,
    lessons: lessonsRes,
    backtestSessions: backtestsRes,
    friends: friendsRes,
    localStorageData,
  });

  const blob = await buildZipBlob(files);
  const dateTag = new Date(manifest.exportedAtMs).toISOString().slice(0, 10);
  const filename = `edgebook-full-export-${dateTag}.zip`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5_000);

  onProgress?.({ stage: "done", label: "Archive downloaded" });
  return { filename, sizeBytes: blob.size, manifest };
}
