"use client";

import { useEffect, useMemo, useState } from "react";
import type { JournalEntry } from "@/lib/types";
import { useImageUrls } from "@/lib/hooks";
import { formatDateMedium } from "@/lib/format";
import { cn } from "@/lib/utils";

/** All saved charts of a trade, in a stable order: screenshots first, then the compare-symbol chart. */
export function chartsOf(entry: JournalEntry): Array<{ id: string; label: string }> {
  const shots = (entry.images ?? []).map((img, i) => ({ id: img.id, label: i === 0 ? "Trade chart" : "Second screenshot" }));
  return entry.compareImage ? [...shots, { id: entry.compareImage.id, label: "Compare symbol" }] : shots;
}

const CompareIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M7 4v13m0 0-3-3m3 3 3-3M17 20V7m0 0-3 3m3-3 3 3" />
  </svg>
);

/**
 * Saved screenshot shown above a question.
 * Starts on the trade's FIRST screenshot. The ⇄ Compare button (only when the
 * trade has more than one chart) opens a full-screen vertical-scroll view with
 * every chart; Back returns to the question.
 */
export function ChartPanel({ entries, onOverlay, large }: { entries: JournalEntry[]; /** Called with true while a full-screen chart is open (the round clock pauses). */ onOverlay?: (open: boolean) => void; /** Give the chart more room (Time Machine). */ large?: boolean }) {
  const withCharts = useMemo(() => entries.filter((e) => chartsOf(e).length > 0), [entries]);
  const [tradeIdx, setTradeIdx] = useState(0);
  const [comparing, setComparing] = useState(false);
  const [zoom, setZoom] = useState(false);
  const entry = withCharts[Math.min(tradeIdx, withCharts.length - 1)];
  const charts = useMemo(() => (entry ? chartsOf(entry) : []), [entry]);
  const urls = useImageUrls(charts.map((c) => c.id));

  useEffect(() => {
    onOverlay?.(comparing || zoom);
    return () => onOverlay?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparing, zoom]);

  useEffect(() => {
    if (!comparing && !zoom) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setComparing(false);
      setZoom(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [comparing, zoom]);

  if (!entry || charts.length === 0) return null;
  const first = charts[0]!;
  const canCompare = charts.length > 1;
  const label = `${formatDateMedium(entry.date)} · ${entry.instrument || "trade"}`;

  return (
    <>
      <figure className="overflow-hidden rounded-[22px] border border-line bg-surface shadow-[0_1px_2px_rgb(48_40_24/0.05)] dark:shadow-none">
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-ink">{label}</p>
            <p className="text-[10.5px] font-medium uppercase tracking-[.12em] text-faint">{first.label}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {withCharts.length > 1 && (
              <div className="flex items-center gap-1 text-[11px] font-semibold text-muted">
                {withCharts.map((e, i) => (
                  <button
                    key={e.id}
                    onClick={() => { setTradeIdx(i); setComparing(false); }}
                    className={cn("h-7 w-7 rounded-full border transition-colors", i === tradeIdx ? "border-gold-strong bg-gold-strong text-on-gold" : "border-line bg-canvas hover:border-line-strong")}
                    aria-label={`Show trade ${i + 1} chart`}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
            {canCompare && (
              <button
                onClick={() => setComparing(true)}
                className="flex h-8 items-center gap-1.5 rounded-full border border-line-strong bg-raised px-3.5 text-[12.5px] font-semibold text-ink transition-colors hover:border-gold-strong"
              >
                <CompareIcon className="h-4 w-4" /> Compare{charts.length > 2 ? ` (${charts.length})` : ""}
              </button>
            )}
          </div>
        </div>
        <button onClick={() => setZoom(true)} className="block w-full cursor-zoom-in bg-canvas" aria-label="Enlarge chart">
          {urls[first.id] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={urls[first.id]!} alt={`${label} chart`} className={cn("w-full object-contain", large ? "max-h-[44vh]" : "max-h-[34vh]")} draggable={false} />
          ) : (
            <div className="grid h-40 animate-pulse place-items-center bg-ink/[0.03] text-xs text-muted">Loading chart…</div>
          )}
        </button>
      </figure>

      {zoom && (
        <div className="fixed inset-0 z-[70] flex cursor-zoom-out items-center justify-center bg-black/85 p-4" onClick={() => setZoom(false)} role="dialog" aria-modal="true" aria-label="Chart viewer">
          {urls[first.id] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={urls[first.id]!} alt={`${label} chart`} className="max-h-full max-w-full rounded-lg object-contain" draggable={false} />
          )}
        </div>
      )}

      {comparing && (
        <div className="fixed inset-0 z-[80] flex flex-col bg-canvas text-ink" role="dialog" aria-modal="true" aria-label="Compare charts">
          <header className="flex items-center justify-between gap-3 border-b border-line bg-canvas/95 px-4 py-3 backdrop-blur">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{label} — compare</p>
              <p className="text-[11px] text-muted">{charts.length} saved charts · scroll down</p>
            </div>
            <button onClick={() => setComparing(false)} className="rounded-full bg-gold-strong px-4 py-2 text-xs font-semibold text-on-gold hover:bg-gold-strong-hover">
              ← Back to question
            </button>
          </header>
          <div className="flex-1 overflow-y-auto px-4 py-5">
            <div className="mx-auto flex max-w-5xl flex-col gap-6">
              {charts.map((chart, i) => (
                <section key={chart.id} className="overflow-hidden rounded-[20px] border border-line bg-surface">
                  <p className="border-b border-line px-4 py-2 text-xs font-semibold">
                    Chart {i + 1} of {charts.length} <span className="font-normal text-muted">· {chart.label}</span>
                  </p>
                  {urls[chart.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={urls[chart.id]!} alt={`${label} — ${chart.label}`} className="w-full object-contain" draggable={false} />
                  ) : (
                    <div className="grid h-64 place-items-center text-xs text-muted">Loading chart…</div>
                  )}
                </section>
              ))}
              <button onClick={() => setComparing(false)} className="mx-auto mb-6 rounded-full bg-gold-strong px-6 py-3 text-sm font-semibold text-on-gold hover:bg-gold-strong-hover">
                ← Back to question
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
