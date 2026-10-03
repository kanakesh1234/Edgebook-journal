"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import type { JournalEntry } from "@/lib/types";
import { addDays, todayKey } from "@/lib/format";
import { Button3D, Card, Pill, ProgressBar } from "@/components/matrix/ui";

type BossQuestion = { id: string; trade: JournalEntry; prompt: string; answer: number; explanation: string };

function usable(entry: JournalEntry) { return entry.entryPrice != null && entry.stopLoss != null && entry.direction != null && entry.entryPrice !== entry.stopLoss; }
function buildBoss(entries: JournalEntry[], nonce: number): BossQuestion[] {
  const pool = entries.filter(usable).sort((a, b) => a.id.localeCompare(b.id));
  const chosen = pool.slice(nonce % Math.max(1, pool.length)).concat(pool).slice(0, Math.min(3, pool.length));
  return Array.from({ length: 8 }, (_, index) => {
    const multiple = .5 + ((nonce + index) % 16) * .25;
    const trade = chosen[index % chosen.length]!;
    const risk = Math.abs(trade.entryPrice! - trade.stopLoss!);
    const target = trade.entryPrice! + (trade.direction === "long" ? 1 : -1) * risk * multiple;
    return { id: `${nonce}-${trade.id}-${multiple}`, trade, prompt: `Boss round: using ${trade.instrument} on ${trade.date}, calculate the ${multiple}R target from its recorded entry and stop.`, answer: Number(target.toFixed(4)), explanation: `Recorded risk: ${risk} points. A ${multiple}R target is projected from the recorded ${trade.direction} entry.` };
  });
}

export function WeekendBoss() {
  const entries = useApp((state) => state.entries);
  const weekend = [0, 6].includes(new Date().getDay());
  const weekStart = addDays(todayKey(), -new Date().getDay());
  const available = entries.filter((entry) => entry.date >= weekStart && entry.date <= todayKey() && usable(entry));
  const [nonce, setNonce] = useState(() => Date.now());
  const questions = useMemo(() => available.length >= 2 ? buildBoss(available, nonce) : [], [available, nonce]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [correct, setCorrect] = useState<number | null>(null);
  const restart = () => { setNonce((value) => value + 1); setIndex(0); setAnswer(""); setCorrect(null); };
  if (!weekend) return <div className="mx-auto max-w-2xl py-16 text-center"><p className="text-sm font-semibold text-ink">Weekend Boss returns on Saturday.</p><p className="mt-2 text-sm text-muted">It is intentionally available only on Saturday and Sunday.</p><Link href="/practice/matrix/modes" className="mt-4 inline-block text-sm text-gold underline">Back to game modes</Link></div>;
  if (available.length < 2) return <div className="mx-auto max-w-2xl py-16 text-center"><p className="text-sm font-semibold text-ink">Weekend Boss needs two trades from this week with entry, stop, and direction.</p><p className="mt-2 text-sm text-muted">No trades are invented or filled in from screenshots.</p><Link href="/practice/matrix" className="mt-4 inline-block text-sm text-gold underline">Back to Matrix</Link></div>;
  const question = questions[index]!;
  const checked = correct != null;
  return <div className="mx-auto max-w-3xl space-y-5 pb-10"><header><nav className="text-xs text-muted"><Link href="/practice/matrix/modes" className="hover:text-ink hover:underline">Game modes</Link> / <span className="text-ink">Weekend Boss</span></nav><div className="mt-3 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold text-ink">Weekend Boss</h1><p className="mt-1 text-sm text-muted">This week’s trade matrix: math and revision from your own records.</p></div><Pill tone="green">Weekend active</Pill></div></header><Card className="border-loss/35"><ProgressBar value={(index / questions.length) * 100} label={`Boss round ${index + 1} of ${questions.length}`} /><p className="mt-5 text-xs font-semibold text-gold">{question.trade.instrument} · {question.trade.date}</p><h2 className="mt-2 text-lg font-semibold leading-relaxed text-ink">{question.prompt}</h2><input value={answer} disabled={checked} inputMode="decimal" onChange={(event) => setAnswer(event.target.value)} className="mt-5 w-full rounded-control border border-line bg-raised px-3 py-2.5 text-sm text-ink" placeholder="Target price" />{checked && <div className={`mt-4 rounded-control border p-3 ${correct ? "border-profit bg-profit/[.08]" : "border-loss bg-loss/[.08]"}`}><p className="text-sm font-semibold text-ink">{correct ? "Correct." : `Answer: ${question.answer}`}</p><p className="mt-1 text-xs text-muted">{question.explanation}</p></div>}<div className="mt-5 flex justify-between gap-2">{checked && index === questions.length - 1 ? <Button3D tone="secondary" onClick={restart}>Play a fresh Boss →</Button3D> : <span />}{checked ? <Button3D onClick={() => { setIndex((value) => value + 1); setAnswer(""); setCorrect(null); }}>{index === questions.length - 1 ? "Finish" : "Next round →"}</Button3D> : <Button3D disabled={!answer.trim()} onClick={() => setCorrect(Math.abs(Number(answer) - question.answer) <= .005 ? 1 : 0)}>Check answer</Button3D>}</div></Card><Card><p className="text-xs text-muted">This run combines {new Set(questions.map((item) => item.trade.id)).size} real trades from this week. “Play a fresh Boss” rotates the trade order and target variants; no fictional market outcomes are added.</p></Card></div>;
}
