"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useApp } from "@/lib/store";
import { useBacktest } from "@/lib/backtesting/store";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { CandlestickIcon, FlagIcon, FlaskIcon, PlusIcon } from "@/components/ui/icons";
import { LabProvider, useLab } from "@/components/lab/lab-overlays";
import { Overview } from "@/components/lab/overview";
import { SetupsView } from "@/components/lab/playbook";
import { ChallengesView } from "@/components/lab/challenges";
import { BacktestsView } from "@/components/lab/backtesting";
import { FilterSortMenu, MenuItem, Popover, SPRING, SearchField, Segmented, btnPrimary, type MenuGroup } from "@/components/lab/lab-ui";
import {
  BT_FILTERS,
  BT_SORTS,
  CHALLENGE_FILTERS,
  CHALLENGE_SORTS,
  SETUP_SORTS,
  TABS,
  TAB_HASH,
  buildChallengeInfos,
  buildSetupInfos,
  tabFromHash,
  type BtFilter,
  type BtSort,
  type ChallengeFilter,
  type ChallengeSort,
  type LabTab,
  type SetupSort,
} from "@/components/lab/lab-model";
import "@/components/lab/lab.css";

/** Survives navigating into a backtest and back, so the Lab is where you left it. Resets on full reload. */
let remembered: LabTab = "overview";

/**
 * Trading Lab — the place where you define, test and measure your edge.
 *   Overview    → the primary challenge, what's in flight, a short look at everything else
 *   Setups      → your playbook: rules, details and how each setup performs
 *   Challenges  → trading periods with an objective, drawdown floor and limits
 *   Backtests   → replay sessions you can pick up where you left off
 * Everything reads and writes the same stores as before; this file only owns view state.
 * `/lab#backtesting`, `#challenges` and `#setups` deep-link straight to a tab.
 */
export default function LabPage() {
  const entries = useApp((s) => s.entries);
  const settings = useApp((s) => s.settings);
  const playbook = settings.playbook;
  const challengeList = settings.challenges;
  const primaryId = settings.primaryChallengeId ?? null;

  const setups = useMemo(() => buildSetupInfos(playbook ?? [], entries), [playbook, entries]);
  const challenges = useMemo(() => buildChallengeInfos(challengeList ?? [], entries, primaryId), [challengeList, entries, primaryId]);

  return (
    <LabProvider setups={setups} challenges={challenges}>
      <Lab setups={setups} challenges={challenges} entryCount={entries.length} />
    </LabProvider>
  );
}

function Lab({
  setups,
  challenges,
  entryCount,
}: {
  setups: ReturnType<typeof buildSetupInfos>;
  challenges: ReturnType<typeof buildChallengeInfos>;
  entryCount: number;
}) {
  const lab = useLab();
  const reduce = useReducedMotion();

  const sessions = useBacktest((s) => s.sessions);
  const sessionsLoading = useBacktest((s) => s.sessionsLoading);
  const loadSessionList = useBacktest((s) => s.loadSessionList);
  useEffect(() => {
    void loadSessionList();
  }, [loadSessionList]);

  /* ------------------------------ tab + hash ------------------------------ */

  const [tab, setTabState] = useState<LabTab>(remembered);

  // Deep links (/lab#backtesting) are read after mount, once the router has updated the URL.
  useLayoutEffect(() => {
    const fromHash = tabFromHash(window.location.hash);
    if (fromHash) {
      remembered = fromHash;
      setTabState(fromHash);
    }
    const onHash = () => {
      const t = tabFromHash(window.location.hash);
      if (t) {
        remembered = t;
        setTabState(t);
      }
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const setTab = useCallback((t: LabTab) => {
    haptic.selection();
    remembered = t;
    setTabState(t);
    const h = TAB_HASH[t];
    window.history.replaceState(window.history.state, "", `${window.location.pathname}${window.location.search}${h ? `#${h}` : ""}`);
  }, []);

  /* ------------------------------ filters per tab ------------------------------ */

  const [queries, setQueries] = useState<Record<LabTab, string>>({ overview: "", setups: "", challenges: "", backtests: "" });
  const query = queries[tab];
  const setQuery = useCallback((v: string) => setQueries((q) => ({ ...q, [tab]: v })), [tab]);

  const [setupSort, setSetupSort] = useState<SetupSort>("playbook");
  const [challengeSort, setChallengeSort] = useState<ChallengeSort>("default");
  const [challengeStatus, setChallengeStatus] = useState<ChallengeFilter>("all");
  const [btSort, setBtSort] = useState<BtSort>("recent");
  const [btStatus, setBtStatus] = useState<BtFilter>("all");

  const clearTab = useCallback(() => {
    setQueries((q) => ({ ...q, [tab]: "" }));
    if (tab === "challenges") {
      setChallengeStatus("all");
      setChallengeSort("default");
    }
    if (tab === "backtests") {
      setBtStatus("all");
      setBtSort("recent");
    }
    if (tab === "setups") setSetupSort("playbook");
  }, [tab]);

  const menu = useMemo(() => {
    const groups: MenuGroup[] = [];
    let dirty = false;
    let label = "Sort";
    if (tab === "setups") {
      groups.push({ label: "Sort by", value: setupSort, options: SETUP_SORTS, onChange: (id) => setSetupSort(id as SetupSort) });
      dirty = setupSort !== "playbook";
    } else if (tab === "challenges") {
      label = "Filter";
      groups.push({ label: "Status", value: challengeStatus, options: CHALLENGE_FILTERS, onChange: (id) => setChallengeStatus(id as ChallengeFilter) });
      groups.push({ label: "Sort by", value: challengeSort, options: CHALLENGE_SORTS, onChange: (id) => setChallengeSort(id as ChallengeSort) });
      dirty = challengeStatus !== "all" || challengeSort !== "default";
    } else if (tab === "backtests") {
      label = "Filter";
      groups.push({ label: "Status", value: btStatus, options: BT_FILTERS, onChange: (id) => setBtStatus(id as BtFilter) });
      groups.push({ label: "Sort by", value: btSort, options: BT_SORTS, onChange: (id) => setBtSort(id as BtSort) });
      dirty = btStatus !== "all" || btSort !== "recent";
    }
    return { groups, dirty, label };
  }, [tab, setupSort, challengeStatus, challengeSort, btStatus, btSort]);

  /* ------------------------------ sticky bar + keys ------------------------------ */

  const sentinelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const top = window.matchMedia("(min-width: 1024px)").matches ? 0 : 56;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), { rootMargin: `-${top + 1}px 0px 0px 0px` });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // "/" focuses search, like the Journal and Lessons.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (!inputRef.current) return;
      e.preventDefault();
      inputRef.current.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* --------------------------------- render --------------------------------- */

  const showEmpty = entryCount === 0 && setups.length === 0;
  const searchable = tab !== "overview";
  const placeholder = tab === "setups" ? "Search setups" : tab === "challenges" ? "Search challenges" : "Search backtests";

  const newForTab =
    tab === "setups"
      ? { label: "New setup", short: "New", run: lab.newSetup }
      : tab === "challenges"
        ? { label: "New challenge", short: "New", run: lab.newChallenge }
        : tab === "backtests"
          ? { label: "New session", short: "New", run: lab.newSession }
          : null;

  return (
    <div className="w-full pb-28 sm:pb-16">
      <header className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em] text-ink sm:text-3xl">Trading Lab</h1>
          <p className="mt-1.5 max-w-md text-[15px] leading-relaxed text-muted">Define your edge, test it, and measure how you execute it.</p>
        </div>

        {newForTab ? (
          <button type="button" onClick={newForTab.run} className={cn(btnPrimary, "shrink-0")}>
            <PlusIcon className="h-4 w-4" />
            <span className="hidden sm:inline">{newForTab.label}</span>
            <span className="sm:hidden">{newForTab.short}</span>
          </button>
        ) : (
          <Popover
            width={216}
            trigger={({ toggle, open }) => (
              <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={toggle} className={cn(btnPrimary, "shrink-0")}>
                <PlusIcon className={cn("h-4 w-4 transition-transform duration-300", open && "rotate-45")} />
                New
              </button>
            )}
          >
            {(close) => (
              <>
                <MenuItem icon={<FlaskIcon />} onClick={() => { close(); lab.newSetup(); }}>Setup</MenuItem>
                <MenuItem icon={<FlagIcon />} onClick={() => { close(); lab.newChallenge(); }}>Challenge</MenuItem>
                <MenuItem icon={<CandlestickIcon />} onClick={() => { close(); lab.newSession(); }}>Backtest session</MenuItem>
              </>
            )}
          </Popover>
        )}
      </header>

      {/* Sections + search */}
      <div ref={sentinelRef} className="h-px" aria-hidden="true" />
      <div className={cn("lab-bar sticky top-14 z-30 -mx-4 mt-4 px-4 py-2.5 sm:-mx-6 sm:px-6 lg:top-0 lg:mx-0 lg:px-0", stuck && "is-stuck")}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
          <Segmented className="w-full md:w-auto" label="Trading Lab sections" layoutId="lab-tab" value={tab} options={TABS} onChange={setTab} />

          <AnimatePresence initial={false}>
            {searchable && (
              <motion.div
                key="search"
                initial={reduce ? false : { opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                transition={SPRING}
                className="flex min-w-0 flex-1 items-center gap-2"
              >
                <SearchField value={query} onChange={setQuery} placeholder={placeholder} inputRef={inputRef} />
                <FilterSortMenu label={menu.label} groups={menu.groups} dirty={menu.dirty} onReset={clearTab} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Content */}
      <div className="mt-5" role="tabpanel" aria-label={TABS.find((t) => t.id === tab)?.label}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={tab}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            transition={SPRING}
          >
            {tab === "overview" && <Overview setups={setups} challenges={challenges} sessions={sessions} showEmpty={showEmpty} onTab={setTab} />}
            {tab === "setups" && <SetupsView infos={setups} query={query} sort={setupSort} onClear={clearTab} />}
            {tab === "challenges" && (
              <ChallengesView infos={challenges} query={query} sort={challengeSort} status={challengeStatus} onClear={clearTab} />
            )}
            {tab === "backtests" && (
              <BacktestsView sessions={sessions} loading={sessionsLoading} query={query} sort={btSort} status={btStatus} onClear={clearTab} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
