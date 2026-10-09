"use client";

import { useMemo } from "react";
import { AnimatePresence } from "motion/react";
import type { BacktestSessionSummary } from "@/lib/backtesting/types";
import { formatMoney, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyState, pnlClass } from "@/components/ui/misc";
import { CandlestickIcon, PlusIcon, TrashIcon, ArrowRightIcon } from "@/components/ui/icons";
import { CardMotion, KebabMenu, ResultsLine, StatusPill, btn, btnPrimary, plural } from "./lab-ui";
import { ago, btStatus, filterSessions, fmtDay, fmtProfitFactor, type BtFilter, type BtSort } from "./lab-model";
import { useLab } from "./lab-overlays";

/** Backtests: replay sessions. Click a card to pick up where you left off. */
export function BacktestsView({
  sessions,
  loading,
  query,
  sort,
  status,
  onClear,
}: {
  sessions: BacktestSessionSummary[];
  loading: boolean;
  query: string;
  sort: BtSort;
  status: BtFilter;
  onClear: () => void;
}) {
  const lab = useLab();
  const list = useMemo(() => filterSessions(sessions, query, sort, status), [sessions, query, sort, status]);
  const q = query.trim();

  if (loading && sessions.length === 0) {
    return (
      <div className="lb-grid" aria-busy="true" aria-label="Loading sessions">
        {[0, 1, 2].map((i) => (
          <div key={i} className="lb-card h-[188px] animate-pulse" aria-hidden />
        ))}
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <EmptyState
        className="py-14"
        icon={<CandlestickIcon className="h-7 w-7" />}
        title="No backtests yet"
        body="Create a session to replay historical data candle by candle and practise your setups."
        action={
          <button type="button" className={btnPrimary} onClick={lab.newSession}>
            <PlusIcon className="h-4 w-4" />
            New session
          </button>
        }
      />
    );
  }

  return (
    <div>
      <ResultsLine>{q ? `${plural(list.length, "result")} for “${q}”` : plural(list.length, "session")}</ResultsLine>

      {list.length === 0 ? (
        <EmptyState
          className="py-14"
          icon={<CandlestickIcon className="h-7 w-7" />}
          title="No sessions match"
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
            {list.map((s, i) => (
              <CardMotion key={s.id} index={i}>
                <SessionCard s={s} />
              </CardMotion>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function SessionCard({ s }: { s: BacktestSessionSummary }) {
  const lab = useLab();
  const st = btStatus(s.status);
  const started = s.totalTrades > 0;
  return (
    <article className="lb-card">
      <div className="lb-card-body">
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <StatusPill tone={st.tone}>{st.label}</StatusPill>
            <h3 className="lb-title mt-2.5">
              <button type="button" className="lb-hit" onClick={() => lab.openSession(s.id)} aria-label={`Open session ${s.sessionName}`}>
                {s.sessionName}
              </button>
            </h3>
            <p className="lb-meta">
              {s.instruments.join(" + ")} · {s.timeframe} · {fmtDay(s.dateRange.start)}
            </p>
          </div>
          <KebabMenu
            className="lb-kebab-wrap"
            label={`Actions for ${s.sessionName}`}
            items={[
              { label: "Open session", icon: <ArrowRightIcon />, onClick: () => lab.openSession(s.id) },
              "divider",
              { label: "Delete session", icon: <TrashIcon />, danger: true, onClick: () => lab.deleteSession(s) },
            ]}
          />
        </div>

        <div className="mt-5 flex items-baseline justify-between gap-3">
          <p className={cn("kpi text-[26px] tabular-nums", started ? pnlClass(s.netPnl) : "text-faint")}>
            {started ? `${s.netPnl > 0 ? "+" : ""}${formatMoney(s.netPnl)}` : "—"}
          </p>
          {s.lastModified > 0 && <p className="text-[12.5px] text-faint">Opened {ago(s.lastModified)}</p>}
        </div>
      </div>

      <dl className="lb-foot">
        <div>
          <dt>Trades</dt>
          <dd>{s.totalTrades}</dd>
        </div>
        <div>
          <dt>Win rate</dt>
          <dd>{started ? formatPct(s.winRate, 0) : "—"}</dd>
        </div>
        <div>
          <dt>Profit factor</dt>
          <dd>{started ? fmtProfitFactor(s.profitFactor) : "—"}</dd>
        </div>
      </dl>
    </article>
  );
}
