"use client";

import { useEffect, useState } from "react";
import { AnimatePresence } from "motion/react";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import { ImageUploader, type UploadItem } from "@/components/journal/image-uploader";
import { Chip, Hint, IconTile, Label, PrimaryButton, QuietButton, Reveal, SheetFrame, StepTitle, TextBox, useIsDesktop } from "@/components/journal/flow-ui";
import { SparkleIcon } from "./icons";
import { AutoField } from "./auto-field";
import { TagField } from "./tag-field";
import { useApp } from "@/lib/store";
import { MAX_ANSWER, MAX_NOTES, MAX_QUESTION } from "@/lib/practice/ict-cards";
import { canonConcept, cleanConcept, conceptSuggestions, MAX_CONCEPT, normTags, tagSuggestions } from "@/lib/practice/ict-library";
import { saveCard } from "@/lib/practice/ict-store";
import type { GameProgress, IctCard } from "@/lib/practice/progress-ext";

const MAX_PICTURES = 4;
const STYLES = ["Multiple choice", "True / false", "Fill in the blank"];

/**
 * Write a question, attach pictures, type the answer. Built on the Plan Trade sheet:
 * a glass top bar and action bar, one calm column, and each step unfolds once the one before it has been answered.
 * AI turns it into other question styles when you play.
 */
export function IctComposer({ open, card, onClose }: { open: boolean; card: IctCard | null; onClose: () => void }) {
  const desktop = useIsDesktop();
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [notes, setNotes] = useState("");
  const [concept, setConcept] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [images, setImages] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuestion(card?.question ?? ""); setAnswer(card?.answer ?? ""); setNotes(card?.notes ?? ""); setConcept(card?.concept ?? ""); setTags(card?.tags ?? []);
    setImages((card?.images ?? []).map((meta) => ({ meta, blob: null }))); setBusy(false);
  }, [open, card]);

  // The rest of the deck: concepts and tags to offer, so the same idea is always spelled the same way.
  const deck = useApp((st) => (st.settings.practiceProgress as GameProgress | undefined)?.ictCards) ?? [];
  const others = card ? deck.filter((c) => c.id !== card.id) : deck;
  const conceptChoices = conceptSuggestions(others);
  const tagChoices = tagSuggestions(others, tags);

  const q = question.trim();
  const a = answer.trim();
  const qOk = q.length >= 4;
  const aOk = a.length > 0;
  const c = cleanConcept(concept);
  const cOk = c.length > 0;
  const ready = qOk && aOk && cOk;
  const editing = !!card;

  const save = async () => {
    if (!ready || busy) return;
    setBusy(true);
    try {
      await saveCard({ question: q, answer: a, notes: notes.trim(), concept: canonConcept(c, others), tags: normTags(tags), images }, card ?? undefined);
      toast.success(editing ? "Question updated" : "Question added");
      onClose();
    } catch {
      toast.error("Couldn't save that question. Try again.");
      setBusy(false);
    }
  };

  // ⌘/Ctrl + Enter saves from anywhere, including inside a field (same as Plan & Record).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); void save(); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ready, busy, q, a, c, tags, notes, images]);

  const hint = !qOk ? "Write the question to continue" : !aOk ? "Now type the answer" : !cOk ? "Name the concept to file it under" : null;

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} size={desktop ? "lg" : "md"} label={editing ? "Edit question" : "New question"}>
      <SheetFrame
        onClose={busy ? () => {} : onClose}
        hint={<Hint text={hint} />}
        actions={
          <>
            <QuietButton onClick={onClose} disabled={busy}>Cancel</QuietButton>
            <PrimaryButton shortcut disabled={!ready} loading={busy} onClick={() => void save()}>{editing ? "Save" : "Add question"}</PrimaryButton>
          </>
        }
      >
        <div className="mx-auto w-full max-w-[34rem] pb-2 pt-3 sm:pt-5">
          <StepTitle title={editing ? "Edit question" : "New question"} subtitle="Written in your words, played back in different styles." />

          <div className="pt-8">
            <div className="space-y-2.5">
              <Label done={qOk} htmlFor="ict-q">Your question</Label>
              <AutoField id="ict-q" autoFocus={!editing} minRows={3} value={question} maxLength={MAX_QUESTION} count={{ n: question.length, max: MAX_QUESTION }} onChange={(e) => setQuestion(e.target.value)} placeholder="Price sweeps the Asian low, then displaces up through an FVG. Where do I look to enter?" />
            </div>
          </div>

          <AnimatePresence initial={false}>
            {qOk && (
              <Reveal key="photos">
                <div className="space-y-2.5">
                  <Label hint={`optional · up to ${MAX_PICTURES}`} done={images.length > 0}>Photos</Label>
                  <ImageUploader items={images} onChange={setImages} max={MAX_PICTURES} variant="apple" />
                </div>
              </Reveal>
            )}
            {qOk && (
              <Reveal key="answer" delay={0.08}>
                <div className="space-y-2.5">
                  <Label done={aOk} htmlFor="ict-a" hint="what the game treats as correct">Answer</Label>
                  <AutoField id="ict-a" minRows={2} value={answer} maxLength={MAX_ANSWER} count={{ n: answer.length, max: MAX_ANSWER }} onChange={(e) => setAnswer(e.target.value)} placeholder="In your own words." />
                </div>
              </Reveal>
            )}
            {qOk && aOk && (
              <Reveal key="concept" delay={0.04}>
                <div className="space-y-2.5">
                  <Label done={cOk} htmlFor="ict-c" hint="the idea this tests">Concept</Label>
                  <TextBox id="ict-c" value={concept} maxLength={MAX_CONCEPT} autoComplete="off" onChange={(e) => setConcept(e.target.value)} placeholder="Fair value gap" />
                  {conceptChoices.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-0.5" role="group" aria-label="Concepts">
                      {conceptChoices.map((name) => <Chip key={name} selected={c.toLowerCase() === name.toLowerCase()} onClick={() => setConcept(name)}>{name}</Chip>)}
                    </div>
                  )}
                </div>
              </Reveal>
            )}
            {qOk && aOk && cOk && (
              <Reveal key="tags" delay={0.04}>
                <div className="space-y-2.5">
                  <Label done={tags.length > 0} htmlFor="ict-t" hint="optional · to filter and search">Tags</Label>
                  <TagField id="ict-t" value={tags} onChange={setTags} suggestions={tagChoices} />
                </div>
              </Reveal>
            )}
            {qOk && aOk && (
              <Reveal key="why" delay={0.04}>
                <div className="space-y-2.5">
                  <Label done={notes.trim().length > 0} htmlFor="ict-n" hint="optional">Why it’s right</Label>
                  <AutoField id="ict-n" minRows={2} value={notes} maxLength={MAX_NOTES} count={{ n: notes.length, max: MAX_NOTES }} onChange={(e) => setNotes(e.target.value)} placeholder="A reminder shown after you answer." />
                </div>
              </Reveal>
            )}
            {qOk && aOk && (
              <Reveal key="how" delay={0.12}>
                <div className="flex gap-3.5 rounded-[22px] border border-line bg-ink/[0.025] p-4 sm:p-5">
                  <IconTile tile="bg-gradient-to-b from-[#9b8cf5] to-[#6f5be0]"><SparkleIcon className="h-[17px] w-[17px]" /></IconTile>
                  <div className="min-w-0">
                    <p className="text-[14.5px] font-semibold tracking-[-0.012em] text-ink">How it plays</p>
                    <p className="mt-1 text-[13.5px] leading-snug text-muted">AI rewrites it in a few styles. Your answer is the truth, and it never adds facts of its own.</p>
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {STYLES.map((s) => <span key={s} className="rounded-full border border-line bg-raised px-2.5 py-1 text-[12px] font-medium text-muted">{s}</span>)}
                    </div>
                  </div>
                </div>
              </Reveal>
            )}
          </AnimatePresence>
        </div>
      </SheetFrame>
    </Modal>
  );
}
