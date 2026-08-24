"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { JournalEntry, TradeReflection } from "@/lib/types";
import { formatSignedMoney, weekdayLong } from "@/lib/format";
import { useApp } from "@/lib/store";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { TextArea } from "@/components/ui/input";
import { ShieldIcon, SparklesIcon, TargetIcon } from "@/components/ui/icons";import { cn } from "@/lib/utils";
import { EASE } from "@/components/landing/reveal";

/**
 * ReflectionFlow — the post-trade review.
 * A short, progressive conversation with yourself after a session:
 * what worked, what didn't, whether process was followed, and the
 * one change for next time. Adapts to the trade's outcome.
 */

interface Step {
  key: keyof TradeReflection | "process";
  question: string;
  hint: string;
}

function buildSteps(entry: JournalEntry): Step[] {
  const loss = entry.pnl < 0;
  const steps: Step[] = loss
    ? [
        { key: "wentPoorly", question: "What didn't go well?", hint: "Be specific — the tape forgives nothing." },
        { key: "wentWell", question: "What went well, even small?", hint: "One thing done right is worth keeping." },
      ]
    : [
        { key: "wentWell", question: "What went well?", hint: "Name it, so you can repeat it." },
        { key: "wentPoorly", question: "Anything that didn't go well?", hint: "Even green days have leaks." },
      ];
  steps.push({ key: "process", question: "Did you follow your process?", hint: "Setup and risk — the two promises you keep." });
  steps.push({
    key: "lesson",
    question: entry.pnl < 0 ? "What will you do differently next time?" : "What should you repeat next time?",
    hint: "One sentence is enough.",
  });
  return steps;
}

export function ReflectionFlow({
  open,
  entry,
  onClose,
}: {
  open: boolean;
  entry: JournalEntry | null;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const [wentWell, setWentWell] = useState("");
  const [wentPoorly, setWentPoorly] = useState("");
  const [followedSetup, setFollowedSetup] = useState<boolean | null>(null);
  const [followedRisk, setFollowedRisk] = useState<boolean | null>(null);
  const [lesson, setLesson] = useState("");
  const [saving, setSaving] = useState(false);

  // Hydrate from an existing reflection each time the flow opens
  useEffect(() => {
    if (!open) return;
    const r = entry?.reflection;
    setWentWell(r?.wentWell ?? "");
    setWentPoorly(r?.wentPoorly ?? "");
    setFollowedSetup(r?.followedSetup ?? null);
    setFollowedRisk(r?.followedRisk ?? null);
    setLesson(r?.lesson ?? "");
    setStep(0);
  }, [open, entry]);

  const steps = useMemo(() => (entry ? buildSteps(entry) : []), [entry]);
  const riskSlipped = followedRisk === false;

  if (!entry) return null;

  const answers: Record<string, string> = {
    wentWell,
    wentPoorly,
    lesson,
    process: "",
  };

  const canContinue =
    steps[step].key !== "process" || followedSetup !== null || followedRisk !== null;

  const next = () => {
    if (step < steps.length - 1) setStep((s) => s + 1);
    else void save();
  };

  const save = async () => {
    setSaving(true);
    try {
      const reflection: TradeReflection = {
        wentWell: wentWell.trim() || undefined,
        wentPoorly: wentPoorly.trim() || undefined,
        followedSetup,
        followedRisk,
        lesson: lesson.trim() || undefined,
        updatedAt: Date.now(),
      };
      await useApp.getState().saveReflection(entry.id, reflection);
      toast.success("Reflection saved", "+10 XP — the review is the edge.");
      onClose();
    } catch {
      toast.error("Could not save the reflection", "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const current = steps[step];
  const value = answers[current?.key ?? ""] ?? "";

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      label="Trade reflection"
    >
      <div className="px-6 py-6 sm:px-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-gold">
              {weekdayLong(entry.date)} · {formatSignedMoney(entry.pnl)}
            </p>
            <h2 className="mt-1 font-display text-xl font-semibold tracking-[-0.02em] text-ink">
              {current?.question}
            </h2>
            <p className="mt-1 text-[13px] text-muted">
              {step === 0 ? "Four short steps — the review is the edge." : current?.hint}
            </p>
          </div>
          <div className="flex items-center gap-1.5 pt-1.5" aria-hidden>
            {steps.map((_, i) => (
              <span
                key={i}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === step ? "w-5 bg-gold" : i < step ? "w-1.5 bg-profit/60" : "w-1.5 bg-line-strong",
                )}
              />
            ))}
          </div>
        </div>

        {/* Steps */}
        <div className="mt-6 min-h-[150px]">
          <AnimatePresence mode="wait" initial={false}>
            {current?.key === "process" ? (
              <motion.div
                key="process"
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.25, ease: EASE }}
                className="space-y-4"
              >
                <ProcessQuestion
                  icon={<TargetIcon className="h-4 w-4" />}
                  label="Did you trade your setup?"
                  value={followedSetup}
                  onChange={setFollowedSetup}
                />
                <ProcessQuestion
                  icon={<ShieldIcon className="h-4 w-4" />}
                  label="Did you respect your risk rules?"
                  value={followedRisk}
                  onChange={setFollowedRisk}
                />
                {riskSlipped && (
                  <motion.p
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-lg border border-loss/25 bg-loss/[0.06] px-3.5 py-2.5 text-[13px] leading-relaxed text-loss"
                  >
                    Risk slipped on this trade. What happened? Write it below — honest notes are worth more than green days.
                  </motion.p>
                )}
                <TextArea
                  aria-label="What happened with process"
                  placeholder="Context, trigger, what pulled you in…"
                  value={lesson}
                  maxLength={2000}
                  onChange={(e) => setLesson(e.target.value)}
                  className="min-h-20"
                />
              </motion.div>
            ) : (
              <motion.div
                key={current?.key ?? step}
                initial={{ opacity: 0, x: 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -24 }}
                transition={{ duration: 0.25, ease: EASE }}
              >
                {current && (
                  <>
                    <p className="text-[13px] text-muted">{current.hint}</p>
                    <TextArea
                      aria-label={current.question}
                      autoFocus
                      placeholder="Type freely — this journal is private."
                      className="mt-3 min-h-24"
                      maxLength={2000}
                      value={value}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (current.key === "wentWell") setWentWell(v);
                        else if (current.key === "wentPoorly") setWentPoorly(v);
                        else if (current.key === "lesson") setLesson(v);
                      }}
                    />
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-between border-t border-line pt-5">
          <Button variant="ghost" size="sm" onClick={onClose} disabled={saving}>
            Skip for now
          </Button>
          <div className="flex items-center gap-2.5">
            {step > 0 && (
              <Button variant="subtle" size="sm" onClick={() => setStep((s) => s - 1)} disabled={saving}>
                Back
              </Button>
            )}
            <Button variant="gold" size="sm" onClick={() => void next()} loading={saving} disabled={saving || !canContinue}>
              {step === steps.length - 1 ? (
                <>
                  <SparklesIcon className="h-4 w-4" />
                  Save reflection
                </>
              ) : (
                "Continue"
              )}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

function ProcessQuestion({
  icon,
  label,
  value,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-raised/60 px-4 py-3">
      <p className="flex items-center gap-2.5 text-sm font-medium text-ink">
        <span className="text-muted">{icon}</span>
        {label}
      </p>
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-canvas/60 p-1" role="group" aria-label={label}>
        {[
          { v: true, label: "Yes" },
          { v: false, label: "No" },
        ].map((opt) => (
          <button
            key={opt.label}
            type="button"
            aria-pressed={value === opt.v}
            onClick={() => onChange(value === opt.v ? null : opt.v)}
            className={cn(
              "rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-colors",
              value === opt.v
                ? opt.v
                  ? "bg-profit/[0.14] text-profit"
                  : "bg-loss/[0.12] text-loss"
                : "text-faint hover:text-muted",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
