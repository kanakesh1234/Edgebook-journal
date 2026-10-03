"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useApp } from "@/lib/store";
import { addDays, todayKey } from "@/lib/format";
import { matrixStreak } from "@/lib/matrix/attempt";
import { matrixAccuracy, matrixTopicEvidence } from "@/lib/matrix/overview";
import { AccuracyRing, Card, Pill, ProgressBar } from "@/components/matrix/ui";

export default function PracticeProgressPage() {
  const entries = useApp((state) => state.entries);
  const settings = useApp((state) => state.settings);
  const progress = settings.practiceProgress ?? { xp: 0, streak: 0, freezeDays: 1 };
  const matrix = settings.matrixProgress ?? { xp: 0, tokens: 0, tradeStates: {} };
  const mastery = progress.masteryByTag ?? {};
  const total = Object.values(mastery).reduce((sum, value) => sum + value, 0);
  const difficulty = total >= 18 ? "prediction" : total >= 10 ? "application" : total >= 4 ? "recall" : "recognition";
  const days = useMemo(() => Array.from({ length: 28 }, (_, index) => addDays(todayKey(), index - 27)), []);
  const done = new Set(progress.completedMissionDates ?? []);
  const accuracy = matrixAccuracy(matrix);
  const topics = matrixTopicEvidence(entries, matrix);
  const testedTrades = Object.values(matrix.tradeStates ?? {}).filter((state) => (state.attempts?.length ?? 0) > 0).length;
  return <div className="mx-auto max-w-3xl space-y-8 pb-10"><Link href="/practice" className="text-sm text-muted underline underline-offset-4">Practise</Link><header><h1 className="text-2xl font-semibold tracking-tight text-ink">Progress</h1><p className="mt-2 text-sm text-muted">Evidence of your practice and Matrix study.</p></header><Card><div className="flex flex-wrap items-center justify-between gap-5"><div><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-gold">Matrix tracker</p><h2 className="mt-1 text-lg font-semibold text-ink">Real-trade learning</h2><div className="mt-3 flex flex-wrap gap-2"><Pill>+{matrix.xp} XP</Pill><Pill>{matrix.tokens} tokens</Pill><Pill>{matrixStreak(matrix)} day streak</Pill></div></div><AccuracyRing value={(accuracy ?? 0) * 100} label={accuracy == null ? "No attempts" : "Matrix accuracy"} /></div><div className="mt-5 grid gap-3 border-t border-line pt-4 sm:grid-cols-3"><Stat label="Tests completed" value={String(Object.values(matrix.tradeStates ?? {}).flatMap((state) => state.attempts ?? []).length)} /><Stat label="Trades studied" value={String(testedTrades)} /><Stat label="Saved takeaways" value={String(matrix.takeaways?.length ?? 0)} /></div></Card><section><div className="flex items-end justify-between gap-3"><div><h2 className="text-sm font-semibold text-ink">Topic mastery</h2><p className="mt-1 text-xs text-muted">Only topics found in recorded setups, notes, or review concepts appear here.</p></div><Link href="/practice/matrix" className="text-xs font-semibold text-gold hover:underline">Open Matrix →</Link></div>{topics.length ? <Card className="mt-3 space-y-4">{topics.map((topic) => <div key={topic.topic}><div className="flex justify-between gap-3 text-xs"><span className="font-medium text-ink">{topic.topic}</span><span className="text-muted">{topic.total ? `${topic.correct}/${topic.total} correct` : `${topic.evidenceTrades} recorded trade${topic.evidenceTrades === 1 ? "" : "s"}`}</span></div><div className="mt-2"><ProgressBar value={(topic.accuracy ?? 0) * 100} /></div></div>)}</Card> : <Card className="mt-3"><p className="text-sm text-muted">No topic evidence is recorded yet. Add setups, notes, or review concepts to build these bars.</p></Card>}</section><section className="border-y border-line py-5"><p className="text-sm text-ink">Sets won</p><p className="mt-1 text-xs text-muted">{progress.perfectSets ?? 0} perfect sets</p></section><section className="border-b border-line pb-5"><p className="text-sm text-ink">Difficulty ladder</p><p className="mt-2 text-xs text-muted">Recognition · recall · application · prediction</p><p className="mt-1 text-sm text-gold">Current: {difficulty}</p></section><section className="border-b border-line pb-5"><p className="text-sm text-ink">Practice mastery scrolls</p><div className="mt-3 grid grid-cols-2 gap-px border border-line sm:grid-cols-4">{Object.entries(mastery).length ? Object.entries(mastery).map(([tag, value]) => <div key={tag} className="p-3 text-xs text-muted"><p className="text-ink">{tag}</p><p className="mt-1">{value} correct</p></div>) : <p className="col-span-full p-3 text-xs text-faint">Complete drills to begin a collection.</p>}</div></section><section><p className="text-sm text-ink">Practice calendar</p><div className="mt-3 grid grid-cols-7 gap-1">{days.map((day) => <span key={day} title={day} className={done.has(day) ? "aspect-square border border-gold bg-gold" : "aspect-square border border-line"} />)}</div></section></div>;
}

function Stat({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] font-semibold uppercase tracking-wide text-faint">{label}</p><p className="mt-1 text-sm font-semibold text-ink">{value}</p></div>; }
