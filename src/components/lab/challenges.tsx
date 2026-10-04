"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useApp, persistFailedSince } from "@/lib/store";
import { challengeProgress, type ChallengeProgress } from "@/lib/challenges";
import type { Challenge, DrawdownMode } from "@/lib/types";
import { formatSignedMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Field, TextArea, TextInput } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toast";
import { ChevronRightIcon, PencilIcon, PlusIcon, StarIcon, TrashIcon } from "@/components/ui/icons";
import { cn, uid } from "@/lib/utils";
import { EASE } from "@/components/landing/reveal";

/**
 * Challenges — lives inside the Trading Lab, styled exactly like Setups:
 * folder-style cards in a panel; open one to see its full progress, make it
 * primary, edit or delete it. Same data + store actions as the old
 * /challenges page (settings.challenges, setPrimaryChallenge, deleteChallenge).
 */
export function Challenges() {
  const entries = useApp((s) => s.entries);
  const settings = useApp((s) => s.settings);
  const challenges = useMemo(() => settings.challenges ?? [], [settings.challenges]);
  const primaryId = settings.primaryChallengeId ?? null;

  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Challenge | null>(null);
  const [deleting, setDeleting] = useState<Challenge | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const progressList = useMemo(
    () => challenges.map((c) => ({ challenge: c, progress: challengeProgress(c, entries) })),
    [challenges, entries],
  );
  const open = openId ? progressList.find((p) => p.challenge.id === openId) ?? null : null;
  const deletingTradeCount = useMemo(
    () => (deleting ? entries.filter((e) => e.challengeId === deleting.id).length : 0),
    [deleting, entries],
  );

  const makePrimary = async (id: string) => {
    const t0 = Date.now();
    try {
      await useApp.getState().setPrimaryChallenge(id);
      if (!persistFailedSince(t0)) {
        toast.success("Primary challenge updated", "Home, calendar and MINATO now follow this challenge.");
      }
    } catch {
      toast.error("Could not update the primary challenge");
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    const t0 = Date.now();
    try {
      const wiped = await useApp.getState().deleteChallenge(deleting.id);
      if (!persistFailedSince(t0)) {
        toast.success(
          "Challenge deleted",
          wiped > 0 ? `${wiped} linked trade${wiped === 1 ? "" : "s"} and all their data were removed.` : "No trades were linked to it.",
        );
      }
      setOpenId((cur) => (cur === deleting.id ? null : cur));
      setDeleting(null);
    } catch {
      toast.error("Could not delete the challenge");
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <section id="challenges" className="panel scroll-mt-6 p-5 sm:p-6" aria-label="Challenges">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold tracking-tight text-ink">Challenges</h2>
          <p className="text-xs text-muted">
            Each challenge is a distinct trading period with its own objective. Open one like a folder; mark one as
            primary and Home, the calendar and MINATO follow it.
          </p>
        </div>
        <Button variant="gold" size="sm" onClick={() => setCreating(true)}>
          <PlusIcon className="h-4 w-4" />
          New challenge
        </Button>
      </div>

      {progressList.length === 0 ? (
        <p className="mt-4 rounded-control border border-dashed border-line-strong px-4 py-8 text-center text-sm text-muted">
          No challenges yet. Create one — a funded evaluation, a consistency month, a personal A+ execution period —
          and every trade you log against it builds its progress.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence initial={false}>
            {progressList.map(({ challenge, progress }, i) => {
              const isPrimary = primaryId === challenge.id;
              return (
                <motion.button
                  key={challenge.id}
                  layout
                  type="button"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.35, delay: Math.min(i * 0.03, 0.15), ease: EASE }}
                  onClick={() => setOpenId(challenge.id)}
                  whileHover={{ y: -3 }}
                  className={cn(
                    "group rounded-control border bg-raised/60 p-4 text-left transition-colors hover:border-gold/40",
                    isPrimary ? "border-gold/50 ring-1 ring-gold/25" : "border-line",
                  )}
                  aria-label={`Open challenge ${challenge.name}${isPrimary ? " (primary)" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
                      <span aria-hidden className="text-base">📁</span>
                      <span className="truncate">{challenge.name}</span>
                    </p>
                    <ChevronRightIcon className="mt-1 h-4 w-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-gold" />
                  </div>

                  <p className="num mt-2 text-[11px] text-muted">
                    {progress.trades} {progress.trades === 1 ? "trade" : "trades"}
                    {isPrimary && (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/[0.1] px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-gold">
                        <StarIcon className="h-2.5 w-2.5" />
                        Primary
                      </span>
                    )}
                  </p>

                  <div
                    className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-line-soft"
                    role="img"
                    aria-label={`${progress.progressPct}% of challenge progress`}
                  >
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-profit-deep via-profit to-gold-strong transition-all duration-700"
                      style={{ width: `${Math.min(100, progress.progress * 100)}%` }}
                    />
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft pt-2.5 text-[11px]">
                    <span className={cn("num font-semibold", progress.currentPnl > 0 ? "text-profit" : progress.currentPnl < 0 ? "text-loss" : "text-faint")}>
                      {progress.trades > 0 ? formatSignedMoney(progress.currentPnl) : "—"}
                    </span>
                    <span className="text-faint">P&amp;L</span>
                    <span className="num ml-auto font-semibold text-ink">{progress.progressPct}%</span>
                    <span className="text-faint">to target</span>
                  </div>
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Challenge detail — the "folder" view */}
      {open && (
        <ChallengeDetail
          key={open.challenge.id}
          challenge={open.challenge}
          progress={open.progress}
          primary={primaryId === open.challenge.id}
          onClose={() => setOpenId(null)}
          onMakePrimary={() => void makePrimary(open.challenge.id)}
          onEdit={() => setEditing(open.challenge)}
          onDelete={() => setDeleting(open.challenge)}
        />
      )}

      {/* Create / edit form */}
      <ChallengeFormModal
        open={creating || editing !== null}
        challenge={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        busy={deleteBusy}
        title={`Delete "${deleting?.name ?? ""}"?`}
        body={
          deletingTradeCount > 0
            ? `This permanently deletes the challenge AND its ${deletingTradeCount} linked trade${deletingTradeCount === 1 ? "" : "s"} — notes, screenshots, reviews, plans and Practise history for them. This cannot be undone.`
            : "No trades are linked to this challenge. Only the challenge itself will be removed."
        }
        confirmLabel={deletingTradeCount > 0 ? `Delete challenge + ${deletingTradeCount} trade${deletingTradeCount === 1 ? "" : "s"}` : "Delete challenge"}
      />
    </section>
  );
}

/* ------------------------------ detail (folder) ------------------------------ */

function Metric({ label, value, tone }: { label: string; value: string; tone?: "loss" | "profit" | "gold" | "muted" }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[10px] font-medium uppercase tracking-[0.08em] text-faint">{label}</dt>
      <dd className={cn(
        "num mt-0.5 truncate text-[13px] font-semibold",
        tone === "loss" ? "text-loss" : tone === "profit" ? "text-profit" : tone === "gold" ? "text-gold" : "text-ink",
      )}>
        {value}
      </dd>
    </div>
  );
}

function ChallengeDetail({
  challenge,
  progress,
  primary,
  onClose,
  onMakePrimary,
  onEdit,
  onDelete,
}: {
  challenge: Challenge;
  progress: ChallengeProgress;
  primary: boolean;
  onClose: () => void;
  onMakePrimary: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const tradingDays = new Set(progress.tradesList.map((t) => t.date)).size;
  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      label={`Challenge: ${challenge.name}${primary ? " (primary)" : ""}`}
      title={challenge.name}
      description={`${formatSignedMoney(progress.startingBalance)} → ${formatSignedMoney(progress.targetBalance)} · ${tradingDays} trading ${tradingDays === 1 ? "day" : "days"} · ${progress.trades} ${progress.trades === 1 ? "trade" : "trades"}${progress.winRate != null ? ` · ${Math.round(progress.winRate * 100)}% win rate` : ""}`}
    >
      <div className="space-y-5 px-6 py-6">
        {primary && (
          <span className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/[0.1] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold">
            <StarIcon className="h-3 w-3" />
            Primary challenge
          </span>
        )}

        <div>
          <p className="num text-sm">
            <span className={progress.currentPnl >= 0 ? "text-profit" : "text-loss"}>
              {formatSignedMoney(progress.currentPnl)} ({progress.progressPct}%)
            </span>
          </p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line-soft" role="img" aria-label={`${progress.progressPct}% of challenge progress`}>
            <div
              className="h-full rounded-full bg-gradient-to-r from-profit-deep via-profit to-gold-strong transition-all duration-700"
              style={{ width: `${Math.min(100, progress.progress * 100)}%` }}
            />
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[12px] sm:grid-cols-3">
          <Metric label="Current balance" value={formatSignedMoney(progress.currentEquity)} />
          <Metric label="Highest balance" value={formatSignedMoney(progress.highestBalance)} />
          <Metric
            label={`Drawdown (${progress.drawdownMode})`}
            value={formatSignedMoney(progress.currentDrawdown)}
            tone={progress.currentDrawdown > 0 ? "loss" : "muted"}
          />
          <Metric
            label="Drawdown remaining"
            value={progress.maxDrawdown > 0 ? formatSignedMoney(progress.remainingDrawdown) : "—"}
            tone={progress.maxDrawdown > 0 && progress.remainingDrawdown <= progress.maxDrawdown * 0.25 ? "loss" : "profit"}
          />
          <Metric
            label="Drawdown threshold"
            value={progress.maxDrawdown > 0 ? formatSignedMoney(progress.drawdownThreshold) : "—"}
          />
          <Metric label="Target progress" value={`${progress.progressPct}%`} tone="gold" />
        </dl>

        {progress.milestones.length > 0 && (
          <div className="border-t border-line pt-3" aria-label="Challenge milestone path">
            <div className="flex items-center gap-1.5">
              {progress.milestones.map((m, i) => {
                const next = progress.milestones[i + 1];
                const isCurrent = m.passed && (!next || !next.passed);
                return (
                  <div key={m.fraction} className="flex flex-1 items-center gap-1.5 last:flex-none">
                    <span
                      title={`${Math.round(m.fraction * 100)}% — ${formatSignedMoney(m.equity)}${m.passed ? " (reached)" : ""}`}
                      className={cn(
                        "grid h-6 w-6 shrink-0 place-items-center rounded-full border text-[9px] font-bold transition-colors",
                        isCurrent ? "border-gold bg-gold/[0.14] text-gold"
                          : m.passed ? "border-profit/50 bg-profit/[0.12] text-profit"
                          : "border-line bg-raised text-faint",
                      )}
                    >
                      {m.passed && !isCurrent ? "✓" : `${Math.round(m.fraction * 100)}`}
                    </span>
                    {next && <span className={cn("h-px flex-1", next.passed ? "bg-profit/50" : "bg-line-strong")} />}
                  </div>
                );
              })}
            </div>
            <p className="num mt-1.5 text-[11px] text-faint">
              START → TARGET{progress.reachedTarget ? " — COMPLETED" : ` · ${formatSignedMoney(progress.distanceToTarget)} to go`}
            </p>
          </div>
        )}

        {challenge.notes && <p className="text-[13px] leading-relaxed text-muted">{challenge.notes}</p>}

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {!primary && (
            <Button variant="outline" size="sm" onClick={onMakePrimary}>
              <StarIcon className="h-3.5 w-3.5" />
              Make primary
            </Button>
          )}
          <Button variant="subtle" size="sm" onClick={onEdit}>
            <PencilIcon className="h-3.5 w-3.5" />
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete} className="!text-faint hover:!text-loss">
            <TrashIcon className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </div>
    </Modal>
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
  const [drawdownFloor, setDrawdownFloor] = useState("");
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
      setDrawdownFloor(editing.drawdownFloor?.toString() ?? "");
      setStartDate(editing.startDate ?? "");
      setEndDate(editing.endDate ?? "");
      setDailyProfitTarget(editing.dailyProfitTarget?.toString() ?? "");
      setDailyLossLimit(editing.dailyLossLimit?.toString() ?? "");
      setTradeLimit(editing.tradeLimit?.toString() ?? "");
      setInstruments(editing.instruments?.join(", ") ?? "");
      setNotes(editing.notes ?? "");
    } else {
      setName(""); setStartingBalance(""); setTargetBalance(""); setMaxDrawdown("");
      setDrawdownMode("static"); setDrawdownFloor(""); setStartDate(""); setEndDate("");
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
    const saved: Challenge = {
      id: editing?.id ?? uid(`ch-${Date.now().toString(36)}`),
      name: name.trim(),
      notes: notes.trim() || undefined,
      startingBalance: start,
      targetBalance: target,
      drawdownMode,
      maxDrawdown: Number(maxDrawdown) || null,
      drawdownFloor: drawdownMode === "dynamic" && drawdownFloor ? Number(drawdownFloor) : null,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      dailyProfitTarget: Number(dailyProfitTarget) || null,
      dailyLossLimit: Number(dailyLossLimit) || null,
      tradeLimit: Number(tradeLimit) || null,
      instruments: instruments ? instruments.split(",").map((i) => i.trim().toUpperCase()).filter(Boolean) : undefined,
      createdAt: editing?.createdAt ?? Date.now(),
    };
    const t0 = Date.now();
    try {
      await useApp.getState().saveChallenge(saved);
      // First challenge becomes primary automatically so the dashboard follows it.
      if (!editing && !useApp.getState().settings.primaryChallengeId) {
        await useApp.getState().setPrimaryChallenge(saved.id);
      }
      if (!persistFailedSince(t0) && !editing) toast.success("Challenge created");
      onClose();
    } catch {
      setError("Could not save the challenge. Please try again.");
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="md" label="Challenge" title={editing ? "Edit challenge" : "New challenge"} description="Define the objective — EdgeBook measures the journey.">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
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
            {drawdownMode === "dynamic" ? (
              <Field label="Drawdown floor / lock" hint="optional — trailing threshold never goes below this" htmlFor="ch-ddfloor">
                <TextInput id="ch-ddfloor" inputMode="decimal" className="tabular" placeholder={`e.g. ${(Number(startingBalance) || 50000) - (Number(maxDrawdown) || 2500)}`} value={drawdownFloor} onChange={(e) => setDrawdownFloor(e.target.value.replace(/[^\d.]/g, ""))} />
              </Field>
            ) : (
              <div aria-hidden className="hidden sm:block" />
            )}
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
            <Button type="button" variant="subtle" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="gold">{editing ? "Save challenge" : "Create challenge"}</Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
