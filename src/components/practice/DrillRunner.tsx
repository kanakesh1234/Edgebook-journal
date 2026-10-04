"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Level, PracticeQuestion } from "@/lib/practice/engine";

export interface AnswerLog {
  fp: string;
  tag: string;
  prompt: string;
  level: Level;
  yourAnswer: string;
  correctAnswer: string;
  correct: boolean;
}

export interface DrillResult {
  correct: number;
  total: number;
  xp: number;
  accuracy: number;
  seconds: number;
  correctTags: string[];
  answers: AnswerLog[];
  /** Difficulty the trader finished on after live adjustment. */
  finalLevel: Level;
}

interface Props {
  title: string;
  /** Ordered candidate pool (fresh first). Questions of every level may be present. */
  pool: PracticeQuestion[];
  count: number;
  startLevel: Level;
  /** When true the level never moves during the session. */
  lockLevel?: boolean;
  onFinish: (result: DrillResult) => void;
  onClose: () => void;
  onRetry?: () => void;
}

const numeric = (text: string) => Number.parseFloat(text.replace(/[^0-9.\-]/g, ""));

function check(question: PracticeQuestion, response: string): boolean {
  if (question.kind === "choice") return response === question.answer;
  const value = numeric(response);
  return Number.isFinite(value) && Math.abs(value - Number(question.answer)) <= (question.tolerance ?? 0) + 1e-9;
}

/** Pick the unused question nearest the live level; earlier pool position (fresher) wins ties. */
function pick(pool: PracticeQuestion[], used: Set<string>, level: Level, lastTag: string | null): PracticeQuestion | null {
  let best: PracticeQuestion | null = null;
  let bestScore = Infinity;
  pool.forEach((q, index) => {
    if (used.has(q.id)) return;
    const score = Math.abs(q.level - level) * 100 + index + (q.tag === lastTag ? 40 : 0);
    if (score < bestScore) { best = q; bestScore = score; }
  });
  return best;
}

export function DrillRunner({ title, pool, count, startLevel, lockLevel, onFinish, onClose, onRetry }: Props) {
  const total = Math.min(count, pool.length);
  const used = useRef(new Set<string>());
  const log = useRef<AnswerLog[]>([]);
  const streak = useRef({ right: 0, wrong: 0 });
  const reported = useRef(false);
  const startedAt = useRef(Date.now());
  const [level, setLevel] = useState<Level>(startLevel);
  const [question, setQuestion] = useState<PracticeQuestion | null>(() => {
    const first = pick(pool, new Set(), startLevel, null);
    if (first) used.current.add(first.id);
    return first;
  });
  const [index, setIndex] = useState(0);
  const [response, setResponse] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [xp, setXp] = useState(0);
  const [combo, setCombo] = useState(0);
  const [levelNote, setLevelNote] = useState<string | null>(null);
  const [result, setResult] = useState<DrillResult | null>(null);

  const answered = response !== null;
  const right = answered && question ? check(question, response) : false;

  const submit = (value: string) => {
    if (!question || answered) return;
    const ok = check(question, value);
    setResponse(value);
    setXp((n) => n + (ok ? question.xp : 0));
    setCombo((n) => (ok ? n + 1 : 0));
    log.current.push({
      fp: question.fp, tag: question.tag, prompt: question.prompt, level: question.level, correct: ok,
      yourAnswer: value,
      correctAnswer: question.kind === "number" ? `${question.answer}${question.unit ? ` ${question.unit}` : ""}` : question.answer,
    });
    if (lockLevel) return;
    const s = streak.current;
    if (ok) { s.right += 1; s.wrong = 0; } else { s.wrong += 1; s.right = 0; }
    if (s.right >= 2 && level < 4) { setLevel((level + 1) as Level); s.right = 0; setLevelNote(`Level up → L${level + 1}`); }
    else if (s.wrong >= 2 && level > 1) { setLevel((level - 1) as Level); s.wrong = 0; setLevelNote(`Easing to L${level - 1}`); }
    else setLevelNote(null);
  };

  const finish = () => {
    const answers = log.current;
    const correct = answers.filter((a) => a.correct).length;
    const summary: DrillResult = {
      correct, total: answers.length, xp, accuracy: answers.length ? correct / answers.length : 0,
      seconds: Math.round((Date.now() - startedAt.current) / 1000),
      correctTags: answers.filter((a) => a.correct).map((a) => a.tag), answers, finalLevel: level,
    };
    setResult(summary);
    if (!reported.current) { reported.current = true; onFinish(summary); }
  };

  const next = () => {
    if (index + 1 >= total) { finish(); return; }
    const upcoming = pick(pool, used.current, level, question?.tag ?? null);
    if (!upcoming) { finish(); return; }
    used.current.add(upcoming.id);
    setQuestion(upcoming);
    setIndex((n) => n + 1);
    setResponse(null);
    setTyped("");
  };

  const shell = "fixed inset-0 z-50 overflow-y-auto bg-canvas text-ink";
  const ring = useMemo(() => (result ? Math.round(result.accuracy * 100) : 0), [result]);

  if (!question && !result) {
    return (
      <div className={cn(shell, "grid place-items-center p-6 text-center")}>
        <div><p className="text-lg font-semibold">No questions available yet.</p><Button className="mt-5" variant="gold" onClick={onClose}>Back</Button></div>
      </div>
    );
  }

  if (result) {
    const circumference = 2 * Math.PI * 52;
    return (
      <div className={shell}>
        <div className="mx-auto max-w-3xl px-5 py-10">
          <p className="text-[11px] font-bold uppercase tracking-[.2em] text-gold">Test summary</p>
          <h2 className="mt-2 font-display text-3xl">{title}</h2>
          <div className="mt-6 grid gap-6 sm:grid-cols-[1fr_auto]">
            <div className="grid grid-cols-3 gap-3">
              {[["Score", `${result.correct}/${result.total}`], ["Accuracy", `${ring}%`], ["Time", `${Math.floor(result.seconds / 60)}m ${String(result.seconds % 60).padStart(2, "0")}s`], ["XP earned", `+${result.xp}`], ["Final level", `L${result.finalLevel}`], ["Best combo", String(maxCombo(result.answers))]].map(([label, value]) => (
                <div key={label} className="panel p-4"><p className="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</p><p className="mt-1 font-mono text-xl">{value}</p></div>
              ))}
            </div>
            <svg viewBox="0 0 120 120" className="mx-auto h-32 w-32" aria-label={`${ring}% accuracy`}>
              <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeOpacity=".12" strokeWidth="12" />
              <circle cx="60" cy="60" r="52" fill="none" stroke="var(--gold-strong, #a8842f)" strokeWidth="12" strokeLinecap="round" strokeDasharray={`${(circumference * ring) / 100} ${circumference}`} transform="rotate(-90 60 60)" />
              <text x="60" y="66" textAnchor="middle" className="fill-current font-mono text-2xl">{ring}%</text>
            </svg>
          </div>
          <div className="panel mt-6 divide-y divide-line overflow-hidden">
            {result.answers.map((a, i) => (
              <div key={`${a.fp}-${i}`} className="grid grid-cols-[2rem_1fr_auto] items-start gap-3 px-4 py-3 text-sm">
                <span className="font-mono text-muted">{i + 1}</span>
                <div className="min-w-0"><p className="text-ink">{a.prompt}</p>{!a.correct && <p className="mt-1 text-xs text-muted">You: {a.yourAnswer} · Correct: <b className="text-ink">{a.correctAnswer}</b></p>}</div>
                <span className={cn("rounded-full px-2 py-0.5 text-xs font-bold", a.correct ? "bg-profit/15 text-profit" : "bg-loss/15 text-loss")}>{a.correct ? "✓" : "✗"} L{a.level}</span>
              </div>
            ))}
          </div>
          <div className="mt-6 flex gap-3">
            {onRetry && <Button variant="gold" onClick={onRetry}>Try again with new questions</Button>}
            <Button variant="outline" onClick={onClose}>Back to practice</Button>
          </div>
        </div>
      </div>
    );
  }

  const q = question!;
  return (
    <div className={shell}>
      <div className="mx-auto min-h-screen max-w-2xl px-5 py-6">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="text-xs text-muted hover:text-ink">Exit</button>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/10"><div className="h-full bg-gold-strong transition-all" style={{ width: `${(index / total) * 100}%` }} /></div>
          <span className="font-mono text-xs text-muted">{index + 1}/{total}</span>
        </div>
        <div className="mt-3 flex justify-between text-[10px] font-bold uppercase tracking-wider text-muted">
          <span>{title}</span>
          <span>L{level} · Combo ×{combo}{q.source === "ai" ? " · AI" : ""}</span>
        </div>

        <main className="mt-12">
          <p className="font-mono text-xs uppercase tracking-wider text-muted">{q.pin}</p>
          <h2 className="mt-4 text-2xl font-semibold leading-snug">{q.prompt}</h2>

          {!answered && q.kind === "choice" && (
            <div className="mt-8 grid gap-3">
              {q.choices?.map((choice, i) => (
                <button key={choice} onClick={() => submit(choice)} className="flex gap-3 rounded-xl border border-line bg-raised px-5 py-4 text-left text-sm transition hover:border-gold-strong">
                  <span className="font-mono text-muted">{String.fromCharCode(65 + i)}</span><span>{choice}</span>
                </button>
              ))}
            </div>
          )}

          {!answered && q.kind === "number" && (
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <input autoFocus inputMode="decimal" value={typed} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && typed.trim() && !Number.isNaN(numeric(typed))) submit(typed); }} placeholder="Type your answer" className="w-48 rounded-lg border border-line bg-raised px-4 py-3 font-mono text-lg outline-none focus:border-gold-strong" />
              <span className="text-sm text-muted">{q.unit}</span>
              <Button variant="gold" disabled={!typed.trim() || Number.isNaN(numeric(typed))} onClick={() => submit(typed)}>Lock in</Button>
            </div>
          )}

          {answered && (
            <div className={cn("mt-8 rounded-xl border p-5", right ? "border-profit/50 bg-profit/10" : "border-loss/50 bg-loss/10")}>
              <p className={cn("font-semibold", right ? "text-profit" : "text-loss")}>{right ? `Correct. +${q.xp} XP` : "Not quite."}</p>
              {!right && <p className="mt-1 text-sm">Answer: <b>{q.kind === "number" ? `${q.answer}${q.unit ? ` ${q.unit}` : ""}` : q.answer}</b></p>}
              <p className="mt-2 text-sm leading-relaxed text-muted">{q.explanation}</p>
              {q.evidence && <p className="mt-3 border-l-2 border-gold-strong pl-3 text-xs italic text-muted">From your notes: “{q.evidence}”</p>}
              {levelNote && <p className="mt-3 text-xs font-bold uppercase tracking-wider text-gold">{levelNote}</p>}
              <Button className="mt-5" variant="gold" onClick={next}>{index + 1 >= total ? "See results" : "Next"}</Button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function maxCombo(answers: AnswerLog[]): number {
  let best = 0, run = 0;
  for (const a of answers) { run = a.correct ? run + 1 : 0; best = Math.max(best, run); }
  return best;
}
