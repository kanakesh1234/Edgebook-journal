"use client";

import { useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/lib/store";
import { formatSignedMoney } from "@/lib/format";
import { uid, cn } from "@/lib/utils";
import type { PlaybookRule } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { TextArea, TextInput } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { PencilIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";
import { pnlClass } from "@/components/ui/misc";
import { Chip, EASE, KebabMenu, SectionLabel, Sheet, btnText, plural, useRetained } from "./lab-ui";
import { fmtPct0, signedPct, type SetupInfo } from "./lab-model";

const TRADES_PREVIEW = 6;

/**
 * Setup detail — what a setup is (rules, details) and how it performs.
 * Rules can be added and removed in place; everything else is in the editor.
 */
export function SetupSheet({
  info,
  open,
  locked,
  onClose,
  onEdit,
  onDelete,
}: {
  info: SetupInfo | null;
  open: boolean;
  locked: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const shown = useRetained(info);
  return (
    <Sheet
      open={open && !!info}
      onClose={onClose}
      locked={locked}
      label={shown ? `Setup: ${shown.setup.name}` : "Setup"}
      actions={
        shown && (
          <>
            <button type="button" className={btnText} onClick={onEdit}>
              <PencilIcon className="h-3.5 w-3.5" />
              Edit
            </button>
            <KebabMenu
              label="More actions"
              items={[{ label: "Delete setup", danger: true, icon: <TrashIcon />, onClick: onDelete }]}
            />
          </>
        )
      }
    >
      {shown && <SetupBody info={shown} />}
    </Sheet>
  );
}

function SetupBody({ info }: { info: SetupInfo }) {
  const { setup, rules, trades, stats } = info;
  const [adding, setAdding] = useState(false);
  const [all, setAll] = useState(false);

  /** Rules persist through the same store action as the editor, and keep legacy `entryConditions` in sync. */
  const persistRules = (next: PlaybookRule[]) => {
    const clean = next.filter((r) => r.text.trim());
    useApp
      .getState()
      .saveSetup({ ...setup, rules: clean, entryConditions: clean.map((r) => r.text).join("\n") || undefined })
      .catch(() => toast.error("Could not save the rule"));
  };

  const sorted = [...trades].sort((a, b) => b.date.localeCompare(a.date));
  const visible = all ? sorted : sorted.slice(0, TRADES_PREVIEW);
  const hasDetails = !!(setup.invalidation || setup.exitRules || setup.minRR != null || setup.instruments?.length || setup.sessions?.length || setup.notes || setup.purpose);

  return (
    <div className="space-y-7 px-5 pb-8 pt-2 sm:px-7">
      <header>
        <h2 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.025em] text-ink">{setup.name}</h2>
        <p className="mt-1 text-[14px] text-muted">
          {plural(rules.length, "rule")} · {plural(trades.length, "trade")}
        </p>
        {setup.strategy && <p className="mt-3 text-[15px] leading-relaxed text-muted">{setup.strategy}</p>}
      </header>

      {/* Performance */}
      <dl className="lb-stats" aria-label="Setup performance">
        <Cell label="Trades" value={String(stats.trades)} />
        <Cell label="Win rate" value={fmtPct0(stats.winRate)} />
        <Cell label="P&L" value={stats.trades > 0 ? formatSignedMoney(stats.totalPnl) : "—"} tone={stats.trades > 0 ? pnlClass(stats.totalPnl) : undefined} />
        <Cell label="Avg R" value={stats.avgR != null ? `${signedPct(stats.avgR)}R` : "—"} />
        <Cell label="Best" value={stats.bestTrade != null ? formatSignedMoney(stats.bestTrade) : "—"} tone={stats.bestTrade != null ? pnlClass(stats.bestTrade) : undefined} />
        <Cell label="Worst" value={stats.worstTrade != null ? formatSignedMoney(stats.worstTrade) : "—"} tone={stats.worstTrade != null ? pnlClass(stats.worstTrade) : undefined} />
      </dl>

      {/* Rules */}
      <section aria-label="Rules">
        <div className="flex items-center justify-between">
          <SectionLabel>Rules</SectionLabel>
          {!adding && rules.length > 0 && (
            <button type="button" className={cn(btnText, "-mr-2.5 h-8")} onClick={() => setAdding(true)}>
              <PlusIcon className="h-3.5 w-3.5" />
              Add rule
            </button>
          )}
        </div>

        {rules.length === 0 && !adding ? (
          <div className="mt-3 rounded-2xl border border-dashed border-line-strong px-4 py-7 text-center">
            <p className="text-[14px] text-muted">No rules yet. Add the conditions that must be true before you enter.</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setAdding(true)}>
              <PlusIcon className="h-3.5 w-3.5" />
              Add rule
            </Button>
          </div>
        ) : (
          <ol className="lb-group mt-3">
            <AnimatePresence initial={false}>
              {rules.map((r, i) => (
                <motion.li
                  key={r.id}
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.28, ease: EASE }}
                  className="group overflow-hidden border-t border-line-soft first:border-t-0"
                >
                  <div className="flex items-start gap-3 px-4 py-3">
                    <span className="lb-step mt-px">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[15px] leading-snug text-ink">{r.text}</p>
                      {r.description && <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{r.description}</p>}
                    </div>
                    <button
                      type="button"
                      aria-label={`Delete rule ${i + 1}`}
                      onClick={() => persistRules(rules.filter((x) => x.id !== r.id))}
                      className="-mr-1.5 -mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full text-faint transition-[opacity,background-color,color] hover:bg-loss/10 hover:text-loss focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        )}

        <AnimatePresence initial={false}>
          {adding && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.28, ease: EASE }}
              className="overflow-hidden"
            >
              <NewRule
                onCancel={() => setAdding(false)}
                onSave={(text, description) => {
                  persistRules([...rules, { id: uid("r"), text, description: description || undefined }]);
                  setAdding(false);
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* Details */}
      {hasDetails && (
        <section aria-label="Details">
          <SectionLabel>Details</SectionLabel>
          <dl className="lb-group lb-dl mt-3">
            {setup.purpose && <Row label="Purpose">{setup.purpose}</Row>}
            {setup.invalidation && <Row label="Invalidation">{setup.invalidation}</Row>}
            {setup.exitRules && <Row label="Target & exit">{setup.exitRules}</Row>}
            {setup.minRR != null && <Row label="Minimum R:R">{setup.minRR}</Row>}
            {!!setup.instruments?.length && (
              <Row label="Instruments">
                <span className="flex flex-wrap justify-end gap-1.5">{setup.instruments.map((x) => <Chip key={x}>{x}</Chip>)}</span>
              </Row>
            )}
            {!!setup.sessions?.length && (
              <Row label="Sessions">
                <span className="flex flex-wrap justify-end gap-1.5">{setup.sessions.map((x) => <Chip key={x}>{x}</Chip>)}</span>
              </Row>
            )}
            {setup.notes && <Row label="Notes">{setup.notes}</Row>}
          </dl>
        </section>
      )}

      {/* Trades */}
      <section aria-label="Associated trades">
        <div className="flex items-center justify-between">
          <SectionLabel>Trades</SectionLabel>
          {sorted.length > TRADES_PREVIEW && (
            <button type="button" className={cn(btnText, "-mr-2.5 h-8")} onClick={() => setAll((v) => !v)}>
              {all ? "Show fewer" : `Show all ${sorted.length}`}
            </button>
          )}
        </div>
        {sorted.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-line-strong px-4 py-7 text-center text-[14px] text-muted">
            No trades tagged with this setup yet. Assign it when logging or importing a trade.
          </p>
        ) : (
          <ul className="lb-group mt-3">
            {visible.map((e) => (
              <li key={e.id} className="lb-row justify-between !py-3">
                <span className="min-w-0 truncate text-[14px] text-muted">
                  <span className="tabular-nums text-faint">{e.date}</span>
                  <span className="mx-1.5 text-faint">·</span>
                  {e.instrument !== "—" ? e.instrument : e.setup}
                </span>
                <span className={cn("shrink-0 text-[14px] font-semibold tabular-nums", e.pnl > 0 ? "text-profit" : e.pnl < 0 ? "text-loss" : "text-faint")}>
                  {formatSignedMoney(e.pnl)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={tone}>{value}</dd>
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Inline composer for one new rule. Enter saves, Escape cancels. */
function NewRule({ onSave, onCancel }: { onSave: (text: string, description: string) => void; onCancel: () => void }) {
  const [text, setText] = useState("");
  const [description, setDescription] = useState("");
  const submit = () => {
    if (text.trim()) onSave(text.trim(), description.trim());
  };
  return (
    <div className="mt-3 rounded-2xl border border-gold/30 bg-gold/[0.04] p-3.5">
      <TextInput
        autoFocus
        aria-label="Rule"
        placeholder="What must be true before entering?"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          } else if (e.key === "Escape") {
            e.stopPropagation();
            onCancel();
          }
        }}
      />
      <TextArea
        aria-label="Rule description"
        className="mt-2 min-h-14 text-[14px]"
        placeholder="Description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
      />
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="subtle" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="gold" size="sm" disabled={!text.trim()} onClick={submit}>
          Add rule
        </Button>
      </div>
    </div>
  );
}
