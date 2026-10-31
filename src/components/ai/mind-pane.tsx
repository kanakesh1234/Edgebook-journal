"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { todayKey } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EASE } from "@/components/landing/reveal";
import { MOOD_LABEL, patterns, type MindNote } from "@/lib/minato/mind";
import type { Commitment, MinatoBrain, Readiness } from "@/lib/minato/brain-ml";
import { activeItems, CONFIDENCE_LABEL, inactiveItems, type MemoryItem } from "@/lib/minato/memory";

/* ------------------------------------------------------------------ */
/*  Mind: what Minato has learned, quietest-first.                      */
/*  One headline, a few beliefs, everything else one tap away.          */
/* ------------------------------------------------------------------ */

const card = "rounded-[18px] bg-ink/[0.05]";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("h-4 w-4 shrink-0 text-faint transition-transform duration-300 ease-out motion-reduce:transition-none", open && "rotate-90")} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

/** Height-animated reveal; instant under reduced motion. */
function Collapse({ open, children }: { open: boolean; children: React.ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={reduce ? false : { height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
          transition={{ duration: reduce ? 0 : 0.28, ease: EASE }}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Staggered entrance: each section lifts in 45ms after the previous one. */
function Reveal({ i, children, className }: { i: number; children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, ease: EASE, delay: reduce ? 0 : 0.05 + i * 0.045 }}
      className={className}
    >
      {children}
    </motion.section>
  );
}

/** A collapsed group: label + count, content on demand. */
function Group({ title, count, children, hint }: { title: string; count: number; children: React.ReactNode; hint?: string }) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <div className={card}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex min-h-[48px] w-full items-center gap-3 rounded-[18px] px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-gold/50">
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-medium text-ink">{title}</span>
          {hint && !open && <span className="mt-0.5 block truncate text-[12px] text-faint">{hint}</span>}
        </span>
        <span className="num text-[13px] text-muted">{count}</span>
        <Chevron open={open} />
      </button>
      <Collapse open={open}><div className="space-y-2 px-3 pb-3">{children}</div></Collapse>
    </div>
  );
}

const STRENGTH_TONE: Record<string, string> = {
  hypothesis: "bg-ink/[0.07] text-muted", supported: "bg-gold/15 text-gold", established: "bg-profit/15 text-profit", contested: "bg-ink/[0.07] text-faint",
};

function BeliefRow({ item, onReject, onPin }: { item: MemoryItem; onReject: (id: string) => void; onPin: (id: string, pinned: boolean) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-[14px] bg-surface/60">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex min-h-[44px] w-full items-center gap-2.5 rounded-[14px] px-3.5 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-gold/50">
        <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", item.polarity === "strength" ? "bg-profit" : item.polarity === "risk" ? "bg-gold" : "bg-faint")} aria-hidden />
        <span className="min-w-0 flex-1 text-[13.5px] leading-snug text-ink">{item.short}</span>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium", STRENGTH_TONE[item.status] ?? STRENGTH_TONE.hypothesis)}>{CONFIDENCE_LABEL[item.status]}</span>
        <Chevron open={open} />
      </button>
      <Collapse open={open}>
        <div className="space-y-2.5 px-3.5 pb-3.5 pt-0.5">
          <p className="text-[13px] leading-snug text-muted">{item.text}</p>
          {item.evidence.length > 0 && (
            <ul className="space-y-1">
              {item.evidence.slice(0, 3).map((e, i) => (
                <li key={`${e.entryId ?? e.date}-${i}`} className="text-[12px] leading-snug text-faint"><span className="num">{e.date}</span>{e.note ? ` · ${e.note}` : ""}</li>
              ))}
            </ul>
          )}
          <p className="text-[11.5px] leading-snug text-faint">
            Based on {item.n} {item.kind === "episodic" ? "record" : "observations"}.{item.stance === "inference" ? " A pattern in your own records, not proof of what causes it." : ""}
          </p>
          <div className="flex gap-2 pt-0.5">
            <button type="button" onClick={() => onPin(item.id, !item.pinned)} className="rounded-full bg-ink/[0.07] px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-ink/[0.12]">{item.pinned ? "Unpin" : "Keep"}</button>
            <button type="button" onClick={() => onReject(item.id)} className="rounded-full bg-ink/[0.07] px-3 py-1.5 text-[12px] font-medium text-muted transition-colors hover:text-loss">Not accurate</button>
          </div>
        </div>
      </Collapse>
    </div>
  );
}

function NoteRow({ n, pending }: { n: MindNote; pending?: boolean }) {
  return (
    <li className="rounded-[14px] bg-surface/60 px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="rounded-full bg-gold/15 px-2.5 py-0.5 text-[11.5px] font-semibold text-gold">{MOOD_LABEL[n.mood]}</span>
        <span className="text-[11.5px] text-faint">{pending ? "Waiting for your next setup" : n.date}</span>
      </div>
      <p className="mt-2 line-clamp-2 text-[13.5px] leading-snug text-ink">“{n.quote}”</p>
      {n.verdict && <p className="mt-1.5 text-[12.5px] leading-snug text-muted">{n.verdict}</p>}
    </li>
  );
}

/** One honest sentence for the top of the tab. Only says what the evidence supports. */
export function mindHeadline(brain: MinatoBrain, readiness: Readiness | null): { line: string; sub: string } {
  const live = activeItems(brain.memory).filter((i) => i.kind !== "episodic" && (i.status === "supported" || i.status === "established"));
  const cov = brain.memory?.coverage;
  const sub = cov && cov.withProcess > 0 ? `From ${cov.withProcess} reviewed ${cov.withProcess === 1 ? "trade" : "trades"}` : "";
  const trend = live.find((i) => i.axis === "trend");
  if (trend?.pole === "improving") return { line: "Your process has been steadier lately.", sub };
  if (trend?.pole === "worsening") return { line: "Your process has slipped a little lately.", sub };
  if (readiness?.level === "high") return { line: "Stay sharp. Today looks harder than usual.", sub: "From your own history" };
  const top = live.filter((i) => i.polarity === "risk").sort((a, b) => b.confidence - a.confidence)[0];
  if (top) return { line: top.short + ".", sub: sub || "Tap a pattern below for the evidence" };
  if (readiness?.level === "steady") return { line: "You look steady right now.", sub: "From your own history" };
  return { line: "Still learning how you trade.", sub: sub || "Keep reviewing trades and I’ll get sharper" };
}

export function MindPane({ brain, readiness, learning, onCommit, onUnsave, onReject, onRestore, onPin }: {
  brain: MinatoBrain; readiness: Readiness | null; learning: { have: number; need: number } | null;
  onCommit: (id: string, status: Commitment["status"]) => void; onUnsave: (id: string) => void;
  onReject: (id: string) => void; onRestore: (id: string) => void; onPin: (id: string, pinned: boolean) => void;
}) {
  const today = todayKey();
  const [showAll, setShowAll] = useState(false);
  const [whyOpen, setWhyOpen] = useState(false);
  const pending = brain.mind.notes.filter((n) => n.status === "pending");
  const kept = brain.mind.notes.filter((n) => n.status === "kept");
  const habits = patterns(brain.mind);
  const commitments = brain.commitments.slice(-6).reverse();
  const brief = brain.days[today];
  const live = activeItems(brain.memory);
  const beliefs = live.filter((i) => i.kind !== "episodic").sort((a, b) => (b.status === "established" ? 2 : b.status === "supported" ? 1 : 0) - (a.status === "established" ? 2 : a.status === "supported" ? 1 : 0) || b.confidence - a.confidence);
  const moments = live.filter((i) => i.kind === "episodic").sort((a, b) => b.lastSeen - a.lastSeen);
  const gone = inactiveItems(brain.memory).filter((i) => i.origin !== "journal" || i.kind !== "episodic").slice(0, 8);
  const gaps = brain.memory?.gaps ?? [];
  const empty = !readiness && !learning && !brief && beliefs.length + moments.length + pending.length + kept.length + commitments.length + brain.saved.length === 0;
  const { line, sub } = mindHeadline(brain, readiness);
  const shown = showAll ? beliefs : beliefs.slice(0, 3);
  let i = 0;

  if (empty) {
    return (
      <div className="flex flex-1 flex-col justify-center overflow-y-auto px-5 pb-6">
        <p className="font-display text-[22px] font-semibold leading-tight tracking-[-0.025em] text-ink">Tell me how you feel.</p>
        <p className="mt-2 max-w-[32ch] text-[14.5px] leading-snug text-muted">I remember what matters, hold your feelings until your next setup, and keep only what proves useful.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 pb-6 pt-5">
      <Reveal i={i++} className="px-1">
        <p className="font-display text-[24px] font-semibold leading-[1.15] tracking-[-0.03em] text-ink">{line}</p>
        {sub && <p className="mt-1.5 text-[13px] text-muted">{sub}</p>}
        {brief && <p className="mt-3 text-[13px] leading-snug text-faint">Today: {brief.line}</p>}
      </Reveal>

      {readiness && (
        <Reveal i={i++}>
          <button type="button" aria-expanded={whyOpen} onClick={() => setWhyOpen((o) => !o)} className={cn(card, "block w-full px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-gold/50")}>
            <span className="flex items-baseline justify-between gap-3">
              <span className={cn("text-[14px] font-semibold", readiness.level === "high" ? "text-loss" : readiness.level === "watch" ? "text-gold" : "text-profit")}>{readiness.level === "high" ? "High slip risk" : readiness.level === "watch" ? "Stay sharp" : "Steady"}</span>
              <span className="num text-[20px] text-ink">{readiness.pct}%</span>
            </span>
            {readiness.drivers.length > 0 && <span className="mt-1 block text-[13px] leading-snug text-muted">Because {readiness.drivers.join(" and ")}.</span>}
            <Collapse open={whyOpen}>
              <span className="mt-2 block text-[11.5px] leading-snug text-faint">Chance your next trade loses, breaks a rule or carries a mistake. Learned from your last {readiness.trades} trades; right {readiness.holdoutAcc}% on trades it hadn&apos;t seen. Not a market call.</span>
            </Collapse>
          </button>
        </Reveal>
      )}
      {!readiness && learning && (
        <Reveal i={i++}>
          <div className={cn(card, "px-4 py-3")}>
            <p className="text-[13.5px] leading-snug text-ink">My personal model needs {learning.need} trades before it says anything. You have {learning.have}.</p>
            <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-ink/[0.09]"><div className="h-full rounded-full bg-gold-strong transition-[width] duration-500" style={{ width: `${Math.min(100, (learning.have / learning.need) * 100)}%` }} /></div>
          </div>
        </Reveal>
      )}

      {beliefs.length > 0 && (
        <Reveal i={i++}>
          <h3 className="mb-2 px-1 text-[12px] font-semibold uppercase tracking-[0.08em] text-faint">What I’ve noticed</h3>
          <div className={cn(card, "space-y-1.5 p-1.5")}>
            {shown.map((b) => <BeliefRow key={b.id} item={b} onReject={onReject} onPin={onPin} />)}
            {beliefs.length > 3 && (
              <button type="button" onClick={() => setShowAll((s) => !s)} className="w-full rounded-[12px] py-2 text-center text-[12.5px] font-medium text-muted transition-colors hover:text-ink">
                {showAll ? "Show less" : `Show ${beliefs.length - 3} more`}
              </button>
            )}
          </div>
        </Reveal>
      )}

      <Reveal i={i++} className="space-y-2">
        <Group title="Commitments" count={commitments.length} hint={commitments.filter((c) => c.status === "open").length ? `${commitments.filter((c) => c.status === "open").length} open` : undefined}>
          {commitments.map((c) => (
            <div key={c.id} className="rounded-[14px] bg-surface/60 px-3.5 py-3">
              <p className="text-[13.5px] leading-snug text-ink">“{c.text}”</p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className={cn("text-[12px] font-medium", c.status === "kept" ? "text-profit" : c.status === "broken" ? "text-loss" : "text-faint")}>
                  {c.status === "kept" ? "Kept" : c.status === "broken" ? "Broken" : "Open"}{c.auto ? " · checked against your trades" : ""}
                </span>
                {!c.auto && c.status === "open" && (
                  <span className="flex gap-1.5">
                    <button type="button" onClick={() => onCommit(c.id, "kept")} className="rounded-full bg-profit/15 px-2.5 py-1 text-[11.5px] font-medium text-profit">Kept</button>
                    <button type="button" onClick={() => onCommit(c.id, "broken")} className="rounded-full bg-loss/15 px-2.5 py-1 text-[11.5px] font-medium text-loss">Broke it</button>
                  </span>
                )}
              </div>
            </div>
          ))}
        </Group>
        <Group title="Feelings and habits" count={habits.length} hint={habits[0]?.line}>
          {habits.map((h) => <p key={h.mood} className="rounded-[14px] border border-gold/30 bg-gold/[0.07] px-3.5 py-3 text-[13.5px] leading-snug text-ink">{h.line}</p>)}
        </Group>
        <Group title="Holding for your next setup today" count={pending.length} hint="Cleared tonight if no trade follows">
          <ul className="space-y-2">{pending.map((n) => <NoteRow key={n.id} n={n} pending />)}</ul>
        </Group>
        <Group title="Kept because it was useful" count={kept.length}>
          <ul className="space-y-2">{kept.slice(0, 8).map((n) => <NoteRow key={n.id} n={n} />)}</ul>
        </Group>
        <Group title="Moments I remember" count={moments.length} hint="Recent trades that stood out">
          {moments.slice(0, 8).map((m) => <BeliefRow key={m.id} item={m} onReject={onReject} onPin={onPin} />)}
        </Group>
        <Group title="Saved by you" count={brain.saved.length}>
          {brain.saved.slice().reverse().map((x) => (
            <div key={x.id} className="rounded-[14px] bg-surface/60 px-3.5 py-3">
              <p className="line-clamp-4 text-[13.5px] leading-snug text-ink">{x.text}</p>
              <div className="mt-1.5 flex items-center justify-between"><span className="text-[11.5px] text-faint">{x.date}</span><button type="button" onClick={() => onUnsave(x.id)} className="text-[11.5px] text-faint transition-colors hover:text-loss">Remove</button></div>
            </div>
          ))}
        </Group>
        <Group title="Forgotten or replaced" count={gone.length} hint="Restore anything you want back">
          {gone.map((g) => (
            <div key={g.id} className="flex items-center gap-3 rounded-[14px] bg-surface/60 px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] text-ink">{g.short}</p>
                <p className="text-[11.5px] text-faint">{CONFIDENCE_LABEL[g.status]}{g.log[g.log.length - 1]?.why ? ` · ${g.log[g.log.length - 1].why}` : ""}</p>
              </div>
              <button type="button" onClick={() => onRestore(g.id)} className="shrink-0 rounded-full bg-ink/[0.07] px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:bg-ink/[0.12]">Restore</button>
            </div>
          ))}
        </Group>
      </Reveal>

      {gaps.length > 0 && (
        <Reveal i={i++} className="px-1">
          <p className="text-[12px] leading-snug text-faint">Still learning: {gaps.slice(0, 2).map((g) => `${g.topic.charAt(0).toLowerCase()}${g.topic.slice(1)} (${g.note})`).join("; ")}.</p>
        </Reveal>
      )}
    </div>
  );
}
