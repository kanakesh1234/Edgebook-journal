"use client";

import { memo } from "react";
import { Sym } from "@/components/journal/symbols";
import { useImageUrls } from "@/lib/hooks";
import { accuracy, conceptOf, groupByConcept, summarize, tagsOf, UNSORTED, STRONG_FROM, NEEDS_BELOW, type Facet } from "@/lib/practice/ict-library";
import type { IctCard } from "@/lib/practice/progress-ext";
import { cn } from "@/lib/utils";

export type CardActions = { onOpen: (c: IctCard) => void; onDelete: (c: IctCard) => void };

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const accTone = (a: number | null) => (a === null ? "text-faint" : a >= STRONG_FROM ? "text-profit" : a < NEEDS_BELOW ? "text-loss" : "text-ink");

function useThumb(card: IctCard) {
  const urls = useImageUrls(card.images.slice(0, 1).map((i) => i.id));
  return card.images[0] ? urls[card.images[0].id] : null;
}

/** A small round button that appears on hover (always visible on touch screens). */
function Quick({ label, icon, danger, onClick, className }: { label: string; icon: "pencil" | "trash"; danger?: boolean; onClick: () => void; className?: string }) {
  return (
    <button
      type="button" aria-label={label} title={label} onClick={onClick} data-danger={danger ? "true" : undefined}
      className={cn(
        "grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted outline-none transition-[background-color,color,transform] duration-150 focus-visible:ring-2 focus-visible:ring-gold-strong/50 active:scale-[0.92]",
        "hover:bg-ink/[0.07] hover:text-ink data-[danger=true]:hover:bg-loss/10 data-[danger=true]:hover:text-loss", className,
      )}
    >
      <Sym name={icon} className="h-[17px] w-[17px]" />
    </button>
  );
}
/** Hover devices see the quick actions on hover or keyboard focus; touch screens always see them (see practice.css). */
const reveal = "ict-reveal";

/* ───────────── List row ───────────── */
export const QuestionRow = memo(function QuestionRow({ card, showConcept, p }: { card: IctCard; showConcept: boolean; p: CardActions }) {
  const thumb = useThumb(card);
  const acc = accuracy(card);
  const tags = tagsOf(card);
  const meta = [showConcept ? conceptOf(card) : null].filter(Boolean) as string[];
  return (
    <div
      role="listitem"
      className={cn(
        "group relative flex items-center gap-1 rounded-[12px] pr-1.5 transition-colors duration-150",
        "after:absolute after:bottom-0 after:left-[88px] after:right-2.5 after:h-px after:bg-line-soft last:after:hidden",
        "hover:bg-ink/[0.04] focus-within:bg-ink/[0.04]",
      )}
    >
      <button type="button" onClick={() => p.onOpen(card)} aria-label={`Edit: ${card.question}`} className="flex min-w-0 flex-1 items-center gap-3 rounded-[12px] px-2.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-gold-strong/50 active:bg-ink/[0.05]">
        {(card.seen ?? 0) === 0
          ? <span role="img" aria-label="Not played yet" title="Not played yet" className="h-2 w-2 shrink-0 rounded-full bg-gold-strong" />
          : <span className="w-2 shrink-0" />}
        <div className="relative h-[42px] w-[62px] shrink-0 overflow-hidden rounded-[9px] bg-ink/[0.05]">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
          ) : card.images.length > 0 ? (
            <div className="h-full w-full animate-pulse bg-ink/[0.06]" />
          ) : (
            <div className="grid h-full w-full place-items-center text-faint"><Sym name="bulb" className="h-5 w-5 opacity-70" /></div>
          )}
          {card.images.length > 1 && (
            <span className="absolute bottom-1 right-1 flex items-center gap-0.5 rounded-full bg-black/55 px-1.5 py-px text-[10px] font-medium text-white backdrop-blur">
              <Sym name="photo" className="h-2.5 w-2.5" />{card.images.length}
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[15px] font-medium leading-snug tracking-[-0.01em] text-ink sm:line-clamp-1">{card.question}</p>
          <p className="mt-px truncate text-[13px] text-muted">
            {meta.length > 0 && <span className={cn(conceptOf(card) === UNSORTED ? "text-faint" : "text-gold")}>{meta[0]}<span className="text-faint"> · </span></span>}
            {card.answer}
            {tags.length > 0 && <span className="text-faint"> · {tags.map((t) => `#${t}`).join(" ")}</span>}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className={cn("kpi text-[15px] tabular-nums", accTone(acc))}>{acc === null ? "New" : `${acc}%`}</p>
          <p className="num mt-px text-[12px] text-faint">{(card.seen ?? 0) > 0 ? `Asked ${card.seen}×` : "Not played"}</p>
        </div>
      </button>
      <div className={cn("flex shrink-0 items-center", reveal)}>
        <Quick label="Edit question" icon="pencil" onClick={() => p.onOpen(card)} />
        <Quick label="Delete question" icon="trash" danger onClick={() => p.onDelete(card)} />
      </div>
    </div>
  );
});

/* ───────────── Grid tile ───────────── */
export const QuestionTile = memo(function QuestionTile({ card, showConcept, p }: { card: IctCard; showConcept: boolean; p: CardActions }) {
  const thumb = useThumb(card);
  const acc = accuracy(card);
  const concept = conceptOf(card);
  return (
    <div role="listitem" className="group relative">
      <button type="button" onClick={() => p.onOpen(card)} aria-label={`Edit: ${card.question}`} className="block w-full text-left outline-none">
        <div className="relative aspect-[4/3] overflow-hidden rounded-[14px] bg-ink/[0.05] transition-[transform,box-shadow] duration-200 ease-out group-hover:shadow-[0_8px_24px_-12px_rgb(0_0_0/0.35)] group-active:scale-[0.98] group-has-[button:focus-visible]:ring-2 group-has-[button:focus-visible]:ring-gold-strong/60">
          {thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt="" loading="lazy" draggable={false} className="h-full w-full object-cover" />
          ) : card.images.length > 0 ? (
            <div className="h-full w-full animate-pulse" />
          ) : (
            <div className="grid h-full w-full place-items-center p-4 text-faint"><Sym name="bulb" className="h-8 w-8 opacity-50" strokeWidth={1.3} /></div>
          )}
          {(card.seen ?? 0) === 0 && <span aria-label="Not played yet" className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-gold-strong ring-2 ring-white/70" />}
          {card.images.length > 1 && (
            <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-full bg-black/45 px-1.5 py-0.5 text-[11px] font-medium text-white backdrop-blur-md">
              <Sym name="photo" className="h-3 w-3" />{card.images.length}
            </span>
          )}
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-2 px-0.5">
          <p className="line-clamp-2 text-[14px] font-medium leading-snug text-ink">{card.question}</p>
          <p className={cn("kpi shrink-0 text-[14px] tabular-nums", accTone(acc))}>{acc === null ? "New" : `${acc}%`}</p>
        </div>
        <p className="mt-0.5 truncate px-0.5 text-[12.5px] text-muted">
          {showConcept && <span className={concept === UNSORTED ? "text-faint" : "text-gold"}>{concept}</span>}
          {showConcept && tagsOf(card).length > 0 && <span className="text-faint"> · </span>}
          {tagsOf(card).length > 0 ? <span className="text-faint">{tagsOf(card).map((t) => `#${t}`).join(" ")}</span> : !showConcept ? card.answer : null}
        </p>
      </button>
      <div className={cn("absolute left-1.5 top-1.5 flex items-center rounded-full bg-surface/85 shadow-[0_2px_10px_-2px_rgb(0_0_0/0.3)] backdrop-blur-xl", reveal)}>
        <Quick label="Edit question" icon="pencil" onClick={() => p.onOpen(card)} />
        <Quick label="Delete question" icon="trash" danger onClick={() => p.onDelete(card)} />
      </div>
    </div>
  );
});

/* ───────────── Timeline: list or grid, grouped by concept ───────────── */
export function Timeline({ cards, layout, grouped, p, onConcept }: { cards: IctCard[]; layout: "list" | "grid"; grouped: boolean; p: CardActions; onConcept: (name: string) => void }) {
  const gridCls = "grid grid-cols-2 gap-x-4 gap-y-7 sm:grid-cols-[repeat(auto-fill,minmax(224px,1fr))]";
  const rows = (items: IctCard[], showConcept: boolean) => <div role="list" className="-mx-2.5">{items.map((c) => <QuestionRow key={c.id} card={c} showConcept={showConcept} p={p} />)}</div>;
  const tiles = (items: IctCard[], showConcept: boolean) => <div role="list" className={gridCls}>{items.map((c) => <QuestionTile key={c.id} card={c} showConcept={showConcept} p={p} />)}</div>;

  if (!grouped) return layout === "list" ? rows(cards, true) : tiles(cards, true);

  const groups = groupByConcept(cards);
  const showHeads = groups.length > 1;
  return (
    <div>
      {groups.map((g) => (
        <section key={g.concept} aria-label={g.concept} className="mb-12">
          {showHeads && (
            <div className="sticky top-[var(--tb)] z-10 mb-1 flex items-baseline justify-between gap-4 bg-canvas/85 py-3 backdrop-blur-md">
              <button type="button" onClick={() => onConcept(g.concept)} className="group/h flex min-w-0 items-center gap-1 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-gold-strong/50" aria-label={`Open ${g.concept}`}>
                <h2 className={cn("truncate text-[19px] font-semibold tracking-[-0.02em]", g.concept === UNSORTED ? "text-muted" : "text-ink")}>{g.concept}</h2>
                <Sym name="chevronRight" className="h-3.5 w-3.5 text-faint transition-transform duration-200 group-hover/h:translate-x-0.5" strokeWidth={2} />
              </button>
              <p className="num shrink-0 text-[13px] text-muted">
                {plural(g.summary.count, "question")}
                {g.summary.acc !== null && <><span className="mx-1 text-faint">·</span><span className={accTone(g.summary.acc)}>{g.summary.acc}% right</span></>}
              </p>
            </div>
          )}
          <div className={showHeads ? "pt-1" : ""}>{layout === "grid" ? tiles(g.items, !showHeads) : rows(g.items, !showHeads)}</div>
        </section>
      ))}
    </div>
  );
}

/* ───────────── Folder level: one folder per concept ───────────── */
export function ConceptFolders({ facets, cards, onOpen }: { facets: Facet[]; cards: IctCard[]; onOpen: (concept: string) => void }) {
  return (
    <div role="list" className="-mx-2.5">
      {facets.map((f) => {
        const s = summarize(cards.filter((c) => conceptOf(c).toLowerCase() === f.key.toLowerCase()));
        return (
          <button
            key={f.key} type="button" role="listitem" onClick={() => onOpen(f.key)}
            className="group relative flex w-full items-center gap-3.5 rounded-[12px] px-2.5 py-3 text-left outline-none transition-colors duration-150 after:absolute after:bottom-0 after:left-[52px] after:right-2.5 after:h-px after:bg-line-soft last:after:hidden hover:bg-ink/[0.04] active:bg-ink/[0.07] focus-visible:ring-2 focus-visible:ring-gold-strong/50"
          >
            <Sym name="folder" className="h-[26px] w-[26px] text-gold-strong" strokeWidth={1.4} />
            <div className="min-w-0 flex-1">
              <p className={cn("truncate text-[16px] font-medium tracking-[-0.01em]", f.key === UNSORTED ? "text-muted" : "text-ink")}>{f.key}</p>
              <p className="text-[13px] text-muted">{plural(s.count, "question")}{s.needs > 0 ? `, ${s.needs} to practise` : ", all strong"}</p>
            </div>
            <p className={cn("kpi text-[15px] tabular-nums", accTone(s.acc))}>{s.acc === null ? "New" : `${s.acc}%`}</p>
            <Sym name="chevronRight" className="h-3.5 w-3.5 text-faint transition-transform duration-200 group-hover:translate-x-0.5" strokeWidth={2} />
          </button>
        );
      })}
    </div>
  );
}
