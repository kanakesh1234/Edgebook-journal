"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useApp, persistFailedSince } from "@/lib/store";
import type { Challenge, DrawdownMode, TrailingBasis } from "@/lib/types";
import { uid } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, TextArea, TextInput } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { EASE, SectionLabel, Segmented, Sheet, useRetained } from "./lab-ui";

export type FormState = { mode: "new" } | { mode: "edit"; challenge: Challenge };

const DD_HELP: Record<string, string> = {
  static: "Fixed loss floor (starting balance − max drawdown) that never moves.",
  eod: "Floor trails the highest end-of-day balance − max drawdown. It only moves up, and only after a day closes.",
  live: "Floor trails the highest balance reached − max drawdown. It moves up immediately with every new high.",
};

const num = (v: string) => v.replace(/[^\d.]/g, "");

/** Create / edit a challenge. Same fields, validation and persistence as before. */
export function ChallengeFormSheet({
  state,
  formKey,
  onClose,
}: {
  state: FormState | null;
  formKey: number;
  onClose: () => void;
}) {
  const shown = useRetained(state);
  const editing = shown?.mode === "edit";
  const formId = "challenge-form";
  const [busy, setBusy] = useState(false);

  return (
    <Sheet
      open={!!state}
      onClose={onClose}
      label={editing ? "Edit challenge" : "New challenge"}
      footer={
        <>
          <Button type="button" variant="subtle" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="gold" loading={busy}>
            {editing ? "Save challenge" : "Create challenge"}
          </Button>
        </>
      }
    >
      {shown && (
        <Form
          key={`${shown.mode === "edit" ? shown.challenge.id : "new"}:${formKey}`}
          formId={formId}
          editing={shown.mode === "edit" ? shown.challenge : null}
          onClose={onClose}
          onBusy={setBusy}
        />
      )}
    </Sheet>
  );
}

function Form({
  formId,
  editing,
  onClose,
  onBusy,
}: {
  formId: string;
  editing: Challenge | null;
  onClose: () => void;
  onBusy: (b: boolean) => void;
}) {
  const [name, setName] = useState(editing?.name ?? "");
  const [startingBalance, setStartingBalance] = useState(editing?.startingBalance?.toString() ?? "");
  const [targetBalance, setTargetBalance] = useState(editing?.targetBalance?.toString() ?? "");
  const [maxDrawdown, setMaxDrawdown] = useState(editing?.maxDrawdown?.toString() ?? "");
  const [drawdownMode, setDrawdownMode] = useState<DrawdownMode>(editing?.drawdownMode ?? "static");
  // Legacy dynamic challenges without a basis behave as live; new ones default to EOD.
  const [trailingBasis, setTrailingBasis] = useState<TrailingBasis>(editing ? editing.trailingBasis ?? "live" : "eod");
  const [drawdownFloor, setDrawdownFloor] = useState(editing?.drawdownFloor?.toString() ?? "");
  const [startDate, setStartDate] = useState(editing?.startDate ?? "");
  const [endDate, setEndDate] = useState(editing?.endDate ?? "");
  const [dailyProfitTarget, setDailyProfitTarget] = useState(editing?.dailyProfitTarget?.toString() ?? "");
  const [dailyLossLimit, setDailyLossLimit] = useState(editing?.dailyLossLimit?.toString() ?? "");
  const [tradeLimit, setTradeLimit] = useState(editing?.tradeLimit?.toString() ?? "");
  const [instruments, setInstruments] = useState(editing?.instruments?.join(", ") ?? "");
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => onBusy(false), [onBusy]);

  const save = async () => {
    if (!name.trim()) return setError("Give the challenge a name.");
    const start = Number(startingBalance);
    const target = Number(targetBalance);
    if (!Number.isFinite(start) || start <= 0) return setError("Enter a valid starting balance.");
    if (!Number.isFinite(target) || target <= start) return setError("Target must be above the starting balance.");
    const saved: Challenge = {
      id: editing?.id ?? uid(`ch-${Date.now().toString(36)}`),
      name: name.trim(),
      notes: notes.trim() || undefined,
      startingBalance: start,
      targetBalance: target,
      drawdownMode,
      trailingBasis: drawdownMode === "dynamic" ? trailingBasis : null,
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
    setError(null);
    onBusy(true);
    const t0 = Date.now();
    try {
      await useApp.getState().saveChallenge(saved);
      // The first challenge becomes primary automatically so Home follows it.
      if (!editing && !useApp.getState().settings.primaryChallengeId) {
        await useApp.getState().setPrimaryChallenge(saved.id);
      }
      if (!persistFailedSince(t0) && !editing) toast.success("Challenge created");
      onClose();
    } catch {
      setError("Could not save the challenge. Please try again.");
      onBusy(false);
    }
  };

  return (
    <form
      id={formId}
      className="space-y-8 px-5 pb-8 pt-2 sm:px-7"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <header>
        <h2 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.025em] text-ink">{editing ? "Edit challenge" : "New challenge"}</h2>
        <p className="mt-1 text-[14px] text-muted">Define the objective. Edgebook measures the journey.</p>
      </header>

      <div className="space-y-4">
        <Field label="Name" htmlFor="ch-name">
          <TextInput id="ch-name" autoFocus={!editing} placeholder="e.g. March $25K Challenge" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Description" hint="optional" htmlFor="ch-notes">
          <TextArea id="ch-notes" className="min-h-16" placeholder="What does passing this challenge mean?" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>

      <section className="space-y-4" aria-label="Objective">
        <SectionLabel>Objective</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Starting balance" htmlFor="ch-start">
            <TextInput id="ch-start" inputMode="decimal" className="tabular" value={startingBalance} onChange={(e) => setStartingBalance(num(e.target.value))} />
          </Field>
          <Field label="Target balance" htmlFor="ch-target">
            <TextInput id="ch-target" inputMode="decimal" className="tabular" value={targetBalance} onChange={(e) => setTargetBalance(num(e.target.value))} />
          </Field>
        </div>
      </section>

      <section className="space-y-4" aria-label="Drawdown">
        <SectionLabel>Drawdown</SectionLabel>
        <Field label="Max drawdown" htmlFor="ch-dd">
          <TextInput id="ch-dd" inputMode="decimal" className="tabular" value={maxDrawdown} onChange={(e) => setMaxDrawdown(num(e.target.value))} />
        </Field>
        <div className="space-y-1.5">
          <p className="text-[13px] font-medium text-muted">Type</p>
          <Segmented
            role="radiogroup"
            label="Drawdown type"
            layoutId="ch-ddmode"
            className="w-full"
            value={drawdownMode}
            onChange={setDrawdownMode}
            options={[
              { id: "static", label: "Static" },
              { id: "dynamic", label: "Dynamic" },
            ]}
          />
        </div>
        <AnimatePresence initial={false}>
          {drawdownMode === "dynamic" && (
            <motion.div
              key="dyn"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.28, ease: EASE }}
              className="overflow-hidden"
            >
              <div className="space-y-4 pb-1">
                <div className="space-y-1.5">
                  <p className="text-[13px] font-medium text-muted">Trailing basis</p>
                  <Segmented
                    role="radiogroup"
                    label="Trailing basis"
                    layoutId="ch-ddbasis"
                    className="w-full"
                    value={trailingBasis}
                    onChange={setTrailingBasis}
                    options={[
                      { id: "eod", label: "End of day" },
                      { id: "live", label: "Live (intraday)" },
                    ]}
                  />
                </div>
                <Field label="Floor / lock" hint="optional — trailing floor never goes below this" htmlFor="ch-ddfloor">
                  <TextInput
                    id="ch-ddfloor"
                    inputMode="decimal"
                    className="tabular"
                    placeholder={`e.g. ${(Number(startingBalance) || 50000) - (Number(maxDrawdown) || 2500)}`}
                    value={drawdownFloor}
                    onChange={(e) => setDrawdownFloor(num(e.target.value))}
                  />
                </Field>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        <p className="text-[13px] leading-relaxed text-muted">
          {DD_HELP[drawdownMode === "dynamic" ? trailingBasis : "static"]} Cushion = current equity − current floor.
        </p>
      </section>

      <section className="space-y-4" aria-label="Daily limits">
        <SectionLabel>Daily limits</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Profit target" hint="optional" htmlFor="ch-dpt">
            <TextInput id="ch-dpt" inputMode="decimal" className="tabular" value={dailyProfitTarget} onChange={(e) => setDailyProfitTarget(num(e.target.value))} />
          </Field>
          <Field label="Loss limit" hint="optional" htmlFor="ch-dll">
            <TextInput id="ch-dll" inputMode="decimal" className="tabular" value={dailyLossLimit} onChange={(e) => setDailyLossLimit(num(e.target.value))} />
          </Field>
          <Field label="Trades per day" hint="optional" htmlFor="ch-tl" className="col-span-2 sm:col-span-1">
            <TextInput id="ch-tl" inputMode="numeric" className="tabular" value={tradeLimit} onChange={(e) => setTradeLimit(e.target.value.replace(/[^\d]/g, ""))} />
          </Field>
        </div>
      </section>

      <section className="space-y-4" aria-label="Window and markets">
        <SectionLabel>Window & markets</SectionLabel>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start date" hint="optional" htmlFor="ch-startdate">
            <TextInput id="ch-startdate" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </Field>
          <Field label="End date" hint="optional" htmlFor="ch-enddate">
            <TextInput id="ch-enddate" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Instruments" hint="optional, comma-separated" htmlFor="ch-instruments">
          <TextInput id="ch-instruments" placeholder="NQ, ES…" value={instruments} onChange={(e) => setInstruments(e.target.value)} />
        </Field>
      </section>

      <AnimatePresence>
        {error && (
          <motion.p
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="rounded-xl border border-loss/25 bg-loss/[0.06] px-3.5 py-2.5 text-[13.5px] text-loss"
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </form>
  );
}
