"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useApp } from "@/lib/store";
import { useImageUrls } from "@/lib/hooks";
import { Lightbox } from "@/components/ui/lightbox";
import { formatDateMedium, weekdayShort } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { planJournalReplay } from "@/lib/backtesting/journal-replay";
import { barDelay, endIdx, SPEEDS, type Speed } from "@/lib/feed/replay";
import { useReplayData } from "@/components/feed/replay-chart";
import { useReplayTrade } from "@/components/journal/replay-trade";
import { Sym } from "@/components/journal/symbols";
import type { JournalEntry, JournalSettings } from "@/lib/types";
import type { MistakeGroup } from "@/lib/review/mistakes";
import type { SessionLogRow } from "@/lib/review/metrics";
import { cn } from "@/lib/utils";
import { Card, DirTag, fmtR, GradeBadge, REVIEW_SMOOTH, tone, useMoney } from "./review-ui";
import type { ReviewActions } from "./reviews-panel";

const LazyReplayCanvas = dynamic(
  () => import("@/components/feed/replay-canvas").then((m) => m.ReplayChart),
  {
    ssr: false,
    loading: () => <div className="grid h-full place-items-center text-[13px] text-muted">Loading chart…</div>,
  },
);

/* ─────────────────────────────────────────────────────────────
   1. Repeating-Mistake Replay Spotlight
───────────────────────────────────────────────────────────── */

export function MistakeReplaySpotlight({
  mistake,
  allMistakes,
  entries,
  onOpenTrade,
}: {
  mistake: MistakeGroup;
  allMistakes: MistakeGroup[];
  entries: JournalEntry[];
  onOpenTrade: (id: string) => void;
}) {
  const { signed } = useMoney();
  const startingEquity = useApp((s) => s.settings.startingEquity);
  const currency = useApp((s) => s.settings.currency);

  const byId = useMemo(() => new Map(entries.map((e) => [e.id, e])), [entries]);
  const [pickedMistakeKey, setPickedMistakeKey] = useState(mistake.key);
  const activeGroup = allMistakes.find((m) => m.key === pickedMistakeKey) ?? mistake;

  const candidateEntries = useMemo(
    () =>
      activeGroup.entryIds
        .map((id) => byId.get(id))
        .filter((e): e is JournalEntry => !!e)
        .sort((a, b) => a.pnl - b.pnl),
    [activeGroup.entryIds, byId],
  );

  const [tradeIdx, setTradeIdx] = useState(0);
  useEffect(() => setTradeIdx(0), [activeGroup.key]);

  const entry = candidateEntries[tradeIdx] ?? candidateEntries[0] ?? null;
  if (!entry) return null;

  return (
    <MistakeReplayCard
      group={activeGroup}
      mistakeTabs={allMistakes.filter((m) => m.entryIds.length > 0).slice(0, 4)}
      onPickMistake={setPickedMistakeKey}
      entry={entry}
      countInGroup={candidateEntries.length}
      tradeIndex={tradeIdx}
      onCycleTrade={() => setTradeIdx((i) => (i + 1) % Math.max(1, candidateEntries.length))}
      startingEquity={startingEquity}
      currency={currency}
      signed={signed}
      onOpenTrade={onOpenTrade}
    />
  );
}

function MistakeReplayCard({
  group,
  mistakeTabs,
  onPickMistake,
  entry,
  countInGroup,
  tradeIndex,
  onCycleTrade,
  startingEquity,
  currency,
  signed,
  onOpenTrade,
}: {
  group: MistakeGroup;
  mistakeTabs: MistakeGroup[];
  onPickMistake: (k: string) => void;
  entry: JournalEntry;
  countInGroup: number;
  tradeIndex: number;
  onCycleTrade: () => void;
  startingEquity: number;
  currency: JournalSettings["currency"];
  signed: (n: number) => string;
  onOpenTrade: (id: string) => void;
}) {
  const reduce = useReducedMotion();
  const [zoomed, setZoomed] = useState<string | null>(null);
  const plan = useMemo(
    () => planJournalReplay(entry, { startingBalance: startingEquity > 0 ? startingEquity : 50000, currency }),
    [entry, startingEquity, currency],
  );
  const canInlineReplay = plan.ok && plan.mode === "trade";
  const replay = useReplayData(entry, plan, canInlineReplay);
  const fullReplay = useReplayTrade(entry);
  const imgIds = useMemo(() => entry.images.slice(0, 1).map((i) => i.id), [entry.images]);
  const urls = useImageUrls(imgIds);
  const fallbackImg = imgIds[0] ? urls[imgIds[0]] : null;

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [idx, setIdx] = useState(0);

  const model = replay.status === "ready" ? replay.model : null;
  const maxBar = model ? endIdx(model) : 0;

  useEffect(() => {
    if (!model) {
      setIdx(0);
      setPlaying(false);
      return;
    }
    setIdx(reduce ? maxBar : model.startIdx);
    setPlaying(false);
  }, [model, maxBar, reduce]);

  useEffect(() => {
    if (!playing || !model) return;
    const t = window.setTimeout(() => {
      setIdx((cur) => (cur >= maxBar ? model.startIdx : cur + 1));
    }, barDelay(speed));
    return () => window.clearTimeout(t);
  }, [playing, idx, speed, model, maxBar]);

  const pct = model && maxBar > model.startIdx ? Math.max(0, Math.min(1, (idx - model.startIdx) / (maxBar - model.startIdx))) : 0;

  return (
    <>
      <Card pad={false} className="overflow-hidden">
        {/* Minimal Apple Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-loss/14 text-loss">
              <Sym name="repeat" className="h-4 w-4" strokeWidth={2} />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-[14.5px] font-semibold tracking-[-0.01em] text-ink">{group.label}</p>
                <span className="shrink-0 rounded-full bg-loss/12 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-loss">
                  {group.count}×{group.lost > 0 ? ` · ${signed(-group.lost)}` : ""}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[12px] text-muted">
                {entry.instrument} · {formatDateMedium(entry.date)}
                {entry.entryTime ? ` · ${entry.entryTime}` : ""} · <span className={cn("font-semibold tabular-nums", tone(entry.pnl))}>{signed(entry.pnl)}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {countInGroup > 1 && (
              <button
                type="button"
                onClick={() => {
                  haptic.selection();
                  onCycleTrade();
                }}
                className="inline-flex h-8 items-center gap-1 rounded-full bg-ink/[0.06] px-3 text-[12px] font-medium text-ink transition-colors hover:bg-ink/[0.1] active:scale-95"
              >
                <span>Trade {tradeIndex + 1}/{countInGroup}</span>
                <Sym name="chevronRight" className="h-3.5 w-3.5 text-muted" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onOpenTrade(entry.id)}
              className="inline-flex h-8 items-center gap-1 rounded-full bg-ink/[0.06] px-3 text-[12px] font-medium text-ink transition-colors hover:bg-ink/[0.1] active:scale-95"
            >
              Inspect
            </button>
            {fullReplay.plan?.ok && (
              <button
                type="button"
                disabled={fullReplay.busy}
                onClick={() => void fullReplay.start()}
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-gold-strong px-3.5 text-[12px] font-semibold text-on-gold transition-opacity hover:opacity-90 active:scale-95 disabled:opacity-50"
              >
                <Sym name="play" className="h-3 w-3" />
                <span>{fullReplay.busy ? "Opening…" : "Full replay"}</span>
              </button>
            )}
          </div>
        </div>

        {/* Optional switchers if multiple patterns present */}
        {mistakeTabs.length > 1 && (
          <div className="flex gap-1.5 overflow-x-auto border-b border-line-soft/70 bg-well/60 px-5 py-2 [scrollbar-width:none] sm:px-6">
            {mistakeTabs.map((t) => {
              const on = t.key === group.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    onPickMistake(t.key);
                  }}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1 text-[12px] font-medium transition-colors",
                    on ? "bg-raised text-ink shadow-xs" : "text-muted hover:text-ink",
                  )}
                >
                  {t.label} <span className="num text-faint">({t.count})</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Embedded Interactive Candle Stage OR Attached Screenshot Fallback */}
        {canInlineReplay ? (
          <div className="relative">
            <div
              className={cn(
                "relative h-[250px] w-full bg-well/40 sm:h-[300px]",
                "[&_.fd-ohlc-bar]:pointer-events-none [&_.fd-ohlc-bar]:absolute [&_.fd-ohlc-bar]:left-3 [&_.fd-ohlc-bar]:top-2.5 [&_.fd-ohlc-bar]:z-10 [&_.fd-ohlc-bar]:flex [&_.fd-ohlc-bar]:gap-2.5 [&_.fd-ohlc-bar]:rounded-full [&_.fd-ohlc-bar]:bg-surface/80 [&_.fd-ohlc-bar]:px-3 [&_.fd-ohlc-bar]:py-1 [&_.fd-ohlc-bar]:text-[11px] [&_.fd-ohlc-bar]:tabular-nums [&_.fd-ohlc-bar]:text-ink [&_.fd-ohlc-bar]:backdrop-blur-md",
                "[&_.fd-ohlc-bar_b]:mr-1 [&_.fd-ohlc-bar_b]:text-muted [&_.fd-up]:text-profit [&_.fd-down]:text-loss",
              )}
            >
              {replay.status === "ready" && (
                <LazyReplayCanvas model={replay.model} idx={idx} label={`Replay of ${entry.instrument} ${entry.date}`} />
              )}
              {replay.status === "loading" && (
                <div className="grid h-full place-items-center text-[13px] text-muted">Loading replay candles…</div>
              )}
              {replay.status === "error" && (
                <div className="grid h-full place-items-center px-6 text-center text-[13px] text-muted">
                  {fallbackImg ? (
                    <button type="button" onClick={() => setZoomed(fallbackImg)} className="group relative h-[220px] w-full cursor-zoom-in overflow-hidden rounded-[14px]">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={fallbackImg} alt={entry.instrument} className="h-full w-full object-contain" />
                    </button>
                  ) : (
                    <span>{replay.message}</span>
                  )}
                </div>
              )}
            </div>

            {model && (
              <div className="flex items-center gap-3 border-t border-line-soft bg-surface/85 px-5 py-2.5 backdrop-blur-md sm:px-6">
                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    if (!playing && idx >= maxBar) setIdx(model.startIdx);
                    setPlaying((p) => !p);
                  }}
                  aria-label={playing ? "Pause replay" : "Play mistake replay"}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold-strong text-on-gold transition-transform active:scale-90"
                >
                  {playing ? (
                    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden>
                      <rect x="6.5" y="5.5" width="3.8" height="13" rx="1.1" />
                      <rect x="13.7" y="5.5" width="3.8" height="13" rx="1.1" />
                    </svg>
                  ) : (
                    <Sym name="play" className="h-3.5 w-3.5" />
                  )}
                </button>

                <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-ink/[0.08]">
                  <motion.div
                    className="h-full rounded-full bg-gold-strong"
                    style={{ width: `${Math.round(pct * 100)}%` }}
                    transition={{ duration: 0.18 }}
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    haptic.selection();
                    const next = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
                    setSpeed(next);
                  }}
                  className="num inline-flex h-7 items-center rounded-full bg-ink/[0.06] px-2.5 text-[11.5px] font-semibold text-ink hover:bg-ink/[0.1]"
                >
                  {speed}×
                </button>
              </div>
            )}
          </div>
        ) : fallbackImg ? (
          <div className="p-4 sm:p-5">
            <button
              type="button"
              onClick={() => setZoomed(fallbackImg)}
              className="group relative block max-h-[260px] w-full cursor-zoom-in overflow-hidden rounded-[16px] bg-well"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={fallbackImg} alt={entry.instrument} className="mx-auto max-h-[260px] w-full object-contain transition-transform duration-300 group-hover:scale-[1.01]" />
            </button>
          </div>
        ) : null}
      </Card>

      <Lightbox src={zoomed} onClose={() => setZoomed(null)} alt={`${entry.instrument} chart`} />
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   2. Chart Screenshots Strip (Apple Photos-style tape)
───────────────────────────────────────────────────────────── */

export function TradeScreenshotsGallery({
  entries,
  onOpenTrade,
}: {
  entries: JournalEntry[];
  onOpenTrade: (id: string) => void;
}) {
  const { signed } = useMoney();
  const [zoomed, setZoomed] = useState<{ url: string; alt: string } | null>(null);

  const items = useMemo(() => {
    const out: Array<{ imgId: string; name: string; entry: JournalEntry }> = [];
    for (const e of entries) {
      for (const im of e.images) {
        out.push({ imgId: im.id, name: im.name, entry: e });
      }
    }
    return out;
  }, [entries]);

  const urls = useImageUrls(useMemo(() => items.map((x) => x.imgId), [items]));
  if (items.length === 0) return null;

  return (
    <>
      <div className="-mx-1 flex snap-x snap-mandatory gap-3.5 overflow-x-auto px-1 pb-2 [scrollbar-width:thin]">
        {items.map(({ imgId, name, entry }, i) => {
          const src = urls[imgId];
          return (
            <motion.div
              key={imgId}
              initial={{ opacity: 0, scale: 0.97 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.42, delay: Math.min(i * 0.05, 0.25), ease: REVIEW_SMOOTH }}
              className="group relative w-[270px] shrink-0 snap-start overflow-hidden rounded-[20px] border border-line-soft bg-surface shadow-panel sm:w-[310px] dark:border-line"
            >
              <button
                type="button"
                disabled={!src}
                onClick={() => src && setZoomed({ url: src, alt: `${entry.instrument} · ${formatDateMedium(entry.date)}` })}
                aria-label={`Zoom screenshot ${entry.instrument} ${entry.date}`}
                className="relative block aspect-[16/10] w-full cursor-zoom-in overflow-hidden bg-well outline-none"
              >
                {src ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={src}
                    alt={name}
                    loading="lazy"
                    className="h-full w-full object-cover transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-[1.03]"
                  />
                ) : (
                  <span className="grid h-full w-full place-items-center text-[12px] text-faint">Loading…</span>
                )}
              </button>

              <div className="flex items-center justify-between gap-2 px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-ink">
                    {entry.instrument} <span className="font-normal text-muted">· {formatDateMedium(entry.date)}</span>
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className={cn("num text-[12.5px] font-semibold", tone(entry.pnl))}>{signed(entry.pnl)}</span>
                  <button
                    type="button"
                    onClick={() => onOpenTrade(entry.id)}
                    aria-label="Open trade sheet"
                    className="grid h-6 w-6 place-items-center rounded-full bg-ink/[0.06] text-muted transition-colors hover:bg-ink/[0.12] hover:text-ink"
                  >
                    <Sym name="arrowUpRight" className="h-3 w-3" />
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <Lightbox src={zoomed?.url ?? null} alt={zoomed?.alt} onClose={() => setZoomed(null)} />
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   3. Clean Minimalist Trades List
───────────────────────────────────────────────────────────── */

export function PeriodTradesList({
  rows,
  actions,
  initialLimit = 6,
  filterDate,
  onClearFilter,
  emptyLabel = "No trades logged.",
}: {
  rows: SessionLogRow[];
  actions: ReviewActions;
  initialLimit?: number;
  filterDate?: string | null;
  onClearFilter?: () => void;
  emptyLabel?: string;
}) {
  const { signed } = useMoney();
  const [showAll, setShowAll] = useState(false);

  const filtered = useMemo(
    () => (filterDate ? rows.filter((r) => r.entry.date === filterDate) : rows),
    [rows, filterDate],
  );
  const visible = showAll ? filtered : filtered.slice(0, initialLimit);

  if (rows.length === 0) {
    return (
      <Card>
        <p className="text-[14px] text-muted">{emptyLabel}</p>
      </Card>
    );
  }

  return (
    <Card pad={false} className="overflow-hidden">
      {filterDate && (
        <div className="flex items-center justify-between border-b border-line-soft bg-well/60 px-5 py-2 text-[12.5px] sm:px-6">
          <span className="text-muted">
            Showing <b className="font-semibold text-ink">{weekdayShort(filterDate)} · {formatDateMedium(filterDate)}</b> ({filtered.length})
          </span>
          {onClearFilter && (
            <button type="button" onClick={onClearFilter} className="font-medium text-gold-deep hover:underline dark:text-gold">
              Show all
            </button>
          )}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="px-5 py-6 text-[13.5px] text-muted sm:px-6">No trades taken on {formatDateMedium(filterDate!)}.</p>
      ) : (
        <ul className="divide-y divide-line-soft/80">
          {visible.map((r) => (
            <li key={r.entry.id}>
              <button
                type="button"
                onClick={() => {
                  haptic.selection();
                  actions.openTrade(r.entry.id);
                }}
                className="flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left outline-none transition-colors hover:bg-ink/[0.025] active:bg-ink/[0.05] focus-visible:bg-ink/[0.04] sm:px-6"
              >
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:gap-3">
                  <span className="w-20 shrink-0 text-[13px] font-medium tabular-nums text-ink">{formatDateMedium(r.entry.date)}</span>
                  <DirTag dir={r.entry.direction ?? null} />
                  {r.entry.instrument && r.entry.instrument !== "—" && (
                    <span className="text-[13px] font-semibold text-ink">{r.entry.instrument}</span>
                  )}
                  {r.entry.setup && r.entry.setup !== "—" && (
                    <span className="truncate text-[13px] text-muted">{r.entry.setup}</span>
                  )}
                  {r.entry.images.length > 0 && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-ink/[0.05] px-2 py-0.5 text-[11px] font-medium text-muted" title="Has screenshot">
                      <Sym name="photo" className="h-3 w-3" />
                      {r.entry.images.length}
                    </span>
                  )}
                  {r.primary !== "—" && (
                    <span
                      className={cn(
                        "hidden items-center gap-1.5 text-[12px] sm:inline-flex",
                        r.primary === "Correct execution" ? "text-profit" : "text-loss",
                      )}
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                      {r.primary}
                    </span>
                  )}
                </div>

                <div className="flex shrink-0 items-center gap-3">
                  {r.entry.rr != null && (
                    <span className={cn("hidden text-[12.5px] font-medium tabular-nums sm:inline", tone(r.entry.rr))}>
                      {fmtR(r.entry.rr)}
                    </span>
                  )}
                  <span className={cn("min-w-[68px] text-right text-[14px] font-semibold tabular-nums", tone(r.entry.pnl))}>
                    {signed(r.entry.pnl)}
                  </span>
                  <GradeBadge grade={r.grade} />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {filtered.length > initialLimit && (
        <div className="border-t border-line-soft px-5 py-2.5 sm:px-6">
          <button
            type="button"
            onClick={() => {
              haptic.selection();
              setShowAll((v) => !v);
            }}
            className="flex w-full items-center justify-between py-0.5 text-left text-[13px] font-medium text-muted outline-none transition-colors hover:text-ink"
          >
            <span>{showAll ? "Show fewer trades" : `Show all ${filtered.length} trades`}</span>
            <Sym name="chevronDown" className={cn("h-4 w-4 transition-transform duration-300", showAll && "rotate-180")} strokeWidth={2} />
          </button>
        </div>
      )}
    </Card>
  );
}
