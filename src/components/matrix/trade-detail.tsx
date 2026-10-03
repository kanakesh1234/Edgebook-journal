"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { useApp } from "@/lib/store";
import type { MatrixScreenshotRole } from "@/lib/types";
import { realizedR, tradeResult } from "@/lib/matrix/progression";
import { Button3D, Card, Pill, StarRating } from "@/components/matrix/ui";
import { MATRIX_GAME_MODES, MATRIX_MODE_DETAILS } from "@/lib/matrix/game-modes";

const roles: Array<{ id: MatrixScreenshotRole; label: string }> = [{ id: "pre-entry", label: "Pre-entry" }, { id: "management", label: "Management" }, { id: "exit", label: "Exit" }];

export function MatrixTradeDetail({ tradeId }: { tradeId: string }) {
  const router = useRouter();
  const entries = useApp((s) => s.entries);
  const settings = useApp((s) => s.settings);
  const entry = useMemo(() => entries.find((item) => item.id === tradeId), [entries, tradeId]);
  const matrix = settings.matrixProgress ?? { xp: 0, tokens: 0, tradeStates: {} };
  if (!entry) return <div className="mx-auto max-w-3xl py-16 text-center"><p className="text-sm text-muted">Trade not found.</p><Link href="/practice/matrix" className="mt-3 inline-block text-sm text-gold underline">Back to Matrix</Link></div>;
  const state = matrix.tradeStates?.[entry.id] ?? {};
  const roleOf = (id: string) => state.imageRoles?.[id];
  const setRole = (imageId: string, role: MatrixScreenshotRole) => void useApp.getState().updateSettings({ matrixProgress: { ...matrix, tradeStates: { ...(matrix.tradeStates ?? {}), [entry.id]: { ...state, imageRoles: { ...state.imageRoles, [imageId]: role } } } } });
  const r = realizedR(entry).r;
  const result = tradeResult(r);
  const canCalculate = entry.entryPrice != null && entry.stopLoss != null && entry.direction != null && entry.entryPrice !== entry.stopLoss;
  return <div className="mx-auto max-w-4xl space-y-5 pb-10"><header><nav className="text-xs text-muted"><Link href="/practice" className="hover:text-ink hover:underline">Practise</Link> / <Link href="/practice/matrix" className="hover:text-ink hover:underline">Matrix</Link> / <span className="text-ink">{entry.instrument}</span></nav><div className="mt-3 flex flex-wrap items-start justify-between gap-3"><div><h1 className="text-2xl font-semibold text-ink">{entry.instrument !== "—" ? entry.instrument : "Trade"}</h1><p className="mt-1 text-sm text-muted">{entry.date}{entry.entryTime ? ` · ${entry.entryTime}` : ""}</p></div><div className="flex items-center gap-2"><Pill tone={result === "win" ? "green" : result === "loss" ? "muted" : "gold"}>{result}{r != null ? ` · ${r.toFixed(2)}R` : ""}</Pill><StarRating value={state.stars ?? 0} /></div></div></header><Card><div className="grid grid-cols-2 gap-4 sm:grid-cols-4"><Meta label="Pair" value={entry.instrument} /><Meta label="Setup" value={entry.setup || "—"} /><Meta label="Direction" value={entry.direction ?? "—"} /><Meta label="R multiple" value={r != null ? `${r.toFixed(2)}R` : "Unavailable"} /><Meta label="Entry" value={entry.entryPrice != null ? String(entry.entryPrice) : "—"} /><Meta label="Exit" value={entry.exitPrice != null ? String(entry.exitPrice) : "—"} /><Meta label="Stop" value={entry.stopLoss != null ? String(entry.stopLoss) : "—"} /><Meta label="Target" value={entry.takeProfit != null ? String(entry.takeProfit) : "—"} /></div>{entry.notes && <p className="mt-5 border-l-2 border-gold pl-3 text-sm leading-relaxed text-muted">{entry.notes}</p>}</Card><Card><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-sm font-semibold text-ink">Saved charts</h2><p className="mt-1 text-xs text-muted">Tag ungrouped screenshots to organise study mode.</p></div><Link href={`/compare/${entry.id}`}><Button3D tone="secondary">Compare</Button3D></Link></div>{entry.images.length ? roles.map((role) => { const images = entry.images.filter((image) => roleOf(image.id) === role.id); return <section key={role.id} className="mt-5"><p className="text-xs font-semibold text-muted">{role.label}</p><ChartGrid images={images} role={role.id} setRole={setRole} /></section>; }) : <p className="mt-4 text-sm text-muted">No screenshots were recorded for this trade.</p>}{entry.images.some((image) => !roleOf(image.id)) && <section className="mt-5"><p className="text-xs font-semibold text-muted">Untagged</p><ChartGrid images={entry.images.filter((image) => !roleOf(image.id))} setRole={setRole} /></section>}</Card><div className="flex flex-wrap gap-2"><Button3D disabled={!entry.images.length} onClick={() => router.push(`/practice/matrix/${entry.id}/charts`)}>Study charts</Button3D><Button3D tone="secondary" onClick={() => router.push(`/practice/matrix/${entry.id}/test`)}>Test</Button3D></div></div>;
}

function Meta({ label, value }: { label: string; value: string }) { return <div><p className="text-[10px] font-semibold uppercase tracking-wide text-faint">{label}</p><p className="mt-1 text-sm text-ink">{value}</p></div>; }
function ChartGrid({ images, role, setRole }: { images: Array<{ id: string; name: string }>; role?: MatrixScreenshotRole; setRole: (id: string, role: MatrixScreenshotRole) => void }) { return images.length ? <div className="mt-2 grid gap-3 sm:grid-cols-2">{images.map((image) => <div key={image.id} className="border border-line p-2"><img loading="lazy" src={`/api/drive/image/${image.id}`} alt={image.name} className="aspect-[16/9] w-full object-cover" /><select aria-label={`Set role for ${image.name}`} value={role ?? ""} onChange={(event) => setRole(image.id, event.target.value as MatrixScreenshotRole)} className="mt-2 w-full rounded border border-line bg-raised px-2 py-1.5 text-xs text-muted"><option value="" disabled>Tag chart as…</option>{roles.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></div>)}</div> : <p className="mt-2 text-xs text-faint">No charts in this group.</p>; }
