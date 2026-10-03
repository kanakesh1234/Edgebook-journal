"use client";

import { useApp } from "@/lib/store";
import { todayKey } from "@/lib/format";
import { MATRIX_DAILY_XP_GOAL } from "@/lib/matrix/progression";
import { matrixAccuracy, matrixTodayXp } from "@/lib/matrix/overview";
import { matrixStreak } from "@/lib/matrix/attempt";
import { GameTile, ProgressBar } from "@/components/matrix/ui";

export function MatrixHome() {
  const entries = useApp((state) => state.entries);
  const settings = useApp((state) => state.settings);
  const matrix = settings.matrixProgress ?? { xp: 0, tokens: 0, tradeStates: {} };
  const today = todayKey();
  const todayXp = matrixTodayXp(matrix, today);
  const accuracy = matrixAccuracy(matrix);
  const due = Object.values(matrix.tradeStates ?? {}).filter((state) => !!state.dueOn && state.dueOn <= today).length;
  const weekend = [0, 6].includes(new Date().getDay());
  return <section className="panel p-5 sm:p-6" aria-label="Matrix practice"><div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-gold">Practice arcade</p><h2 className="mt-1 text-lg font-semibold text-ink">Train with your recorded trades</h2><p className="mt-1 text-xs text-muted">Every Matrix prompt is drawn from your journal.</p></div><a href="/practice/matrix" className="text-xs font-semibold text-gold hover:underline">Open Matrix →</a></div><div className="mt-5 grid gap-3 sm:grid-cols-5"><Metric label="Today’s XP" value={`${todayXp} / ${MATRIX_DAILY_XP_GOAL}`} detail={<ProgressBar value={(todayXp / MATRIX_DAILY_XP_GOAL) * 100} />} /><Metric label="Matrix streak" value={`${matrixStreak(matrix)} days`} /><Metric label="Trades logged" value={String(entries.filter((entry) => entry.date === today).length)} detail="today" /><Metric label="Challenges" value={String(settings.challenges?.length ?? 0)} detail="recorded" /><Metric label="Accuracy" value={accuracy == null ? "—" : `${Math.round(accuracy * 100)}%`} detail={due ? `${due} due review${due === 1 ? "" : "s"}` : "nothing due"} /></div><div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><GameTile href="/practice/matrix" tone="purple" title="Matrix" detail={due ? `${due} real trade review${due === 1 ? "" : "s"} due.` : "Revisit your real trades."} action="Open Matrix" /><GameTile href="/practice" tone="green" title="Time Machine" detail="Practice recorded process decisions." action="Train" /><GameTile href="/practice" tone="gold" title="Math Duel" detail="Build calculation fluency from your risk data." action="Open duel" /><GameTile href="/practice/matrix/modes" tone="red" title="Weekend Boss" detail={weekend ? "Active now: combine this week’s real trades." : "Returns Saturday with your week’s trade matrix."} action={weekend ? "Play Boss" : "View modes"} /></div></section>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: React.ReactNode }) { return <div className="rounded-control border border-line bg-raised p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-faint">{label}</p><p className="mt-1 text-sm font-semibold text-ink">{value}</p>{detail && <div className="mt-2 text-[10px] text-muted">{detail}</div>}</div>; }
