"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { todayKey } from "@/lib/format";
import { matrixTradeRows } from "@/lib/matrix/trades";
import { nextUp } from "@/lib/matrix/progression";
import { Button3D, Card, Pill, StarRating } from "@/components/matrix/ui";

type Tab = "all" | "correct" | "wrong" | "bookmarked" | "due";

export function MatrixHub() {
  const entries = useApp((state) => state.entries);
  const settings = useApp((state) => state.settings);
  const [tab, setTab] = useState<Tab>("all");
  const matrix = settings.matrixProgress ?? { xp: 0, tokens: 0, tradeStates: {} };
  const states = matrix.tradeStates ?? {};
  const rows = useMemo(() => matrixTradeRows(entries, states), [entries, states]);
  const filtered = rows.filter((row) => { const last = row.state.attempts?.at(-1); return tab === "all" || (tab === "correct" && !!last && last.accuracy >= .7) || (tab === "wrong" && !!last && last.accuracy < .7) || (tab === "bookmarked" && !!row.state.bookmarked) || (tab === "due" && !!row.state.dueOn && row.state.dueOn <= todayKey()); });
  const next = nextUp(rows.map((row) => ({ id: row.entry.id, date: row.entry.date })), Object.fromEntries(rows.map((row) => [row.entry.id, { tradeId: row.entry.id, stars: row.state.stars ?? 0, dueOn: row.state.dueOn, attempts: row.state.attempts ?? [] }])), todayKey());
  const toggleBookmark = (id: string) => void useApp.getState().updateSettings({ matrixProgress: { ...matrix, tradeStates: { ...states, [id]: { ...states[id], bookmarked: !states[id]?.bookmarked } } } });
  return <div className="mx-auto max-w-5xl space-y-5 pb-10"><header className="flex flex-wrap items-start justify-between gap-3"><div><nav className="text-xs text-muted"><Link href="/practice" className="hover:text-ink hover:underline">Practise</Link> / <span className="text-ink">Matrix</span></nav><h1 className="mt-2 text-2xl font-semibold text-ink">Matrix</h1><p className="mt-1 text-sm text-muted">Revisit and test your real trades.</p></div><div className="flex flex-wrap gap-2"><Link href="/practice/matrix/modes"><Pill tone="green">Game modes</Pill></Link><Link href="/practice/matrix/rewards"><Pill tone="gold">{matrix.tokens} tokens · Vault</Pill></Link></div></header><Card><div className="flex flex-wrap gap-2">{(["all", "correct", "wrong", "bookmarked", "due"] as Tab[]).map((item) => <Button3D key={item} tone={tab === item ? "primary" : "secondary"} onClick={() => setTab(item)}>{item === "all" ? "All trades" : item[0]!.toUpperCase() + item.slice(1)}</Button3D>)}</div></Card>{next && <Card className="flex flex-wrap items-center justify-between gap-3 border-gold/40"><div><p className="text-xs font-semibold text-gold">Next up</p><p className="mt-1 text-sm text-ink">{rows.find((row) => row.entry.id === next.id)?.entry.instrument} · {next.date}</p></div><Link href={`/practice/matrix/${next.id}`}><Button3D>Open trade</Button3D></Link></Card>}<Card className="overflow-hidden p-0">{filtered.length ? filtered.map((row) => <div key={row.entry.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0"><div><p className="text-sm font-medium text-ink">{row.entry.instrument} · {row.entry.date}</p><p className="mt-1 text-xs text-muted">{row.entry.setup || "No recorded setup"}</p></div><div className="flex items-center gap-2"><Pill tone={row.result === "win" ? "green" : "muted"}>{row.result === "unavailable" ? "R unavailable" : `${row.result}${row.r != null ? ` · ${row.r.toFixed(2)}R` : ""}`}</Pill><StarRating value={row.state.stars ?? 0} /><Link href={`/practice/matrix/${row.entry.id}`}><Button3D tone="secondary">Open</Button3D></Link><button onClick={() => toggleBookmark(row.entry.id)} aria-label={row.state.bookmarked ? "Remove bookmark" : "Bookmark trade"} className="text-lg text-muted hover:text-gold">{row.state.bookmarked ? "★" : "☆"}</button></div></div>) : <p className="p-6 text-center text-sm text-muted">No real trades match this view.</p>}</Card></div>;
}
