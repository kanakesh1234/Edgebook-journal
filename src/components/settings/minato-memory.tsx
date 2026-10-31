"use client";

import { useEffect, useState } from "react";
import { useMindView } from "@/lib/minato/bridge";
import { activeItems, CONFIDENCE_LABEL, inactiveItems, type MemoryItem } from "@/lib/minato/memory";
import { readUserSemanticParams } from "@/lib/minato/extract";
import { Group, Row } from "./primitives";
import { cn } from "@/lib/utils";

const btn = "shrink-0 rounded-full bg-ink/[0.07] px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-ink/[0.12] active:scale-[0.97]";
const btnGold = "shrink-0 rounded-full bg-gold/15 px-3 py-1.5 text-[12px] font-semibold text-gold transition-colors hover:bg-gold/25 active:scale-[0.97]";
const btnDanger = "shrink-0 rounded-full bg-loss/12 px-3 py-1.5 text-[12px] font-medium text-loss transition-colors hover:bg-loss/20 active:scale-[0.97]";
const rank = (s: string) => (s === "established" ? 2 : s === "supported" ? 1 : 0);

/**
 * "Memory" view in Settings:
 * Allows the trader to see, add, edit, pin/unpin, and delete what Minato remembers across:
 *  - Semantic memory (durable user facts: risk/trade, stop points, drawdown/daily limits, instruments, rules)
 *  - Derived journal beliefs & patterns
 *  - Episodic memory (notable sessions & reflections)
 *  - Superseded & retired history (with one-click restore)
 *  - Debug mode: inspect what was retrieved, intent classification, tools called, and token budget per answer.
 */
export function MinatoMemory() {
  const brain = useMindView((s) => s.brain);
  const send = useMindView((s) => s.send);
  const debugMode = useMindView((s) => s.debugMode);
  const setDebugMode = useMindView((s) => s.setDebugMode);
  const debugLogs = useMindView((s) => s.debugLogs);

  const [confirm, setConfirm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [addingNew, setAddingNew] = useState(false);
  const [newFactText, setNewFactText] = useState("");
  const [newFactCategory, setNewFactCategory] = useState("risk_per_trade");
  const [savedToast, setSavedToast] = useState<string | null>(null);

  useEffect(() => {
    if (!confirm) return;
    const t = window.setTimeout(() => setConfirm(false), 4000);
    return () => window.clearTimeout(t);
  }, [confirm]);

  useEffect(() => {
    if (!savedToast) return;
    const t = window.setTimeout(() => setSavedToast(null), 2600);
    return () => window.clearTimeout(t);
  }, [savedToast]);

  const flashSaved = (msg = "Saved to memory") => setSavedToast(msg);

  if (!brain) {
    return (
      <Group title="What Minato remembers" footer="This fills in once Minato has loaded.">
        <Row title="Loading…" />
      </Group>
    );
  }

  const live = activeItems(brain.memory);
  const userFacts = live
    .filter((i) => i.origin === "user" && i.kind !== "episodic")
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.lastReinforced - a.lastReinforced);
  const beliefs = live
    .filter((i) => i.origin !== "user" && i.kind !== "episodic")
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || rank(b.status) - rank(a.status) || b.confidence - a.confidence);
  const moments = live
    .filter((i) => i.kind === "episodic")
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || b.lastSeen - a.lastSeen)
    .slice(0, 10);
  const gone = inactiveItems(brain.memory).slice(0, 12);
  const open = brain.commitments.filter((c) => c.status === "open" && !c.auto);
  const total = userFacts.length + beliefs.length + moments.length + brain.mind.notes.length;
  const semParams = readUserSemanticParams(brain.memory);

  const startEdit = (item: MemoryItem) => {
    setEditingId(item.id);
    setEditText(item.text);
  };

  const commitEdit = (id: string) => {
    if (editText.trim()) {
      send({ type: "edit", id, text: editText.trim() });
      flashSaved("Updated in memory");
    }
    setEditingId(null);
    setEditText("");
  };

  const commitAdd = () => {
    if (!newFactText.trim()) return;
    send({ type: "add", text: newFactText.trim(), category: newFactCategory });
    setNewFactText("");
    setAddingNew(false);
    flashSaved("Saved to memory");
  };

  const renderMemoryRow = (item: MemoryItem, allowOriginDelete = false) => {
    const isEditing = editingId === item.id;
    if (isEditing) {
      return (
        <div key={item.id} className="space-y-2.5 border-t border-line-soft px-4 py-3.5 first:border-t-0">
          <input
            type="text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitEdit(item.id);
              if (e.key === "Escape") setEditingId(null);
            }}
            autoFocus
            className="w-full rounded-xl border border-gold/50 bg-raised px-3 py-2 text-[14px] text-ink outline-none"
          />
          <div className="flex items-center justify-end gap-2">
            <button type="button" className={btn} onClick={() => setEditingId(null)}>
              Cancel
            </button>
            <button type="button" className={btnGold} onClick={() => commitEdit(item.id)}>
              Save
            </button>
          </div>
        </div>
      );
    }

    return (
      <Row
        key={item.id}
        title={
          <span className="flex items-center gap-2">
            <span>{item.short}</span>
            {item.pinned && (
              <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold">
                Pinned
              </span>
            )}
          </span>
        }
        subtitle={`${item.text}${item.n > 1 ? ` · Based on ${item.n} observations.` : ""}`}
        value={item.origin === "user" ? "Saved fact" : CONFIDENCE_LABEL[item.status]}
        trailing={
          <span className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              title={item.pinned ? "Unpin memory" : "Pin memory (never decays)"}
              className={cn(btn, item.pinned && "bg-gold/15 text-gold")}
              onClick={() => {
                send({ type: "pin", id: item.id, pinned: !item.pinned });
                flashSaved(item.pinned ? "Unpinned" : "Pinned to memory");
              }}
            >
              {item.pinned ? "Unpin" : "Pin"}
            </button>
            <button type="button" className={btn} onClick={() => startEdit(item)}>
              Edit
            </button>
            <button
              type="button"
              className={btnDanger}
              onClick={() => {
                send({ type: allowOriginDelete ? "delete" : "reject", id: item.id });
                flashSaved("Removed from active memory");
              }}
            >
              {allowOriginDelete ? "Delete" : "Forget"}
            </button>
          </span>
        }
      />
    );
  };

  return (
    <>
      {savedToast && (
        <div
          role="status"
          aria-live="polite"
          className="mb-3 flex items-center gap-2 rounded-full border border-profit/30 bg-profit/10 px-3.5 py-1.5 text-[12.5px] font-medium text-profit"
        >
          <span className="h-2 w-2 rounded-full bg-profit" />
          {savedToast}
        </div>
      )}

      {/* Active Semantic Parameters Summary */}
      <Group
        title="Semantic memory (durable trading facts)"
        footer="Used automatically by Minato's deterministic position sizing and risk calculators. Tell Minato in chat (e.g. 'My risk per trade is $150 and my stop is 15 points') or add/edit facts directly here."
      >
        <div className="grid grid-cols-2 gap-2 px-4 py-3 sm:grid-cols-4">
          <div className="rounded-xl border border-line bg-raised/60 p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">Risk / Trade</p>
            <p className="num mt-0.5 text-[14px] font-semibold text-ink">
              {semParams.riskDollars != null
                ? `$${semParams.riskDollars}`
                : semParams.riskPct != null
                  ? `${semParams.riskPct}%`
                  : "Not set"}
            </p>
          </div>
          <div className="rounded-xl border border-line bg-raised/60 p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">Default Stop</p>
            <p className="num mt-0.5 text-[14px] font-semibold text-ink">
              {semParams.stopPoints != null ? `${semParams.stopPoints} pts` : "Not set"}
            </p>
          </div>
          <div className="rounded-xl border border-line bg-raised/60 p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">Daily Loss Limit</p>
            <p className="num mt-0.5 text-[14px] font-semibold text-ink">
              {semParams.dailyLossLimit != null ? `$${semParams.dailyLossLimit}` : "From challenge"}
            </p>
          </div>
          <div className="rounded-xl border border-line bg-raised/60 p-2.5">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-faint">Account Type</p>
            <p className="mt-0.5 truncate text-[14px] font-semibold capitalize text-ink">
              {semParams.accountType ?? "Default"}
            </p>
          </div>
        </div>

        {userFacts.map((f) => renderMemoryRow(f, true))}

        {addingNew ? (
          <div className="space-y-2.5 border-t border-line-soft px-4 py-3.5">
            <div className="flex flex-wrap gap-2">
              <select
                value={newFactCategory}
                onChange={(e) => setNewFactCategory(e.target.value)}
                className="rounded-xl border border-line bg-raised px-2.5 py-1.5 text-[12.5px] text-ink outline-none"
              >
                <option value="risk_per_trade">Risk per trade</option>
                <option value="stop_points">Stop size (points)</option>
                <option value="daily_loss_limit">Daily loss limit</option>
                <option value="instruments_traded">Instruments traded</option>
                <option value="account_type">Account type</option>
                <option value="strategy_rules">Strategy rule</option>
                <option value="session_times">Session times</option>
                <option value="goals">Goal</option>
              </select>
              <input
                type="text"
                placeholder="e.g. Risk per trade is $150 with a 15 point stop on MNQ"
                value={newFactText}
                onChange={(e) => setNewFactText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") commitAdd();
                  if (e.key === "Escape") setAddingNew(false);
                }}
                autoFocus
                className="min-w-[220px] flex-1 rounded-xl border border-gold/50 bg-raised px-3 py-1.5 text-[13.5px] text-ink outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className={btn} onClick={() => setAddingNew(false)}>
                Cancel
              </button>
              <button type="button" className={btnGold} onClick={commitAdd}>
                Save fact
              </button>
            </div>
          </div>
        ) : (
          <Row
            title="+ Add durable trading fact or rule"
            onClick={() => setAddingNew(true)}
          />
        )}
      </Group>

      {/* Learned Journal Patterns (Semantic/Procedural) */}
      <Group
        title="Learned journal patterns"
        footer="Minato derives these associations from your reviewed trades in the background. Pin important patterns, edit wording, or mark anything inaccurate so Minato stops using it."
      >
        {beliefs.length === 0 && (
          <Row title="No derived patterns yet" subtitle="Minato needs more reviewed trades before inferring process habits" />
        )}
        {beliefs.map((b) => renderMemoryRow(b, false))}
      </Group>

      {/* Episodic Memory */}
      {moments.length > 0 && (
        <Group title="Episodic memory (notable sessions & trades)" footer="Recent sessions and lessons linked to trade IDs. Unpinned episodes decay naturally over time.">
          {moments.map((m) => renderMemoryRow(m, true))}
        </Group>
      )}

      {/* Open Commitments */}
      {open.length > 0 && (
        <Group title="Your commitments" footer="Minato checks these against your trades when it can.">
          {open.map((c) => (
            <Row
              key={c.id}
              title={`“${c.text}”`}
              subtitle={c.date}
              trailing={
                <span className="flex gap-1.5">
                  <button type="button" className={btn} onClick={() => send({ type: "commit", id: c.id, status: "kept" })}>
                    Kept
                  </button>
                  <button type="button" className={btn} onClick={() => send({ type: "commit", id: c.id, status: "broken" })}>
                    Broke it
                  </button>
                </span>
              }
            />
          ))}
        </Group>
      )}

      {/* Saved Insights */}
      {brain.saved.length > 0 && (
        <Group title="Saved by you">
          {brain.saved
            .slice()
            .reverse()
            .map((x) => (
              <Row
                key={x.id}
                title={x.text.length > 120 ? `${x.text.slice(0, 119)}…` : x.text}
                subtitle={x.date}
                trailing={
                  <button type="button" className={btnDanger} onClick={() => send({ type: "unsave", id: x.id })}>
                    Remove
                  </button>
                }
              />
            ))}
        </Group>
      )}

      {/* Superseded / Forgotten History */}
      {gone.length > 0 && (
        <Group title="Superseded & forgotten history" footer="Contradicted or retired memories are kept for auditability. Restore anything you want Minato to use again.">
          {gone.map((g) => (
            <Row
              key={g.id}
              title={g.short}
              subtitle={`${g.text} · ${CONFIDENCE_LABEL[g.status]}${g.supersededBy ? ` (superseded by ${g.supersededBy})` : ""}`}
              trailing={
                <span className="flex gap-1.5">
                  <button
                    type="button"
                    className={btn}
                    onClick={() => {
                      send({ type: "restore", id: g.id });
                      flashSaved("Restored to active memory");
                    }}
                  >
                    Restore
                  </button>
                  <button
                    type="button"
                    className={btnDanger}
                    onClick={() => send({ type: "delete", id: g.id })}
                  >
                    Delete
                  </button>
                </span>
              }
            />
          ))}
        </Group>
      )}

      {/* Transparency & Debug Mode */}
      <Group
        title="Transparency & retrieval debug mode"
        footer="Inspect the exact intent classification, deterministic tools called, hybrid retrieval scores, and token budget used on each Minato turn."
      >
        <Row
          title="Retrieval debug logging"
          subtitle="Show what Minato retrieved and which deterministic tools ran per answer"
          trailing={
            <button
              type="button"
              onClick={() => setDebugMode(!debugMode)}
              className={cn(
                "rounded-full px-3 py-1 text-[12px] font-semibold transition-colors",
                debugMode ? "bg-gold-strong text-on-gold" : "bg-ink/[0.08] text-muted",
              )}
            >
              {debugMode ? "Enabled" : "Off"}
            </button>
          }
        />
        {debugMode && debugLogs.length === 0 && (
          <Row title="No retrieval logs yet in this session" subtitle="Ask Minato a question to see live retrieval telemetry here." />
        )}
        {debugMode &&
          debugLogs.map((log) => (
            <div key={log.id} className="space-y-1.5 border-t border-line-soft px-4 py-3 text-[12px]">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-ink">“{log.query}”</span>
                <span className="font-mono text-[11px] text-gold">
                  intent={log.intent} ({log.category ?? "general"}) · {log.tokensUsed}/{log.tokenBudget} tok
                </span>
              </div>
              {log.toolsCalled.length > 0 && (
                <p className="font-mono text-[11px] text-profit">
                  Tools executed: {log.toolsCalled.join(", ")}
                </p>
              )}
              {log.retrieved.length > 0 ? (
                <ul className="space-y-0.5 text-muted">
                  {log.retrieved.map((r) => (
                    <li key={r.id} className="font-mono text-[11px]">
                      • [{r.kind}] {r.short} (score={r.score}, via {r.why.join("+") || "prior"})
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[11px] text-faint">0 memory items injected (live trade stats & tools used directly).</p>
              )}
            </div>
          ))}
      </Group>

      <Group footer="Your journal and trades are never touched. A cleared belief only returns if your journal later shows clearly more evidence for it.">
        <Row
          centered
          destructive
          disabled={total === 0}
          title={confirm ? "Tap again to clear all memories" : "Clear what Minato remembers"}
          onClick={() => {
            if (confirm) {
              send({ type: "clear" });
              setConfirm(false);
              flashSaved("Memory cleared");
            } else {
              setConfirm(true);
            }
          }}
        />
      </Group>
    </>
  );
}
