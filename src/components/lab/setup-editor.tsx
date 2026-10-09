"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { PlaybookRule, PlaybookSetup } from "@/lib/types";
import { setupRules } from "@/lib/types";
import { uid, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, TextArea, TextInput } from "@/components/ui/input";
import { ChevronRightIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";
import { EASE, SectionLabel, Sheet, useRetained } from "./lab-ui";

const SESSION_SUGGESTIONS = ["Asia", "London", "Pre-market", "NY open", "Lunch", "NY afternoon"];

export function blankSetup(): PlaybookSetup {
  return { id: uid("pb"), name: "", version: 1, active: true, createdAt: Date.now(), updatedAt: Date.now(), rules: [] };
}

/**
 * Create / edit a setup. Same fields and the same save semantics as before:
 * empty rules are dropped, and legacy `entryConditions` stays in sync for older consumers.
 */
export function SetupEditorSheet({
  draft,
  isNew,
  formKey,
  onSave,
  onCancel,
}: {
  draft: PlaybookSetup | null;
  isNew: boolean;
  formKey: number;
  onSave: (setup: PlaybookSetup) => void;
  onCancel: () => void;
}) {
  const shown = useRetained(draft);
  const isNewShown = useRef(isNew);
  if (draft) isNewShown.current = isNew;
  const formId = "setup-editor-form";
  const [canSave, setCanSave] = useState(false);

  return (
    <Sheet
      open={!!draft}
      onClose={onCancel}
      label={isNewShown.current ? "New setup" : "Edit setup"}
      footer={
        <>
          <Button type="button" variant="subtle" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" form={formId} variant="gold" disabled={!canSave}>
            {isNewShown.current ? "Add to playbook" : "Save setup"}
          </Button>
        </>
      }
    >
      {shown && (
        <SetupForm key={`${shown.id}:${formKey}`} formId={formId} draft={shown} isNew={isNewShown.current} onSave={onSave} onValid={setCanSave} />
      )}
    </Sheet>
  );
}

function SetupForm({
  formId,
  draft,
  isNew,
  onSave,
  onValid,
}: {
  formId: string;
  draft: PlaybookSetup;
  isNew: boolean;
  onSave: (setup: PlaybookSetup) => void;
  onValid: (ok: boolean) => void;
}) {
  const [setup, setSetup] = useState<PlaybookSetup>(() => ({ ...draft, rules: setupRules(draft) }));
  const [focusId, setFocusId] = useState<string | null>(null);
  const hasExtras = !!(draft.invalidation || draft.exitRules || draft.minRR != null || draft.instruments?.length || draft.sessions?.length);
  const [more, setMore] = useState(hasExtras);

  const rules = setup.rules ?? [];
  const canSave = !!setup.name.trim();
  useEffect(() => onValid(canSave), [canSave, onValid]);

  useEffect(() => {
    if (!focusId) return;
    document.getElementById(`rule-${focusId}`)?.focus();
    setFocusId(null);
  }, [focusId, rules.length]);

  const updateRule = (id: string, patch: Partial<PlaybookRule>) =>
    setSetup((s) => ({ ...s, rules: (s.rules ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const addRule = () => {
    const id = uid("r");
    setSetup((s) => ({ ...s, rules: [...(s.rules ?? []), { id, text: "" }] }));
    setFocusId(id);
  };
  const removeRule = (id: string) => setSetup((s) => ({ ...s, rules: (s.rules ?? []).filter((r) => r.id !== id) }));

  const submit = () => {
    if (!canSave) return;
    const clean = rules.filter((r) => r.text.trim());
    onSave({ ...setup, name: setup.name.trim(), rules: clean, entryConditions: clean.map((r) => r.text).join("\n") || undefined });
  };

  return (
    <form
      id={formId}
      className="space-y-7 px-5 pb-8 pt-2 sm:px-7"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
          e.preventDefault();
          submit();
        }
      }}
    >
      <header>
        <h2 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.025em] text-ink">{isNew ? "New setup" : "Edit setup"}</h2>
        <p className="mt-1 text-[14px] text-muted">Write it like you&rsquo;d explain it to your future self at 9:28 AM.</p>
      </header>

      <div className="space-y-4">
        <Field label="Name" htmlFor="pb-name">
          <TextInput
            id="pb-name"
            autoFocus={isNew}
            placeholder="e.g. VWAP Reclaim"
            value={setup.name}
            onChange={(e) => setSetup({ ...setup, name: e.target.value })}
          />
        </Field>
        <Field label="Strategy" hint="where does the edge come from? (optional)" htmlFor="pb-strategy">
          <TextArea
            id="pb-strategy"
            className="min-h-20"
            placeholder="Why does this work? Who's on the other side of the trade?"
            value={setup.strategy ?? ""}
            onChange={(e) => setSetup({ ...setup, strategy: e.target.value })}
          />
        </Field>
      </div>

      {/* Rules */}
      <section aria-label="Rules">
        <div className="flex items-end justify-between gap-3">
          <div>
            <SectionLabel>Rules</SectionLabel>
            <p className="mt-1 text-[13px] text-muted">One condition per rule. Add as many as you need.</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addRule}>
            <PlusIcon className="h-3.5 w-3.5" />
            Add rule
          </Button>
        </div>

        {rules.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-line-strong px-4 py-6 text-center text-[13.5px] text-muted">
            No rules yet. Each rule is one condition that must hold before an entry.
          </p>
        ) : (
          <ol className="mt-3 space-y-2.5">
            <AnimatePresence initial={false}>
              {rules.map((r, i) => (
                <motion.li
                  key={r.id}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.26, ease: EASE }}
                  className="overflow-hidden"
                >
                  <div className="flex items-start gap-2.5 rounded-2xl border border-line bg-raised/60 p-3">
                    <span className="lb-step mt-2">{i + 1}</span>
                    <div className="min-w-0 flex-1 space-y-2">
                      <TextInput
                        id={`rule-${r.id}`}
                        aria-label={`Rule ${i + 1} text`}
                        placeholder="e.g. price reclaims VWAP with conviction"
                        value={r.text}
                        onChange={(e) => updateRule(r.id, { text: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key !== "Enter" || e.metaKey || e.ctrlKey) return;
                          e.preventDefault();
                          const next = rules[i + 1];
                          if (next) document.getElementById(`rule-${next.id}`)?.focus();
                          else if (r.text.trim()) addRule();
                        }}
                      />
                      <TextInput
                        aria-label={`Rule ${i + 1} description`}
                        placeholder="Description (optional)"
                        className="!text-[13.5px]"
                        value={r.description ?? ""}
                        onChange={(e) => updateRule(r.id, { description: e.target.value || undefined })}
                      />
                    </div>
                    <button
                      type="button"
                      aria-label={`Remove rule ${i + 1}`}
                      onClick={() => removeRule(r.id)}
                      className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-faint transition-colors hover:bg-loss/10 hover:text-loss"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        )}
      </section>

      {/* Optional details */}
      <section aria-label="Optional details">
        <button
          type="button"
          aria-expanded={more}
          onClick={() => setMore((v) => !v)}
          className="-mx-1 flex w-[calc(100%+8px)] items-center justify-between rounded-xl px-1 py-1.5 text-left transition-colors hover:bg-ink/[0.03]"
        >
          <span>
            <span className="block text-[15px] font-medium text-ink">More details</span>
            <span className="block text-[13px] text-muted">Invalidation, exits, R:R, instruments, sessions</span>
          </span>
          <ChevronRightIcon className={cn("h-4 w-4 text-faint transition-transform duration-300", more && "rotate-90")} />
        </button>
        <AnimatePresence initial={false}>
          {more && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
              className="overflow-hidden"
            >
              <div className="space-y-4 pb-1 pt-4">
                <Field label="Invalidation" hint="what kills the idea?" htmlFor="pb-invalidation">
                  <TextArea id="pb-invalidation" className="min-h-16" value={setup.invalidation ?? ""} onChange={(e) => setSetup({ ...setup, invalidation: e.target.value })} />
                </Field>
                <Field label="Target & exit rules" htmlFor="pb-exit">
                  <TextArea id="pb-exit" className="min-h-16" value={setup.exitRules ?? ""} onChange={(e) => setSetup({ ...setup, exitRules: e.target.value })} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Minimum R:R" hint="optional" htmlFor="pb-minrr">
                    <TextInput
                      id="pb-minrr"
                      inputMode="decimal"
                      className="tabular"
                      value={setup.minRR != null ? String(setup.minRR) : ""}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^\d.]/g, "");
                        setSetup({ ...setup, minRR: v === "" ? null : Number(v) });
                      }}
                    />
                  </Field>
                  <Field label="Instruments" hint="optional" htmlFor="pb-instruments">
                    <TextInput
                      id="pb-instruments"
                      placeholder="NQ, ES…"
                      value={setup.instruments?.join(", ") ?? ""}
                      onChange={(e) => setSetup({ ...setup, instruments: e.target.value.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean) })}
                    />
                  </Field>
                </div>
                <Field label="Preferred sessions" hint="optional">
                  <SessionPicker selected={setup.sessions ?? []} onChange={(sessions) => setSetup({ ...setup, sessions })} />
                </Field>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </form>
  );
}

function SessionPicker({ selected, onChange }: { selected: string[]; onChange: (next: string[]) => void }) {
  const all = [...new Set([...SESSION_SUGGESTIONS, ...selected])];
  return (
    <div className="flex flex-wrap gap-2">
      {all.map((s) => {
        const active = selected.includes(s);
        return (
          <button
            key={s}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? selected.filter((x) => x !== s) : [...selected, s])}
            className={cn(
              "h-9 rounded-full border px-3.5 text-[13px] font-medium transition-[background-color,border-color,color,transform] duration-200 active:scale-[0.96]",
              active ? "border-gold/50 bg-gold/[0.12] text-gold-deep dark:text-gold" : "border-line bg-raised text-muted hover:border-line-strong hover:text-ink",
            )}
          >
            {s}
          </button>
        );
      })}
    </div>
  );
}
