"use client";

import { useState } from "react";
import type { JournalEntry, PlaybookRule, PlaybookSetup } from "@/lib/types";
import { setupRules } from "@/lib/types";
import { setupStats } from "@/lib/setup-stats";
import { formatSignedMoney } from "@/lib/format";
import { uid } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { TextArea, TextInput } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PencilIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * SetupDetail — the shared "open the folder" view for a playbook setup.
 * Used by the Trading Lab and the Journal setup browser. One canonical
 * setup entity: rule edits persist through the app data layer.
 */
export function SetupDetail({
  setup,
  trades,
  onClose,
  onEdit,
  onDelete,
}: {
  setup: PlaybookSetup;
  trades: JournalEntry[];
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [rules, setRules] = useState<PlaybookRule[]>(() => setupRules(setup));
  const [adding, setAdding] = useState(false);

  const persistRules = (next: PlaybookRule[]) => {
    setRules(next);
    void useApp.getState().saveSetup({ ...setup, rules: next.filter((r) => r.text.trim()) });
  };

  const st = setupStats(trades);

  return (
    <Modal open onClose={onClose} size="md" label={`Setup: ${setup.name}`} title={setup.name}
      description={`${rules.length} ${rules.length === 1 ? "rule" : "rules"} · ${trades.length} ${trades.length === 1 ? "trade" : "trades"}${setup.strategy ? ` · ${setup.strategy}` : ""}`}>
      <div className="space-y-5 px-6 py-6">
        {/* Performance */}
        <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-control border border-line bg-line">
          {([
            ["Trades", String(st.trades)],
            ["Win rate", st.winRate != null ? `${Math.round(st.winRate * 100)}%` : "—"],
            ["P&L", st.trades > 0 ? formatSignedMoney(st.totalPnl) : "—"],
          ] as const).map(([label, value]) => (
            <div key={label} className="bg-surface px-3 py-2.5">
              <dt className="text-[10px] font-medium uppercase tracking-[0.1em] text-faint">{label}</dt>
              <dd className={cn(
                "num mt-1 truncate text-sm font-semibold",
                label === "P&L" && st.totalPnl > 0 ? "text-profit" : label === "P&L" && st.totalPnl < 0 ? "text-loss" : "text-ink",
              )}>{value}</dd>
            </div>
          ))}
        </dl>

        {/* Rules */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">Rules</p>
          <ul className="mt-2 space-y-2">
            {rules.length === 0 && (
              <li className="rounded-control border border-dashed border-line-strong px-3 py-4 text-center text-xs text-muted">
                No rules yet — add the conditions that must be true before you enter.
              </li>
            )}
            {rules.map((r, i) => (
              <li key={r.id} className="group flex items-start gap-3 rounded-control border border-line bg-raised/60 px-3.5 py-2.5">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line-strong bg-surface text-[10px] font-bold text-muted">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-ink">{r.text}</p>
                  {r.description && <p className="mt-0.5 text-xs leading-relaxed text-muted">{r.description}</p>}
                </div>
                <span className="flex shrink-0 gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <button
                    type="button"
                    aria-label="Delete rule"
                    onClick={() => persistRules(rules.filter((x) => x.id !== r.id))}
                    className="grid h-7 w-7 place-items-center rounded-md text-faint hover:bg-loss/10 hover:text-loss"
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <Button
            variant="outline"
            size="sm"
            className="mt-2.5"
            onClick={() => setAdding(true)}
          >
            <PlusIcon className="h-3.5 w-3.5" />
            Add rule
          </Button>
          {adding && (
            <div className="mt-2">
              <NewRuleInput
                onSave={(text, description) => {
                  persistRules([...rules, { id: uid("r"), text, description: description || undefined }]);
                  setAdding(false);
                }}
                onRemove={() => setAdding(false)}
              />
            </div>
          )}
        </div>

        {/* Associated trades */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">Associated trades</p>
          {trades.length === 0 ? (
            <p className="mt-2 rounded-control border border-dashed border-line-strong px-3 py-4 text-center text-xs text-muted">
              No trades tagged with this setup yet. Assign it when logging or importing a trade.
            </p>
          ) : (
            <ul className="mt-2 divide-y divide-line-soft">
              {[...trades]
                .sort((a, b) => b.date.localeCompare(a.date))
                .slice(0, 8)
                .map((e) => (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-[13px]">
                    <span className="min-w-0 truncate text-muted">
                      <span className="num text-faint">{e.date}</span> · {e.instrument !== "—" ? e.instrument : e.setup}
                    </span>
                    <span className={cn("num shrink-0 font-semibold", e.pnl > 0 ? "text-profit" : e.pnl < 0 ? "text-loss" : "text-faint")}>
                      {formatSignedMoney(e.pnl)}
                    </span>
                  </li>
                ))}
              {trades.length > 8 && <li className="py-2 text-[11px] text-faint">+ {trades.length - 8} more</li>}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-2.5 border-t border-line pt-4">
          <Button variant="subtle" size="sm" onClick={onDelete} className="!text-loss hover:!border-loss/40">
            <TrashIcon className="h-3.5 w-3.5" />
            Delete setup
          </Button>
          <Button variant="gold" size="sm" onClick={onEdit}>
            <PencilIcon className="h-3.5 w-3.5" />
            Edit setup
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Inline composer for a freshly added rule (saved once named). */
function NewRuleInput({ onSave, onRemove }: { onSave: (text: string, description: string) => void; onRemove: () => void }) {
  const [text, setText] = useState("");
  const [description, setDescription] = useState("");
  return (
    <div className="rounded-control border border-gold/30 bg-gold/[0.04] p-3">
      <TextInput autoFocus placeholder="Rule — what must be true before entering?" value={text} onChange={(e) => setText(e.target.value)} />
      <TextArea className="mt-2 min-h-12" placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="subtle" size="sm" onClick={onRemove}>Cancel</Button>
        <Button variant="gold" size="sm" disabled={!text.trim()} onClick={() => onSave(text.trim(), description.trim())}>Save rule</Button>
      </div>
    </div>
  );
}

