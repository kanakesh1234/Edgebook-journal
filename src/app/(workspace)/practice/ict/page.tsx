"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useApp } from "@/lib/store";
import { scopeToPrimary } from "@/lib/challenges";
import { useImageUrls } from "@/lib/hooks";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toast";
import { ArrowLeftIcon, ImageIcon, PencilIcon, PlusIcon, TrashIcon } from "@/components/ui/icons";
import { IctComposer } from "@/components/practice/ict-composer";
import { MODE_GLYPH, MODE_META, tint } from "@/components/practice/modes";
import { Eyebrow } from "@/components/practice/ui";
import { hasFreshVariants } from "@/lib/practice/ict-cards";
import { hasChart } from "@/lib/practice/ict-trade-math";
import { deleteCard } from "@/lib/practice/ict-store";
import type { GameProgress, IctCard } from "@/lib/practice/progress-ext";
import { cn } from "@/lib/utils";

const accent = MODE_META.ict.accent;
const Glyph = MODE_GLYPH.ict;

const pct = (c: IctCard) => ((c.seen ?? 0) > 0 ? Math.round(((c.correct ?? 0) / (c.seen ?? 1)) * 100) : null);

function Row({ card, thumb, onEdit, onDelete }: { card: IctCard; thumb: string | null; onEdit: () => void; onDelete: () => void }) {
  const acc = pct(card);
  return (
    <li className="group flex items-center gap-4 px-4 py-3.5 transition-colors hover:bg-ink/[0.025] sm:px-5">
      <button type="button" onClick={onEdit} className="flex min-w-0 flex-1 items-center gap-4 text-left" aria-label={`Edit: ${card.question}`}>
        <span className="relative grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-[14px] border border-line bg-raised text-faint">
          {thumb ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={thumb} alt="" className="h-full w-full object-cover" /> : <ImageIcon className="h-5 w-5" />}
          {card.images.length > 1 && <span className="num absolute bottom-1 right-1 rounded-full bg-black/60 px-1.5 text-[10px] font-semibold leading-4 text-white backdrop-blur">{card.images.length}</span>}
        </span>
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-[15px] font-medium leading-snug tracking-[-0.01em] text-ink">{card.question}</span>
          <span className="mt-0.5 block truncate text-[13px] text-muted">{card.answer}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11.5px] text-faint">
            <span className="num">{card.seen ? `Asked ${card.seen}×` : "Not played yet"}</span>
            {acc != null && <span className={cn("num font-medium", acc >= 80 ? "text-profit" : acc < 50 ? "text-loss" : "")}>{acc}% right</span>}
            {hasFreshVariants(card) && <span style={{ color: tint(accent, 80, "var(--ink)") }}>AI styles ready</span>}
          </span>
        </span>
      </button>
      <div className="flex shrink-0 items-center gap-1 opacity-70 transition-opacity group-hover:opacity-100">
        <button type="button" onClick={onEdit} aria-label="Edit question" className="grid h-9 w-9 place-items-center rounded-full text-muted transition-colors hover:bg-ink/[0.06] hover:text-ink"><PencilIcon className="h-4 w-4" /></button>
        <button type="button" onClick={onDelete} aria-label="Delete question" className="grid h-9 w-9 place-items-center rounded-full text-muted transition-colors hover:bg-loss/10 hover:text-loss"><TrashIcon className="h-4 w-4" /></button>
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
    <div className="mx-auto max-w-3xl pb-24">
      <Link href="/practice" className="inline-flex items-center gap-1.5 text-[13.5px] font-medium text-muted transition-colors hover:text-ink"><ArrowLeftIcon className="h-4 w-4" />Practice</Link>

      <header className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-[18px] p-3.5" style={{ background: `linear-gradient(150deg, ${tint(accent, 26, "var(--surface)")}, ${tint(accent, 12, "var(--surface)")})`, color: tint(accent, 90, "var(--ink)"), border: `1px solid ${tint(accent, 30)}`, boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.45), 0 8px 18px -10px " + tint(accent, 60) }}><Glyph /></span>
          <div>
            <h1 className="text-[34px] font-semibold leading-none tracking-[-0.03em] text-ink">ICT Lab</h1>
            <p className="mt-1.5 text-[14.5px] text-muted">{cards.length === 0 ? "Your own questions, replayed until they stick." : `${cards.length} ${cards.length === 1 ? "question" : "questions"} in your deck`}</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5">
          {cards.length > 0 && <Link href="/practice?mode=ict" className="inline-flex h-10 items-center rounded-full bg-gradient-to-b from-gold-strong to-gold-deep px-5 text-[14px] font-semibold text-on-gold shadow-[0_8px_18px_-10px_var(--gold-strong),inset_0_1px_0_rgb(255_255_255/0.3)] transition-all hover:brightness-110 active:scale-[0.97]">Play</Link>}
          <Button variant="subtle" onClick={openNew}><PlusIcon className="h-4 w-4" />New question</Button>
        </div>
      </header>

      {cards.length === 0 ? (
        <div className="mt-10 rounded-[28px] border border-line bg-surface/70 px-8 py-14 text-center backdrop-blur-xl">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-[20px] p-4" style={{ background: tint(accent, 14), color: tint(accent, 90, "var(--ink)") }}><Glyph /></span>
          <h2 className="mt-6 text-[22px] font-semibold tracking-[-0.02em] text-ink">Add your first question</h2>
          <p className="mx-auto mt-2 max-w-sm text-[14.5px] leading-relaxed text-muted">Write an ICT idea you want to remember, attach the chart, and type the answer. The game turns it into multiple choice, true/false and fill-in-the-blank.</p>
          <Button variant="gold" size="lg" className="mt-7" onClick={openNew}><PlusIcon className="h-4 w-4" />New question</Button>
        </div>
      ) : (
        <ul className="mt-8 divide-y divide-line overflow-hidden rounded-[24px] border border-line bg-surface/80 shadow-[0_1px_0_rgb(255_255_255/0.6)_inset,0_18px_40px_-28px_rgb(48_40_24/0.3)] backdrop-blur-xl dark:shadow-none">
          {cards.map((card) => <Row key={card.id} card={card} thumb={card.images[0] ? thumbs[card.images[0].id] ?? null : null} onEdit={() => openEdit(card)} onDelete={() => setDoomed(card)} />)}
        </ul>
      )}

      <section className="mt-8 rounded-[22px] border border-line bg-raised/60 px-5 py-4" aria-label="Trade maths">
        <Eyebrow>In the middle of every round</Eyebrow>
        <p className="mt-2 text-[14px] leading-relaxed text-muted">
          {charts > 0
            ? `A few math questions about your own trades — stop distance, reward-to-risk, points captured — each with that trade's screenshot. ${charts} ${charts === 1 ? "trade has" : "trades have"} a saved chart.`
            : "Add a trade with a screenshot and entry, stop and target prices, and its math questions appear here in the middle of each round."}
        </p>
      </section>

      <IctComposer open={composer} card={editing} onClose={() => setComposer(false)} />
      <ConfirmDialog open={!!doomed} onClose={() => setDoomed(null)} onConfirm={() => void confirmDelete()} busy={busy} title="Delete this question?" body="The question, its answer and its pictures are removed. This can't be undone." />
    </div>
  );
}
