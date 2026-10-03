"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import type { MatrixChartPrediction, MatrixScreenshotRole } from "@/lib/types";
import { Button3D, Card, Pill } from "@/components/matrix/ui";

type StudyChart = { id: string; name: string; role?: MatrixScreenshotRole };

const roleLabel: Record<MatrixScreenshotRole, string> = {
  "pre-entry": "Pre-entry",
  management: "Management",
  exit: "Exit",
};

export function MatrixChartStudy({ tradeId }: { tradeId: string }) {
  const entries = useApp((state) => state.entries);
  const settings = useApp((state) => state.settings);
  const entry = useMemo(() => entries.find((item) => item.id === tradeId), [entries, tradeId]);
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);

  if (!entry) return <NotFound />;
  const matrix = settings.matrixProgress ?? { xp: 0, tokens: 0, tradeStates: {} };
  const state = matrix.tradeStates?.[entry.id] ?? {};
  const charts: StudyChart[] = entry.images.map((image) => ({ id: image.id, name: image.name, role: state.imageRoles?.[image.id] }));
  const chart = charts[index];
  if (!chart) return <NoCharts tradeId={tradeId} />;
  const prediction = state.chartPredictions?.[chart.id];
  const canPredict = chart.role === "pre-entry";

  const savePrediction = async (value: MatrixChartPrediction) => {
    if (saving || prediction) return;
    setSaving(true);
    try {
      await useApp.getState().updateSettings({
        matrixProgress: {
          ...matrix,
          tradeStates: {
            ...(matrix.tradeStates ?? {}),
            [entry.id]: {
              ...state,
              chartPredictions: {
                ...(state.chartPredictions ?? {}),
                [chart.id]: { imageId: chart.id, prediction: value, recordedAt: Date.now() },
              },
            },
          },
        },
      });
    } finally {
      setSaving(false);
    }
  };

  return <div className="min-h-[calc(100dvh-4rem)] bg-canvas pb-8">
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/95 px-4 py-3 backdrop-blur sm:px-6">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
        <div className="min-w-0"><nav className="truncate text-xs text-muted"><Link href="/practice" className="hover:text-ink hover:underline">Practise</Link> / <Link href="/practice/matrix" className="hover:text-ink hover:underline">Matrix</Link> / <Link href={`/practice/matrix/${entry.id}`} className="hover:text-ink hover:underline">{entry.instrument}</Link> / <span className="text-ink">Study</span></nav><p className="mt-1 text-sm font-semibold text-ink">Chart {index + 1} of {charts.length}</p></div>
        <Link href={`/practice/matrix/${entry.id}`}><Button3D tone="secondary">Back to trade</Button3D></Link>
      </div>
    </header>
    <main className="mx-auto max-w-6xl px-4 pt-5 sm:px-6">
      <article className="min-h-[calc(100dvh-12rem)] rounded-panel border border-line bg-surface p-3 shadow-panel sm:p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><div><h1 className="text-base font-semibold text-ink">{entry.instrument !== "—" ? entry.instrument : "Trade chart"}</h1><p className="mt-0.5 text-xs text-muted">{chart.name}</p></div><Pill tone={chart.role === "exit" ? "muted" : chart.role === "management" ? "gold" : "green"}>{chart.role ? roleLabel[chart.role] : "Untagged chart"}</Pill></div>
        <div className="flex min-h-[40dvh] items-center justify-center overflow-auto rounded-control border border-line bg-raised"><img src={`/api/drive/image/${chart.id}`} alt={chart.name} className="max-h-[68dvh] w-full object-contain" /></div>
        {canPredict ? <PredictionPanel prediction={prediction?.prediction} direction={entry.direction} saving={saving} onPredict={savePrediction} /> : <p className="mt-4 rounded-control border border-line bg-raised px-3 py-2 text-xs text-muted">This chart is recorded as {chart.role ? roleLabel[chart.role].toLowerCase() : "untagged"}. Predictions are available for charts tagged pre-entry.</p>}
      </article>
      <nav aria-label="Chart navigation" className="mt-4 flex items-center justify-between gap-3"><Button3D tone="secondary" disabled={index === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))}>← Previous chart</Button3D><span className="text-xs text-muted">{index + 1} / {charts.length}</span><Button3D disabled={index === charts.length - 1} onClick={() => setIndex((value) => Math.min(charts.length - 1, value + 1))}>Next chart →</Button3D></nav>
    </main>
  </div>;
}

function PredictionPanel({ prediction, direction, saving, onPredict }: { prediction?: MatrixChartPrediction; direction: "long" | "short" | null; saving: boolean; onPredict: (value: MatrixChartPrediction) => void }) {
  if (!prediction) return <Card className="mt-4"><h2 className="text-sm font-semibold text-ink">Before you reveal the trade</h2><p className="mt-1 text-xs text-muted">Based only on this pre-entry chart, what was your intended bias?</p><div className="mt-3 flex flex-wrap gap-2"><Button3D disabled={saving} onClick={() => void onPredict("long")}>Long</Button3D><Button3D tone="secondary" disabled={saving} onClick={() => void onPredict("short")}>Short</Button3D><Button3D tone="secondary" disabled={saving} onClick={() => void onPredict("skip")}>Skip</Button3D></div></Card>;
  const matches = direction != null && prediction === direction;
  return <Card className="mt-4"><p className="text-xs font-semibold text-gold">Prediction saved</p><h2 className="mt-1 text-sm font-semibold text-ink">You chose {prediction}.</h2>{direction ? <p className="mt-1 text-xs text-muted">Recorded direction: <span className={matches ? "font-semibold text-profit" : "font-semibold text-loss"}>{direction}</span>. {matches ? "Your read matched the recorded trade." : "Compare this setup with the recorded direction before moving on."}</p> : <p className="mt-1 text-xs text-muted">No recorded direction is available for this trade, so there is nothing to compare your prediction against.</p>}</Card>;
}

function NotFound() { return <div className="mx-auto max-w-3xl py-16 text-center"><p className="text-sm text-muted">Trade not found.</p><Link href="/practice/matrix" className="mt-3 inline-block text-sm text-gold underline">Back to Matrix</Link></div>; }
function NoCharts({ tradeId }: { tradeId: string }) { return <div className="mx-auto max-w-3xl py-16 text-center"><p className="text-sm text-muted">This trade has no saved charts to study.</p><Link href={`/practice/matrix/${tradeId}`} className="mt-3 inline-block text-sm text-gold underline">Back to trade</Link></div>; }
