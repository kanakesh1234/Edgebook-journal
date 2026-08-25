"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store";
import { useImageUrls } from "@/lib/hooks";
import { checklistItems, checklistScore } from "@/lib/types";
import { formatDateFull, formatSignedMoney, weekdayShort } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Lightbox } from "@/components/ui/lightbox";
import { TradeReviewFlow } from "@/components/journal/trade-review-flow";
import { cn } from "@/lib/utils";
import { useState } from "react";
import {
  ArrowLeftIcon,
  CheckIcon,
  ImageIcon,
  PencilIcon,
  SparklesIcon,
  XIcon,
} from "@/components/ui/icons";

const REVIEW_LABEL: Record<string, { label: string; cls: string }> = {
  not_reviewed: { label: "NOT REVIEWED", cls: "border-line-strong bg-raised text-faint" },
  in_progress: { label: "REVIEW IN PROGRESS", cls: "border-gold/40 bg-gold/[0.08] text-gold" },
  reviewed: { label: "REVIEWED", cls: "border-profit/40 bg-profit/[0.08] text-profit" },
  incomplete: { label: "REVIEW INCOMPLETE", cls: "border-loss/40 bg-loss/[0.08] text-loss" },
};

/** Trade Review — the dedicated full review page for a single trade. */
export default function TradeReviewPage() {
  const router = useRouter();
  const id = typeof window !== "undefined" ? window.location.pathname.split("/").pop() : "";
  const entries = useApp((s) => s.entries);
  const settings = useApp((s) => s.settings);
  const challenges = settings.challenges ?? [];
  const entry = useMemo(() => entries.find((e) => e.id === id), [entries, id]);
  const urls = useImageUrls(entry?.images.map((i) => i.id) ?? []);

  const [zoomed, setZoomed] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);

  if (!entry) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="text-center">
          <p className="text-sm text-muted">Trade not found.</p>
          <Button variant="subtle" size="sm" className="mt-4" onClick={() => router.push("/calendar")}>
            Back to calendar
          </Button>
        </div>
      </div>
    );
  }

  const challenge = challenges.find((c) => c.id === entry.challengeId);
  const status = REVIEW_LABEL[entry.reviewStatus ?? "not_reviewed"];
  const checklist = entry.checklist ? checklistItems(entry.checklist) : [];
  const score = entry.checklist ? checklistScore(entry.checklist) : null;
  const d = new Date(entry.date + "T00:00:00");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link href="/calendar" className="group flex items-center gap-1.5 text-xs font-medium text-muted transition-colors hover:text-ink">
            <ArrowLeftIcon className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5" />
            Calendar
          </Link>
          <h1 className="mt-2 font-display text-2xl font-semibold tracking-[-0.02em] text-ink">
            {entry.instrument !== "—" ? entry.instrument : entry.setup || "Trade Review"}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {formatDateFull(entry.date)} · {weekdayShort(entry.date)}
            {entry.entryTime && <> · entry {entry.entryTime}</>}
            {entry.exitTime && <> · exit {entry.exitTime}</>}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <p
            className={cn(
              "kpi text-4xl leading-none",
              entry.pnl > 0 ? "text-profit" : entry.pnl < 0 ? "text-loss" : "text-ink",
            )}
            aria-label={`P&L ${formatSignedMoney(entry.pnl, settings.currency)}`}
          >
            {formatSignedMoney(entry.pnl, settings.currency)}
          </p>
          <span className={cn("rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-wide", status.cls)}>
            {status.label}
          </span>
        </div>
      </header>

      {/* Details grid */}
      <section className="panel grid grid-cols-2 gap-px overflow-hidden sm:grid-cols-4" aria-label="Trade details">
        {([
          ["Direction", entry.direction ?? "—"],
          ["Setup", entry.setup || "—"],
          ["R multiple", entry.rr != null ? `${entry.rr}R` : "—"],
          ["Trade #", entry.tradeNumber ? `#${entry.tradeNumber}` : "—"],
          ["Entry", entry.entryPrice != null ? String(entry.entryPrice) : "—"],
          ["Exit", entry.exitPrice != null ? String(entry.exitPrice) : "—"],
          ["Stop loss", entry.stopLoss != null ? String(entry.stopLoss) : "—"],
          ["Take profit", entry.takeProfit != null ? String(entry.takeProfit) : "—"],
        ] as const).map(([label, value]) => (
          <div key={label} className="bg-surface px-4 py-3.5">
            <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-faint">{label}</p>
            <p className={cn("mt-1 truncate text-sm font-medium capitalize", label === "Direction" && entry.direction ? (entry.direction === "long" ? "text-profit" : "text-loss") : "text-ink")}>
              {value}
            </p>
          </div>
        ))}
      </section>

      {/* Challenge + notes */}
      <section className="panel space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Challenge</p>
            <p className="mt-1 text-sm font-medium text-ink">{challenge?.name ?? "No challenge"}</p>
          </div>
          {entry.rr != null && (
            <span className="rounded-full border border-info/25 bg-info/[0.06] px-2.5 py-1 text-xs font-semibold text-info">
              {entry.rr > 0 ? "+" : ""}{entry.rr}R
            </span>
          )}
        </div>
        {entry.notes && (
          <blockquote className="rounded-xl border-l-2 border-gold/50 bg-raised/50 py-3 pl-4 pr-4 text-sm leading-relaxed text-muted">
            {entry.notes}
          </blockquote>
        )}
      </section>

      {/* Screenshots */}
      <section className="panel p-5" aria-label="Screenshots">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Screenshot evidence</p>
          <span className={cn("text-xs", entry.images.length > 0 ? "text-profit" : "text-loss")}>
            {entry.images.length > 0 ? `${entry.images.length} attached` : "none — review incomplete"}
          </span>
        </div>
        {entry.images.length === 0 ? (
          <div className="flex aspect-[16/7] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-raised/30 text-faint">
            <ImageIcon className="h-5 w-5" />
            <p className="text-xs">No screenshots attached</p>
          </div>
        ) : (
          <div className={cn("grid gap-3", entry.images.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2")}>
            {entry.images.map((img, i) => (
              <button
                key={img.id}
                onClick={() => { const u = urls[img.id]; if (u) setZoomed(u); }}
                disabled={!urls[img.id]}
                className="group relative aspect-[16/10] overflow-hidden rounded-xl border border-line-strong bg-canvas"
                aria-label={`Open screenshot ${i + 1} full screen`}
              >
                {urls[img.id] ? (
                  <img src={urls[img.id]!} alt={img.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" />
                ) : (
                  <span className="grid h-full place-items-center"><span className="h-5 w-5 animate-spin rounded-full border-2 border-line-strong border-t-gold" /></span>
                )}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Checklist */}
      {checklist.length > 0 && (
        <section className="panel p-5" aria-label="Execution checklist">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-faint">
              Execution checklist — trade #{entry.checklist?.tradeNumber ?? 1}
            </p>
            <span className={cn("num text-sm font-semibold", score!.confirmed === score!.required ? "text-profit" : "text-gold")}>
              {score!.confirmed} / {score!.required}
            </span>
          </div>
          <ul className="space-y-1.5">
            {checklist.map(({ id, label, item }) => (
              <li key={id} className="flex items-start gap-2.5 text-[13px]">
                <span className={cn(
                  "mt-0.5 grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full border text-[9px]",
                  item.answer === true ? "border-profit bg-profit/[0.12] text-profit" : item.answer === false ? "border-loss bg-loss/[0.1] text-loss" : "border-line-strong text-faint",
                )}>
                  {item.answer === true ? <CheckIcon className="h-3 w-3" /> : item.answer === false ? <XIcon className="h-3 w-3" /> : "·"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn(item.answer === false ? "text-loss" : "text-ink")}>{label}</span>
                  {item.note && <span className="block text-xs text-faint">{item.note}</span>}
                </span>
              </li>
            ))}
          </ul>
          {score!.confirmed < score!.required && (
            <p className="mt-3 rounded-lg border border-gold/30 bg-gold/[0.06] px-3.5 py-2.5 text-[12.5px] text-ink">
              <strong className="text-gold">Process status: RULE VIOLATION.</strong> An incomplete
              checklist is not an A+ setup — record what this trade taught you.
            </p>
          )}
        </section>
      )}

      {/* Review data */}
      {(entry.review || entry.reflection) && (
        <section className="panel space-y-4 p-5" aria-label="Review notes">
          <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Review</p>
          {entry.review?.setup && (
            <ReviewRows title="Setup" rows={[
              ["Liquidity swept", entry.review.setup.liquiditySwept],
              ["Sweep timestamp", entry.review.setup.sweepTimestamp],
              ["SMT evidence", entry.review.setup.smtEvidence],
              ["Target", entry.review.setup.targetDescription],
              ["Manipulation", entry.review.setup.manipulationIdentified],
            ]} />
          )}
          {entry.review?.execution && (
            <ReviewRows title="Execution" rows={[
              ["Why entered", entry.review.execution.whyEntered],
              ["Planned", boolText(entry.review.execution.planned)],
              ["Correct time", boolText(entry.review.execution.correctTime)],
              ["Followed stop", boolText(entry.review.execution.followedStop)],
              ["Moved stop", boolText(entry.review.execution.movedStop)],
              ["Exit early", boolText(entry.review.execution.exitedEarly)],
              ["Chased", boolText(entry.review.execution.chased)],
            ]} />
          )}
          {entry.review?.psychology && (
            <ReviewRows title="Psychology" rows={[
              ["Emotion before", entry.review.psychology.emotionBefore],
              ["State", entry.review.psychology.convictionOrUrgency],
              ["FOMO", boolText(entry.review.psychology.fomo)],
              ["Revenge", boolText(entry.review.psychology.revenge)],
              ["Fear exit", boolText(entry.review.psychology.fearExit)],
              ["Needed to make it back", boolText(entry.review.psychology.makeItBack)],
              ["Notes", entry.review.psychology.notes],
            ]} />
          )}
          {entry.review?.outcome && (
            <ReviewRows title="Outcome / process" rows={[
              ["Followed plan", boolText(entry.review.outcome.followedPlan)],
              ["Good trade despite loss", boolText(entry.review.outcome.goodTradeDespiteLoss)],
              ["Bad trade despite win", boolText(entry.review.outcome.badTradeDespiteWin)],
              ["Notes", entry.review.outcome.notes],
            ]} />
          )}
          {entry.reflection && (
            <ReviewRows title="Reflection" rows={[
              ["Went well", entry.reflection.wentWell],
              ["Didn't go well", entry.reflection.wentPoorly],
              ["Cause", entry.reflection.cause],
              ["Lesson", entry.reflection.lesson],
            ]} />
          )}
          {entry.review?.postLossGate && (
            <ReviewRows title="Post-loss gate" rows={[
              ["Emotional state", entry.review.postLossGate.emotionalState],
              ["Immediate thoughts", entry.review.postLossGate.immediateThoughts],
              ["FOMO", boolText(entry.review.postLossGate.fomo)],
              ["Revenge", boolText(entry.review.postLossGate.revenge)],
              ["Urgency", boolText(entry.review.postLossGate.urgency)],
              ["Intended next action", entry.review.postLossGate.intendedNextAction],
            ]} />
          )}
        </section>
      )}

      {/* Actions */}
      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-2.5 rounded-control border border-line bg-surface/95 p-3 shadow-lift backdrop-blur">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`/compare/${entry.id}`)}
          disabled={entry.images.length === 0}
          title="Compare this trade's own charts"
        >
          Compare
        </Button>
        <div className="flex gap-2.5">
          <Button variant="outline" size="sm" onClick={() => setReviewing(true)}>
            <SparklesIcon className="h-3.5 w-3.5" />
            {entry.reviewStatus === "reviewed" ? "Edit review" : entry.reviewStatus && entry.reviewStatus !== "not_reviewed" ? "Continue review" : "Start review"}
          </Button>
          <Button variant="subtle" size="sm" onClick={() => router.push("/calendar")}>Done</Button>
        </div>
      </div>

      {/* Full-screen screenshot viewer */}
      <Lightbox src={zoomed} onClose={() => setZoomed(null)} alt="Trade screenshot" />

      {/* Guided review */}
      <TradeReviewFlow open={reviewing} entry={entry} onClose={() => setReviewing(false)} />
    </div>
  );
}

function boolText(v: boolean | null | undefined): string {
  return v === true ? "Yes" : v === false ? "No" : "—";
}

function ReviewRows({ title, rows }: { title: string; rows: [string, string | undefined][] }) {
  const filled = rows.filter(([, v]) => v != null && v !== "" && v !== "—");
  if (filled.length === 0) return null;
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">{title}</p>
      <dl className="space-y-1.5">
        {filled.map(([k, v]) => (
          <div key={k} className="flex gap-3 text-[13px]">
            <dt className="w-32 shrink-0 text-faint">{k}</dt>
            <dd className="min-w-0 flex-1 whitespace-pre-wrap text-ink">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
