"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useApp } from "@/lib/store";
import { useImageUrls } from "@/lib/hooks";
import { checklistItems, checklistScore } from "@/lib/types";
import { formatDateFull, formatSignedMoney, weekdayShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { JournalEntry } from "@/lib/types";
import { XIcon } from "@/components/ui/icons";

/**
 * Compare mode — full-screen, vertical.
 * Chart 1 ↓ Chart 2 ↓ Trade A details ↓ Trade B details.
 * Process comparison, not merely profit comparison.
 */
export default function ComparePage() {
  const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const aId = params?.get("a") ?? "";
  const bId = params?.get("b") ?? "";
  const entries = useApp((s) => s.entries);
  const settings = useApp((s) => s.settings);
  const challenges = settings.challenges ?? [];

  const a = useMemo(() => entries.find((e) => e.id === aId), [entries, aId]);
  const b = useMemo(() => entries.find((e) => e.id === bId), [entries, bId]);
  const urlsA = useImageUrls(a?.images.map((i) => i.id) ?? []);
  const urlsB = useImageUrls(b?.images.map((i) => i.id) ?? []);

  if (!a || !b) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="text-center">
          <p className="text-sm text-muted">Select two trades from a trade review to compare.</p>
          <Link href="/calendar" className="mt-4 inline-block text-sm font-medium text-gold hover:text-gold-deep">
            Open calendar
          </Link>
        </div>
      </div>
    );
  }

  const challengeA = challenges.find((c) => c.id === a.challengeId);
  const challengeB = challenges.find((c) => c.id === b.challengeId);

  return (
    <div className="min-h-dvh bg-canvas">
      {/* Slim header */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-canvas/95 px-5 py-3 backdrop-blur">
        <div>
          <p className="font-display text-sm font-semibold text-ink">Compare</p>
          <p className="text-[11px] text-faint">Process comparison — scroll vertically</p>
        </div>
        <Link
          href={`/review/${a.id}`}
          className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-ink"
        >
          <XIcon className="h-3.5 w-3.5" />
          Exit compare
        </Link>
      </header>

      <main className="mx-auto max-w-4xl space-y-0 px-5 pb-16">
        {/* Chart 1 */}
        <ChartBlock
          label="CHART 1"
          entry={a}
          urls={urlsA}
          accent={a.pnl >= 0 ? "text-profit" : "text-loss"}
        />

        <div className="flex items-center justify-center py-4" aria-hidden>
          <span className="h-10 w-px bg-gradient-to-b from-transparent via-line-strong to-transparent" />
        </div>

        {/* Chart 2 */}
        <ChartBlock
          label="CHART 2"
          entry={b}
          urls={urlsB}
          accent={b.pnl >= 0 ? "text-profit" : "text-loss"}
        />

        {/* Details */}
        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <TradeDetails title="TRADE A" entry={a} challengeName={challengeA?.name} />
          <TradeDetails title="TRADE B" entry={b} challengeName={challengeB?.name} />
        </div>
      </main>
    </div>
  );
}

function ChartBlock({
  label,
  entry,
  urls,
  accent,
}: {
  label: string;
  entry: JournalEntry;
  urls: Record<string, string | null>;
  accent: string;
}) {
  const settings = useApp((s) => s.settings);
  const d = new Date(entry.date + "T00:00:00");
  return (
    <section className="pt-8" aria-label={label}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-faint">{label}</p>
        <p className="flex items-baseline gap-2">
          <span className={cn("kpi text-2xl", accent)}>{formatSignedMoney(entry.pnl, settings.currency)}</span>
          <span className="text-xs text-muted">
            {d.getDate()} {d.toLocaleString("en-US", { month: "long" })} · {weekdayShort(entry.date)}
            {entry.entryTime && ` · ${entry.entryTime}`}
          </span>
        </p>
      </div>
      {entry.images.length === 0 ? (
        <div className="flex aspect-[16/9] items-center justify-center rounded-xl border border-dashed border-line-strong bg-raised/30 text-sm text-faint">
          No screenshots for this trade
        </div>
      ) : (
        <div className="space-y-3">
          {entry.images.map((img) => (
            <ScreenshotFull key={img.id} imageId={img.id} name={img.name} urls={urls} />
          ))}
        </div>
      )}
    </section>
  );
}

/** Full-width, aspect-preserving, scrollable screenshot. */
function ScreenshotFull({ imageId, name, urls }: { imageId: string; name: string; urls: Record<string, string | null> }) {
  const url = urls[imageId];
  if (!url) {
    return <div className="grid aspect-[16/9] place-items-center rounded-xl border border-line bg-raised/40"><span className="h-5 w-5 animate-spin rounded-full border-2 border-line-strong border-t-gold" /></div>;
  }
  return (
    <div className="max-h-[85dvh] overflow-y-auto rounded-xl border border-line-strong bg-canvas">
      <img src={url} alt={name} className="w-full object-contain" loading="lazy" />
    </div>
  );
}

function TradeDetails({ title, entry, challengeName }: { title: string; entry: ReturnType<typeof useApp.getState>["entries"][number]; challengeName?: string }) {
  const settings = useApp((s) => s.settings);
  const d = new Date(entry.date + "T00:00:00");
  const checklist = entry.checklist ? checklistItems(entry.checklist) : [];
  const score = entry.checklist ? checklistScore(entry.checklist) : null;
  const r = entry.review;

  return (
    <section className="panel p-5" aria-label={title}>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-faint">{title}</p>
      <p className={cn("kpi mt-2 text-3xl", entry.pnl > 0 ? "text-profit" : entry.pnl < 0 ? "text-loss" : "text-ink")}>
        {formatSignedMoney(entry.pnl, settings.currency)}
      </p>
      <p className="mt-1 text-xs text-muted">
        {d.toLocaleString("en-US", { month: "long" })} {d.getDate()} · {weekdayShort(entry.date)}
        {entry.entryTime && ` · ${entry.entryTime}`}
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-line pt-4 text-[13px]">
        <Detail label="Instrument" value={entry.instrument} />
        <Detail label="Direction" value={entry.direction ?? "—"} />
        <Detail label="Setup" value={entry.setup || "—"} />
        <Detail label="Challenge" value={challengeName ?? "—"} />
        <Detail label="Entry" value={entry.entryPrice != null ? String(entry.entryPrice) : "—"} />
        <Detail label="Exit" value={entry.exitPrice != null ? String(entry.exitPrice) : "—"} />
        <Detail label="Stop" value={entry.stopLoss != null ? String(entry.stopLoss) : "—"} />
        <Detail label="Target" value={entry.takeProfit != null ? String(entry.takeProfit) : "—"} />
      </dl>

      {score && (
        <div className="mt-4 border-t border-line pt-3">
          <p className="flex items-center justify-between text-[13px]">
            <span className="text-muted">Checklist</span>
            <span className={cn("num font-semibold", score.confirmed === score.required ? "text-profit" : "text-gold")}>
              {score.confirmed} / {score.required}
            </span>
          </p>
          {score.confirmed < score.required && (
            <p className="mt-1.5 text-xs font-semibold uppercase tracking-wide text-loss">Rule violation</p>
          )}
        </div>
      )}

      {(entry.reflection || r?.psychology || r?.execution) && (
        <div className="mt-4 space-y-2 border-t border-line pt-3 text-[13px]">
          {r?.psychology?.emotionBefore && <DetailRow label="Emotion" value={r.psychology.emotionBefore} />}
          {r?.psychology?.fomo != null && <DetailRow label="FOMO" value={r.psychology.fomo ? "Yes" : "No"} />}
          {r?.psychology?.revenge != null && <DetailRow label="Revenge" value={r.psychology.revenge ? "Yes" : "No"} />}
          {r?.execution?.movedStop != null && <DetailRow label="Moved stop" value={r.execution.movedStop ? "Yes" : "No"} />}
          {r?.execution?.exitedEarly != null && <DetailRow label="Exited early" value={r.execution.exitedEarly ? "Yes" : "No"} />}
          {entry.reflection?.wentPoorly && <DetailRow label="What went wrong" value={entry.reflection.wentPoorly} />}
          {entry.reflection?.lesson && <DetailRow label="Lesson" value={entry.reflection.lesson} />}
        </div>
      )}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-[0.08em] text-faint">{label}</dt>
      <dd className="mt-0.5 truncate font-medium capitalize text-ink">{value}</dd>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <p className="flex gap-2">
      <span className="w-24 shrink-0 text-faint">{label}</span>
      <span className="min-w-0 flex-1 text-ink">{value}</span>
    </p>
  );
}
