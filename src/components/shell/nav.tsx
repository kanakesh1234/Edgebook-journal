"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { useApp, sortEntriesNewestFirst } from "@/lib/store";
import { computeStats } from "@/lib/stats";
import { journeyCardData } from "@/lib/challenges";
import { formatMoney } from "@/lib/format";
import { Wordmark } from "@/components/landing/logo";
import {
  BookOpenIcon,
  CandlestickIcon,
  ChartLineIcon,
  FlaskIcon,
  LogoutIcon,
  MenuIcon,
  PlusIcon,
  RouteIcon,
  SettingsIcon,
  TargetIcon,
  XIcon,
} from "@/components/ui/icons";
import { useUi } from "@/lib/ui-store";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { UserIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Home", icon: ChartLineIcon },
  { href: "/challenges", label: "Challenges", icon: TargetIcon },
  { href: "/journal", label: "Journal", icon: BookOpenIcon },
  { href: "/lab", label: "Trading Lab", icon: FlaskIcon },
  { href: "/backtesting", label: "Backtesting", icon: CandlestickIcon },
  { href: "/practice", label: "Practise", icon: RouteIcon },
  { href: "/friends", label: "Friends", icon: UserIcon },
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
  // Journey follows the PRIMARY CHALLENGE — same source of truth as the dashboard.
  const journey = useMemo(() => journeyCardData(settings, entries), [settings, entries]);

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

      {/* Journey mini-card — derives from the CURRENT PRIMARY CHALLENGE
          (settings.primaryChallengeId via journeyCardData). Updates instantly
          when the primary challenge changes. No hard-coded default equity. */}
      {journey.challengeName ? (
        <div className="mx-4 mb-3 rounded-control border border-line bg-raised/60 p-3.5">
          <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Journey · {journey.challengeName}</p>
          <p className="num mt-1 text-[15px] text-ink">
            {formatMoney(journey.currentBalance ?? 0, settings.currency)}
          </p>
          <div className="relative mt-2 h-1 overflow-visible rounded-full bg-canvas">
            <div
              className="h-full rounded-full bg-gradient-to-r from-profit to-gold transition-all duration-700"
              style={{ width: `${journey.progressPct}%` }}
            />
            {[0.25, 0.5, 0.75].map((f) => (
              <span
                key={f}
                aria-hidden
                className={cn(
                  "absolute top-1/2 h-2 w-px -translate-y-1/2",
                  journey.progress >= f ? "bg-gold/70" : "bg-line-strong",
                )}
                style={{ left: `${f * 100}%` }}
              />
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-faint">
            {journey.progressPct}% to target
            {journey.remainingDrawdown != null && (
              <> · DD left {formatMoney(journey.remainingDrawdown, settings.currency)}</>
            )}
          </p>
        </div>
      ) : (
        <div className="mx-4 mb-3 rounded-control border border-dashed border-line-strong p-3.5">
          <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Journey</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted">
            No primary challenge selected. Create one in Challenges and mark it primary to track progress here.
          </p>
        </div>
      )}

      {/* Theme + User */}
      <div className="border-t border-line p-4">
        <div className="flex items-center justify-between pb-3">
          <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Theme</span>
          <ThemeToggle />
        </div>
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
  const [menuOpen, setMenuOpen] = useState(false);
  const openNewEntry = useUi((s) => s.openNewEntry);
  const user = useApp((s) => s.user);

  const initials =
    (user?.name ?? "?")
      .split(" ")
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  return (
    <>
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-canvas/85 px-4 backdrop-blur-xl lg:hidden">
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Open navigation menu"
          className="grid h-9 w-9 place-items-center rounded-lg text-faint transition-colors hover:bg-ink/[0.06] hover:text-ink active:scale-90"
        >
          <MenuIcon className="h-5 w-5" />
        </button>
        <p className="absolute left-1/2 -translate-x-1/2 font-display text-sm font-semibold text-muted">
          {title ?? current?.label}
        </p>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <MobileAddButton />
        </div>
      </header>

      {/* Slide-out navigation drawer — mobile/tablet only */}
      <AnimatePresence>
        {menuOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="mobile-nav-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMenuOpen(false)}
              className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm lg:hidden"
            />
            {/* Drawer */}
            <motion.aside
              key="mobile-nav-drawer"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", stiffness: 400, damping: 36 }}
              className="fixed inset-y-0 left-0 z-50 flex w-72 flex-col border-r border-line bg-surface lg:hidden"
            >
              {/* Drawer header */}
              <div className="flex h-14 items-center justify-between border-b border-line px-5">
                <Link href="/dashboard" aria-label="Edgebook" onClick={() => setMenuOpen(false)}>
                  <Wordmark markClassName="h-7 w-7" />
                </Link>
                <button
                  onClick={() => setMenuOpen(false)}
                  aria-label="Close navigation menu"
                  className="grid h-8 w-8 place-items-center rounded-lg text-faint transition-colors hover:bg-ink/[0.06] hover:text-ink"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              </div>

              {/* Add trade */}
              <div className="px-4 pt-4">
                <button
                  onClick={() => { openNewEntry(); setMenuOpen(false); }}
                  className="group flex w-full items-center justify-center gap-2 rounded-xl bg-gold-strong px-4 py-2.5 text-sm font-semibold text-on-gold shadow-sm transition-all duration-200 hover:bg-gold-strong-hover active:scale-[0.97]"
                >
                  <PlusIcon className="h-4 w-4 transition-transform duration-200 group-hover:rotate-90" />
                  Add trade
                </button>
              </div>

              {/* Nav items */}
              <nav aria-label="Mobile navigation" className="mt-4 flex-1 space-y-1 overflow-y-auto px-4">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const active = pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMenuOpen(false)}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200",
                        active ? "border border-line-strong bg-raised text-ink" : "text-faint hover:bg-ink/[0.04] hover:text-muted",
                      )}
                    >
                      <Icon className={cn("h-[18px] w-[18px] transition-colors", active ? "text-gold" : "")} />
                      {item.label}
                    </Link>
                  );
                })}
              </nav>

              {/* User + sign out */}
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
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
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

/** Bottom tabs removed — mobile/tablet navigation now uses the hamburger menu drawer above. */
export function BottomTabs() {
  return null;
}
