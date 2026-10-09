"use client";

import type { ReactNode } from "react";
import { challengeReminder } from "@/lib/challenges";
import { formatMoney, formatSignedMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PencilIcon, StarIcon, TrashIcon } from "@/components/ui/icons";
import { pnlClass } from "@/components/ui/misc";
import { CHALLENGE_STATUS, ddLabel, fmtDay, fmtPct0, signedPct, type ChallengeInfo } from "./lab-model";
import { Chip, KebabMenu, Progress, SectionLabel, Sheet, StatusPill, btnText, plural, useRetained } from "./lab-ui";

/**
 * Challenge detail — progress first, then risk, then performance.
 * Grouped rows read like Settings: label on the left, value on the right.
 */
export function ChallengeSheet({
  info,
  open,
  locked,
  onClose,
  onMakePrimary,
  onEdit,
  onDelete,
}: {
  info: ChallengeInfo | null;
  open: boolean;
  locked: boolean;
  onClose: () => void;
  onMakePrimary: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const shown = useRetained(info);
  return (
    <Sheet
      open={open && !!info}
      onClose={onClose}
      locked={locked}
      label={shown ? `Challenge: ${shown.challenge.name}${shown.primary ? " (primary)" : ""}` : "Challenge"}
      actions={
        shown && (
          <>
            {!shown.primary && (
              <button type="button" className={btnText} onClick={onMakePrimary}>
                <StarIcon className="h-3.5 w-3.5" />
                Make primary
              </button>
            )}
            <button type="button" className={btnText} onClick={onEdit}>
              <PencilIcon className="h-3.5 w-3.5" />
              Edit
            </button>
            <KebabMenu label="More actions" items={[{ label: "Delete challenge", danger: true, icon: <TrashIcon />, onClick: onDelete }]} />
          </>
        )
      }
    >
      {shown && <ChallengeBody info={shown} />}
    </Sheet>
  );
}

function ChallengeBody({ info }: { info: ChallengeInfo }) {
  const { challenge: c, progress: p, status, primary } = info;
  const st = CHALLENGE_STATUS[status];
  const tradingDays = new Set(p.tradesList.map((t) => t.date)).size;
  const reminder = challengeReminder(p);
  const money = (n: number) => formatMoney(n);
  const ticks = p.milestones.filter((m) => m.fraction > 0 && m.fraction < 1).map((m) => m.fraction);
  const nextMilestone = p.reachedTarget ? null : p.milestones.find((m) => !m.passed && m.fraction > 0) ?? null;
  const barTone = status === "completed" ? "profit" : status === "breached" ? "loss" : undefined;
  const limits: [string, string][] = [];
  if (c.dailyProfitTarget) limits.push(["Daily profit target", formatMoney(c.dailyProfitTarget)]);
  if (c.dailyLossLimit) limits.push(["Daily loss limit", formatMoney(c.dailyLossLimit)]);
  if (c.tradeLimit) limits.push(["Trade limit per day", String(c.tradeLimit)]);
  if (c.startDate || c.endDate) limits.push(["Window", [c.startDate && fmtDay(c.startDate), c.endDate && fmtDay(c.endDate)].filter(Boolean).join(" → ")]);

  return (
    <div className="space-y-7 px-5 pb-8 pt-2 sm:px-7">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={st.tone}>{st.label}</StatusPill>
          {primary && (
            <StatusPill tone="gold">
              <StarIcon className="h-3 w-3" />
              Primary
            </StatusPill>
          )}
        </div>
        <h2 className="mt-3 font-display text-[26px] font-semibold leading-tight tracking-[-0.025em] text-ink">{c.name}</h2>
        <p className="mt-1 text-[14px] text-muted">
          {plural(tradingDays, "trading day")} · {plural(p.trades, "trade")}
        </p>
      </header>

      {/* Progress */}
      <section aria-label="Progress">
        <div className="flex items-end justify-between gap-3">
          <p className={cn("kpi text-[38px] tabular-nums", pnlClass(p.currentPnl))}>{formatSignedMoney(p.currentPnl)}</p>
          <p className="pb-1.5 text-[14px] tabular-nums text-muted">{p.progressPct}% to target</p>
        </div>
        <div className="mt-3">
          <Progress value={p.progress} tone={barTone} ticks={ticks} size="lg" label={`${p.progressPct}% of challenge progress`} />
        </div>
        <div className="mt-2 flex justify-between text-[12.5px] tabular-nums text-faint">
          <span>{money(p.startingBalance)}</span>
          <span>{money(p.targetBalance)}</span>
        </div>
        {nextMilestone && (
          <p className="mt-4 text-[14px] text-muted">
            <span className="text-ink">Next milestone · {Math.round(nextMilestone.fraction * 100)}%</span>
            <span className="tabular-nums"> — {money(Math.max(0, nextMilestone.equity - p.currentEquity))} to go</span>
          </p>
        )}
        {reminder && <p className="mt-4 text-[14px] leading-relaxed text-muted">{reminder}</p>}
      </section>

      <Group title="Balance">
        <Line label="Current" value={money(p.currentEquity)} />
        <Line label="Highest" value={money(p.highestBalance)} />
        <Line label="To target" value={p.reachedTarget ? "Reached" : money(p.distanceToTarget)} tone={p.reachedTarget ? "text-profit" : undefined} />
      </Group>

      <Group title={`Risk · ${ddLabel(p.drawdownMode, p.trailingBasis)}`}>
        <Line label="Drawdown" value={formatSignedMoney(p.currentDrawdown)} tone={p.currentDrawdown > 0 ? "text-loss" : undefined} />
        <Line
          label="Cushion above floor"
          value={p.maxDrawdown > 0 ? formatSignedMoney(p.drawdownCushion) : "—"}
          tone={p.maxDrawdown > 0 ? (p.breached || p.remainingDrawdown <= p.maxDrawdown * 0.25 ? "text-loss" : "text-profit") : undefined}
        />
        <Line label="Drawdown floor" value={p.maxDrawdown > 0 ? money(p.drawdownThreshold) : "—"} />
        {p.maxDrawdown > 0 && <Line label="Worst drawdown seen" value={money(p.maxObservedDrawdown)} />}
      </Group>

      <Group title="Performance">
        <Line label="Win rate" value={fmtPct0(p.winRate)} />
        <Line label="Average R" value={p.avgR != null ? `${signedPct(p.avgR)}R` : "—"} />
        <Line label="Rule adherence" value={fmtPct0(p.ruleAdherence)} />
      </Group>

      {(limits.length > 0 || !!c.instruments?.length) && (
        <Group title="Rules & limits">
          {limits.map(([k, v]) => (
            <Line key={k} label={k} value={v} />
          ))}
          {!!c.instruments?.length && (
            <div>
              <dt>Instruments</dt>
              <dd>
                <span className="flex flex-wrap justify-end gap-1.5">
                  {c.instruments.map((x) => (
                    <Chip key={x}>{x}</Chip>
                  ))}
                </span>
              </dd>
            </div>
          )}
        </Group>
      )}

      {c.notes && (
        <section aria-label="Description">
          <SectionLabel>Description</SectionLabel>
          <p className="mt-3 text-[15px] leading-relaxed text-muted">{c.notes}</p>
        </section>
      )}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <SectionLabel>{title}</SectionLabel>
      <dl className="lb-group lb-dl mt-3">{children}</dl>
    </section>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd className={tone}>{value}</dd>
    </div>
  );
}
