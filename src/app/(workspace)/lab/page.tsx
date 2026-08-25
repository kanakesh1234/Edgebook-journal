"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { useApp } from "@/lib/store";
import { useUi } from "@/lib/ui-store";
import { checklistItems, checklistScore, type PlaybookSetup } from "@/lib/types";
import { formatDateMedium, formatSignedMoney } from "@/lib/format";
import { Playbook } from "@/components/lab/playbook";
import { EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { FlaskIcon, ShieldIcon, SparklesIcon } from "@/components/ui/icons";
import { detectPatterns } from "@/lib/minato/patterns";
import { cn } from "@/lib/utils";
import { EASE } from "@/components/landing/reveal";

/**
 * Trading Lab — the user's execution playbook.
 * Predefined strategy: Account & Risk → First Trade (6/6) → Second Trade
 * (7/7) → Execution → Common Mistakes → Review system. Custom setups from
 * the Playbook appear under Execution.
 */

const RISK_PARAMS: [string, string][] = [
  ["Lot size", "1 contract"],
  ["Max risk per trade", "$50"],
  ["Max daily loss limit", "$75"],
  ["Daily profit target", "$250"],
  ["Max trades allowed", "Maximum 2 planned trades"],
];

const FIRST_TRADE_RULES: [string, string][] = [
  ["1 · 9:33 AM Rule", "Do not enter prior to 9:33 AM EST; wait for the initial opening manipulation to complete naturally."],
  ["2 · Environment Gate", "Confirm clean delivery with solid candle bodies rather than manipulative delivery with erratic wicks."],
  ["3 · Liquidity Sweep", "Verify the exact high or low swept along with the timestamp of the sweep."],
  ["4 · Manipulation Confirmed", "Clear institutional manipulation identified after the sweep."],
  ["5 · Clear Target Levels", "Definite draw on liquidity and target levels established before entry."],
  ["6 · SMT Divergence", "Valid correlated asset divergence confirmed at key structural levels."],
];

const COMMON_MISTAKES: { title: string; body: string; trigger: string }[] = [
  {
    title: "Third Trade Trap",
    body: "The statistical probability of a 3rd trade winning is only 4%–5%. Tomorrow's fresh A+ setup holds 40%–50%. Two losses = the day is over.",
    trigger: "Triggers when logging a 3rd trade after two losses.",
  },
  {
    title: "Premature Entry",
    body: "Efficiency comes from process-oriented patience, not impulsive execution. No entry before 9:33 AM EST.",
    trigger: "Triggers when an entry is recorded before 9:33 AM.",
  },
  {
    title: "Breakeven Itch / Fear",
    body: "Can you defend this SL to a senior trader in one sentence? Hold to the plan unless a genuine market structure change occurs.",
    trigger: "Triggers when a review marks a moved stop or early exit.",
  },
  {
    title: "Post-Loss Behavior",
    body: "Stop. Log the internal dialogue before any further action. FOMO and revenge are the two most expensive voices.",
    trigger: "Triggers immediately after saving a losing trade.",
  },
];

export default function LabPage() {
  const entries = useApp((s) => s.entries);
  const settings = useApp((s) => s.settings);
  const openNewEntry = useUi((s) => s.openNewEntry);
  const playbook = settings.playbook ?? [];
  const updatePlaybook = (next: PlaybookSetup[]) => {
    void useApp.getState().updateSettings({ playbook: next });
  };
  const [openSetup, setOpenSetup] = useState<PlaybookSetup | null>(null);

  const patterns = useMemo(() => detectPatterns(entries), [entries]);

  const checklistStats = useMemo(() => {
    const withChecklists = entries.filter((e) => e.checklist);
    let confirmed = 0;
    let required = 0;
    let violations = 0;
    for (const e of withChecklists) {
      const s = checklistScore(e.checklist!);
      confirmed += s.confirmed;
      required += s.required;
      if (s.confirmed < s.required) violations += 1;
    }
    const reviewed = entries.filter((e) => e.reviewStatus === "reviewed").length;
    const pending = entries.filter((e) => e.reviewStatus !== "reviewed").length;
    return {
      trades: entries.length,
      withChecklists: withChecklists.length,
      adherence: required > 0 ? Math.round((confirmed / required) * 100) : null,
      violations,
      reviewed,
      pending,
      recent: [...entries]
        .filter((e) => e.checklist)
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 6),
    };
  }, [entries]);

  if (entries.length === 0) {
    return (
      <div className="space-y-6">
        <LabHeader />
        <EmptyState
          icon={<FlaskIcon className="h-7 w-7" />}
          title="Your execution playbook is ready"
          body="Log or import your first trade and the Lab starts measuring execution against this exact playbook — checklist by checklist."
          action={
            <>
              <Button variant="gold" onClick={openNewEntry}>
                Log first trade
              </Button>
              <Button variant="outline" onClick={() => void useApp.getState().loadDemoData()}>
                <SparklesIcon className="h-4 w-4" />
                Load demo data
              </Button>
            </>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <LabHeader
        action={
          <div className="text-right">
            <p className="num text-2xl font-semibold text-ink">
              {checklistStats.adherence != null ? `${checklistStats.adherence}%` : "—"}
            </p>
            <p className="text-[11px] text-faint">checklist adherence · all trades</p>
          </div>
        }
      />

      {/* ACCOUNT & RISK */}
      <Section title="Account & Risk" subtitle="The hard parameters of this execution period.">
        <dl className="grid gap-px overflow-hidden rounded-control border border-line bg-line sm:grid-cols-2 lg:grid-cols-5">
          {RISK_PARAMS.map(([label, value]) => (
            <div key={label} className="bg-surface px-4 py-3.5">
              <dt className="text-[10px] font-medium uppercase tracking-[0.1em] text-faint">{label}</dt>
              <dd className="num mt-1 text-sm font-semibold text-ink">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 flex items-start gap-2 rounded-control border border-loss/25 bg-loss/[0.05] px-4 py-2.5 text-[12.5px] leading-relaxed text-ink">
          <ShieldIcon className="mt-0.5 h-4 w-4 shrink-0 text-loss" />
          <span>
            <strong className="text-loss">Psychological rule:</strong> more than 3 trades in a day
            constitutes an immediate psychological failure. Two planned trades. That is the plan.
          </span>
        </p>
      </Section>

      {/* FIRST TRADE */}
      <Section title="First Trade — 6/6 required" subtitle="All six criteria confirmed YES. An incomplete setup is not an A+ setup.">
        <ol className="space-y-2">
          {FIRST_TRADE_RULES.map(([title, body], i) => (
            <RuleRow key={title} index={i + 1} title={title} body={body} />
          ))}
        </ol>
      </Section>

      {/* SECOND TRADE */}
      <Section title="Second Trade — 7/7 required" subtitle="Only after Trade #1 hits stop loss. Rules 1–6 remain mandatory.">
        <ol className="space-y-2">
          {FIRST_TRADE_RULES.map(([title, body], i) => (
            <RuleRow key={title} index={i + 1} title={title} body={body} compact />
          ))}
          <RuleRow index={7} title="New SMT After Minor Liquidity" body="Look for a 3-candle divergence that captures weak-hand liquidity before executing." highlight />
        </ol>
      </Section>

      {/* PLAYBOOK — full CRUD editor */}
      <Playbook setups={playbook} onChange={updatePlaybook} />

      {/* MY RECORDED PATTERNS */}
      <Section title="My Recorded Patterns" subtitle="Generated from your actual reflections and reviews — evidence-backed, never generic.">
        {patterns.length === 0 ? (
          <p className="rounded-control border border-dashed border-line-strong px-4 py-8 text-center text-sm text-muted">
            No recurring patterns detected yet. MINATO watches your reviews and will surface a pattern
            only after it appears at least twice.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {patterns.map((p, i) => (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.05, ease: EASE }}
                className="rounded-control border border-line bg-raised/60 p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">{p.label}</p>
                  <span className={cn(
                    "rounded-full border px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide",
                    p.confidence === "established" ? "border-loss/30 bg-loss/[0.08] text-loss" : p.confidence === "repeated" ? "border-gold/30 bg-gold/[0.08] text-gold" : "border-line bg-raised text-faint",
                  )}>
                    {p.confidence}
                  </span>
                </div>
                <p className="num mt-1.5 text-[11px] text-muted">Observed {p.count} times{p.improving ? " · improving" : ""}</p>
                <ul className="mt-2 space-y-1">
                  {p.evidence.slice(0, 3).map((ev) => (
                    <li key={ev.entryId} className="truncate text-[11px] text-faint">
                      {ev.date} — “{ev.excerpt}”
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </div>
        )}
      </Section>

      {/* TRADING LAB KNOWLEDGE — clearly separated educational content */}
      <Section title="Trading Lab Knowledge" subtitle="General execution principles — these trigger automatically at their friction points in the app. They are not a personal diagnosis.">
        <div className="grid gap-3 sm:grid-cols-2">
          {COMMON_MISTAKES.map((m) => (
            <div key={m.title} className="rounded-control border border-line bg-raised/50 p-4">
              <p className="text-sm font-semibold text-ink">{m.title}</p>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">{m.body}</p>
              <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-gold">Auto-trigger: {m.trigger}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* REVIEW SYSTEM */}
      <Section title="Review System" subtitle="Every trade gets the interrogation. Outcome is data; process is the product.">
        <div className="grid gap-3 sm:grid-cols-3">
          <LabStat label="Reviewed" value={String(checklistStats.reviewed)} tone="profit" />
          <LabStat label="Awaiting review" value={String(checklistStats.pending)} tone={checklistStats.pending > 0 ? "gold" : "profit"} />
          <LabStat label="Checklist violations" value={String(checklistStats.violations)} tone={checklistStats.violations > 0 ? "loss" : "profit"} />
        </div>
        {checklistStats.recent.length > 0 && (
          <ul className="mt-4 divide-y divide-line-soft">
            {checklistStats.recent.map((e) => {
              const s = e.checklist ? checklistScore(e.checklist) : null;
              return (
                <li key={e.id} className="flex items-center justify-between gap-3 py-2.5">
                  <Link href={`/review/${e.id}`} className="group min-w-0 flex-1">
                    <span className="flex items-center gap-2 text-sm font-medium text-ink group-hover:text-gold">
                      {e.setup || e.instrument}
                      <span className="text-xs font-normal text-faint">{formatDateMedium(e.date)}</span>
                    </span>
                  </Link>
                  <span className={cn("num text-sm font-semibold", s ? (s.confirmed === s.required ? "text-profit" : "text-gold") : "text-faint")}>
                    {s ? `${s.confirmed}/${s.required}` : "—"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <Link href="/calendar" className="mt-4 inline-block text-xs font-medium text-gold hover:text-gold-deep">
          Open the calendar to review any trade →
        </Link>
      </Section>

      {/* Setup detail modal */}
      {openSetup && (
        <div className="fixed inset-0 z-[95] grid place-items-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setOpenSetup(null)} role="dialog" aria-label={openSetup.name}>
          <div className="panel max-h-[85dvh] w-full max-w-lg overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-display text-lg font-semibold text-ink">{openSetup.name}</h3>
              <button onClick={() => setOpenSetup(null)} aria-label="Close" className="text-faint hover:text-ink">✕</button>
            </div>
            {openSetup.strategy && <p className="mt-2 text-sm leading-relaxed text-muted">{openSetup.strategy}</p>}
            {openSetup.entryConditions && (
              <DetailList title="Entry rules (structured)" lines={openSetup.entryConditions.split("\n").filter(Boolean).map((l, i) => `Rule ${i + 1}: ${l}`)} />
            )}
            {openSetup.invalidation && <DetailList title="Invalidation" lines={[openSetup.invalidation]} />}
            {openSetup.exitRules && <DetailList title="Target & exit" lines={[openSetup.exitRules]} />}
          </div>
        </div>
      )}
    </div>
  );
}

/* -------------------------------- pieces -------------------------------- */

function LabHeader({ action }: { action?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="font-display text-[26px] font-semibold tracking-[-0.02em] text-ink sm:text-3xl sm:font-semibold"
        >
          Trading Lab
        </motion.h1>
        <p className="mt-1 max-w-xl text-sm text-muted">
          Your execution playbook. Every trade is measured against this — checklist by checklist.
        </p>
      </div>
      {action}
    </header>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: EASE }}
      className="panel p-5 sm:p-6"
      aria-label={title}
    >
      <h2 className="font-display text-base font-semibold tracking-tight text-ink">{title}</h2>
      <p className="mb-4 mt-0.5 text-xs text-muted">{subtitle}</p>
      {children}
    </motion.section>
  );
}

function RuleRow({ index, title, body, highlight, compact }: { index: number; title: string; body: string; highlight?: boolean; compact?: boolean }) {
  return (
    <li
      className={cn(
        "flex gap-3.5 rounded-control border p-3.5",
        highlight ? "border-gold/40 bg-gold/[0.05]" : "border-line bg-raised/50",
      )}
    >
      <span
        className={cn(
          "grid h-7 w-7 shrink-0 place-items-center rounded-full border text-xs font-bold",
          highlight ? "border-gold/50 bg-gold/10 text-gold" : "border-line-strong bg-surface text-muted",
        )}
        aria-hidden
      >
        {index}
      </span>
      <div className="min-w-0">
        <p className={cn("text-sm font-semibold", compact ? "text-muted" : "text-ink")}>{title}</p>
        {!compact && <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{body}</p>}
      </div>
    </li>
  );
}

function LabStat({ label, value, tone }: { label: string; value: string; tone: "profit" | "gold" | "loss" }) {
  return (
    <div className="rounded-control border border-line bg-raised/60 p-4">
      <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-faint">{label}</p>
      <p className={cn("kpi mt-1.5 text-2xl", tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : "text-gold")}>{value}</p>
    </div>
  );
}

function DetailList({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="mt-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">{title}</p>
      <ul className="mt-1.5 space-y-1">
        {lines.map((l, i) => (
          <li key={i} className="flex gap-2 text-[13px] text-muted">
            <span className="text-gold">·</span>
            {l}
          </li>
        ))}
      </ul>
    </div>
  );
}

