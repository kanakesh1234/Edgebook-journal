"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Field, TextArea } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { ImageUploader, type UploadItem } from "@/components/journal/image-uploader";
import { SparklesIcon } from "@/components/ui/icons";
import { MAX_ANSWER, MAX_NOTES, MAX_QUESTION } from "@/lib/practice/ict-cards";
import { saveCard } from "@/lib/practice/ict-store";
import type { IctCard } from "@/lib/practice/progress-ext";

const MAX_PICTURES = 4;

/** Write a question, attach pictures, type the answer. AI turns it into other question styles when you play. */
export function IctComposer({ open, card, onClose }: { open: boolean; card: IctCard | null; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [notes, setNotes] = useState("");
  const [images, setImages] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuestion(card?.question ?? ""); setAnswer(card?.answer ?? ""); setNotes(card?.notes ?? "");
    setImages((card?.images ?? []).map((meta) => ({ meta, blob: null }))); setTouched(false); setBusy(false);
  }, [open, card]);

  const q = question.trim(); const a = answer.trim();
  const errors = { question: q.length < 4 ? "Write the question." : undefined, answer: !a ? "Type the answer." : undefined };

  const save = async () => {
    setTouched(true);
    if (errors.question || errors.answer) return;
    setBusy(true);
    try {
      await saveCard({ question: q, answer: a, notes: notes.trim(), images }, card ?? undefined);
      toast.success(card ? "Question updated" : "Question added");
      onClose();
    } catch {
      toast.error("Couldn't save that question. Try again.");
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} size="lg" title={card ? "Edit question" : "New question"} description="Written in your words, played back in different styles.">
      <div className="space-y-5 overflow-y-auto px-6 py-5">
        <Field label="Question" htmlFor="ict-q" hint={`${question.length}/${MAX_QUESTION}`} error={touched ? errors.question : undefined}>
          <TextArea id="ict-q" value={question} maxLength={MAX_QUESTION} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. Price sweeps the Asian low, then displaces up through an FVG. Where do I look to enter?" className="min-h-24" invalid={touched && !!errors.question} />
        </Field>

        <Field label="Pictures" hint={`Optional · up to ${MAX_PICTURES} · paste, drop or browse`}>
          <ImageUploader items={images} onChange={setImages} max={MAX_PICTURES} />
        </Field>

        <Field label="Answer" htmlFor="ict-a" hint={`${answer.length}/${MAX_ANSWER}`} error={touched ? errors.answer : undefined}>
          <TextArea id="ict-a" value={answer} maxLength={MAX_ANSWER} onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer, in your own words — this is what the game treats as correct." className="min-h-20" invalid={touched && !!errors.answer} />
        </Field>

        <Field label="Why it's right" htmlFor="ict-n" hint={`Optional · ${notes.length}/${MAX_NOTES}`}>
          <TextArea id="ict-n" value={notes} maxLength={MAX_NOTES} onChange={(e) => setNotes(e.target.value)} placeholder="A reminder shown after you answer." className="min-h-16" />
        </Field>

        <p className="flex items-start gap-2.5 rounded-[14px] border border-line bg-raised/70 px-3.5 py-3 text-[12.5px] leading-snug text-muted">
          <SparklesIcon className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
          <span>When you play, AI rewrites this into multiple choice, true/false and fill-in-the-blank. Your answer is treated as the truth — it never adds facts of its own.</span>
        </p>
      </div>
      <div className="flex justify-end gap-2.5 border-t border-line px-6 py-4">
        <Button variant="subtle" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="gold" onClick={() => void save()} loading={busy}>{card ? "Save changes" : "Add question"}</Button>
      </div>
    </Modal>
  );
}
