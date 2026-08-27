"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { JournalEntry, PlaybookRule, PlaybookSetup } from "@/lib/types";
import { setupRules } from "@/lib/types";
import { setupStats, tradesForSetup } from "@/lib/setup-stats";
import { formatSignedMoney } from "@/lib/format";
import { uid } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Field, TextArea, TextInput } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm";
import {
  ChevronRightIcon,
  PencilIcon,
  PlusIcon,
  TrashIcon,
} from "@/components/ui/icons";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { EASE } from "@/components/landing/reveal";
import { SetupDetail } from "@/components/lab/setup-detail";

const SESSION_SUGGESTIONS = ["Asia", "London", "Pre-market", "NY open", "Lunch", "NY afternoon"];

/**
 * Playbook — the canonical setups / playbook workspace.
 * Setups render as folder-style boxed cards; opening one reveals its
 * unlimited user-defined rules (each editable), associated trades and stats.
 * One canonical setup entity — Journal, Planning and MINATO all reference it.
 */
export function Playbook({
  setups,
  entries,
}: {
  setups: PlaybookSetup[];
  entries: JournalEntry[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [editing, setEditing] = useState<PlaybookSetup | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<PlaybookSetup | null>(null);

  // Memoized per-setup trades/stats — stable references per entries/setups change.
  const statsById = useMemo(() => {
    const map = new Map<string, { trades: JournalEntry[]; rules: PlaybookRule[] }>();
    for (const s of setups) {
      map.set(s.id, { trades: tradesForSetup(s, entries), rules: setupRules(s) });
    }
    return map;
  }, [setups, entries]);

  const openSetup = openId ? setups.find((s) => s.id === openId) ?? null : null;

  return (
    <section className="panel p-5 sm:p-6" aria-label="Playbook setups">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold tracking-tight text-ink">Setups</h2>
          <p className="text-xs text-muted">
            Your playbook. Open a setup like a folder to see and edit its rules, trades and performance.
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
          New setup
        </Button>
      </div>

      {setups.length === 0 ? (
        <p className="mt-4 rounded-control border border-dashed border-line-strong px-4 py-8 text-center text-sm text-muted">
          No setups yet. A playbook of three to five A+ setups beats a head full of maybes.
        </p>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence initial={false}>
            {setups.map((s, i) => {
              const info = statsById.get(s.id);
              const st = setupStats(info?.trades ?? []);
              return (
                <motion.button
                  key={s.id}
                  layout
                  type="button"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.35, delay: Math.min(i * 0.03, 0.15), ease: EASE }}
                  onClick={() => setOpenId(s.id)}
                  whileHover={{ y: -3 }}
                  className="group rounded-control border border-line bg-raised/60 p-4 text-left transition-colors hover:border-gold/40"
                  aria-label={`Open setup ${s.name}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="flex min-w-0 items-center gap-2 text-sm font-semibold text-ink">
                      <span aria-hidden className="text-base">📁</span>
                      <span className="truncate">{s.name}</span>
                    </p>
                    <ChevronRightIcon className="mt-1 h-4 w-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-gold" />
                  </div>

                  <p className="num mt-2 text-[11px] text-muted">
                    {info?.rules.length ?? 0} {(info?.rules.length ?? 0) === 1 ? "rule" : "rules"} ·{" "}
                    {st.trades} {st.trades === 1 ? "trade" : "trades"}
                  </p>

                  <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft pt-2.5 text-[11px]">
                    <span className={cn("num font-semibold", st.totalPnl > 0 ? "text-profit" : st.totalPnl < 0 ? "text-loss" : "text-faint")}>
                      {st.trades > 0 ? formatSignedMoney(st.totalPnl) : "—"}
                    </span>
                    <span className="text-faint">P&L</span>
                    <span className="num ml-auto font-semibold text-ink">
                      {st.winRate != null ? `${Math.round(st.winRate * 100)}%` : "—"}
                    </span>
                    <span className="text-faint">win rate</span>
                  </div>
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Setup detail — the "folder" view */}
      {openSetup && (
        <SetupDetail
          key={`${openSetup.id}:${openSetup.updatedAt}`}
          setup={openSetup}
          trades={statsById.get(openSetup.id)?.trades ?? []}
          onClose={() => setOpenId(null)}
          onEdit={() => {
            setCreating(false);
            setEditing(openSetup);
          }}
          onDelete={() => setDeleting(openSetup)}
        />
      )}

      {/* Setup editor (create / edit) with unlimited rules */}
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        size="md"
        title={creating ? "Define a setup" : "Edit setup"}
        description="Write it like you'd explain it to your future self at 9:28 AM."
      >
        {editing && (
          <SetupEditor
            key={editing.id}
            draft={editing}
            isNew={creating}
            onCancel={() => setEditing(null)}
            onSave={(next) => {
              void useApp.getState().saveSetup(next);
              setEditing(null);
            }}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) void useApp.getState().deleteSetup(deleting.id);
          setOpenId((cur) => (cur === deleting?.id ? null : cur));
          setDeleting(null);
        }}
        title={`Remove "${deleting?.name ?? ""}"?`}
        body="The setup will be removed from your playbook. Past journal entries keep their setup labels — no trades are deleted."
        confirmLabel="Remove setup"
      />
    </section>
  );
}

/* ------------------------------ editor ------------------------------ */

function SetupEditor({
  draft,
  isNew,
  onSave,
  onCancel,
}: {
  draft: PlaybookSetup;
  isNew: boolean;
  onSave: (setup: PlaybookSetup) => void;
  onCancel: () => void;
}) {
  const [setup, setSetup] = useState<PlaybookSetup>(() => ({
    ...draft,
    rules: setupRules(draft),
  }));

  const updateRule = (id: string, patch: Partial<PlaybookRule>) =>
    setSetup((s) => ({ ...s, rules: (s.rules ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
  const addRule = () =>
    setSetup((s) => ({ ...s, rules: [...(s.rules ?? []), { id: uid("r"), text: "" }] }));
  const removeRule = (id: string) =>
    setSetup((s) => ({ ...s, rules: (s.rules ?? []).filter((r) => r.id !== id) }));

  const canSave = !!setup.name.trim();

  return (
    <form
      className="space-y-4 px-6 py-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSave) return;
        // Drop empty rules; keep legacy entryConditions in sync for old consumers.
        const rules = (setup.rules ?? []).filter((r) => r.text.trim());
        onSave({ ...setup, name: setup.name.trim(), rules, entryConditions: rules.map((r) => r.text).join("\n") || undefined });
      }}
    >
      <Field label="Setup name" htmlFor="pb-name">
        <TextInput
          id="pb-name"
          placeholder="e.g. VWAP Reclaim"
          value={setup.name}
          onChange={(e) => setSetup({ ...setup, name: e.target.value })}
        />
      </Field>
      <Field label="The strategy" hint="where does the edge come from? (optional)" htmlFor="pb-strategy">
        <TextArea
          id="pb-strategy"
          className="min-h-16"
          placeholder="Why does this work? Who's on the other side of the trade?"
          value={setup.strategy ?? ""}
          onChange={(e) => setSetup({ ...setup, strategy: e.target.value })}
        />
      </Field>

      {/* Unlimited rules */}
      <div>
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-medium text-ink">
            Rules <span className="font-normal text-faint">— add as many as you need</span>
          </p>
          <Button type="button" variant="outline" size="sm" onClick={addRule}>
            <PlusIcon className="h-3.5 w-3.5" />
            Add rule
          </Button>
        </div>
        <div className="mt-2 space-y-2">
          {(setup.rules ?? []).length === 0 && (
            <p className="rounded-control border border-dashed border-line-strong px-3 py-3 text-center text-xs text-muted">
              No rules yet. Each rule is one condition that must hold before an entry.
            </p>
          )}
          {(setup.rules ?? []).map((r, i) => (
            <div key={r.id} className="rounded-control border border-line bg-raised/50 p-3">
              <div className="flex items-start gap-2.5">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line-strong bg-surface text-[10px] font-bold text-muted mt-1.5">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <TextInput
                    aria-label={`Rule ${i + 1} text`}
                    placeholder="Rule text — e.g. price reclaims VWAP with conviction"
                    value={r.text}
                    onChange={(e) => updateRule(r.id, { text: e.target.value })}
                  />
                  <TextInput
                    aria-label={`Rule ${i + 1} description`}
                    placeholder="Description (optional)"
                    className="!text-[13px]"
                    value={r.description ?? ""}
                    onChange={(e) => updateRule(r.id, { description: e.target.value || undefined })}
                  />
                </div>
                <button
                  type="button"
                  aria-label={`Remove rule ${i + 1}`}
                  onClick={() => removeRule(r.id)}
                  className="mt-1.5 grid h-7 w-7 shrink-0 place-items-center rounded-md text-faint transition-colors hover:bg-loss/10 hover:text-loss"
                >
                  <TrashIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <details className="rounded-control border border-line bg-raised/40 px-3.5 py-2.5 text-[13px]">
        <summary className="cursor-pointer select-none font-medium text-muted">Optional details — targets, instruments, sessions</summary>
        <div className="mt-3 space-y-4">
          <Field label="Invalidation" hint="what kills the idea?" htmlFor="pb-invalidation">
            <TextArea id="pb-invalidation" className="min-h-14" value={setup.invalidation ?? ""} onChange={(e) => setSetup({ ...setup, invalidation: e.target.value })} />
          </Field>
          <Field label="Target & exit rules" htmlFor="pb-exit">
            <TextArea id="pb-exit" className="min-h-14" value={setup.exitRules ?? ""} onChange={(e) => setSetup({ ...setup, exitRules: e.target.value })} />
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
                onChange={(e) =>
                  setSetup({ ...setup, instruments: e.target.value.split(",").map((x) => x.trim().toUpperCase()).filter(Boolean) })
                }
              />
            </Field>
          </div>
          <Field label="Preferred sessions" hint="optional">
            <SessionPicker selected={setup.sessions ?? []} onChange={(sessions) => setSetup({ ...setup, sessions })} />
          </Field>
        </div>
      </details>

      <div className="flex items-center justify-end gap-2.5 border-t border-line pt-4">
        <Button type="button" variant="subtle" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="gold" disabled={!canSave}>
          {isNew ? "Add to playbook" : "Save setup"}
        </Button>
      </div>
    </form>
  );
}

function blankSetup(): PlaybookSetup {
  return { id: uid("pb"), name: "", version: 1, active: true, createdAt: Date.now(), updatedAt: Date.now(), rules: [] };
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
