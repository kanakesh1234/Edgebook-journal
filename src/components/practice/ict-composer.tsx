"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Spinner } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { ImageUploader, type UploadItem } from "@/components/journal/image-uploader";
import { SparkleIcon } from "./icons";
import "./practice.css";
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

  const chars = (n: number, max: number) => (n > max * 0.85 ? `${n}/${max}` : "");

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} size="md" label={card ? "Edit question" : "New question"} bodyClassName="flex flex-col">
      {/* Sheet bar: Cancel · title · primary action, like an iOS sheet. */}
      <div className="ict-bar">
        <button type="button" className="ict-bar-btn" onClick={onClose} disabled={busy}>Cancel</button>
        <h2 className="ict-bar-title">{card ? "Edit question" : "New question"}</h2>
        <button type="button" className="ict-bar-btn ict-bar-primary" onClick={() => void save()} disabled={busy}>
          {busy ? <Spinner className="h-4 w-4" /> : card ? "Save" : "Add"}
        </button>
      </div>

      <div className="ict-scroll">
        <p className="ict-lede">Written in your words, played back in different styles.</p>

        <section className="ict-group">
          <label htmlFor="ict-q" className="ict-label">Question</label>
          <div className="ict-card" data-invalid={touched && errors.question ? "true" : undefined}>
            <textarea id="ict-q" className="ict-input" rows={4} value={question} maxLength={MAX_QUESTION} onChange={(e) => setQuestion(e.target.value)} placeholder="Price sweeps the Asian low, then displaces up through an FVG. Where do I look to enter?" aria-invalid={touched && !!errors.question || undefined} />
            <span className="ict-count" aria-hidden="true">{chars(question.length, MAX_QUESTION)}</span>
          </div>
          {touched && errors.question && <p role="alert" className="ict-error">{errors.question}</p>}
        </section>

        <section className="ict-group">
          <div className="ict-label-row"><span className="ict-label">Photos</span><span className="ict-hint">Up to {MAX_PICTURES}. Paste, drop or browse.</span></div>
          <ImageUploader items={images} onChange={setImages} max={MAX_PICTURES} variant="apple" />
        </section>

        <section className="ict-group">
          <label htmlFor="ict-a" className="ict-label">Answer</label>
          <div className="ict-card" data-invalid={touched && errors.answer ? "true" : undefined}>
            <textarea id="ict-a" className="ict-input" rows={3} value={answer} maxLength={MAX_ANSWER} onChange={(e) => setAnswer(e.target.value)} placeholder="In your own words. This is what the game treats as correct." aria-invalid={touched && !!errors.answer || undefined} />
            <span className="ict-count" aria-hidden="true">{chars(answer.length, MAX_ANSWER)}</span>
          </div>
          {touched && errors.answer && <p role="alert" className="ict-error">{errors.answer}</p>}
        </section>

        <section className="ict-group">
          <div className="ict-label-row"><label htmlFor="ict-n" className="ict-label">Why it’s right</label><span className="ict-hint">Optional</span></div>
          <div className="ict-card">
            <textarea id="ict-n" className="ict-input" rows={2} value={notes} maxLength={MAX_NOTES} onChange={(e) => setNotes(e.target.value)} placeholder="A reminder shown after you answer." />
            <span className="ict-count" aria-hidden="true">{chars(notes.length, MAX_NOTES)}</span>
          </div>
        </section>

        <p className="ict-foot"><SparkleIcon className="h-4 w-4 shrink-0" /><span>When you play, AI rewrites this as multiple choice, true/false and fill-in-the-blank. Your answer is the truth. It never adds facts of its own.</span></p>
      </div>
    </Modal>
  );
}
