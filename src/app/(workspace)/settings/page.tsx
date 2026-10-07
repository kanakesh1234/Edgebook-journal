"use client";

import { Suspense, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { useApp } from "@/lib/store";
import { useTheme } from "@/lib/theme";
import { dataStore } from "@/lib/services/storage";
import { primaryChallenge } from "@/lib/challenges";
import { haptic } from "@/lib/haptics";
import { CandlestickIcon, InfoIcon, ShieldIcon, SparklesIcon, UserIcon } from "@/components/ui/icons";
import { AppearanceGlyph, DatabaseGlyph } from "@/components/settings/icons";
import { Avatar, BackButton, Group, Row } from "@/components/settings/primitives";
import {
  PANE_TITLES,
  PaneView,
  clampReply,
  formatBytes,
  isPaneId,
  themeLabel,
  useDisplayName,
  type PaneId,
} from "@/components/settings/panes";

/* ------------------------------------------------------------------ */
/*  Settings — progressive, Apple-style navigation                     */
/*                                                                      */
/*  Phones:   list → push to a detail page (back button, slide-in).    */
/*  Desktop:  list on the left, selected pane on the right.            */
/*  The open pane lives in the URL (?pane=appearance) so the browser   */
/*  back button, deep links and refresh all behave.                    */
/* ------------------------------------------------------------------ */

/** Tablet and up get master–detail (like iPadOS / macOS Settings); phones get push navigation. */
const DESKTOP_QUERY = "(min-width: 768px)";

function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(DESKTOP_QUERY);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={null}>
      <SettingsShell />
    </Suspense>
  );
}

function SettingsShell() {
  const router = useRouter();
  const params = useSearchParams();
  const reduce = useReducedMotion();
  const desktop = useIsDesktop();

  const raw = params.get("pane");
  const pane: PaneId | null = isPaneId(raw) ? raw : null;
  const current: PaneId | null = pane ?? (desktop ? "profile" : null);

  // Storage estimate is shared by the list (row value) and the Data pane.
  const entryCount = useApp((s) => s.entries.length);
  const [usage, setUsage] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    void dataStore.estimateUsage().then((v) => alive && setUsage(v));
    return () => { alive = false; };
  }, [entryCount]);

  // Navigation: phones push history (so Back pops a pane); desktop swaps in place.
  const pushed = useRef(0);
  const open = (id: PaneId) => {
    haptic.selection();
    const url = `/settings?pane=${id}`;
    if (desktop) {
      router.replace(url, { scroll: false });
    } else {
      pushed.current += 1;
      router.push(url, { scroll: false });
    }
  };
  const back = () => {
    if (pushed.current > 0) {
      pushed.current -= 1;
      router.back();
    } else {
      router.replace("/settings", { scroll: false });
    }
  };

  // On phones, land at the top of the new page with focus on its title.
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (desktop || !pane) return;
    window.scrollTo({ top: 0 });
    headingRef.current?.focus({ preventScroll: true });
  }, [pane, desktop]);

  const Heading = desktop ? "h2" : "h1";

  return (
    <div className="st-root mx-auto w-full max-w-[640px] pb-8 md:max-w-none">
      <div className="md:grid md:grid-cols-[280px_minmax(0,1fr)] md:items-start md:gap-8 lg:grid-cols-[320px_minmax(0,1fr)] lg:gap-12 xl:grid-cols-[360px_minmax(0,1fr)] xl:gap-16">
        {(desktop || !current) && (
          <nav aria-label="Settings" className="md:sticky md:top-20 lg:top-6">
            <h1 className="st-large-title">Settings</h1>
            <SettingsList current={desktop ? current : null} onOpen={open} usage={usage} />
          </nav>
        )}

        {current && (
          <div className="min-w-0 md:max-w-[720px]">
            {!desktop && <BackButton onClick={back} />}
            <motion.div
              key={current}
              initial={reduce ? { opacity: 0 } : desktop ? { opacity: 0, y: 8 } : { opacity: 0, x: 32 }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              <Heading ref={headingRef} tabIndex={-1} className="st-pane-title">
                {PANE_TITLES[current]}
              </Heading>
              <PaneView id={current} usage={usage} />
            </motion.div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ the list ------------------------------ */

function SettingsList({
  current,
  onOpen,
  usage,
}: {
  current: PaneId | null;
  onOpen: (id: PaneId) => void;
  usage: number | null;
}) {
  const user = useApp((s) => s.user);
  const settings = useApp((s) => s.settings);
  const displayName = useDisplayName();
  const { choice } = useTheme();
  const challenge = primaryChallenge(settings);
  const replySize = clampReply(settings.aiPrefs?.responseTokenLimit ?? 900);

  const item = (id: PaneId) => ({
    title: PANE_TITLES[id],
    onClick: () => onOpen(id),
    selected: current === id,
    current: current === id,
    chevron: true,
  });

  return (
    <>
      <Group>
        <Row
          {...item("profile")}
          title={displayName || "Set up your profile"}
          subtitle={user?.email}
          large
          leading={<Avatar name={displayName} size={56} />}
        />
      </Group>

      <Group>
        <Row {...item("account")} icon={<UserIcon />} tone="info" />
        <Row {...item("privacy")} icon={<ShieldIcon />} tone="info" />
      </Group>

      <Group>
        <Row {...item("appearance")} icon={<AppearanceGlyph />} tone="ink" value={themeLabel(choice)} />
        <Row {...item("minato")} icon={<SparklesIcon />} tone="gold" value={replySize.toLocaleString()} />
        <Row {...item("trading")} icon={<CandlestickIcon />} tone="profit" value={challenge?.name} />
      </Group>

      <Group>
        <Row {...item("data")} icon={<DatabaseGlyph />} tone="ink" value={usage != null ? formatBytes(usage) : undefined} />
        <Row {...item("about")} icon={<InfoIcon />} tone="ink" />
      </Group>
    </>
  );
}
