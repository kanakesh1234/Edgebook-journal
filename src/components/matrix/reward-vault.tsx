"use client";

import Link from "next/link";
import { useState } from "react";
import { useApp } from "@/lib/store";
import { matrixRewardHistory, MATRIX_REWARD_CATALOGUE, matrixVaultBadges } from "@/lib/matrix/rewards";
import { Badge, Button3D, Card, Pill } from "@/components/matrix/ui";

export function RewardVault() {
  const settings = useApp((state) => state.settings);
  const [redeeming, setRedeeming] = useState<string | null>(null);
  const matrix = settings.matrixProgress ?? { xp: 0, tokens: 0, tradeStates: {} };
  const history = matrixRewardHistory(matrix);
  const badges = matrixVaultBadges(matrix);

  return <div className="mx-auto max-w-4xl space-y-5 pb-10">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><nav className="text-xs text-muted"><Link href="/practice" className="hover:text-ink hover:underline">Practise</Link> / <Link href="/practice/matrix" className="hover:text-ink hover:underline">Matrix</Link> / <span className="text-ink">Rewards</span></nav><h1 className="mt-2 text-2xl font-semibold text-ink">Reward vault</h1><p className="mt-1 text-sm text-muted">Tokens and badges earned from your completed Matrix tests.</p></div><Pill>{matrix.tokens} tokens</Pill></header>
    <Card className="flex flex-wrap items-center justify-between gap-4 border-gold/40"><div><p className="text-[10px] font-semibold uppercase tracking-[.14em] text-gold">Available balance</p><p className="mt-1 text-2xl font-semibold text-ink">{matrix.tokens} tokens</p><p className="mt-1 text-xs text-muted">Your current, stored Matrix token balance.</p></div><Pill>+{matrix.xp} total XP</Pill></Card>
    <section><h2 className="text-sm font-semibold text-ink">Rewards</h2><p className="mt-1 text-xs text-muted">Catalogue items are ready for fulfilment once it is connected.</p><div className="mt-3 grid gap-3 sm:grid-cols-3">{MATRIX_REWARD_CATALOGUE.map((item) => <Card key={item.id} className="flex min-h-44 flex-col"><p className="text-lg" aria-hidden>▱</p><h3 className="mt-3 text-sm font-semibold text-ink">{item.title}</h3><p className="mt-1 flex-1 text-xs leading-relaxed text-muted">{item.detail}</p><div className="mt-4 flex items-center justify-between gap-2"><Pill tone="gold">{item.tokenCost} tokens</Pill><Button3D onClick={() => setRedeeming(item.id)}>Redeem</Button3D></div>{redeeming === item.id && <p role="status" className="mt-3 text-xs text-muted">Coming soon — redemption will be available when fulfilment is connected. No tokens were spent.</p>}</Card>)}</div></section>
    <section><h2 className="text-sm font-semibold text-ink">Badges</h2><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{badges.map((badge) => <Badge key={badge.id} title={badge.title} detail={badge.detail} earned={badge.earned} />)}</div></section>
    <section><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-sm font-semibold text-ink">Token history</h2><p className="mt-1 text-xs text-muted">Only completed attempts with recorded answers can be reconstructed here.</p></div><Link href="/practice/matrix" className="text-xs font-semibold text-gold hover:underline">Back to Matrix →</Link></div><Card className="mt-3 overflow-hidden p-0">{history.length ? <div>{history.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-b-0"><div><p className="text-sm font-medium text-ink">{item.correct} / {item.total} correct</p><p className="mt-1 text-xs text-muted">{item.completedOn} · Trade {item.tradeId}</p></div><div className="flex gap-2"><Pill>+{item.xp} XP</Pill><Pill tone="green">+{item.tokens} tokens</Pill></div></div>)}</div> : <p className="p-6 text-center text-sm text-muted">No verifiable Matrix reward history yet. Complete a test to begin.</p>}</Card></section>
  </div>;
}
