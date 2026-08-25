"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useApp } from "@/lib/store";
import { PLAN_EMOTIONS, type TradePlan, type PlanRuleState } from "@/lib/types";
import { todayKey } from "@/lib/format";
import { detectPatterns, matchPlanToPatterns } from "@/lib/minato/patterns";
import { Button } from "@/components/ui/button";
import { Field, TextArea, TextInput } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { MinatoAvatar, MinatoBubble } from "@/components/ai/minato-visual";
import { cn } from "@/lib/utils";
import { EASE } from "@/components/landing/reveal";

/**
 * Plan a Trade — guided pre-market ritual. A plan is NOT a trade:
 * no entry/exit/P&L required. Save as PLANNED / READY TO WAIT.
 */
export function PlanTradeFlow({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const entries = useApp((s) => s.entries);
  const plans = useApp((s) => s.plans);
  const settings = useApp((s) => s.settings);
  const playbook = settings.playbook ?? [];
  const challenges = settings.challenges ?? [];

  const [step, setStep] = useState(0);
  const [date, setDate] = useState(todayKey());
  const [challengeId, setChallengeId] = useState("");
  const [playbookId, setPlaybookId] = useState("");
  const [instrument, setInstrument] = useState("");
  const [bias, setBias] = useState<"long" | "short" | "either">("either");
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
  const [ruleStates, setRuleStates] = useState<Record<string, PlanRuleState>>({});
  const [saving, setSaving] = useState(false);

  const selectedPlaybook = playbook.find((p) => p.id === playbookId);
  const planRules: { label: string; state: PlanRuleState }[] = useMemo(
    () =>
      (selectedPlaybook?.entryConditions?.split("\n").filter(Boolean) ?? []).map((label, i) => ({
        label: `Rule ${i + 1}: ${label}`,
        state: ruleStates[String(i)] ?? "waiting",
      })),
    [selectedPlaybook, ruleStates],
  );

  useEffect(() => {
    if (!open) return;
    setDate(todayKey());
    setChallengeId(challenges[0]?.id ?? "");
    setPlaybookId(playbook[0]?.id ?? "");
    setInstrument(""); setBias("either"); setThesis("");
    setDrawOnLiquidity(""); setDrawLevel(""); setLiquidityObservations(""); setImportantLevels("");
    setMustHappenBeforeEntry(""); setInvalidation(""); setExpectedTarget("");
    setEmotionalState(""); setEmotionalNote(""); setWhatCouldBreakPlan("");
    setRuleStates({}); setStep(0);
  }, [open, challenges, playbook]);

  const patterns = useMemo(() => detectPatterns(entries), [entries]);
  const planText = `${thesis} ${drawOnLiquidity} ${mustHappenBeforeEntry} ${whatCouldBreakPlan}`;
  const planMatch = useMemo(() => matchPlanToPatterns(planText, patterns), [planText, patterns]);

  const stepTitles = ["Pre-market", "Emotional state", "Playbook checklist"];
  const canNext = step === 0 ? thesis.trim().length > 0 : true;

  const save = async (status: TradePlan["status"]) => {
    setSaving(true);
    try {
      const plan: TradePlan = {
        id: `pl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        date,
        challengeId: challengeId || undefined,
        playbookId: playbookId || undefined,
        playbookName: selectedPlaybook?.name,
        playbookVersion: selectedPlaybook?.version,
        instrument: instrument.trim() || undefined,
        bias,
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
        rules: planRules.map((r) => ({ label: r.label, state: r.state })),
        status,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      await useApp.getState().savePlan(plan);
      toast.success(status === "ready" ? "Plan ready — wait for your setup." : "Plan saved.", "MINATO will compare it with what actually happens.");
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" label="Plan a trade" title="Plan a trade">
      <div className="px-6 py-6 sm:px-8">
        {/* Progress */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5" aria-hidden>
            {stepTitles.map((label, i) => (
              <span key={label} title={label} className={cn("h-1.5 rounded-full transition-all duration-300", i === step ? "w-6 bg-gold" : i < step ? "w-1.5 bg-profit/60" : "w-1.5 bg-line-strong")} />
            ))}
          </div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-faint">{stepTitles[step]}</p>
        </div>

        {/* MINATO appears at the checklist step */}
        <AnimatePresence>
          {step === 2 && (
            <motion.div
              initial={reduceSafe() ? { opacity: 0 } : { opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="mt-4 flex items-start justify-end gap-2"
            >
              <MinatoBubble state="curious" text="Okay bro. Thesis clear ga undi. Ippudu setup ni prove cheyyali — conditions okati okati ga checkiddam." />
              <MinatoAvatar state="curious" size={44} />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-5 min-h-[260px]">
          <AnimatePresence mode="wait" initial={false}>
            {step === 0 && (
              <StepShell key="premarket" title="Pre-market analysis" subtitle="What do you expect from today's session?">
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Planned day" htmlFor="plan-date">
                      <TextInput id="plan-date" type="date" max={todayKey()} value={date} onChange={(e) => setDate(e.target.value)} />
                    </Field>
                    <Field label="Instrument" hint="optional" htmlFor="plan-instrument">
                      <TextInput id="plan-instrument" placeholder="NQ, ES…" value={instrument} onChange={(e) => setInstrument(e.target.value.toUpperCase())} />
                    </Field>
                  </div>
                  <Field label="What is price likely to do today?" hint="your thesis — stored exactly as written" htmlFor="plan-thesis">
                    <TextArea id="plan-thesis" className="min-h-24" placeholder="Write your market thesis freely…" value={thesis} onChange={(e) => setThesis(e.target.value)} />
                  </Field>
                  <Field label="Where is the draw on liquidity?" htmlFor="plan-draw">
                    <TextInput id="plan-draw" placeholder="e.g. overnight high above equal highs" value={drawOnLiquidity} onChange={(e) => setDrawOnLiquidity(e.target.value)} />
                  </Field>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Level" hint="optional" htmlFor="plan-level">
                      <TextInput id="plan-level" className="tabular" placeholder="e.g. 22,540" value={drawLevel} onChange={(e) => setDrawLevel(e.target.value)} />
                    </Field>
                    <Field label="Waiting for which playbook?" hint="optional" htmlFor="plan-playbook">
                      <select id="plan-playbook" value={playbookId} onChange={(e) => setPlaybookId(e.target.value)} className="w-full rounded-control border border-line bg-raised px-3.5 py-2.5 text-[15px] text-ink focus:border-gold/60 focus:outline-none">
                        <option value="">—</option>
                        {playbook.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                      </select>
                    </Field>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="What must happen before you consider an entry?" htmlFor="plan-must">
                      <TextInput id="plan-must" placeholder="e.g. sweep + SMT confirmation" value={mustHappenBeforeEntry} onChange={(e) => setMustHappenBeforeEntry(e.target.value)} />
                    </Field>
                    <Field label="What would invalidate the idea?" htmlFor="plan-invalid">
                      <TextInput id="plan-invalid" placeholder="e.g. reclaims the swept level" value={invalidation} onChange={(e) => setInvalidation(e.target.value)} />
                    </Field>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Expected target" hint="optional" htmlFor="plan-target">
                      <TextInput id="plan-target" placeholder="e.g. opposing PD array" value={expectedTarget} onChange={(e) => setExpectedTarget(e.target.value)} />
                    </Field>
                    <Field label="Challenge" hint="optional" htmlFor="plan-challenge">
                      <select id="plan-challenge" value={challengeId} onChange={(e) => setChallengeId(e.target.value)} className="w-full rounded-control border border-line bg-raised px-3.5 py-2.5 text-[15px] text-ink focus:border-gold/60 focus:outline-none">
                        <option value="">No challenge</option>
                        {challenges.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                    </Field>
                  </div>
                  <Field label="Other liquidity / levels you're watching" hint="optional" htmlFor="plan-levels">
                    <TextArea id="plan-levels" className="min-h-14" value={liquidityObservations} onChange={(e) => setLiquidityObservations(e.target.value)} />
                  </Field>
                </div>
              </StepShell>
            )}

            {step === 1 && (
              <StepShell key="emotion" title="Emotional state check" subtitle="Not a diagnosis — so MINATO can compare pre-trade state against actual execution.">
                <div className="flex flex-wrap gap-1.5">
                  {PLAN_EMOTIONS.map((e) => (
                    <button
                      key={e}
                      type="button"
                      aria-pressed={emotionalState === e}
                      onClick={() => setEmotionalState(emotionalState === e ? "" : e)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                        emotionalState === e ? "border-gold/50 bg-gold/[0.1] text-gold" : "border-line bg-raised/60 text-faint hover:text-muted",
                      )}
                    >
                      {e.charAt(0) + e.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>
                <Field label="What is influencing your emotional state?" hint="optional" htmlFor="plan-emotion-note">
                  <TextArea id="plan-emotion-note" className="mt-2 min-h-16" placeholder="Sleep, yesterday's result, news…" value={emotionalNote} onChange={(e) => setEmotionalNote(e.target.value)} />
                </Field>
                <Field label="What could cause you to break your plan today?" hint="predicted behavior — MINATO compares it with what you actually do" htmlFor="plan-break">
                  <TextArea id="plan-break" className="min-h-16" placeholder="e.g. I may enter early because I don't want to miss the move." value={whatCouldBreakPlan} onChange={(e) => setWhatCouldBreakPlan(e.target.value)} />
                </Field>

                {/* Proactive pattern warning — evidence-based, dismissible */}
                {planMatch && planMatch.pattern.count >= 2 && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-4 rounded-xl border border-gold/40 bg-gold/[0.07] p-4">
                    <div className="flex items-start gap-2.5">
                      <MinatoAvatar state="warning" size={36} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] leading-relaxed text-ink">
                          Bro, this sounds similar to the <strong className="text-gold">{planMatch.pattern.label}</strong> pattern
                          you&apos;ve recorded before ({planMatch.pattern.count}×, {planMatch.pattern.confidence}).
                          Check whether your actual setup conditions are confirmed before treating this as an entry.
                        </p>
                        <PatternEvidenceDisclosure pattern={planMatch.pattern} />
                      </div>
                    </div>
                  </motion.div>
                )}
              </StepShell>
            )}

            {step === 2 && (
              <StepShell key="checklist" title="Setup rule checklist" subtitle={selectedPlaybook ? `From playbook: ${selectedPlaybook.name} (v${selectedPlaybook.version ?? 1})` : "No playbook selected — pick one to get its rules."}>
                {planRules.length === 0 ? (
                  <p className="rounded-control border border-dashed border-line-strong px-4 py-8 text-center text-sm text-muted">
                    Select a playbook in step 1 to load its rules here.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {planRules.map((r, i) => (
                      <div key={i} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-raised/60 px-4 py-2.5">
                        <span className="text-[13px] text-ink">{r.label}</span>
                        <div className="flex gap-1" role="group" aria-label={r.label}>
                          {(["waiting", "expected", "ready", "invalidated"] as PlanRuleState[]).map((st) => (
                            <button
                              key={st}
                              type="button"
                              aria-pressed={r.state === st}
                              onClick={() => setRuleStates({ ...ruleStates, [String(i)]: st })}
                              className={cn(
                                "rounded-md px-2.5 py-1 text-[11px] font-medium capitalize transition-colors",
                                r.state === st
                                  ? st === "ready" ? "bg-profit/[0.14] text-profit" : st === "invalidated" ? "bg-loss/[0.12] text-loss" : "bg-gold/[0.14] text-gold"
                                  : "text-faint hover:text-muted",
                              )}
                            >
                              {st}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </StepShell>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
          <Button variant="ghost" size="sm" onClick={() => void save("planned")} disabled={saving}>
            Save plan
          </Button>
          <div className="flex items-center gap-2.5">
            {step > 0 && <Button variant="subtle" size="sm" onClick={() => setStep((s) => s - 1)} disabled={saving}>Back</Button>}
            {step < 2 ? (
              <Button variant="gold" size="sm" disabled={!canNext || saving} onClick={() => setStep((s) => s + 1)}>Next</Button>
            ) : (
              <Button variant="gold" size="sm" loading={saving} disabled={saving} onClick={() => void save("ready")}>
                Save — ready to wait
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function reduceSafe(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function StepShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
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
