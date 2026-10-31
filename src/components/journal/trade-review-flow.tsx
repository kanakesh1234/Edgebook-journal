"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import type { JournalEntry } from "@/lib/types";
import { useUi } from "@/lib/ui-store";
import { useApp } from "@/lib/store";
import { formatDateMedium, formatSignedMoney, weekdayLong } from "@/lib/format";
import { mistakeTagsOf } from "@/lib/mistakes";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { AutopsyBody, useAutopsy } from "./autopsy";
import { RiskMeter } from "./risk-meter";
import { FLOW_EASE, Hint, PrimaryButton, SheetFrame, StepTransition, useIsDesktop, type Rail } from "./flow-ui";

/**
 * Trade review — the same ritual as Plan & record, for a trade that already exists.
 *
 *   review → done
 *
 * Same frame (progress rail, glass bars, ⌘↵ to continue), same questions and reveal sequence as the autopsy inside Plan & record.
 * On Finish the AI reads the new answers TOGETHER with everything written before (notes, earlier reviews, plan, data) and
 * updates the tags; the closing screen shows a green "complete" signal and exactly how the tags changed.
 */
type Step = "review" | "done";

export function TradeReviewFlow({ open, entry, onClose }: { open: boolean; entry: JournalEntry | null; onClose: () => void }) {
  const a = useAutopsy(entry?.id ?? null, open, entry);
  const desktop = useIsDesktop();
  const currency = useApp((s) => s.settings.currency);
  const [step, setStep] = useState<Step>("review");
  // The tags this trade had BEFORE this review, so the closing screen can show what the AI changed.
  const before = useRef<string[]>([]);
  useEffect(() => {
    if (!open) return;
    setStep("review");
    before.current = entry ? mistakeTagsOf(entry).map((t) => t.label) : [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry?.id]);

  // ⌘/Ctrl + Enter finishes from anywhere, including inside a text area.
  const finishRef = useRef<() => void>(() => undefined);
  const complete = async () => { if (!a.ready || a.saving) return; if (await a.submit()) setStep("done"); };
  finishRef.current = () => { if (step === "review") void complete(); else onClose(); };
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); finishRef.current(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!entry) return null;
  const live = a.entry ?? entry;

  const rail: Rail = {
    title: "Trade review",
    steps: [{ id: "review", label: "Review" }, { id: "tags", label: "Tags" }],
    current: step === "review" ? "review" : "done", // "done" is not a rail step: every step shows complete
    aside: (
      <>
        <p className="text-[14px] font-semibold tracking-[-0.01em] text-ink">{weekdayLong(live.date)}</p>
        <p className="mt-0.5 text-[12.5px] text-faint">{formatDateMedium(live.date)} · {[live.instrument !== "—" ? live.instrument : null, live.direction].filter(Boolean).join(" ")}</p>
        <p className={cn("mt-1 text-[13px] font-medium tabular-nums", live.pnl >= 0 ? "text-profit" : "text-loss")}>{formatSignedMoney(live.pnl)}</p>
      </>
    ),
  };

  const hintText = a.error ?? (a.saving ? "Reading your whole review to update the tags…" : a.ready ? null : a.hint);

  return (
    <Modal open={open} onClose={onClose} size={desktop ? "xl" : "md"} label="Trade review">
      <SheetFrame
        rail={rail}
        onClose={onClose}
        hint={step === "done" ? null : <Hint text={hintText} tone={a.error ? "warn" : "muted"} />}
        actions={<PrimaryButton shortcut disabled={step === "review" && !a.ready} loading={step === "review" && a.saving} onClick={() => finishRef.current()}>{step === "review" ? "Finish" : "Done"}</PrimaryButton>}
      >
        <StepTransition stepKey={step} dir={1}>
          {step === "review" ? <AutopsyBody a={a} /> : <ReviewDone entry={live} before={before.current} currency={currency} risk={a.risk} onTalk={() => { useUi.getState().openMinatoWithTrade(live.id); onClose(); }} />}
        </StepTransition>
      </SheetFrame>
    </Modal>
  );
}

/** The green "complete" moment: a check that draws itself, a soft ripple, then the tags it settled on. */
function ReviewDone({ entry, before, currency, risk, onTalk }: { entry: JournalEntry; before: string[]; currency: ReturnType<typeof useApp.getState>["settings"]["currency"]; risk: ReturnType<typeof useAutopsy>["risk"]; onTalk: () => void }) {
  const tags = mistakeTagsOf(entry);
  const tagging = entry.review?.followUp?.tagging;
  const noMistake = entry.review?.followUp?.mistake === "none";
  const after = tags.map((t) => t.label);
  const added = after.filter((l) => !before.includes(l));
  const removed = before.filter((l) => !after.includes(l));
  const changed = added.length > 0 || removed.length > 0;
  return (
    <div className="flex min-h-[22rem] flex-col items-center justify-center text-center">
      <div className="relative grid h-20 w-20 place-items-center">
        {[0, 1].map((i) => (
          <motion.span key={i} aria-hidden className="absolute inset-0 rounded-full border border-profit/40" initial={{ scale: 0.8, opacity: 0.7 }} animate={{ scale: 2.1, opacity: 0 }} transition={{ duration: 1.5, delay: 0.25 + i * 0.35, ease: FLOW_EASE }} />
        ))}
        <motion.div initial={{ scale: 0.55, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 340, damping: 20 }} className="relative grid h-20 w-20 place-items-center rounded-full bg-gradient-to-b from-profit to-profit/75 text-white shadow-[0_16px_36px_-12px] shadow-profit/60 ring-4 ring-profit/15">
          <svg viewBox="0 0 24 24" className="h-9 w-9" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <motion.path d="M5 12.5l4.2 4.2L19 7.2" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5, delay: 0.2, ease: FLOW_EASE }} />
          </svg>
        </motion.div>
      </div>
      <motion.h2 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.3, ease: FLOW_EASE }} className="mt-7 text-[32px] font-semibold tracking-[-0.025em] text-ink">Review complete.</motion.h2>
      <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.38, ease: FLOW_EASE }} className="mt-2 max-w-[24rem] text-[15px] leading-snug text-muted">Process noted — the outcome is just data.</motion.p>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.5, ease: FLOW_EASE }} className="mt-7 w-full max-w-[26rem] rounded-2xl border border-profit/20 bg-profit/[0.05] p-4 text-left">
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-profit">Tags</p>
        {noMistake ? (
          <p className="mt-1.5 text-[14.5px] leading-snug text-ink">No mistake filed — a clean process.</p>
        ) : tags.length > 0 ? (
          <>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <li key={t.key} className={cn("rounded-full px-3 py-1 text-[13.5px] font-medium", t.primary ? "bg-gold/15 text-gold ring-1 ring-gold/30" : "bg-ink/[0.06] text-ink")}>{t.label}{t.primary && <span className="ml-1.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] opacity-70">main</span>}</li>
              ))}
            </ul>
            <p className="mt-2.5 text-[13px] leading-snug text-muted">
              Tags updated from everything you wrote on this trade.
              {changed && before.length > 0 && <> {added.length > 0 && <>Added: <span className="text-ink">{added.join(", ")}</span>. </>}{removed.length > 0 && <>Removed: <span className="text-ink">{removed.join(", ")}</span>.</>}</>}
            </p>
          </>
        ) : (
          <p className="mt-1.5 text-[14px] leading-snug text-muted">Nothing was filed with enough confidence. Open the Review tab to pick a tag yourself.</p>
        )}
      </motion.div>

      {risk && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.62, ease: FLOW_EASE }} className="mt-4 w-full max-w-[26rem] text-left">
          <RiskMeter risk={risk} currency={currency} label="Day vs your limit" />
        </motion.div>
      )}
      <button type="button" onClick={onTalk} className="mt-6 text-[14px] font-medium text-gold hover:underline">Talk it through with MINATO</button>
    </div>
  );
}
