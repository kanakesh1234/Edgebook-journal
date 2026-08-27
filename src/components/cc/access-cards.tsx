"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useApp } from "@/lib/store";
import { primaryChallenge } from "@/lib/challenges";
import { formatSignedMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  CalendarIcon,
  ChevronRightIcon,
  FlaskIcon,
  TargetIcon,
} from "@/components/ui/icons";

/**
 * Home access cards — challenge context, calendar navigation, Lab access.
 * The challenge card follows the user's primary challenge (shared source of truth).
 */
export function ChallengeCard() {
  const entries = useApp((s) => s.entries);
  const settings = useApp((s) => s.settings);
  const current = useMemo(() => primaryChallenge(settings), [settings]);

  const challengeEntries = useMemo(
    () => (current ? entries.filter((e) => e.challengeId === current.id) : []),
    [entries, current],
  );
  const pnl = challengeEntries.reduce((s, e) => s + e.pnl, 0);

  return (
    <Link href="/calendar" className="panel panel-hover group flex flex-col justify-between p-5">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-faint">
          <TargetIcon className="h-3.5 w-3.5 text-gold" />
          Current challenge
        </p>
        <ChevronRightIcon className="h-4 w-4 text-faint transition-transform group-hover:translate-x-0.5" />
      </div>
      {current ? (
        <>
          <p className="mt-2.5 truncate font-display text-lg font-semibold text-ink">{current.name}</p>
          <p className="mt-1 text-sm">
            <span className="num font-medium text-muted">
              {challengeEntries.length} {challengeEntries.length === 1 ? "trade" : "trades"}
            </span>
            {challengeEntries.length > 0 && (
              <>
                <span className="mx-1.5 text-faint">·</span>
                <span className={cn("num font-semibold", pnl >= 0 ? "text-profit" : "text-loss")}>
                  {formatSignedMoney(pnl)}
                </span>
              </>
            )}
          </p>
        </>
      ) : (
        <div className="mt-2.5">
          <p className="text-sm text-muted">No primary challenge yet.</p>
          <p className="mt-1 text-xs text-faint">Create one from the Challenges page and mark it primary.</p>
        </div>
      )}
    </Link>
  );
}

export function CalendarAccessCard({ unreviewed, monthPnl }: { unreviewed: number; monthPnl: number }) {
  return (
    <Link href="/calendar" className="panel panel-hover group flex flex-col justify-between p-5">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-faint">
          <CalendarIcon className="h-3.5 w-3.5 text-info" />
          Calendar
        </p>
        <ChevronRightIcon className="h-4 w-4 text-faint transition-transform group-hover:translate-x-0.5" />
      </div>
      <p className="mt-2.5 font-display text-lg font-semibold text-ink">Trading history</p>
      <p className="mt-1 text-sm text-muted">
        {unreviewed > 0 ? (
          <>
            <span className="num font-semibold text-gold">{unreviewed}</span> awaiting review
          </>
        ) : (
          "All trades reviewed"
        )}
        {monthPnl !== 0 && (
          <>
            {" · "}
            <span className={cn("num font-semibold", monthPnl > 0 ? "text-profit" : "text-loss")}>
              {formatSignedMoney(monthPnl)}
            </span>
          </>
        )}
      </p>
    </Link>
  );
}

export function LabAccessCard() {
  return (
    <Link href="/lab" className="panel panel-hover group flex flex-col justify-between p-5">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-faint">
          <FlaskIcon className="h-3.5 w-3.5 text-gold" />
          Trading Lab
        </p>
        <ChevronRightIcon className="h-4 w-4 text-faint transition-transform group-hover:translate-x-0.5" />
      </div>
      <p className="mt-2.5 font-display text-lg font-semibold text-ink">Execution playbook</p>
      <p className="mt-1 text-sm text-muted">Rules, checklist, common mistakes.</p>
    </Link>
  );
}
