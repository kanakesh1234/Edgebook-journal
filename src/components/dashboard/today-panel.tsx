"use client";

/**
 * TodayPanel — the "what do I need to know right now" surface on Home.
 *
 * One component, three layouts (driven by its own width via container queries, so it
 * works wherever the page places it):
 *   desktop  sticky right rail (~21rem)  → stacked sections
 *   tablet   full-width card (≥ 40rem)   → two columns: posture | recent trades
 *   phone    full-width card             → stacked, three recent trades
 */
import Link from "next/link";
import type { CurrencyCode, JournalEntry } from "@/lib/types";
import { formatMoney, formatSignedMoney, relativeDayLabel, weekdayShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ChevronRightIcon } from "@/components/ui/icons";

export interface RiskPosture {
  label: string;
  tone: "profit" | "gold" | "loss";
}

const TONE = {
  profit: { dot: "bg-profit", text: "text-profit", bar: "bg-profit" },
  gold: { dot: "bg-gold", text: "text-gold", bar: "bg-gold-strong" },
  loss: { dot: "bg-loss", text: "text-loss", bar: "bg-loss" },
} as const;

export function TodayPanel({
  risk,
  drawdownUsed,
  drawdown,
  drawdownLimit,
  currency,
  brokenToday,
  brokenWeek,
  intention,
  recent,
  className,
}: {
  risk: RiskPosture;
  /** 0–1 share of the drawdown limit consumed. */
  drawdownUsed: number;
  /** Current drawdown from peak, in account currency (positive number). */
  drawdown: number;
  /** The configured max drawdown; 0 when none is set. */
  drawdownLimit: number;
  currency: CurrencyCode;
  brokenToday: number;
  brokenWeek: number;
  intention?: { rule: string; outcome?: string | null } | null;
  recent: JournalEntry[];
  className?: string;
}) {
  const t = TONE[risk.tone];
  const used = Math.min(1, Math.max(0, drawdownUsed));

  return (
    <aside aria-label="Today" className={cn("@container", className)}>
      <div className="panel overflow-hidden">
        <div className="grid divide-y divide-line @2xl:grid-cols-2 @2xl:divide-x @2xl:divide-y-0">
          {/* ---- posture ---- */}
          <section className="space-y-5 p-5 @2xl:p-6">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-faint">Today</p>
              <p className="mt-2 flex items-center gap-2 text-[17px] font-semibold text-ink" role="status">
                <span className={cn("h-2 w-2 rounded-full", t.dot)} aria-hidden />
                {risk.label}
              </p>
            </div>

            {drawdownLimit > 0 && (
              <div>
                <div className="flex items-baseline justify-between text-[12px]">
                  <span className="text-muted">Drawdown</span>
                  <span className="num text-ink">
                    {formatMoney(drawdown, currency)}
                    <span className="font-normal text-faint"> / {formatMoney(drawdownLimit, currency)}</span>
                  </span>
                </div>
                <div className="mt-2 h-[3px] overflow-hidden rounded-full bg-line-soft" aria-hidden>
                  <div className={cn("h-full rounded-full transition-[width] duration-700", t.bar)} style={{ width: `${used * 100}%` }} />
                </div>
                <p className="mt-1.5 text-[11.5px] text-faint">{Math.round(used * 100)}% of limit used</p>
              </div>
            )}

            <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-control border border-line bg-line text-center">
              <div className="bg-surface px-3 py-2.5">
                <dd className={cn("kpi text-[20px]", brokenToday > 0 ? "text-loss" : "text-ink")}>{brokenToday}</dd>
                <dt className="mt-1 text-[10.5px] uppercase tracking-[0.08em] text-faint">Rules broken today</dt>
              </div>
              <div className="bg-surface px-3 py-2.5">
                <dd className={cn("kpi text-[20px]", brokenWeek > 0 ? "text-gold" : "text-ink")}>{brokenWeek}</dd>
                <dt className="mt-1 text-[10.5px] uppercase tracking-[0.08em] text-faint">Past 7 days</dt>
              </div>
            </dl>

            {intention && (
              <figure className="border-l-2 border-gold/60 pl-3.5">
                <figcaption className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-gold">Pre-market intention</figcaption>
                <blockquote className="mt-1 text-[14px] font-medium leading-snug text-ink">“{intention.rule}”</blockquote>
                <Link href="/practice" className="mt-1.5 inline-block text-[12.5px] font-semibold text-gold hover:underline">
                  {intention.outcome ? `Marked ${intention.outcome}` : "Open training"}
                </Link>
              </figure>
            )}
          </section>

          {/* ---- recent trades ---- */}
          <section className="p-5 @2xl:p-6" aria-label="Recent trades">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-faint">Recent trades</p>
              <Link href="/journal" className="text-[12.5px] font-semibold text-gold hover:underline">
                Journal →
              </Link>
            </div>

            {recent.length === 0 ? (
              <p className="mt-4 text-[13px] leading-relaxed text-muted">Trades you log show up here, newest first.</p>
            ) : (
              <ul className="mt-2 divide-y divide-line-soft">
                {recent.map((e, i) => (
                  <li key={e.id} className={cn(i >= 3 && "max-md:hidden")}>
                    <Link
                      href={`/review/${e.id}`}
                      className="group -mx-2 flex min-h-[52px] items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-ink/[0.03] active:bg-ink/[0.06]"
                    >
                      <span className="w-11 shrink-0 text-[11.5px] leading-tight text-faint">
                        <span className="block font-medium text-muted">{relativeDayLabel(e.date) ?? weekdayShort(e.date)}</span>
                        <span className="block">{e.date.slice(5).replace("-", "/")}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-medium text-ink">{e.instrument || "Trade"}</span>
                        <span className="block truncate text-[11.5px] text-faint">
                          {[e.direction, e.setup].filter(Boolean).join(" · ") || "No setup tagged"}
                        </span>
                      </span>
                      <span className={cn("num shrink-0 text-[13.5px]", e.pnl > 0 ? "text-profit" : e.pnl < 0 ? "text-loss" : "text-muted")}>
                        {formatSignedMoney(e.pnl, currency)}
                      </span>
                      <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100 max-md:hidden" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </aside>
  );
}
