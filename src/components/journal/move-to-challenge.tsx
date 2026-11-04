"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { useApp } from "@/lib/store";
import { formatDateMedium, formatSignedMoney } from "@/lib/format";
import type { JournalEntry } from "@/lib/types";
import { Collapse, ChoiceCard, Hint, Label, PrimaryButton, SheetFrame, StepTitle, TextBox } from "./flow-ui";

/**
 * MOVE TO CHALLENGE — re-file one trade (and its executed plan) under a different challenge,
 * or leave it unassigned, or create a new challenge on the spot. All trade evidence — screenshots,
 * review, reflection, checklist, prices, lessons — stays untouched; only the challenge scope changes.
 *
 * Same calm sheet as the rest of the flow: a question, choice cards, and one quiet primary action.
 */
export function MoveToChallengeModal({ open, entry, onClose }: { open: boolean; entry: JournalEntry | null; onClose: () => void }) {
  const settings = useApp((s) => s.settings);
  const challenges = useMemo(() => settings.challenges ?? [], [settings]);
  const currency = settings.currency;

  const [challengeId, setChallengeId] = useState("");
  const [newChallengeName, setNewChallengeName] = useState("");
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset each time the sheet opens for a (possibly different) trade.
  useEffect(() => {
    if (!open || !entry) return;
    setChallengeId(entry.challengeId ?? "");
    setNewChallengeName("");
    setCreating(false);
    setSaving(false);
    setError(null);
  }, [open, entry]);

  if (!entry) return null;

  const currentKey = entry.challengeId ?? "";
  const current = challenges.find((c) => c.id === entry.challengeId);
  const pick = (id: string) => { setChallengeId(id); setNewChallengeName(""); setCreating(false); };
  const startCreate = () => { setChallengeId(""); setNewChallengeName(""); setCreating(true); };

  // A move is only offered once the destination actually differs from where the trade already is.
  const changed = creating ? newChallengeName.trim().length > 0 : challengeId !== currentKey;

  const summary = [entry.instrument !== "—" ? entry.instrument : null, entry.direction, entry.rr != null ? `${entry.rr > 0 ? "+" : ""}${entry.rr}R` : null]
    .filter(Boolean)
    .join(" · ");

  const submit = async () => {
    if (!entry || saving || !changed) return;
    setSaving(true);
    setError(null);
    try {
      let dest = challengeId || null;
      let destName = dest ? challenges.find((c) => c.id === dest)?.name ?? "No challenge" : "No challenge";
      if (creating) {
        const id = `ch-${Date.now().toString(36)}`;
        await useApp.getState().saveChallenge({ id, name: newChallengeName.trim(), startingBalance: null, targetBalance: null, createdAt: Date.now() });
        dest = id;
        destName = newChallengeName.trim();
      }
      await useApp.getState().moveEntryToChallenge(entry.id, dest);
      toast.success("Trade moved", `Now filed under ${destName}.`);
      onClose();
    } catch {
      setError("Couldn't move the trade — try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="md" label="Move to challenge">
      <SheetFrame
        onClose={onClose}
        hint={error ? <Hint text={error} tone="warn" /> : <Hint text={current ? `Currently in ${current.name}` : "Currently unassigned"} tone="muted" />}
        actions={<PrimaryButton disabled={!changed} loading={saving} onClick={() => void submit()}>Move</PrimaryButton>}
      >
        <div className="space-y-8">
          <StepTitle title="Move to challenge" subtitle={summary ? `${summary} · ${formatDateMedium(entry.date)} · ${formatSignedMoney(entry.pnl, currency)}` : `${formatDateMedium(entry.date)} · ${formatSignedMoney(entry.pnl, currency)}`} />
          <p className="text-[14px] leading-relaxed text-muted">
            Re-file this trade without changing its charts, review or notes. Its executed plan moves with it.
          </p>

          <div className="grid gap-3 sm:grid-cols-2" role="radiogroup" aria-label="Destination challenge">
            {challenges.map((c) => (
              <ChoiceCard
                key={c.id}
                selected={!creating && challengeId === c.id}
                title={c.name}
                meta={c.id === settings.primaryChallengeId ? "Primary challenge" : c.id === entry.challengeId ? "Current" : undefined}
                onClick={() => pick(c.id)}
              />
            ))}
            <ChoiceCard selected={!creating && challengeId === ""} title="No challenge" meta="Leave it unassigned" onClick={() => pick("")} />
            <ChoiceCard selected={creating} title="New challenge" meta="Create one now" onClick={startCreate} />
          </div>

          <AnimatePresence initial={false}>
            {creating && (
              <Collapse key="new-challenge">
                <div className="space-y-2.5 p-1 pt-0">
                  <Label done={newChallengeName.trim() !== ""} htmlFor="move-new-challenge">Challenge name</Label>
                  <TextBox id="move-new-challenge" autoFocus value={newChallengeName} onChange={(e) => setNewChallengeName(e.target.value)} placeholder="e.g. March $25K Challenge" maxLength={80} />
                </div>
              </Collapse>
            )}
          </AnimatePresence>
        </div>
      </SheetFrame>
    </Modal>
  );
}
