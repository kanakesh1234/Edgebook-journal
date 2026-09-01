"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useApp } from "@/lib/store";
import { PLAN_EMOTIONS, setupRules, type PlaybookRule, type TradeDirection, type TradePlan, type PlanRuleState, type JournalEntry } from "@/lib/types";
import { todayKey } from "@/lib/format";
import { detectPatterns, matchPlanToPatterns } from "@/lib/minato/patterns";
import { Button } from "@/components/ui/button";
import { Field, TextArea, TextInput } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { MinatoAvatar, MinatoBubble } from "@/components/ai/minato-visual";
import { ImageUploader, type UploadItem } from "./image-uploader";
import { TradeReviewFlow } from "./trade-review-flow";
import { cn, uid } from "@/lib/utils";
import { EASE } from "@/components/landing/reveal";
import { PencilIcon, UploadIcon } from "@/components/ui/icons";

/**
 * PLAN TRADE — the complete guided trade lifecycle, in fixed order:
 *
 *   PRE-SESSION → SETUP SELECTION → RULE CHECKLIST →
 *   PRE-TRADE ANALYSIS (execution gate) → MANUAL ENTRY / IMPORT →
 *   SCREENSHOTS → AUTOPSY
 *
 * The pre-trade execution checklist is a GATE: it must be explicitly
 * confirmed BEFORE the trade is recorded — never after.
 */
const STAGES = [
  "Pre-session",
  "Setup",
  "Rules",
  "Pre-trade analysis",
  "Record trade",
  "Screenshots",
  "Autopsy",
] as const;

/** Stage indices — the checklist MUST precede manual entry/import. */
export const PLAN_STAGE = {
  PRE_SESSION: 0,
  SETUP: 1,
  RULES: 2,
  PRE_TRADE_ANALYSIS: 3,
  RECORD: 4,
  SCREENSHOTS: 5,
  AUTOPSY: 6,
} as const;

export function PlanTradeFlow({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const entries = useApp((s) => s.entries);
  const settings = useApp((s) => s.settings);
  const playbook = settings.playbook ?? [];
  const challenges = settings.challenges ?? [];

  const [step, setStep] = useState(0);

  // ── Stage 0: pre-session ──
  const [date, setDate] = useState(todayKey());
  const [challengeId, setChallengeId] = useState("");
  const [instrument, setInstrument] = useState("");
  const [bias, setBias] = useState<"long" | "short" | "either">("either");
  const [preSessionProcess, setPreSessionProcess] = useState("");
  const [thesis, setThesis] = useState("");
  const [drawOnLiquidity, setDrawOnLiquidity] = useState("");
  const [drawLevel, setDrawLevel] = useState("");
  const [liquidityObservations, setLiquidityObservations] = useState("");
  const [importantLevels, setImportantLevels] = useState("");
  const [mustHappenBeforeEntry, setMustHappenBeforeEntry] = useState("");
  const [invalidation, setInvalidation] = useState("");
  const [expectedTarget, setExpectedTarget] = useState("");
  const [emotionalState, setEmotionalState] = useState<(typeof PLAN_EMOTIONS)[number] | "">("");
  const [emotionalNote, setEmotionalNote] = useState("");
  const [whatCouldBreakPlan, setWhatCouldBreakPlan] = useState("");
  const [entryTimePlanned, setEntryTimePlanned] = useState("");

  // ── Stage 1: setup selection ──
  const [playbookId, setPlaybookId] = useState("");

  // ── Stage 2: rule checklist ──
  const [ruleStates, setRuleStates] = useState<Record<string, PlanRuleState>>({});

  // ── Stage 3: pre-trade analysis / execution checklist (the gate) ──
  const [executionItems, setExecutionItems] = useState<{ label: string; description?: string; confirmed: boolean }[]>([]);
  const [finalConfirm, setFinalConfirm] = useState(false);

  // ── Stage 3: manual entry / import ──
  const [entryMode, setEntryMode] = useState<"choose" | "manual" | "import">("choose");
  const [tradeDate, setTradeDate] = useState(todayKey());
  const [pnl, setPnl] = useState("");
  const [rr, setRr] = useState("");
  const [dirInstrument, setDirInstrument] = useState("");
  const [direction, setDirection] = useState<TradeDirection | null>(null);
  const [entryTime, setEntryTime] = useState("");
  const [exitTime, setExitTime] = useState("");
  const [createdEntry, setCreatedEntry] = useState<JournalEntry | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const [importRows, setImportRows] = useState<{ date: string; pnl: number; rr: number | null; instrument: string; direction: TradeDirection | null; setup: string; notes: string; entryTime: string | null }[] | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  // ── Stage 4: screenshots ──
  const [images, setImages] = useState<UploadItem[]>([]);

  // ── Stage 5: autopsy ──
  const [autopsyEntry, setAutopsyEntry] = useState<JournalEntry | null>(null);

  const [saving, setSaving] = useState(false);

  const selectedPlaybook = playbook.find((p) => p.id === playbookId);
  const selectedRules: PlaybookRule[] = useMemo(() => setupRules(selectedPlaybook), [selectedPlaybook]);
  const allRulesConfirmed =
    selectedRules.length === 0 || selectedRules.every((_, i) => (ruleStates[String(i)] ?? "waiting") === "ready");

  useEffect(() => {
    if (!open) return;
    setDate(todayKey()); setTradeDate(todayKey());
    setChallengeId(useApp.getState().settings.primaryChallengeId ?? challenges[0]?.id ?? "");
    setPlaybookId(playbook[0]?.id ?? "");
    setInstrument(""); setBias("either"); setPreSessionProcess(""); setThesis("");
    setDrawOnLiquidity(""); setDrawLevel(""); setLiquidityObservations(""); setImportantLevels("");
    setMustHappenBeforeEntry(""); setInvalidation(""); setExpectedTarget("");
    setEmotionalState(""); setEmotionalNote(""); setWhatCouldBreakPlan(""); setEntryTimePlanned("");
    setRuleStates({}); setStep(0);
    setExecutionItems([]); setFinalConfirm(false);
    setEntryMode("choose"); setPnl(""); setRr(""); setDirInstrument(""); setDirection(null);
    setEntryTime(""); setExitTime(""); setCreatedEntry(null);
    setImportRows(null); setImportError(null); setImages([]); setAutopsyEntry(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const patterns = useMemo(() => detectPatterns(entries), [entries]);
  const planText = `${thesis} ${drawOnLiquidity} ${mustHappenBeforeEntry} ${whatCouldBreakPlan}`;
  const planMatch = useMemo(() => matchPlanToPatterns(planText, patterns), [planText, patterns]);

  // Per-stage gating — the pre-trade execution gate MUST pass before recording
  const allExecutionConfirmed =
    executionItems.length > 0 && executionItems.every((i) => i.confirmed) && finalConfirm;
  const canNext =
    step === 0 ? thesis.trim().length > 0 && emotionalState !== ""
    : step === 1 ? playbook.length === 0 || !!playbookId   // setup required when any exist
    : step === 2 ? allRulesConfirmed                        // setup rules gate
    : step === 3 ? allExecutionConfirmed                    // execution checklist gate
    : step === 4 ? createdEntry != null
    : true;

  /** Build the dynamic execution checklist when entering the pre-trade analysis stage. */
  const enterPreTradeAnalysis = () => {
    const items: { label: string; description?: string; confirmed: boolean }[] = [];
    // Setup rules not yet satisfied must be explicitly resolved here.
    selectedRules.forEach((r, i) => {
      if ((ruleStates[String(i)] ?? "waiting") !== "ready") {
        items.push({ label: `Setup rule: ${r.text}`, description: r.description, confirmed: false });
      }
    });
    // Dynamic plan-derived validations.
    items.push({
      label: entryTimePlanned < "09:33" && entryTimePlanned !== "" ? "Entry time respects the 9:33 rule" : "Entry timing matches the plan",
      description: entryTimePlanned ? `Planned around ${entryTimePlanned} NY` : undefined,
      confirmed: false,
    });
    items.push({ label: "Risk acceptable — stop placement and size defined", description: expectedTarget.trim() ? `Target: ${expectedTarget.trim()}` : undefined, confirmed: false });
    items.push({
      label: invalidation.trim() ? `Invalidation understood: ${invalidation.trim()}` : "No unresolved invalidation condition",
      confirmed: false,
    });
    setExecutionItems(items);
    setFinalConfirm(false);
    setStep(PLAN_STAGE.PRE_TRADE_ANALYSIS);
  };

  const buildPlan = (): TradePlan => ({
    id: uid(`pl-${Date.now().toString(36)}`),
    date,
    challengeId: challengeId || undefined,
    playbookId: playbookId || undefined,
    playbookName: selectedPlaybook?.name,
    playbookVersion: selectedPlaybook?.version,
    instrument: instrument.trim() || undefined,
    bias,
    preSessionProcess: preSessionProcess.trim() || undefined,
    thesis: thesis.trim(),
    drawOnLiquidity: drawOnLiquidity.trim() || undefined,
    drawLevel: drawLevel.trim() || undefined,
    liquidityObservations: liquidityObservations.trim() || undefined,
    importantLevels: importantLevels.trim() || undefined,
    mustHappenBeforeEntry: mustHappenBeforeEntry.trim() || undefined,
    invalidation: invalidation.trim() || undefined,
    expectedSetup: selectedPlaybook?.name,
    expectedTarget: expectedTarget.trim() || undefined,
    emotionalState: emotionalState || undefined,
    emotionalNote: emotionalNote.trim() || undefined,
    whatCouldBreakPlan: whatCouldBreakPlan.trim() || undefined,
    rules: selectedRules.map((r, i) => ({ label: r.text ? `Rule ${i + 1}: ${r.text}` : `Rule ${i + 1}`, state: ruleStates[String(i)] ?? "waiting", note: r.description })),
    executionChecklist: executionItems.map((i) => ({ label: i.label, description: i.description, confirmed: i.confirmed })),
    executionConfirmedAt: allExecutionConfirmed ? Date.now() : undefined,
    status: "executed",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  /** The canonical pre-trade checklist persisted onto the trade entry. */
  const preTradeChecklistPayload = () =>
    executionItems.map((i) => ({ label: i.label, description: i.description, confirmed: i.confirmed }));

  /** Create the actual trade from manual details (stage 3 → 4). */
  const saveManualTrade = async () => {
    const pnlNumber = pnl.trim() === "" ? NaN : Number(pnl.replace(/[^\d.\-−]/g, "").replace("−", "-"));
    if (!Number.isFinite(pnlNumber)) {
      toast.error("Net P&L is required", "Enter a number — negative for a loss.");
      return;
    }
    setSaving(true);
    try {
      const plan = buildPlan();
      await useApp.getState().savePlan(plan);
      const created = await useApp.getState().createEntry({
        date: tradeDate <= todayKey() ? tradeDate : todayKey(),
        pnl: Math.round(pnlNumber * 100) / 100,
        rr: rr.trim() === "" ? null : Number(rr),
        instrument: (dirInstrument.trim() || instrument.trim() || "—").toUpperCase(),
        direction,
        setup: selectedPlaybook?.name ?? "",
        setupId: playbookId || undefined,
        notes: "",
        images: [],
        challengeId: challengeId || undefined,
        planId: plan.id,
        preTradeChecklist: preTradeChecklistPayload(),
      });
      setCreatedEntry(created);
      setStep(PLAN_STAGE.SCREENSHOTS);
    } finally {
      setSaving(false);
    }
  };

  /** Import CSV rows (stage 3 → 4) — batched, linked to the same challenge/setup. */
  const runImport = async () => {
    if (!importRows?.length) return;
    setSaving(true);
    try {
      const plan = buildPlan();
      await useApp.getState().savePlan(plan);
      const drafts = importRows.map((row, i) => ({
        date: row.date,
        pnl: row.pnl,
        rr: row.rr,
        instrument: row.instrument,
        direction: row.direction,
        setup: row.setup || selectedPlaybook?.name || "",
        setupId: row.setup ? undefined : playbookId || undefined,
        notes: row.notes,
        entryTime: row.entryTime ?? undefined,
        images: [] as JournalEntry["images"],
        challengeId: challengeId || undefined,
        planId: i === 0 ? plan.id : undefined,
        preTradeChecklist: preTradeChecklistPayload(),
        reviewStatus: "not_reviewed" as const,
      }));
      const created = await useApp.getState().createEntries(drafts);
      setCreatedEntry(created[0] ?? null);
      toast.success(`Imported ${created.length} ${created.length === 1 ? "trade" : "trades"}`, "Screenshots next — then Autopsy.");
      setStep(PLAN_STAGE.SCREENSHOTS);
    } finally {
      setSaving(false);
    }
  };

  const loadImportFile = async (file: File) => {
    setImportError(null);
    try {
      const text = await file.text();
      const { parseTradesCsv } = await import("@/lib/csv-import");
      const result = parseTradesCsv(text);
      if (result.error) { setImportError(result.error); setImportRows(null); return; }
      if (result.rows.length === 0) { setImportError("No valid rows found in that file."); return; }
      setImportRows(result.rows.map((r) => ({ date: r.date, pnl: r.pnl, rr: r.rr, instrument: r.instrument, direction: r.direction, setup: r.setup, notes: r.notes, entryTime: r.entryTime })));
    } catch {
      setImportError("Could not read that file — try re-exporting it.");
    }
  };

  /** Persist screenshots onto the trade (stage 4 → 5). */
  const saveScreenshots = async () => {
    if (!createdEntry) return;
    setSaving(true);
    try {
      const blobs = new Map<string, Blob>();
      for (const item of images) if (item.blob) blobs.set(item.meta.id, item.blob);
      await useApp.getState().updateEntry(
        createdEntry.id,
        {
          date: createdEntry.date, pnl: createdEntry.pnl, rr: createdEntry.rr,
          instrument: createdEntry.instrument, direction: createdEntry.direction,
          setup: createdEntry.setup, setupId: createdEntry.setupId, notes: createdEntry.notes,
          images: images.map((i) => i.meta), challengeId: createdEntry.challengeId,
          tradeNumber: createdEntry.tradeNumber ?? null,
          entryTime: createdEntry.entryTime, exitTime: createdEntry.exitTime,
          entryPrice: createdEntry.entryPrice, exitPrice: createdEntry.exitPrice,
          stopLoss: createdEntry.stopLoss, takeProfit: createdEntry.takeProfit,
        },
        blobs,
      );
      setStep(PLAN_STAGE.AUTOPSY);
    } finally {
      setSaving(false);
    }
  };

  const finish = () => {
    toast.success("Trade complete", "Journal, challenge progress and MINATO analytics updated.");
    onClose();
  };

  return (
    <>
    <Modal open={open && !autopsyEntry} onClose={onClose} size="lg" label="Plan a trade" title="Plan & record a trade">
      <div className="px-6 py-6 sm:px-8">
        {/* Progress */}
        <ol className="flex items-center gap-1" aria-label={`Stage ${Math.min(step + 1, STAGES.length)} of ${STAGES.length}: ${STAGES[Math.min(step, STAGES.length - 1)]}`}>
          {STAGES.map((label, i) => (
            <li key={label} className="flex flex-1 items-center gap-1 last:flex-none">
              <span className={cn(
                "grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[9px] font-bold transition-colors",
                i < step ? "border-profit/50 bg-profit/[0.12] text-profit"
                  : i === step ? "border-gold bg-gold/[0.14] text-gold"
                  : "border-line bg-raised text-faint",
              )}>
                {i < step ? "✓" : i + 1}
              </span>
              {i < STAGES.length - 1 && <span className={cn("h-px flex-1", i < step ? "bg-profit/40" : "bg-line-strong")} />}
            </li>
          ))}
        </ol>
        <p className="mt-2 text-[11px] font-medium uppercase tracking-wider text-faint">{STAGES[Math.min(step, STAGES.length - 1)]}</p>

        {/* MINATO appears contextually at the checklist stage only */}
        <AnimatePresence>
          {step === 2 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 flex items-start justify-end gap-2">
              <MinatoBubble state="curious" text="Thesis noted. Work through every rule before you commit capital." />
              <MinatoAvatar state="curious" size={44} />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-5 min-h-[240px]">
          <AnimatePresence mode="wait" initial={false}>
            {/* ─────────────── STAGE 0 · PRE-SESSION ─────────────── */}
            {step === 0 && (
              <StageShell key="presession" title="Pre-session planning" subtitle="Plan before you know your entry or exit — that's the point.">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Planned day" htmlFor="plan-date">
                      <TextInput id="plan-date" type="date" max={todayKey()} value={date} onChange={(e) => setDate(e.target.value)} />
                    </Field>
                    <Field label="Instrument" hint="optional" htmlFor="plan-instrument">
                      <TextInput id="plan-instrument" placeholder="NQ, ES…" value={instrument} onChange={(e) => setInstrument(e.target.value.toUpperCase())} />
                    </Field>
                  </div>
                  <Field label="Pre-session process" hint="routine, review, levels" htmlFor="plan-presession">
                    <TextArea id="plan-presession" className="min-h-14" placeholder="e.g. Mark overnight high/low, check news calendar, no trades before 9:33." value={preSessionProcess} onChange={(e) => setPreSessionProcess(e.target.value)} />
                  </Field>
                  <Field label="1 · What is price likely to do today?" hint="your thesis — stored exactly as written" htmlFor="plan-thesis">
                    <TextArea id="plan-thesis" className="min-h-20" placeholder="Write your market thesis freely…" value={thesis} onChange={(e) => setThesis(e.target.value)} />
                  </Field>
                  <Field label="2 · Where is the draw on liquidity?" htmlFor="plan-draw">
                    <TextInput id="plan-draw" placeholder="e.g. overnight high above equal highs" value={drawOnLiquidity} onChange={(e) => setDrawOnLiquidity(e.target.value)} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Level" hint="optional" htmlFor="plan-level">
                      <TextInput id="plan-level" className="tabular" placeholder="e.g. 22,540" value={drawLevel} onChange={(e) => setDrawLevel(e.target.value)} />
                    </Field>
                    <Field label="Expected target" hint="optional" htmlFor="plan-target">
                      <TextInput id="plan-target" placeholder="e.g. opposing PD array" value={expectedTarget} onChange={(e) => setExpectedTarget(e.target.value)} />
                    </Field>
                  </div>
                  <Field label="3 · Expected market narrative" hint="the story you expect price to tell" htmlFor="plan-narrative">
                    <TextInput id="plan-narrative" placeholder="e.g. sweep Asia highs → reversal into NY draw" value={liquidityObservations} onChange={(e) => setLiquidityObservations(e.target.value)} />
                  </Field>
                  <Field label="4 · Key liquidity levels" htmlFor="plan-levels">
                    <TextArea id="plan-levels" className="min-h-12" value={importantLevels} onChange={(e) => setImportantLevels(e.target.value)} />
                  </Field>
                  <Field label="5 · What are you expecting to happen?" hint="your execution intention" htmlFor="plan-must">
                    <TextInput id="plan-must" placeholder="e.g. sweep + SMT confirmation before any entry" value={mustHappenBeforeEntry} onChange={(e) => setMustHappenBeforeEntry(e.target.value)} />
                  </Field>
                  <Field label="What would invalidate the idea?" hint="optional" htmlFor="plan-invalid">
                    <TextInput id="plan-invalid" placeholder="e.g. reclaims the swept level" value={invalidation} onChange={(e) => setInvalidation(e.target.value)} />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="6 · Emotional state check">
                      <EmotionPicker value={emotionalState} onChange={setEmotionalState} />
                    </Field>
                    <Field label="What's influencing that state?" hint="sleep, yesterday, news…" htmlFor="plan-emotion-note">
                      <TextArea id="plan-emotion-note" className="min-h-16" value={emotionalNote} onChange={(e) => setEmotionalNote(e.target.value)} />
                    </Field>
                  </div>
                  <Field label="What could cause you to break your plan today?" hint="MINATO compares prediction vs reality" htmlFor="plan-break">
                    <TextArea id="plan-break" className="min-h-14" placeholder="e.g. I may enter early because I don't want to miss the move." value={whatCouldBreakPlan} onChange={(e) => setWhatCouldBreakPlan(e.target.value)} />
                  </Field>

                  {/* Proactive pattern warning — evidence-based, dismissible */}
                  {planMatch && planMatch.pattern.count >= 2 && (
                    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border border-gold/40 bg-gold/[0.07] p-4">
                      <div className="flex items-start gap-2.5">
                        <MinatoAvatar state="warning" size={36} />
                        <div className="min-w-0 flex-1">
                          <p className="text-[13px] leading-relaxed text-ink">
                            This sounds similar to the <strong className="text-gold">{planMatch.pattern.label}</strong> pattern
                            you&apos;ve recorded before ({planMatch.pattern.count}×, {planMatch.pattern.confidence}). Confirm
                            your setup conditions before treating this as an entry.
                          </p>
                          <PatternEvidenceDisclosure pattern={planMatch.pattern} />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </div>
              </StageShell>
            )}

            {/* ─────────────── STAGE 1 · SETUP SELECTION ─────────────── */}
            {step === 1 && (
              <StageShell key="setup" title="Select your setup" subtitle="Which Playbook strategy does this planned trade belong to? Its rules load in the next step.">
                {playbook.length === 0 ? (
                  <p className="rounded-control border border-dashed border-line-strong px-4 py-8 text-center text-sm text-muted">
                    No playbook setups yet — create one in Trading Lab, or continue without a setup.
                  </p>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Playbook setup">
                    {playbook.map((p) => {
                      const ruleCount = setupRules(p).length;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          role="radio"
                          aria-checked={playbookId === p.id}
                          onClick={() => { setPlaybookId(p.id); setRuleStates({}); }}
                          className={cn(
                            "rounded-xl border px-4 py-3 text-left transition-all duration-150 active:scale-[0.98]",
                            playbookId === p.id ? "border-gold/60 bg-gold/[0.07]" : "border-line bg-raised/60 hover:border-line-strong",
                          )}
                        >
                          <p className="truncate text-sm font-semibold text-ink">📁 {p.name}</p>
                          <p className="num mt-0.5 text-[11px] text-faint">{ruleCount} {ruleCount === 1 ? "rule" : "rules"}{p.sessions?.length ? ` · ${p.sessions.join(", ")}` : ""}</p>
                        </button>
                      );
                    })}
                  </div>
                )}
              </StageShell>
            )}

            {/* ─────────────── STAGE 2 · RULE CHECKLIST ─────────────── */}
            {step === 2 && (
              <StageShell key="checklist" title="Setup rule checklist" subtitle={selectedPlaybook ? `${selectedPlaybook.name} — confirm every rule to proceed` : "No setup selected."}>
                {selectedRules.length === 0 ? (
                  <p className="rounded-control border border-dashed border-line-strong px-4 py-8 text-center text-sm text-muted">
                    No rules on this setup — continue to record the trade.
                  </p>
                ) : (
                  <>
                    <div className="space-y-2">
                      {selectedRules.map((r, i) => {
                        const checked = (ruleStates[String(i)] ?? "waiting") === "ready";
                        return (
                          <button
                            key={i}
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            onClick={() => setRuleStates({ ...ruleStates, [String(i)]: checked ? "waiting" : "ready" })}
                            className={cn(
                              "flex w-full items-start gap-3 rounded-xl border px-4 py-2.5 text-left transition-colors",
                              checked ? "border-profit/40 bg-profit/[0.06]" : "border-line bg-raised/60 hover:border-line-strong",
                            )}
                          >
                            <span className={cn(
                              "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors",
                              checked ? "border-profit bg-profit/[0.15] text-profit" : "border-line-strong bg-surface text-transparent",
                            )}>✓</span>
                            <span className="min-w-0">
                              <span className="block text-[13px] text-ink">Rule {i + 1}: {r.text}</span>
                              {r.description && <span className="mt-0.5 block text-xs leading-relaxed text-muted">{r.description}</span>}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {!allRulesConfirmed && (
                      <p className="mt-3 rounded-lg border border-gold/30 bg-gold/[0.06] px-3 py-2 text-xs text-gold" role="status">
                        Execution gate: confirm every rule before recording the trade.
                      </p>
                    )}
                  </>
                )}
              </StageShell>
            )}

            {/* ─────── STAGE 3 · PRE-TRADE ANALYSIS / EXECUTION GATE ─────── */}
            {step === 3 && (
              <StageShell key="pretrade" title="Pre-trade analysis" subtitle="Is this trade actually valid according to your plan? Confirm every condition before recording.">
                {/* Plan context summary */}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border border-line bg-raised/60 p-4 text-[12px] sm:grid-cols-3">
                  <Fact label="Setup" value={selectedPlaybook?.name ?? "—"} />
                  <Fact label="Challenge" value={challenges.find((c) => c.id === challengeId)?.name ?? "—"} />
                  <Fact label="Market / instrument" value={(dirInstrument || instrument).toUpperCase() || "—"} />
                  <Fact label="Direction" value={bias !== "either" ? bias : "—"} />
                  <Fact label="Planned target" value={expectedTarget.trim() || "—"} />
                  <Fact label="Risk / reward" value={rr.trim() ? `${rr.trim()}R (planned)` : "—"} />
                  <Fact label="Invalidation" value={invalidation.trim() || "—"} />
                  <Fact label="Emotional state" value={emotionalState || "—"} />
                  <Fact label="Must happen first" value={mustHappenBeforeEntry.trim() || "—"} />
                </dl>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <Field label="Planned entry time" hint="NY, optional" htmlFor="ptap-time">
                    <TextInput id="ptap-time" type="time" value={entryTimePlanned} onChange={(e) => setEntryTimePlanned(e.target.value)} />
                  </Field>
                  <Field label="Planned risk / reward" hint="optional, e.g. 2.5" htmlFor="ptap-rr">
                    <TextInput id="ptap-rr" inputMode="decimal" className="tabular" value={rr} onChange={(e) => setRr(e.target.value.replace(/[^\d.\-−]/g, "").replace("−", "-"))} />
                  </Field>
                </div>

                {/* Execution checklist — dynamic, interactive, gated */}
                <p className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-faint">Execution checklist</p>
                {entryTimePlanned !== "" && entryTimePlanned < "09:33" && (
                  <div className="mt-3 rounded-lg border border-loss/30 bg-loss/[0.07] px-3 py-2 text-xs text-loss" role="alert">
                    Planned entry {entryTimePlanned} is before 9:33 AM NY — premature entries break the time rule.
                  </div>
                )}
                <div className="mt-2 space-y-2">
                  {executionItems.map((item, i) => {
                    return (
                      <button
                        key={i}
                        type="button"
                        role="checkbox"
                        aria-checked={item.confirmed}
                        onClick={() => setExecutionItems(executionItems.map((it, j) => (j === i ? { ...it, confirmed: !it.confirmed } : it)))}
                        className={cn(
                          "flex w-full items-start gap-3 rounded-xl border px-4 py-2.5 text-left transition-colors",
                          item.confirmed ? "border-profit/40 bg-profit/[0.06]" : "border-line bg-raised/60 hover:border-line-strong",
                        )}
                      >
                        <span className={cn(
                          "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors",
                          item.confirmed ? "border-profit bg-profit/[0.15] text-profit" : "border-line-strong bg-surface text-transparent",
                        )}>✓</span>
                        <span className="min-w-0">
                          <span className="block text-[13px] text-ink">{item.label}</span>
                          {item.description && <span className="mt-0.5 block text-xs leading-relaxed text-muted">{item.description}</span>}
                        </span>
                      </button>
                    );
                  })}
                  {/* Final explicit confirmation */}
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={finalConfirm}
                    onClick={() => setFinalConfirm((v) => !v)}
                    className={cn(
                      "flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left font-medium transition-colors",
                      finalConfirm ? "border-gold/60 bg-gold/[0.08]" : "border-line-strong bg-surface hover:border-gold/40",
                    )}
                  >
                    <span className={cn(
                      "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border transition-colors",
                      finalConfirm ? "border-gold bg-gold/[0.15] text-gold" : "border-line-strong bg-surface text-transparent",
                    )}>✓</span>
                    <span className="text-[13px] text-ink">I confirm this trade is valid according to my plan.</span>
                  </button>
                </div>

                {!allExecutionConfirmed && (
                  <p className="mt-3 rounded-lg border border-gold/30 bg-gold/[0.06] px-3 py-2 text-xs text-gold" role="status">
                    Incomplete: {[
                      ...executionItems.filter((i) => !i.confirmed).map((i) => i.label),
                      ...(finalConfirm ? [] : ["Final confirmation"]),
                    ].join(" · ")}
                  </p>
                )}

                <div className="mt-4 flex justify-end">
                  <Button variant="gold" size="sm" disabled={!allExecutionConfirmed} onClick={() => setStep(PLAN_STAGE.RECORD)}>
                    Proceed to Record Trade
                  </Button>
                </div>
              </StageShell>
            )}

            {/* ─────────── STAGE 4 · MANUAL ENTRY OR IMPORT ─────────── */}
            {step === 4 && !createdEntry && (
              <StageShell key="record" title="Record the trade" subtitle="Manual entry or import — screenshots come right after either path.">
                {entryMode === "choose" && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <button type="button" onClick={() => setEntryMode("manual")} className="flex flex-col items-center gap-2 rounded-xl border border-line bg-raised/60 px-6 py-8 transition-colors hover:border-gold/50">
                      <PencilIcon className="h-5 w-5 text-gold" />
                      <span className="text-sm font-semibold text-ink">MANUAL ENTRY</span>
                      <span className="text-center text-xs text-muted">Enter this trade&apos;s details by hand.</span>
                    </button>
                    <button type="button" onClick={() => setEntryMode("import")} className="flex flex-col items-center gap-2 rounded-xl border border-line bg-raised/60 px-6 py-8 transition-colors hover:border-gold/50">
                      <UploadIcon className="h-5 w-5 text-gold" />
                      <span className="text-sm font-semibold text-ink">IMPORT TRADES</span>
                      <span className="text-center text-xs text-muted">Upload a broker/spreadsheet CSV export.</span>
                    </button>
                  </div>
                )}

                {entryMode === "manual" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Trading day" htmlFor="pt-date">
                        <TextInput id="pt-date" type="date" max={todayKey()} value={tradeDate} onChange={(e) => setTradeDate(e.target.value)} />
                      </Field>
                      <Field label="Net P&L" hint="negative for loss" htmlFor="pt-pnl">
                        <TextInput id="pt-pnl" inputMode="decimal" className="tabular" placeholder="-120.50" value={pnl} onChange={(e) => setPnl(e.target.value.replace(/[^\d.\-−]/g, "").replace("−", "-"))} />
                      </Field>
                      <Field label="Risk-to-reward" hint="optional" htmlFor="pt-rr">
                        <TextInput id="pt-rr" inputMode="decimal" className="tabular" placeholder="+2.5R" value={rr} onChange={(e) => setRr(e.target.value.replace(/[^\d.\-−]/g, "").replace("−", "-"))} />
                      </Field>
                      <Field label="Instrument" hint="optional" htmlFor="pt-instrument">
                        <TextInput id="pt-instrument" placeholder="NQ…" value={dirInstrument} onChange={(e) => setDirInstrument(e.target.value.toUpperCase())} />
                      </Field>
                      <Field label="Entry time" hint="NY, optional" htmlFor="pt-entrytime">
                        <TextInput id="pt-entrytime" type="time" value={entryTime} onChange={(e) => setEntryTime(e.target.value)} />
                      </Field>
                      <Field label="Exit time" hint="NY, optional" htmlFor="pt-exittime">
                        <TextInput id="pt-exittime" type="time" value={exitTime} onChange={(e) => setExitTime(e.target.value)} />
                      </Field>
                    </div>
                    <Field label="Direction" hint="optional">
                      <div className="grid grid-cols-2 gap-2">
                        {(["long", "short"] as const).map((d) => (
                          <button key={d} type="button" aria-pressed={direction === d}
                            onClick={() => setDirection((cur) => (cur === d ? null : d))}
                            className={cn("rounded-xl border py-2.5 text-sm font-semibold capitalize transition-all active:scale-[0.97]",
                              direction === d ? (d === "long" ? "border-profit/50 bg-profit/[0.12] text-profit" : "border-loss/50 bg-loss/[0.10] text-loss") : "border-line bg-raised/60 text-muted")}>
                            {d}
                          </button>
                        ))}
                      </div>
                    </Field>
                    <div className="flex justify-end">
                      <Button variant="gold" size="sm" loading={saving} disabled={saving} onClick={() => void saveManualTrade()}>
                        Save trade → Screenshots
                      </Button>
                    </div>
                  </div>
                )}

                {entryMode === "import" && (
                  <div className="space-y-4">
                    <input ref={importRef} type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void loadImportFile(f); e.target.value = ""; }} />
                    {!importRows ? (
                      <>
                        <button type="button" onClick={() => importRef.current?.click()} className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong bg-raised/40 px-6 py-10 transition-colors hover:border-gold/50">
                          <UploadIcon className="h-5 w-5 text-gold" />
                          <span className="text-sm font-semibold text-ink">Upload trades CSV</span>
                        </button>
                        {importError && <p role="alert" className="rounded-lg border border-loss/25 bg-loss/[0.06] px-3 py-2 text-[13px] text-loss">{importError}</p>}
                      </>
                    ) : (
                      <>
                        <p className="rounded-lg border border-line bg-raised/60 px-3 py-2 text-[13px] text-muted">
                          <span className="num font-semibold text-ink">{importRows.length}</span> {importRows.length === 1 ? "trade" : "trades"} parsed — tagged with{" "}
                          <strong className="text-ink">{selectedPlaybook?.name || "no setup"}</strong> and{" "}
                          <strong className="text-ink">{challenges.find((c) => c.id === challengeId)?.name || "no challenge"}</strong>.
                          You&apos;ll add screenshots before Autopsy.
                        </p>
                        <div className="max-h-40 overflow-y-auto rounded-xl border border-line">
                          <table className="w-full text-left text-[12px]">
                            <thead className="sticky top-0 bg-raised text-[10px] uppercase tracking-wide text-faint"><tr><th className="px-3 py-2">Date</th><th className="px-3 py-2">P&L</th><th className="px-3 py-2">Instrument</th></tr></thead>
                            <tbody className="divide-y divide-line-soft">
                              {importRows.slice(0, 20).map((r, i) => (
                                <tr key={i}><td className="px-3 py-1.5 tabular text-muted">{r.date}</td><td className={cn("px-3 py-1.5 num", r.pnl > 0 ? "text-profit" : r.pnl < 0 ? "text-loss" : "text-muted")}>{r.pnl}</td><td className="px-3 py-1.5 text-ink">{r.instrument}</td></tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="flex justify-between">
                          <Button variant="subtle" size="sm" onClick={() => { setImportRows(null); setImportError(null); }}>Different file</Button>
                          <Button variant="gold" size="sm" loading={saving} disabled={saving} onClick={() => void runImport()}>
                            Import {importRows.length} → Screenshots
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </StageShell>
            )}

            {/* ─────────────── STAGE 4 · SCREENSHOTS ─────────────── */}
            {step === 5 && createdEntry && (
              <StageShell key="screenshots" title={`Screenshots — ${createdEntry.setup || createdEntry.instrument || "trade"} (${createdEntry.date})`} subtitle="Add up to two chart screenshots. They stay attached to THIS trade.">
                <ImageUploader items={images} onChange={setImages} max={2} />
                <div className="mt-4 flex justify-between">
                  <Button variant="ghost" size="sm" disabled={saving} onClick={() => {
                    if (!window.confirm("Skip screenshots? The trade will be marked REVIEW INCOMPLETE until evidence is added.")) return;
                    setStep(PLAN_STAGE.AUTOPSY);
                  }}>
                    Continue without screenshots…
                  </Button>
                  <Button variant="gold" size="sm" loading={saving} disabled={saving} onClick={() => void saveScreenshots()}>
                    Save screenshots → Autopsy
                  </Button>
                </div>
              </StageShell>
            )}

            {/* ─────────────── STAGE 5 · AUTOPSY HANDOFF ─────────────── */}
            {step === 6 && createdEntry && (
              <StageShell key="autopsy" title="Autopsy" subtitle="The full structured post-trade review — connected to your plan, checklist and setup.">
                <div className="rounded-xl border border-gold/30 bg-gold/[0.05] p-4 text-[13px] leading-relaxed text-ink">
                  The trade is saved with its plan, checklist and screenshots. Autopsy walks through
                  execution, psychology, outcome and concepts — MINATO analyzes the answers afterwards.
                </div>
                <div className="mt-4 flex justify-between">
                  <Button variant="ghost" size="sm" onClick={finish}>Save as incomplete draft</Button>
                  <Button variant="gold" size="sm" onClick={() => setAutopsyEntry(createdEntry)}>
                    Open Autopsy
                  </Button>
                </div>
              </StageShell>
            )}
          </AnimatePresence>
        </div>

        {/* Footer nav */}
        <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>Close</Button>
          <div className="flex items-center gap-2.5">
            {step > 0 && step !== PLAN_STAGE.PRE_TRADE_ANALYSIS && step < PLAN_STAGE.SCREENSHOTS && (
              <Button variant="subtle" size="sm" onClick={() => setStep((s) => s - 1)} disabled={saving}>Back</Button>
            )}
            {(step === 0 || step === 1 || step === 2) && (
              <Button
                variant="gold"
                size="sm"
                disabled={!canNext || saving}
                onClick={() => (step === 2 ? enterPreTradeAnalysis() : setStep((s) => s + 1))}
              >
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>

    {/* Autopsy — outside the wizard modal so it renders full-screen above it */}
    <TradeReviewFlow
      open={!!autopsyEntry}
      entry={autopsyEntry}
      onClose={() => { setAutopsyEntry(null); finish(); }}
    />
    </>
  );
}

/** Interactive emotional-state picker — chips, not a static text field. */
function EmotionPicker({ value, onChange }: { value: string; onChange: (v: (typeof PLAN_EMOTIONS)[number] | "") => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Emotional state">
      {PLAN_EMOTIONS.map((e) => (
        <button
          key={e}
          type="button"
          aria-pressed={value === e}
          onClick={() => onChange(value === e ? "" : e)}
          className={cn(
            "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
            value === e ? "border-gold/50 bg-gold/[0.1] text-gold" : "border-line bg-raised/60 text-faint hover:text-muted",
          )}
        >
          {e.charAt(0) + e.slice(1).toLowerCase()}
        </button>
      ))}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[10px] font-medium uppercase tracking-[0.08em] text-faint">{label}</dt>
      <dd className="mt-0.5 truncate text-[13px] font-medium text-ink">{value}</dd>
    </div>
  );
}

function reduceSafe(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function StageShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }} transition={{ duration: 0.25, ease: EASE }}>
      <h3 className="font-display text-lg font-semibold tracking-[-0.02em] text-ink">{title}</h3>
      <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>
      <div className="mt-4">{children}</div>
    </motion.div>
  );
}

/** "Why are you saying this?" — evidence disclosure for pattern warnings. */
export function PatternEvidenceDisclosure({ pattern }: { pattern: { label: string; count: number; confidence: string; improving: boolean; evidence: { entryId: string; date: string; excerpt: string }[] } }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2">
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-xs font-medium text-gold underline-offset-2 hover:underline">
        {open ? "Hide evidence" : "Why are you saying this?"}
      </button>
      {open && (
        <ul className="mt-2 space-y-1.5">
          {pattern.evidence.slice(0, 5).map((ev) => (
            <li key={ev.entryId} className="rounded-lg border border-line bg-surface px-3 py-2 text-[12px]">
              <span className="num text-faint">{ev.date}</span> — <span className="text-muted">“{ev.excerpt}”</span>
            </li>
          ))}
          <li className="text-[11px] text-faint">
            {pattern.count} occurrences · {pattern.confidence} pattern{pattern.improving ? " · improving" : ""}
          </li>
        </ul>
      )}
    </div>
  );
}
