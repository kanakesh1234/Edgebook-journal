"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { JournalEntry, MistakeTagRecord, MistakeTagging } from "@/lib/types";
import { categoryOf, needsTagReview } from "@/lib/mistakes";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { FLOW_FADE } from "./flow-ui";
import { useApp } from "@/lib/store";
import { retagEntry } from "@/lib/tagging";
import { confirmSuggestion, dismissSuggestions, mergeRecheck } from "@/lib/tagging/apply";

/**
 * Mistake tags.
 *
 * Tagging runs silently in the background. This UI only ever shows the RESULT — the tag, and a short quote from the
 * trader's own words when they need to choose between options. It never says who or what produced a tag.
 * Used by the autopsy (live) and the trade sheet (saved).
 */
export type TagView = { tags: MistakeTagRecord[]; tagging: MistakeTagging };

const label = (k: string) => categoryOf(k)?.label ?? k;

/** Kept for callers that still import it. The UI no longer shows it. */
export function whoAgreed(t: MistakeTagRecord): string {
  const ai = t.voters.filter((v) => v.startsWith("ai:")).length;
  const parts = [t.voters.includes("you") && "you", ai > 0 && (ai > 1 ? `${ai} AI models` : "AI"), t.voters.includes("rules") && "keywords in your notes", t.voters.includes("data") && "your trade data"].filter(Boolean) as string[];
  if (parts.length === 0) return "";
  return parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 3).trimEnd() + "…" : s);

/** The trader's own words behind a tag — nothing else. */
function Quote({ t }: { t: MistakeTagRecord }) {
  const q = t.evidence.find((e) => e.role !== "fact") ?? t.evidence[0];
  if (!q) return null;
  return <p className="mt-1 text-[13px] leading-snug text-muted">“{clip(q.quote, 110)}”</p>;
}

/** Filed tags are shown once each, primary first. */
function uniqueTags(tags: MistakeTagRecord[]) {
  const seen = new Set<string>();
  return [...tags].sort((a, b) => Number(!!b.primary) - Number(!!a.primary)).filter((t) => { if (seen.has(t.key)) return false; seen.add(t.key); return true; });
}

const pill = "rounded-full px-3 py-1 text-[13.5px] font-medium";

export function TagPanel({ view, busy, onPick, onDismiss, onOpenPicker, quiet = false }: {
  view: TagView | null;
  busy: boolean;
  /** Use this category as the mistake (the trader's own pick from now on). */
  onPick: (key: string) => void;
  onDismiss: () => void;
  onOpenPicker?: () => void;
  /** Saved-trade layout: no card, no heading — just the tags. */
  quiet?: boolean;
}) {
  const t = view?.tagging;
  const filed = uniqueTags(view?.tags ?? []);
  const sug = (t?.suggestions ?? []).filter((s) => !filed.some((f) => f.key === s.key));
  const settled = !!t?.reviewed;
  if (!view && !busy) return null;

  const body = (
    <>
      <AnimatePresence initial={false}>
        {t?.conflict && !settled && (
          <motion.div key="conflict" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={FLOW_FADE} className="rounded-[14px] bg-gold/[0.09] px-3.5 py-3">
            <p className="text-[14px] text-ink">
              Looks more like <b className="font-semibold">{label(t.conflict.better)}</b> than <b className="font-semibold">{label(t.conflict.declared)}</b>.
            </p>
            {t.conflict.quote && <p className="mt-0.5 text-[13px] leading-snug text-muted">“{clip(t.conflict.quote, 100)}”</p>}
            <button type="button" onClick={() => { haptic.selection(); onPick(t.conflict!.better); }} className="mt-2 text-[13.5px] font-medium text-gold hover:underline">Switch to {label(t.conflict.better)}</button>
          </motion.div>
        )}
      </AnimatePresence>

      {filed.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {filed.map((tag) => (
            <li key={tag.key} className={cn(pill, tag.primary ? "bg-gold/15 text-gold" : "bg-ink/[0.06] text-ink")}>{label(tag.key)}</li>
          ))}
        </ul>
      )}

      {sug.length > 0 && !settled && (
        <div>
          <p className="text-[13px] font-medium text-muted">{filed.length ? "Also?" : "Which fits?"}</p>
          <div className="mt-2 flex flex-col gap-2.5">
            {sug.map((s) => (
              <div key={s.key}>
                <button type="button" onClick={() => { haptic.selection(); onPick(s.key); }} className={cn(pill, "bg-ink/[0.05] text-ink ring-1 ring-inset ring-ink/[0.08] transition-colors hover:bg-gold/[0.12] hover:text-gold active:scale-95")}>{label(s.key)}</button>
                <Quote t={s} />
              </div>
            ))}
          </div>
          <button type="button" onClick={() => { haptic.selection(); onDismiss(); }} className="mt-3 text-[13.5px] text-faint hover:text-ink">None</button>
        </div>
      )}

      {!busy && filed.length === 0 && sug.length === 0 && t?.verdict === "unsure" && onOpenPicker && (
        <button type="button" onClick={onOpenPicker} className="text-[14px] font-medium text-gold hover:underline">Pick a category</button>
      )}
    </>
  );

  if (quiet) return <div className="space-y-3.5" aria-live="polite">{body}</div>;

  return (
    <div className="mb-6 overflow-hidden rounded-[18px] bg-ink/[0.035]" aria-live="polite">
      <div className="flex items-center gap-2.5 px-4 pt-3.5">
        <p className="text-[13px] font-medium text-muted">Tags</p>
        {busy && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold-strong" aria-label="Updating" />}
      </div>
      <div className="space-y-3.5 px-4 pb-4 pt-2.5">{body}</div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Saved trade                                                                                                          */
/* ------------------------------------------------------------------------------------------------------------------ */
/**
 * Shown in a trade's Review tab. Renders nothing for trades with no mistake.
 * A trade that was never tagged is read once, silently, when it is opened — no button, no message, no toast.
 */
export function EntryTags({ entry }: { entry: JournalEntry }) {
  const f = entry.review?.followUp;
  const hasMistake = !!f && !!f.mistake && f.mistake !== "none";
  const hasView = !!f?.tagging;
  const tried = useRef<string | null>(null);

  const save = async (next: NonNullable<typeof f>) => {
    await useApp.getState().saveTradeReview(entry.id, { review: { ...entry.review, followUp: next } });
  };

  // Background read for trades that have never been tagged. Failures stay silent; the next visit tries once more.
  useEffect(() => {
    if (!f || !hasMistake || hasView || tried.current === entry.id) return;
    tried.current = entry.id;
    let live = true;
    void (async () => {
      try {
        const st = useApp.getState();
        const d = await retagEntry(entry, st.entries, st.plans);
        if (live) await save(mergeRecheck(f, d));
      } catch { /* silent */ }
    })();
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry.id, hasMistake, hasView]);

  if (!f || !hasMistake) return null;
  const view: TagView | null = f.tagging ? { tags: f.tags ?? [], tagging: f.tagging } : null;
  if (!view) return null;
  // Nothing to show (and nothing for the trader to decide): stay out of the way.
  if (view.tags.length === 0 && !needsTagReview(entry) && !view.tagging.conflict) return null;

  return (
    <section aria-label="Tags" className="rounded-[18px] bg-ink/[0.035] px-4 py-3.5">
      <p className="mb-2.5 text-[12.5px] text-faint">Tags</p>
      <TagPanel
        quiet
        view={view}
        busy={false}
        onPick={(key) => void save(confirmSuggestion(f, key))}
        onDismiss={() => void save(dismissSuggestions(f))}
      />
    </section>
  );
}
