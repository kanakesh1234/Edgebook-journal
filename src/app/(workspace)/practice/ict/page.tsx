"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useApp } from "@/lib/store";
import { scopeToPrimary } from "@/lib/challenges";
import { useImageUrls } from "@/lib/hooks";
import { btn, btnPrimary } from "@/components/lessons/buttons";
import { ConfirmDialog } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toast";
import { ChevronLeftIcon, PencilIcon, PhotoIcon, PlusIcon, TrashIcon } from "@/components/practice/icons";
import { IctComposer } from "@/components/practice/ict-composer";
import { ModeBadge } from "@/components/practice/modes";
import "@/components/practice/practice.css";
import { hasFreshVariants } from "@/lib/practice/ict-cards";
import { hasChart } from "@/lib/practice/ict-trade-math";
import { deleteCard } from "@/lib/practice/ict-store";
import type { GameProgress, IctCard } from "@/lib/practice/progress-ext";
import { cn } from "@/lib/utils";

const pct = (c: IctCard) => ((c.seen ?? 0) > 0 ? Math.round(((c.correct ?? 0) / (c.seen ?? 1)) * 100) : null);

function Row({ card, thumb, onEdit, onDelete }: { card: IctCard; thumb: string | null; onEdit: () => void; onDelete: () => void }) {
  const acc = pct(card);
  return (
    <li className="ict-row">
      <button type="button" onClick={onEdit} className="flex min-w-0 flex-1 items-center gap-4 text-left" aria-label={`Edit: ${card.question}`}>
        <span className="ict-thumb">
          {thumb ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={thumb} alt="" className="h-full w-full object-cover" /> : <PhotoIcon className="h-5 w-5" />}
          {card.images.length > 1 && <span className="absolute bottom-1 right-1 rounded-full bg-black/60 px-1.5 text-[10px] font-semibold leading-4 tabular-nums text-white backdrop-blur">{card.images.length}</span>}
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-[15.5px] font-medium leading-snug tracking-[-0.012em] text-ink">{card.question}</span>
          <span className="mt-0.5 block truncate text-[13.5px] text-muted">{card.answer}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-faint">
            <span className="tabular-nums">{card.seen ? `Asked ${card.seen}×` : "Not played yet"}</span>
            {acc != null && <span className={cn("font-medium tabular-nums", acc >= 80 ? "text-profit" : acc < 50 ? "text-loss" : "")}>{acc}% right</span>}
            {hasFreshVariants(card) && <span className="font-medium text-gold-deep dark:text-gold">AI styles ready</span>}
          </span>
        </span>
      </button>
      <div className="flex shrink-0 items-center">
        <button type="button" onClick={onEdit} aria-label="Edit question" className="ict-icon-btn"><PencilIcon className="h-[18px] w-[18px]" /></button>
        <button type="button" onClick={onDelete} aria-label="Delete question" data-danger="true" className="ict-icon-btn"><TrashIcon className="h-[18px] w-[18px]" /></button>
      </div>
    </li>
  );
}

export default function IctLabPage() {
  const settings = useApp((s) => s.settings);
  const allEntries = useApp((s) => s.entries);
  const { entries } = useMemo(() => scopeToPrimary(settings, allEntries), [settings, allEntries]);
  const cards = (settings.practiceProgress as GameProgress | undefined)?.ictCards ?? [];
  const charts = useMemo(() => entries.filter(hasChart).length, [entries]);
  const thumbs = useImageUrls(cards.map((c) => c.images[0]?.id).filter((id): id is string => !!id));

  const [editing, setEditing] = useState<IctCard | null>(null);
  const [composer, setComposer] = useState(false);
  const [doomed, setDoomed] = useState<IctCard | null>(null);
  const [busy, setBusy] = useState(false);

  const openNew = () => { setEditing(null); setComposer(true); };
  const openEdit = (card: IctCard) => { setEditing(card); setComposer(true); };
  const confirmDelete = async () => {
    if (!doomed) return;
    setBusy(true);
    try { await deleteCard(doomed); toast.success("Question deleted"); setDoomed(null); } catch { toast.error("Couldn't delete that question."); } finally { setBusy(false); }
  };

  return (
    <div className="mx-auto w-full max-w-3xl pb-28 sm:pb-16">
      <Link href="/practice" className="inline-flex items-center gap-0.5 text-[15px] font-medium text-gold-deep transition-opacity hover:opacity-70 dark:text-gold"><ChevronLeftIcon className="-ml-1.5 h-5 w-5" />Practice</Link>

      <header className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <ModeBadge mode="ict" size="lg" />
          <div className="min-w-0">
            <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em] text-ink sm:text-3xl">ICT Lab</h1>
            <p className="mt-1 text-[15px] leading-snug text-muted">{cards.length === 0 ? "Your own questions, replayed until they stick." : `${cards.length} ${cards.length === 1 ? "question" : "questions"} in your deck`}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {cards.length > 0 && <Link href="/practice?mode=ict" className={btnPrimary}>Play</Link>}
          <button type="button" className={btn} onClick={openNew}><PlusIcon className="h-4 w-4" />New question</button>
        </div>
      </header>

      {cards.length === 0 ? (
        <div className="pr-surface mt-8 px-6 py-14 text-center sm:px-10">
          <ModeBadge mode="ict" size="lg" className="mx-auto" />
          <h2 className="mt-6 text-[22px] font-semibold tracking-[-0.025em] text-ink">Add your first question</h2>
          <p className="mx-auto mt-2 max-w-sm text-[14.5px] leading-relaxed text-muted">Write an ICT idea you want to remember, attach the chart, and type the answer. The game turns it into multiple choice, true/false and fill-in-the-blank.</p>
          <button type="button" className={cn(btnPrimary, "mt-7")} onClick={openNew}><PlusIcon className="h-4 w-4" />New question</button>
        </div>
      ) : (
        <ul className="ict-list mt-8">
          {cards.map((card) => <Row key={card.id} card={card} thumb={card.images[0] ? thumbs[card.images[0].id] ?? null : null} onEdit={() => openEdit(card)} onDelete={() => setDoomed(card)} />)}
        </ul>
      )}

      <section className="pr-surface mt-6 px-5 py-4 sm:px-6" aria-label="Trade maths">
        <h2 className="pr-heading text-[15px]">In the middle of every round</h2>
        <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
          {charts > 0
            ? `A few math questions about your own trades: stop distance, reward-to-risk, points captured. Each comes with that trade's screenshot. ${charts} ${charts === 1 ? "trade has" : "trades have"} a saved chart.`
            : "Add a trade with a screenshot and entry, stop and target prices, and its math questions appear here in the middle of each round."}
        </p>
      </section>

      <IctComposer open={composer} card={editing} onClose={() => setComposer(false)} />
      <ConfirmDialog open={!!doomed} onClose={() => setDoomed(null)} onConfirm={() => void confirmDelete()} busy={busy} title="Delete this question?" body="The question, its answer and its pictures are removed. This can't be undone." />
    </div>
  );
}
