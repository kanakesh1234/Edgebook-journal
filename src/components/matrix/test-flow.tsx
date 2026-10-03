"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useApp } from "@/lib/store";
import { askMinatoAboutMatrixQuestion, buildMatrixTestFromProgress, type MatrixQuestion } from "@/lib/matrix/questions";
import { answerIsCorrect, completeMatrixAttempt, type MatrixSubmittedAnswer } from "@/lib/matrix/attempt";
import { isMatrixGameMode, MATRIX_MODE_DETAILS, type MatrixGameMode } from "@/lib/matrix/game-modes";
import { Button3D, Card, Pill, ProgressBar } from "@/components/matrix/ui";

type Outcome = { correct: boolean; explanation: string };
type SavedAttempt = { version: 2; tradeId: string; mode: MatrixGameMode; questions: MatrixQuestion[]; index: number; startedAt: number; questionStartedAt: number; answers: Record<string, MatrixSubmittedAnswer>; outcomes: Record<string, Outcome> };

const storageKey = (id: string) => `edgebook.matrix.attempt.v2.${id}`;
const seconds = (time: number) => `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, "0")}`;

export function MatrixTestFlow({ tradeId }: { tradeId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const entries = useApp((state) => state.entries);
  const settings = useApp((state) => state.settings);
  const entry = useMemo(() => entries.find((item) => item.id === tradeId), [entries, tradeId]);
  const requested = searchParams.get("mode");
  const requestedMode: MatrixGameMode = isMatrixGameMode(requested) ? requested : "classic";
  const [attempt, setAttempt] = useState<SavedAttempt | null>(null);
  const [ready, setReady] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!entry || ready) return;
    let restored: SavedAttempt | null = null;
    try {
      const value = JSON.parse(localStorage.getItem(storageKey(tradeId)) ?? "null") as SavedAttempt | null;
      if (value?.version === 2 && value.tradeId === tradeId && value.mode === requestedMode && Array.isArray(value.questions) && value.questions.length) restored = value;
    } catch { /* a corrupted browser cache starts a fresh attempt */ }
    if (restored) setAttempt(restored);
    else {
      const generated = buildMatrixTestFromProgress(entry, settings.matrixProgress, Date.now(), requestedMode);
      if (generated.questions.length === 8) {
        const fresh: SavedAttempt = { version: 2, tradeId, mode: requestedMode, questions: generated.questions, index: 0, startedAt: Date.now(), questionStartedAt: Date.now(), answers: {}, outcomes: {} };
        setAttempt(fresh);
        void frameWithMinato(fresh, setAttempt);
      }
    }
    setReady(true);
  }, [entry, ready, requestedMode, settings.matrixProgress, tradeId]);

  useEffect(() => { if (attempt) localStorage.setItem(storageKey(tradeId), JSON.stringify(attempt)); }, [attempt, tradeId]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, []);

  if (!entry) return <Missing />;
  if (!ready) return <div className="py-16 text-center text-sm text-muted">Preparing your Matrix test…</div>;
  if (!attempt) return <InsufficientEvidence tradeId={tradeId} />;
  const question = attempt.questions[attempt.index]!;
  const outcome = attempt.outcomes[question.signature];
  const elapsed = (now - attempt.startedAt) / 1000;
  const questionElapsed = (now - attempt.questionStartedAt) / 1000;
  const answer = attempt.answers[question.signature] ?? "";
  const limit = MATRIX_MODE_DETAILS[attempt.mode].secondsPerQuestion;
  const expired = limit != null && questionElapsed >= limit;

  const checkAnswer = async () => {
    if (expired) return;
    const submitted = answer === "" ? null : answer;
    const correct = answerIsCorrect(question, submitted);
    setAttempt((current) => current ? { ...current, answers: { ...current.answers, [question.signature]: submitted }, outcomes: { ...current.outcomes, [question.signature]: { correct, explanation: question.explanation } } } : current);
    const minato = await askMinatoAboutMatrixQuestion("explain", [question], { [question.signature]: submitted });
    const explanation = minato?.[0]?.explanation;
    if (explanation) setAttempt((current) => current ? { ...current, outcomes: { ...current.outcomes, [question.signature]: { correct, explanation } } } : current);
  };
  const next = async () => {
    if (attempt.index < attempt.questions.length - 1) { setAttempt({ ...attempt, index: attempt.index + 1, questionStartedAt: Date.now() }); return; }
    if (saving) return;
    setSaving(true);
    const matrix = settings.matrixProgress ?? { xp: 0, tokens: 0, tradeStates: {} };
    const updated = completeMatrixAttempt({ progress: matrix, tradeId, questions: attempt.questions, answers: attempt.answers, explanations: Object.fromEntries(Object.entries(attempt.outcomes).map(([signature, value]) => [signature, value.explanation])), durationSeconds: (Date.now() - attempt.startedAt) / 1000, mode: attempt.mode });
    try { await useApp.getState().updateSettings({ matrixProgress: updated }); localStorage.removeItem(storageKey(tradeId)); router.replace(`/practice/matrix/${tradeId}/summary`); } finally { setSaving(false); }
  };
  const skip = () => { if (!outcome) setAttempt((current) => current ? { ...current, answers: { ...current.answers, [question.signature]: null }, outcomes: { ...current.outcomes, [question.signature]: { correct: false, explanation: question.explanation } } } : current); };
  const abandon = () => { if (window.confirm("Abandon this Matrix attempt? Your in-progress answers will be cleared.")) { localStorage.removeItem(storageKey(tradeId)); router.push(`/practice/matrix/${tradeId}`); } };

  return <div className="mx-auto max-w-3xl space-y-5 pb-10"><header className="flex items-start justify-between gap-3"><div><button onClick={abandon} className="text-xs text-muted hover:text-ink hover:underline">Abandon attempt</button><h1 className="mt-2 text-2xl font-semibold text-ink">{MATRIX_MODE_DETAILS[attempt.mode].label} Matrix test</h1><p className="mt-1 text-sm text-muted">Trade: {entry.instrument} · {entry.date}</p></div><div className="text-right"><Pill>{seconds(elapsed)}</Pill><p className={`mt-1 text-[10px] ${expired ? "text-loss" : "text-faint"}`}>Question {limit == null ? seconds(questionElapsed) : `${Math.max(0, Math.ceil(limit - questionElapsed))}s`}</p></div></header><Card><ProgressBar value={(attempt.index / attempt.questions.length) * 100} label={`Question ${attempt.index + 1} of ${attempt.questions.length}`} /><p className="mt-5 text-[10px] font-semibold uppercase tracking-wide text-gold">{attempt.mode !== "classic" ? `${MATRIX_MODE_DETAILS[attempt.mode].label} · ` : ""}{question.type.replaceAll("-", " ")}</p><h2 className="mt-2 text-lg font-semibold leading-relaxed text-ink">{question.prompt}</h2>{question.unit && <p className="mt-1 text-xs text-muted">Answer in {question.unit}.</p>}{expired && !outcome && <p className="mt-3 text-xs text-loss">Time expired. Skip this question to continue.</p>}<label className="mt-5 block text-xs font-medium text-muted" htmlFor="matrix-answer">Your answer</label><input id="matrix-answer" disabled={!!outcome || expired} value={String(answer)} onChange={(event) => setAttempt({ ...attempt, answers: { ...attempt.answers, [question.signature]: event.target.value } })} onKeyDown={(event) => { if (event.key === "Enter" && !outcome) void checkAnswer(); }} className="mt-2 w-full rounded-control border border-line bg-raised px-3 py-2.5 text-sm text-ink" placeholder={typeof question.answer === "number" ? "Enter a number" : "Write your answer"} />{outcome && <div className={`mt-4 rounded-control border p-3 ${outcome.correct ? "border-profit bg-profit/[.08]" : "border-loss bg-loss/[.08]"}`}><p className={`text-sm font-semibold ${outcome.correct ? "text-profit-deep" : "text-loss-deep"}`}>{outcome.correct ? `Correct · +${10 * MATRIX_MODE_DETAILS[attempt.mode].xpMultiplier} XP · +1 token` : `Not quite — recorded answer: ${question.answer}${question.unit ? ` ${question.unit}` : ""}`}</p><p className="mt-1 text-xs leading-relaxed text-muted">{outcome.explanation}</p></div>}<div className="mt-5 flex flex-wrap justify-between gap-2"><Button3D tone="secondary" disabled={!!outcome} onClick={skip}>Skip</Button3D>{outcome ? <Button3D disabled={saving} onClick={() => void next()}>{attempt.index === attempt.questions.length - 1 ? "Finish test" : "Next question →"}</Button3D> : <Button3D disabled={answer === "" || expired} onClick={() => void checkAnswer()}>Check answer</Button3D>}</div></Card></div>;
}

async function frameWithMinato(attempt: SavedAttempt, setAttempt: React.Dispatch<React.SetStateAction<SavedAttempt | null>>) {
  const framed = await askMinatoAboutMatrixQuestion("frame", attempt.questions);
  if (!framed?.length) return;
  const bySignature = new Map(framed.map((item) => [item.signature, item]));
  setAttempt((current) => current && current.startedAt === attempt.startedAt ? { ...current, questions: current.questions.map((question) => { const item = bySignature.get(question.signature); return item ? { ...question, prompt: item.prompt, explanation: item.explanation } : question; }) } : current);
}

function Missing() { return <div className="py-16 text-center"><p className="text-sm text-muted">Trade not found.</p><Link href="/practice/matrix" className="mt-3 inline-block text-sm text-gold underline">Back to Matrix</Link></div>; }
function InsufficientEvidence({ tradeId }: { tradeId: string }) { return <div className="mx-auto max-w-xl py-16 text-center"><p className="text-sm font-semibold text-ink">This trade needs more recorded evidence first.</p><p className="mt-2 text-sm text-muted">Matrix will not invent questions. Add notes, setup details, risk levels, or a review to create an eight-question test.</p><Link href={`/practice/matrix/${tradeId}`} className="mt-4 inline-block text-sm text-gold underline">Back to trade</Link></div>; }
