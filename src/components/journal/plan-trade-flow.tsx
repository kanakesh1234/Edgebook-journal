"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/lib/store";
import { useUi } from "@/lib/ui-store";
import { PLAN_EMOTIONS, setupRules, type JournalEntry, type PlanRuleState, type TradeDirection, type TradePlan } from "@/lib/types";
import { currencySymbol, todayKey } from "@/lib/format";
import { Modal } from "@/components/ui/modal";
import { cn, uid } from "@/lib/utils";
import { ImageUploader, type UploadItem } from "./image-uploader";
import { AutopsyBody, useAutopsy } from "./autopsy";
import {
  CheckRow, ChoiceCard, Chip, Disclosure, FLOW_EASE, FLOW_EXPAND, Hint, IconCheck, Label, PrimaryButton, QuietButton, Segmented,
  Reveal, SheetFrame, Stagger, StepTitle, StepTransition, TextBlock, TextBox,
} from "./flow-ui";

/**
 * PLAN & RECORD — one calm, continuous ritual.
 *
 *   plan → setup (+ its rules) → trade → chart → autopsy → done
 *
 * "setup" is skipped when the trader has no playbook. There is no stepper:
 * each step simply follows the last. Validation is shown as quiet inline
 * state, and Continue stays disabled until the step's rules are satisfied.
 */
type StepId = "plan" | "setup" | "trade" | "chart" | "autopsy" | "done";
type NewsEvent = { id: string; name: string; time: string };
type ImportRow = { date: string; pnl: number; rr: number | null; instrument: string; direction: TradeDirection | null; setup: string; notes: string; entryTime: string | null };

const PRIMARY_EMOTIONS = PLAN_EMOTIONS.slice(0, 6);
const MORE_EMOTIONS = PLAN_EMOTIONS.slice(6);
const label = (e: string) => e.charAt(0) + e.slice(1).toLowerCase();
const IconPlus = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>
);
const IconMinus = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M6 12h12" /></svg>
);
const cleanNumber = (v: string) => v.replace(/[^\d.\-−]/g, "").replace("−", "-");

export function PlanTradeFlow({ open, onClose }: { open: boolean; onClose: () => void }) {
  const entries = useApp((s) => s.entries);
  const settings = useApp((s) => s.settings);
  const playbook = settings.playbook ?? [];
  const challenges = settings.challenges ?? [];
  const sym = currencySymbol(settings.currency);

  const [step, setStep] = useState<StepId>("plan");
  const [dir, setDir] = useState<1 | -1>(1);

  // plan
  const [thesis, setThesis] = useState("");
  const [emotion, setEmotion] = useState<(typeof PLAN_EMOTIONS)[number] | "">("");
  const [moreEmotions, setMoreEmotions] = useState(false);
  const [emotionReason, setEmotionReason] = useState("");
  const [newsAnswer, setNewsAnswer] = useState<boolean | null>(null);
  const [newsEvents, setNewsEvents] = useState<NewsEvent[]>([]);
  const [instrument, setInstrument] = useState("");
  const [draw, setDraw] = useState("");
  const [invalidation, setInvalidation] = useState("");
  const [breakPlan, setBreakPlan] = useState("");

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
  const [tradeInstrument, setTradeInstrument] = useState("");
  const [importRows, setImportRows] = useState<ImportRow[] | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);

  // after the trade exists
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [images, setImages] = useState<UploadItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const autopsy = useAutopsy(createdId, step === "autopsy");

  const selectedPlaybook = playbook.find((p) => p.id === playbookId);
  const rules = useMemo(() => setupRules(selectedPlaybook), [selectedPlaybook]);
  const confirmedRules = rules.filter((_, i) => ruleStates[String(i)] === "ready").length;
  const allRules = rules.length === 0 || confirmedRules === rules.length;

  const order: StepId[] = useMemo(() => (playbook.length ? ["plan", "setup", "trade", "chart", "autopsy", "done"] : ["plan", "trade", "chart", "autopsy", "done"]), [playbook.length]);
  const go = (to: StepId) => {
    setDir(order.indexOf(to) >= order.indexOf(step) ? 1 : -1);
    setSaveError(null);
    setStep(to);
  };
  const prev = (s: StepId): StepId | null => { const i = order.indexOf(s); return i > 0 ? order[i - 1]! : null; };
  const next = (s: StepId): StepId => order[Math.min(order.length - 1, order.indexOf(s) + 1)]!;

  // Optional suggestions for the Instrument field: MNQ first, then recently used ones.
  const suggestedInstruments = useMemo(() => {
    const seen: string[] = ["MNQ"];
    for (const e of [...entries].sort((a, b) => b.createdAt - a.createdAt)) {
      const i = e.instrument?.trim().toUpperCase();
      if (i && i !== "—" && !seen.includes(i)) seen.push(i);
      if (seen.length === 4) break;
    }
    return seen;
  }, [entries]);

  // Question reveal (same pattern as the Autopsy): only the next unanswered question appears,
  // answered ones stay put. Once shown, a question is never hidden again by clearing an earlier answer.
  const showFeeling = thesis.trim().length > 0 || emotion !== "";
  const showReason = emotion !== "" || emotionReason.trim().length > 0;
  const showNews = emotionReason.trim().length > 0 || newsAnswer !== null;
  const showDetail = newsAnswer !== null;
  const chooseNews = (v: boolean) => {
    setNewsAnswer(v);
    if (v && newsEvents.length === 0) setNewsEvents([{ id: uid("ev"), name: "", time: "" }]);
  };
  const patchEvent = (id: string, patch: Partial<NewsEvent>) => setNewsEvents((l) => l.map((e) => (e.id === id ? { ...e, ...patch } : e)));

  // Fresh start every time the flow opens.
  useEffect(() => {
    if (!open) return;
    setStep("plan"); setDir(1);
    setThesis(""); setEmotion(""); setMoreEmotions(false); setEmotionReason(""); setNewsAnswer(null); setNewsEvents([]); setInstrument(""); setDraw(""); setInvalidation(""); setBreakPlan("");
    const only = useApp.getState().settings.playbook ?? [];
    setPlaybookId(only.length === 1 ? only[0]!.id : ""); setRuleStates({});
    setMode("manual"); setPnl(""); setDirection(null); setTradeDate(todayKey()); setRr(""); setEntryTime(""); setExitTime(""); setTradeInstrument("");
    setImportRows(null); setImportError(null);
    setCreatedId(null); setImages([]); setSaving(false); setSaveError(null);
  }, [open]);

  /* ---------------- gating + quiet hints per step ---------------- */
  const pnlText = pnl.trim();
  const pnlValue = pnlText === "" ? NaN : Number(pnlText);
  const pnlInvalid = pnlText !== "" && !Number.isFinite(pnlValue);
  const manualReady = Number.isFinite(pnlValue);
  const finalInstrument = (instrument.trim() || tradeInstrument.trim()).toUpperCase();

  const gate: { ok: boolean; hint: string | null } = (() => {
    switch (step) {
      case "plan":
        if (!thesis.trim()) return { ok: false, hint: "Write your plan to continue" };
        if (!emotion) return { ok: false, hint: "Pick how you feel" };
        if (!emotionReason.trim()) return { ok: false, hint: "Say what's behind that feeling" };
        if (newsAnswer === null) return { ok: false, hint: "Any news or events today?" };
        if (newsAnswer && !newsEvents.some((e) => e.name.trim())) return { ok: false, hint: "Name the event, or choose No news" };
        return { ok: true, hint: null };
      case "setup":
        if (!playbookId) return { ok: false, hint: "Choose a setup" };
        if (!allRules) return { ok: false, hint: `${confirmedRules} of ${rules.length} rules confirmed` };
        return { ok: true, hint: null };
      case "trade":
        if (mode === "import") return importRows?.length ? { ok: true, hint: null } : { ok: false, hint: "Choose a file to import" };
        if (!pnlText) return { ok: false, hint: "Enter the net P&L" };
        if (pnlInvalid) return { ok: false, hint: "Numbers only — negative for a loss" };
        return { ok: true, hint: null };
      case "chart":
        return images.length ? { ok: true, hint: null } : { ok: false, hint: "Add a chart, or skip for now" };
      case "autopsy":
        return autopsy.ready ? { ok: true, hint: null } : { ok: false, hint: "Answer the first three to finish" };
      default:
        return { ok: true, hint: null };
    }
  })();

  /* ---------------- persistence ---------------- */
  const buildPlan = (): TradePlan => ({
    id: uid(`pl-${Date.now().toString(36)}`),
    date: todayKey(),
    challengeId: useApp.getState().settings.primaryChallengeId ?? challenges[0]?.id ?? undefined,
    playbookId: playbookId || undefined,
    playbookName: selectedPlaybook?.name,
    playbookVersion: selectedPlaybook?.version,
    instrument: finalInstrument || undefined,
    bias: "either",
    thesis: thesis.trim(),
    drawOnLiquidity: draw.trim() || undefined,
    invalidation: invalidation.trim() || undefined,
    expectedSetup: selectedPlaybook?.name,
    emotionalState: emotion || undefined,
    whatCouldBreakPlan: breakPlan.trim() || undefined,
    rules: rules.map((r, i) => ({ label: r.text ? `Rule ${i + 1}: ${r.text}` : `Rule ${i + 1}`, state: ruleStates[String(i)] ?? "waiting", note: r.description })),
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
      await useApp.getState().savePlan(plan);
      if (mode === "manual") {
        const created = await useApp.getState().createEntry({
          date: tradeDate <= todayKey() ? tradeDate : todayKey(),
          pnl: Math.round(pnlValue * 100) / 100,
          rr: rr.trim() === "" || !Number.isFinite(Number(rr)) ? null : Number(rr),
          instrument: finalInstrument || "—",
          direction,
          setup: selectedPlaybook?.name ?? "",
          setupId: playbookId || undefined,
          notes: "",
          images: [],
          challengeId: challengeId(),
          planId: plan.id,
          entryTime: entryTime.trim() || undefined,
          exitTime: exitTime.trim() || undefined,
        });
        setCreatedId(created.id);
      } else if (importRows?.length) {
        const created = await useApp.getState().createEntries(importRows.map((row, i) => ({
          date: row.date, pnl: row.pnl, rr: row.rr, instrument: row.instrument, direction: row.direction,
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

  /** Persist charts onto the trade, then read it back from the store so every later screen sees them. */
  const saveCharts = async () => {
    const live = createdId ? useApp.getState().entries.find((e) => e.id === createdId) : undefined;
    if (!live) { go("autopsy"); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const blobs = new Map<string, Blob>();
      for (const item of images) if (item.blob) blobs.set(item.meta.id, item.blob);
      await useApp.getState().updateEntry(live.id, {
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
    if (step === "plan" || step === "setup") go(next(step));
    else if (step === "trade") void saveTrade();
    else if (step === "chart") void saveCharts();
    else if (step === "autopsy") void completeAutopsy();
    else onClose();
  };

  const continueLabel = step === "trade" ? (mode === "import" && importRows ? `Import ${importRows.length}` : "Save trade") : step === "autopsy" ? "Finish" : step === "done" ? "Done" : "Continue";
  // Going back is only possible before the trade is saved (never re-creates it) and from autopsy to the chart.
  const back = step === "plan" || step === "chart" || step === "done" ? null : step === "autopsy" ? "chart" : prev(step);

  const hintText = saveError ?? autopsy.error ?? gate.hint;
  const hintTone = saveError || autopsy.error ? "warn" : "muted";

  return (
    <Modal open={open} onClose={onClose} size="md" label="Plan and record a trade">
      <SheetFrame
        onClose={onClose}
        onBack={back ? () => go(back) : undefined}
        hint={step === "done" ? null : <Hint text={hintText} tone={hintTone} />}
        actions={
          <>
            {step === "chart" && <QuietButton disabled={saving} onClick={() => go("autopsy")}>Skip for now</QuietButton>}
            <PrimaryButton disabled={!gate.ok} loading={saving || (step === "autopsy" && autopsy.saving)} onClick={onContinue}>{continueLabel}</PrimaryButton>
          </>
        }
      >
        <StepTransition stepKey={step} dir={dir}>
          {step === "plan" && (
            // No space-y here: each revealed question carries its own lead-in spacing, so gaps are even
            // and animate with the unfold (no doubled margins).
            <div>
              <StepTitle title="What's the plan?" subtitle="A sentence or two is plenty." />
              <div className="space-y-2.5 pt-7">
                <Label done={thesis.trim().length > 0} htmlFor="flow-plan">Your read</Label>
                <TextBlock id="flow-plan" autoFocus value={thesis} onChange={(e) => setThesis(e.target.value)} placeholder="Where do you expect price to go, and why?" />
              </div>
              {showFeeling && (
                <Reveal>
                  <div className="space-y-3">
                    <Label done={emotion !== ""}>How are you feeling?</Label>
                    <Stagger className="flex flex-wrap gap-2" delay={0.08}>
                      {PRIMARY_EMOTIONS.map((e) => <Chip key={e} selected={emotion === e} onClick={() => setEmotion(emotion === e ? "" : e)}>{label(e)}</Chip>)}
                      {(moreEmotions || MORE_EMOTIONS.includes(emotion as never)) && MORE_EMOTIONS.map((e) => <Chip key={e} selected={emotion === e} onClick={() => setEmotion(emotion === e ? "" : e)}>{label(e)}</Chip>)}
                      {!moreEmotions && !MORE_EMOTIONS.includes(emotion as never) && <Chip selected={false} onClick={() => setMoreEmotions(true)}>More…</Chip>}
                    </Stagger>
                  </div>
                </Reveal>
              )}
              {showReason && (
                <Reveal focus>
                  <div className="space-y-2.5">
                    <Label done={emotionReason.trim().length > 0} htmlFor="flow-reason">{emotion ? `What's behind feeling ${label(emotion).toLowerCase()}?` : "What's behind that feeling?"}</Label>
                    <TextBlock id="flow-reason" maxLength={280} value={emotionReason} onChange={(e) => setEmotionReason(e.target.value)} placeholder="A few words is plenty." />
                  </div>
                </Reveal>
              )}
              {showNews && (
                <Reveal>
                  <div className="space-y-3">
                    <Label done={newsAnswer !== null}>Any news or events today?</Label>
                    <Stagger className="flex flex-wrap gap-2" delay={0.08}>
                      <Chip selected={newsAnswer === true} onClick={() => chooseNews(true)}>Yes</Chip>
                      <Chip selected={newsAnswer === false} onClick={() => chooseNews(false)}>No news</Chip>
                    </Stagger>
                    <AnimatePresence initial={false}>
                      {newsAnswer && (
                        <motion.div key="news-list" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={FLOW_EXPAND} className="overflow-hidden">
                          {/* Inset-grouped list: one rounded group, hairline dividers, compact time field, "add" row last. */}
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
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </Reveal>
              )}
              {showDetail && (
                <Reveal delay={0.12}>
                  <Disclosure label="Add detail" autoFocusOnOpen>
                    <div className="space-y-2.5">
                      <Label hint="optional" htmlFor="flow-instrument">Instrument</Label>
                      <TextBox id="flow-instrument" value={instrument} onChange={(e) => setInstrument(e.target.value.toUpperCase())} placeholder="MNQ" className="max-w-[12rem] font-mono" />
                      <Stagger className="flex flex-wrap gap-2" delay={0.05}>
                        {suggestedInstruments.map((i) => <Chip key={i} selected={instrument === i} onClick={() => setInstrument(instrument === i ? "" : i)}>{i}</Chip>)}
                      </Stagger>
                    </div>
                    <div className="space-y-2.5"><Label htmlFor="flow-draw">Where is the draw on liquidity?</Label><TextBox id="flow-draw" value={draw} onChange={(e) => setDraw(e.target.value)} /></div>
                    <div className="space-y-2.5"><Label htmlFor="flow-inval">What would invalidate it?</Label><TextBox id="flow-inval" value={invalidation} onChange={(e) => setInvalidation(e.target.value)} /></div>
                    <div className="space-y-2.5"><Label htmlFor="flow-break">What could make you break the plan?</Label><TextBox id="flow-break" value={breakPlan} onChange={(e) => setBreakPlan(e.target.value)} /></div>
                  </Disclosure>
                </Reveal>
              )}
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
                  <motion.div key={selectedPlaybook.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.26, ease: FLOW_EASE }} className="overflow-hidden">
                    <div className="space-y-3 pb-1">
                      <div className="flex items-center justify-between">
                        <p className="text-[13px] font-medium text-muted">Confirm each rule</p>
                        <p className="text-[12px] tabular-nums text-faint">{confirmedRules}/{rules.length}</p>
                      </div>
                      <div className="h-[3px] overflow-hidden rounded-full bg-line-soft"><div className="h-full rounded-full bg-profit transition-[width] duration-300" style={{ width: `${(confirmedRules / rules.length) * 100}%` }} /></div>
                      <div className="space-y-2">
                        {rules.map((r, i) => {
                          const checked = ruleStates[String(i)] === "ready";
                          return <CheckRow key={i} checked={checked} title={r.text || `Rule ${i + 1}`} note={r.description} onClick={() => setRuleStates({ ...ruleStates, [String(i)]: checked ? "waiting" : "ready" })} />;
                        })}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {step === "trade" && (
            <div className="space-y-8">
              <StepTitle title="Log the trade" />
              <Segmented value={mode} onChange={(m) => { setMode(m); setSaveError(null); }} options={[{ id: "manual", label: "Manual" }, { id: "import", label: "Import CSV" }]} />

              {mode === "manual" && (
                <div className="space-y-7">
                  <div className="rounded-[26px] border border-line bg-raised px-6 py-7 text-center">
                    <Label htmlFor="flow-pnl">Net P&amp;L</Label>
                    <div className="mt-3 flex items-baseline justify-center gap-1.5">
                      <span className="text-[28px] text-faint">{sym}</span>
                      <input
                        id="flow-pnl"
                        autoFocus
                        inputMode="decimal"
                        value={pnl}
                        onChange={(e) => setPnl(cleanNumber(e.target.value))}
                        placeholder="0.00"
                        aria-invalid={pnlInvalid || undefined}
                        className={cn("w-44 bg-transparent text-center font-mono text-[44px] tracking-tight outline-none placeholder:text-faint/60", pnlValue > 0 && "text-profit", pnlValue < 0 && "text-loss", pnlInvalid && "text-loss")}
                      />
                    </div>
                    <p className="mt-2 min-h-5 text-[12.5px] text-faint">{pnlInvalid ? <span className="text-loss">Numbers only — negative for a loss</span> : "Negative for a loss"}</p>
                  </div>
                  <div className="space-y-3">
                    <Label hint="optional">Direction</Label>
                    <div className="grid grid-cols-2 gap-3">
                      {(["long", "short"] as const).map((d) => (
                        <button key={d} type="button" aria-pressed={direction === d} onClick={() => setDirection(direction === d ? null : d)}
                          className={cn("rounded-2xl border py-3.5 text-[16px] font-semibold capitalize transition-all duration-150 active:scale-[0.97]",
                            direction === d ? (d === "long" ? "border-profit/50 bg-profit/10 text-profit" : "border-loss/50 bg-loss/10 text-loss") : "border-line bg-raised text-muted hover:border-line-strong hover:text-ink")}>
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>
                  {!instrument.trim() && (
                    <div className="space-y-2.5"><Label hint="optional" htmlFor="flow-tinst">Instrument</Label><TextBox id="flow-tinst" value={tradeInstrument} onChange={(e) => setTradeInstrument(e.target.value.toUpperCase())} placeholder="NQ" className="max-w-[12rem] font-mono" /></div>
                  )}
                  <Disclosure label="More detail">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2.5"><Label htmlFor="flow-date">Day</Label><TextBox id="flow-date" type="date" max={todayKey()} value={tradeDate} onChange={(e) => setTradeDate(e.target.value)} /></div>
                      <div className="space-y-2.5"><Label htmlFor="flow-rr">R multiple</Label><TextBox id="flow-rr" inputMode="decimal" placeholder="2.5" value={rr} onChange={(e) => setRr(cleanNumber(e.target.value))} className="font-mono" /></div>
                      <div className="space-y-2.5"><Label htmlFor="flow-in">Entry time</Label><TextBox id="flow-in" type="time" value={entryTime} onChange={(e) => setEntryTime(e.target.value)} /></div>
                      <div className="space-y-2.5"><Label htmlFor="flow-out">Exit time</Label><TextBox id="flow-out" type="time" value={exitTime} onChange={(e) => setExitTime(e.target.value)} /></div>
                    </div>
                  </Disclosure>
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
              {createdId && <button type="button" onClick={() => { useUi.getState().openMinatoWithTrade(createdId); onClose(); }} className="mt-6 text-[14px] font-medium text-gold hover:underline">Talk it through with MINATO</button>}
            </div>
          )}
        </StepTransition>
      </SheetFrame>
    </Modal>
  );
}
