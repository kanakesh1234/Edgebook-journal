"use client";

import { motion } from "motion/react";
import { useApp } from "@/lib/store";
import { useUi } from "@/lib/ui-store";
import type { PlaybookSetup } from "@/lib/types";
import { Playbook } from "@/components/lab/playbook";
import { Challenges } from "@/components/lab/challenges";
import { Backtesting } from "@/components/lab/backtesting";
import { useBacktest } from "@/lib/backtesting/store";
import { EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { FlaskIcon, PlusIcon, SparklesIcon } from "@/components/ui/icons";

/**
 * Trading Lab — setups / playbook, challenges AND backtesting.
 * All three are folder-style cards; open any card to inspect it.
 */
export default function LabPage() {
  const entries = useApp((s) => s.entries);
  const settings = useApp((s) => s.settings);
  const openNewEntry = useUi((s) => s.openNewEntry);
  const playbook: PlaybookSetup[] = settings.playbook ?? [];
  const challengeCount = settings.challenges?.length ?? 0;
  const backtestCount = useBacktest((s) => s.sessions.length);

  const showEmpty = entries.length === 0 && playbook.length === 0;

  return (
    <div className="space-y-6">
      <LabHeader
        action={
          <div className="flex items-end gap-6 text-right">
            <div>
              <p className="num text-2xl font-semibold text-ink">{playbook.length}</p>
              <p className="text-[11px] text-faint">setup{playbook.length === 1 ? "" : "s"}</p>
            </div>
            <div>
              <p className="num text-2xl font-semibold text-ink">{challengeCount}</p>
              <p className="text-[11px] text-faint">challenge{challengeCount === 1 ? "" : "s"}</p>
            </div>
            <div>
              <p className="num text-2xl font-semibold text-ink">{backtestCount}</p>
              <p className="text-[11px] text-faint">backtest{backtestCount === 1 ? "" : "s"}</p>
            </div>
          </div>
        }
      />

      {showEmpty ? (
        <EmptyState
          icon={<FlaskIcon className="h-7 w-7" />}
          title="Your playbook is ready"
          body="Define your setups — each one a folder of rules you can check before every entry. Log or import your first trade and MINATO starts measuring execution against them."
          action={
            <>
              <Button variant="gold" onClick={openNewEntry}>
                <PlusIcon className="h-4 w-4" />
                Log first trade
              </Button>
              <Button variant="outline" onClick={() => void useApp.getState().loadDemoData()}>
                <SparklesIcon className="h-4 w-4" />
                Load demo data
              </Button>
            </>
          }
        />
      ) : (
        /* PLAYBOOK — folder-style setup cards with full CRUD */
        <Playbook setups={playbook} entries={entries} />
      )}

      {/* CHALLENGES — folder-style challenge cards, same look as setups */}
      <Challenges />

      {/* BACKTESTING — replay sessions, same folder-card look */}
      <Backtesting />
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
          Your setups, playbook, challenges and backtests. Open any card to inspect its rules, progress and the trades behind it.
        </p>
      </div>
      {action}
    </header>
  );
}
