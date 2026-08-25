"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { PlaybookSetup } from "@/lib/types";
import { uid } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, TextArea, TextInput } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm";
import { PencilIcon, PlusIcon, TargetIcon, TrashIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { EASE } from "@/components/landing/reveal";

const SESSION_SUGGESTIONS = ["Asia", "London", "Pre-market", "NY open", "Lunch", "NY afternoon"];

/**
 * Playbook — the trader's fully defined setups: the idea, the entry
 * conditions, what invalidates the trade, and how it's managed.
 * This is the strategy layer the rules engine and the AI companion
 * reason about.
 */
export function Playbook({ setups, onChange }: { setups: PlaybookSetup[]; onChange: (next: PlaybookSetup[]) => void }) {
  const [editing, setEditing] = useState<PlaybookSetup | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<PlaybookSetup | null>(null);

  const save = (setup: PlaybookSetup) => {
    const exists = setups.some((s) => s.id === setup.id);
    onChange(exists ? setups.map((s) => (s.id === setup.id ? setup : s)) : [...setups, setup]);
  };

  return (
    <section className="panel p-5 sm:p-6" aria-label="Playbook">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold tracking-tight text-ink">Playbook</h2>
          <p className="text-xs text-muted">
            Your defined setups — the strategy, the entry, the invalidation, the exit. If it's not
            written down, it's not a setup.
          </p>
        </div>
        <Button
          variant="gold"
          size="sm"
          onClick={() => {
            setCreating(true);
            setEditing(blankSetup());
          }}
        >
          <PlusIcon className="h-4 w-4" />
          Add setup
        </Button>
      </div>

      {setups.length === 0 ? (
        <p className="mt-4 rounded-control border border-dashed border-line-strong px-4 py-8 text-center text-sm text-muted">
          No setups defined yet. A playbook of three to five A+ setups beats a head full of maybes.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          <AnimatePresence initial={false}>
            {setups.map((s, i) => (
              <motion.article
                key={s.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.35, delay: i * 0.03, ease: EASE }}
                className="group rounded-control border border-line bg-raised/60 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{s.name}</p>
                    {s.strategy && <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted">{s.strategy}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <button
                      type="button"
                      aria-label={`Edit ${s.name}`}
                      onClick={() => {
                        setCreating(false);
                        setEditing(s);
                      }}
                      className="grid h-7 w-7 place-items-center rounded-md text-faint transition-colors hover:bg-ink/[0.05] hover:text-ink"
                    >
                      <PencilIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${s.name}`}
                      onClick={() => setDeleting(s)}
                      className="grid h-7 w-7 place-items-center rounded-md text-faint transition-colors hover:bg-loss/10 hover:text-loss"
                    >
                      <TrashIcon className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                  {s.minRR != null && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-gold/25 bg-gold/[0.07] px-2 py-0.5 text-[10px] font-semibold text-gold">
                      ≥ {s.minRR}R
                    </span>
                  )}
                  {s.instruments?.map((ins) => (
                    <span key={ins} className="rounded-full border border-line bg-surface px-2 py-0.5 font-mono text-[10px] text-muted">
                      {ins}
                    </span>
                  ))}
                  {s.sessions?.map((ses) => (
                    <span key={ses} className="rounded-full border border-info/25 bg-info/[0.06] px-2 py-0.5 text-[10px] text-info">
                      {ses}
                    </span>
                  ))}
                </div>

                <dl className="mt-3 space-y-1.5 border-t border-line-soft pt-3 text-xs leading-relaxed">
                  {s.entryConditions && <DetailRow term="Entry" text={s.entryConditions} />}
                  {s.invalidation && <DetailRow term="Invalidated" text={s.invalidation} tone="text-loss/90" />}
                  {s.exitRules && <DetailRow term="Exit" text={s.exitRules} tone="text-profit/90" />}
                </dl>
              </motion.article>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Editor */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        size="md"
        title={creating ? "Define a setup" : "Edit setup"}
        description="Write it like you'd explain it to your future self at 9:28 AM."
      >
        {editing && (
          <form
            className="space-y-4 px-6 py-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (!editing.name.trim()) return;
              save({ ...editing, name: editing.name.trim(), version: (editing.version ?? 1) + (creating ? 0 : 1), active: editing.active ?? true, updatedAt: Date.now() });
              setEditing(null);
            }}
          >
            <Field label="Setup name" htmlFor="pb-name">
              <TextInput
                id="pb-name"
                placeholder="e.g. Opening range breakout"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </Field>
            <Field label="The strategy" hint="where does the edge come from?" htmlFor="pb-strategy">
              <TextArea
                id="pb-strategy"
                className="min-h-16"
                placeholder="Why does this work? Who's on the other side of the trade?"
                value={editing.strategy ?? ""}
                onChange={(e) => setEditing({ ...editing, strategy: e.target.value })}
              />
            </Field>
            <Field label="Entry conditions" hint="one per line — all must be true" htmlFor="pb-entry">
              <TextArea
                id="pb-entry"
                className="min-h-20"
                placeholder={"Price above pre-market high\nVolume expansion on the break\nNo news within 15 min"}
                value={editing.entryConditions ?? ""}
                onChange={(e) => setEditing({ ...editing, entryConditions: e.target.value })}
              />
            </Field>
            <Field label="Invalidation" hint="what kills the idea?" htmlFor="pb-invalidation">
              <TextArea
                id="pb-invalidation"
                className="min-h-14"
                placeholder="Reclaims the range mid, or fails to follow through within 5 minutes"
                value={editing.invalidation ?? ""}
                onChange={(e) => setEditing({ ...editing, invalidation: e.target.value })}
              />
            </Field>
            <Field label="Target & exit rules" htmlFor="pb-exit">
              <TextArea
                id="pb-exit"
                className="min-h-14"
                placeholder="Stop below the range low. First target 1.5R, trail the rest."
                value={editing.exitRules ?? ""}
                onChange={(e) => setEditing({ ...editing, exitRules: e.target.value })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Minimum R:R" hint="optional" htmlFor="pb-minrr">
                <TextInput
                  id="pb-minrr"
                  inputMode="decimal"
                  className="tabular"
                  placeholder="2"
                  value={editing.minRR != null ? String(editing.minRR) : ""}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^\d.]/g, "");
                    setEditing({ ...editing, minRR: v === "" ? null : Number(v) });
                  }}
                />
              </Field>
              <Field label="Instruments" hint="optional" htmlFor="pb-instruments">
                <TextInput
                  id="pb-instruments"
                  placeholder="NQ, ES…"
                  value={editing.instruments?.join(", ") ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      instruments: e.target.value.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean),
                    })
                  }
                />
              </Field>
            </div>
            <Field label="Preferred sessions" hint="optional">
              <SessionPicker
                selected={editing.sessions ?? []}
                onChange={(sessions) => setEditing({ ...editing, sessions })}
              />
            </Field>

            <div className="flex items-center justify-end gap-2.5 border-t border-line pt-4">
              <Button type="button" variant="subtle" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" variant="gold" disabled={!editing.name.trim()}>
                {creating ? "Add to playbook" : "Save setup"}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) onChange(setups.filter((s) => s.id !== deleting.id));
          setDeleting(null);
        }}
        title={`Remove "${deleting?.name ?? ""}"?`}
        body="The setup will be removed from your playbook. Past journal entries keep their setup labels."
        confirmLabel="Remove setup"
      />
    </section>
  );
}

function blankSetup(): PlaybookSetup {
  return { id: uid("pb"), name: "", version: 1, active: true, createdAt: Date.now(), updatedAt: Date.now() };
}

function DetailRow({ term, text, tone }: { term: string; text: string; tone?: string }) {
  return (
    <div className="flex gap-2">
      <dt className={cn("w-20 shrink-0 text-[10px] font-semibold uppercase tracking-[0.08em] text-faint", tone)}>{term}</dt>
      <dd className="min-w-0 flex-1 text-muted">{text}</dd>
    </div>
  );
}

function SessionPicker({ selected, onChange }: { selected: string[]; onChange: (next: string[]) => void }) {
  const all = [...new Set([...SESSION_SUGGESTIONS, ...selected])];
  return (
    <div className="flex flex-wrap gap-1.5">
      {all.map((s) => {
        const active = selected.includes(s);
        return (
          <button
            key={s}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(active ? selected.filter((x) => x !== s) : [...selected, s])}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              active ? "border-gold/40 bg-gold/[0.1] text-gold" : "border-line bg-raised/60 text-faint hover:text-muted",
            )}
          >
            {s}
          </button>
        );
      })}
    </div>
  );
}
