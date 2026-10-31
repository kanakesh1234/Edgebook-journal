"use client";

import { useEffect, useState } from "react";
import { useMindView } from "@/lib/minato/bridge";
import { activeItems, CONFIDENCE_LABEL, inactiveItems } from "@/lib/minato/memory";
import { Group, Row } from "./primitives";

const btn = "shrink-0 rounded-full bg-ink/[0.07] px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-ink/[0.12]";
const rank = (s: string) => (s === "established" ? 2 : s === "supported" ? 1 : 0);

/** "What Minato remembers": quiet, rarely opened. Minato learns in the background; this is where a trader can correct or clear it. */
export function MinatoMemory() {
  const brain = useMindView((s) => s.brain);
  const send = useMindView((s) => s.send);
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (!confirm) return;
    const t = window.setTimeout(() => setConfirm(false), 4000);
    return () => window.clearTimeout(t);
  }, [confirm]);

  if (!brain) return <Group title="What Minato remembers" footer="This fills in once Minato has loaded."><Row title="Loading…" /></Group>;

  const live = activeItems(brain.memory);
  const beliefs = live.filter((i) => i.kind !== "episodic").sort((a, b) => rank(b.status) - rank(a.status) || b.confidence - a.confidence);
  const moments = live.filter((i) => i.kind === "episodic").sort((a, b) => b.lastSeen - a.lastSeen).slice(0, 6);
  const gone = inactiveItems(brain.memory).filter((i) => i.kind !== "episodic").slice(0, 8);
  const open = brain.commitments.filter((c) => c.status === "open" && !c.auto);
  const total = beliefs.length + moments.length + brain.mind.notes.length;

  return (
    <>
      <Group
        title="What Minato remembers"
        footer="Minato learns from your journal in the background and only uses this to sharpen its answers. These are patterns in your own records, not facts about you. If something is wrong, mark it and Minato stops using it."
      >
        {beliefs.length === 0 && <Row title="Nothing yet" subtitle="Minato needs more reviewed trades before it says anything" />}
        {beliefs.map((b) => (
          <Row
            key={b.id}
            title={b.short}
            subtitle={`${b.text} Based on ${b.n} ${b.n === 1 ? "observation" : "observations"}.`}
            value={CONFIDENCE_LABEL[b.status]}
            trailing={<button type="button" className={btn} onClick={() => send({ type: "reject", id: b.id })}>{b.origin === "user" ? "Forget" : "Not accurate"}</button>}
          />
        ))}
      </Group>

      {moments.length > 0 && (
        <Group title="Trades it remembers" footer="Recent trades that stood out. They fade on their own.">
          {moments.map((m) => <Row key={m.id} title={m.short} subtitle={m.text} trailing={<button type="button" className={btn} onClick={() => send({ type: "reject", id: m.id })}>Forget</button>} />)}
        </Group>
      )}

      {open.length > 0 && (
        <Group title="Your commitments" footer="Minato checks these against your trades when it can.">
          {open.map((c) => (
            <Row key={c.id} title={`“${c.text}”`} subtitle={c.date} trailing={<span className="flex gap-1.5"><button type="button" className={btn} onClick={() => send({ type: "commit", id: c.id, status: "kept" })}>Kept</button><button type="button" className={btn} onClick={() => send({ type: "commit", id: c.id, status: "broken" })}>Broke it</button></span>} />
          ))}
        </Group>
      )}

      {brain.saved.length > 0 && (
        <Group title="Saved by you">
          {brain.saved.slice().reverse().map((x) => <Row key={x.id} title={x.text.length > 120 ? `${x.text.slice(0, 119)}…` : x.text} subtitle={x.date} trailing={<button type="button" className={btn} onClick={() => send({ type: "unsave", id: x.id })}>Remove</button>} />)}
        </Group>
      )}

      {gone.length > 0 && (
        <Group title="Forgotten or replaced" footer="Restore anything you want Minato to use again.">
          {gone.map((g) => <Row key={g.id} title={g.short} subtitle={CONFIDENCE_LABEL[g.status]} trailing={<button type="button" className={btn} onClick={() => send({ type: "restore", id: g.id })}>Restore</button>} />)}
        </Group>
      )}

      <Group footer="Your journal and trades are never touched. A cleared belief only returns if your journal later shows clearly more evidence for it.">
        <Row
          centered
          destructive
          disabled={total === 0}
          title={confirm ? "Tap again to clear" : "Clear what Minato remembers"}
          onClick={() => { if (confirm) { send({ type: "clear" }); setConfirm(false); } else setConfirm(true); }}
        />
      </Group>
    </>
  );
}
