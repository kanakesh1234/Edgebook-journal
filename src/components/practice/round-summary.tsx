"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ChartPanel } from "@/components/practice/ChartPanel";
import { MODE_META, ModeBadge, tint } from "@/components/practice/modes";
import { Bar, Eyebrow, StatTile, surface } from "@/components/practice/ui";
import { FLOW_EASE, IconCheck, PrimaryButton, QuietButton, glass } from "@/components/journal/flow-ui";
import { cn } from "@/lib/utils";
import type { JournalEntry } from "@/lib/types";
import type { ArenaMode, RoundOutcome } from "@/lib/practice/arena";
import type { RoundResult } from "@/components/practice/round-runner";

const pct = (n: number) => `${Math.round(n * 100)}%`;

/** One requirement of the gate: what was needed, what you got, and whether it counted. */
function GateRow({ label, got, need, display, accent }: { label: string; got: number; need: number; display: string; accent: string }) {
  const pass = got >= need;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-[13px]">
        <span className="flex items-center gap-2 font-medium text-ink">
          <span className={cn("grid h-4 w-4 place-items-center rounded-full", pass ? "bg-profit text-canvas" : "bg-ink/10 text-transparent")}><IconCheck className="h-2.5 w-2.5" /></span>
          {label}
        </span>
        <span className="num text-muted">{display}</span>
      </div>
      <Bar value={Math.min(1, got / Math.max(need, 0.0001)) * 100} accent={pass ? "var(--profit)" : accent} />
    </div>
  );
}

export function RoundSummary({ title, mode, summary, entries, onNext, onClose }: { title: string; mode: ArenaMode; summary: { result: RoundResult; outcome: RoundOutcome }; entries: JournalEntry[]; onNext: () => void; onClose: () => void }) {
  const { result, outcome } = summary;
  const reduce = useReducedMotion();
  const meta = MODE_META[mode];
  const [open, setOpen] = useState<string | null>(null);
  const missed = result.answers.filter((a) => !a.correct);

  const head = {
    up: { eyebrow: "Level up", title: `Level ${outcome.nextLevel}`, sub: `You cleared ${outcome.gate.correct} correct at ${pct(outcome.gate.accuracy)}.`, next: "Questions get a little harder from here." },
    hold: { eyebrow: "Round complete", title: `Level ${outcome.level} holds`, sub: `One more strong round gets you to Level ${outcome.level + 1}.${outcome.nextFails >= 1 && outcome.level > 1 ? " Miss again and you drop a level." : ""}`, next: "Same level next — the questions you missed come back so you can lock them in." },
    down: { eyebrow: "Round complete", title: `Back to level ${outcome.nextLevel}`, sub: "A step back to rebuild momentum. You will climb again.", next: "Questions ease off a little while you rebuild." },
    early: { eyebrow: "Round ended", title: "Level unchanged", sub: "Leaving early never costs a level.", next: "" },
  }[outcome.outcome];

  const shownLevel = outcome.outcome === "early" ? outcome.level : outcome.nextLevel;
  const celebrate = outcome.outcome === "up";

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-canvas text-ink">
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[44vh]" style={{ background: `radial-gradient(70% 100% at 50% 0%, ${tint(meta.accent, celebrate ? 16 : 9)}, transparent)` }} />

      <div className="relative mx-auto max-w-2xl px-6 pb-36 pt-14 sm:pt-20">
        <div className="flex items-center gap-5">
          <motion.div
            initial={reduce ? false : { scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 380, damping: 22 }}
            className="relative grid h-20 w-20 shrink-0 place-items-center rounded-[26px]"
            style={{ background: `linear-gradient(150deg, ${tint(meta.accent, 30, "var(--raised)")}, ${tint(meta.accent, 12, "var(--raised)")})`, border: `1px solid ${tint(meta.accent, 36)}`, boxShadow: `inset 0 1px 0 rgb(255 255 255 / 0.45), 0 14px 30px -14px ${tint(meta.accent, celebrate ? 70 : 40)}` }}
          >
            <span className="kpi text-[38px] leading-none tabular-nums" style={{ color: tint(meta.accent, 78, "var(--ink)") }}>{shownLevel}</span>
            <span className="absolute -bottom-2 rounded-full border border-line bg-raised px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.12em] text-muted">Level</span>
          </motion.div>
          <div className="min-w-0">
            <div className="flex items-center gap-2"><ModeBadge mode={mode} size="sm" /><Eyebrow>{title} · {head.eyebrow}</Eyebrow></div>
            <motion.h1 initial={reduce ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: FLOW_EASE }} className="mt-2 text-[34px] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[44px]">{head.title}</motion.h1>
          </div>
        </div>
        <p className="mt-5 max-w-[46ch] text-[16px] leading-snug text-muted">{head.sub}</p>

        <div className="mt-9 grid grid-cols-3 gap-3">
          <StatTile label="Correct" value={`${result.correct}/${result.total}`} />
          <StatTile label="Accuracy" value={pct(result.accuracy)} />
          <StatTile label="XP" value={`+${result.xp}`} note={result.maxCombo >= 3 ? `Best flow ×${result.maxCombo}` : undefined} />
        </div>

        {outcome.outcome !== "early" && (
          <section className={cn(surface.editorial, "mt-3 p-6")}>
            <Eyebrow>What Level {outcome.level} asked for</Eyebrow>
            <div className="mt-4 space-y-4">
              <GateRow label="Correct answers" got={result.correct} need={outcome.gate.correct} display={`${result.correct} of ${outcome.gate.correct}`} accent={meta.accent} />
              <GateRow label="Accuracy" got={result.accuracy} need={outcome.gate.accuracy} display={`${pct(result.accuracy)} of ${pct(outcome.gate.accuracy)}`} accent={meta.accent} />
            </div>
          </section>
        )}

        {(head.next || missed.length > 0) && (
          <p className="mt-6 text-[14px] leading-snug text-muted">
            {head.next}
            {missed.length > 0 && ` ${missed.length === 1 ? "The question you missed comes" : `The ${missed.length} questions you missed come`} back in your next round.`}
          </p>
        )}

        <section className="mt-10">
          <h2 className="text-[15px] font-semibold text-ink">{missed.length ? `Review · ${missed.length} missed` : "Clean round"}</h2>
          {missed.length === 0 && result.total > 0 && <p className="mt-1.5 text-[14px] text-muted">Nothing to review.</p>}
          <div className="mt-3 space-y-3">
            {missed.map((a) => {
              const ids = a.question.chartTradeIds ?? (a.question.tradeId ? [a.question.tradeId] : []);
              const shots = ids.map((id) => entries.find((e) => e.id === id)).filter((e): e is JournalEntry => !!e && (e.images?.length ?? 0) > 0);
              return (
                <article key={a.fp} className={cn(surface.editorial, "p-5")}>
                  <p className="text-[16px] font-medium leading-snug">{a.prompt}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-[13px]">
                    <span className="rounded-full bg-loss/10 px-3 py-1 text-loss">You: {a.yourAnswer}</span>
                    <span className="rounded-full bg-profit/10 px-3 py-1 text-profit">Answer: <b className="font-semibold">{a.correctAnswer}</b></span>
                  </div>
                  <p className="mt-3 text-[14px] leading-relaxed text-muted">{a.question.explanation}</p>
                  {a.question.evidence && <p className="mt-3 border-l-2 border-gold-strong pl-3 text-[13px] italic text-muted">From your notes: “{a.question.evidence}”</p>}
                  {shots.length > 0 && (
                    <>
                      <button type="button" onClick={() => setOpen(open === a.fp ? null : a.fp)} className="mt-3 text-[13px] font-semibold text-gold">{open === a.fp ? "Hide chart" : "Show chart"}</button>
                      {open === a.fp && <div className="mt-3"><ChartPanel entries={shots} /></div>}
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </div>

      <div className={cn("fixed inset-x-0 bottom-0 z-10 border-t border-line/60", glass.bar)}>
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-6 py-4">
          <QuietButton onClick={onClose}>Done</QuietButton>
          <PrimaryButton onClick={onNext}>Next round · Level {outcome.nextLevel}</PrimaryButton>
        </div>
      </div>
    </div>
  );
}
