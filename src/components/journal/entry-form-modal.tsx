"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { setupRules, type JournalEntry, type TradeDirection } from "@/lib/types";
import { currencySymbol, formatDateMedium, formatSignedMoney, todayKey, weekdayLong } from "@/lib/format";
import { useApp, persistFailedSince, type EntryDraft } from "@/lib/store";
import { useUi } from "@/lib/ui-store";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Field, TextArea, TextInput } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ImageUploader, type UploadItem } from "./image-uploader";
import { TradeReviewFlow } from "./trade-review-flow";
import { cn } from "@/lib/utils";
import { AlertTriangleIcon, CheckIcon } from "@/components/ui/icons";
import {
  BinaryChoice, ChoiceCard, Chip, Collapse, Disclosure, FLOW_EXPAND, GlyphArrowIn, GlyphArrowOut, GlyphTimer, Hint, IconCheck, IconTile, Label, PrimaryButton, Reveal, Segmented,
  SheetFrame, Stagger, Stepper, StepTitle, StepTransition, TextBlock, TextBox,
} from "./flow-ui";

/** New trades start at the NY open; change it if the trade was at another time. */
const DEFAULT_TIME = "09:30";

const INSTRUMENT_SUGGESTIONS = [
  "NQ", "ES", "MES", "MNQ", "EURUSD", "GBPUSD", "USDJPY", "BTCUSD", "ETHUSD",
  "XAUUSD", "CL", "SPY", "QQQ", "AAPL", "TSLA", "NVDA",
];

/** trade → timing → setup (only with a playbook) → challenge → chart. Each stage advances with Continue. */
type StepId = "trade" | "timing" | "setup" | "challenge" | "chart";

// Same helpers as Plan Trade (kept local so this file has no dependency on plan-trade-flow.tsx).
const cleanNumber = (v: string) => v.replace(/[^\d.\-−]/g, "").replace("−", "-");

/** One row of the inset-grouped time list: icon tile, label, native time input; tap anywhere to edit. */
function TimeRow({ id, label, value, onChange, tile, icon }: { id: string; label: string; value: string; onChange: (v: string) => void; tile: string; icon: React.ReactNode }) {
  const ref = useRef<HTMLInputElement>(null);
  const open = (e: React.MouseEvent) => {
    const el = ref.current;
    if (!el || e.target === el) return;
    el.focus();
    try { el.showPicker?.(); } catch { /* picker needs a user gesture; focus is enough */ }
  };
  return (
    <div onClick={open} className="flex min-h-14 cursor-pointer items-center gap-3 px-4 transition-colors hover:bg-ink/[0.03] active:bg-ink/[0.06]">
      <IconTile tile={tile}>{icon}</IconTile>
      <label htmlFor={id} className="flex-1 text-[17px] text-ink">{label}</label>
      <div className="flex items-center gap-2.5">
        {value && (
          <button
            type="button"
            aria-label={`Clear ${label.toLowerCase()} time`}
            onClick={(e) => { e.stopPropagation(); onChange(""); }}
            className="grid h-5 w-5 place-items-center rounded-full bg-ink/[0.1] text-muted transition-colors hover:bg-ink/[0.18] hover:text-ink"
          >
            <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><path d="M3 3l6 6M9 3l-6 6" /></svg>
          </button>
        )}
        <input
          ref={ref}
          id={id}
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={cn("w-[7.25rem] border-0 bg-transparent p-0 text-right font-mono text-[17px] !shadow-none !outline-none !ring-0", value ? "text-ink" : "text-faint")}
        />
      </div>
    </div>
  );
}

const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/[^\d.\-−]/g, "").replace("−", "-")));

/**
 * ADD TRADE — the same calm, one-question-at-a-time ritual as Plan Trade.
 *
 *   trade (progressive questions) → chart → save
 *
 * Only the next unanswered question appears; answered ones stay put. Nothing is
 * persisted until the final step, so the save path is identical to the old form
 * (one createEntry / updateEntry call, images included).
 *
 * Also used for editing: every question is already answered, so all of them show.
 */
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
  const entries = useApp((s) => s.entries);
  const settings = useApp((s) => s.settings);
  const challenges = useMemo(() => settings.challenges ?? [], [settings]);
  const playbook = useMemo(() => settings.playbook ?? [], [settings]);
  const sym = currencySymbol(settings.currency);

  const open = openProp ?? globalOpen;
  const onClose = onCloseProp ?? closeGlobal;
  const editing = entryProp ?? null;

  const [step, setStep] = useState<StepId>("trade");
  const [dir, setDir] = useState<1 | -1>(1);
  const [mode, setMode] = useState<"manual" | "import">("manual");

  const [date, setDate] = useState(todayKey());
  const [pnl, setPnl] = useState("");
  const [rr, setRr] = useState("");
  const [instrument, setInstrument] = useState("");
  const [direction, setDirection] = useState<TradeDirection | null>(null);
  const [setupId, setSetupId] = useState("");
  const [setup, setSetup] = useState("");
  const [notes, setNotes] = useState("");
  const [images, setImages] = useState<UploadItem[]>([]);
  const [compareImage, setCompareImage] = useState<UploadItem[]>([]);
  const [entryTime, setEntryTime] = useState("");
  const [exitTime, setExitTime] = useState("");
  const [entryPrice, setEntryPrice] = useState("");
  const [exitPrice, setExitPrice] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [holdDuration, setHoldDuration] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [newChallengeName, setNewChallengeName] = useState("");
  const [tradeNumber, setTradeNumber] = useState<1 | 2>(1);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reflecting, setReflecting] = useState<JournalEntry | null>(null);

  // Latches: once a question has been answered it stays on screen, even if the answer is edited or cleared.
  const [pnlDone, setPnlDone] = useState(false);
  const [setupPicked, setSetupPicked] = useState(false);
  const [timesDone, setTimesDone] = useState(false);
  const [entryEdited, setEntryEdited] = useState(false); // the user changed the entry time (not just the 09:30 default)
  const [holdDone, setHoldDone] = useState(false);
  const [challengePicked, setChallengePicked] = useState(false);
  const [creatingChallenge, setCreatingChallenge] = useState(false);

  // Guard-rail state
  const [showPremature, setShowPremature] = useState(false);
  const [showPostLossGate, setShowPostLossGate] = useState<JournalEntry | null>(null);

  const imp = useTradeImport({ onImported: (first) => { onClose(); setReflecting(first); }, onClose });

  // Optional suggestions for Instrument: MNQ first, then recently used ones (same as Plan Trade).
  const suggestedInstruments = useMemo(() => {
    const seen: string[] = ["MNQ"];
    for (const e of [...entries].sort((a, b) => b.createdAt - a.createdAt)) {
      const i = e.instrument?.trim().toUpperCase();
      if (i && i !== "—" && !seen.includes(i)) seen.push(i);
      if (seen.length === 4) break;
    }
    return seen;
  }, [entries]);

  // A legacy/custom setup name stays selectable even when it isn't in the playbook.
  const legacySetup = editing?.setup && !playbook.some((p) => p.id === editing.setupId) ? editing.setup : "";
  const setupVisible = playbook.length > 0 || !!legacySetup;

  const order: StepId[] = useMemo(() => {
    const o: StepId[] = ["trade", "timing"];
    if (setupVisible) o.push("setup");
    o.push("challenge", "chart");
    return o;
  }, [setupVisible]);
  const go = (to: StepId) => {
    setDir(order.indexOf(to) >= order.indexOf(step) ? 1 : -1);
    setSaveError(null);
    setStep(to);
  };
  const prevStep = (st: StepId): StepId | null => { const i = order.indexOf(st); return i > 0 ? order[i - 1]! : null; };
  const nextStep = (st: StepId): StepId => order[Math.min(order.length - 1, order.indexOf(st) + 1)]!;

  // Hydrate/reset each time the dialog opens. Reads the latest settings imperatively so an unrelated
  // settings update never re-runs this effect and wipes the user's in-progress answers.
  useEffect(() => {
    if (!open) return;
    setStep("trade");
    setDir(1);
    setSaveError(null);
    if (editing) {
      setDate(editing.date);
      setPnl(String(editing.pnl));
      setRr(editing.rr != null ? String(editing.rr) : "");
      setInstrument(editing.instrument === "—" ? "" : editing.instrument);
      setDirection(editing.direction);
      setSetupId(editing.setupId ?? "");
      setSetup(editing.setup);
      setNotes(editing.notes);
      setImages(editing.images.map((m) => ({ meta: m, blob: null })));
      setCompareImage(editing.compareImage ? [{ meta: editing.compareImage, blob: null }] : []);
      setEntryTime(editing.entryTime ?? "");
      setExitTime(editing.exitTime ?? "");
      setEntryPrice(editing.entryPrice != null ? String(editing.entryPrice) : "");
      setExitPrice(editing.exitPrice != null ? String(editing.exitPrice) : "");
      setStopLoss(editing.stopLoss != null ? String(editing.stopLoss) : "");
      setTakeProfit(editing.takeProfit != null ? String(editing.takeProfit) : "");
      setQuantity(editing.quantity != null ? String(editing.quantity) : "");
      setHoldDuration(editing.holdDuration ?? "");
      setChallengeId(editing.challengeId ?? "");
      setTradeNumber(editing.tradeNumber ?? 1);
      setPnlDone(true);
      setSetupPicked(true);
      setTimesDone(true);
      setHoldDone(true);
      setChallengePicked(true);
    } else {
      setDate(presetDate && presetDate <= todayKey() ? presetDate : todayKey());
      setPnl("");
      setRr("");
      setInstrument("");
      setDirection(null);
      setSetupId("");
      setSetup("");
      setNotes("");
      setImages([]);
      setCompareImage([]);
      setEntryTime(DEFAULT_TIME);
      setExitTime(DEFAULT_TIME);
      setEntryPrice("");
      setExitPrice("");
      setStopLoss("");
      setTakeProfit("");
      setQuantity("1");
      setHoldDuration("");
      setChallengeId("");
      setTradeNumber(1);
      setMode("manual");
      setPnlDone(false);
      setSetupPicked(false);
      setTimesDone(false);
      setHoldDone(false);
      setChallengePicked(false);
    }
    setCreatingChallenge(false);
    setEntryEdited(false);
    setNewChallengeName("");
    setReflecting(null);
    setShowPremature(false);
    setShowPostLossGate(null);
    imp.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, presetDate]);

  /* ---------------- answers, gating + quiet hints ---------------- */
  const pnlText = pnl.trim();
  const pnlNumber = pnlText === "" ? NaN : Number(pnlText);
  const pnlInvalid = pnlText !== "" && !Number.isFinite(pnlNumber);
  const manualReady = Number.isFinite(pnlNumber);
  const rrNumber = rr.trim() === "" ? null : Number(rr);
  const rrInvalid = rrNumber !== null && !Number.isFinite(rrNumber);
  const quantityValue = quantity.trim() === "" ? NaN : Number(quantity);
  const quantityOk = Number.isFinite(quantityValue) && quantityValue > 0;
  // Functional update so press-and-hold repeats never read stale state.
  const stepQuantity = (delta: number) => setQuantity((prev) => { const n = Number(prev); const base = Number.isFinite(n) ? n : 0; return String(Math.max(1, Math.round((base + delta) * 100) / 100)); });

  // Latch: once P&L has been entered, Direction stays revealed even if the field is edited again.
  useEffect(() => { if (manualReady) setPnlDone(true); }, [manualReady]);
  useEffect(() => { if (entryTime && exitTime) setTimesDone(true); }, [entryTime, exitTime]);
  useEffect(() => { if (holdDuration.trim()) setHoldDone(true); }, [holdDuration]);

  // Question reveal (same pattern as Plan Trade): only the next unanswered question appears.
  // When editing, every answer already exists, so everything is shown.
  const showDirection = !!editing || pnlDone || direction !== null;
  // Timing stage: times first, then hold duration, then quantity — each appears once the one before is answered.
  const showHold = !!editing || timesDone;
  const showQty = !!editing || holdDone;

  // A helpful default for hold duration, derived from the two times (only when exit is after entry).
  const suggestedHold = useMemo(() => {
    if (!entryTime || !exitTime) return "";
    const [h1, m1] = entryTime.split(":").map(Number);
    const [h2, m2] = exitTime.split(":").map(Number);
    const d = (h2! * 60 + m2!) - (h1! * 60 + m1!);
    if (!Number.isFinite(d) || d <= 0) return "";
    return d < 60 ? `${d} min` : `${Math.floor(d / 60)}h${d % 60 ? ` ${d % 60}m` : ""}`;
  }, [entryTime, exitTime]);

  const pickSetup = (id: string) => {
    const found = playbook.find((p) => p.id === id);
    setSetupId(found?.id ?? "");
    setSetup(found?.name ?? "");
    setSetupPicked(true);
  };
  const keepLegacySetup = () => { setSetupId(""); setSetup(legacySetup); setSetupPicked(true); };
  const clearSetup = () => { setSetupId(""); setSetup(""); setSetupPicked(true); };
  const pickChallenge = (id: string) => { setChallengeId(id); setNewChallengeName(""); setCreatingChallenge(false); setChallengePicked(true); };
  const startCreatingChallenge = () => { setChallengeId(""); setCreatingChallenge(true); setChallengePicked(true); };

  // Premature entry: before 9:33 AM NY trading time
  const premature = entryEdited && entryTime !== "" && entryTime < "09:33";
  useEffect(() => {
    if (premature && !editing) setShowPremature(true);
    else setShowPremature(false);
  }, [premature, editing]);

  const importing = mode === "import" && !editing;

  // Entry/exit time, hold duration and quantity are mandatory. Older entries that never had them stay editable.
  const missingOk = (v: unknown) => !!editing && (v === undefined || v === null || v === "");

  const gate: { ok: boolean; hint: string | null } = (() => {
    if (step === "chart") return { ok: true, hint: images.length ? null : "Screenshots are optional" };
    if (importing) return { ok: imp.ready, hint: imp.hint };
    switch (step) {
      case "trade":
        if (!date) return { ok: false, hint: "Pick a trading day (see Add details)" };
        if (date > todayKey()) return { ok: false, hint: "That day hasn't happened yet" };
        if (!pnlText) return { ok: false, hint: "Enter the net P&L" };
        if (pnlInvalid) return { ok: false, hint: "Numbers only — negative for a loss" };
        if (!editing && !direction) return { ok: false, hint: "Choose long or short" };
        if (rrInvalid) return { ok: false, hint: "R multiple should be a number like 2.5 (see Add details)" };
        return { ok: true, hint: null };
      case "timing":
        if (!entryTime && !missingOk(editing?.entryTime)) return { ok: false, hint: "Set the entry time" };
        if (!exitTime && !missingOk(editing?.exitTime)) return { ok: false, hint: "Set the exit time" };
        if (!holdDuration.trim() && !missingOk(editing?.holdDuration)) return { ok: false, hint: "How long did you hold it?" };
        if (!quantityOk && !(quantity.trim() === "" && missingOk(editing?.quantity))) return { ok: false, hint: "Enter the quantity" };
        return { ok: true, hint: null };
      case "setup":
        return setupPicked ? { ok: true, hint: null } : { ok: false, hint: "Choose a setup, or no setup" };
      case "challenge":
        if (creatingChallenge) return newChallengeName.trim() ? { ok: true, hint: null } : { ok: false, hint: "Name the new challenge" };
        return challengePicked ? { ok: true, hint: null } : { ok: false, hint: "Choose where this trade is saved" };
      default:
        return { ok: true, hint: null };
    }
  })();

  /* ---------------- persistence (unchanged semantics) ---------------- */
  const buildDraft = (): EntryDraft => ({
    date,
    pnl: Math.round(pnlNumber * 100) / 100,
    rr: rrNumber,
    instrument: instrument.trim() || "—",
    direction,
    setup: setup.trim(),
    setupId: setupId || undefined,
    notes: notes.trim(),
    images: images.map((i) => i.meta),
    compareImage: compareImage[0]?.meta,
    challengeId: challengeId || undefined,
    tradeNumber,
    entryTime: entryTime || undefined,
    exitTime: exitTime || undefined,
    entryPrice: num(entryPrice),
    exitPrice: num(exitPrice),
    stopLoss: num(stopLoss),
    takeProfit: num(takeProfit),
    quantity: num(quantity),
    holdDuration: holdDuration.trim() || null,
  });

  const submit = async () => {
    if (saving) return;
    // Defensive re-check: the gate already blocks these, but never save a malformed trade.
    if (!date || date > todayKey() || Number.isNaN(pnlNumber) || rrInvalid) {
      setStep("trade");
      setDir(-1);
      setSaveError("Check the trade details — something needs fixing.");
      return;
    }

    setSaveError(null);

    // Create a new challenge inline when requested
    let effectiveChallengeId = challengeId;
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

    const draft = buildDraft();
    draft.challengeId = effectiveChallengeId || undefined;
    const blobs = new Map<string, Blob>();
    for (const item of [...images, ...compareImage]) if (item.blob) blobs.set(item.meta.id, item.blob);

    setSaving(true);
    try {
      if (editing) {
        const t0 = Date.now();
        await useApp.getState().updateEntry(editing.id, draft, blobs);
        if (!persistFailedSince(t0)) toast.success("Entry updated");
        onClose();
      } else {
        const t0 = Date.now();
        const created = await useApp.getState().createEntry(draft, blobs);
        if (!persistFailedSince(t0)) {
          toast.success(
            draft.pnl > 0 ? "Green day logged" : draft.pnl < 0 ? "Red day logged" : "Session logged",
            "Your dashboard and roadmap just updated.",
          );
        }
        onClose();
        if (created.pnl < 0) {
          // Post-loss gate — capture the internal dialogue before anything else.
          setShowPostLossGate(created);
        } else {
          setReflecting(created);
        }
      }
    } catch (err) {
      const imageFailed = err instanceof Error && err.message.startsWith("drive_image_write_failed");
      toast.error(
        imageFailed ? "Screenshot upload failed" : "Could not save the entry",
        imageFailed ? "Your entry wasn't saved. Check your connection and try again." : "Please try again.",
      );
    } finally {
      setSaving(false);
    }
  };

  const onContinue = () => {
    if (!gate.ok || saving || imp.saving) return;
    if (importing) void imp.run();
    else if (step === "chart") void submit();
    else go(nextStep(step));
  };

  const continueLabel =
    step === "chart" ? (editing ? "Save changes" : "Add to journal")
    : importing ? (imp.rows.length > 0 ? `Import ${imp.rows.length} ${imp.rows.length === 1 ? "trade" : "trades"}` : "Import")
    : "Continue";

  return (
    <>
      <Modal open={open} onClose={onClose} size="md" label={editing ? "Edit journal entry" : "Add a trade"}>
        <SheetFrame
          onClose={onClose}
          onBack={!importing && prevStep(step) ? () => go(prevStep(step)!) : undefined}
          hint={<Hint text={saveError ?? gate.hint} tone={saveError ? "warn" : "muted"} />}
          actions={
            <>
              <PrimaryButton disabled={!gate.ok} loading={saving || imp.saving} onClick={onContinue}>{continueLabel}</PrimaryButton>
            </>
          }
        >
          <StepTransition stepKey={step} dir={dir}>
            {step === "trade" && (
              <div className="space-y-8">
                <StepTitle
                  title={editing ? "Edit entry" : "Log a trade"}
                  subtitle={editing ? `${weekdayLong(editing.date)} · ${formatSignedMoney(editing.pnl)}` : "Capture the session while it's fresh."}
                />
                {!editing && <Segmented value={mode} onChange={(m) => { setMode(m); setSaveError(null); }} options={[{ id: "manual", label: "Manual" }, { id: "import", label: "Import CSV" }]} />}

                {!importing && (
                  // No space-y here: each revealed question carries its own lead-in spacing, so gaps are even.
                  <div>
                    {/* The whole card is the input: tap anywhere to type. */}
                    <div
                      onClick={() => document.getElementById("add-pnl")?.focus()}
                      className="cursor-text rounded-[26px] border border-line bg-raised px-6 py-7 text-center transition-[border-color,box-shadow] duration-150 focus-within:border-gold/50 focus-within:ring-4 focus-within:ring-gold/10"
                    >
                      <Label htmlFor="add-pnl">Net P&amp;L</Label>
                      <div className="mt-3 flex items-baseline justify-center gap-1.5">
                        <span className="text-[28px] text-faint">{sym}</span>
                        <input
                          id="add-pnl"
                          autoFocus={!editing}
                          inputMode="decimal"
                          enterKeyHint="next"
                          autoComplete="off"
                          value={pnl}
                          onChange={(e) => setPnl(cleanNumber(e.target.value))}
                          placeholder="0.00"
                          aria-invalid={pnlInvalid || undefined}
                          style={{ width: `${Math.max(pnl.length, 4)}ch` }}
                          className={cn("max-w-full border-0 bg-transparent p-0 text-center font-mono text-[44px] tracking-tight !shadow-none !outline-none !ring-0 placeholder:text-faint/60", pnlNumber > 0 && "text-profit", pnlNumber < 0 && "text-loss", pnlInvalid && "text-loss")}
                        />
                      </div>
                      <p className="mt-2 min-h-5 text-[12.5px] text-faint">{pnlInvalid ? <span className="text-loss">Numbers only — negative for a loss</span> : "Negative for a loss"}</p>
                    </div>

                    {showDirection && (
                      <Reveal>
                        <div className="space-y-3">
                          <Label done={direction !== null}>Direction</Label>
                          <BinaryChoice value={direction === null ? null : direction === "long"} onChange={(v) => setDirection(v ? "long" : "short")} options={["Long", "Short"]} />
                        </div>
                      </Reveal>
                    )}

                    <div className="pt-7">
                      <Disclosure label="Add details">
                        <div className="space-y-2.5">
                          <Label hint="optional" htmlFor="add-instrument">Instrument</Label>
                          <TextBox id="add-instrument" list="add-instrument-list" value={instrument} onChange={(e) => setInstrument(e.target.value.toUpperCase())} placeholder="MNQ" className="max-w-[12rem] font-mono" />
                          <datalist id="add-instrument-list">{INSTRUMENT_SUGGESTIONS.map((s) => <option key={s} value={s} />)}</datalist>
                          <Stagger className="flex flex-wrap gap-2" delay={0.05}>
                            {suggestedInstruments.map((i) => <Chip key={i} selected={instrument === i} onClick={() => setInstrument(instrument === i ? "" : i)}>{i}</Chip>)}
                          </Stagger>
                        </div>
                        <div className="space-y-2.5">
                          <Label hint="what did the market teach you?" htmlFor="add-notes">Notes</Label>
                          <TextBlock id="add-notes" maxLength={4000} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What was the plan? What actually happened? What will you do differently?" />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2.5"><Label htmlFor="add-date">Day</Label><TextBox id="add-date" type="date" max={todayKey()} value={date} onChange={(e) => setDate(e.target.value)} /></div>
                          <div className="space-y-2.5"><Label htmlFor="add-rr" hint="optional">R multiple</Label><TextBox id="add-rr" inputMode="decimal" placeholder="2.5" value={rr} onChange={(e) => setRr(cleanNumber(e.target.value))} className="font-mono" /></div>
                          <div className="space-y-2.5"><Label htmlFor="add-entry-price" hint="optional">Entry price</Label><TextBox id="add-entry-price" inputMode="decimal" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value.replace(/[^\d.]/g, ""))} className="font-mono" /></div>
                          <div className="space-y-2.5"><Label htmlFor="add-exit-price" hint="optional">Exit price</Label><TextBox id="add-exit-price" inputMode="decimal" value={exitPrice} onChange={(e) => setExitPrice(e.target.value.replace(/[^\d.]/g, ""))} className="font-mono" /></div>
                          <div className="space-y-2.5"><Label htmlFor="add-stop" hint="optional">Stop loss</Label><TextBox id="add-stop" inputMode="decimal" value={stopLoss} onChange={(e) => setStopLoss(e.target.value.replace(/[^\d.]/g, ""))} className="font-mono" /></div>
                          <div className="space-y-2.5"><Label htmlFor="add-tp" hint="optional">Take profit</Label><TextBox id="add-tp" inputMode="decimal" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value.replace(/[^\d.]/g, ""))} className="font-mono" /></div>
                        </div>
                        <div className="space-y-2.5">
                          <Label hint="max 2 per day">Planned trade number</Label>
                          <div className="flex flex-wrap gap-2">
                            <Chip selected={tradeNumber === 1} onClick={() => setTradeNumber(1)}>Trade #1</Chip>
                            <Chip selected={tradeNumber === 2} onClick={() => setTradeNumber(2)}>Trade #2 · requires 7/7</Chip>
                          </div>
                        </div>
                      </Disclosure>
                    </div>
                  </div>
                )}

                {importing && <ImportBody imp={imp} challenges={challenges} playbook={playbook} />}
              </div>
            )}

            {step === "timing" && (
              // No space-y here: each revealed question carries its own lead-in spacing, so gaps stay even.
              <div>
                <StepTitle title="When did you trade?" subtitle="Entry, exit and size — all needed to review it properly." />
                <div className="space-y-3 pt-7">
                  <Label done={entryTime !== "" && exitTime !== ""}>Entry &amp; exit time</Label>
                  <div className="divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-raised shadow-rest">
                    <TimeRow id="add-in" label="Entry" value={entryTime} onChange={(v) => { setEntryEdited(true); setEntryTime(v); }} tile="bg-info" icon={<GlyphArrowIn />} />
                    <TimeRow id="add-out" label="Exit" value={exitTime} onChange={setExitTime} tile="bg-gold-strong" icon={<GlyphArrowOut />} />
                  </div>
                  <AnimatePresence initial={false}>
                    {showPremature && (
                      <motion.div key="premature" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={FLOW_EXPAND} className="overflow-hidden" role="alert">
                        <p className="flex items-start gap-2.5 rounded-2xl border border-gold/40 bg-gold/[0.07] p-4 text-[13px] leading-relaxed text-ink">
                          <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                          <span>
                            <strong className="text-gold">Premature entry.</strong> Efficiency comes from process-oriented patience, not impulsive execution. Are you acting out of urgency or conviction? If all checklist criteria are not confirmed, stay out.
                          </span>
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {showHold && (
                  <Reveal focus={!editing}>
                    <div className="space-y-3">
                      <Label done={holdDuration.trim() !== ""} htmlFor="add-hold">Hold duration</Label>
                      <div onClick={() => document.getElementById("add-hold")?.focus()} className="flex h-14 cursor-text items-center gap-3 rounded-2xl border border-line bg-raised px-4 shadow-rest transition-[border-color,box-shadow] duration-150 focus-within:border-gold/50 focus-within:ring-4 focus-within:ring-gold/10">
                        <IconTile tile="bg-profit"><GlyphTimer /></IconTile>
                        <input
                          id="add-hold"
                          autoComplete="off"
                          enterKeyHint="next"
                          maxLength={40}
                          value={holdDuration}
                          onChange={(e) => setHoldDuration(e.target.value)}
                          placeholder="e.g. 16 seconds"
                          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[17px] text-ink !shadow-none !outline-none !ring-0 placeholder:text-faint"
                        />
                      </div>
                      {suggestedHold && holdDuration.trim() === "" && (
                        <Stagger className="flex flex-wrap gap-2" delay={0.05}>
                          <Chip selected={false} onClick={() => setHoldDuration(suggestedHold)}>Use {suggestedHold}</Chip>
                        </Stagger>
                      )}
                    </div>
                  </Reveal>
                )}

                {showQty && (
                  <Reveal>
                    <div className="space-y-3">
                      <Label done={quantityOk} hint="contracts, shares or lots" htmlFor="add-qty">Quantity</Label>
                      {/* Apple HIG: the stepper (two-segment control) sits next to the field that shows the value. */}
                      <div className="flex items-center gap-3">
                        <div onClick={() => document.getElementById("add-qty")?.focus()} className="flex h-14 min-w-0 flex-1 cursor-text items-center rounded-2xl border border-line bg-raised px-5 shadow-rest transition-[border-color,box-shadow] duration-150 focus-within:border-gold/50 focus-within:ring-4 focus-within:ring-gold/10">
                          <input
                            id="add-qty"
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
              </div>
            )}

            {step === "setup" && (
              <div className="space-y-8">
                <StepTitle title="Which setup?" subtitle="The playbook setup you traded." />
                <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Setup">
                  {playbook.map((p) => {
                    const n = setupRules(p).length;
                    return <ChoiceCard key={p.id} selected={setupPicked && setupId === p.id} title={p.name} meta={`${n} ${n === 1 ? "rule" : "rules"}`} onClick={() => pickSetup(p.id)} />;
                  })}
                  {legacySetup && <ChoiceCard selected={setupPicked && !setupId && setup === legacySetup} title={`Keep “${legacySetup}”`} meta="Not in your playbook" onClick={keepLegacySetup} />}
                  <ChoiceCard selected={setupPicked && !setupId && !setup} title="No setup" onClick={clearSetup} />
                </div>
              </div>
            )}

            {step === "challenge" && (
              <div className="space-y-8">
                <StepTitle title="Which challenge?" subtitle="Choose where this trade is saved." />
                <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Challenge">
                  {challenges.map((c) => (
                    <ChoiceCard key={c.id} selected={challengePicked && !creatingChallenge && challengeId === c.id} title={c.name} meta={c.id === settings.primaryChallengeId ? "Primary challenge" : undefined} onClick={() => pickChallenge(c.id)} />
                  ))}
                  <ChoiceCard selected={challengePicked && !creatingChallenge && challengeId === ""} title="No challenge" meta="Keep it unassigned" onClick={() => pickChallenge("")} />
                  <ChoiceCard selected={creatingChallenge} title="New challenge" meta="Create one now" onClick={startCreatingChallenge} />
                </div>
                <AnimatePresence initial={false}>
                  {creatingChallenge && (
                    <Collapse key="new-challenge">
                      <div className="space-y-2.5 p-1 pt-0">
                        <Label done={newChallengeName.trim() !== ""} htmlFor="add-new-challenge">Challenge name</Label>
                        <TextBox id="add-new-challenge" autoFocus value={newChallengeName} onChange={(e) => setNewChallengeName(e.target.value)} placeholder="e.g. March $25K Challenge" maxLength={80} />
                      </div>
                    </Collapse>
                  )}
                </AnimatePresence>
              </div>
            )}

            {step === "chart" && (
              <div className="space-y-8">
                <StepTitle title="Add your charts" subtitle="Up to two screenshots — entry, setup, execution or exit." />
                <ImageUploader items={images} onChange={setImages} />
                <Disclosure label="Add a compare chart" defaultOpen={compareImage.length > 0}>
                  <div className="space-y-2.5">
                    <Label hint="a related-symbol chart for side-by-side review">Compare chart</Label>
                    <ImageUploader items={compareImage} onChange={setCompareImage} max={1} />
                  </div>
                </Disclosure>
              </div>
            )}
          </StepTransition>
        </SheetFrame>
      </Modal>

      {/* Post-loss gate — capture the internal dialogue */}
      <PostLossGate
        entry={showPostLossGate}
        onClose={() => setShowPostLossGate(null)}
        onContinue={(entry) => {
          setShowPostLossGate(null);
          setReflecting(entry);
        }}
      />

      {/* Post-save reflection — lives outside the form modal so it survives its close */}
      <TradeReviewFlow open={!!reflecting} entry={reflecting} onClose={() => setReflecting(null)} />
    </>
  );
}

/* --------------------------- post-loss gate --------------------------- */

function PostLossGate({
  entry,
  onClose,
  onContinue,
}: {
  entry: JournalEntry | null;
  onClose: () => void;
  onContinue: (entry: JournalEntry) => void;
}) {
  const [emotionalState, setEmotionalState] = useState("");
  const [thoughts, setThoughts] = useState("");
  const [fomo, setFomo] = useState<boolean | null>(null);
  const [revenge, setRevenge] = useState<boolean | null>(null);
  const [urgency, setUrgency] = useState<boolean | null>(null);
  const [nextAction, setNextAction] = useState("");

  useEffect(() => {
    if (entry) {
      setEmotionalState(entry.review?.postLossGate?.emotionalState ?? "");
      setThoughts("");
      setFomo(null);
      setRevenge(null);
      setUrgency(null);
      setNextAction("");
    }
  }, [entry]);

  if (!entry) return null;

  const save = async () => {
    await useApp.getState().saveTradeReview(entry.id, {
      review: {
        postLossGate: {
          emotionalState: emotionalState.trim() || undefined,
          immediateThoughts: thoughts.trim() || undefined,
          fomo,
          revenge,
          urgency,
          intendedNextAction: nextAction.trim() || undefined,
          acknowledgedAt: Date.now(),
        },
      },
    });
    onContinue(entry);
  };

  return (
    <Modal open onClose={() => onClose()} size="md" label="Post-loss review gate">
      <div className="px-6 py-6 sm:px-8">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-gold/30 bg-gold/[0.08] text-gold">
            <AlertTriangleIcon className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-display text-xl font-semibold tracking-[-0.02em] text-ink">Stop.</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              Log your immediate internal dialogue and impulse before taking any further action.
              Did FOMO or revenge dictate this entry?
            </p>
          </div>
        </div>

        <div className="mt-5 space-y-4">
          <Field label="Emotional state right now" htmlFor="plg-emotion">
            <TextInput id="plg-emotion" placeholder="e.g. frustrated, anxious, numb…" value={emotionalState} onChange={(e) => setEmotionalState(e.target.value)} />
          </Field>
          <Field label="Immediate thoughts" htmlFor="plg-thoughts">
            <TextArea id="plg-thoughts" className="min-h-16" placeholder="What is the internal dialogue saying?" value={thoughts} onChange={(e) => setThoughts(e.target.value)} />
          </Field>
          <div className="grid gap-2 sm:grid-cols-3">
            {([
              ["FOMO?", fomo, setFomo],
              ["Revenge?", revenge, setRevenge],
              ["Urgency?", urgency, setUrgency],
            ] as const).map(([label, value, setter]) => (
              <div key={label} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-raised/60 px-3 py-2">
                <span className="text-[13px] text-muted">{label}</span>
                <div className="flex gap-1">
                  {([["Yes", true], ["No", false]] as const).map(([l, v]) => (
                    <button
                      key={l}
                      type="button"
                      aria-pressed={value === v}
                      onClick={() => setter(v)}
                      className={cn(
                        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                        value === v
                          ? v ? "bg-profit/[0.14] text-profit" : "bg-loss/[0.12] text-loss"
                          : "text-faint hover:text-muted",
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <Field label="Intended next action" htmlFor="plg-next">
            <TextInput id="plg-next" placeholder="e.g. close platform, review tomorrow's plan…" value={nextAction} onChange={(e) => setNextAction(e.target.value)} />
          </Field>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2.5 border-t border-line pt-4">
          <Button variant="ghost" size="sm" onClick={onClose}>Skip for now</Button>
          <Button variant="gold" size="sm" onClick={() => void save()}>
            <CheckIcon className="h-4 w-4" />
            Save &amp; continue to review
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* ------------------------------ CSV import ------------------------------ */

/**
 * Import state lives in a hook (same shape as useAutopsy) so the shared SheetFrame footer can drive it:
 * the sheet's primary button is "Import N trades". Parsing + createEntries logic is unchanged.
 */
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
    setFileName(null); setParsed(null); setFileError(null);
    setChallengeId(""); setNewChallengeName(""); setChallengePicked(false);
    setSetupId(""); setSetupPicked(false); setSaving(false);
  };

  const loadFile = async (file: File) => {
    setFileError(null);
    if (!/\.(csv|txt|tsv)$/i.test(file.name) && !file.type.includes("csv") && !file.type.includes("text")) {
      setFileError("Please choose a .csv file (or a plain-text export).");
      return;
    }
    try {
      const text = await file.text();
      // Let the picker visibly respond before parsing a large export.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const { parseTradesCsv } = await import("@/lib/csv-import");
      const result = parseTradesCsv(text);
      if (result.error) { setFileError(result.error); setParsed(null); setFileName(null); return; }
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
    !parsed ? "Choose a file to import"
    : rows.length === 0 ? "No valid rows to import"
    : !challengePicked ? "Which challenge do these belong to?"
    : needsSetup && !setupPicked ? "Tag the trades with a setup, or none"
    : null;

  const pickChallenge = (id: string) => { setChallengeId(id); setNewChallengeName(""); setChallengePicked(true); };
  const typeChallenge = (v: string) => { setNewChallengeName(v); setChallengeId(""); if (v.trim()) setChallengePicked(true); };
  const pickSetup = (id: string) => { setSetupId(id); setSetupPicked(true); };

  const run = async () => {
    if (rows.length === 0 || saving) return;
    setSaving(true);
    let effectiveChallengeId = challengeId;
    try {
      if (newChallengeName.trim()) {
        const id = `ch-${Date.now().toString(36)}`;
        await useApp.getState().saveChallenge({
          id, name: newChallengeName.trim(), startingBalance: null, targetBalance: null, createdAt: Date.now(),
        });
        effectiveChallengeId = id;
      }
      const linkedSetup = playbook.find((p) => p.id === setupId);
      const drafts = rows.map((row) => ({
        date: row.date,
        pnl: row.pnl,
        rr: row.rr,
        instrument: row.instrument,
        direction: row.direction,
        // Row-level setup text wins; otherwise the selected playbook setup applies to all.
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

      // createEntries performs one state update and one persistence operation;
      // repeatedly syncing 25-row chunks made the import flow feel frozen.
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

  return { fileName, parsed, fileError, rows, invalid, netPnl, challengeId, newChallengeName, challengePicked, setupId, setupPicked, saving, ready, hint, loadFile, reset, run, pickChallenge, typeChallenge, pickSetup };
}

type ImportState = ReturnType<typeof useTradeImport>;

function ImportBody({ imp, challenges, playbook }: { imp: ImportState; challenges: { id: string; name: string }[]; playbook: { id: string; name: string }[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { rows, invalid } = imp;
  return (
    <div className="space-y-4">
      <input ref={inputRef} type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void imp.loadFile(f); e.target.value = ""; }} />
      {!imp.parsed ? (
        <>
          <button type="button" onClick={() => inputRef.current?.click()} className="flex w-full flex-col items-center gap-1.5 rounded-[26px] border border-dashed border-line-strong bg-raised px-6 py-12 transition-colors hover:border-gold/60">
            <span className="text-[16px] font-semibold text-ink">Choose a CSV</span>
            <span className="text-[13px] text-muted">Broker or spreadsheet export</span>
          </button>
          {imp.fileError && <p role="alert" className="px-1 text-[13px] text-loss">{imp.fileError}</p>}
        </>
      ) : (
        <div>
          <div className="space-y-3">
            <p className="flex items-center gap-2 text-[14px] text-ink">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-profit/15 text-profit"><IconCheck className="h-3 w-3" /></span>
              {rows.length} {rows.length === 1 ? "trade" : "trades"} ready
              <button type="button" onClick={() => inputRef.current?.click()} className="ml-auto text-[13px] font-medium text-gold hover:underline">Change file</button>
            </p>
            {rows.length > 0 && (
              <ul className="divide-y divide-line-soft overflow-hidden rounded-2xl border border-line bg-raised">
                {rows.slice(0, 4).map((r) => (
                  <li key={r.line} className="flex items-center justify-between px-4 py-2.5 text-[14px]">
                    <span className="text-muted">{r.date} · <span className="text-ink">{r.instrument}</span></span>
                    <span className={cn("font-mono tabular-nums", r.pnl > 0 ? "text-profit" : r.pnl < 0 ? "text-loss" : "text-muted")}>{formatSignedMoney(r.pnl)}</span>
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
                      <span className="shrink-0 font-mono text-faint">line {r.line}</span>
                      <span className="text-loss">{r.reason}</span>
                    </li>
                  ))}
                </ul>
              </Disclosure>
            )}
          </div>

          {rows.length > 0 && (
            <Reveal>
              <div className="space-y-3">
                <Label done={imp.challengePicked}>Which challenge do these belong to?</Label>
                <Stagger className="flex flex-wrap gap-2" delay={0.08}>
                  {challenges.map((c) => <Chip key={c.id} selected={imp.challengePicked && imp.challengeId === c.id} onClick={() => imp.pickChallenge(c.id)}>{c.name}</Chip>)}
                  <Chip selected={imp.challengePicked && imp.challengeId === "" && imp.newChallengeName.trim() === ""} onClick={() => imp.pickChallenge("")}>No challenge</Chip>
                </Stagger>
                <TextBox aria-label="New challenge name" placeholder="Or create one — e.g. March $25K Challenge" value={imp.newChallengeName} onChange={(e) => imp.typeChallenge(e.target.value)} />
              </div>
            </Reveal>
          )}

          {rows.length > 0 && imp.challengePicked && playbook.length > 0 && (
            <Reveal>
              <div className="space-y-3">
                <Label done={imp.setupPicked} hint="rows that already name a setup keep it">Tag with a setup</Label>
                <Stagger className="flex flex-wrap gap-2" delay={0.08}>
                  {playbook.map((p) => <Chip key={p.id} selected={imp.setupPicked && imp.setupId === p.id} onClick={() => imp.pickSetup(p.id)}>{p.name}</Chip>)}
                  <Chip selected={imp.setupPicked && imp.setupId === ""} onClick={() => imp.pickSetup("")}>No setup</Chip>
                </Stagger>
              </div>
            </Reveal>
          )}
        </div>
      )}
    </div>
  );
}
