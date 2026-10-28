"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useApp, type EntryDraft } from "@/lib/store";
import { useUi } from "@/lib/ui-store";
import { PLAN_EMOTIONS, setupRules, type JournalEntry, type PlanRuleState, type TradeDirection, type TradePlan } from "@/lib/types";
import { currencySymbol, formatDateMedium, todayKey, weekdayLong } from "@/lib/format";
import { dayLimitFor } from "@/lib/risk";
import { Modal } from "@/components/ui/modal";
import { ShieldIcon } from "@/components/ui/icons";
import { cn, uid } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { ImageUploader, type UploadItem } from "./image-uploader";
import { AutopsyBody, useAutopsy } from "./autopsy";
import { RiskMeter } from "./risk-meter";
import { WinOddsCard } from "./win-odds-card";
import type { PlanDraft } from "@/lib/prediction";
import { analyzePreTradeThought } from "@/lib/ai-brain";
import { ruleStats, statFor } from "@/lib/rule-stats";
import { MISTAKE_CATEGORIES } from "@/lib/mistakes";
import { recurringMistakes, thisWeekStart } from "@/lib/weekly";
import {
  BinaryChoice, CheckRow, Collapse, Stepper, ChoiceCard, Chip, Disclosure, FLOW_EXPAND, FLOW_SMOOTH, Hint, IconCheck, Label, PrimaryButton, QuietButton, Segmented,
  Reveal, SheetFrame, Stagger, StepTitle, StepTransition, TextBlock, TextBox, useIsDesktop, type Rail,
  GlyphArrowIn, GlyphArrowOut, GlyphStop, GlyphTarget, GlyphTimer, IconTile,
} from "./flow-ui";

/**
 * PLAN & RECORD — one calm, continuous ritual.
 *
 *   plan → thought → setup (+ its rules) → trade → chart → autopsy → done
 *
 * "setup" is skipped when the trader has no playbook. Validation is shown as quiet inline
 * state, and Continue stays disabled until the step's rules are satisfied.
 */
type StepId = "plan" | "thought" | "setup" | "trade" | "chart" | "autopsy" | "done";
type NewsEvent = { id: string; name: string; time: string };
type ImportRow = { date: string; pnl: number; rr: number | null; instrument: string; direction: TradeDirection | null; setup: string; notes: string; entryTime: string | null };
type ConvictionLevel = "crystal" | "solid" | "cautious";

const RAIL_LABEL: Record<StepId, string> = {
  plan: "Plan",
  thought: "Thought",
  setup: "Setup",
  trade: "Log trade",
  chart: "Chart",
  autopsy: "Review",
  done: "Done",
};

const PRIMARY_EMOTIONS = PLAN_EMOTIONS.slice(0, 6);
const MORE_EMOTIONS = PLAN_EMOTIONS.slice(6);
const DRAW_PRESETS = ["PDH / PDL", "Session High / Low", "Equal Highs / Lows", "HTF FVG / OB", "Weekly Open"] as const;
const INVAL_PRESETS = ["5m close beyond sweep", "HTF structure break", "SMT fails to hold", "No displacement by 10:15"] as const;
const BREAK_PRESETS = ["Entering before 5m close", "Chasing an extended candle", "Moving stop to avoid loss", "Trading right after a loss"] as const;

const label = (e: string) => e.charAt(0) + e.slice(1).toLowerCase();
const IconPlus = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
);
const IconMinus = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M6 12h12" /></svg>
);
const IconSpark = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m11 3.5 1.7 5 5 1.7-5 1.7L11 17l-1.7-5.1-5-1.7 5-1.7zM19 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
  </svg>
);

const cleanNumber = (v: string) => v.replace(/[^\d.\-−]/g, "").replace("−", "-");
/** Used whenever the trader leaves the instrument blank. */
const DEFAULT_INSTRUMENT = "MNQ";
/** Prices: digits and one decimal point (up to 5 places, so forex quotes fit too). Commas from a paste are dropped. */
const cleanPrice = (v: string) => { const t = v.replace(/[^\d.]/g, ""); const [a = "", ...rest] = t.split("."); return rest.length ? `${a}.${rest.join("").slice(0, 5)}` : a; };
const parsePrice = (v: string): number | null => { const t = v.trim(); if (t === "") return null; const n = Number(t); return Number.isFinite(n) ? n : null; };
/** 12.5 → "12.5", 12 → "12", 12.3333 → "12.33" */
const fmtPts = (n: number) => String(Math.round(n * 100) / 100);
const minutesBetween = (a: string, b: string): number | null => {
  const m = (t: string) => { const x = /^(\d{2}):(\d{2})/.exec(t); return x ? Number(x[1]) * 60 + Number(x[2]) : null; };
  const s1 = m(a), s2 = m(b);
  return s1 === null || s2 === null || s2 < s1 ? null : s2 - s1;
};
const fmtHeld = (min: number) => (min < 60 ? `${min} min` : `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}m` : ""}`);

/**
 * Apple HIG unhurried progressive reveal hook:
 * Waits until the user has typed at least `minChars` characters AND paused typing for `delayMs`
 * before latching `true` so the next question never jarringly pops in on the very first keystroke.
 */
function useSettledReveal(text: string, alreadyAnsweredDownstream: boolean, open: boolean, minChars = 3, delayMs = 700): { settled: boolean; typing: boolean } {
  const [latched, setLatched] = useState(false);
  useEffect(() => {
    if (!open) setLatched(false);
  }, [open]);

  const trimmed = text.trim();
  useEffect(() => {
    if (alreadyAnsweredDownstream) {
      setLatched(true);
      return;
    }
    if (trimmed.length < minChars) return;
    const timer = window.setTimeout(() => setLatched(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [trimmed, alreadyAnsweredDownstream, minChars, delayMs]);

  return {
    settled: latched || alreadyAnsweredDownstream,
    typing: !latched && !alreadyAnsweredDownstream && trimmed.length > 0,
  };
}

export function PlanTradeFlow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const entries = useApp((s) => s.entries);
  const plans = useApp((s) => s.plans);
  const settings = useApp((s) => s.settings);
  // The daily loss limit is set once, on Home. The flow only reads it.
  const dayLimit = dayLimitFor(todayKey(), plans, settings.dayLimits);
  const playbook = settings.playbook ?? [];
  const challenges = settings.challenges ?? [];
  const sym = currencySymbol(settings.currency);

  const desktop = useIsDesktop();
  const [step, setStep] = useState<StepId>("plan");
  const [dir, setDir] = useState<1 | -1>(1);

  // Discipline gate: planning a 2nd (or later) trade after a loss stops at the plan until it is acknowledged.
  const today = todayKey();
  const lossesToday = useMemo(() => entries.filter((e) => e.date === today && e.pnl < 0).length, [entries, today]);
  const tradesToday = useMemo(() => entries.filter((e) => e.date === today).length, [entries, today]);
  const [lockChecked, setLockChecked] = useState(false);
  const [lockAck, setLockAck] = useState(false);
  const lockOpen = open && step === "plan" && lossesToday >= 1 && !lockAck;
  const thirdTrade = lossesToday >= 2;

  // plan & thought state
  const [thesis, setThesis] = useState("");
  const [emotion, setEmotion] = useState<(typeof PLAN_EMOTIONS)[number] | "">("");
  const [moreEmotions, setMoreEmotions] = useState(false);
  const [emotionReason, setEmotionReason] = useState("");
  const [newsAnswer, setNewsAnswer] = useState<boolean | null>(null);
  const [newsEvents, setNewsEvents] = useState<NewsEvent[]>([]);
  const [watch, setWatch] = useState<string[]>([]);
  const [autoWatchApplied, setAutoWatchApplied] = useState(false);
  const [instrument, setInstrument] = useState("");
  const [draw, setDraw] = useState("");
  const [invalidation, setInvalidation] = useState("");
  const [breakPlan, setBreakPlan] = useState("");
  const [conviction, setConviction] = useState<ConvictionLevel>("solid");
  const [thoughtNote, setThoughtNote] = useState("");

  // setup + rules
  const [playbookId, setPlaybookId] = useState("");
  const [ruleStates, setRuleStates] = useState<Record<string, PlanRuleState>>({});

  // trade
  const [mode, setMode] = useState<"manual" | "import">("manual");
  const [pnl, setPnl] = useState("");
  const [direction, setDirection] = useState<TradeDirection | null>(null);
  const [tradeDate, setTradeDate] = useState(todayKey());
  const [rr, setRr] = useState("");
  const [entryTime, setEntryTime] = useState("");
  const [exitTime, setExitTime] = useState("");
  const [entryPrice, setEntryPrice] = useState("");
  const [exitPrice, setExitPrice] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [levelsOpen, setLevelsOpen] = useState(false);
  const [quantity, setQuantity] = useState("1");
  const [pnlDone, setPnlDone] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[] | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  // after the trade exists
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [images, setImages] = useState<UploadItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // The autopsy session starts once the trade exists and lasts until the flow closes, so Back / Continue never lose answers.
  const autopsy = useAutopsy(createdId, open && createdId !== null);
  const planIdRef = useRef<string | null>(null);

  const selectedPlaybook = playbook.find((p) => p.id === playbookId);
  const rules = useMemo(() => setupRules(selectedPlaybook), [selectedPlaybook]);
  const confirmedRules = rules.filter((_, i) => ruleStates[String(i)] === "ready").length;
  const skippedRules = rules.length - confirmedRules;
  const history = useMemo(() => ruleStats(plans, entries), [plans, entries]);

  const finalInstrument = instrument.trim().toUpperCase() || DEFAULT_INSTRUMENT;

  /** Everything the trader has planned so far, in the shape the outlook & AI Brain read. */
  const draftPlan: PlanDraft = useMemo(() => ({
    date: todayKey(),
    setupId: playbookId || undefined,
    setupName: selectedPlaybook?.name,
    emotion: emotion || undefined,
    emotionReason: emotionReason.trim() || undefined,
    thesis,
    draw: draw.trim() || undefined,
    invalidation: invalidation.trim() || undefined,
    breakPlan: breakPlan.trim() || undefined,
    news: newsAnswer ? newsEvents.filter((e) => e.name.trim()).map((e) => e.name.trim()) : [],
    maxLoss: dayLimit ?? undefined,
    watch: watch.map((k) => MISTAKE_CATEGORIES.find((c) => c.key === k)?.label ?? k),
    confirmedRules: rules.filter((_, i) => ruleStates[String(i)] === "ready").map((r) => r.text || ""),
    skippedRules: rules.filter((_, i) => ruleStates[String(i)] !== "ready").map((r) => r.text || ""),
    ruleTotal: rules.length,
  }), [playbookId, selectedPlaybook, emotion, emotionReason, thesis, draw, invalidation, breakPlan, newsAnswer, newsEvents, dayLimit, watch, rules, ruleStates]);

  /** Live Adaptive AI Brain synthesis — learns from every trade, plan, and review in the journal. */
  const brainRead = useMemo(
    () =>
      analyzePreTradeThought(
        {
          date: today,
          thesis,
          emotion: emotion || undefined,
          emotionReason,
          newsEvents: newsAnswer ? newsEvents.filter((e) => e.name.trim()) : [],
          instrument: finalInstrument,
          draw,
          invalidation,
          breakPlan: [breakPlan, thoughtNote].filter(Boolean).join(". "),
          playbookId: playbookId || undefined,
          playbookName: selectedPlaybook?.name,
        },
        entries,
        plans,
        playbook,
      ),
    [today, thesis, emotion, emotionReason, newsAnswer, newsEvents, finalInstrument, draw, invalidation, breakPlan, thoughtNote, playbookId, selectedPlaybook?.name, entries, plans, playbook],
  );

  // Auto-seed top AI-suggested mistake tags once when entering the "thought" step if the trader hasn't manually picked any yet
  useEffect(() => {
    if (step === "thought" && !autoWatchApplied && watch.length === 0 && brainRead.suggestedWatch.length > 0) {
      const topKeys = brainRead.suggestedWatch.filter((s) => s.confidence >= 0.72).slice(0, 2).map((s) => s.key);
      if (topKeys.length > 0) {
        setWatch(topKeys);
        setAutoWatchApplied(true);
      }
    }
  }, [step, autoWatchApplied, watch.length, brainRead.suggestedWatch]);

  const order: StepId[] = useMemo(
    () => (playbook.length ? ["plan", "thought", "setup", "trade", "chart", "autopsy", "done"] : ["plan", "thought", "trade", "chart", "autopsy", "done"]),
    [playbook.length],
  );
  const go = (to: StepId) => {
    setDir(order.indexOf(to) >= order.indexOf(step) ? 1 : -1);
    setSaveError(null);
    setStep(to);
  };
  const prev = (s: StepId): StepId | null => { const i = order.indexOf(s); return i > 0 ? order[i - 1]! : null; };
  const next = (s: StepId): StepId => order[Math.min(order.length - 1, order.indexOf(s) + 1)]!;

  // Optional suggestions for the Instrument field: MNQ first, then recently used ones.
  const suggestedInstruments = useMemo(() => {
    const seen: string[] = [DEFAULT_INSTRUMENT];
    for (const e of [...entries].sort((a, b) => b.createdAt - a.createdAt)) {
      const i = e.instrument?.trim().toUpperCase();
      if (i && i !== "—" && !seen.includes(i)) seen.push(i);
      if (seen.length === 4) break;
    }
    return seen;
  }, [entries]);

  // Smooth, delayed question reveal in "Plan": waits for a natural 700ms typing pause (after >= 3 chars)
  // so the next question never jarringly pops in on the very first keystroke.
  const thesisReveal = useSettledReveal(thesis, emotion !== "", open, 3, 700);
  const reasonReveal = useSettledReveal(emotionReason, newsAnswer !== null, open, 3, 700);

  const showFeeling = thesisReveal.settled;
  const showReason = emotion !== "" || emotionReason.trim().length > 0;
  const showNews = reasonReveal.settled;
  const showDetail = newsAnswer !== null;

  const chooseNews = (v: boolean) => {
    setNewsAnswer(v);
    if (v && newsEvents.length === 0) setNewsEvents([{ id: uid("ev"), name: "", time: "" }]);
  };
  const patchEvent = (id: string, patch: Partial<NewsEvent>) => setNewsEvents((l) => l.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  // Fresh start every time the flow opens.
  useEffect(() => {
    if (!open) return;
    setStep("plan"); setDir(1); setLockAck(false); setLockChecked(false);
    setThesis(""); setEmotion(""); setMoreEmotions(false); setEmotionReason(""); setNewsAnswer(null); setNewsEvents([]); setInstrument(""); setDraw("");
    setWatch([]); setAutoWatchApplied(false); setInvalidation(""); setBreakPlan(""); setConviction("solid"); setThoughtNote("");
    const only = useApp.getState().settings.playbook ?? [];
    setPlaybookId(only.length === 1 ? only[0]!.id : ""); setRuleStates({});
    setMode("manual"); setPnl(""); setDirection(null); setTradeDate(todayKey()); setRr(""); setEntryTime("09:30"); setExitTime("09:30"); setQuantity("1"); setPnlDone(false);
    setEntryPrice(""); setExitPrice(""); setStopLoss(""); setTakeProfit(""); setLevelsOpen(false);
    setImportRows(null); setImportError(null);
    setCreatedId(null); setImages([]); setSaving(false); setSaveError(null); planIdRef.current = null;
  }, [open]);

  // Mistakes worth watching today: AI Brain suggestions first, then recurring weekly mistakes, then the rest of the taxonomy.
  const aiSuggestedMap = useMemo(() => new Map(brainRead.suggestedWatch.map((s) => [s.key as string, s])), [brainRead.suggestedWatch]);
  const watchOptions = useMemo(() => {
    const rec = new Map(recurringMistakes(entries, thisWeekStart()).map((r) => [r.key as string, r.weeks]));
    return MISTAKE_CATEGORIES.filter((c) => c.key !== "other")
      .map((c) => ({
        ...c,
        weeks: rec.get(c.key) ?? 0,
        ai: aiSuggestedMap.get(c.key) ?? null,
      }))
      .sort((a, b) => (b.ai?.confidence ?? 0) - (a.ai?.confidence ?? 0) || b.weeks - a.weeks);
  }, [entries, aiSuggestedMap]);

  const applyAiSuggestedTags = () => {
    haptic.selection();
    const aiKeys = brainRead.suggestedWatch.map((s) => s.key);
    setWatch((prev) => [...new Set([...prev, ...aiKeys])]);
    setAutoWatchApplied(true);
  };

  /* ---------------- gating + quiet hints per step ---------------- */
  const pnlText = pnl.trim();
  const pnlValue = pnlText === "" ? NaN : Number(pnlText);
  const pnlInvalid = pnlText !== "" && !Number.isFinite(pnlValue);
  const manualReady = Number.isFinite(pnlValue);
  const quantityValue = quantity.trim() === "" ? NaN : Number(quantity);
  const quantityOk = Number.isFinite(quantityValue) && quantityValue > 0;
  const entryN = parsePrice(entryPrice), exitN = parsePrice(exitPrice), stopN = parsePrice(stopLoss), targetN = parsePrice(takeProfit);
  const isLong = direction === "long";
  const levelNote = (() => {
    if (!direction || entryN === null) return null;
    if (stopN !== null && (isLong ? stopN >= entryN : stopN <= entryN)) return `For a ${direction}, the stop sits ${isLong ? "below" : "above"} your entry.`;
    if (targetN !== null && (isLong ? targetN <= entryN : targetN >= entryN)) return `For a ${direction}, the target sits ${isLong ? "above" : "below"} your entry.`;
    return null;
  })();
  const riskPts = entryN !== null && stopN !== null ? Math.abs(entryN - stopN) : null;
  const rewardPts = entryN !== null && targetN !== null ? Math.abs(targetN - entryN) : null;
  const movePts = direction && entryN !== null && exitN !== null ? (isLong ? exitN - entryN : entryN - exitN) : null;
  const realizedR = movePts !== null && riskPts !== null && riskPts > 0 ? movePts / riskPts : null;
  const heldMin = minutesBetween(entryTime, exitTime);
  const levelStats = [
    riskPts !== null ? { k: "Risk", v: `${fmtPts(riskPts)} pts` } : null,
    rewardPts !== null ? { k: "Reward", v: `${fmtPts(rewardPts)} pts` } : null,
    riskPts !== null && riskPts > 0 && rewardPts !== null ? { k: "R : R", v: `1 : ${(rewardPts / riskPts).toFixed(1)}` } : null,
    realizedR !== null ? { k: "Realized", v: `${realizedR > 0 ? "+" : realizedR < 0 ? "−" : ""}${Math.abs(realizedR).toFixed(2)}R`, tone: realizedR > 0 ? "profit" as const : realizedR < 0 ? "loss" as const : undefined } : null,
  ].filter((x): x is { k: string; v: string; tone?: "profit" | "loss" } => x !== null);
  const manualR = rr.trim() !== "" && Number.isFinite(Number(rr)) ? Number(rr) : null;
  const stepQuantity = (delta: number) => setQuantity((prev) => { const n = Number(prev); const base = Number.isFinite(n) ? n : 0; return String(Math.max(1, Math.round((base + delta) * 100) / 100)); });
  useEffect(() => { if (manualReady) setPnlDone(true); }, [manualReady]);
  useEffect(() => { if (entryPrice || exitPrice || stopLoss || takeProfit) setLevelsOpen(true); }, [entryPrice, exitPrice, stopLoss, takeProfit]);

  const gate: { ok: boolean; hint: string | null } = (() => {
    switch (step) {
      case "plan":
        if (!thesis.trim()) return { ok: false, hint: "Write your plan to continue" };
        if (!emotion) return { ok: false, hint: "Pick how you feel" };
        if (!emotionReason.trim()) return { ok: false, hint: "Say what's behind that feeling" };
        if (newsAnswer === null) return { ok: false, hint: "Any news or events today?" };
        if (newsAnswer && !newsEvents.some((e) => e.name.trim())) return { ok: false, hint: "Name the event, or choose No news" };
        return { ok: true, hint: "Continue to Thought" };
      case "thought":
        return {
          ok: true,
          hint: watch.length > 0
            ? `Watching ${watch.length} mistake ${watch.length === 1 ? "trap" : "traps"} · Clarity ${brainRead.clarityScore}%`
            : `Clarity ${brainRead.clarityScore}% · Ready for setup`,
        };
      case "setup":
        if (!playbookId) return { ok: false, hint: "Choose a setup" };
        return { ok: true, hint: skippedRules > 0 ? `${skippedRules} rule${skippedRules === 1 ? "" : "s"} unchecked — fine, it will be recorded` : null };
      case "trade":
        if (mode === "import") return importRows?.length ? { ok: true, hint: null } : { ok: false, hint: "Choose a file to import" };
        if (!pnlText) return { ok: false, hint: "Enter the net P&L" };
        if (pnlInvalid) return { ok: false, hint: "Numbers only — negative for a loss" };
        if (!direction) return { ok: false, hint: "Choose long or short" };
        if (!quantityOk) return { ok: false, hint: "Enter the quantity" };
        return { ok: true, hint: null };
      case "chart":
        return images.length ? { ok: true, hint: null } : { ok: false, hint: "Add a chart, or skip for now" };
      case "autopsy":
        return autopsy.ready ? { ok: true, hint: null } : { ok: false, hint: autopsy.hint };
      default:
        return { ok: true, hint: null };
    }
  })();

  /* ---------------- persistence ---------------- */
  const buildPlan = (): TradePlan => ({
    id: (planIdRef.current ??= uid(`pl-${Date.now().toString(36)}`)),
    date: todayKey(),
    challengeId: useApp.getState().settings.primaryChallengeId ?? challenges[0]?.id ?? undefined,
    playbookId: playbookId || undefined,
    playbookName: selectedPlaybook?.name,
    playbookVersion: selectedPlaybook?.version,
    instrument: finalInstrument || undefined,
    bias: "either",
    preSessionProcess: [
      `Conviction: ${conviction}`,
      thoughtNote.trim() ? thoughtNote.trim() : null,
    ].filter(Boolean).join(" · ") || undefined,
    thesis: thesis.trim(),
    drawOnLiquidity: draw.trim() || undefined,
    invalidation: invalidation.trim() || undefined,
    expectedSetup: selectedPlaybook?.name,
    emotionalState: emotion || undefined,
    emotionalNote: emotionReason.trim() || undefined,
    whatCouldBreakPlan: breakPlan.trim() || undefined,
    watchMistakes: watch.length ? watch : undefined,
    maxLoss: dayLimit ?? undefined,
    newsEvents: newsAnswer ? newsEvents.filter((e) => e.name.trim()).map((e) => ({ name: e.name.trim(), time: e.time || undefined })) : [],
    rules: rules.map((r, i) => ({ label: r.text ? `Rule ${i + 1}: ${r.text}` : `Rule ${i + 1}`, state: ruleStates[String(i)] === "ready" ? "ready" : "skipped", note: r.description })),
    status: "executed",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  const challengeId = () => useApp.getState().settings.primaryChallengeId ?? challenges[0]?.id ?? undefined;

  const saveTrade = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const plan = buildPlan();
      void useApp.getState().savePlan(plan).catch(() => undefined);
      if (mode === "manual") {
        const live = createdId ? useApp.getState().entries.find((e) => e.id === createdId) : undefined;
        const draft: EntryDraft = {
          date: tradeDate <= todayKey() ? tradeDate : todayKey(),
          pnl: Math.round(pnlValue * 100) / 100,
          rr: manualR ?? (realizedR !== null ? Math.round(realizedR * 100) / 100 : null),
          instrument: finalInstrument,
          direction,
          setup: selectedPlaybook?.name ?? "",
          setupId: playbookId || undefined,
          notes: live?.notes || thoughtNote.trim() || "",
          images: live?.images ?? [],
          compareImage: live?.compareImage,
          challengeId: challengeId(),
          planId: plan.id,
          entryTime: entryTime.trim() || undefined,
          exitTime: exitTime.trim() || undefined,
          entryPrice: entryN,
          exitPrice: exitN,
          stopLoss: stopN,
          takeProfit: targetN,
          quantity: quantityValue,
        };
        if (live) {
          void useApp.getState().updateEntry(live.id, draft).catch(() => setSaveError("Couldn't save — try again."));
        } else {
          const before = new Set(useApp.getState().entries.map((e) => e.id));
          const pending = useApp.getState().createEntry(draft);
          const fresh = useApp.getState().entries.find((e) => !before.has(e.id));
          if (fresh) {
            setCreatedId(fresh.id);
            void pending.catch(() => setSaveError("Couldn't save — try again."));
          } else {
            setCreatedId((await pending).id);
          }
        }
      } else if (importRows?.length) {
        const created = await useApp.getState().createEntries(importRows.map((row, i) => ({
          date: row.date, pnl: row.pnl, rr: row.rr, instrument: row.instrument?.trim() && row.instrument.trim() !== "—" ? row.instrument : DEFAULT_INSTRUMENT, direction: row.direction,
          setup: row.setup || selectedPlaybook?.name || "",
          setupId: row.setup ? undefined : playbookId || undefined,
          notes: row.notes, entryTime: row.entryTime ?? undefined,
          images: [] as JournalEntry["images"],
          challengeId: challengeId(),
          planId: i === 0 ? plan.id : undefined,
          reviewStatus: "not_reviewed" as const,
        })));
        setCreatedId(created[0]?.id ?? null);
      }
      go("chart");
    } catch {
      setSaveError("Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  };

  const loadImportFile = async (file: File) => {
    setImportError(null);
    try {
      const text = await file.text();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const { parseTradesCsv } = await import("@/lib/csv-import");
      const result = parseTradesCsv(text);
      if (result.error) { setImportError(result.error); setImportRows(null); return; }
      if (result.rows.length === 0) { setImportError("No valid rows found in that file."); return; }
      setImportRows(result.rows.map((r) => ({ date: r.date, pnl: r.pnl, rr: r.rr, instrument: r.instrument, direction: r.direction, setup: r.setup, notes: r.notes, entryTime: r.entryTime })));
    } catch {
      setImportError("Couldn't read that file — try re-exporting it.");
    }
  };

  const saveCharts = async () => {
    const live = createdId ? useApp.getState().entries.find((e) => e.id === createdId) : undefined;
    if (!live) { go("autopsy"); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const blobs = new Map<string, Blob>();
      for (const item of images) if (item.blob) blobs.set(item.meta.id, item.blob);
      await useApp.getState().updateEntryFast(live.id, {
        date: live.date, pnl: live.pnl, rr: live.rr, instrument: live.instrument, direction: live.direction,
        setup: live.setup, setupId: live.setupId, notes: live.notes, images: images.map((i) => i.meta),
        compareImage: live.compareImage, challengeId: live.challengeId, tradeNumber: live.tradeNumber ?? null,
        entryTime: live.entryTime, exitTime: live.exitTime, entryPrice: live.entryPrice, exitPrice: live.exitPrice,
        stopLoss: live.stopLoss, takeProfit: live.takeProfit, quantity: live.quantity,
      }, blobs);
      go("autopsy");
    } catch {
      setSaveError("Couldn't save the chart — try again.");
    } finally {
      setSaving(false);
    }
  };

  const completeAutopsy = async () => { if (await autopsy.submit()) go("done"); };

  const onContinue = () => {
    if (!gate.ok || saving) return;
    if (step === "plan" || step === "thought" || step === "setup") go(next(step));
    else if (step === "trade") void saveTrade();
    else if (step === "chart") void saveCharts();
    else if (step === "autopsy") void completeAutopsy();
    else onClose();
  };

  const continueLabel = step === "trade" ? (mode === "import" && importRows ? `Import ${importRows.length}` : "Save trade") : step === "autopsy" ? "Finish" : step === "done" ? "Done" : "Continue";
  const back = step === "plan" || step === "done" ? null : step === "chart" ? (mode === "manual" ? "trade" : null) : step === "autopsy" ? "chart" : prev(step);

  const continueRef = useRef(onContinue);
  continueRef.current = onContinue;
  useEffect(() => {
    if (!open || lockOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); continueRef.current(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, lockOpen]);

  const rail: Rail = {
    steps: order.filter((s) => s !== "done").map((id) => ({ id, label: RAIL_LABEL[id] })),
    current: step,
    aside: (
      <>
        <p className="text-[14px] font-semibold tracking-[-0.01em] text-ink">{weekdayLong(today)}</p>
        <p className="mt-0.5 text-[12.5px] text-faint">{formatDateMedium(today)}</p>
      </>
    ),
  };

  const hintText = saveError ?? autopsy.error ?? gate.hint;
  const hintTone = saveError || autopsy.error ? "warn" : "muted";

  return (
    <>
    <Modal open={open} onClose={onClose} size={desktop ? "xl" : "md"} label="Plan and record a trade">
      <SheetFrame
        rail={rail}
        onClose={onClose}
        onBack={back ? () => go(back) : undefined}
        hint={step === "done" ? null : <Hint text={hintText} tone={hintTone} />}
        actions={
          <>
            {step === "chart" && <QuietButton disabled={saving} onClick={() => go("autopsy")}>Skip for now</QuietButton>}
            <PrimaryButton shortcut disabled={!gate.ok} loading={saving || (step === "autopsy" && autopsy.saving)} onClick={onContinue}>{continueLabel}</PrimaryButton>
          </>
        }
      >
        <StepTransition stepKey={step} dir={dir}>
          {step === "plan" && (
            <div>
              <StepTitle title="What's the plan?" subtitle="A sentence or two is plenty." />
              <div className="space-y-2.5 pt-7">
                <div className="flex items-center justify-between">
                  <Label done={thesisReveal.settled && thesis.trim().length > 0} htmlFor="flow-plan">Your read</Label>
                  <AnimatePresence initial={false}>
                    {thesisReveal.typing && (
                      <motion.span
                        initial={{ opacity: 0, y: 2 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gold"
                      >
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold-strong" />
                        <span>Listening…</span>
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
                <TextBlock
                  id="flow-plan"
                  autoFocus
                  value={thesis}
                  onChange={(e) => setThesis(e.target.value)}
                  placeholder="Where do you expect price to go, and why?"
                  className="lg:min-h-32"
                />
              </div>
              <AnimatePresence initial={false}>
                {showFeeling && (
                  <Reveal key="plan-feeling" delay={0.08}>
                    <div className="space-y-3">
                      <Label done={emotion !== ""}>How are you feeling?</Label>
                      <Stagger className="flex flex-wrap gap-2" delay={0.06}>
                        {PRIMARY_EMOTIONS.map((e) => <Chip key={e} selected={emotion === e} onClick={() => setEmotion(emotion === e ? "" : e)}>{label(e)}</Chip>)}
                        {(moreEmotions || MORE_EMOTIONS.includes(emotion as never)) && MORE_EMOTIONS.map((e) => <Chip key={e} selected={emotion === e} onClick={() => setEmotion(emotion === e ? "" : e)}>{label(e)}</Chip>)}
                        {!moreEmotions && !MORE_EMOTIONS.includes(emotion as never) && <Chip selected={false} onClick={() => setMoreEmotions(true)}>More…</Chip>}
                      </Stagger>
                    </div>
                  </Reveal>
                )}
                {showReason && (
                  <Reveal key="plan-reason" focus delay={0.08}>
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <Label done={reasonReveal.settled && emotionReason.trim().length > 0} htmlFor="flow-reason">
                          {emotion ? `What's behind feeling ${label(emotion).toLowerCase()}?` : "What's behind that feeling?"}
                        </Label>
                        <AnimatePresence initial={false}>
                          {reasonReveal.typing && (
                            <motion.span
                              initial={{ opacity: 0, y: 2 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0 }}
                              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-gold"
                            >
                              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold-strong" />
                              <span>Settling…</span>
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </div>
                      <TextBlock id="flow-reason" maxLength={280} value={emotionReason} onChange={(e) => setEmotionReason(e.target.value)} placeholder="A few words is plenty." />
                    </div>
                  </Reveal>
                )}
                {showNews && (
                  <Reveal key="plan-news" delay={0.08}>
                    <div className="space-y-3">
                      <Label done={newsAnswer !== null}>Any news or events today?</Label>
                      <Stagger className="flex flex-wrap gap-2" delay={0.06}>
                        <Chip selected={newsAnswer === true} onClick={() => chooseNews(true)}>Yes</Chip>
                        <Chip selected={newsAnswer === false} onClick={() => chooseNews(false)}>No news</Chip>
                      </Stagger>
                      <AnimatePresence initial={false}>
                        {newsAnswer && (
                          <Collapse key="news-list">
                            <ul className="mt-1 divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-raised">
                              <AnimatePresence initial={false}>
                                {newsEvents.map((ev) => (
                                  <motion.li key={ev.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={FLOW_EXPAND} className="overflow-hidden">
                                    <div className="flex items-center gap-2 px-4 py-2.5 transition-colors focus-within:bg-gold/[0.04]">
                                      <input
                                        autoFocus
                                        aria-label="Event name"
                                        value={ev.name}
                                        onChange={(e) => patchEvent(ev.id, { name: e.target.value })}
                                        placeholder="Event name, e.g. CPI, FOMC"
                                        maxLength={80}
                                        className="min-w-0 flex-1 bg-transparent py-1.5 text-[16px] text-ink outline-none placeholder:text-faint"
                                      />
                                      <input
                                        type="time"
                                        aria-label="Event time"
                                        value={ev.time}
                                        onChange={(e) => patchEvent(ev.id, { time: e.target.value })}
                                        className="shrink-0 rounded-lg bg-ink/[0.05] px-2.5 py-1.5 text-[15px] tabular-nums text-ink outline-none transition-colors hover:bg-ink/[0.08] focus:bg-ink/[0.08]"
                                      />
                                      {newsEvents.length > 1 && (
                                        <button type="button" aria-label="Remove event" onClick={() => setNewsEvents((l) => l.filter((x) => x.id !== ev.id))} className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-ink/[0.07] text-muted transition-all hover:bg-loss/15 hover:text-loss active:scale-90">
                                          <IconMinus />
                                        </button>
                                      )}
                                    </div>
                                  </motion.li>
                                ))}
                              </AnimatePresence>
                              <li>
                                <button type="button" onClick={() => setNewsEvents((l) => [...l, { id: uid("ev"), name: "", time: "" }])} className="flex w-full items-center gap-2 px-4 py-3 text-left text-[15px] font-medium text-gold transition-colors hover:bg-gold/[0.05]">
                                  <IconPlus /> Add event
                                </button>
                              </li>
                            </ul>
                          </Collapse>
                        )}
                      </AnimatePresence>
                    </div>
                  </Reveal>
                )}
                {showDetail && (
                  <Reveal key="plan-detail" delay={0.14}>
                    <div className="flex items-center justify-between rounded-2xl border border-line bg-raised px-4 py-3.5">
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold text-ink">Next: Clarify your Thought</p>
                        <p className="mt-0.5 text-[12.5px] text-muted">Structure your liquidity draw, invalidation, and AI mistake guardrails.</p>
                      </div>
                      <span className="ml-3 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#5e5ce6]/12 text-[#5e5ce6] dark:text-[#9d9bff]">
                        <IconSpark />
                      </span>
                    </div>
                  </Reveal>
                )}
              </AnimatePresence>
            </div>
          )}

          {step === "thought" && (
            <div className="space-y-7">
              <StepTitle
                title="Clarify your thought"
                subtitle="Turn your raw read into a structured hypothesis. The AI Brain scans your words and history to flag mistake traps before you enter."
              />

              {/* Apple Liquid-Glass AI Brain Synthesis Card */}
              <motion.section
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: FLOW_SMOOTH }}
                aria-label="AI Brain pre-trade read"
                className={cn(
                  "relative isolate overflow-hidden rounded-[24px] border border-ink/[0.08] p-5 backdrop-blur-xl",
                  "bg-gradient-to-br from-[#5e5ce6]/[0.08] via-surface/80 to-gold/[0.07]",
                  "shadow-[inset_0_1px_0_rgb(255_255_255/0.8),0_12px_30px_-18px_rgb(40_35_80/0.22)]",
                  "dark:border-white/10 dark:from-[#5e5ce6]/[0.14] dark:via-white/[0.04] dark:to-gold/[0.08]",
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#5e5ce6] text-white shadow-[0_6px_16px_-4px_rgb(94_92_230/0.55),inset_0_1px_0_rgb(255_255_255/0.3)]">
                      <IconSpark />
                    </span>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-[14px] font-semibold tracking-[-0.01em] text-ink">EdgeBook AI Brain</p>
                        <span className="rounded-full bg-[#5e5ce6]/15 px-2.5 py-0.5 text-[11px] font-semibold text-[#5e5ce6] dark:text-[#a5a4ff]">
                          {brainRead.calibration.tier} · {brainRead.calibration.calibrationPct}% calibrated
                        </span>
                      </div>
                      <p className="mt-0.5 text-[12px] text-muted">
                        Learned from {brainRead.calibration.totalTrades} trades, {brainRead.calibration.reviewedTrades} reviews &amp; {brainRead.calibration.linkedPlans} plans
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">Clarity</p>
                    <p className="font-mono text-[18px] font-semibold tabular-nums text-ink">{brainRead.clarityScore}%</p>
                  </div>
                </div>

                {/* Live summary of the trader's read + emotion */}
                <div className="mt-4 rounded-2xl border border-line/70 bg-raised/85 px-4 py-3">
                  <div className="flex flex-wrap items-center gap-2 text-[12px] font-medium text-muted">
                    <span className="rounded-full bg-gold/15 px-2.5 py-0.5 font-semibold text-gold">{finalInstrument}</span>
                    {emotion && <span className="rounded-full bg-ink/[0.06] px-2.5 py-0.5 text-ink">Feeling {label(emotion)}</span>}
                    {newsAnswer && <span className="rounded-full bg-loss/12 px-2.5 py-0.5 text-loss">News day</span>}
                  </div>
                  <p className="mt-2 text-[14px] font-medium leading-snug text-ink">{brainRead.headline}</p>
                  <p className="mt-1 text-[13px] leading-snug text-muted">{brainRead.subline}</p>
                </div>
              </motion.section>

              {/* Instrument + Mental Conviction */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2.5 rounded-[22px] border border-line bg-raised p-4">
                  <Label hint="defaults to MNQ" htmlFor="flow-instrument">Instrument</Label>
                  <TextBox
                    id="flow-instrument"
                    value={instrument}
                    onChange={(e) => setInstrument(e.target.value.toUpperCase())}
                    placeholder="MNQ"
                    className="font-mono"
                  />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {suggestedInstruments.map((i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => { haptic.selection(); setInstrument(i); }}
                        className={cn(
                          "rounded-full border px-3 py-1 font-mono text-[12.5px] font-semibold transition-all active:scale-95",
                          finalInstrument === i
                            ? "border-gold/60 bg-gold/15 text-gold"
                            : "border-line bg-surface text-muted hover:text-ink",
                        )}
                      >
                        {i}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col justify-between space-y-2.5 rounded-[22px] border border-line bg-raised p-4">
                  <Label hint="how clear is the tape?">Mental conviction</Label>
                  <Segmented
                    fullWidth
                    compact
                    layoutId="thought-conviction"
                    value={conviction}
                    onChange={setConviction}
                    options={[
                      { id: "crystal", label: "A+ Clear" },
                      { id: "solid", label: "Solid" },
                      { id: "cautious", label: "Cautious" },
                    ]}
                  />
                  <p className="text-[12px] leading-snug text-faint">
                    {conviction === "crystal"
                      ? "Structure, liquidity draw, and timing align cleanly."
                      : conviction === "solid"
                        ? "Good read — wait patiently for your setup trigger."
                        : "Tape is mixed — keep risk tight and don't force an entry."}
                  </p>
                </div>
              </div>

              {/* Structural Thought Cards: Draw on Liquidity, Invalidation, and What Could Break the Plan */}
              <div className="space-y-4">
                <div className="space-y-2.5 rounded-[22px] border border-line bg-raised p-4">
                  <Label done={draw.trim().length > 0} hint="target pool or magnet" htmlFor="flow-draw">
                    Where is the draw on liquidity?
                  </Label>
                  <TextBox
                    id="flow-draw"
                    value={draw}
                    onChange={(e) => setDraw(e.target.value)}
                    placeholder="e.g. Previous Day High, London Low sweep, Resting 15m FVG"
                  />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {DRAW_PRESETS.map((preset) => {
                      const activePreset = draw.toLowerCase().includes(preset.toLowerCase());
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            haptic.selection();
                            setDraw((cur) => (cur.trim() ? (activePreset ? cur : `${cur.trim()} · ${preset}`) : preset));
                          }}
                          className={cn(
                            "rounded-full border px-3 py-1 text-[12px] font-medium transition-all active:scale-95",
                            activePreset ? "border-gold/55 bg-gold/12 text-gold" : "border-line bg-surface text-muted hover:text-ink",
                          )}
                        >
                          + {preset}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2.5 rounded-[22px] border border-line bg-raised p-4">
                  <Label done={invalidation.trim().length > 0} hint="when the idea is wrong" htmlFor="flow-inval">
                    What would invalidate this thought?
                  </Label>
                  <TextBox
                    id="flow-inval"
                    value={invalidation}
                    onChange={(e) => setInvalidation(e.target.value)}
                    placeholder="e.g. 5m candle closes beyond the sweep high"
                  />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {INVAL_PRESETS.map((preset) => {
                      const activePreset = invalidation.toLowerCase().includes(preset.toLowerCase());
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            haptic.selection();
                            setInvalidation((cur) => (cur.trim() ? (activePreset ? cur : `${cur.trim()} · ${preset}`) : preset));
                          }}
                          className={cn(
                            "rounded-full border px-3 py-1 text-[12px] font-medium transition-all active:scale-95",
                            activePreset ? "border-gold/55 bg-gold/12 text-gold" : "border-line bg-surface text-muted hover:text-ink",
                          )}
                        >
                          + {preset}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2.5 rounded-[22px] border border-line bg-raised p-4">
                  <Label done={breakPlan.trim().length > 0} hint="pre-commit against tilt" htmlFor="flow-break">
                    What could make you break the plan?
                  </Label>
                  <TextBox
                    id="flow-break"
                    value={breakPlan}
                    onChange={(e) => setBreakPlan(e.target.value)}
                    placeholder="e.g. Entering before the 5m candle closes if price moves fast"
                  />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {BREAK_PRESETS.map((preset) => {
                      const activePreset = breakPlan.toLowerCase().includes(preset.toLowerCase());
                      return (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            haptic.selection();
                            setBreakPlan((cur) => (cur.trim() ? (activePreset ? cur : `${cur.trim()} · ${preset}`) : preset));
                          }}
                          className={cn(
                            "rounded-full border px-3 py-1 text-[12px] font-medium transition-all active:scale-95",
                            activePreset ? "border-gold/55 bg-gold/12 text-gold" : "border-line bg-surface text-muted hover:text-ink",
                          )}
                        >
                          + {preset}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* AI-Powered Mistakes to Watch Tagging Section */}
              <div className="space-y-3.5 rounded-[24px] border border-line bg-raised p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Label done={watch.length > 0} hint="AI-tagged from your read & history">
                      Mistakes to watch for today
                    </Label>
                    <p className="mt-1 text-[12.5px] text-muted">
                      The AI Brain pre-tags your likeliest mistake traps from what you wrote above and your past reviews.
                    </p>
                  </div>
                  {brainRead.suggestedWatch.length > 0 && (
                    <button
                      type="button"
                      onClick={applyAiSuggestedTags}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#5e5ce6]/12 px-3.5 py-1.5 text-[12.5px] font-semibold text-[#5e5ce6] ring-1 ring-inset ring-[#5e5ce6]/25 transition-all hover:bg-[#5e5ce6]/20 active:scale-95 dark:text-[#a5a4ff]"
                    >
                      <IconSpark />
                      <span>Auto-tag with AI ({brainRead.suggestedWatch.length})</span>
                    </button>
                  )}
                </div>

                {/* Live AI-detected mistake reasons */}
                {brainRead.suggestedWatch.length > 0 && (
                  <div className="space-y-1.5 rounded-2xl border border-[#5e5ce6]/20 bg-[#5e5ce6]/[0.05] p-3">
                    {brainRead.suggestedWatch.slice(0, 3).map((s) => {
                      const isSelected = watch.includes(s.key);
                      return (
                        <div key={s.key} className="flex items-start justify-between gap-2 text-[12.5px]">
                          <div className="min-w-0">
                            <span className="font-semibold text-ink">{s.label}: </span>
                            <span className="text-muted">{s.reason}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              haptic.selection();
                              setWatch((w) => (w.includes(s.key) ? w.filter((k) => k !== s.key) : [...w, s.key]));
                            }}
                            className={cn(
                              "shrink-0 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold transition-colors",
                              isSelected
                                ? "bg-gold-strong text-on-gold"
                                : "bg-[#5e5ce6]/15 text-[#5e5ce6] hover:bg-[#5e5ce6]/25 dark:text-[#a5a4ff]",
                            )}
                          >
                            {isSelected ? "Watching ✓" : "Watch"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  {watchOptions.map((o) => {
                    const isSelected = watch.includes(o.key);
                    return (
                      <Chip
                        key={o.key}
                        tone="gold"
                        selected={isSelected}
                        onClick={() => setWatch((w) => (w.includes(o.key) ? w.filter((k) => k !== o.key) : [...w, o.key]))}
                      >
                        <span>{o.label}</span>
                        {o.ai && (
                          <span className="ml-1.5 rounded-full bg-[#5e5ce6]/20 px-1.5 py-0.2 text-[10.5px] font-semibold text-[#5e5ce6] dark:text-[#a5a4ff]">
                            AI
                          </span>
                        )}
                        {!o.ai && o.weeks >= 2 && (
                          <span title={`Seen in ${o.weeks} of the last 5 weeks`} className="ml-1.5 text-[11.5px] font-normal opacity-70">
                            recurring
                          </span>
                        )}
                      </Chip>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {step === "setup" && (
            <div className="space-y-8">
              <StepTitle title="Pick your setup" />
              <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Setup">
                {playbook.map((p) => {
                  const n = setupRules(p).length;
                  return <ChoiceCard key={p.id} selected={playbookId === p.id} title={p.name} meta={`${n} ${n === 1 ? "rule" : "rules"}`} onClick={() => { setPlaybookId(p.id); setRuleStates({}); }} />;
                })}
              </div>
              <AnimatePresence initial={false}>
                {selectedPlaybook && rules.length > 0 && (
                  <Collapse key={selectedPlaybook.id}>
                    <div className="space-y-3 pb-1">
                      <div className="flex items-center justify-between">
                        <p className="text-[13px] font-medium text-muted">Tick the rules you've confirmed <span className="text-faint">· optional</span></p>
                        <p className="text-[12px] tabular-nums text-faint">{confirmedRules}/{rules.length}</p>
                      </div>
                      <div className="h-[3px] overflow-hidden rounded-full bg-line-soft"><div className="h-full rounded-full bg-profit transition-[width] duration-300" style={{ width: `${(confirmedRules / rules.length) * 100}%` }} /></div>
                      <div className="space-y-2">
                        {rules.map((r, i) => {
                          const checked = ruleStates[String(i)] === "ready";
                          const h = statFor(history, playbookId, r.text || `Rule ${i + 1}`);
                          const hint = h && h.skipped > 0 ? `Skipped ${h.skipped} of ${h.planned} times${h.skippedAvgPnl != null ? ` · avg ${h.skippedAvgPnl < 0 ? "−" : "+"}$${Math.abs(Math.round(h.skippedAvgPnl))} when skipped` : ""}` : undefined;
                          return <CheckRow key={i} checked={checked} title={r.text || `Rule ${i + 1}`} note={[r.description, hint].filter(Boolean).join(" · ") || undefined} onClick={() => setRuleStates({ ...ruleStates, [String(i)]: checked ? "waiting" : "ready" })} />;
                        })}
                      </div>
                    </div>
                  </Collapse>
                )}
              </AnimatePresence>
              <WinOddsCard draft={draftPlan} entries={entries} plans={plans} />
            </div>
          )}

          {step === "trade" && (
            <div className="space-y-8">
              <StepTitle title="Log the trade" subtitle={`Logging ${finalInstrument}`} />
              {playbook.length === 0 && !createdId && <WinOddsCard draft={draftPlan} entries={entries} plans={plans} />}
              {!createdId && <Segmented value={mode} onChange={(m) => { setMode(m); setSaveError(null); }} options={[{ id: "manual", label: "Manual" }, { id: "import", label: "Import CSV" }]} />}

              {mode === "manual" && (
                <div>
                  <div
                    onClick={() => document.getElementById("flow-pnl")?.focus()}
                    className="cursor-text rounded-[26px] border border-line bg-raised px-6 py-7 text-center transition-[border-color,box-shadow] duration-150 focus-within:border-gold/50 focus-within:ring-4 focus-within:ring-gold/10"
                  >
                    <Label htmlFor="flow-pnl">Net P&amp;L</Label>
                    <div className="mt-3 flex items-baseline justify-center gap-1.5">
                      <span className="text-[28px] text-faint">{sym}</span>
                      <input
                        id="flow-pnl"
                        autoFocus
                        inputMode="decimal"
                        enterKeyHint="next"
                        autoComplete="off"
                        value={pnl}
                        onChange={(e) => setPnl(cleanNumber(e.target.value))}
                        placeholder="0.00"
                        aria-invalid={pnlInvalid || undefined}
                        style={{ width: `${Math.max(pnl.length, 4)}ch` }}
                        className={cn("max-w-full border-0 bg-transparent p-0 text-center font-mono text-[44px] tracking-tight !shadow-none !outline-none !ring-0 placeholder:text-faint/60", pnlValue > 0 && "text-profit", pnlValue < 0 && "text-loss", pnlInvalid && "text-loss")}
                      />
                    </div>
                    <p className="mt-2 min-h-5 text-[12.5px] text-faint">{pnlInvalid ? <span className="text-loss">Numbers only — negative for a loss</span> : "Negative for a loss"}</p>
                  </div>

                  {(pnlDone || direction !== null) && (
                    <Reveal>
                      <div className="space-y-3">
                        <Label done={direction !== null}>Direction</Label>
                        <BinaryChoice value={direction === null ? null : direction === "long"} onChange={(v) => setDirection(v ? "long" : "short")} options={["Long", "Short"]} />
                      </div>
                    </Reveal>
                  )}

                  {direction !== null && (
                    <Reveal>
                      <div className="space-y-3">
                        <Label hint="price & time · optional" done={entryN !== null && exitN !== null}>Entry &amp; exit</Label>
                        <div className="grid grid-cols-2 gap-3">
                          <TicketCard
                            id="flow-entry-price" title="Entry" tile="bg-gradient-to-b from-gold-strong to-gold-deep" glyph={<GlyphArrowIn />}
                            price={entryPrice} onPrice={(v) => setEntryPrice(cleanPrice(v))}
                            time={entryTime} onTime={setEntryTime} timeId="flow-in"
                          />
                          <TicketCard
                            id="flow-exit-price" title="Exit" tile="bg-gradient-to-b from-[#8f99a8] to-[#667085]" glyph={<GlyphArrowOut />}
                            price={exitPrice} onPrice={(v) => setExitPrice(cleanPrice(v))}
                            time={exitTime} onTime={setExitTime} timeId="flow-out"
                            foot={movePts !== null || heldMin !== null ? (
                              <>
                                {movePts !== null && <span className={cn("font-medium", movePts > 0 && "text-profit", movePts < 0 && "text-loss")}>{movePts > 0 ? "+" : movePts < 0 ? "−" : ""}{fmtPts(Math.abs(movePts))} pts</span>}
                                {movePts !== null && heldMin !== null && " · "}
                                {heldMin !== null && `held ${fmtHeld(heldMin)}`}
                              </>
                            ) : undefined}
                          />
                        </div>
                        <AnimatePresence initial={false}>
                          {!levelsOpen && (
                            <Collapse key="add-levels">
                              <button type="button" onClick={() => setLevelsOpen(true)} className="flex min-h-11 items-center gap-1.5 text-[15px] font-medium text-gold transition-opacity hover:opacity-80">
                                <IconPlus /> Add stop loss &amp; take profit
                              </button>
                            </Collapse>
                          )}
                        </AnimatePresence>
                      </div>
                    </Reveal>
                  )}

                  {direction !== null && levelsOpen && (
                    <Reveal>
                      <div className="space-y-3">
                        <Label hint="optional" done={stopN !== null && targetN !== null}>Stop loss &amp; take profit</Label>
                        <div className="grid grid-cols-2 gap-3">
                          <TicketCard
                            id="flow-sl" title="Stop loss" tile="bg-loss" glyph={<GlyphStop />}
                            price={stopLoss} onPrice={(v) => setStopLoss(cleanPrice(v))}
                            invalid={levelNote !== null && stopN !== null && entryN !== null && (isLong ? stopN >= entryN : stopN <= entryN)}
                            foot={riskPts !== null ? `${fmtPts(riskPts)} pts from entry` : ""}
                          />
                          <TicketCard
                            id="flow-tp" title="Take profit" tile="bg-profit" glyph={<GlyphTarget />}
                            price={takeProfit} onPrice={(v) => setTakeProfit(cleanPrice(v))}
                            invalid={levelNote !== null && targetN !== null && entryN !== null && (isLong ? targetN <= entryN : targetN >= entryN)}
                            foot={rewardPts !== null ? `${fmtPts(rewardPts)} pts from entry` : ""}
                          />
                        </div>
                        <AnimatePresence initial={false}>
                          {levelNote && (
                            <Collapse key="level-note"><p role="status" className="px-1 text-[13px] text-loss">{levelNote}</p></Collapse>
                          )}
                        </AnimatePresence>
                        <AnimatePresence initial={false}>
                          {levelStats.length > 0 && (
                            <Collapse key="level-stats"><StatStrip stats={levelStats} /></Collapse>
                          )}
                        </AnimatePresence>
                      </div>
                    </Reveal>
                  )}

                  {direction !== null && (
                    <Reveal delay={0.12}>
                      <div className="space-y-3">
                        <Label done={quantityOk} hint="contracts, shares or lots" htmlFor="flow-qty">Quantity</Label>
                        <div className="flex items-center gap-3">
                          <div onClick={() => document.getElementById("flow-qty")?.focus()} className="flex h-14 min-w-0 flex-1 cursor-text items-center rounded-2xl border border-line bg-raised px-5 transition-[border-color,box-shadow] duration-150 focus-within:border-gold/50 focus-within:ring-4 focus-within:ring-gold/10">
                            <input
                              id="flow-qty"
                              inputMode="decimal"
                              enterKeyHint="done"
                              autoComplete="off"
                              value={quantity}
                              onChange={(e) => setQuantity(e.target.value.replace(/[^\d.]/g, ""))}
                              placeholder="1"
                              className="w-full min-w-0 border-0 bg-transparent p-0 font-mono text-[26px] tracking-tight text-ink !shadow-none !outline-none !ring-0 placeholder:text-faint/60"
                            />
                          </div>
                          <Stepper label="Quantity" onStep={stepQuantity} canDecrement={!(quantityValue <= 1)} />
                        </div>
                      </div>
                    </Reveal>
                  )}

                  <div className="pt-7">
                    <Disclosure label="More detail">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2.5"><Label htmlFor="flow-date">Day</Label><TextBox id="flow-date" type="date" max={todayKey()} value={tradeDate} onChange={(e) => setTradeDate(e.target.value)} /></div>
                        <div className="space-y-2.5"><Label htmlFor="flow-rr" hint={manualR === null && realizedR !== null ? "auto from your prices" : undefined}>R multiple</Label><TextBox id="flow-rr" inputMode="decimal" placeholder={realizedR !== null ? realizedR.toFixed(2) : "2.5"} value={rr} onChange={(e) => setRr(cleanNumber(e.target.value))} className="font-mono" /></div>
                      </div>
                    </Disclosure>
                  </div>
                </div>
              )}

              {mode === "import" && (
                <div className="space-y-4">
                  <input ref={importRef} type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadImportFile(f); e.target.value = ""; }} />
                  {!importRows ? (
                    <>
                      <button type="button" onClick={() => importRef.current?.click()} className="flex w-full flex-col items-center gap-1.5 rounded-[26px] border border-dashed border-line-strong bg-raised px-6 py-12 transition-colors hover:border-gold/60">
                        <span className="text-[16px] font-semibold text-ink">Choose a CSV</span>
                        <span className="text-[13px] text-muted">Broker or spreadsheet export</span>
                      </button>
                      {importError && <p className="px-1 text-[13px] text-loss">{importError}</p>}
                    </>
                  ) : (
                    <div className="space-y-3">
                      <p className="flex items-center gap-2 text-[14px] text-ink">
                        <span className="grid h-5 w-5 place-items-center rounded-full bg-profit/15 text-profit"><IconCheck className="h-3 w-3" /></span>
                        {importRows.length} {importRows.length === 1 ? "trade" : "trades"} ready
                        <button type="button" onClick={() => { setImportRows(null); setImportError(null); }} className="ml-auto text-[13px] font-medium text-gold hover:underline">Change file</button>
                      </p>
                      <ul className="divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-raised">
                        {importRows.slice(0, 4).map((r, i) => (
                          <li key={i} className="flex items-center justify-between px-4 py-2.5 text-[14px]">
                            <span className="text-muted">{r.date} · <span className="text-ink">{r.instrument}</span></span>
                            <span className={cn("font-mono tabular-nums", r.pnl > 0 ? "text-profit" : r.pnl < 0 ? "text-loss" : "text-muted")}>{r.pnl}</span>
                          </li>
                        ))}
                        {importRows.length > 4 && <li className="px-4 py-2.5 text-[13px] text-faint">+{importRows.length - 4} more</li>}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {step === "chart" && (
            <div className="space-y-8">
              <StepTitle title="Add your chart" subtitle={importRows && importRows.length > 1 ? "Up to two screenshots, attached to the first trade." : "Up to two screenshots."} />
              <ImageUploader items={images} onChange={setImages} max={2} />
            </div>
          )}

          {step === "autopsy" && <AutopsyBody a={autopsy} onAddChart={() => go("chart")} />}

          {step === "done" && (
            <div className="flex min-h-[20rem] flex-col items-center justify-center text-center">
              <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 380, damping: 22 }} className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-b from-gold-strong to-gold-deep text-on-gold shadow-[0_12px_28px_-10px_var(--gold-strong)]">
                <IconCheck className="h-7 w-7" />
              </motion.div>
              <h2 className="mt-7 text-[32px] font-semibold tracking-[-0.025em] text-ink">Logged.</h2>
              <p className="mt-2 max-w-[22rem] text-[15px] leading-snug text-muted">Process noted — the outcome is just data.</p>
              {autopsy.risk && (
                <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.15 }} className="mt-6 w-full max-w-[24rem] text-left">
                  <RiskMeter risk={autopsy.risk} currency={settings.currency} label="Today vs your limit" />
                </motion.div>
              )}
              {createdId && <button type="button" onClick={() => { useUi.getState().openMinatoWithTrade(createdId); onClose(); }} className="mt-6 text-[14px] font-medium text-gold hover:underline">Talk it through with MINATO</button>}
            </div>
          )}
        </StepTransition>
      </SheetFrame>
    </Modal>

    {/* Stop at the plan: a 2nd trade after a loss needs a pause; a 3rd needs a lockout. */}
    <Modal open={lockOpen} onClose={onClose} size="md" label={thirdTrade ? "Third trade lockout" : "Second trade after a loss"}>
      <div className="px-6 py-6 sm:px-8">
        <div className="flex items-start gap-3.5">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-loss/30 bg-loss/[0.08] text-loss">
            <ShieldIcon className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-[22px] font-semibold leading-tight tracking-[-0.02em] text-ink">
              {thirdTrade ? "Manual lockout required in Tradovate right now" : "Pause before trade #2"}
            </h2>
            {thirdTrade ? (
              <p className="mt-2 text-[15px] leading-relaxed text-muted">
                You already have <strong className="text-loss">{lossesToday} losses</strong> today
                {tradesToday > 0 && <> across {tradesToday} trades</>}. The statistical probability of a
                3rd trade winning is only <strong className="text-ink">4%–5%</strong>, whereas
                tomorrow&apos;s fresh A+ setup holds a <strong className="text-profit">40%–50%</strong> probability.
                Lock out immediately — preserving mental capital is today&apos;s final win.
              </p>
            ) : (
              <p className="mt-2 text-[15px] leading-relaxed text-muted">
                You already have <strong className="text-loss">1 loss</strong> today. A 2nd trade straight after a loss is where
                revenge and tilt creep in. Reset, review that trade, and only continue if this is a fresh, planned A+ setup.
              </p>
            )}
          </div>
        </div>
        <div className="mt-6">
          <CheckRow
            checked={lockChecked}
            onClick={() => setLockChecked((v) => !v)}
            title={thirdTrade
              ? "I acknowledge this is a psychological failure point, I am trading beyond my 2-trade plan, and I accept full responsibility for breaking my own rule."
              : "I've reset, I'm not trying to win the loss back, and this trade follows my plan."}
          />
        </div>
        <div className="mt-6 flex items-center justify-end gap-2">
          <QuietButton onClick={onClose}>Close — I&apos;m done for today</QuietButton>
          <PrimaryButton disabled={!lockChecked} onClick={() => setLockAck(true)}>{thirdTrade ? "Proceed anyway" : "Continue to plan"}</PrimaryButton>
        </div>
      </div>
    </Modal>
    </>
  );
}

/**
 * One "ticket": an iOS-Settings-style icon tile and title, a large monospaced price that is the input itself
 * (tap anywhere on the card to type, the card shows focus), an optional one-line footnote, and an optional time row.
 */
function TicketCard({ id, title, tile, glyph, price, onPrice, foot, invalid, time, onTime, timeId }: {
  id: string; title: string; tile: string; glyph: React.ReactNode;
  price: string; onPrice: (v: string) => void;
  foot?: React.ReactNode; invalid?: boolean;
  time?: string; onTime?: (v: string) => void; timeId?: string;
}) {
  return (
    <div className={cn("flex flex-col overflow-hidden rounded-[22px] border bg-raised transition-[border-color,box-shadow] duration-150 focus-within:border-gold/50 focus-within:ring-4 focus-within:ring-gold/10", invalid ? "border-loss/45" : "border-line")}>
      <div onClick={() => document.getElementById(id)?.focus()} className="cursor-text px-4 pb-3.5 pt-3.5">
        <div className="flex items-center gap-2.5">
          <IconTile tile={tile}>{glyph}</IconTile>
          <label htmlFor={id} className="text-[14px] font-medium tracking-[-0.01em] text-ink">{title}</label>
        </div>
        <input
          id={id}
          inputMode="decimal"
          enterKeyHint="next"
          autoComplete="off"
          value={price}
          onChange={(e) => onPrice(e.target.value)}
          placeholder="0.00"
          aria-invalid={invalid || undefined}
          className={cn("mt-3.5 w-full min-w-0 border-0 bg-transparent p-0 font-mono text-[22px] tracking-tight sm:text-[26px] !shadow-none !outline-none !ring-0 placeholder:text-faint/50", invalid ? "text-loss" : "text-ink")}
        />
        {foot !== undefined && <p className="mt-1.5 min-h-4 text-[12px] leading-4 text-faint">{foot}</p>}
      </div>
      {onTime && timeId && <div className="mt-auto border-t border-line-soft"><TimeField id={timeId} label={title} value={time ?? ""} onChange={onTime} /></div>}
    </div>
  );
}

/** Compact time row inside a ticket: clock glyph, native time input, tap anywhere to edit, clearable. */
function TimeField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const open = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el || e.target === el) return;
    el.focus();
    try { el.showPicker?.(); } catch { /* picker needs a user gesture; focus is enough */ }
  };
  return (
    <div onClick={open} className="flex h-11 cursor-pointer items-center gap-1.5 px-3.5 transition-colors hover:bg-ink/[0.03]">
      <span className="shrink-0 text-faint"><GlyphTimer /></span>
      <input
        ref={ref}
        id={id}
        type="time"
        aria-label={`${label} time`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn("min-w-0 flex-1 border-0 bg-transparent p-0 text-right font-mono text-[14px] !shadow-none !outline-none !ring-0 sm:text-[15px]", value ? "text-ink" : "text-faint")}
      />
      {value && (
        <button
          type="button"
          aria-label={`Clear ${label.toLowerCase()} time`}
          onClick={(e) => { e.stopPropagation(); onChange(""); }}
          className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-ink/[0.1] text-muted transition-colors hover:bg-ink/[0.18] hover:text-ink"
        >
          <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M3 3l6 6M9 3l-6 6" /></svg>
        </button>
      )}
    </div>
  );
}

/** A quiet row of live numbers (risk, reward, R : R, realized R) separated by hairlines. */
function StatStrip({ stats }: { stats: { k: string; v: string; tone?: "profit" | "loss" }[] }) {
  return (
    <div className="mt-0.5 grid divide-x divide-line-soft overflow-hidden rounded-2xl border border-line-soft bg-ink/[0.03]" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
      {stats.map((x) => (
        <div key={x.k} className="px-2 py-2.5 text-center">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-faint">{x.k}</p>
          <p className={cn("mt-0.5 font-mono text-[14px] tabular-nums sm:text-[15px]", x.tone === "profit" ? "text-profit" : x.tone === "loss" ? "text-loss" : "text-ink")}>{x.v}</p>
        </div>
      ))}
    </div>
  );
}
