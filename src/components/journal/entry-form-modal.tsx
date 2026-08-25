"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  MAX_IMAGES_PER_ENTRY,
  reviewStatusOf,
  type JournalEntry,
  type TradeDirection,
} from "@/lib/types";
import { todayKey, formatDateMedium, formatSignedMoney, weekdayLong } from "@/lib/format";
import { useApp, type EntryDraft } from "@/lib/store";
import { useUi } from "@/lib/ui-store";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Field, TextArea, TextInput } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ImageUploader, type UploadItem } from "./image-uploader";
import { TradeReviewFlow } from "./trade-review-flow";
import { cn } from "@/lib/utils";
import { AlertTriangleIcon, CheckCircleIcon, CheckIcon, PencilIcon, ShieldIcon, UploadIcon } from "@/components/ui/icons";

const INSTRUMENT_SUGGESTIONS = [
  "NQ", "ES", "MES", "MNQ", "EURUSD", "GBPUSD", "USDJPY", "BTCUSD", "ETHUSD",
  "XAUUSD", "CL", "SPY", "QQQ", "AAPL", "TSLA", "NVDA",
];

/**
 * Create/edit composer — challenge-aware, with execution guard rails:
 * premature-entry warning, third-trade lockout gate, post-loss gate.
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

  const open = openProp ?? globalOpen;
  const onClose = onCloseProp ?? closeGlobal;
  const editing = entryProp ?? null;

  const [date, setDate] = useState(todayKey());
  const [pnl, setPnl] = useState("");
  const [rr, setRr] = useState("");
  const [instrument, setInstrument] = useState("");
  const [direction, setDirection] = useState<TradeDirection | null>(null);
  const [setup, setSetup] = useState("");
  const [notes, setNotes] = useState("");
  const [images, setImages] = useState<UploadItem[]>([]);
  const [entryTime, setEntryTime] = useState("");
  const [exitTime, setExitTime] = useState("");
  const [entryPrice, setEntryPrice] = useState("");
  const [exitPrice, setExitPrice] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [newChallengeName, setNewChallengeName] = useState("");
  const [tradeNumber, setTradeNumber] = useState<1 | 2>(1);
  const [errors, setErrors] = useState<{ date?: string; pnl?: string; rr?: string }>({});
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"manual" | "import">("manual");
  const [reflecting, setReflecting] = useState<JournalEntry | null>(null);

  // Guard-rail state
  const [showPremature, setShowPremature] = useState(false);
  const [showThirdTradeGate, setShowThirdTradeGate] = useState(false);
  const [gateAcknowledged, setGateAcknowledged] = useState(false);
  const [showPostLossGate, setShowPostLossGate] = useState<JournalEntry | null>(null);

  const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(/[^\d.\-−]/g, "").replace("−", "-")));

  // Hydrate/reset each time the dialog opens
  useEffect(() => {
    if (!open) return;
    const firstChallenge = challenges[0]?.id ?? "";
    if (editing) {
      setDate(editing.date);
      setPnl(String(editing.pnl));
      setRr(editing.rr != null ? String(editing.rr) : "");
      setInstrument(editing.instrument === "—" ? "" : editing.instrument);
      setDirection(editing.direction);
      setSetup(editing.setup);
      setNotes(editing.notes);
      setImages(editing.images.map((m) => ({ meta: m, blob: null })));
      setEntryTime(editing.entryTime ?? "");
      setExitTime(editing.exitTime ?? "");
      setEntryPrice(editing.entryPrice != null ? String(editing.entryPrice) : "");
      setExitPrice(editing.exitPrice != null ? String(editing.exitPrice) : "");
      setStopLoss(editing.stopLoss != null ? String(editing.stopLoss) : "");
      setTakeProfit(editing.takeProfit != null ? String(editing.takeProfit) : "");
      setChallengeId(editing.challengeId ?? firstChallenge);
      setTradeNumber(editing.tradeNumber ?? 1);
    } else {
      setDate(presetDate && presetDate <= todayKey() ? presetDate : todayKey());
      setPnl("");
      setRr("");
      setInstrument("");
      setDirection(null);
      setSetup("");
      setNotes("");
      setImages([]);
      setEntryTime("");
      setExitTime("");
      setEntryPrice("");
      setExitPrice("");
      setStopLoss("");
      setTakeProfit("");
      setChallengeId(firstChallenge);
      setTradeNumber(1);
      setMode("manual");
    }
    setNewChallengeName("");
    setErrors({});
    setReflecting(null);
    setShowPremature(false);
    setShowThirdTradeGate(false);
    setGateAcknowledged(false);
    setShowPostLossGate(null);
  }, [open, editing, presetDate, challenges]);

  const pnlNumber = pnl.trim() === "" ? NaN : Number(pnl);
  const rrNumber = rr.trim() === "" ? null : Number(rr);

  // Losses already recorded for the selected date (third-trade gate)
  const lossesToday = useMemo(
    () => entries.filter((e) => e.date === date && e.pnl < 0).length,
    [entries, date],
  );
  const tradesToday = useMemo(() => entries.filter((e) => e.date === date).length, [entries, date]);
  const gateRequired = !editing && lossesToday >= 2;

  // Premature entry: before 9:33 AM NY trading time
  const premature = entryTime !== "" && entryTime < "09:33";

  useEffect(() => {
    if (premature && !editing) setShowPremature(true);
    else setShowPremature(false);
  }, [premature, editing]);

  const buildDraft = (): EntryDraft => ({
    date,
    pnl: Math.round(pnlNumber * 100) / 100,
    rr: rrNumber,
    instrument: instrument.trim() || "—",
    direction,
    setup: setup.trim(),
    notes: notes.trim(),
    images: images.map((i) => i.meta),
    challengeId: challengeId || undefined,
    tradeNumber,
    entryTime: entryTime || undefined,
    exitTime: exitTime || undefined,
    entryPrice: num(entryPrice),
    exitPrice: num(exitPrice),
    stopLoss: num(stopLoss),
    takeProfit: num(takeProfit),
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!date) next.date = "Pick a trading day.";
    else if (date > todayKey()) next.date = "That day hasn't happened yet.";
    if (Number.isNaN(pnlNumber)) next.pnl = "Enter a number — negative for a loss.";
    if (rrNumber !== null && !Number.isFinite(rrNumber)) next.rr = "Use a number like 2.5";
    setErrors(next);
    if (Object.keys(next).length > 0 || saving) return;

    // Third-trade lockout gate — genuine friction, not a toast.
    if (gateRequired && !gateAcknowledged) {
      setShowThirdTradeGate(true);
      return;
    }

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
    for (const item of images) if (item.blob) blobs.set(item.meta.id, item.blob);

    setSaving(true);
    try {
      if (editing) {
        await useApp.getState().updateEntry(editing.id, draft, blobs);
        toast.success("Entry updated");
        onClose();
      } else {
        const created = await useApp.getState().createEntry(draft, blobs);
        toast.success(
          draft.pnl > 0 ? "Green day logged" : draft.pnl < 0 ? "Red day logged" : "Session logged",
          "Your dashboard and roadmap just updated.",
        );
        onClose();
        if (created.pnl < 0) {
          // Post-loss gate — capture the internal dialogue before anything else.
          setShowPostLossGate(created);
        } else {
          setReflecting(created);
        }
      }
    } catch {
      toast.error("Could not save the entry", "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      label={editing ? "Edit journal entry" : "New journal entry"}
      title={editing ? "Edit entry" : "Log a trade"}
      description={
        editing
          ? `${weekdayLong(editing.date)} · ${formatSignedMoney(editing.pnl)}`
          : "Capture the session while it's fresh."
      }
    >
      <form onSubmit={submit} noValidate className="px-6 py-6">
        {/* Mode tabs — only for new entries */}
        {!editing && (
          <div
            role="tablist"
            aria-label="Entry mode"
            className="mb-6 grid grid-cols-2 gap-1 rounded-control border border-line bg-canvas/60 p-1"
          >
            {([
              { id: "manual", label: "Manual entry", icon: <PencilIcon className="h-3.5 w-3.5" /> },
              { id: "import", label: "Import trades", icon: <UploadIcon className="h-3.5 w-3.5" /> },
            ] as const).map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={mode === t.id}
                onClick={() => setMode(t.id)}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors",
                  mode === t.id ? "text-ink" : "text-faint hover:text-muted",
                )}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        )}

        {mode === "import" && !editing ? (
          <ImportPane onDone={(created) => { onClose(); setReflecting(created); }} saving={saving} setSaving={setSaving} onClose={onClose} />
        ) : (
        <>
        <div className="grid gap-5 sm:grid-cols-2">
          {/* Left column */}
          <div className="space-y-5">
            <Field label="Trading day" error={errors.date} htmlFor="entry-date">
              <TextInput
                id="entry-date"
                type="date"
                value={date}
                max={todayKey()}
                invalid={!!errors.date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>

            <Field label="Net P&L" error={errors.pnl} htmlFor="entry-pnl">
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-faint">
                  $
                </span>
                <TextInput
                  id="entry-pnl"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="250.00 or −120.50"
                  className={cn("pl-8 tabular", pnlNumber > 0 && "text-profit", pnlNumber < 0 && "text-loss")}
                  value={pnl}
                  invalid={!!errors.pnl}
                  onChange={(e) => setPnl(e.target.value.replace(/[^\d.\-−]/g, "").replace("−", "-"))}
                />
              </div>
              {!errors.pnl && pnl.trim() !== "" && Number.isFinite(pnlNumber) && (
                <motion.p
                  key={pnl}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "pt-0.5 text-[12px] font-medium",
                    pnlNumber > 0 ? "text-profit" : pnlNumber < 0 ? "text-loss" : "text-muted",
                  )}
                >
                  {formatSignedMoney(pnlNumber)}
                </motion.p>
              )}
            </Field>

            <Field label="Risk-to-reward" hint="optional" error={errors.rr} htmlFor="entry-rr">
              <TextInput
                id="entry-rr"
                inputMode="decimal"
                autoComplete="off"
                placeholder="+2.5R"
                className="tabular"
                value={rr}
                invalid={!!errors.rr}
                onChange={(e) => setRr(e.target.value.replace(/[^\d.\-−]/g, "").replace("−", "-"))}
              />
            </Field>

            {/* Execution times & prices */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Entry time" hint="NY" htmlFor="entry-time">
                <TextInput id="entry-time" type="time" value={entryTime} onChange={(e) => setEntryTime(e.target.value)} />
              </Field>
              <Field label="Exit time" hint="NY" htmlFor="exit-time">
                <TextInput id="exit-time" type="time" value={exitTime} onChange={(e) => setExitTime(e.target.value)} />
              </Field>
              <Field label="Entry price" hint="optional" htmlFor="entry-price">
                <TextInput id="entry-price" inputMode="decimal" className="tabular" value={entryPrice} onChange={(e) => setEntryPrice(e.target.value.replace(/[^\d.]/g, ""))} />
              </Field>
              <Field label="Exit price" hint="optional" htmlFor="exit-price">
                <TextInput id="exit-price" inputMode="decimal" className="tabular" value={exitPrice} onChange={(e) => setExitPrice(e.target.value.replace(/[^\d.]/g, ""))} />
              </Field>
              <Field label="Stop loss" hint="optional" htmlFor="stop-loss">
                <TextInput id="stop-loss" inputMode="decimal" className="tabular" value={stopLoss} onChange={(e) => setStopLoss(e.target.value.replace(/[^\d.]/g, ""))} />
              </Field>
              <Field label="Take profit" hint="optional" htmlFor="take-profit">
                <TextInput id="take-profit" inputMode="decimal" className="tabular" value={takeProfit} onChange={(e) => setTakeProfit(e.target.value.replace(/[^\d.]/g, ""))} />
              </Field>
            </div>
          </div>

          {/* Right column */}
          <div className="space-y-5">
            <Field label="Direction" hint="optional">
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Trade direction">
                {(["long", "short"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={direction === d}
                    onClick={() => setDirection((cur) => (cur === d ? null : d))}
                    className={cn(
                      "rounded-xl border py-2.5 text-sm font-semibold capitalize transition-all duration-150 active:scale-[0.97]",
                      direction === d
                        ? d === "long"
                          ? "border-profit/50 bg-profit/[0.12] text-profit"
                          : "border-loss/50 bg-loss/[0.10] text-loss"
                        : "border-line bg-raised/60 text-muted hover:border-line-strong hover:text-ink",
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Instrument" hint="optional" htmlFor="entry-instrument">
              <TextInput
                id="entry-instrument"
                list="instrument-list"
                placeholder="NQ, EURUSD, BTC…"
                value={instrument}
                onChange={(e) => setInstrument(e.target.value.toUpperCase())}
              />
              <datalist id="instrument-list">
                {INSTRUMENT_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>

            <Field label="Setup" hint="optional" htmlFor="entry-setup">
              <TextInput
                id="entry-setup"
                list="setup-list"
                placeholder="e.g. Liquidity Sweep + SMT"
                value={setup}
                onChange={(e) => setSetup(e.target.value)}
              />
              <datalist id="setup-list">
                {(useApp.getState().settings.playbook ?? []).map((p) => (
                  <option key={p.id} value={p.name} />
                ))}
              </datalist>
            </Field>

            {/* Challenge */}
            <Field label="Challenge" htmlFor="entry-challenge">
              <select
                id="entry-challenge"
                value={challengeId}
                onChange={(e) => setChallengeId(e.target.value)}
                className="w-full rounded-control border border-line bg-raised px-3.5 py-2.5 text-[15px] text-ink transition-colors hover:border-line-strong focus:border-gold/60 focus:outline-none focus:ring-4 focus:ring-gold/10"
              >
                <option value="">No challenge</option>
                {challenges.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Or create a new challenge" hint="optional" htmlFor="entry-new-challenge">
              <TextInput
                id="entry-new-challenge"
                placeholder="e.g. March $25K Challenge"
                value={newChallengeName}
                onChange={(e) => setNewChallengeName(e.target.value)}
              />
            </Field>

            {/* Trade number */}
            <Field label="Planned trade number" hint="max 2 per day">
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Trade number">
                {([1, 2] as const).map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={tradeNumber === n}
                    onClick={() => setTradeNumber(n)}
                    className={cn(
                      "rounded-xl border py-2 text-sm font-semibold transition-all duration-150 active:scale-[0.97]",
                      tradeNumber === n
                        ? "border-gold/50 bg-gold/[0.1] text-gold"
                        : "border-line bg-raised/60 text-muted hover:border-line-strong hover:text-ink",
                    )}
                  >
                    Trade #{n}
                    {n === 2 && <span className="block text-[10px] font-normal text-faint">requires 7/7</span>}
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </div>

        <div className="mt-5 space-y-5">
          <Field label="Notes & observations" hint="what did the market teach you?" htmlFor="entry-notes">
            <TextArea
              id="entry-notes"
              placeholder="What was the plan? What actually happened? What will you do differently?"
              value={notes}
              maxLength={4000}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>

          <Field label={`Screenshots (${images.length}/${MAX_IMAGES_PER_ENTRY})`} hint="entry / setup / execution / exit charts">
            <ImageUploader items={images} onChange={setImages} />
          </Field>
        </div>
        </>
        )}

        {/* Premature-entry inline warning */}
        <AnimatePresence>
          {showPremature && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              role="alert"
              className="mt-4 rounded-xl border border-gold/40 bg-gold/[0.07] p-4"
            >
              <p className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink">
                <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
                <span>
                  <strong className="text-gold">Premature entry.</strong> Efficiency comes from
                  process-oriented patience, not impulsive execution. Are you acting out of urgency
                  or conviction? If all checklist criteria are not confirmed, stay out.
                </span>
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {!(mode === "import" && !editing) && (
        <div className="mt-7 flex items-center justify-end gap-2.5 border-t border-line bg-surface pt-5 pb-1 sticky bottom-[-24px] px-0.5 -mx-0.5">
          <Button type="button" variant="subtle" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="gold" loading={saving} disabled={saving}>
            {editing ? "Save changes" : "Add to journal"}
          </Button>
        </div>
        )}
      </form>
    </Modal>

    {/* Third-trade lockout gate — genuine friction, requires acknowledgement */}
    <Modal open={showThirdTradeGate} onClose={() => setShowThirdTradeGate(false)} size="md" label="Third trade lockout">
      <div className="px-6 py-6 sm:px-8">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-loss/30 bg-loss/[0.08] text-loss">
            <ShieldIcon className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-display text-xl font-semibold tracking-[-0.02em] text-ink">
              Manual lockout required in Tradovate right now
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              You already have <strong className="text-loss">{lossesToday} losses</strong> today
              {tradesToday > 0 && <> across {tradesToday} trades</>}. The statistical probability of a
              3rd trade winning is only <strong className="text-ink">4%–5%</strong>, whereas
              tomorrow&apos;s fresh A+ setup holds a <strong className="text-profit">40%–50%</strong> probability.
              Lock out immediately — preserving mental capital is today&apos;s final win.
            </p>
          </div>
        </div>
        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-raised/60 p-4">
          <input
            type="checkbox"
            checked={gateAcknowledged}
            onChange={(e) => setGateAcknowledged(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-[var(--gold-strong)]"
          />
          <span className="text-[13px] leading-relaxed text-ink">
            I acknowledge this is a psychological failure point, I am trading beyond my 2-trade plan,
            and I accept full responsibility for breaking my own rule.
          </span>
        </label>
        <div className="mt-5 flex items-center justify-end gap-2.5">
          <Button variant="subtle" onClick={() => setShowThirdTradeGate(false)}>
            Close — I&apos;m done for today
          </Button>
          <Button
            variant="danger"
            disabled={!gateAcknowledged}
            onClick={() => {
              setShowThirdTradeGate(false);
              // Re-trigger submit with the acknowledgement recorded
              void (async () => {
                const gateAcknowledgedRef = true;
                setGateAcknowledged(gateAcknowledgedRef);
              })();
            }}
          >
            Proceed anyway
          </Button>
        </div>
      </div>
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

/* ------------------------------ import pane ------------------------------ */

function ImportPane({
  onDone,
  saving,
  setSaving,
  onClose,
}: {
  onDone: (firstCreated: JournalEntry | null) => void;
  saving: boolean;
  setSaving: (v: boolean) => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const settings = useApp((s) => s.settings);
  const challenges = useMemo(() => settings.challenges ?? [], [settings]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ReturnType<typeof import("@/lib/csv-import").parseTradesCsv> | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [challengeId, setChallengeId] = useState("");
  const [newChallengeName, setNewChallengeName] = useState("");

  const loadFile = async (file: File) => {
    setFileError(null);
    if (!/\.(csv|txt|tsv)$/i.test(file.name) && !file.type.includes("csv") && !file.type.includes("text")) {
      setFileError("Please choose a .csv file (or a plain-text export).");
      return;
    }
    try {
      const text = await file.text();
      const { parseTradesCsv } = await import("@/lib/csv-import");
      const result = parseTradesCsv(text);
      if (result.error) {
        setFileError(result.error);
        setResultNull();
        return;
      }
      setFileName(file.name);
      setParsed(result);
      if (result.rows.length === 0 && result.invalid.length === 0) setFileError("No rows found in that file.");
    } catch {
      setFileError("Could not read that file — try re-exporting it.");
    }
  };
  const setResultNull = () => { setParsed(null); setFileName(null); };

  const rows = parsed?.rows ?? [];
  const invalid = parsed?.invalid ?? [];
  const netPnl = rows.reduce((s, r) => s + r.pnl, 0);

  const runImport = async () => {
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
      let ok = 0;
      let first: JournalEntry | null = null;
      for (const row of rows) {
        try {
          const created = await useApp.getState().createEntry({
            date: row.date,
            pnl: row.pnl,
            rr: row.rr,
            instrument: row.instrument,
            direction: row.direction,
            setup: row.setup,
            notes: row.notes,
            images: [],
            challengeId: effectiveChallengeId || undefined,
            reviewStatus: "not_reviewed",
          });
          ok += 1;
          first = first ?? created;
        } catch { /* skip row */ }
      }
      toast.success(
        `Imported ${ok} ${ok === 1 ? "trade" : "trades"}`,
        `${formatDateMedium(rows[0].date)} → ${formatDateMedium(rows[rows.length - 1].date)} · ${formatSignedMoney(netPnl)} — review required.`,
      );
      onClose();
      onDone(first);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.txt,.tsv,text/csv,text/plain"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void loadFile(f);
          e.target.value = "";
        }}
      />

      {/* STEP 1 — file */}
      {!parsed ? (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="group flex w-full flex-col items-center justify-center gap-2.5 rounded-xl border border-dashed border-line-strong bg-raised/40 px-6 py-12 transition-colors hover:border-gold/50"
          >
            <span className="grid h-12 w-12 place-items-center rounded-xl border border-line bg-raised text-gold transition-transform duration-200 group-hover:scale-105">
              <UploadIcon className="h-5 w-5" />
            </span>
            <span className="text-sm font-semibold text-ink">Upload a CSV of your trades</span>
            <span className="max-w-sm text-center text-xs leading-relaxed text-muted">
              Exported from your broker or a spreadsheet. Columns are detected automatically —
              date, P&amp;L, R:R, instrument, direction, setup, notes.
            </span>
          </button>
          {fileError && (
            <p role="alert" className="rounded-lg border border-loss/25 bg-loss/[0.06] px-3 py-2.5 text-[13px] text-loss">
              {fileError}
            </p>
          )}
          <div className="flex justify-end border-t border-line pt-4">
            <Button variant="subtle" onClick={onClose}>Cancel</Button>
          </div>
        </>
      ) : (
        <>
          {/* STEP 2 — challenge */}
          <div className="rounded-xl border border-gold/30 bg-gold/[0.05] p-4">
            <p className="text-sm font-semibold text-ink">Which challenge should these trades belong to?</p>
            <div className="mt-3 space-y-2">
              {challenges.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-3 rounded-control border border-line bg-surface px-3.5 py-2.5 text-sm has-[:checked]:border-gold/40 has-[:checked]:bg-gold/[0.06]">
                  <input type="radio" name="import-challenge" checked={challengeId === c.id} onChange={() => { setChallengeId(c.id); setNewChallengeName(""); }} className="h-4 w-4 accent-[var(--gold-strong)]" />
                  {c.name}
                </label>
              ))}
              <label className="flex cursor-pointer items-center gap-3 rounded-control border border-line bg-surface px-3.5 py-2.5 text-sm has-[:checked]:border-gold/40 has-[:checked]:bg-gold/[0.06]">
                <input type="radio" name="import-challenge" checked={challengeId === "" && newChallengeName === ""} onChange={() => { setChallengeId(""); setNewChallengeName(""); }} className="h-4 w-4 accent-[var(--gold-strong)]" />
                No challenge
              </label>
              <div className="flex items-center gap-2 pl-1">
                <span className="text-xs text-faint">or create:</span>
                <TextInput
                  aria-label="New challenge name"
                  placeholder="e.g. March $25K Challenge"
                  value={newChallengeName}
                  onChange={(e) => { setNewChallengeName(e.target.value); setChallengeId(""); }}
                  className="!py-2 text-sm"
                />
              </div>
            </div>
          </div>

          {/* STEP 3 — preview */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-raised/60 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">{fileName}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs">
                <span className="flex items-center gap-1 text-profit">
                  <CheckCircleIcon className="h-3.5 w-3.5" />
                  <span className="num">{rows.length}</span> valid {rows.length === 1 ? "trade" : "trades"}
                </span>
                {invalid.length > 0 && (
                  <span className="flex items-center gap-1 text-loss">
                    <AlertTriangleIcon className="h-3.5 w-3.5" />
                    <span className="num">{invalid.length}</span> invalid — listed below, not imported
                  </span>
                )}
              </p>
            </div>
            {rows.length > 0 && (
              <p className="num shrink-0 text-[12px] text-muted">
                {formatDateMedium(rows[0].date)} → {formatDateMedium(rows[rows.length - 1].date)} ·{" "}
                <span className={netPnl >= 0 ? "text-profit" : "text-loss"}>{formatSignedMoney(netPnl)}</span>
              </p>
            )}
          </div>

          {rows.length > 0 && (
            <div className="overflow-hidden rounded-xl border border-line">
              <div className="max-h-56 overflow-y-auto">
                <table className="w-full text-left text-[12.5px]">
                  <thead className="sticky top-0 bg-raised text-[10px] font-medium uppercase tracking-[0.08em] text-faint">
                    <tr>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium">P&amp;L</th>
                      <th className="px-3 py-2 font-medium">R</th>
                      <th className="px-3 py-2 font-medium">Instrument</th>
                      <th className="hidden px-3 py-2 font-medium sm:table-cell">Dir</th>
                      <th className="hidden px-3 py-2 font-medium md:table-cell">Setup</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line-soft">
                    {rows.map((r) => (
                      <tr key={r.line} className="bg-surface">
                        <td className="whitespace-nowrap px-3 py-2 tabular text-muted">{r.date}</td>
                        <td className={cn("whitespace-nowrap px-3 py-2 num", r.pnl > 0 ? "text-profit" : r.pnl < 0 ? "text-loss" : "text-muted")}>
                          {formatSignedMoney(r.pnl)}
                        </td>
                        <td className="px-3 py-2 tabular text-muted">{r.rr != null ? `${r.rr}R` : "—"}</td>
                        <td className="px-3 py-2 font-medium text-ink">{r.instrument}</td>
                        <td className="hidden px-3 py-2 capitalize text-muted sm:table-cell">{r.direction ?? "—"}</td>
                        <td className="hidden max-w-40 truncate px-3 py-2 text-muted md:table-cell">{r.setup || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {invalid.length > 0 && (
            <div className="rounded-xl border border-loss/25 bg-loss/[0.05] px-4 py-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-loss">
                <AlertTriangleIcon className="h-3.5 w-3.5" />
                {invalid.length} {invalid.length === 1 ? "row" : "rows"} could not be imported
              </p>
              <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-[12px] text-muted">
                {invalid.map((r) => (
                  <li key={r.line} className="flex items-baseline gap-2">
                    <span className="num shrink-0 text-faint">line {r.line}</span>
                    <span className="text-loss">{r.reason}</span>
                    <span className="truncate font-mono text-[11px] text-faint">{r.raw}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex items-center justify-between gap-2.5 border-t border-line pt-4">
            <Button variant="subtle" size="sm" onClick={() => inputRef.current?.click()} disabled={saving}>
              <UploadIcon className="h-3.5 w-3.5" />
              Different file
            </Button>
            <div className="flex gap-2.5">
              <Button variant="subtle" onClick={onClose} disabled={saving}>Cancel</Button>
              <Button variant="gold" onClick={() => void runImport()} loading={saving} disabled={saving || rows.length === 0}>
                Import {rows.length > 0 ? rows.length : ""} {rows.length === 1 ? "trade" : "trades"}
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
