"use client";

import { useState } from "react";
import { Sym } from "@/components/journal/symbols";
import { haptic } from "@/lib/haptics";
import { MAX_TAG, MAX_TAGS, normTag } from "@/lib/practice/ict-library";
import { cn } from "@/lib/utils";

/**
 * Tags for a question: type a word, press Return or comma, and it becomes a chip.
 * Backspace on an empty field removes the last chip. Words already used on other questions are offered below.
 * Same surface as the other composer fields (raised, 2xl corners, soft gold focus ring).
 */
export function TagField({ value, onChange, suggestions, id }: { value: string[]; onChange: (next: string[]) => void; suggestions: string[]; id?: string }) {
  const [draft, setDraft] = useState("");
  const full = value.length >= MAX_TAGS;

  const add = (raw: string) => {
    const t = normTag(raw);
    if (!t || value.includes(t) || full) return;
    haptic.selection();
    onChange([...value, t]);
  };
  const commit = () => { if (draft.trim()) add(draft); setDraft(""); };
  const remove = (t: string) => { haptic.selection(); onChange(value.filter((x) => x !== t)); };

  return (
    <div className="space-y-3">
      <div className="flex min-h-[3.25rem] flex-wrap items-center gap-2 rounded-2xl border border-line bg-raised px-3 py-2.5 transition-[border-color,box-shadow] duration-200 hover:border-line-strong focus-within:border-gold/60 focus-within:ring-4 focus-within:ring-gold/10">
        {value.map((t) => (
          <span key={t} className="inline-flex h-8 items-center gap-1 rounded-full border border-gold/35 bg-gold/[0.09] pl-3 pr-1.5 text-[14px] font-medium text-gold-deep dark:text-gold">
            <span className="text-gold-deep/60 dark:text-gold/60">#</span>{t}
            <button type="button" aria-label={`Remove tag ${t}`} onClick={() => remove(t)} className="grid h-5 w-5 place-items-center rounded-full text-gold-deep/70 transition-colors hover:bg-gold/20 dark:text-gold/70">
              <Sym name="xmark" className="h-3 w-3" strokeWidth={2.4} />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          maxLength={MAX_TAG + 1}
          disabled={full}
          onChange={(e) => { const v = e.target.value; if (v.endsWith(",")) { add(v.slice(0, -1)); setDraft(""); } else setDraft(v); }}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); commit(); }
            else if (e.key === "Backspace" && !draft && value.length) remove(value[value.length - 1]!);
          }}
          onBlur={commit}
          placeholder={value.length ? (full ? "" : "Add another") : "ny-open, london-kill-zone, a+ setup"}
          aria-label="Add a tag"
          className="ict-tag-input min-w-[8rem] flex-1 bg-transparent px-1 py-1 text-[16px] text-ink outline-none placeholder:text-faint disabled:cursor-not-allowed"
        />
      </div>

      {suggestions.length > 0 && !full && (
        <div className="flex flex-wrap gap-1.5" aria-label="Tags you have used before">
          {suggestions.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => add(t)}
              className={cn("inline-flex h-8 items-center gap-1 rounded-full border border-line bg-raised px-3 text-[13px] font-medium text-muted transition-[border-color,color,transform] hover:border-line-strong hover:text-ink active:scale-[0.96]")}
            >
              <Sym name="plus" className="h-3 w-3" strokeWidth={2.2} />{t}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
