"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { useApp, sortEntriesNewestFirst } from "@/lib/store";
import { computeStats } from "@/lib/stats";
import { formatMoney } from "@/lib/format";
import { Wordmark } from "@/components/landing/logo";
import {
  BookOpenIcon,
  ChartLineIcon,
  FlaskIcon,
  LogoutIcon,
  PlusIcon,
  SettingsIcon,
} from "@/components/ui/icons";
import { useUi } from "@/lib/ui-store";
import { cn } from "@/lib/utils";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Home", icon: ChartLineIcon },
  { href: "/journal", label: "Journal", icon: BookOpenIcon },
  { href: "/lab", label: "Trading Lab", icon: FlaskIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

function NavLink({ item, active }: { item: (typeof NAV_ITEMS)[number]; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200",
        active ? "text-ink" : "text-faint hover:bg-ink/[0.04] hover:text-muted",
      )}
    >
      {active && (
        <motion.span
          layoutId="nav-active"
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          className="absolute inset-0 rounded-xl border border-line-strong bg-raised"
        />
      )}
      <span className="relative flex items-center gap-3">
        <Icon className={cn("h-[18px] w-[18px] transition-colors", active ? "text-gold" : "")} />
        {item.label}
      </span>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const user = useApp((s) => s.user);
  const entries = useApp((s) => s.entries);
  const settings = useApp((s) => s.settings);
  const openNewEntry = useUi((s) => s.openNewEntry);
  const sorted = useMemo(() => sortEntriesNewestFirst(entries), [entries]);
  const stats = computeStats(sorted, settings);

  const initials =
    (user?.name ?? "?")
      .split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line bg-surface/80 backdrop-blur lg:flex">
      <div className="flex h-16 items-center border-b border-line px-5">
        <Link href="/dashboard" aria-label="Edgebook dashboard">
          <Wordmark />
        </Link>
      </div>

      <div className="px-4 pt-4">
        <button
          onClick={openNewEntry}
          className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gold-strong px-4 py-2.5 text-sm font-semibold text-on-gold shadow-sm transition-all duration-200 hover:bg-gold-strong-hover active:scale-[0.97]"
        >
          <PlusIcon className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" />
          Add trade
        </button>
      </div>

      <nav aria-label="Primary" className="mt-5 flex-1 space-y-1 px-4">
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} active={pathname.startsWith(item.href)} />
        ))}
      </nav>

      {/* Equity mini-card — the journey's persistent presence in the shell */}
      <div className="mx-4 mb-3 rounded-control border border-line bg-raised/60 p-3.5">
        <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Journey</p>
        <p className="num mt-1 text-[15px] text-ink">
          {formatMoney(stats.currentEquity, settings.currency)}
        </p>
        <div className="relative mt-2 h-1 overflow-visible rounded-full bg-canvas">
          <div
            className="h-full rounded-full bg-gradient-to-r from-profit to-gold transition-all duration-700"
            style={{ width: `${Math.round(stats.targetProgress * 100)}%` }}
          />
          {[0.25, 0.5, 0.75].map((f) => (
            <span
              key={f}
              aria-hidden
              className={cn(
                "absolute top-1/2 h-2 w-px -translate-y-1/2",
                stats.targetProgress >= f ? "bg-gold/70" : "bg-line-strong",
              )}
              style={{ left: `${f * 100}%` }}
            />
          ))}
        </div>
        <p className="mt-1.5 text-[11px] text-faint">
          {Math.round(stats.targetProgress * 100)}% to target
        </p>
      </div>

      {/* User */}
      <div className="border-t border-line p-4">
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line-strong bg-raised text-xs font-semibold text-gold">
            {initials}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-ink">{user?.name}</p>
            <p className="truncate text-[11px] text-faint">{user?.email}</p>
          </div>
          <button
            onClick={() => void useApp.getState().signOut()}
            aria-label="Sign out"
            title="Sign out"
            className="grid h-8 w-8 place-items-center rounded-lg text-faint transition-colors hover:bg-loss/10 hover:text-loss"
          >
            <LogoutIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
}

/* ------------------------------ Mobile chrome ------------------------------ */

export function MobileTopBar({ title }: { title?: string }) {
  const pathname = usePathname();
  const current = NAV_ITEMS.find((i) => pathname.startsWith(i.href));
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-canvas/85 px-4 backdrop-blur-xl lg:hidden">
      <Link href="/dashboard" aria-label="Edgebook">
        <Wordmark markClassName="h-7 w-7" />
      </Link>
      <p className="absolute left-1/2 -translate-x-1/2 font-display text-sm font-semibold text-muted">
        {title ?? current?.label}
      </p>
      <MobileAddButton />
    </header>
  );
}

export function MobileAddButton() {
  const openNewEntry = useUi((s) => s.openNewEntry);
  return (
    <button
      onClick={openNewEntry}
      aria-label="Add trade"
      className="grid h-9 w-9 place-items-center rounded-lg bg-gold-strong text-on-gold shadow-sm active:scale-90"
    >
      <PlusIcon className="h-4.5 w-4.5" />
    </button>
  );
}

export function BottomTabs() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Primary mobile"
      className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
    >
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className="relative flex flex-col items-center gap-1 py-2.5"
          >
            {active && (
              <motion.span
                layoutId="tab-active"
                className="absolute top-0 h-[2px] w-10 rounded-full bg-gold"
                transition={{ type: "spring", stiffness: 420, damping: 34 }}
              />
            )}
            <Icon className={cn("h-5 w-5 transition-colors", active ? "text-gold" : "text-faint")} />
            <span
              className={cn(
                "text-[10px] font-medium transition-colors",
                active ? "text-ink" : "text-faint",
              )}
            >
              {item.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
