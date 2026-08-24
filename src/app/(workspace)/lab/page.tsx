"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { useApp } from "@/lib/store";
import { useUi } from "@/lib/ui-store";
import { activeRules, adherenceSummary } from "@/lib/rules";
import type { RuleDef, RuleKind } from "@/lib/types";
import { formatDateMedium } from "@/lib/format";
import { RuleCard } from "@/components/lab/rule-card";
import { EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { FlaskIcon, SparklesIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { EASE } from "@/components/landing/reveal";

const SECTIONS: { kind: RuleKind; title: string; blurb: string }[] = [
  { kind: "risk", title: "Risk rules", blurb: "Hard limits that protect your capital and your head." },
  { kind: "setup", title: "Setup rules", blurb: "What you're allowed to trade, and where your edge lives." },
  { kind: "behavior", title: "Personal rules", blurb: "The promises you keep when the tape gets loud." },
];

export default function LabPage() {
  const entries = useApp((s) => s.entries);
  const settings = useApp((s) => s.settings);
  const openNewEntry = useUi((s) => s.openNewEntry);

  const rules = useMemo(() => settings.rules?.rules ?? [], [settings.rules]);
  const adherence = useMemo(() => adherenceSummary(entries, settings), [entries, settings]);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const updateRule = (id: string, patch: Partial<RuleDef>) => {
    void useApp.getState().updateSettings({
      rules: { rules: rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) },
    });
    setSavedAt(Date.now());
  };

  if (entries.length === 0) {
    return (
      <div className="space-y-6">
        <LabHeader />
        <EmptyState
          icon={<FlaskIcon className="h-7 w-7" />}
          title="Your operating manual awaits"
          body="Load the demo journal — or log your first trade — and the Lab starts measuring how well you trade your own plan."
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
          <p className="text-xs text-faint" aria-live="polite">
            {savedAt ? "Rules saved" : "Changes save automatically"}
          </p>
        }
      />

      {/* Summary */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="panel grid grid-cols-3 divide-x divide-line overflow-hidden"
      >
        <LabStat
          label="Adherence · 30d"
          value={`${Math.round(adherence.cleanDayRate * 100)}%`}
          sub="trading days fully within plan"
          tone={adherence.cleanDayRate >= 0.8 ? "profit" : adherence.cleanDayRate >= 0.5 ? "gold" : "loss"}
        />
        <LabStat
          label="Active rules"
          value={String(activeRules(settings).length)}
          sub={`of ${rules.length} defined`}
          tone="neutral"
        />
        <LabStat
          label="Violations · 30d"
          value={String(adherence.violations30)}
          sub={`${adherence.breaches30} hard breaches`}
          tone={adherence.violations30 === 0 ? "profit" : adherence.breaches30 > 0 ? "loss" : "gold"}
        />
      </motion.div>

      {/* Rule sections */}
      {SECTIONS.map((section) => {
        const sectionRules = rules.filter((r) => r.kind === section.kind);
        if (sectionRules.length === 0) return null;
        return (
          <section key={section.kind} className="panel p-5 sm:p-6" aria-label={section.title}>
            <div className="mb-4">
              <h2 className="font-display text-base font-semibold tracking-tight text-ink">{section.title}</h2>
              <p className="text-xs text-muted">{section.blurb}</p>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              {sectionRules.map((r, i) => (
                <RuleCard
                  key={r.id}
                  rule={r}
                  violations30={adherence.byRule[r.id] ?? 0}
                  onChange={(patch) => updateRule(r.id, patch)}
                  delay={0.05 + i * 0.04}
                />
              ))}
            </div>
          </section>
        );
      })}

      {/* Recent violations */}
      <section className="panel p-5 sm:p-6" aria-label="Recent violations">
        <div className="mb-4">
          <h2 className="font-display text-base font-semibold tracking-tight text-ink">Violation log</h2>
          <p className="text-xs text-muted">Where the plan and the trading diverged — newest first.</p>
        </div>
        {adherence.recent.length === 0 ? (
          <p className="rounded-control border border-dashed border-line-strong px-4 py-8 text-center text-sm text-muted">
            Clean record — every checked rule held.
          </p>
        ) : (
          <ul className="divide-y divide-line-soft">
            {adherence.recent.map((v) => (
              <li key={v.id} className="flex items-start gap-3.5 py-3 first:pt-0 last:pb-0">
                <span
                  className={cn(
                    "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                    v.severity === "breach" ? "bg-loss" : "bg-gold",
                  )}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-medium text-ink">{v.ruleLabel}</span>
                    <span className="text-xs text-faint">{formatDateMedium(v.date)}</span>
                    <span
                      className={cn(
                        "rounded-full border px-1.5 py-px text-[9px] font-bold uppercase tracking-wide",
                        v.severity === "breach"
                          ? "border-loss/30 bg-loss/[0.08] text-loss"
                          : "border-gold/30 bg-gold/[0.07] text-gold",
                      )}
                    >
                      {v.severity}
                    </span>
                  </p>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{v.detail}</p>
                </div>
                {v.entryId && (
                  <Link
                    href="/journal"
                    className="shrink-0 self-center text-xs font-medium text-gold transition-colors hover:text-gold-deep"
                  >
                    View trade
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
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
          Your personal operating manual. Define how you're supposed to trade — EdgeBook measures
          how well you actually do.
        </p>
      </div>
      {action}
    </header>
  );
}

function LabStat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "neutral" | "profit" | "gold" | "loss";
}) {
  return (
    <div className="p-5">
      <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-faint">{label}</p>
      <p
        className={cn(
          "kpi mt-1.5 text-2xl",
          tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : tone === "gold" ? "text-gold" : "text-ink",
        )}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-muted">{sub}</p>
    </div>
  );
}
