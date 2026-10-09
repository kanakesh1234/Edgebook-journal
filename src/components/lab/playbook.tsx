"use client";

import { useMemo } from "react";
import { AnimatePresence } from "motion/react";
import { formatSignedMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { EmptyState, pnlClass } from "@/components/ui/misc";
import { FlaskIcon, PencilIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";
import { CardMotion, KebabMenu, Monogram, ResultsLine, btn, btnPrimary, plural } from "./lab-ui";
import { filterSetups, fmtPct0, type SetupInfo, type SetupSort } from "./lab-model";
import { useLab } from "./lab-overlays";

/** The playbook: one card per setup. Click opens the detail sheet; ⋯ has quick actions. */
export function SetupsView({
  infos,
  query,
  sort,
  onClear,
}: {
  infos: SetupInfo[];
  query: string;
  sort: SetupSort;
  onClear: () => void;
}) {
  const lab = useLab();
  const list = useMemo(() => filterSetups(infos, query, sort), [infos, query, sort]);
  const q = query.trim();

  if (infos.length === 0) {
    return (
      <EmptyState
        className="py-14"
        icon={<FlaskIcon className="h-7 w-7" />}
        title="No setups yet"
        body="A playbook of three to five A+ setups beats a head full of maybes. Define each as a set of rules you can check before every entry."
        action={
          <button type="button" className={btnPrimary} onClick={lab.newSetup}>
            <PlusIcon className="h-4 w-4" />
            New setup
          </button>
        }
      />
    );
  }

  return (
    <div>
      <ResultsLine>{q ? `${plural(list.length, "result")} for “${q}”` : plural(list.length, "setup")}</ResultsLine>

      {list.length === 0 ? (
        <EmptyState
          className="py-14"
          icon={<FlaskIcon className="h-7 w-7" />}
          title="No setups match"
          body="Try a different search."
          action={
            <button type="button" className={btn} onClick={onClear}>
              Clear search
            </button>
          }
        />
      ) : (
        <div className="lb-grid">
          <AnimatePresence initial={false} mode="popLayout">
            {list.map((info, i) => (
              <CardMotion key={info.setup.id} index={i}>
                <SetupCard info={info} />
              </CardMotion>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function SetupCard({ info }: { info: SetupInfo }) {
  const lab = useLab();
  const { setup, rules, stats } = info;
  return (
    <article className="lb-card">
      <div className="lb-card-body">
        <div className="flex items-start gap-3">
          <Monogram name={setup.name} />
          <div className="min-w-0 flex-1 pt-px">
            <h3 className="lb-title">
              <button type="button" className="lb-hit" onClick={() => lab.openSetup(setup.id)} aria-label={`Open setup ${setup.name}`}>
                {setup.name}
              </button>
            </h3>
            <p className="lb-meta">{plural(rules.length, "rule")}</p>
          </div>
          <KebabMenu
            className="lb-kebab-wrap"
            label={`Actions for ${setup.name}`}
            items={[
              { label: "Edit setup", icon: <PencilIcon />, onClick: () => lab.editSetup(setup) },
              "divider",
              { label: "Delete setup", icon: <TrashIcon />, danger: true, onClick: () => lab.deleteSetup(setup) },
            ]}
          />
        </div>
        {setup.strategy && <p className="lb-dek">{setup.strategy}</p>}
      </div>

      <dl className="lb-foot">
        <div>
          <dt>P&amp;L</dt>
          <dd className={cn(stats.trades > 0 && pnlClass(stats.totalPnl))}>{stats.trades > 0 ? formatSignedMoney(stats.totalPnl) : "—"}</dd>
        </div>
        <div>
          <dt>Win rate</dt>
          <dd>{fmtPct0(stats.winRate)}</dd>
        </div>
        <div>
          <dt>Trades</dt>
          <dd>{stats.trades}</dd>
        </div>
      </dl>
    </article>
  );
}
