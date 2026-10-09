"use client";

import { useMemo } from "react";
import { AnimatePresence } from "motion/react";
import { formatMoney, formatSignedMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyState, pnlClass } from "@/components/ui/misc";
import { FlagIcon, PencilIcon, PlusIcon, StarIcon, TrashIcon } from "@/components/ui/icons";
import { CardMotion, KebabMenu, Progress, ResultsLine, StatusPill, btn, btnPrimary, plural, type KebabItem } from "./lab-ui";
import { CHALLENGE_STATUS, filterChallenges, type ChallengeFilter, type ChallengeInfo, type ChallengeSort } from "./lab-model";
import { useLab } from "./lab-overlays";

/** Challenges: each is a distinct trading period with its own objective. */
export function ChallengesView({
  infos,
  query,
  sort,
  status,
  onClear,
}: {
  infos: ChallengeInfo[];
  query: string;
  sort: ChallengeSort;
  status: ChallengeFilter;
  onClear: () => void;
}) {
  const lab = useLab();
  const list = useMemo(() => filterChallenges(infos, query, sort, status), [infos, query, sort, status]);
  const q = query.trim();

  if (infos.length === 0) {
    return (
      <EmptyState
        className="py-14"
        icon={<FlagIcon className="h-7 w-7" />}
        title="No challenges yet"
        body="Create one — a funded evaluation, a consistency month, a personal A+ execution period — and every trade you log against it builds its progress."
        action={
          <button type="button" className={btnPrimary} onClick={lab.newChallenge}>
            <PlusIcon className="h-4 w-4" />
            New challenge
          </button>
        }
      />
    );
  }

  return (
    <div>
      <ResultsLine>{q ? `${plural(list.length, "result")} for “${q}”` : plural(list.length, "challenge")}</ResultsLine>

      {list.length === 0 ? (
        <EmptyState
          className="py-14"
          icon={<FlagIcon className="h-7 w-7" />}
          title="No challenges match"
          body="Try a different search, or clear the filters."
          action={
            <button type="button" className={btn} onClick={onClear}>
              Clear search and filters
            </button>
          }
        />
      ) : (
        <div className="lb-grid">
          <AnimatePresence initial={false} mode="popLayout">
            {list.map((info, i) => (
              <CardMotion key={info.challenge.id} index={i}>
                <ChallengeCard info={info} />
              </CardMotion>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function ChallengeCard({ info }: { info: ChallengeInfo }) {
  const lab = useLab();
  const { challenge: c, progress: p, status, primary } = info;
  const st = CHALLENGE_STATUS[status];
  const items: KebabItem[] = [
    ...(primary ? [] : [{ label: "Make primary", icon: <StarIcon />, onClick: () => void lab.makePrimary(c.id) } as KebabItem]),
    { label: "Edit challenge", icon: <PencilIcon />, onClick: () => lab.editChallenge(c) },
    "divider",
    { label: "Delete challenge", icon: <TrashIcon />, danger: true, onClick: () => lab.deleteChallenge(c) },
  ];

  return (
    <article className="lb-card" data-primary={primary ? "true" : undefined}>
      <div className="lb-card-body">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusPill tone={st.tone}>{st.label}</StatusPill>
              {primary && (
                <StatusPill tone="gold">
                  <StarIcon className="h-3 w-3" />
                  Primary
                </StatusPill>
              )}
            </div>
            <h3 className="lb-title mt-2.5">
              <button
                type="button"
                className="lb-hit"
                onClick={() => lab.openChallenge(c.id)}
                aria-label={`Open challenge ${c.name}${primary ? " (primary)" : ""}`}
              >
                {c.name}
              </button>
            </h3>
            <p className="lb-meta tabular-nums">
              {formatMoney(p.startingBalance)} → {formatMoney(p.targetBalance)}
            </p>
          </div>
          <KebabMenu className="lb-kebab-wrap" label={`Actions for ${c.name}`} items={items} />
        </div>

        <div className="mt-5 flex items-baseline justify-between gap-3">
          <p className={cn("kpi text-[26px] tabular-nums", p.trades > 0 ? pnlClass(p.currentPnl) : "text-faint")}>
            {p.trades > 0 ? formatSignedMoney(p.currentPnl) : "—"}
          </p>
          <p className="text-[13px] tabular-nums text-muted">{p.progressPct}%</p>
        </div>
        <div className="mt-2.5">
          <Progress value={p.progress} tone={status === "completed" ? "profit" : status === "breached" ? "loss" : undefined} label={`${p.progressPct}% of challenge progress`} />
        </div>
      </div>

      <dl className="lb-foot">
        <div>
          <dt>Balance</dt>
          <dd>{formatMoney(p.currentEquity, undefined, { compact: true })}</dd>
        </div>
        <div>
          <dt>Cushion</dt>
          <dd className={cn(p.maxDrawdown > 0 && (p.breached || p.remainingDrawdown <= p.maxDrawdown * 0.25 ? "text-loss" : "text-profit"))}>
            {p.maxDrawdown > 0 ? formatSignedMoney(p.drawdownCushion, undefined, { compact: true }) : "—"}
          </dd>
        </div>
        <div>
          <dt>Trades</dt>
          <dd>{p.trades}</dd>
        </div>
      </dl>
    </article>
  );
}
