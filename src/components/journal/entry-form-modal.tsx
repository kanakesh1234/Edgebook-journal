"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AnimatePresence, motion } from "motion/react";
import { setupRules, type JournalEntry, type PlanRuleState, type TradeDirection } from "@/lib/types";
import { currencySymbol, formatDateMedium, formatSignedMoney, todayKey, weekdayLong } from "@/lib/format";
import { useApp, persistFailedSince, type EntryDraft } from "@/lib/store";
import { useUi } from "@/lib/ui-store";
import { toast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import { ImageUploader, type UploadItem } from "./image-uploader";
import { cn, uid } from "@/lib/utils";
import { defaultMnqSymbol, resolveInstrument } from "./journal-model";
import { AlertTriangleIcon } from "@/components/ui/icons";
import { useForexFactoryNews } from "./use-forexfactory-news";
import { findNearbyMajorNews } from "@/lib/minato/forexfactory";
import { useMinatoReminders } from "@/lib/minato/reminders";
import { haptic } from "@/lib/haptics";
import { getSyncState, subscribeSyncState } from "@/lib/services/storage";
import { AutopsyBody, useAutopsy } from "./autopsy";
import { RiskMeter } from "./risk-meter";
import { WinOddsRing } from "./win-odds-ring";
import { ruleStats, statFor } from "@/lib/rule-stats";
import { MISTAKE_CATEGORIES } from "@/lib/mistakes";
import { Sym } from "@/components/journal/symbols";
import type { PlanDraft } from "@/lib/prediction";
import {
  BinaryChoice,
  ChoiceCard,
  Chip,
  Collapse,
  Disclosure,
  FLOW_EXPAND,
  FLOW_SMOOTH,
  GlyphArrowIn,
  GlyphArrowOut,
  GlyphCalendar,
  GlyphStop,
  GlyphTarget,
  GlyphTimer,
  Hint,
  IconCheck,
  IconTile,
  Label,
  PrimaryButton,
  QuietButton,
  Reveal,
  Segmented,
  SheetFrame,
  Stagger,
  StatStrip,
  Stepper,
  StepTitle,
  StepTransition,
  TextBlock,
  TextBox,
  ThoughtTextarea,
  TicketCard,
  useIsDesktop,
  type Rail,
} from "./flow-ui";

/** Default execution time starts after the 09:33 NY opening range. */
const DEFAULT_TIME = "09:33";
const DEFAULT_INSTRUMENT = "MNQ";

/**
 * ADD TRADE FLOW
 *
 *   Step 1: trade (1st step of Add Trade preserved as it is: Day, Instrument, P&L, Direction, Entry/Exit, SL/TP, Size)
 *   Step 2: thought (Plan Trade Step 2: "Before you enter", thoughts & impulses, guard against, key level)
 *   Step 3: setup (Plan Trade Step 3: "Pick your setup", rules checklist with % kept, WinOddsRing)
 *   Step 4: chart (Plan Trade Step 5: "Add your chart", ImageUploader)
 *   Step 5: autopsy (Plan Trade Step 6: "Trade autopsy", AutopsyBody)
 *   Step 6: done (Plan Trade Step 7: "Logged." success screen, RiskMeter, Minato review button)
 */
type StepId = "trade" | "thought" | "setup" | "chart" | "autopsy" | "done";

type ThoughtKind = "thought" | "idea" | "impulse";
type ThoughtItem = { id: string; text: string; kind?: ThoughtKind };

const cleanNumber = (v: string) => v.replace(/[^\d.\-−]/g, "").replace("−", "-");
const cleanPrice = (v: string) => {
  const t = v.replace(/[^\d.]/g, "");
  const [a = "", ...rest] = t.split(".");
  return rest.length ? `${a}.${rest.join("").slice(0, 5)}` : a;
};
const parsePrice = (v: string): number | null => {
  const t = v.trim();
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};
const fmtPts = (n: number) => String(Math.round(n * 100) / 100);
const minutesBetween = (a: string, b: string): number | null => {
  const m = (t: string) => {
    const x = /^(\d{1,2}):(\d{2})/.exec(t.trim());
    return x ? Number(x[1]) * 60 + Number(x[2]) : null;
  };
  const s1 = m(a),
    s2 = m(b);
  return s1 === null || s2 === null || s2 < s1 ? null : s2 - s1;
};
const fmtHeld = (min: number) => {
  if (min <= 0) return "< 1 min";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
};

const IconPlus = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
const GlyphBolt = () => (
  <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M13 3 5.5 13.5h5.5L10 21l8.5-11.5H13L13 3Z" />
  </svg>
);
const GlyphSparkBulb = () => (
  <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.8 10.6c.6.5 1.1 1.3 1.3 2.1h5c.2-.8.7-1.6 1.3-2.1A6 6 0 0 0 12 3Z" />
  </svg>
);
const GlyphFlag = () => (
  <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1zM4 22v-7" />
  </svg>
);

const NEXT_KIND: Record<ThoughtKind, ThoughtKind> = {
  thought: "impulse",
  impulse: "idea",
  idea: "thought",
};

/** Infers the Apple squircle icon tile & tag for a thought, idea, or impulse line. */
function thoughtVisual(text: string, manualKind?: ThoughtKind): { kind: ThoughtKind; tile: string; glyph: React.ReactNode; tag: string } {
  const t = text.toLowerCase();
  const detected: ThoughtKind =
    manualKind ??
    (/\b(fomo|urge|impulse|rush|chase|early|revenge|hesitat|fear|greed|anxious|tempt|force)\b/.test(t)
      ? "impulse"
      : /\b(idea|if|sweep|fvg|smt|target|retest|setup|displacement|level|draw)\b/.test(t)
        ? "idea"
        : "thought");

  if (detected === "impulse") {
    return {
      kind: "impulse",
      tile: "bg-gradient-to-b from-[#ff9f0a] to-[#d97706]",
      glyph: <GlyphBolt />,
      tag: "Impulse",
    };
  }
  if (detected === "idea") {
    if (/\b(invalid|cut|stop|sl|abort)\b/.test(t)) {
      return { kind: "idea", tile: "bg-loss", glyph: <GlyphStop />, tag: "Guard" };
    }
    if (/\b(wait|sit|hands|patience|chop)\b/.test(t)) {
      return { kind: "idea", tile: "bg-[#5e5ce6]", glyph: <GlyphTimer />, tag: "Patience" };
    }
    if (/\b(target|tp|runner|high|low)\b/.test(t) && !/\bsweep\b/.test(t)) {
      return { kind: "idea", tile: "bg-profit", glyph: <GlyphFlag />, tag: "Target" };
    }
    return {
      kind: "idea",
      tile: "bg-gradient-to-b from-gold-strong to-gold-deep",
      glyph: <GlyphSparkBulb />,
      tag: "Idea",
    };
  }
  return {
    kind: "thought",
    tile: "bg-gradient-to-b from-[#6e6ce8] to-[#5250c9]",
    glyph: <GlyphTarget />,
    tag: "Thought",
  };
}


/**
 * Pacing for the progressive question reveal matching Plan Trade.
 * The flow waits a beat after you pause typing (`REVEAL_SETTLE_MS`) or tap an answer
 * (`REVEAL_LEVELS_DELAY_MS`) before the next question slides in — deliberate, calm, Apple feel.
 */
const REVEAL_SETTLE_MS = 850;
const REVEAL_LEVELS_DELAY_MS = 720;

function useSettledReveal(
  text: string,
  alreadyAnsweredDownstream: boolean,
  open: boolean,
  minChars = 1,
  delayMs = REVEAL_SETTLE_MS,
): { settled: boolean } {
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
  };
}

/** Latch a flag a beat after it turns true, so tapping an answer reveals the follow-up question with intent. */
function useDelayedFlag(flag: boolean, open: boolean, delayMs = REVEAL_LEVELS_DELAY_MS): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!open || !flag) {
      setOn(false);
      return;
    }
    const timer = window.setTimeout(() => setOn(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [flag, open, delayMs]);
  return on;
}

export function EntryFormModal({
  open: openProp,
  onClose: onCloseProp,
  entry: entryProp,
  presetDate,
}: {
  open?: boolean;
  onClose?: () => void;
  entry?: JournalEntry | null;
  presetDate?: string | null;
} = {}) {
  const globalOpen = useUi((s) => s.newEntryOpen);
  const closeGlobal = useUi((s) => s.closeNewEntry);
  const settings = useApp((s) => s.settings);
  const entries = useApp((s) => s.entries);
  const plans = useApp((s) => s.plans);
  const challenges = useMemo(() => settings.challenges ?? [], [settings]);
  const playbook = useMemo(() => settings.playbook ?? [], [settings]);
  const sym = currencySymbol(settings.currency);
  const desktop = useIsDesktop();
  const syncState = useSyncExternalStore(subscribeSyncState, getSyncState, () => "synced");
  const isOffline = syncState === "offline-cached";

  const open = openProp ?? globalOpen;
  const onClose = onCloseProp ?? closeGlobal;
  const editing = entryProp ?? null;

  const [step, setStep] = useState<StepId>("trade");
  const [dir, setDir] = useState<1 | -1>(1);
  const [mode, setMode] = useState<"manual" | "import">("manual");

  // Step 1: Trade Details
  const [date, setDate] = useState(todayKey());
  const [pnl, setPnl] = useState("");
  const [instrument, setInstrument] = useState(DEFAULT_INSTRUMENT);
  const [direction, setDirection] = useState<TradeDirection | null>(null);
  const [entryTime, setEntryTime] = useState("");
  const [exitTime, setExitTime] = useState("");
  const [entryPrice, setEntryPrice] = useState("");
  const [exitPrice, setExitPrice] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [levelsOpen, setLevelsOpen] = useState(false);
  const [quantity, setQuantity] = useState("1");
  const [challengeId, setChallengeId] = useState("");

  // Step 2: Thoughts (from Plan Trade)
  const [thoughts, setThoughts] = useState<ThoughtItem[]>([{ id: "th-1", text: "" }]);
  const [watch, setWatch] = useState<string[]>([]);
  const [moreWatch, setMoreWatch] = useState(false);
  const [draw, setDraw] = useState("");

  // Step 3: Setup & Rules (from Plan Trade)
  const [setupId, setSetupId] = useState("");
  const [pickingSetup, setPickingSetup] = useState(false);
  const [ruleStates, setRuleStates] = useState<Record<string, PlanRuleState>>({});
  const [notes, setNotes] = useState("");

  // Step 4: Chart (from Plan Trade)
  const [images, setImages] = useState<UploadItem[]>([]);
  const [compareImage, setCompareImage] = useState<UploadItem[]>([]);

  // Step 5: Autopsy & Done
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(editing?.id ?? null);
  const autopsy = useAutopsy(createdId, open && (step === "autopsy" || step === "done"));

  const [entryEdited, setEntryEdited] = useState(false);
  const [showPremature, setShowPremature] = useState(false);

  const imp = useTradeImport({
    onImported: (first) => {
      onClose();
      if (first) {
        useUi.getState().openMinatoWithTrade(first.id);
      }
    },
    onClose,
  });

  const history = useMemo(() => ruleStats(plans, entries), [plans, entries]);

  // Order: 1st step of Add Trade preserved → from 2nd step in Plan Trade
  const order: StepId[] = useMemo(
    () => (playbook.length ? ["trade", "thought", "setup", "chart", "autopsy", "done"] : ["trade", "thought", "chart", "autopsy", "done"]),
    [playbook.length],
  );

  const go = (to: StepId) => {
    setDir(order.indexOf(to) >= order.indexOf(step) ? 1 : -1);
    setSaveError(null);
    setStep(to);
  };
  const prevStep = (st: StepId): StepId | null => {
    const i = order.indexOf(st);
    return i > 0 ? order[i - 1]! : null;
  };

  // Suggested instruments from recent journal entries
  const suggestedInstruments = useMemo(() => {
    const seen: string[] = [DEFAULT_INSTRUMENT, "NQ", "ES", "MES"];
    for (const e of [...entries].sort((a, b) => b.createdAt - a.createdAt)) {
      const i = e.instrument?.trim().toUpperCase();
      if (i && i !== "—" && !seen.includes(i)) seen.push(i);
      if (seen.length >= 6) break;
    }
    return seen;
  }, [entries]);

  // Hydrate on open
  useEffect(() => {
    if (!open) return;
    useMinatoReminders.getState().triggerContextReminders("Before Logging Trade");
    setStep("trade");
    setDir(1);
    setSaveError(null);
    if (editing) {
      setCreatedId(editing.id);
      setDate(editing.date);
      setPnl(String(editing.pnl));
      setInstrument(editing.instrument && editing.instrument !== "—" ? editing.instrument : DEFAULT_INSTRUMENT);
      setDirection(editing.direction);
      setSetupId(editing.setupId ?? "");
      setNotes(editing.notes);
      setImages(editing.images.map((m) => ({ meta: m, blob: null })));
      setCompareImage(editing.compareImage ? [{ meta: editing.compareImage, blob: null }] : []);
      setEntryTime(editing.entryTime ?? "");
      setExitTime(editing.exitTime ?? "");
      setEntryPrice(editing.entryPrice != null ? String(editing.entryPrice) : "");
      setExitPrice(editing.exitPrice != null ? String(editing.exitPrice) : "");
      setStopLoss(editing.stopLoss != null ? String(editing.stopLoss) : "");
      setTakeProfit(editing.takeProfit != null ? String(editing.takeProfit) : "");
      setLevelsOpen(editing.stopLoss != null || editing.takeProfit != null);
      setQuantity(editing.quantity != null ? String(editing.quantity) : "1");
      setChallengeId(editing.challengeId ?? settings.primaryChallengeId ?? challenges[0]?.id ?? "");

      // Restore preTradeChecklist into ruleStates if available
      const pFound = playbook.find((p) => p.id === editing.setupId);
      if (pFound) {
        const sRules = setupRules(pFound);
        const restored: Record<string, PlanRuleState> = {};
        const chk = editing.preTradeChecklist ?? [];
        for (let i = 0; i < sRules.length; i++) {
          const r = sRules[i];
          const match = chk.find((ci) => ci.label === (r.text || `Rule ${i + 1}`));
          restored[String(i)] = match ? (match.confirmed ? "ready" : "waiting") : "ready";
        }
        setRuleStates(restored);
      } else {
        setRuleStates({});
      }
    } else {
      setCreatedId(null);
      setDate(presetDate && presetDate <= todayKey() ? presetDate : todayKey());
      setPnl("");
      setInstrument(DEFAULT_INSTRUMENT);
      setDirection(null);
      setThoughts([{ id: "th-1", text: "" }]);
      setWatch([]);
      setMoreWatch(false);
      setDraw("");
      setSetupId(playbook[0]?.id ?? "");
      setPickingSetup(false);
      if (playbook[0]) {
        const pRules = setupRules(playbook[0]);
        const initStates: Record<string, PlanRuleState> = {};
        pRules.forEach((_, i) => {
          initStates[String(i)] = "ready";
        });
        setRuleStates(initStates);
      } else {
        setRuleStates({});
      }
      setNotes("");
      setImages([]);
      setCompareImage([]);
      setEntryTime(DEFAULT_TIME);
      setExitTime(DEFAULT_TIME);
      setEntryPrice("");
      setExitPrice("");
      setStopLoss("");
      setTakeProfit("");
      setLevelsOpen(false);
      setQuantity("1");
      setChallengeId(settings.primaryChallengeId ?? challenges[0]?.id ?? "");
      setMode("manual");
    }
    setEntryEdited(false);
    setShowPremature(false);
    imp.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, presetDate]);

  /* ---------------- Price & Timing calculations ---------------- */
  const pnlText = pnl.trim();
  const pnlNumber = pnlText === "" ? NaN : Number(pnlText);
  const pnlInvalid = pnlText !== "" && !Number.isFinite(pnlNumber);
  const manualReady = Number.isFinite(pnlNumber);
  const quantityValue = quantity.trim() === "" ? NaN : Number(quantity);
  const quantityOk = Number.isFinite(quantityValue) && quantityValue > 0;
  const stepQuantity = (delta: number) =>
    setQuantity((prev) => {
      const n = Number(prev);
      const base = Number.isFinite(n) ? n : 0;
      return String(Math.max(1, Math.round((base + delta) * 100) / 100));
    });

  const entryN = parsePrice(entryPrice);
  const exitN = parsePrice(exitPrice);
  const isLong = direction === "long";
  const movePts = entryN !== null && exitN !== null ? (isLong ? exitN - entryN : entryN - exitN) : null;
  const heldMin = entryTime && exitTime ? minutesBetween(entryTime, exitTime) : null;
  const stopN = parsePrice(stopLoss);
  const targetN = parsePrice(takeProfit);
  const riskPts = entryN !== null && stopN !== null ? Math.abs(entryN - stopN) : null;
  const rewardPts = entryN !== null && targetN !== null ? Math.abs(targetN - entryN) : null;

  // Real-time auto-calculated R:R multiples (no manual typing required)
  const plannedRr = riskPts && rewardPts && riskPts > 0 ? rewardPts / riskPts : null;
  const realizedRr = riskPts && movePts !== null && riskPts > 0 ? movePts / riskPts : null;
  const effectiveRr =
    realizedRr !== null
      ? Math.round(realizedRr * 100) / 100
      : plannedRr !== null
        ? Math.round(plannedRr * 100) / 100
        : editing?.rr ?? null;

  const levelNote = useMemo(() => {
    if (entryN === null) return null;
    if (stopN !== null && (isLong ? stopN >= entryN : stopN <= entryN)) {
      return isLong ? "Stop loss must be below the entry price." : "Stop loss must be above the entry price.";
    }
    if (targetN !== null && (isLong ? targetN <= entryN : targetN >= entryN)) {
      return isLong ? "Take profit must be above the entry price." : "Take profit must be below the entry price.";
    }
    return null;
  }, [entryN, stopN, targetN, isLong]);

  const levelStats = useMemo(
    () =>
      [
        riskPts !== null ? { k: "Risk", v: `${fmtPts(riskPts)} pts` } : null,
        rewardPts !== null ? { k: "Target", v: `${fmtPts(rewardPts)} pts` } : null,
        plannedRr !== null ? { k: "Planned R:R", v: `1:${fmtPts(plannedRr)}` } : null,
        realizedRr !== null
          ? {
              k: "Realized R",
              v: `${realizedRr > 0 ? "+" : ""}${fmtPts(realizedRr)}R`,
              tone: realizedRr > 0 ? ("profit" as const) : ("loss" as const),
            }
          : null,
      ].filter((x): x is { k: string; v: string; tone?: "profit" | "loss" } => x !== null),
    [riskPts, rewardPts, plannedRr, realizedRr],
  );

  const autoHoldDuration = heldMin !== null ? fmtHeld(heldMin) : (editing?.holdDuration ?? null);

  /* ---------------- Progressive Plan Trade reveal sequence ---------------- */
  const pnlSettle = useSettledReveal(pnl, direction !== null || Boolean(editing), open, 1, REVEAL_SETTLE_MS);
  const showDirection = Boolean(editing) || direction !== null || (pnlSettle.settled && manualReady);

  // Direction choice waits a beat (720ms) before smoothly revealing execution levels with no flash
  const showLevels = useDelayedFlag(direction !== null || Boolean(editing), open, editing ? 0 : REVEAL_LEVELS_DELAY_MS);

  // Sizing reveals smoothly with levels
  const showSizing = useDelayedFlag(showLevels, open, editing ? 0 : 200);

  const finalInstrument = instrument.trim().toUpperCase() || DEFAULT_INSTRUMENT;

  // Premature entry warning (<09:33 NY time)
  const premature = entryEdited && entryTime !== "" && entryTime < "09:33";
  useEffect(() => {
    if (premature && !editing) setShowPremature(true);
    else setShowPremature(false);
  }, [premature, editing]);

  const selectedPlaybookSetup = useMemo(() => playbook.find((p) => p.id === setupId), [playbook, setupId]);
  const currentRules = useMemo(() => setupRules(selectedPlaybookSetup), [selectedPlaybookSetup]);

  const confirmedRules = useMemo(
    () => currentRules.filter((_, i) => ruleStates[String(i)] === "ready").length,
    [currentRules, ruleStates],
  );
  const skippedRules = currentRules.length - confirmedRules;

  // Thoughts manipulation helpers
  const nonEmptyThoughts = useMemo(() => thoughts.map((t) => t.text.trim()).filter(Boolean), [thoughts]);
  const addThought = () => setThoughts((prev) => [...prev, { id: uid("th"), text: "" }]);
  const patchThought = (id: string, text: string) =>
    setThoughts((prev) => prev.map((t) => (t.id === id ? { ...t, text } : t)));
  const cycleThoughtKind = (id: string, current: ThoughtKind) =>
    setThoughts((prev) => prev.map((t) => (t.id === id ? { ...t, kind: NEXT_KIND[current] } : t)));
  const removeThought = (id: string) => setThoughts((prev) => prev.filter((t) => t.id !== id));

  const primaryWatchOptions = useMemo(
    () => MISTAKE_CATEGORIES.slice(0, 6).map((c) => ({ key: c.key, label: c.label })),
    [],
  );
  const extraWatchOptions = useMemo(
    () => MISTAKE_CATEGORIES.slice(6).map((c) => ({ key: c.key, label: c.label })),
    [],
  );

  const draftPlan: PlanDraft = useMemo(
    () => ({
      date: date || todayKey(),
      setupId: setupId || undefined,
      setupName: selectedPlaybookSetup?.name,
      instrument: finalInstrument,
      bias: direction === "long" ? "long" : direction === "short" ? "short" : "either",
      entryPrice: entryN ?? undefined,
      stopLoss: stopN ?? undefined,
      takeProfit: targetN ?? undefined,
      thesis: nonEmptyThoughts[0] || "",
      draw: draw.trim() || undefined,
      news: [],
      watch: watch.map((k) => MISTAKE_CATEGORIES.find((c) => c.key === k)?.label ?? k),
      confirmedRules: currentRules.filter((_, i) => ruleStates[String(i)] === "ready").map((r) => r.text || ""),
      skippedRules: currentRules.filter((_, i) => ruleStates[String(i)] !== "ready").map((r) => r.text || ""),
      ruleTotal: currentRules.length,
    }),
    [date, setupId, selectedPlaybookSetup?.name, finalInstrument, direction, entryN, stopN, targetN, nonEmptyThoughts, draw, watch, currentRules, ruleStates],
  );

  const buildDraft = (): EntryDraft => {
    const rules = setupRules(selectedPlaybookSetup);
    const preTradeChecklist = rules.length
      ? rules.map((r, i) => ({
          label: r.text || `Rule ${i + 1}`,
          description: r.description,
          confirmed: ruleStates[String(i)] === "ready",
        }))
      : undefined;

    const thoughtNotes = nonEmptyThoughts.join(" · ");
    const combinedNotes = notes.trim()
      ? (thoughtNotes ? `${thoughtNotes}\n\n${notes.trim()}` : notes.trim())
      : thoughtNotes || draw.trim() || "";

    return {
      date,
      pnl: pnlNumber,
      rr: effectiveRr,
      instrument: finalInstrument,
      direction,
      setup: selectedPlaybookSetup?.name || editing?.setup || "",
      setupId: setupId || undefined,
      notes: combinedNotes,
      images: images.map((i) => i.meta),
      compareImage: compareImage[0]?.meta,
      challengeId: challengeId || undefined,
      tradeNumber: editing?.tradeNumber ?? null,
      entryTime: entryTime || undefined,
      exitTime: exitTime || undefined,
      entryPrice: entryN,
      exitPrice: exitN,
      stopLoss: stopN,
      takeProfit: targetN,
      quantity: quantityValue,
      holdDuration: autoHoldDuration,
      preTradeChecklist,
    };
  };

  const saveTradeAndAdvance = async () => {
    if (saving) return;
    if (!date || date > todayKey() || Number.isNaN(pnlNumber)) {
      setStep("trade");
      setDir(-1);
      setSaveError("Check the trade details — something needs fixing.");
      return;
    }
    if (!entryTime.trim() || !exitTime.trim() || heldMin === null) {
      setStep("trade");
      setDir(-1);
      setSaveError(heldMin === null ? "Exit time must be at or after entry time." : "Enter both entry and exit times.");
      return;
    }
    if (levelNote) {
      setStep("trade");
      setDir(-1);
      setSaveError(levelNote);
      return;
    }

    setSaving(true);
    setSaveError(null);

    const draft = buildDraft();
    const blobs = new Map<string, Blob>();
    for (const item of images) if (item.blob) blobs.set(item.meta.id, item.blob);

    try {
      if (editing || createdId) {
        const idToUpdate = editing?.id ?? createdId!;
        await useApp.getState().updateEntry(idToUpdate, draft, blobs);
        go("chart");
      } else {
        const created = await useApp.getState().createEntry(draft, blobs);
        setCreatedId(created.id);
        go("chart");
      }
    } catch {
      setSaveError("Couldn't save trade — try again.");
    } finally {
      setSaving(false);
    }
  };

  const saveCharts = async () => {
    const live = createdId ? useApp.getState().entries.find((e) => e.id === createdId) : undefined;
    if (!live) {
      go("autopsy");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const blobs = new Map<string, Blob>();
      for (const item of images) if (item.blob) blobs.set(item.meta.id, item.blob);
      await useApp.getState().updateEntryFast(
        live.id,
        {
          date: live.date,
          pnl: live.pnl,
          rr: live.rr,
          instrument: live.instrument,
          direction: live.direction,
          setup: live.setup,
          setupId: live.setupId,
          notes: live.notes,
          images: images.map((i) => i.meta),
          compareImage: live.compareImage,
          challengeId: live.challengeId,
          tradeNumber: live.tradeNumber ?? null,
          entryTime: live.entryTime,
          exitTime: live.exitTime,
          entryPrice: live.entryPrice,
          exitPrice: live.exitPrice,
          stopLoss: live.stopLoss,
          takeProfit: live.takeProfit,
          quantity: live.quantity,
          preTradeChecklist: live.preTradeChecklist,
        },
        blobs,
      );
      go("autopsy");
    } catch {
      setSaveError("Couldn't save the chart — try again.");
    } finally {
      setSaving(false);
    }
  };

  const completeAutopsy = async () => {
    if (await autopsy.submit()) {
      go("done");
    }
  };

  const importing = mode === "import" && !editing;

  const gate: { ok: boolean; hint: string | null } = (() => {
    switch (step) {
      case "trade":
        if (importing) return imp.ready ? { ok: true, hint: imp.hint } : { ok: false, hint: imp.hint };
        if (!pnlText) return { ok: false, hint: "Enter the net P&L" };
        if (pnlInvalid) return { ok: false, hint: "Numbers only — negative for a loss" };
        if (!direction) return { ok: false, hint: "Choose long or short" };
        if (!entryTime.trim() || !exitTime.trim()) return { ok: false, hint: "Enter both entry and exit times" };
        if (heldMin === null) return { ok: false, hint: "Exit time must be at or after entry time" };
        if (levelNote) return { ok: false, hint: levelNote };
        if (!quantityOk) return { ok: false, hint: "Enter the quantity" };
        return { ok: true, hint: null };
      case "thought":
        return {
          ok: true,
          hint:
            nonEmptyThoughts.length > 0
              ? `${nonEmptyThoughts.length} ${nonEmptyThoughts.length === 1 ? "note" : "notes"} recorded`
              : "Write a thought or continue",
        };
      case "setup":
        if (!setupId) return { ok: false, hint: "Choose a setup" };
        return {
          ok: true,
          hint:
            skippedRules > 0
              ? `${skippedRules} rule${skippedRules === 1 ? "" : "s"} unchecked — recorded as-is`
              : "All setup rules confirmed",
        };
      case "chart":
        return images.length ? { ok: true, hint: null } : { ok: false, hint: "Add a chart, or skip for now" };
      case "autopsy":
        return autopsy.ready ? { ok: true, hint: null } : { ok: false, hint: autopsy.hint };
      default:
        return { ok: true, hint: null };
    }
  })();

  const onContinue = () => {
    if (!gate.ok || saving || (step === "autopsy" && autopsy.saving)) return;
    if (importing) {
      void imp.run();
      return;
    }
    if (step === "trade") {
      go("thought");
    } else if (step === "thought") {
      if (playbook.length > 0) go("setup");
      else void saveTradeAndAdvance();
    } else if (step === "setup") {
      void saveTradeAndAdvance();
    } else if (step === "chart") {
      void saveCharts();
    } else if (step === "autopsy") {
      void completeAutopsy();
    } else if (step === "done") {
      onClose();
    }
  };

  // Keyboard shortcut (⌘↵ / Ctrl↵) to advance smoothly
  const continueRef = useRef(onContinue);
  continueRef.current = onContinue;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        continueRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const continueLabel =
    step === "trade" || step === "thought"
      ? "Continue"
      : step === "setup"
      ? (editing ? "Save changes" : "Continue")
      : step === "chart"
      ? (editing ? "Save changes" : "Continue")
      : step === "autopsy"
      ? "Finish"
      : step === "done"
      ? "Done"
      : "Continue";

  const back =
    step === "trade" || step === "done"
      ? null
      : step === "thought"
      ? "trade"
      : step === "setup"
      ? "thought"
      : step === "chart"
      ? playbook.length > 0
        ? "setup"
        : "thought"
      : step === "autopsy"
      ? "chart"
      : prevStep(step);

  const RAIL_LABEL: Record<StepId, string> = {
    trade: "Trade & levels",
    thought: "Thoughts",
    setup: "Setup & rules",
    chart: "Chart",
    autopsy: "Autopsy",
    done: "Done",
  };

  // Desktop Step Rail
  const rail: Rail = {
    title: editing ? "Edit trade" : "Add trade",
    steps: order.filter((s) => s !== "done").map((id) => ({ id, label: RAIL_LABEL[id] })),
    current: step,
    aside: (
      <div className="space-y-2.5">
        <div>
          <p className="text-[14px] font-semibold tracking-[-0.01em] text-ink">{weekdayLong(date)}</p>
          <p className="mt-0.5 text-[12.5px] text-faint">{formatDateMedium(date)}</p>
        </div>
        <div
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-medium",
            isOffline ? "bg-gold/15 text-gold-deep dark:text-gold" : "bg-profit/12 text-profit",
          )}
          title={
            isOffline
              ? "Offline mode: your trades and charts are saved in browser cache and will sync when internet returns."
              : "Every trade is cached locally and synced with Google Drive."
          }
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", isOffline ? "animate-pulse bg-gold-strong" : "bg-profit")} aria-hidden />
          <span>{isOffline ? "Offline · Cached locally" : "Drive + local cache"}</span>
        </div>
        <div className="flex items-center justify-between border-t border-line-soft pt-2 text-[12px]">
          <span className="text-faint">Instrument</span>
          <span className="font-semibold text-ink">{finalInstrument}</span>
        </div>
        {Number.isFinite(pnlNumber) && (
          <div className="flex items-center justify-between border-t border-line-soft pt-2 text-[12px]">
            <span className="text-faint">Net P&amp;L</span>
            <span className={cn("font-semibold tabular-nums", pnlNumber > 0 ? "text-profit" : pnlNumber < 0 ? "text-loss" : "text-ink")}>
              {formatSignedMoney(pnlNumber, settings.currency)}
            </span>
          </div>
        )}
        {effectiveRr !== null && (
          <div className="flex items-center justify-between border-t border-line-soft pt-2 text-[12px]">
            <span className="text-faint">R multiple</span>
            <span className="font-semibold tabular-nums text-gold">{effectiveRr > 0 ? `+${effectiveRr}` : effectiveRr}R</span>
          </div>
        )}
        {autoHoldDuration && (
          <div className="flex items-center justify-between border-t border-line-soft pt-2 text-[12px]">
            <span className="text-faint">Hold time</span>
            <span className="font-semibold tabular-nums text-ink">{autoHoldDuration}</span>
          </div>
        )}
      </div>
    ),
  };

  const hintText = saveError ?? autopsy.error ?? gate.hint;
  const hintTone = saveError || autopsy.error ? "warn" : "muted";

  return (
    <Modal open={open} onClose={onClose} size={desktop ? "xl" : "md"} label={editing ? "Edit trade" : "Add trade"}>
      <SheetFrame
        rail={rail}
        onClose={onClose}
        onBack={back ? () => go(back) : undefined}
        hint={step === "done" ? null : <Hint text={hintText} tone={hintTone} />}
        actions={
          <>
            {step === "chart" && (
              <QuietButton disabled={saving} onClick={() => go("autopsy")}>
                Skip for now
              </QuietButton>
            )}
            <PrimaryButton
              shortcut
              disabled={!gate.ok}
              loading={saving || (step === "autopsy" && autopsy.saving)}
              onClick={onContinue}
            >
              {continueLabel}
            </PrimaryButton>
          </>
        }
      >
        <StepTransition stepKey={step} dir={dir}>
          {/* Step 1: The 1st step of Add Trade preserved EXACTLY as it was */}
          {step === "trade" && (
            <div className="space-y-8">
              <StepTitle
                title={editing ? "Edit trade" : "Log a trade"}
                subtitle={editing ? `${weekdayLong(editing.date)} · ${formatSignedMoney(editing.pnl)}` : `Logging ${finalInstrument}`}
              />

              {!editing && (
                <Segmented
                  value={mode}
                  onChange={(m) => {
                    setMode(m);
                    setSaveError(null);
                  }}
                  options={[
                    { id: "manual", label: "Manual" },
                    { id: "import", label: "Import CSV" },
                  ]}
                />
              )}

              {!importing && (
                <div>
                  {/* Quiet 2-column Day & Instrument bar preserved on top */}
                  <motion.div
                    initial={editing ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.36, ease: FLOW_SMOOTH }}
                    className="mb-5 grid grid-cols-1 divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-raised sm:grid-cols-2 sm:divide-x sm:divide-y-0"
                  >
                    {/* Day */}
                    <label
                      htmlFor="add-date"
                      className="group flex cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors hover:bg-ink/[0.02] focus-within:bg-gold/[0.03]"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] border border-line bg-surface text-gold shadow-[inset_0_1px_0_rgb(255_255_255/0.6)] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]">
                        <GlyphCalendar />
                      </span>
                      <div className="min-w-0 flex-1">
                        <span className="block text-[10.5px] font-medium uppercase tracking-[0.08em] text-faint">
                          Session day
                        </span>
                        <input
                          type="date"
                          id="add-date"
                          max={todayKey()}
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                          className="mt-0.5 w-full cursor-pointer border-0 bg-transparent p-0 text-[14px] font-semibold tracking-[-0.01em] text-ink tabular-nums !shadow-none !outline-none !ring-0"
                        />
                      </div>
                    </label>

                    {/* Instrument */}
                    <div
                      onClick={() => document.getElementById("add-instrument")?.focus()}
                      className="flex cursor-text items-center justify-between gap-2 px-4 py-3.5 transition-colors hover:bg-ink/[0.02] focus-within:bg-gold/[0.03]"
                    >
                      <div className="min-w-0 flex-1">
                        <label htmlFor="add-instrument" className="block text-[10.5px] font-medium uppercase tracking-[0.08em] text-faint">
                          Instrument
                        </label>
                        <input
                          id="add-instrument"
                          type="text"
                          value={instrument}
                          onChange={(e) => setInstrument(e.target.value.toUpperCase())}
                          placeholder={DEFAULT_INSTRUMENT}
                          className="mt-0.5 w-full border-0 bg-transparent p-0 text-[14px] font-semibold uppercase tracking-[0.02em] text-ink !shadow-none !outline-none !ring-0 placeholder:text-ink/80"
                        />
                      </div>
                      {suggestedInstruments.length > 1 && (
                        <div className="flex shrink-0 items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {suggestedInstruments
                            .filter((s) => s !== finalInstrument)
                            .slice(0, 3)
                            .map((symChoice) => (
                              <button
                                key={symChoice}
                                type="button"
                                onClick={() => {
                                  haptic.selection();
                                  setInstrument(symChoice);
                                }}
                                className="rounded-full border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-muted shadow-[inset_0_1px_0_rgb(255_255_255/0.6)] transition-all hover:border-line-strong hover:text-ink active:scale-95 dark:shadow-none"
                              >
                                {symChoice}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>
                  </motion.div>

                  {/* Hero Net P&L Card — exact geometry with fixed caret */}
                  <div
                    onClick={() => document.getElementById("add-pnl")?.focus()}
                    className="cursor-text rounded-[26px] border border-line bg-raised px-6 py-7 text-center transition-[border-color,box-shadow] duration-150 focus-within:border-gold/50 focus-within:ring-4 focus-within:ring-gold/10"
                  >
                    <label htmlFor="add-pnl" className="block text-[13px] font-medium text-muted">
                      Net P&amp;L
                    </label>
                    <div className="mt-3 flex items-baseline justify-center gap-1.5">
                      <span className="text-[28px] text-faint">{sym}</span>
                      <div className="relative inline-flex items-baseline">
                        <span
                          aria-hidden
                          className={cn(
                            "pointer-events-none select-none whitespace-pre text-[44px] font-semibold tracking-[-0.03em] tabular-nums",
                            pnl === "" ? "text-faint/60" : "invisible",
                          )}
                        >
                          {pnl || "0.00"}
                        </span>
                        <input
                          id="add-pnl"
                          autoFocus={!editing}
                          inputMode="decimal"
                          enterKeyHint="next"
                          autoComplete="off"
                          value={pnl}
                          onChange={(e) => setPnl(cleanNumber(e.target.value))}
                          aria-invalid={pnlInvalid || undefined}
                          className={cn(
                            "absolute inset-0 w-full border-0 bg-transparent p-0 text-left text-[44px] font-semibold tracking-[-0.03em] tabular-nums text-ink !shadow-none !outline-none !ring-0",
                            pnlNumber > 0 && "text-profit",
                            pnlNumber < 0 && "text-loss",
                            pnlInvalid && "text-loss",
                          )}
                        />
                      </div>
                    </div>
                    <p className="mt-2 min-h-5 text-[12.5px] text-faint">
                      {pnlInvalid ? <span className="text-loss">Numbers only — negative for a loss</span> : "Negative for a loss"}
                    </p>
                  </div>

                  {/* Direction Selection */}
                  <AnimatePresence initial={false}>
                    {showDirection && (
                      <Reveal glow key="add-direction" delay={0.08}>
                        <div className="space-y-3">
                          <Label done={direction !== null}>Direction</Label>
                          <BinaryChoice
                            value={direction === null ? null : direction === "long"}
                            onChange={(v) => {
                              haptic.selection();
                              setDirection(v ? "long" : "short");
                            }}
                            options={["Long", "Short"]}
                          />
                        </div>
                      </Reveal>
                    )}
                  </AnimatePresence>

                  {/* Entry & Exit — delayed (720ms) super-smooth de-blur entrance with zero flash */}
                  <AnimatePresence initial={false}>
                    {showLevels && (
                      <motion.div
                        key="add-levels-group"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{
                          height: { duration: 0.58, ease: FLOW_SMOOTH },
                          opacity: { duration: 0.42, delay: 0.08 },
                        }}
                        className="overflow-hidden"
                      >
                        <motion.div
                          initial={{ opacity: 0, y: 24, filter: "blur(14px)" }}
                          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                          transition={{
                            duration: 0.68,
                            ease: [0.16, 1, 0.3, 1],
                          }}
                          className="relative space-y-3 pt-7"
                        >
                          {/* Subtle Apple luminous shimmer sweep upon entrance */}
                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: [0, 0.45, 0] }}
                            transition={{ duration: 1.0, ease: "easeOut", delay: 0.1 }}
                            className="pointer-events-none absolute -inset-x-2 top-4 h-16 rounded-3xl bg-gradient-to-b from-gold/15 via-gold/5 to-transparent blur-md"
                            aria-hidden
                          />
                          <Label hint="price & time · optional" done={entryN !== null && exitN !== null}>
                            Entry &amp; exit
                          </Label>
                          <div className="grid grid-cols-2 gap-3">
                            <TicketCard
                              id="add-entry-price"
                              title="Entry"
                              tile="bg-gradient-to-b from-gold-strong to-gold-deep"
                              glyph={<GlyphArrowIn />}
                              price={entryPrice}
                              onPrice={(v) => setEntryPrice(cleanPrice(v))}
                              time={entryTime}
                              onTime={(v) => {
                                setEntryEdited(true);
                                setEntryTime(v);
                              }}
                              timeId="add-entry-time"
                            />
                            <TicketCard
                              id="add-exit-price"
                              title="Exit"
                              tile="bg-gradient-to-b from-[#8f99a8] to-[#667085]"
                              glyph={<GlyphArrowOut />}
                              price={exitPrice}
                              onPrice={(v) => setExitPrice(cleanPrice(v))}
                              time={exitTime}
                              onTime={setExitTime}
                              timeId="add-exit-time"
                              foot={
                                movePts !== null || heldMin !== null ? (
                                  <>
                                    {movePts !== null && (
                                      <span className={cn("font-medium", movePts > 0 && "text-profit", movePts < 0 && "text-loss")}>
                                        {movePts > 0 ? "+" : movePts < 0 ? "−" : ""}
                                        {fmtPts(Math.abs(movePts))} pts
                                      </span>
                                    )}
                                    {movePts !== null && heldMin !== null && " · "}
                                    {heldMin !== null && `held ${fmtHeld(heldMin)}`}
                                  </>
                                ) : undefined
                              }
                            />
                          </div>

                          <ForexFactoryFormProfile date={date} entryTime={entryTime} />

                          {/* Premature Entry Alert */}
                          <AnimatePresence initial={false}>
                            {showPremature && (
                              <motion.div
                                key="premature"
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                transition={FLOW_EXPAND}
                                className="overflow-hidden"
                                role="alert"
                              >
                                <p className="flex items-start gap-2.5 rounded-2xl border border-gold/40 bg-gold/[0.07] p-3 text-[12.5px] leading-relaxed text-ink">
                                  <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                                  <span>
                                    <strong className="text-gold">Premature entry (&lt;09:33).</strong> Efficiency comes from process-oriented patience, not impulsive execution.
                                  </span>
                                </p>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {/* Progressive Stop Loss & Take Profit disclosure */}
                          <AnimatePresence initial={false}>
                            {!levelsOpen && (
                              <Collapse key="add-sltp-btn">
                                <button
                                  type="button"
                                  onClick={() => {
                                    haptic.selection();
                                    setLevelsOpen(true);
                                  }}
                                  className="flex min-h-11 items-center gap-1.5 text-[15px] font-medium text-gold transition-opacity hover:opacity-80"
                                >
                                  <IconPlus /> Add stop loss &amp; take profit
                                </button>
                              </Collapse>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Stop Loss & Take Profit — exact TicketCards + StatStrip */}
                  <AnimatePresence initial={false}>
                    {showLevels && levelsOpen && (
                      <Reveal key="add-sltp">
                        <div className="space-y-3">
                          <Label hint="optional" done={stopN !== null && targetN !== null}>
                            Stop loss &amp; take profit
                          </Label>
                          <div className="grid grid-cols-2 gap-3">
                            <TicketCard
                              id="add-stop-loss"
                              title="Stop loss"
                              tile="bg-loss"
                              glyph={<GlyphStop />}
                              price={stopLoss}
                              onPrice={(v) => setStopLoss(cleanPrice(v))}
                              invalid={levelNote !== null && stopN !== null && entryN !== null && (isLong ? stopN >= entryN : stopN <= entryN)}
                              foot={riskPts !== null ? `${fmtPts(riskPts)} pts from entry` : ""}
                            />
                            <TicketCard
                              id="add-take-profit"
                              title="Take profit"
                              tile="bg-profit"
                              glyph={<GlyphTarget />}
                              price={takeProfit}
                              onPrice={(v) => setTakeProfit(cleanPrice(v))}
                              invalid={levelNote !== null && targetN !== null && entryN !== null && (isLong ? targetN <= entryN : targetN >= entryN)}
                              foot={rewardPts !== null ? `${fmtPts(rewardPts)} pts from entry` : ""}
                            />
                          </div>
                          <AnimatePresence initial={false}>
                            {levelNote && (
                              <Collapse key="add-level-note">
                                <p role="status" className="px-1 text-[13px] text-loss">
                                  {levelNote}
                                </p>
                              </Collapse>
                            )}
                          </AnimatePresence>
                          <AnimatePresence initial={false}>
                            {levelStats.length > 0 && (
                              <Collapse key="add-level-stats">
                                <StatStrip stats={levelStats} />
                              </Collapse>
                            )}
                          </AnimatePresence>
                        </div>
                      </Reveal>
                    )}
                  </AnimatePresence>

                  {/* Quantity — exact input & Stepper */}
                  <AnimatePresence initial={false}>
                    {showSizing && (
                      <Reveal key="add-sizing" delay={0.12}>
                        <div className="space-y-3">
                          <Label done={quantityOk} hint="contracts, shares or lots" htmlFor="add-qty">
                            Quantity
                          </Label>
                          <div className="flex items-center gap-3">
                            <div
                              onClick={() => document.getElementById("add-qty")?.focus()}
                              className="flex h-14 min-w-0 flex-1 cursor-text items-center rounded-2xl border border-line bg-raised px-5 transition-[border-color,box-shadow] duration-150 focus-within:border-gold/50 focus-within:ring-4 focus-within:ring-gold/10"
                            >
                              <input
                                id="add-qty"
                                inputMode="decimal"
                                enterKeyHint="done"
                                autoComplete="off"
                                value={quantity}
                                onChange={(e) => setQuantity(e.target.value.replace(/[^\d.]/g, ""))}
                                placeholder="1"
                                className="w-full min-w-0 border-0 bg-transparent p-0 text-[26px] font-semibold tracking-tight text-ink tabular-nums !shadow-none !outline-none !ring-0 placeholder:text-faint/60"
                              />
                            </div>
                            <Stepper label="Quantity" onStep={stepQuantity} canDecrement={!(quantityValue <= 1)} />
                          </div>
                        </div>
                      </Reveal>
                    )}
                  </AnimatePresence>
                </div>
              )}

              {importing && <ImportBody imp={imp} challenges={challenges} playbook={playbook} />}
            </div>
          )}

          {/* Step 2: Thoughts — copied directly from Step 2 of plan-trade-flow */}
          {step === "thought" && (
            <div className="space-y-6">
              <StepTitle
                title="Before you enter"
                subtitle="Note any thought or impulse."
              />

              {/* Apple-style thought list */}
              <div className="space-y-2.5 pt-7">
                <Label done={nonEmptyThoughts.length > 0}>Your mind right now</Label>

                <ul className="divide-y divide-line-soft overflow-hidden rounded-[22px] border border-line bg-raised shadow-panel">
                  <AnimatePresence initial={false}>
                    {thoughts.map((th, idx) => {
                      const vis = thoughtVisual(th.text, th.kind);
                      return (
                        <motion.li
                          key={th.id}
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={FLOW_EXPAND}
                          className="overflow-hidden"
                        >
                          <div className="flex gap-3 px-4 py-3.5 transition-colors focus-within:bg-gold/[0.04]">
                            <button
                              type="button"
                              onClick={() => cycleThoughtKind(th.id, vis.kind)}
                              title={`${vis.tag} — tap to change`}
                              className="mt-0.5 shrink-0 self-start rounded-[9px] outline-none transition-transform active:scale-90 focus-visible:ring-2 focus-visible:ring-gold-strong/50"
                            >
                              <IconTile tile={vis.tile}>{vis.glyph}</IconTile>
                            </button>
                            <div className="min-w-0 flex-1">
                              <ThoughtTextarea
                                autoFocus={idx === thoughts.length - 1}
                                aria-label={`Thought or impulse ${idx + 1}`}
                                value={th.text}
                                onChange={(e) => patchThought(th.id, e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey && th.text.trim()) {
                                    e.preventDefault();
                                    addThought();
                                  }
                                }}
                                placeholder={idx === 0 ? "Write a thought or impulse…" : "Another…"}
                                maxLength={280}
                              />
                            </div>
                            {thoughts.length > 1 && (
                              <button
                                type="button"
                                aria-label="Remove thought"
                                onClick={() => removeThought(th.id)}
                                className="mt-0.5 shrink-0 self-start rounded-lg p-1.5 text-faint/50 outline-none transition-all hover:bg-loss/10 hover:text-loss focus-visible:ring-2 focus-visible:ring-loss/30 active:scale-90"
                              >
                                <Sym name="trash" className="h-4 w-4" strokeWidth={1.8} />
                              </button>
                            )}
                          </div>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                  <li>
                    <button
                      type="button"
                      onClick={() => addThought()}
                      className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left text-[14.5px] font-medium text-gold transition-colors hover:bg-gold/[0.05]"
                    >
                      <IconPlus /> Add another
                    </button>
                  </li>
                </ul>
              </div>

              {/* Optional extras — tucked away, Apple-clean */}
              <div className="pt-6">
                <Disclosure
                  label="Add more"
                  defaultOpen={watch.length > 0 || draw.trim().length > 0}
                >
                  <div className="space-y-6 pt-1">
                    {/* Guard against */}
                    <div className="space-y-2.5">
                      <Label done={watch.length > 0}>Guard against</Label>
                      <div className="flex flex-wrap gap-2">
                        {primaryWatchOptions.map((o) => {
                          const isSelected = watch.includes(o.key);
                          return (
                            <Chip
                              key={o.key}
                              tone="gold"
                              selected={isSelected}
                              onClick={() => setWatch((w) => (w.includes(o.key) ? w.filter((k) => k !== o.key) : [...w, o.key]))}
                            >
                              <span>{o.label}</span>
                            </Chip>
                          );
                        })}
                        {moreWatch &&
                          extraWatchOptions.map((o) => {
                            const isSelected = watch.includes(o.key);
                            return (
                              <Chip
                                key={o.key}
                                tone="gold"
                                selected={isSelected}
                                onClick={() => setWatch((w) => (w.includes(o.key) ? w.filter((k) => k !== o.key) : [...w, o.key]))}
                              >
                                <span>{o.label}</span>
                              </Chip>
                            );
                          })}
                        {!moreWatch && extraWatchOptions.length > 0 && (
                          <Chip selected={false} onClick={() => setMoreWatch(true)}>
                            More…
                          </Chip>
                        )}
                      </div>
                    </div>

                    {/* Key level */}
                    <div className="space-y-2.5 border-t border-line-soft pt-5">
                      <Label htmlFor="flow-draw">Key level</Label>
                      <TextBox
                        id="flow-draw"
                        value={draw}
                        onChange={(e) => setDraw(e.target.value)}
                        placeholder="London low, 15m FVG…"
                      />
                    </div>
                  </div>
                </Disclosure>
              </div>
            </div>
          )}

          {/* Step 3: Setup & Rules — copied directly from Step 3 of plan-trade-flow */}
          {step === "setup" && (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <StepTitle
                    title={selectedPlaybookSetup ? selectedPlaybookSetup.name : "Pick your setup"}
                    subtitle={
                      selectedPlaybookSetup
                        ? `${confirmedRules} of ${currentRules.length} rules confirmed`
                        : "Select the playbook setup you are trading."
                    }
                  />
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  {playbook.length > 1 && selectedPlaybookSetup && !pickingSetup && (
                    <button
                      type="button"
                      onClick={() => setPickingSetup(true)}
                      className="rounded-full border border-line bg-raised px-3.5 py-1.5 text-[13px] font-medium text-muted transition-colors hover:border-line-strong hover:text-ink"
                    >
                      Change setup
                    </button>
                  )}
                  {selectedPlaybookSetup && !pickingSetup && (
                    <WinOddsRing draft={draftPlan} entries={entries} plans={plans} />
                  )}
                </div>
              </div>

              {(!selectedPlaybookSetup || pickingSetup) && (
                <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Setup">
                  {playbook.map((p) => {
                    const n = setupRules(p).length;
                    return (
                      <ChoiceCard
                        key={p.id}
                        selected={setupId === p.id}
                        title={p.name}
                        meta={`${n} ${n === 1 ? "rule" : "rules"}`}
                        onClick={() => {
                          setSetupId(p.id);
                          const pRules = setupRules(p);
                          const initStates: Record<string, PlanRuleState> = {};
                          pRules.forEach((_, i) => {
                            initStates[String(i)] = "ready";
                          });
                          setRuleStates(initStates);
                          setPickingSetup(false);
                        }}
                      />
                    );
                  })}
                </div>
              )}

              <AnimatePresence initial={false}>
                {selectedPlaybookSetup && currentRules.length > 0 && (
                  <Collapse key={selectedPlaybookSetup.id}>
                    <div className="space-y-2.5 pb-1">
                      <div className="h-[3px] overflow-hidden rounded-full bg-line-soft">
                        <div
                          className="h-full rounded-full bg-profit transition-[width] duration-300"
                          style={{ width: `${(confirmedRules / currentRules.length) * 100}%` }}
                        />
                      </div>
                      <div className="divide-y divide-line-soft overflow-hidden rounded-[22px] border border-line bg-raised shadow-panel">
                        {currentRules.map((r, i) => {
                          const checked = ruleStates[String(i)] === "ready";
                          const h = statFor(history, setupId, r.text || `Rule ${i + 1}`);
                          const keptPct = h && h.planned >= 3 ? Math.round(((h.planned - h.skipped) / h.planned) * 100) : null;
                          return (
                            <button
                              key={i}
                              type="button"
                              role="checkbox"
                              aria-checked={checked}
                              onClick={() => {
                                haptic.selection();
                                setRuleStates({ ...ruleStates, [String(i)]: checked ? "waiting" : "ready" });
                              }}
                              className={cn(
                                "flex w-full items-center justify-between gap-3.5 px-4 py-3.5 text-left transition-colors hover:bg-ink/[0.025] active:bg-ink/[0.05]",
                                checked && "bg-profit/[0.05]",
                              )}
                            >
                              <div className="flex min-w-0 items-center gap-3.5">
                                <span
                                  className={cn(
                                    "grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border transition-all duration-200",
                                    checked ? "border-profit bg-profit text-canvas" : "border-line-strong text-transparent",
                                  )}
                                >
                                  <IconCheck className="h-3 w-3" />
                                </span>
                                <span className="min-w-0">
                                  <span className={cn("block truncate text-[15px] font-medium", checked ? "text-ink" : "text-ink/90")}>
                                    {r.text || `Rule ${i + 1}`}
                                  </span>
                                  {r.description && <span className="block truncate text-[12.5px] text-muted">{r.description}</span>}
                                </span>
                              </div>
                              {keptPct !== null && (
                                <span className="shrink-0 rounded-full bg-ink/[0.05] px-2.5 py-0.5 text-[11.5px] font-medium tabular-nums text-faint">
                                  {keptPct}% kept
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </Collapse>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Step 4: Chart — copied directly from Step 5 of plan-trade-flow */}
          {step === "chart" && (
            <div className="space-y-8">
              <StepTitle
                title="Add your chart"
                subtitle="Up to two screenshots."
              />
              <ImageUploader items={images} onChange={setImages} max={2} />
            </div>
          )}

          {/* Step 5: Autopsy — copied directly from Step 6 of plan-trade-flow */}
          {step === "autopsy" && <AutopsyBody a={autopsy} onAddChart={() => go("chart")} />}

          {/* Step 6: Done — copied directly from Step 7 of plan-trade-flow */}
          {step === "done" && (
            <div className="flex min-h-[20rem] flex-col items-center justify-center text-center">
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 380, damping: 22 }}
                className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-b from-gold-strong to-gold-deep text-on-gold shadow-[0_12px_28px_-10px_var(--gold-strong)]"
              >
                <IconCheck className="h-7 w-7" />
              </motion.div>
              <h2 className="mt-7 text-[32px] font-semibold tracking-[-0.025em] text-ink">Logged.</h2>
              <p className="mt-2 max-w-[22rem] text-[15px] leading-snug text-muted">
                {isOffline
                  ? "Saved on this device. It syncs when you're back online."
                  : "Process noted — the outcome is just data."}
              </p>
              {autopsy.risk && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
                  className="mt-6 w-full max-w-[24rem] text-left"
                >
                  <RiskMeter risk={autopsy.risk} currency={settings.currency} label="Today vs your limit" />
                </motion.div>
              )}
              {createdId && (
                <button
                  type="button"
                  onClick={() => {
                    useUi.getState().openMinatoWithTrade(createdId);
                    onClose();
                  }}
                  className="mt-6 text-[14px] font-medium text-gold hover:underline"
                >
                  Talk it through with MINATO
                </button>
              )}
            </div>
          )}
        </StepTransition>
      </SheetFrame>
    </Modal>
  );
}

/* --------------------------- CSV Trade Import --------------------------- */

function useTradeImport({ onImported, onClose }: { onImported: (firstCreated: JournalEntry | null) => void; onClose: () => void }) {
  const settings = useApp((s) => s.settings);
  const challenges = useMemo(() => settings.challenges ?? [], [settings]);
  const playbook = useMemo(() => settings.playbook ?? [], [settings]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ReturnType<typeof import("@/lib/csv-import").parseTradesCsv> | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState("");
  const [newChallengeName, setNewChallengeName] = useState("");
  const [challengePicked, setChallengePicked] = useState(false);
  const [setupId, setSetupId] = useState("");
  const [setupPicked, setSetupPicked] = useState(false);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setFileName(null);
    setParsed(null);
    setFileError(null);
    setChallengeId("");
    setNewChallengeName("");
    setChallengePicked(false);
    setSetupId("");
    setSetupPicked(false);
    setSaving(false);
  };

  const loadFile = async (file: File) => {
    setFileError(null);
    if (!/\.(csv|txt|tsv)$/i.test(file.name) && !file.type.includes("csv") && !file.type.includes("text")) {
      setFileError("Please choose a .csv file (or a plain-text export).");
      return;
    }
    try {
      const text = await file.text();
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const { parseTradesCsv } = await import("@/lib/csv-import");
      const result = parseTradesCsv(text);
      if (result.error) {
        setFileError(result.error);
        setParsed(null);
        setFileName(null);
        return;
      }
      setFileName(file.name);
      setParsed(result);
      if (result.rows.length === 0 && result.invalid.length === 0) setFileError("No rows found in that file.");
    } catch {
      setFileError("Could not read that file — try re-exporting it.");
    }
  };

  const rows = parsed?.rows ?? [];
  const invalid = parsed?.invalid ?? [];
  const netPnl = rows.reduce((s, r) => s + r.pnl, 0);
  const needsSetup = playbook.length > 0;
  const ready = rows.length > 0 && challengePicked && (!needsSetup || setupPicked);
  const hint =
    !parsed
      ? "Choose a file to import"
      : rows.length === 0
      ? "No valid rows to import"
      : !challengePicked
      ? "Which challenge do these belong to?"
      : needsSetup && !setupPicked
      ? "Tag the trades with a setup, or none"
      : null;

  const pickChallenge = (id: string) => {
    setChallengeId(id);
    setNewChallengeName("");
    setChallengePicked(true);
  };
  const typeChallenge = (v: string) => {
    setNewChallengeName(v);
    setChallengeId("");
    if (v.trim()) setChallengePicked(true);
  };
  const pickSetup = (id: string) => {
    setSetupId(id);
    setSetupPicked(true);
  };

  const run = async () => {
    if (rows.length === 0 || saving) return;
    setSaving(true);
    let effectiveChallengeId = challengeId;
    try {
      if (newChallengeName.trim()) {
        const id = `ch-${Date.now().toString(36)}`;
        await useApp.getState().saveChallenge({
          id,
          name: newChallengeName.trim(),
          startingBalance: null,
          targetBalance: null,
          createdAt: Date.now(),
        });
        effectiveChallengeId = id;
      }
      const linkedSetup = playbook.find((p) => p.id === setupId);
      const drafts = rows.map((row) => ({
        date: row.date,
        pnl: row.pnl,
        rr: row.rr,
        instrument: resolveInstrument(row.instrument, row.date),
        direction: row.direction,
        setup: row.setup || linkedSetup?.name || "",
        setupId: row.setup ? undefined : linkedSetup?.id,
        notes: row.notes,
        entryTime: row.entryTime ?? undefined,
        exitTime: row.exitTime ?? undefined,
        entryPrice: row.entryPrice,
        exitPrice: row.exitPrice,
        quantity: row.quantity,
        holdDuration: row.holdDuration,
        images: [] as JournalEntry["images"],
        challengeId: effectiveChallengeId || undefined,
        reviewStatus: "not_reviewed" as const,
      }));

      const created = await useApp.getState().createEntries(drafts);
      const ok = created.length;
      if (ok === 0) {
        toast.error("Import failed", "None of the trades could be saved. Please try again.");
      } else {
        toast.success(
          `Imported ${ok} ${ok === 1 ? "trade" : "trades"}`,
          `${formatDateMedium(rows[0].date)} → ${formatDateMedium(rows[rows.length - 1].date)} · ${formatSignedMoney(netPnl)} — review required.`,
        );
        onClose();
        onImported(created[0] ?? null);
      }
    } catch (err) {
      toast.error("Import failed", err instanceof Error ? err.message : "An unexpected error occurred. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return {
    fileName,
    parsed,
    fileError,
    rows,
    invalid,
    netPnl,
    challengeId,
    newChallengeName,
    challengePicked,
    setupId,
    setupPicked,
    saving,
    ready,
    hint,
    loadFile,
    reset,
    run,
    pickChallenge,
    typeChallenge,
    pickSetup,
  };
}

type ImportState = ReturnType<typeof useTradeImport>;

function ImportBody({
  imp,
  challenges,
  playbook,
}: {
  imp: ImportState;
  challenges: { id: string; name: string }[];
  playbook: { id: string; name: string }[];
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { rows, invalid } = imp;
  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.txt,.tsv,text/csv,text/plain"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void imp.loadFile(f);
          e.target.value = "";
        }}
      />
      {!imp.parsed ? (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center gap-1.5 rounded-[26px] border border-dashed border-line-strong bg-raised px-6 py-12 transition-colors hover:border-gold/60"
          >
            <span className="text-[16px] font-semibold text-ink">Choose a CSV</span>
            <span className="text-[13px] text-muted">Broker or spreadsheet export</span>
          </button>
          {imp.fileError && <p role="alert" className="px-1 text-[13px] text-loss">{imp.fileError}</p>}
        </>
      ) : (
        <div>
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-[14px] text-ink">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-profit/15 text-profit">
                <IconCheck className="h-3 w-3" />
              </span>
              {rows.length} {rows.length === 1 ? "trade" : "trades"} ready
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="ml-auto text-[13px] font-medium text-gold hover:underline"
              >
                Change file
              </button>
            </p>
            {rows.length > 0 && (
              <ul className="divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-raised">
                {rows.slice(0, 4).map((r) => (
                  <li key={r.line} className="flex items-center justify-between px-4 py-2.5 text-[14px]">
                    <span className="text-muted">
                      {r.date} · <span className="text-ink">{r.instrument}</span>
                    </span>
                    <span className={cn("tabular-nums font-semibold", r.pnl > 0 ? "text-profit" : r.pnl < 0 ? "text-loss" : "text-muted")}>
                      {formatSignedMoney(r.pnl)}
                    </span>
                  </li>
                ))}
                {rows.length > 4 && <li className="px-4 py-2.5 text-[13px] text-faint">+{rows.length - 4} more</li>}
              </ul>
            )}
            {invalid.length > 0 && (
              <Disclosure label={`${invalid.length} ${invalid.length === 1 ? "row" : "rows"} can't be imported`}>
                <ul className="max-h-32 space-y-1 overflow-y-auto text-[13px] text-muted">
                  {invalid.map((r) => (
                    <li key={r.line} className="flex items-baseline gap-2">
                      <span className="shrink-0 text-faint">line {r.line}</span>
                      <span className="text-loss">{r.reason}</span>
                    </li>
                  ))}
                </ul>
              </Disclosure>
            )}
          </div>

          {rows.length > 0 && (
            <Reveal>
              <div className="space-y-3 pt-3">
                <Label done={imp.challengePicked}>Which challenge do these belong to?</Label>
                <Stagger className="flex flex-wrap gap-2" delay={0.08}>
                  {challenges.map((c) => (
                    <Chip key={c.id} selected={imp.challengePicked && imp.challengeId === c.id} onClick={() => imp.pickChallenge(c.id)}>
                      {c.name}
                    </Chip>
                  ))}
                  <Chip
                    selected={imp.challengePicked && imp.challengeId === "" && imp.newChallengeName.trim() === ""}
                    onClick={() => imp.pickChallenge("")}
                  >
                    No challenge
                  </Chip>
                </Stagger>
                <TextBox
                  aria-label="New challenge name"
                  placeholder="Or create one — e.g. March $25K Challenge"
                  value={imp.newChallengeName}
                  onChange={(e) => imp.typeChallenge(e.target.value)}
                />
              </div>
            </Reveal>
          )}

          {rows.length > 0 && imp.challengePicked && playbook.length > 0 && (
            <Reveal>
              <div className="space-y-3 pt-3">
                <Label done={imp.setupPicked} hint="rows that already name a setup keep it">
                  Tag with a setup
                </Label>
                <Stagger className="flex flex-wrap gap-2" delay={0.08}>
                  {playbook.map((p) => (
                    <Chip key={p.id} selected={imp.setupPicked && imp.setupId === p.id} onClick={() => imp.pickSetup(p.id)}>
                      {p.name}
                    </Chip>
                  ))}
                  <Chip selected={imp.setupPicked && imp.setupId === ""} onClick={() => imp.pickSetup("")}>
                    No setup
                  </Chip>
                </Stagger>
              </div>
            </Reveal>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Minimal Apple HIG pill strip for Major-Impact news.
 * Hidden completely when there is no high-impact news on that date.
 */
function ForexFactoryFormProfile({ date, entryTime }: { date: string; entryTime?: string }) {
  const ff = useForexFactoryNews(date, Boolean(date));
  const nearby = useMemo(
    () => (entryTime ? findNearbyMajorNews(entryTime, ff.events, 15) : null),
    [entryTime, ff.events],
  );

  if (ff.loading || !ff.hasMajorNews) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-1">
      {ff.events.map((ev) => {
        const isNear = nearby?.id === ev.id;
        return (
          <span
            key={ev.id}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium leading-none transition-colors",
              isNear
                ? "bg-loss/14 text-loss ring-1 ring-inset ring-loss/35"
                : "bg-ink/[0.045] text-ink",
            )}
          >
            <span className="h-1.5 w-1.5 rounded-full bg-loss" aria-hidden />
            <span>{ev.name}</span>
            <span className={cn("text-[11.5px] tabular-nums", isNear ? "text-loss" : "text-muted")}>
              {ev.time}
            </span>
          </span>
        );
      })}
    </div>
  );
}
