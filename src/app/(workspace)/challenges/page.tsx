"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { useApp } from "@/lib/store";
import { challengeReminder, challengeProgress, type ChallengeProgress } from "@/lib/challenges";
import type { Challenge, DrawdownMode } from "@/lib/types";
import { formatSignedMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Field, TextArea, TextInput } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/misc";
import { PlusIcon, TargetIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { EASE } from "@/components/landing/reveal";
import { uid } from "@/lib/utils";

/**
 * Challenges — top-level section. Each challenge is a distinct trading
 * period/objective with its own progress, drawdown model and milestones.
 */
export default function ChallengesPage() {
  const entries = useApp((s) => s.entries);
  const settings = useApp((s) => s.settings);
  const challenges = useMemo(() => settings.challenges ?? [], [settings]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Challenge | null>(null);

  const progressList = useMemo(
    () => challenges.map((c) => ({ challenge: c, progress: challengeProgress(c, entries) })),
    [challenges, entries],
  );

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            className="font-display text-[26px] font-semibold tracking-[-0.02em] text-ink sm:text-3xl sm:font-semibold"
          >
            Challenges
          </motion.h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            What am I trying to achieve? Each challenge is a distinct trading period with its own
            objective, drawdown model and milestones.
          </p>
        </div>
        <Button
          variant="gold"
          onClick={() => setCreating(true)}
        >
          <PlusIcon className="h-4 w-4" />
          New challenge
        </Button>
      </header>

      {progressList.length === 0 ? (
        <EmptyState
          icon={<TargetIcon className="h-7 w-7" />}
          title="No challenges yet"
          body="Create a challenge — a funded evaluation, a consistency month, a personal A+ execution period — and every trade you log against it builds its progress."
          action={<Button variant="gold" onClick={() => setCreating(true)}><PlusIcon className="h-4 w-4" />New challenge</Button>}
        />
      ) : (
        <div className="space-y-6">
          {progressList.map(({ challenge, progress }, i) => (
            <ChallengeCard
              key={challenge.id}
              challenge={challenge}
              progress={progress}
              delay={i * 0.06}
              onEdit={() => setEditing(challenge)}
            />
          ))}
        </div>
      )}

      <ChallengeFormModal
        open={creating || editing !== null}
        challenge={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </div>
  );
}

/* ------------------------------ challenge card ------------------------------ */

function ChallengeCard({
  challenge,
  progress,
  delay,
  onEdit,
}: {
  challenge: Challenge;
  progress: ChallengeProgress;
  delay: number;
  onEdit: () => void;
}) {
  const reminder = challengeReminder(progress);
  return (
    <motion.section
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: EASE }}
      className="panel p-5 sm:p-6"
      aria-label={`Challenge: ${challenge.name}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-[-0.02em] text-ink">{challenge.name}</h2>
          <p className="mt-0.5 text-xs text-faint">
            {challenge.drawdownMode === "dynamic" ? "Dynamic drawdown (trailing high-water mark)" : "Static drawdown (from starting balance)"}
            {challenge.startDate ? ` · started ${challenge.startDate}` : ""}
          </p>
        </div>
        <Button variant="subtle" size="sm" onClick={onEdit}>Edit</Button>
      </div>

      {reminder && (
        <p className="mt-4 rounded-control border border-gold/30 bg-gold/[0.06] px-4 py-2.5 text-[13px] leading-relaxed text-ink">
          {reminder}
        </p>
      )}

      {/* Stats grid */}
      <dl className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-control border border-line bg-line sm:grid-cols-4 lg:grid-cols-6">
        {([
          ["Starting", formatSignedMoney(progress.startingBalance)],
          ["Equity", formatSignedMoney(progress.currentEquity)],
          ["Target", formatSignedMoney(progress.targetBalance)],
          ["P&L", formatSignedMoney(progress.currentPnl)],
          ["Progress", `${progress.progressPct}%`],
          ["Max DD", formatSignedMoney(progress.maxDrawdown)],
          ["Current DD", formatSignedMoney(progress.currentDrawdown)],
          ["DD remaining", formatSignedMoney(progress.remainingDrawdown)],
          ["To target", formatSignedMoney(progress.distanceToTarget)],
          ["Trades", String(progress.trades)],
          ["Win rate", progress.winRate != null ? `${Math.round(progress.winRate * 100)}%` : "—"],
          ["Avg R", progress.avgR != null ? `${progress.avgR.toFixed(1)}R` : "—"],
        ] as const).map(([label, value]) => (
          <div key={label} className="bg-surface px-3.5 py-3">
            <dt className="text-[10px] font-medium uppercase tracking-[0.1em] text-faint">{label}</dt>
            <dd className="num mt-1 truncate text-sm font-semibold text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      {progress.ruleAdherence != null && (
        <p className="mt-2 text-xs text-muted">
          Rule adherence: <span className="num font-semibold text-ink">{Math.round(progress.ruleAdherence * 100)}%</span> across checklist-reviewed trades
        </p>
      )}

      {/* Milestone path */}
      <div className="mt-6" role="img" aria-label={`${progress.progressPct}% of challenge progress`}>
        <MilestonePath progress={progress} />
      </div>
    </motion.section>
  );
}

function MilestonePath({ progress }: { progress: ChallengeProgress }) {
  const pct = progress.progressPct;
  return (
    <div>
      <div className="relative mx-3 h-10">
        {/* base */}
        <div className="absolute inset-x-0 top-[38%] h-1.5 rounded-full bg-line-soft" />
        {/* fill */}
        <div
          className="absolute left-0 top-[38%] h-1.5 rounded-full bg-gradient-to-r from-profit-deep via-profit to-gold-strong transition-all duration-700"
          style={{ width: `${Math.min(100, progress.progress * 100)}%` }}
        />
        {/* start */}
        <Marker fraction={0} label="START" value={formatSignedMoney(progress.startingBalance, undefined, { compact: true })}>
          <span className="grid h-4 w-4 place-items-center rounded-full border-2 border-muted bg-surface"><span className="h-1 w-1 rounded-full bg-muted" /></span>
        </Marker>
        {progress.milestones.map((m) => (
          <Marker key={m.fraction} fraction={m.fraction} label={`${m.fraction * 100}%`} value={formatSignedMoney(m.equity, undefined, { compact: true })} passed={m.passed}>
            {m.passed ? (
              <span className="grid h-4 w-4 place-items-center rounded-full border-2 border-profit bg-surface text-profit">
                <svg viewBox="0 0 10 10" className="h-2 w-2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M2 5.2 4.2 7.4 8 3" /></svg>
              </span>
            ) : (
              <span className="h-2.5 w-2.5 rounded-full border-2 border-line-strong bg-surface" />
            )}
          </Marker>
        ))}
        {/* target */}
        <Marker fraction={1} label="TARGET" value={formatSignedMoney(progress.targetBalance, undefined, { compact: true })} align="end" gold>
          <span className={cn("grid h-4 w-4 place-items-center rounded-full border-2", progress.reachedTarget ? "border-profit bg-profit text-surface" : "border-gold-strong bg-surface text-gold-strong")}>◎</span>
        </Marker>
        {/* live equity marker */}
        {progress.trades > 0 && (
          <span className="absolute top-[38%] z-10 -translate-x-1/2 -translate-y-1/2" style={{ left: `${progress.progress * 100}%` }}>
            <span className="block h-3.5 w-3.5 rounded-full border-2 border-surface bg-ink shadow-sm" />
          </span>
        )}
      </div>
      <p className="mt-1 text-center text-xs text-faint" aria-live="polite">{pct}% complete</p>
    </div>
  );
}

function Marker({ fraction, label, value, children, align = "center", passed, gold }: {
  fraction: number;
  label: string;
  value?: string;
  children: React.ReactNode;
  align?: "center" | "end";
  passed?: boolean;
  gold?: boolean;
}) {
  return (
    <div className="absolute top-[38%] -translate-x-1/2 -translate-y-1/2" style={{ left: `${fraction * 100}%` }}>
      <div className="flex flex-col items-center gap-2">
        {children}
        <span className={cn("absolute top-6 whitespace-nowrap font-mono text-[9px] uppercase tracking-wider", gold ? "text-gold" : passed ? "text-profit" : "text-faint", align === "end" && "translate-x-1/2")}>
          {label}
        </span>
        {value && (
          <span className={cn("absolute top-11 whitespace-nowrap font-mono text-[9px] text-faint/70", align === "end" && "translate-x-1/2")}>
            {value}
          </span>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ form modal ------------------------------ */

function ChallengeFormModal({ open, challenge, onClose }: { open: boolean; challenge: Challenge | null; onClose: () => void }) {
  const editing = challenge ?? null;
  const [name, setName] = useState("");
  const [startingBalance, setStartingBalance] = useState("");
  const [targetBalance, setTargetBalance] = useState("");
  const [maxDrawdown, setMaxDrawdown] = useState("");
  const [drawdownMode, setDrawdownMode] = useState<DrawdownMode>("static");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dailyProfitTarget, setDailyProfitTarget] = useState("");
  const [dailyLossLimit, setDailyLossLimit] = useState("");
  const [tradeLimit, setTradeLimit] = useState("");
  const [instruments, setInstruments] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setStartingBalance(editing.startingBalance?.toString() ?? "");
      setTargetBalance(editing.targetBalance?.toString() ?? "");
      setMaxDrawdown(editing.maxDrawdown?.toString() ?? "");
      setDrawdownMode(editing.drawdownMode ?? "static");
      setStartDate(editing.startDate ?? "");
      setEndDate(editing.endDate ?? "");
      setDailyProfitTarget(editing.dailyProfitTarget?.toString() ?? "");
      setDailyLossLimit(editing.dailyLossLimit?.toString() ?? "");
      setTradeLimit(editing.tradeLimit?.toString() ?? "");
      setInstruments(editing.instruments?.join(", ") ?? "");
      setNotes(editing.notes ?? "");
    } else {
      setName(""); setStartingBalance(""); setTargetBalance(""); setMaxDrawdown("");
      setDrawdownMode("static"); setStartDate(""); setEndDate("");
      setDailyProfitTarget(""); setDailyLossLimit(""); setTradeLimit(""); setInstruments(""); setNotes("");
    }
    setError(null);
  }, [open, editing]);

  const save = async () => {
    if (!name.trim()) { setError("Give the challenge a name."); return; }
    const start = Number(startingBalance);
    const target = Number(targetBalance);
    if (!Number.isFinite(start) || start <= 0) { setError("Enter a valid starting balance."); return; }
    if (!Number.isFinite(target) || target <= start) { setError("Target must be above the starting balance."); return; }
    await useApp.getState().saveChallenge({
      id: editing?.id ?? uid(`ch-${Date.now().toString(36)}`),
      name: name.trim(),
      notes: notes.trim() || undefined,
      startingBalance: start,
      targetBalance: target,
      drawdownMode,
      maxDrawdown: Number(maxDrawdown) || null,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      dailyProfitTarget: Number(dailyProfitTarget) || null,
      dailyLossLimit: Number(dailyLossLimit) || null,
      tradeLimit: Number(tradeLimit) || null,
      instruments: instruments ? instruments.split(",").map((i) => i.trim().toUpperCase()).filter(Boolean) : undefined,
      createdAt: editing?.createdAt ?? Date.now(),
    });
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} size="md" label="Challenge" title={editing ? "Edit challenge" : "New challenge"} description="Define the objective — EdgeBook measures the journey.">
      <div className="space-y-4 px-6 py-6">
        <Field label="Challenge name" htmlFor="ch-name">
          <TextInput id="ch-name" autoFocus placeholder="e.g. March $25K Challenge" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starting balance" htmlFor="ch-start">
            <TextInput id="ch-start" inputMode="decimal" className="tabular" value={startingBalance} onChange={(e) => setStartingBalance(e.target.value.replace(/[^\d.]/g, ""))} />
          </Field>
          <Field label="Target balance" htmlFor="ch-target">
            <TextInput id="ch-target" inputMode="decimal" className="tabular" value={targetBalance} onChange={(e) => setTargetBalance(e.target.value.replace(/[^\d.]/g, ""))} />
          </Field>
          <Field label="Max drawdown" htmlFor="ch-dd">
            <TextInput id="ch-dd" inputMode="decimal" className="tabular" value={maxDrawdown} onChange={(e) => setMaxDrawdown(e.target.value.replace(/[^\d.]/g, ""))} />
          </Field>
          <Field label="Drawdown model" htmlFor="ch-ddmode">
            <select
              id="ch-ddmode"
              value={drawdownMode}
              onChange={(e) => setDrawdownMode(e.target.value as DrawdownMode)}
              className="w-full rounded-control border border-line bg-raised px-3.5 py-2.5 text-[15px] text-ink focus:border-gold/60 focus:outline-none"
            >
              <option value="static">Static — from starting balance</option>
              <option value="dynamic">Dynamic — trailing high-water mark</option>
            </select>
          </Field>
          <Field label="Start date" hint="optional" htmlFor="ch-startdate">
            <TextInput id="ch-startdate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="End date" hint="optional" htmlFor="ch-enddate">
            <TextInput id="ch-enddate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
          <Field label="Daily profit target" hint="optional" htmlFor="ch-dpt">
            <TextInput id="ch-dpt" inputMode="decimal" className="tabular" value={dailyProfitTarget} onChange={(e) => setDailyProfitTarget(e.target.value.replace(/[^\d.]/g, ""))} />
          </Field>
          <Field label="Daily loss limit" hint="optional" htmlFor="ch-dll">
            <TextInput id="ch-dll" inputMode="decimal" className="tabular" value={dailyLossLimit} onChange={(e) => setDailyLossLimit(e.target.value.replace(/[^\d.]/g, ""))} />
          </Field>
          <Field label="Trade limit per day" hint="optional" htmlFor="ch-tl">
            <TextInput id="ch-tl" inputMode="numeric" className="tabular" value={tradeLimit} onChange={(e) => setTradeLimit(e.target.value.replace(/[^\d]/g, ""))} />
          </Field>
          <Field label="Instruments" hint="optional, comma-separated" htmlFor="ch-instruments">
            <TextInput id="ch-instruments" placeholder="NQ, ES…" value={instruments} onChange={(e) => setInstruments(e.target.value)} />
          </Field>
        </div>
        <Field label="Description" hint="optional" htmlFor="ch-notes">
          <TextArea id="ch-notes" className="min-h-16" placeholder="What does passing this challenge mean?" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        {error && <p role="alert" className="rounded-lg border border-loss/25 bg-loss/[0.06] px-3 py-2 text-[13px] text-loss">{error}</p>}
        <div className="flex justify-end gap-2.5 border-t border-line pt-4">
          <Button variant="subtle" onClick={onClose}>Cancel</Button>
          <Button variant="gold" onClick={() => void save()}>{editing ? "Save challenge" : "Create challenge"}</Button>
        </div>
      </div>
    </Modal>
  );
}
