"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Tone = "green" | "purple" | "gold" | "red";

export function Button3D({ tone = "primary", className, disabled, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { tone?: "primary" | "secondary"; children: ReactNode }) {
  return <button disabled={disabled} className={cn("inline-flex h-9 items-center justify-center rounded-lg border px-3 text-xs font-semibold transition-all active:translate-y-px disabled:pointer-events-none disabled:opacity-45", tone === "primary" ? "border-gold-deep bg-gold-strong text-on-gold shadow-[0_2px_0_var(--gold-deep)] hover:bg-gold-strong-hover" : "border-line-strong bg-raised text-ink hover:bg-canvas", className)} {...props}>{children}</button>;
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn("rounded-control border border-line bg-surface p-4 shadow-panel", className)}>{children}</section>;
}

const tileTone: Record<Tone, string> = {
  green: "border-profit/35 bg-profit/[.08] text-profit-deep",
  purple: "border-info/35 bg-info/[.09] text-info",
  gold: "border-gold/35 bg-gold/[.09] text-gold-deep",
  red: "border-loss/35 bg-loss/[.08] text-loss-deep",
};

export function GameTile({ title, detail, tone, action = "Open", onAction, href }: { title: string; detail: string; tone: Tone; action?: string; onAction?: () => void; href?: string }) {
  const content = <Card className={cn("panel-hover flex h-48 flex-col hover:-translate-y-0.5", tileTone[tone])}><span className="text-2xl" aria-hidden>{tone === "green" ? "◎" : tone === "purple" ? "✦" : tone === "gold" ? "♜" : "◈"}</span><h3 className="mt-3 text-sm font-semibold text-ink">{title}</h3><p className="mt-1 flex-1 text-xs leading-relaxed text-muted">{detail}</p>{href ? <span className="mt-4 inline-flex h-9 w-full items-center justify-center rounded-lg border border-gold-deep bg-gold-strong px-3 text-xs font-semibold text-on-gold shadow-[0_2px_0_var(--gold-deep)]">{action}</span> : <Button3D className="mt-4 w-full" onClick={onAction}>{action}</Button3D>}</Card>;
  return href ? <Link href={href} className="block rounded-control focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold">{content}</Link> : content;
}

export function OptionRow({ label, state = "default", prefix, onClick }: { label: string; state?: "default" | "selected" | "correct" | "wrong"; prefix?: ReactNode; onClick?: () => void }) {
  const styles = { default: "border-line bg-raised text-ink hover:border-line-strong", selected: "border-gold bg-gold/[.08] text-ink", correct: "border-profit bg-profit/[.10] text-profit-deep", wrong: "border-loss bg-loss/[.10] text-loss-deep" } as const;
  return <button type="button" onClick={onClick} className={cn("flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors", styles[state])}>{prefix && <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-current text-[10px] font-bold">{prefix}</span>}<span>{label}</span>{state === "correct" && <span className="ml-auto text-xs">Correct</span>}{state === "wrong" && <span className="ml-auto text-xs">Wrong</span>}</button>;
}

export function Pill({ children, tone = "gold" }: { children: ReactNode; tone?: "gold" | "green" | "muted" }) {
  const styles = { gold: "border-gold/35 bg-gold/[.08] text-gold", green: "border-profit/35 bg-profit/[.08] text-profit", muted: "border-line bg-raised text-muted" };
  return <span className={cn("inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-semibold", styles[tone])}>{children}</span>;
}

export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return <div><div className="mb-1 flex justify-between text-[10px] text-muted"><span>{label}</span><span>{Math.round(clamped)}%</span></div><div className="h-2 overflow-hidden rounded-full bg-line-soft"><div className="h-full rounded-full bg-gradient-to-r from-gold to-gold-strong" style={{ width: `${clamped}%` }} /></div></div>;
}

export function StarRating({ value, label = "Star rating" }: { value: number; label?: string }) {
  return <span aria-label={`${label}: ${value} of 3`} className="inline-flex gap-0.5 text-sm">{[1, 2, 3].map((star) => <span key={star} className={star <= value ? "text-gold" : "text-line-strong"}>★</span>)}</span>;
}

export function AccuracyRing({ value, label = "Accuracy" }: { value: number; label?: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  return <div aria-label={`${label}: ${Math.round(clamped)}%`} className="grid h-24 w-24 place-items-center rounded-full text-center" style={{ background: `conic-gradient(var(--profit) ${clamped}%, var(--line-soft) 0)` }}><div className="grid h-[78px] w-[78px] place-items-center rounded-full bg-surface"><span><strong className="block text-lg text-ink">{Math.round(clamped)}%</strong><span className="text-[10px] text-muted">{label}</span></span></div></div>;
}

export function Badge({ title, earned = false, detail }: { title: string; earned?: boolean; detail?: string }) {
  return <div className={cn("rounded-lg border p-3 text-center", earned ? "border-gold/45 bg-gold/[.07]" : "border-line bg-raised text-faint")}><span className="text-xl" aria-hidden>{earned ? "✦" : "◌"}</span><p className="mt-1 text-xs font-semibold text-ink">{title}</p>{detail && <p className="mt-1 text-[10px] text-muted">{detail}</p>}</div>;
}

export function Breadcrumb({ items }: { items: Array<{ label: string; onClick?: () => void }> }) {
  return <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1.5 text-xs text-muted">{items.map((item, index) => <span key={`${item.label}-${index}`} className="flex items-center gap-1.5">{index > 0 && <span className="text-faint">/</span>}{item.onClick ? <button onClick={item.onClick} className="hover:text-ink hover:underline">{item.label}</button> : <span className={index === items.length - 1 ? "text-ink" : undefined}>{item.label}</span>}</span>)}</nav>;
}
