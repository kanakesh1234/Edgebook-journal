"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { MistakeTagRecord, MistakeTagging } from "@/lib/types";
import { categoryOf } from "@/lib/mistakes";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { FLOW_FADE } from "./flow-ui";
import type { JournalEntry } from "@/lib/types";
import { useApp } from "@/lib/store";
import { toast } from "@/components/ui/toast";
import { needsTagReview } from "@/lib/mistakes";
import { retagEntry } from "@/lib/tagging";
import { confirmSuggestion, dismissSuggestions, mergeRecheck } from "@/lib/tagging/apply";


/**
 * Mistake tags, with their reasons.
 *
 * Shows what was filed and what is only suggested, and for each tag the trader's OWN words that justify it — so a wrong
 * tag is obvious at a glance and fixable in one tap. Used by the autopsy (live) and the trade detail sheet (saved).
 */
export type TagView = { tags: MistakeTagRecord[]; tagging: MistakeTagging };

const label = (k: string) => categoryOf(k)?.label ?? k;

/** "You, AI and your notes agreed" — what stood behind a tag, in plain words. */
export function whoAgreed(t: MistakeTagRecord): string {
  const ai = t.voters.filter((v) => v.startsWith("ai:")).length;
  const parts = [t.voters.includes("you") && "you", ai > 0 && (ai > 1 ? `${ai} AI models` : "AI"), t.voters.includes("rules") && "keywords in your notes", t.voters.includes("data") && "your trade data"].filter(Boolean) as string[];
  if (parts.length === 0) return "";
  return parts.length === 1 ? parts[0]! : `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}

const glyph = "h-[17px] w-[17px]";
const Spark = () => (
  <svg viewBox="0 0 24 24" className={glyph} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m11 3.5 1.7 5 5 1.7-5 1.7L11 17l-1.7-5.1-5-1.7 5-1.7zM19 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" /></svg>
);

function Why({ t }: { t: MistakeTagRecord }) {
  const q = t.evidence.find((e) => e.role !== "fact") ?? t.evidence[0];
  const who = whoAgreed(t);
  if (!q && !who) return null;
  return (
    <p className="mt-1 text-[13px] leading-snug text-muted">
      {q && <>“{q.quote.length > 110 ? q.quote.slice(0, 107).trimEnd() + "…" : q.quote}”</>}
      {q && who && " · "}
      {who && <span className="text-faint">{t.source === "you" || t.confirmed ? "Your pick" : who}</span>}
    </p>
  );
}

export function TagPanel({ view, busy, onPick, onDismiss, onOpenPicker }: {
  view: TagView | null;
  busy: boolean;
  /** Use this category as the mistake (the trader's own pick from now on). */
  onPick: (key: string) => void;
  onDismiss: () => void;
  onOpenPicker?: () => void;
}) {
  const t = view?.tagging;
  const filed = view?.tags ?? [];
  const sug = t?.suggestions ?? [];
  const settled = !!t?.reviewed;
  if (!view && !busy) return null;

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-line bg-raised" aria-live="polite">
      <div className="flex items-center gap-3 px-3.5 py-3">
        <span className={cn("grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] bg-[#5e5ce6] text-white", busy && "animate-pulse")}><Spark /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-ink">Mistake tags</p>
          <p className="text-[13px] text-muted">
            {busy ? "Reading everything you wrote…" : t?.degraded ? `Checked your notes and trade data. AI did not answer${t.reason ? `: ${t.reason}` : "."}` : "Checked your notes, your data and AI"}
          </p>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {t?.conflict && !settled && (
          <motion.div key="conflict" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={FLOW_FADE} className="border-t border-line-soft bg-gold/[0.08] px-3.5 py-3">
            <p className="text-[13.5px] font-semibold text-ink">Did you tap the wrong one?</p>
            <p className="mt-0.5 text-[13.5px] leading-snug text-muted">
              You picked <b className="font-medium text-ink">{label(t.conflict.declared)}</b>, but what you wrote reads like <b className="font-medium text-ink">{label(t.conflict.better)}</b>
              {t.conflict.quote ? <> — “{t.conflict.quote.length > 100 ? t.conflict.quote.slice(0, 97).trimEnd() + "…" : t.conflict.quote}”</> : null}.
            </p>
            <button type="button" onClick={() => { haptic.selection(); onPick(t.conflict!.better); }} className="mt-2 text-[13.5px] font-medium text-gold hover:underline">Use {label(t.conflict.better)}</button>
          </motion.div>
        )}
      </AnimatePresence>

      {filed.map((tag) => (
        <div key={tag.key} className="border-t border-line-soft px-3.5 py-3">
          <div className="flex items-center gap-2">
            <span className={cn("rounded-full px-2.5 py-0.5 text-[13px] font-semibold", tag.primary ? "bg-gold/15 text-gold" : "bg-ink/[0.06] text-ink")}>{label(tag.key)}</span>
            <span className="text-[12px] uppercase tracking-[.08em] text-faint">{tag.primary ? "Main" : "Also"}</span>
          </div>
          <Why t={tag} />
        </div>
      ))}

      {sug.length > 0 && !settled && (
        <div className="border-t border-line-soft px-3.5 py-3">
          <p className="text-[13px] font-semibold text-ink">{filed.length ? "Possibly also" : "Not sure — which fits?"}</p>
          <p className="mt-0.5 text-[13px] text-muted">These are not saved until you tap one.</p>
          <div className="mt-2.5 flex flex-col gap-2.5">
            {sug.map((s) => (
              <div key={s.key}>
                <button type="button" onClick={() => { haptic.selection(); onPick(s.key); }} className="rounded-full bg-[#5e5ce6]/[0.10] px-3 py-1 text-[13.5px] font-medium text-[#5e5ce6] ring-1 ring-inset ring-[#5e5ce6]/25 hover:bg-[#5e5ce6]/[0.16] dark:text-[#9d9bff]">{label(s.key)}</button>
                <Why t={s} />
              </div>
            ))}
          </div>
          <button type="button" onClick={() => { haptic.selection(); onDismiss(); }} className="mt-3 text-[13.5px] text-faint hover:text-ink">None of these</button>
        </div>
      )}

      {!busy && filed.length === 0 && sug.length === 0 && t?.verdict === "unsure" && (
        <div className="border-t border-line-soft px-3.5 py-3">
          <p className="text-[13.5px] leading-snug text-muted">Not enough in what you wrote to tag this reliably — nothing was guessed.</p>
          {onOpenPicker && <button type="button" onClick={onOpenPicker} className="mt-1.5 text-[13.5px] font-medium text-gold hover:underline">Pick a category</button>}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------------------ */
/* Saved trade: confirm what was left open, or have an older trade re-read                                              */
/* ------------------------------------------------------------------------------------------------------------------ */
/** Shown in a trade's Review tab. Renders nothing for trades with no mistake (nothing to tag). */
export function EntryTags({ entry }: { entry: JournalEntry }) {
  const [busy, setBusy] = useState(false);
  const f = entry.review?.followUp;
  if (!f || !f.mistake || f.mistake === "none") return null;

  const save = async (next: NonNullable<typeof f>) => {
    await useApp.getState().saveTradeReview(entry.id, { review: { ...entry.review, followUp: next } });
  };
  const view: TagView | null = f.tagging ? { tags: f.tags ?? [], tagging: f.tagging } : null;
  const recheck = async () => {
    setBusy(true);
    try {
      const st = useApp.getState();
      const d = await retagEntry(entry, st.entries, st.plans);
      await save(mergeRecheck(f, d));
      if (d.tagging.degraded) toast.error("AI did not answer", d.tagging.reason ?? "Only your notes and data were read. Try again in a moment.");
      else toast.success("Tags checked", "Read everything you wrote again.");
    } catch { toast.error("Couldn't re-check", "Try again in a moment."); } finally { setBusy(false); }
  };

  return (
    <div>
      <TagPanel
        view={view}
        busy={busy}
        onPick={(key) => void save(confirmSuggestion(f, key))}
        onDismiss={() => void save(dismissSuggestions(f))}
      />
      {!busy && (needsTagReview(entry) || !view) && (
        <button type="button" onClick={() => void recheck()} className="-mt-3 mb-4 text-[13.5px] font-medium text-gold hover:underline">
          {view ? "Re-read my notes" : "Check tags with AI"}
        </button>
      )}
    </div>
  );
}
