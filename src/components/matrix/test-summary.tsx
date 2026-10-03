"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { matrixStreak } from "@/lib/matrix/attempt";
import { AccuracyRing, Button3D, Card, Pill } from "@/components/matrix/ui";

export function MatrixTestSummary({ tradeId }: { tradeId: string }) {
  const entries = useApp((state) => state.entries);
  const settings = useApp((state) => state.settings);
  const [wrongOnly, setWrongOnly] = useState(false);
  const entry = useMemo(() => entries.find((item) => item.id === tradeId), [entries, tradeId]);
  const matrix = settings.matrixProgress ?? { xp: 0, tokens: 0, tradeStates: {} };
  const attempt = matrix.tradeStates?.[tradeId]?.attempts?.at(-1);
  if (!entry || !attempt?.questions) return <div className="py-16 text-center"><p className="text-sm text-muted">No completed Matrix test was found for this trade.</p><Link href={`/practice/matrix/${tradeId}`} className="mt-3 inline-block text-sm text-gold underline">Back to trade</Link></div>;
  const rows = wrongOnly ? attempt.questions.filter((question) => !question.correct) : attempt.questions;
  const correct = attempt.correct ?? attempt.questions.filter((question) => question.correct).length;
  const total = attempt.total ?? attempt.questions.length;
  return <div className="mx-auto max-w-4xl space-y-5 pb-10"><header><nav className="text-xs text-muted"><Link href={`/practice/matrix/${tradeId}`} className="hover:text-ink hover:underline">Back to trade</Link></nav><h1 className="mt-2 text-2xl font-semibold text-ink">Test summary</h1><p className="mt-1 text-sm text-muted">{entry.instrument} · {entry.date}</p></header><Card className="flex flex-wrap items-center justify-between gap-6"><div><p className="text-sm font-semibold text-ink">{correct} / {total} correct</p><p className="mt-1 text-xs text-muted">{Math.round((attempt.accuracy ?? 0) * 100)}% accuracy · {Math.round(attempt.durationSeconds ?? 0)} seconds</p><div className="mt-3 flex gap-2"><Pill>+{matrix.xp} total XP</Pill><Pill>{matrixStreak(matrix)} day streak</Pill></div></div><AccuracyRing value={(attempt.accuracy ?? 0) * 100} /></Card><div className="flex flex-wrap justify-between gap-2"><h2 className="text-sm font-semibold text-ink">Question breakdown</h2><Button3D tone="secondary" onClick={() => setWrongOnly((value) => !value)}>{wrongOnly ? "Show all" : "Review wrong"}</Button3D></div><div className="space-y-2">{rows.map((question, index) => <Card key={question.signature} className={question.correct ? "border-profit/40" : "border-loss/40"}><div className="flex items-start justify-between gap-3"><div><p className="text-[10px] font-semibold uppercase tracking-wide text-faint">{index + 1}. {question.type.replaceAll("-", " ")}</p><p className="mt-1 text-sm font-medium text-ink">{question.prompt}</p><p className="mt-2 text-xs text-muted">Your answer: {question.answer == null ? "Skipped" : String(question.answer)} · Correct: {String(question.expected)}</p><p className="mt-1 text-xs leading-relaxed text-muted">{question.explanation}</p></div><Pill tone={question.correct ? "green" : "muted"}>{question.correct ? "Correct" : "Review"}</Pill></div></Card>)}</div><div className="flex flex-wrap justify-between gap-2"><Link href={`/practice/matrix/${tradeId}`}><Button3D tone="secondary">Back to trade</Button3D></Link><Link href={`/practice/matrix/${tradeId}/test`}><Button3D>Try again →</Button3D></Link></div></div>;
}
