"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { JournalEntry } from "@/lib/types";
import { formatDateFull, formatSignedMoney, relativeDayLabel } from "@/lib/format";
import { useImageUrls } from "@/lib/hooks";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Lightbox } from "@/components/ui/lightbox";
import { Pill } from "@/components/ui/misc";
import { ReflectionFlow } from "./reflection-flow";
import {
  CheckIcon,
  ImageIcon,
  PencilIcon,
  SparklesIcon,
  TrashIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  XIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export function EntryDetailModal({
  open,
  onClose,
  entry,
  onEdit,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  entry: JournalEntry | null;
  onEdit?: (entry: JournalEntry) => void;
  onDelete?: (entry: JournalEntry) => void;
}) {
  const [zoomed, setZoomed] = useState<string | null>(null);
  const [reflecting, setReflecting] = useState(false);
  const urls = useImageUrls(entry?.images.map((i) => i.id) ?? []);

  return (
    <>
      <Modal open={open && !!entry} onClose={onClose} size="lg" label="Journal entry">
        {entry && <DetailBody entry={entry} urls={urls} onZoom={setZoomed} onReflect={() => setReflecting(true)} />}
        {(onEdit || onDelete) && entry && (
          <div className="flex items-center justify-end gap-2.5 border-t border-line bg-surface px-6 py-4">
            {onDelete && (
              <Button variant="ghost" className="text-loss hover:bg-loss/10" onClick={() => onDelete(entry)}>
                <TrashIcon className="h-4 w-4" />
                Delete
              </Button>
            )}
            {onEdit && (
              <Button variant="outline" onClick={() => setReflecting(true)}>
                <SparklesIcon className="h-3.5 w-3.5" />
                {entry.reflection ? "Edit reflection" : "Add reflection"}
              </Button>
            )}
            {onEdit && (
              <Button variant="outline" onClick={() => onEdit(entry)}>
                <PencilIcon className="h-3.5 w-3.5" />
                Edit entry
              </Button>
            )}
          </div>
        )}
      </Modal>

      <Lightbox src={zoomed} onClose={() => setZoomed(null)} alt="Trade screenshot" />

      <ReflectionFlow open={reflecting && !!entry} entry={entry} onClose={() => setReflecting(false)} />
    </>
  );
}

function DetailBody({
  entry,
  urls,
  onZoom,
  onReflect,
}: {
  entry: JournalEntry;
  urls: Record<string, string | null>;
  onZoom: (url: string) => void;
  onReflect: () => void;
}) {
  const rel = relativeDayLabel(entry.date);
  return (
    <div className="px-6 py-6">
      {/* Title row */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          {rel && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">{rel}</p>
          )}
          <h2 className="mt-0.5 font-display text-xl font-bold tracking-tight text-ink">
            {formatDateFull(entry.date)}
          </h2>
        </div>
        <motion.p
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 300, damping: 20 }}
          className={cn(
            "kpi rounded-xl border px-3.5 py-2 text-lg",
            entry.pnl > 0
              ? "border-profit/30 bg-profit/[0.08] text-profit"
              : entry.pnl < 0
                ? "border-loss/30 bg-loss/[0.08] text-loss"
                : "border-line bg-raised text-muted",
          )}
        >
          {formatSignedMoney(entry.pnl)}
        </motion.p>
      </div>

      {/* Meta chips */}
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {entry.instrument !== "—" && <Pill className="font-mono !text-ink">{entry.instrument}</Pill>}
        {entry.direction && (
          <Pill
            className={cn(
              entry.direction === "long" ? "!border-profit/25 !text-profit" : "!border-loss/25 !text-loss",
            )}
          >
            {entry.direction === "long" ? (
              <TrendingUpIcon className="h-3 w-3" />
            ) : (
              <TrendingDownIcon className="h-3 w-3" />
            )}
            {entry.direction}
          </Pill>
        )}
        {entry.rr != null && (
          <Pill className="font-mono !text-info">
            {entry.rr > 0 ? "+" : ""}
            {entry.rr}R
          </Pill>
        )}
        {entry.setup && (
          <Pill className="!border-gold/25 !text-gold">
            {entry.setup}
          </Pill>
        )}
      </div>

      {/* Notes */}
      {entry.notes ? (
        <blockquote className="mt-6 rounded-xl border-l-2 border-gold/50 bg-raised/50 py-3.5 pl-4 pr-4 text-sm leading-relaxed text-muted">
          {entry.notes}
        </blockquote>
      ) : null}

      {/* Reflection */}
      {entry.reflection ? (
        <section className="mt-6" aria-label="Reflection">
          <p className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.1em] text-faint">Reflection</p>
          <div className="space-y-3 rounded-xl border border-gold/20 bg-gold/[0.04] p-4">
            {entry.reflection.wentWell && (
              <ReflectionRow label="Went well" text={entry.reflection.wentWell} tone="text-profit" />
            )}
            {entry.reflection.wentPoorly && (
              <ReflectionRow label="Didn't go well" text={entry.reflection.wentPoorly} tone="text-loss" />
            )}
            {entry.reflection.cause && (
              <ReflectionRow label="Cause" text={entry.reflection.cause} tone="text-gold" />
            )}
            <div className="flex flex-wrap gap-2">
              {entry.reflection.followedSetup != null && (
                <ProcessChip label="Setup followed" ok={entry.reflection.followedSetup} />
              )}
              {entry.reflection.followedRisk != null && (
                <ProcessChip label="Risk respected" ok={entry.reflection.followedRisk} />
              )}
            </div>
            {entry.reflection.lesson && (
              <ReflectionRow label="Next time" text={entry.reflection.lesson} tone="text-ink" />
            )}
          </div>
        </section>
      ) : (
        <button
          onClick={onReflect}
          className="group mt-6 flex w-full items-center gap-3 rounded-xl border border-dashed border-line-strong px-4 py-3.5 text-left transition-colors hover:border-gold/50"
        >
          <SparklesIcon className="h-4 w-4 shrink-0 text-gold" />
          <span className="text-sm text-muted transition-colors group-hover:text-ink">
            Review this trade — what worked, what didn't, and the one change for next time.
          </span>
        </button>
      )}

      {/* Screenshots */}
      <section className="mt-6" aria-label="Screenshots">
        <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-faint">Screenshots</p>
        {entry.images.length === 0 ? (
          <div className="flex aspect-[16/7] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong bg-raised/30 text-faint">
            <ImageIcon className="h-5 w-5" />
            <p className="text-xs">No screenshots attached</p>
          </div>
        ) : (
          <div
            className={cn(
              "grid gap-3",
              entry.images.length === 1 ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2",
            )}
          >
            <AnimatePresence mode="popLayout">
              {entry.images.map((img, i) => {
                const url = urls[img.id];
                return (
                  <motion.button
                    key={img.id}
                    layout
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08, duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                    onClick={() => url && onZoom(url)}
                    disabled={!url}
                    className="group relative aspect-[16/10] overflow-hidden rounded-xl border border-line-strong bg-canvas"
                    aria-label={`View screenshot ${i + 1}`}
                  >
                    {url ? (
                      <img
                        src={url}
                        alt={img.name}
                        draggable={false}
                        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      />
                    ) : (
                      <span className="grid h-full place-items-center">
                        <span className="h-5 w-5 animate-spin rounded-full border-2 border-line-strong border-t-gold" />
                      </span>
                    )}
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2.5 pt-8 text-left opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                      <span className="font-mono text-[10px] text-white/80">Click to enlarge</span>
                    </span>
                  </motion.button>
                );
              })}
            </AnimatePresence>
          </div>
        )}
      </section>
    </div>
  );
}

function ReflectionRow({ label, text, tone }: { label: string; text: string; tone: string }) {
  return (
    <div>
      <p className={cn("text-[11px] font-semibold uppercase tracking-[0.08em]", tone)}>{label}</p>
      <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{text}</p>
    </div>
  );
}

function ProcessChip({ label, ok }: { label: string; ok: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium",
        ok ? "border-profit/30 bg-profit/[0.08] text-profit" : "border-loss/30 bg-loss/[0.08] text-loss",
      )}
    >
      {ok ? <CheckIcon className="h-3 w-3" /> : <XIcon className="h-3 w-3" />}
      {label}
    </span>
  );
}
