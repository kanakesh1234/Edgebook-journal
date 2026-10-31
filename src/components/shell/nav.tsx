"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useDragControls } from "motion/react";
import { useApp } from "@/lib/store";
import { journeyCardData } from "@/lib/challenges";
import { formatMoney, todayKey } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { LogoMark, Wordmark } from "@/components/landing/logo";
import {
  BookOpenIcon,
  ChartLineIcon,
  ChevronRightIcon,
  FlaskIcon,
  LogoutIcon,
  PlusIcon,
  RouteIcon,
  SettingsIcon,
  UserIcon,
} from "@/components/ui/icons";
import { useUi } from "@/lib/ui-store";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";
import { LessonsIcon } from "@/components/lessons/lessons-icon";
import { FeedIcon } from "@/components/feed/feed-icons";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Home", short: "Home", icon: ChartLineIcon, blurb: "Equity, risk and today" },
  { href: "/feed", label: "Feed", short: "Feed", icon: FeedIcon, blurb: "Swipe through charts, replays and lessons" },
  { href: "/lessons", label: "Lessons", short: "Lessons", icon: LessonsIcon, blurb: "Your written playbook" },
  { href: "/journal", label: "Journal", short: "Journal", icon: BookOpenIcon, blurb: "Every trade, reviewed" },
  { href: "/practice", label: "Practise", short: "Practise", icon: RouteIcon, blurb: "Daily reps and the Matrix" },
  { href: "/lab", label: "Trading Lab", short: "Lab", icon: FlaskIcon, blurb: "Challenges, playbook, backtests" },
  { href: "/friends", label: "Friends", short: "Friends", icon: UserIcon, blurb: "Compete and compare" },
] as const;

type NavItem = (typeof NAV_ITEMS)[number];

const TAB_HREFS = ["/dashboard", "/feed", "/journal", "/practice"] as const;
const TAB_ITEMS = TAB_HREFS.map((h) => NAV_ITEMS.find((i) => i.href === h)!);
const MORE_ITEMS = NAV_ITEMS.filter((i) => !(TAB_HREFS as readonly string[]).includes(i.href));

const NAV_ALIASES: Record<string, string[]> = { "/lab": ["/backtesting"] };
const isActive = (pathname: string, href: string) =>
  pathname.startsWith(href) || (NAV_ALIASES[href] ?? []).some((p) => pathname.startsWith(p));

function useDisplayName() {
  const user = useApp((s) => s.user);
  const fullName = useApp((s) => s.settings.fullName);
  return fullName?.trim() || user?.name || "";
}

function useIsNoSetupToday() {
  const entries = useApp((s) => s.entries);
  const dayLogs = useApp((s) => s.dayLogs);
  const today = todayKey();
  return useMemo(() => entries.every((e) => e.date !== today) && dayLogs.some((d) => d.date === today), [entries, dayLogs, today]);
}

function Avatar({ className }: { className?: string }) {
  const name = useDisplayName();
  const photo = useApp((s) => (s.settings as { avatar?: string }).avatar);
  const initials =
    name
      .split(" ")
      .filter(Boolean)
      .map((p) => p[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";
  return (
    <span
      className={cn(
        "grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-line-strong bg-raised text-xs font-semibold text-gold",
        className,
      )}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo} alt="" className="h-full w-full object-cover" />
      ) : (
        initials
      )}
    </span>
  );
}

function JourneyCard({ className }: { className?: string }) {
  const settings = useApp((s) => s.settings);
  const entries = useApp((s) => s.entries);
  const journey = useMemo(() => journeyCardData(settings, entries), [settings, entries]);

  if (!journey.challengeName) {
    return (
      <div className={cn("rounded-control border border-dashed border-line-strong p-3.5", className)}>
        <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Journey</p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted">
          No primary challenge selected. Create one in the Trading Lab and mark it primary to track progress here.
        </p>
      </div>
    );
  }

  return (
    <div className={cn("rounded-control border border-line bg-raised/60 p-3.5", className)}>
      <p className="truncate text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Journey · {journey.challengeName}</p>
      <p className="num mt-1 text-[15px] text-ink">{formatMoney(journey.currentBalance ?? 0, settings.currency)}</p>
      <div className="relative mt-2 h-1 overflow-visible rounded-full bg-canvas">
        <div
          className="h-full rounded-full bg-gradient-to-r from-profit to-gold transition-all duration-700"
          style={{ width: `${journey.progressPct}%` }}
        />
        {[0.25, 0.5, 0.75].map((f) => (
          <span
            key={f}
            aria-hidden
            className={cn("absolute top-1/2 h-2 w-px -translate-y-1/2", journey.progress >= f ? "bg-gold/70" : "bg-line-strong")}
            style={{ left: `${f * 100}%` }}
          />
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-faint">
        {journey.progressPct}% to target
        {journey.remainingDrawdown != null && <> · DD left {formatMoney(journey.remainingDrawdown, settings.currency)}</>}
      </p>
    </div>
  );
}

function SignOutButton({ className }: { className?: string }) {
  return (
    <button
      onClick={() => void useApp.getState().signOut()}
      aria-label="Sign out"
      title="Sign out"
      className={cn("grid h-9 w-9 min-h-[36px] min-w-[36px] place-items-center rounded-lg text-faint transition-colors hover:bg-loss/10 hover:text-loss", className)}
    >
      <LogoutIcon className="h-4 w-4" />
    </button>
  );
}

function SettingsGear({ onNavigate, className }: { onNavigate?: () => void; className?: string }) {
  const pathname = usePathname();
  const active = pathname.startsWith("/settings");
  return (
    <Link
      href="/settings"
      onClick={onNavigate}
      aria-label="Settings"
      aria-current={active ? "page" : undefined}
      title="Settings"
      className={cn(
        "group grid h-11 w-11 shrink-0 place-items-center rounded-xl border transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60",
        active
          ? "border-gold/40 bg-raised text-gold"
          : "border-line bg-raised/60 text-muted hover:border-line-strong hover:bg-raised hover:text-ink",
        className,
      )}
    >
      <SettingsIcon className="h-5 w-5 transition-transform duration-500 group-hover:rotate-90" />
    </Link>
  );
}

/* ================================== DESKTOP =================================== */

function NavLink({ item, active, collapsed = false }: { item: NavItem; active: boolean; collapsed?: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.label : undefined}
      className={cn(
        "group relative flex min-h-[44px] items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200",
        collapsed && "justify-center px-2",
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
      <span className={cn("relative flex items-center gap-3", collapsed && "justify-center")}>
        <Icon className={cn("h-[18px] w-[18px] shrink-0 transition-colors", active ? "text-gold" : "")} />
        {!collapsed && <span>{item.label}</span>}
      </span>
    </Link>
  );
}

/** ≥ xl — the full sidebar: labels, Journey progress, account, plus collapse toggle. */
export function Sidebar() {
  const pathname = usePathname();
  const user = useApp((s) => s.user);
  const displayName = useDisplayName();
  const openNewEntry = useUi((s) => s.openNewEntry);
  const collapsed = useUi((s) => s.sidebarCollapsed);
  const toggleSidebar = useUi((s) => s.toggleSidebar);
  const isNoSetupToday = useIsNoSetupToday();

  useEffect(() => {
    const root = document.documentElement;
    if (collapsed) root.setAttribute("data-sidebar-collapsed", "true");
    else root.removeAttribute("data-sidebar-collapsed");
    return () => root.removeAttribute("data-sidebar-collapsed");
  }, [collapsed]);

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[var(--sidebar-w)] flex-col border-r border-line bg-surface/85 backdrop-blur-xl transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] xl:flex">
      <div className={cn("flex h-16 items-center justify-between border-b border-line px-4", collapsed && "justify-center px-2")}>
        {!collapsed && (
          <Link href="/dashboard" aria-label="Edgebook dashboard">
            <Wordmark />
          </Link>
        )}
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="grid h-11 w-11 place-items-center rounded-xl text-muted transition-colors hover:bg-raised hover:text-ink"
        >
          <ChevronRightIcon className={cn("h-4 w-4 transition-transform duration-300", !collapsed && "rotate-180")} />
        </button>
      </div>

      <div className={cn("px-4 pt-4", collapsed && "px-2")}>
        <button
          disabled={isNoSetupToday}
          title={isNoSetupToday ? "Disabled — today is marked as a no-setup day" : "Add trade"}
          onClick={openNewEntry}
          className={cn(
            "group flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-gold-strong px-4 py-2.5 text-sm font-semibold text-on-gold shadow-sm transition-all duration-200 hover:bg-gold-strong-hover active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40",
            collapsed && "px-0",
          )}
        >
          <PlusIcon className="h-4 w-4 shrink-0 transition-transform duration-200 group-hover:rotate-90" />
          {!collapsed && <span>Add trade</span>}
        </button>
      </div>

      <nav aria-label="Primary" className={cn("mt-5 flex-1 space-y-1 overflow-y-auto px-4", collapsed && "px-2")}>
        {NAV_ITEMS.map((item) => (
          <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} collapsed={collapsed} />
        ))}
      </nav>

      {!collapsed && <JourneyCard className="mx-4 mb-3" />}

      <div className={cn("border-t border-line p-4", collapsed && "flex flex-col items-center gap-2 p-2")}>
        <div className={cn("flex items-center justify-between pb-3", collapsed && "flex-col gap-2 pb-1")}>
          <SettingsGear />
          <div className="flex items-center gap-2">
            {!collapsed && <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-faint">Theme</span>}
            <ThemeToggle />
          </div>
        </div>
        {!collapsed ? (
          <div className="flex items-center gap-3">
            <Avatar />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{displayName}</p>
              <p className="truncate text-[11px] text-faint">{user?.email}</p>
            </div>
            <SignOutButton />
          </div>
        ) : (
          <SignOutButton className="h-11 w-11 rounded-xl" />
        )}
      </div>
    </aside>
  );
}

/* ================================== TABLET ==================================== */

function RailLink({ item, active, expanded = false }: { item: NavItem; active: boolean; expanded?: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={item.label}
      className={cn(
        "relative flex min-h-[48px] w-full items-center gap-3 rounded-xl px-3 text-xs font-medium tracking-wide transition-colors duration-200",
        !expanded && "h-14 flex-col justify-center gap-1 px-1 text-[10px]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60",
        active ? "text-ink" : "text-faint hover:bg-ink/[0.04] hover:text-muted active:bg-ink/[0.06]",
      )}
    >
      {active && (
        <motion.span
          layoutId="rail-active"
          transition={{ type: "spring", stiffness: 420, damping: 34 }}
          className="absolute inset-0 rounded-xl border border-line-strong bg-raised"
        />
      )}
      <Icon className={cn("relative h-[22px] w-[22px] shrink-0 transition-colors", active ? "text-gold" : "")} />
      <span className="relative truncate">{expanded ? item.label : item.short}</span>
    </Link>
  );
}

export function TabletRail() {
  const pathname = usePathname();
  const openNewEntry = useUi((s) => s.openNewEntry);
  const isNoSetupToday = useIsNoSetupToday();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    if (expanded) root.setAttribute("data-tablet-expanded", "true");
    else root.removeAttribute("data-tablet-expanded");
    return () => root.removeAttribute("data-tablet-expanded");
  }, [expanded]);

  return (
    <aside
      aria-label="Sidebar"
      className={cn(
        "fixed inset-y-0 left-0 z-40 hidden w-[var(--rail-w)] flex-col border-r border-line bg-surface/85 pb-[max(0.75rem,var(--safe-bottom))] pl-[var(--safe-left)] pt-[max(1rem,var(--safe-top))] backdrop-blur-xl transition-[width] duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] md:flex xl:hidden [@media(max-height:520px)]:no-scrollbar [@media(max-height:520px)]:overflow-y-auto [@media(max-height:520px)]:*:shrink-0",
        expanded ? "items-stretch px-3" : "items-center",
      )}
    >
      <div className={cn("flex items-center justify-between", expanded ? "px-1" : "flex-col gap-2")}>
        <Link href="/dashboard" aria-label="Edgebook dashboard" className="rounded-xl p-1">
          <LogoMark className="h-9 w-9" />
        </Link>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-label={expanded ? "Collapse tablet sidebar" : "Expand tablet sidebar"}
          className="grid h-11 w-11 place-items-center rounded-xl text-muted transition-colors hover:bg-raised hover:text-ink"
        >
          <ChevronRightIcon className={cn("h-4 w-4 transition-transform duration-300", expanded && "rotate-180")} />
        </button>
      </div>

      <button
        disabled={isNoSetupToday}
        onClick={openNewEntry}
        aria-label="Add trade"
        title={isNoSetupToday ? "Disabled — today is marked as a no-setup day" : "Add trade"}
        className={cn(
          "mt-3 flex h-12 items-center justify-center gap-2 rounded-2xl bg-gold-strong text-sm font-semibold text-on-gold shadow-sm transition-all duration-200 hover:bg-gold-strong-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-40",
          expanded ? "w-full px-3" : "w-12",
        )}
      >
        <PlusIcon className="h-5 w-5 shrink-0" />
        {expanded && <span>Add trade</span>}
      </button>

      <nav aria-label="Primary" className="no-scrollbar mt-4 flex w-full flex-1 flex-col gap-1 overflow-y-auto px-1 [@media(max-height:520px)]:flex-none [@media(max-height:520px)]:overflow-visible">
        {NAV_ITEMS.map((item) => (
          <RailLink key={item.href} item={item} active={isActive(pathname, item.href)} expanded={expanded} />
        ))}
      </nav>

      <div className={cn("flex items-center gap-2 border-t border-line pt-3 [@media(max-height:520px)]:mt-3", expanded ? "justify-between px-1" : "flex-col px-2")}>
        <ThemeToggle className="h-11 w-11 rounded-xl" />
        <SettingsGear />
        <SignOutButton className="h-11 w-11 rounded-xl" />
      </div>
    </aside>
  );
}

/* ================================== PHONE ===================================== */

export function MobileTopBar({ title }: { title?: string }) {
  const pathname = usePathname();
  const current = NAV_ITEMS.find((i) => isActive(pathname, i.href));
  const heading = title ?? current?.label ?? (pathname.startsWith("/settings") ? "Settings" : "Edgebook");
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <>
      <header className="sticky top-0 z-40 flex h-[var(--topbar-h)] items-center justify-between border-b border-line bg-canvas/85 pl-[calc(1rem+var(--safe-left))] pr-[calc(0.75rem+var(--safe-right))] pt-[var(--safe-top)] backdrop-blur-xl md:hidden">
        <Link href="/dashboard" aria-label="Edgebook dashboard" className="flex h-11 min-w-0 items-center gap-2.5">
          <LogoMark className="h-7 w-7 shrink-0" />
          <h1 className="truncate font-display text-[17px] font-semibold tracking-[-0.01em] text-ink">{heading}</h1>
        </Link>
        <button
          onClick={() => {
            haptic.selection();
            setMenuOpen(true);
          }}
          aria-label="Open menu"
          aria-haspopup="dialog"
          aria-expanded={menuOpen}
          className="grid h-11 w-11 place-items-center rounded-full active:scale-90"
        >
          <Avatar />
        </button>
      </header>
      <MenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}

function MenuSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const user = useApp((s) => s.user);
  const displayName = useDisplayName();
  const controls = useDragControls();

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.button
            key="menu-backdrop"
            aria-label="Close menu"
            tabIndex={-1}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="fixed inset-0 z-[60] cursor-default bg-black/50 backdrop-blur-sm md:hidden"
          />
          <motion.div
            key="menu-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 420, damping: 38 }}
            drag="y"
            dragControls={controls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 90 || info.velocity.y > 600) onClose();
            }}
            className="fixed inset-x-0 bottom-0 z-[61] flex max-h-[88dvh] flex-col rounded-t-[22px] border border-b-0 border-line-strong bg-surface shadow-overlay md:hidden"
          >
            <div
              onPointerDown={(e) => controls.start(e)}
              className="flex shrink-0 cursor-grab touch-none justify-center pb-2 pt-3 active:cursor-grabbing"
            >
              <span className="sheet-handle" />
            </div>

            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 pb-safe">
              <div className="flex items-center gap-3">
                <Avatar className="h-11 w-11 text-sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-ink">{displayName}</p>
                  <p className="truncate text-xs text-faint">{user?.email}</p>
                </div>
              </div>

              <JourneyCard />

              <nav aria-label="More" className="overflow-hidden rounded-control border border-line bg-raised/50">
                {[...MORE_ITEMS, { href: "/settings", label: "Settings", blurb: "Account, rules and data", icon: SettingsIcon }].map(
                  (item, i) => {
                    const Icon = item.icon;
                    const active = pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onClose}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex min-h-[56px] items-center gap-3.5 px-4 transition-colors active:bg-ink/[0.05]",
                          i > 0 && "border-t border-line-soft",
                        )}
                      >
                        <span
                          className={cn(
                            "grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line bg-surface",
                            active ? "text-gold" : "text-muted",
                          )}
                        >
                          <Icon className="h-[18px] w-[18px]" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[15px] font-medium text-ink">{item.label}</span>
                          <span className="block truncate text-xs text-faint">{item.blurb}</span>
                        </span>
                        <ChevronRightIcon className="h-4 w-4 shrink-0 text-faint" />
                      </Link>
                    );
                  },
                )}
              </nav>

              <div className="flex items-center justify-between rounded-control border border-line bg-raised/50 px-4 py-2.5">
                <span className="text-[15px] font-medium text-ink">Appearance</span>
                <ThemeToggle className="h-11 w-11 rounded-xl" />
              </div>

              <button
                onClick={() => void useApp.getState().signOut()}
                className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-control border border-line text-[15px] font-medium text-loss transition-colors active:bg-loss/10"
              >
                <LogoutIcon className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function TabLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      onClick={() => haptic.selection()}
      className={cn(
        "relative flex h-full min-h-[44px] flex-col items-center justify-center gap-[3px] text-[10px] font-medium tracking-wide transition-colors active:scale-95",
        active ? "text-gold" : "text-faint",
      )}
    >
      {active && (
        <motion.span
          layoutId="tab-active"
          transition={{ type: "spring", stiffness: 500, damping: 36 }}
          className="absolute inset-x-5 top-0 h-[2px] rounded-b-full bg-gold"
        />
      )}
      <Icon className="h-[22px] w-[22px]" />
      <span>{item.short}</span>
    </Link>
  );
}

export function BottomTabs() {
  const pathname = usePathname();
  const openNewEntry = useUi((s) => s.openNewEntry);
  const isNoSetupToday = useIsNoSetupToday();
  const [home, feed, journal, practice] = TAB_ITEMS;

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 grid h-[var(--tabbar-h)] grid-cols-5 border-t border-line bg-surface/90 pb-[var(--safe-bottom)] pl-[var(--safe-left)] pr-[var(--safe-right)] backdrop-blur-xl md:hidden"
    >
      <TabLink item={home} active={isActive(pathname, home.href)} />
      <TabLink item={feed} active={isActive(pathname, feed.href)} />

      <div className="relative flex items-start justify-center">
        <button
          disabled={isNoSetupToday}
          title={isNoSetupToday ? "Disabled — today is marked as a no-setup day" : undefined}
          onClick={() => {
            if (isNoSetupToday) return;
            haptic.selection();
            openNewEntry();
          }}
          aria-label="Add trade"
          className="-mt-4 grid h-14 w-14 place-items-center rounded-full border-4 border-canvas bg-gold-strong text-on-gold shadow-lift transition-transform active:scale-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <PlusIcon className="h-6 w-6" />
        </button>
      </div>

      <TabLink item={journal} active={isActive(pathname, journal.href)} />
      <TabLink item={practice} active={isActive(pathname, practice.href)} />
    </nav>
  );
}

export function MobileAddButton() {
  const openNewEntry = useUi((s) => s.openNewEntry);
  const isNoSetupToday = useIsNoSetupToday();
  return (
    <button
      disabled={isNoSetupToday}
      title={isNoSetupToday ? "Disabled — today is marked as a no-setup day" : undefined}
      onClick={openNewEntry}
      aria-label="Add trade"
      className="grid h-11 w-11 place-items-center rounded-xl bg-gold-strong text-on-gold shadow-sm active:scale-90 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <PlusIcon className="h-5 w-5" />
    </button>
  );
}
