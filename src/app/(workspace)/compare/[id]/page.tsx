"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store";
import { useImageUrls } from "@/lib/hooks";
import { checklistScore } from "@/lib/types";
import { formatDateFull, formatSignedMoney, weekdayShort } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { TextArea } from "@/components/ui/input";
import { XIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/toast";

/**
 * Compare — strictly contextual to the CURRENT trade.
 * Shows ONLY this trade's attached screenshots, vertically, with a
 * dismissible NY entry-time overlay and the trade's metadata + insight
 * capture at the bottom. No second-trade selection exists here.
 */
export default function TradeComparePage() {
  const router = useRouter();
  const id = typeof window !== "undefined" ? window.location.pathname.split("/").pop() : "";
  const entries = useApp((s) => s.entries);
  const settings = useApp((s) => s.settings);
  const challenges = settings.challenges ?? [];
  const entry = useMemo(() => entries.find((e) => e.id === id), [entries, id]);
  const urls = useImageUrls(entry?.images.map((i) => i.id) ?? []);

  const [selected, setSelected] = useState<string[] | null>(null); // which of the trade's own screenshots to compare
  const [showTimestamp, setShowTimestamp] = useState(true);
  const [insight, setInsight] = useState(entry?.review?.compareInsight ?? "");
  const [saving, setSaving] = useState(false);

  if (!entry) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="text-center">
          <p className="text-sm text-muted">Trade not found.</p>
          <Link href="/calendar" className="mt-4 inline-block text-sm font-medium text-gold">Back to calendar</Link>
        </div>
      </div>
    );
  }

  const imageIds = entry.images.map((i) => i.id);
  // Compare set: user-chosen subset of THIS trade's screenshots (max 2), else first two.
  const effective = (selected ?? imageIds.slice(0, 2)).filter((id) => imageIds.includes(id));
  const challenge = challenges.find((c) => c.id === entry.challengeId);
  const score = entry.checklist ? checklistScore(entry.checklist) : null;
  const d = new Date(entry.date + "T00:00:00");
  const nyTime = entry.entryTime
    ? new Date(`2000-01-01T${entry.entryTime}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    : null;

  const saveInsight = async () => {
    setSaving(true);
    try {
      await useApp.getState().saveTradeReview(entry.id, {
        review: { compareInsight: insight.trim() || undefined },
      });
      toast.success("Insight saved", "MINATO can learn from this comparison.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-dvh bg-canvas">
      {/* Slim header */}
      <header className="sticky top-0 z-20 flex items-center justify-between border-b border-line bg-canvas/95 px-5 py-3 backdrop-blur">
        <div>
          <p className="font-display text-sm font-semibold text-ink">Compare — {entry.instrument}</p>
          <p className="text-[11px] text-faint">{entry.setup || "This trade's own charts"} · vertical review</p>
        </div>
        <Link
          href={`/review/${entry.id}`}
          className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:text-ink"
        >
          <XIcon className="h-3.5 w-3.5" />
          Exit compare
        </Link>
      </header>

      <main className="mx-auto max-w-5xl px-5 pb-16">
        {effective.length === 0 ? (
          <div className="pt-16 text-center">
            <p className="text-sm text-muted">This trade has no screenshots yet.</p>
            <Link href={`/review/${entry.id}`} className="mt-3 inline-block text-sm font-medium text-gold">Add evidence in the review →</Link>
          </div>
        ) : (
          <>
            {/* Screenshot 1 */}
            <ShotBlock
              index={0}
              src={urls[effective[0]] ?? null}
              name={entry.images.find((i) => i.id === effective[0])?.name}
              timestamp={showTimestamp && nyTime ? { label: "ENTRY", time: `${nyTime} NY` } : null}
              onDismissTimestamp={() => setShowTimestamp(false)}
            />

            {/* Small spacing — vertical scroll, minimal whitespace */}
            <div className="h-6" aria-hidden />

            {/* Screenshot 2 (or prompt if the trade only has one of its own) */}
            {effective.length > 1 ? (
              <ShotBlock index={1} src={urls[effective[1]] ?? null} name={entry.images.find((i) => i.id === effective[1])?.name} />
            ) : (
              <div className="rounded-xl border border-dashed border-line-strong px-6 py-10 text-center">
                <p className="text-sm text-muted">
                  This trade has only one attached screenshot — add a second in the trade review to
                  compare entry vs exit.
                </p>
              </div>
            )}

            {/* Own-screenshot chooser (only when >2 exist) */}
            {imageIds.length > 2 && (
              <div className="mt-4 rounded-xl border border-line bg-raised/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-faint">Choose which of this trade's charts to compare</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {entry.images.map((img, i) => {
                    const on = effective.includes(img.id);
                    return (
                      <button
                        key={img.id}
                        onClick={() =>
                          setSelected(() => {
                            const base = selected ?? imageIds.slice(0, 2);
                            if (on) return base.filter((x) => x !== img.id);
                            return [...base.slice(-1), img.id];
                          })
                        }
                        aria-pressed={on}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                          on ? "border-gold/50 bg-gold/[0.1] text-gold" : "border-line bg-raised text-muted hover:text-ink",
                        )}
                      >
                        Chart {i + 1}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Metadata — current trade only */}
            <section className="panel mt-8 p-5 sm:p-6" aria-label="Trade metadata">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-faint">Trade</p>
                  <h2 className="mt-1 font-display text-xl font-semibold text-ink">
                    {entry.instrument !== "—" ? entry.instrument : entry.setup || "Session"}
                  </h2>
                  <p className="mt-0.5 text-xs text-muted">
                    {formatDateFull(entry.date)} · {weekdayShort(entry.date)}
                  </p>
                </div>
                <p className={cn("kpi text-4xl leading-none", entry.pnl > 0 ? "text-profit" : entry.pnl < 0 ? "text-loss" : "text-ink")}>
                  {formatSignedMoney(entry.pnl, settings.currency)}
                </p>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-line pt-4 text-[13px] sm:grid-cols-3">
                <Meta label="Entry time" value={entry.entryTime ? `${entry.entryTime} NY` : "Not recorded"} />
                <Meta label="Exit time" value={entry.exitTime ? `${entry.exitTime} NY` : "Not recorded"} />
                <Meta label="Direction" value={entry.direction ?? "Not recorded"} />
                <Meta label="Playbook" value={entry.setup || "Not recorded"} />
                <Meta label="Challenge" value={challenge?.name ?? "No challenge"} />
                <Meta label="Entry price" value={entry.entryPrice != null ? String(entry.entryPrice) : "Not recorded"} />
                <Meta label="Stop" value={entry.stopLoss != null ? String(entry.stopLoss) : "Not recorded"} />
                <Meta label="Target" value={entry.takeProfit != null ? String(entry.takeProfit) : "Not recorded"} />
                <Meta label="R multiple" value={entry.rr != null ? `${entry.rr}R` : "Not recorded"} />
                <Meta label="Review status" value={entry.reviewStatus === "reviewed" ? "Reviewed" : entry.reviewStatus === "in_progress" ? "In progress" : entry.reviewStatus === "incomplete" ? "Incomplete" : "Not reviewed"} />
                <Meta label="Rule adherence" value={score ? `${score.confirmed}/${score.required}` : "Not recorded"} />
                <Meta label="Date" value={entry.date} />
              </dl>
            </section>

            {/* Any insights? */}
            <section className="panel mt-4 p-5 sm:p-6" aria-label="Comparison insights">
              <p className="text-sm font-semibold text-ink">Any insights from this comparison?</p>
              <p className="mt-1 text-xs text-muted">What changed, what you noticed, what you'd do differently — saved to this trade's review for MINATO.</p>
              <TextArea
                aria-label="Comparison insights"
                className="mt-3 min-h-24"
                placeholder="e.g. Same sweep, but here the SMT confirmed before the displacement — entry was cleaner…"
                value={insight}
                maxLength={2000}
                onChange={(e) => setInsight(e.target.value)}
              />
              <div className="mt-3 flex justify-end">
                <Button variant="gold" size="sm" onClick={() => void saveInsight()} loading={saving} disabled={saving || !insight.trim()}>
                  Save insight
                </Button>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-[0.08em] text-faint">{label}</dt>
      <dd className="mt-0.5 font-medium text-ink">{value}</dd>
    </div>
  );
}

function ShotBlock({
  index,
  src,
  name,
  timestamp,
  onDismissTimestamp,
}: {
  index: number;
  src: string | null;
  name?: string;
  timestamp?: { label: string; time: string } | null;
  onDismissTimestamp?: () => void;
}) {
  return (
    <section aria-label={`Chart ${index + 1}`}>
      <div className="relative">
        {src ? (
          <div className="max-h-[88dvh] overflow-y-auto rounded-xl border border-line-strong bg-canvas">
            <img src={src} alt={name ?? `Chart ${index + 1}`} className="w-full object-contain" />
          </div>
        ) : (
          <div className="grid aspect-[16/9] place-items-center rounded-xl border border-line bg-raised/40">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-line-strong border-t-gold" />
          </div>
        )}

        {/* Timestamp overlay — UI-level only, underlying screenshot untouched */}
        {timestamp && (
          <div className="absolute left-3 top-3 flex items-center gap-2 rounded-lg border border-gold/40 bg-canvas/95 px-3 py-1.5 shadow-lift">
            <span className="text-[11px] font-bold uppercase tracking-wide text-gold">{timestamp.label}</span>
            <span className="num text-sm font-semibold text-ink">{timestamp.time}</span>
            {onDismissTimestamp && (
              <button
                onClick={onDismissTimestamp}
                aria-label="Dismiss timestamp overlay"
                className="ml-1 grid h-5 w-5 place-items-center rounded text-faint transition-colors hover:bg-ink/[0.06] hover:text-ink"
              >
                <XIcon className="h-3 w-3" />
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
