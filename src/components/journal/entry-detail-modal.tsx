"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { checklistItems, checklistScore, reviewStatusOf, type JournalEntry } from "@/lib/types";
import { formatDateFull, formatSignedMoney, relativeDayLabel } from "@/lib/format";
import { useImageUrls } from "@/lib/hooks";
import { Lightbox } from "@/components/ui/lightbox";
import { ReflectionFlow } from "./reflection-flow";
import { Sym } from "./symbols";
import { IconButton } from "./journal-ui";
import { cn } from "@/lib/utils";

const STATUS: Record<string, string> = { reviewed: "Reviewed", in_progress: "Review in progress", incomplete: "Review incomplete", not_reviewed: "Not reviewed" };
const tone = (n: number) => (n > 0 ? "text-profit" : n < 0 ? "text-loss" : "text-muted");

/**
 * Trade sheet. Evidence (the chart) on the left, the story on the right; one fixed toolbar on top
 * so the title bar never scrolls away. Same props and data as before.
 */
export function EntryDetailModal({
  open, onClose, entry, onEdit, onDelete, position, onStep,
}: {
  position?: { index: number; total: number };
  /** Step through the list the trade was opened from (1 = next in the visible order). */
  onStep?: (dir: 1 | -1) => void;
  open: boolean;
  onClose: () => void;
  entry: JournalEntry | null;
  onEdit?: (entry: JournalEntry) => void;
  onDelete?: (entry: JournalEntry) => void;
}) {
  const [zoomed, setZoomed] = useState<string | null>(null);
  const [reflecting, setReflecting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const urls = useImageUrls(entry?.images.map((i) => i.id) ?? []);
  const visible = open && !!entry;
  const covered = !!zoomed || reflecting; // the lightbox / reflection flow take over the screen
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable || covered) return;
      if (e.key === "Escape") onClose();
      if (onStep && e.key === "ArrowRight") onStep(1);
      if (onStep && e.key === "ArrowLeft") onStep(-1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [visible, onStep, onClose, covered]);

  const hasImg = !!entry && entry.images.length > 0;
  const stepper = !!position && !!onStep && position.total > 1;

  const sheet = (
    <AnimatePresence>
      {visible && entry && (
        <motion.div
          key="sheet" role="dialog" aria-modal="true" aria-label="Journal entry"
          initial={{ opacity: 0 }} animate={{ opacity: covered ? 0 : 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }}
          transition={{ duration: 0.18 }}
          className={cn("fixed inset-0 z-50 grid place-items-center p-3 sm:p-8", covered && "pointer-events-none")}
        >
          <div onClick={onClose} className="absolute inset-0 bg-black/35 backdrop-blur-[3px]" />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, y: 6, transition: { duration: 0.14 } }}
            transition={{ type: "spring", stiffness: 380, damping: 34 }}
            className={cn(
              "relative flex max-h-full w-full flex-col overflow-hidden rounded-[22px] bg-surface shadow-[0_30px_80px_-20px_rgb(0_0_0/0.45),0_0_0_0.5px_rgb(0_0_0/0.12)]",
              hasImg ? "h-[min(88dvh,820px)] max-w-[1120px]" : "max-w-[560px]",
            )}
          >
            {/* Toolbar */}
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-line-soft px-2.5">
              <div className="flex items-center gap-0.5">
                {stepper && (
                  <>
                    <IconButton label="Previous trade" icon="chevronLeft" disabled={position.index === 0} onClick={() => onStep(-1)} />
                    <IconButton label="Next trade" icon="chevronRight" disabled={position.index >= position.total - 1} onClick={() => onStep(1)} />
                    <span className="num ml-2 text-[13px] text-faint">{position.index + 1} of {position.total}</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-0.5">
                {onEdit && <IconButton label="Edit entry" icon="pencil" onClick={() => onEdit(entry)} />}
                {onDelete && <IconButton label="Delete entry" icon="trash" onClick={() => onDelete(entry)} className="hover:!bg-loss/10 hover:!text-loss" />}
                <span className="mx-1 h-4 w-px bg-line-soft" />
                <IconButton label="Close" icon="xmark" onClick={onClose} />
              </div>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={entry.id} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }}
                transition={{ type: "spring", stiffness: 420, damping: 38 }}
                className={cn("min-h-0 flex-1 overflow-y-auto lg:overflow-hidden", hasImg && "lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(340px,1fr)]")}
              >
                {hasImg && <Evidence entry={entry} urls={urls} onZoom={setZoomed} />}
                <Story entry={entry} scroll={hasImg} onReflect={() => setReflecting(true)} canEdit={!!onEdit} />
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {mounted && createPortal(sheet, document.body)}
      <Lightbox src={zoomed} onClose={() => setZoomed(null)} alt="Trade screenshot" />
      <ReflectionFlow open={reflecting && !!entry} entry={entry} onClose={() => setReflecting(false)} />
    </>
  );
}

/** Left: the chart, shown whole (never cropped), with a quiet thumbnail strip. */
function Evidence({ entry, urls, onZoom }: { entry: JournalEntry; urls: Record<string, string | null>; onZoom: (url: string) => void }) {
  const [active, setActive] = useState(0);
  const img = entry.images[Math.min(active, entry.images.length - 1)];
  const url = img ? urls[img.id] : null;
  return (
    <section aria-label="Screenshots" className="flex min-h-[260px] flex-col bg-ink/[0.04] p-4 sm:p-6 lg:min-h-0">
      <button
        type="button" onClick={() => url && onZoom(url)} disabled={!url} aria-label="Enlarge screenshot"
        className="group relative grid min-h-0 flex-1 cursor-zoom-in place-items-center outline-none focus-visible:ring-2 focus-visible:ring-gold-strong/50"
      >
        {url ? (
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.img
              key={img.id} src={url} alt={img.name} draggable={false}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
              className="max-h-full max-w-full rounded-[10px] object-contain shadow-[0_6px_24px_-8px_rgb(0_0_0/0.3),0_0_0_0.5px_rgb(0_0_0/0.1)]"
            />
          </AnimatePresence>
        ) : (
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-line-strong border-t-gold" />
        )}
      </button>
      {entry.images.length > 1 && (
        <div className="mt-4 flex shrink-0 justify-center gap-2">
          {entry.images.map((im, i) => (
            <button
              key={im.id} type="button" onClick={() => setActive(i)} aria-label={`Screenshot ${i + 1}`} aria-current={i === active}
              className={cn("relative h-10 w-[60px] overflow-hidden rounded-[7px] outline-none transition-[opacity,box-shadow,transform] active:scale-95 focus-visible:ring-2 focus-visible:ring-gold-strong/50", i === active ? "opacity-100 ring-2 ring-gold-strong ring-offset-2 ring-offset-transparent" : "opacity-55 hover:opacity-100")}
            >
              {urls[im.id] && <img src={urls[im.id] as string} alt="" draggable={false} className="h-full w-full object-cover" />}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function Section({ title, aside, action, children }: { title: string; aside?: string; action?: { label: string; onClick: () => void }; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-ink">{title}</h3>
        <div className="flex items-baseline gap-3">{aside && <p className="text-[13px] text-muted">{aside}</p>}{action && <button type="button" onClick={action.onClick} className="text-[13px] font-medium text-gold transition-opacity hover:opacity-70">{action.label}</button>}</div>
      </div>
      {children}
    </section>
  );
}

/** Label / value rows separated by hairlines — the native "inset list" for facts. */
function Facts({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl>
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-4 border-b border-line-soft py-2">
          <dt className="text-[14px] text-muted">{k}</dt>
          <dd className="num text-right text-[14px] font-medium text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Story({ entry, scroll, onReflect, canEdit }: { entry: JournalEntry; scroll: boolean; onReflect: () => void; canEdit: boolean }) {
  const rel = relativeDayLabel(entry.date);
  const status = entry.reviewStatus ?? reviewStatusOf(entry);

  const figures = (
    [
      entry.entryPrice != null ? ["Entry", String(entry.entryPrice)] : null,
      entry.exitPrice != null ? ["Exit", String(entry.exitPrice)] : null,
      entry.stopLoss != null ? ["Stop", String(entry.stopLoss)] : null,
      entry.takeProfit != null ? ["Target", String(entry.takeProfit)] : null,
      entry.entryTime ? ["Time", entry.exitTime ? `${entry.entryTime} → ${entry.exitTime}` : entry.entryTime] : null,
      entry.holdDuration ? ["Held", entry.holdDuration] : null,
      entry.quantity != null ? ["Size", String(entry.quantity)] : null,
    ] as ([string, string] | null)[]
  ).filter((x): x is [string, string] => !!x);

  const rules: { label: string; ok: boolean | null }[] = entry.preTradeChecklist?.length
    ? entry.preTradeChecklist.map((i) => ({ label: i.label, ok: i.confirmed }))
    : entry.checklist ? checklistItems(entry.checklist).map((i) => ({ label: i.label, ok: i.item.answer })) : [];
  const ruleScore = entry.preTradeChecklist?.length
    ? { confirmed: entry.preTradeChecklist.filter((i) => i.confirmed).length, required: entry.preTradeChecklist.length }
    : entry.checklist ? checklistScore(entry.checklist) : null;

  const psy = entry.review?.psychology;
  const emotion = psy?.emotionBefore || entry.review?.postLossGate?.emotionalState;
  const flags = ([["FOMO", psy?.fomo], ["Revenge", psy?.revenge], ["Fear exit", psy?.fearExit], ["Make-it-back", psy?.makeItBack]] as [string, boolean | null | undefined][]).filter(([, v]) => v).map(([k]) => k);
  const verdictMap: Record<string, string> = { "a-plus": "A+ trade", "process-success": "Good process", "process-failure": "Process failure" };
  const verdict = entry.review?.outcome?.processVerdict ? verdictMap[entry.review.outcome.processVerdict] : null;
  const lesson = entry.reflection?.lesson || entry.review?.concepts?.improve || entry.review?.followUp?.watchNext;
  const hasResult = !!(entry.reflection || verdict || lesson);
  const mindset: [string, React.ReactNode][] = [
    ...(emotion ? [["Feeling", <span key="e" className="capitalize">{emotion}</span>] as [string, React.ReactNode]] : []),
    ...(psy?.convictionOrUrgency ? [["Drive", <span key="c" className="capitalize">{psy.convictionOrUrgency}</span>] as [string, React.ReactNode]] : []),
    ...(flags.length ? [["Flags", <span key="f" className="text-loss">{flags.join(", ")}</span>] as [string, React.ReactNode]] : []),
  ];
  const process: [string, React.ReactNode][] = [
    ...(entry.reflection?.followedSetup != null ? [["Followed setup", <span key="s" className={entry.reflection.followedSetup ? "text-profit" : "text-loss"}>{entry.reflection.followedSetup ? "Yes" : "No"}</span>] as [string, React.ReactNode]] : []),
    ...(entry.reflection?.followedRisk != null ? [["Respected risk", <span key="r" className={entry.reflection.followedRisk ? "text-profit" : "text-loss"}>{entry.reflection.followedRisk ? "Yes" : "No"}</span>] as [string, React.ReactNode]] : []),
  ];

  return (
    <div className={cn("space-y-9 px-7 pb-10 pt-7", scroll && "lg:h-full lg:overflow-y-auto")}>
      <header className="flex flex-col gap-5">
        <div className="min-w-0">
          <p className="text-[13px] text-muted">{rel ? `${rel}, ${formatDateFull(entry.date)}` : formatDateFull(entry.date)}</p>
          <h2 className="mt-1 text-[24px] font-semibold capitalize leading-tight tracking-[-0.025em] text-ink">
            {[entry.instrument !== "—" ? entry.instrument : null, entry.direction].filter(Boolean).join(" ") || "Trade"}
          </h2>
          <p className="mt-1 text-[14px] text-muted">
            {entry.setup && <span className="text-gold">{entry.setup}</span>}
            {entry.setup && " · "}
            {STATUS[status] ?? STATUS.not_reviewed}
          </p>
        </div>
        <div>
          <motion.p initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: "spring", stiffness: 320, damping: 24 }} className={cn("kpi text-[44px] leading-none tracking-[-0.03em] tabular-nums", tone(entry.pnl))}>
            {formatSignedMoney(entry.pnl)}
          </motion.p>
          {entry.rr != null && <p className="num mt-1.5 text-[14px] text-muted">{entry.rr > 0 ? "+" : ""}{entry.rr}R</p>}
        </div>
      </header>

      {figures.length > 0 && <Facts rows={figures} />}

      {entry.notes && <Section title="Notes"><p className="whitespace-pre-line text-[15px] leading-relaxed text-ink/90">{entry.notes}</p></Section>}

      {ruleScore && rules.length > 0 && (
        <Section title="Rules" aside={`${ruleScore.confirmed} of ${ruleScore.required} followed`}>
          <ul>
            {rules.map((r) => (
              <li key={r.label} className="flex items-start gap-2.5 border-b border-line-soft py-2 text-[14px] leading-snug last:border-0">
                <Sym name={r.ok === false ? "xmark" : "check"} strokeWidth={2.2} className={cn("mt-0.5 h-3.5 w-3.5", r.ok ? "text-profit" : r.ok === false ? "text-loss" : "text-faint/50")} />
                <span className={r.ok === false ? "text-muted" : "text-ink/90"}>{r.label}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(mindset.length > 0 || psy?.notes) && (
        <Section title="Mindset">
          {mindset.length > 0 && <Facts rows={mindset} />}
          {psy?.notes && <p className="mt-3 text-[14.5px] leading-relaxed text-muted">{psy.notes}</p>}
        </Section>
      )}

      {hasResult ? (
        <Section title="Result and lesson" aside={verdict ?? undefined} action={canEdit ? { label: "Edit", onClick: onReflect } : undefined}>
          <div className="space-y-3">
            {entry.reflection?.wentWell && <Reflect label="Went well" text={entry.reflection.wentWell} c="text-profit" />}
            {entry.reflection?.wentPoorly && <Reflect label="Didn't go well" text={entry.reflection.wentPoorly} c="text-loss" />}
            {entry.reflection?.cause && <Reflect label="Cause" text={entry.reflection.cause} c="text-gold" />}
          </div>
          {process.length > 0 && <div className="mt-3"><Facts rows={process} /></div>}
          {lesson && (
            <div className="mt-5 border-l-2 border-gold-strong pl-4">
              <p className="text-[13px] font-semibold text-gold">Next time</p>
              <p className="mt-0.5 text-[16px] font-medium leading-snug text-ink">{lesson}</p>
            </div>
          )}
        </Section>
      ) : (
        <button type="button" onClick={onReflect} className="group flex items-center gap-2 rounded-[10px] text-left text-[14.5px] font-medium text-gold outline-none transition-opacity hover:opacity-75 focus-visible:ring-2 focus-visible:ring-gold-strong/50">
          <Sym name="sparkles" className="h-4 w-4" />
          Review this trade: what worked, what didn’t, and one change for next time
        </button>
      )}
    </div>
  );
}

function Reflect({ label, text, c }: { label: string; text: string; c: string }) {
  return (
    <div>
      <p className={cn("text-[13px] font-semibold", c)}>{label}</p>
      <p className="mt-0.5 text-[14.5px] leading-relaxed text-ink/80">{text}</p>
    </div>
  );
}
