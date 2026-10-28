"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useReducedMotion } from "motion/react";
import { useApp } from "@/lib/store";
import { todayKey } from "@/lib/format";
import { toast } from "@/components/ui/toast";
import { useLessonIndex } from "@/components/lessons/use-lesson-index";
import type { LessonView } from "@/components/lessons/types";
import { useReadProgress } from "@/components/lessons/progress";
import { buildFeed, cardsForKeys, extractVideoUrl, keyExists, type BuildInput } from "@/lib/feed/build";
import { savedKeys } from "@/lib/feed/state";
import { music } from "@/lib/feed/music";
import type { FeedCard, FeedCollection, FeedKey } from "@/lib/feed/types";
import { recentSeen, useFeed, useFeedSync } from "./feed-store";
import { useSessionClock } from "./use-session-clock";
import { EndReel, LessonReel, SetupReel, StarterReel, TradeReel, VideoReel, type ReelProps } from "./reels";
import { BreakPrompt, CollectSheet, ManageCollectionSheet, SettingsSheet } from "./sheets";
import { CollectionsPanel, ProgressPanel, SidePanel } from "./panels";
import { SlidersIcon, XIcon } from "./feed-icons";
import "./feed.css";

type Tab = "foryou" | "saved" | "collections" | "progress";
const TABS: { id: Tab; label: string }[] = [
  { id: "foryou", label: "For you" }, { id: "saved", label: "Saved" }, { id: "collections", label: "Collections" }, { id: "progress", label: "Progress" },
];

export function FeedScreen() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const status = useApp((s) => s.status);
  const entries = useApp((s) => s.entries);
  const settings = useApp((s) => s.settings);
  const { lessons: briefLessons, failed: lessonsFailed } = useLessonIndex();
  const [fullLessons, setFullLessons] = useState<LessonView[] | null>(null);
  const readStore = useReadProgress();
  const hydrated = useFeedSync();

  const feedState = useFeed((s) => s.state);
  const prefs = feedState.prefs;
  const replayPlaying = useFeed((s) => s.replayPlaying);
  const videoAudioActive = useFeed((s) => s.videoAudioActive);
  const videoMuted = useFeed((s) => s.videoMuted);
  const setVideoMuted = useFeed((s) => s.setVideoMuted);
  const view = useFeed((s) => s.view);
  const toggleFavorite = useFeed((s) => s.toggleFavorite);
  const setPrefs = useFeed((s) => s.setPrefs);
  const session = useSessionClock(prefs.dailyMinutes);

  const [tab, setTab] = useState<Tab>("foryou");
  const [openColId, setOpenColId] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const [collectKey, setCollectKey] = useState<FeedKey | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const tabsRef = useRef<HTMLDivElement>(null);

  // Hydrate full lesson HTML in the background so embedded <video> tags inside lessons are discovered.
  useEffect(() => {
    if (status !== "authenticated") return;
    let alive = true;
    fetch("/api/lessons", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<{ lessons?: LessonView[] }>) : null))
      .then((d) => { if (alive && d?.lessons) setFullLessons(d.lessons); })
      .catch(() => {});
    return () => { alive = false; };
  }, [status]);

  const lessons = useMemo(() => {
    if (!briefLessons) return fullLessons;
    if (!fullLessons) return briefLessons;
    const fullById = new Map(fullLessons.map((l) => [l.id, l]));
    return briefLessons.map((b) => {
      const f = fullById.get(b.id);
      return f && f.html ? { ...b, html: f.html } : b;
    });
  }, [briefLessons, fullLessons]);

  const today = todayKey();
  const playbook = useMemo(() => settings.playbook ?? [], [settings.playbook]);
  const readLessons = useMemo(() => new Set(Object.entries(readStore).filter(([, v]) => v?.done).map(([k]) => k)), [readStore]);
  const lessonList = lessonsFailed && !lessons ? null : lessons;

  // Inputs that decide card *content* (no `seen`/favorites, so Saved views don't churn while scrolling).
  const liveInput = useMemo<BuildInput>(() => ({
    entries, playbook, lessons: lessonList, state: feedState, seen: new Set(), readLessons, today, startingBalance: settings.startingEquity, currency: settings.currency,
  }), [entries, playbook, lessonList, feedState, readLessons, today, settings.startingEquity, settings.currency]);
  const inputRef = useRef(liveInput);
  inputRef.current = liveInput;

  const ready = status === "authenticated" && hydrated && (lessons !== null || lessonsFailed);

  // The "For you" batch is ranked once per visit and then frozen, so it never reshuffles under your thumb.
  const [batch, setBatch] = useState<FeedCard[] | null>(null);
  useEffect(() => {
    if (!ready || batch) return;
    const i = inputRef.current;
    setBatch(buildFeed({ ...i, seen: recentSeen(useFeed.getState().seen, i.today) }));
    // drop saved references to deleted trades/setups (lessons are left alone: a failed fetch must never erase saves)
    if (i.entries.length > 0) useFeed.getState().prune((k) => k.startsWith("lesson:") || keyExists(i, k));
  }, [ready, batch]);

  // Enrich frozen batch if full lesson HTML arrives with embedded video URLs
  useEffect(() => {
    if (!batch || !fullLessons) return;
    const videoByLesson = new Map<string, string>();
    for (const l of fullLessons) {
      const v = extractVideoUrl(l.html, l.cover);
      if (v) videoByLesson.set(`lesson:${l.id}`, v);
    }
    if (videoByLesson.size === 0) return;
    setBatch((cur) =>
      cur
        ? cur.map((c) => (c.kind === "lesson" && !c.videoUrl && videoByLesson.has(c.key) ? { ...c, videoUrl: videoByLesson.get(c.key) } : c))
        : cur,
    );
  }, [batch, fullLessons]);

  const openCol = openColId ? feedState.collections.find((c) => c.id === openColId) ?? null : null;
  useEffect(() => { if (openColId && !openCol) setOpenColId(null); }, [openColId, openCol]);

  const cards = useMemo<FeedCard[]>(() => {
    if (tab === "foryou") return batch ?? [];
    if (tab === "saved") return cardsForKeys(liveInput, feedState.favorites);
    if (tab === "collections" && openCol) return cardsForKeys(liveInput, openCol.items);
    return [];
  }, [tab, batch, liveInput, feedState.favorites, openCol]);
  const showReels = tab === "foryou" || tab === "saved" || (tab === "collections" && !!openCol);

  const favSet = useMemo(() => new Set(feedState.favorites), [feedState.favorites]);
  const savedSet = useMemo(() => savedKeys(feedState), [feedState]);

  /* ------------------------------ navigation ------------------------------ */
  const goto = useCallback((i: number) => {
    const el = scroller.current;
    if (!el) return;
    const n = Math.max(0, Math.min(i, el.querySelectorAll(".fd-card").length - 1));
    el.scrollTo({ top: n * el.clientHeight, behavior: reduce ? "auto" : "smooth" });
  }, [reduce]);

  // Keyboard stepping tracks the *intended* card, not the one the observer last reported: during a smooth scroll the
  // observer lags, and a quick second press would otherwise aim at the same card as the first.
  const pending = useRef<{ idx: number; timer: ReturnType<typeof setTimeout> } | null>(null);
  const step = useCallback((dir: 1 | -1) => {
    const base = pending.current ? pending.current.idx : active;
    const total = scroller.current?.querySelectorAll(".fd-card").length ?? 0;
    const idx = Math.max(0, Math.min(base + dir, total - 1));
    if (pending.current) clearTimeout(pending.current.timer);
    pending.current = { idx, timer: setTimeout(() => { pending.current = null; }, 800) };
    goto(idx);
  }, [active, goto]);
  useEffect(() => () => { if (pending.current) clearTimeout(pending.current.timer); }, []);

  const changeTab = (t: Tab) => { setTab(t); setOpenColId(null); setActive(0); };
  useEffect(() => { scroller.current?.scrollTo({ top: 0 }); setActive(0); }, [tab, openColId]);
  useEffect(() => { tabsRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ inline: "center", block: "nearest", behavior: "auto" }); }, [tab]);

  // which card fills the screen
  useEffect(() => {
    const root = scroller.current;
    if (!root || !showReels) return;
    const els = [...root.querySelectorAll<HTMLElement>(".fd-card")];
    if (!els.length) return;
    const io = new IntersectionObserver((list) => {
      for (const e of list) if (e.isIntersecting && e.intersectionRatio >= 0.6) setActive(Number((e.target as HTMLElement).dataset.i ?? 0));
    }, { root, threshold: [0.6] });
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [cards.length, showReels, tab, openColId]);

  // count a card as reviewed only after it has been on screen for a moment
  const activeCard = showReels ? cards[active] : undefined;
  const activeKey = activeCard && activeCard.kind !== "end" && activeCard.kind !== "starter" ? activeCard.key : null;
  useEffect(() => {
    if (!activeKey) return;
    const t = window.setTimeout(() => view(activeKey), 1200);
    return () => window.clearTimeout(t);
  }, [activeKey, view]);

  /* ------------------------------- keyboard ------------------------------- */
  const sheetOpen = !!collectKey || settingsOpen || manageOpen || session.prompt !== "none";
  const activeHasVideo = Boolean(
    activeCard &&
    (activeCard.kind === "video" ||
      (activeCard.kind === "lesson" && activeCard.videoUrl) ||
      (activeCard.kind === "trade" && !activeCard.replayable && activeCard.videoUrl)),
  );
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sheetOpen || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (t && t.tagName === "BUTTON" && (e.key === " " || e.key === "Enter")) return; // let a focused button act normally
      const k = e.key.toLowerCase();
      if (!showReels) return;
      if (k === "j" || k === "arrowdown") { e.preventDefault(); step(1); }
      else if (k === "k" || k === "arrowup") { e.preventDefault(); step(-1); }
      else if (k === " ") { e.preventDefault(); window.dispatchEvent(new Event("fd:toggle-play")); }
      else if (k === "f" && activeKey) useFeed.getState().toggleFavorite(activeKey);
      else if (k === "c" && activeKey) setCollectKey(activeKey);
      else if (k === "m") {
        if (activeHasVideo) setVideoMuted(!videoMuted);
        else setPrefs({ music: { enabled: !prefs.music.enabled } });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen, showReels, activeKey, activeHasVideo, videoMuted, setVideoMuted, step, setPrefs, prefs.music.enabled]);

  /* -------------------------------- music -------------------------------- */
  const [docVisible, setDocVisible] = useState(true);
  useEffect(() => {
    const h = () => setDocVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", h);
    return () => document.removeEventListener("visibilitychange", h);
  }, []);
  const volumeRef = useRef(prefs.music.volume);
  volumeRef.current = prefs.music.volume;
  // Never overlap replay ambience with an active unmuted video
  const shouldPlay = prefs.music.enabled && replayPlaying && !videoAudioActive && docVisible && session.prompt === "none";
  useEffect(() => {
    if (!shouldPlay) { music.stop(500); return; }
    let cancelled = false, retry: (() => void) | null = null;
    void music.play(prefs.music.source, volumeRef.current).then((r) => {
      if (cancelled) return;
      if (r === "missing") { toast.info("That track isn’t on this device", "Using the built-in ambience instead."); setPrefs({ music: { source: "ambient-calm" } }); }
      else if (r === "blocked") { retry = () => { void music.play(prefs.music.source, volumeRef.current); }; window.addEventListener("pointerdown", retry, { once: true }); }
    });
    return () => { cancelled = true; if (retry) window.removeEventListener("pointerdown", retry); music.stop(500); };
  }, [shouldPlay, prefs.music.source, setPrefs]);
  useEffect(() => { music.setVolume(prefs.music.volume); }, [prefs.music.volume]);
  useEffect(() => () => music.stop(250), []);

  /* -------------------------------- render -------------------------------- */
  const renderCard = (c: FeedCard, i: number) => {
    if (c.kind === "end") {
      return <EndReel key={c.key} card={c} index={i} total={cards.length} active={i === active} savedCount={feedState.favorites.length} minutes={session.minutes}
        today={(feedState.progress.day[today]?.cards) ?? 0} onSaved={() => changeTab("saved")} />;
    }
    const common: Omit<ReelProps, "card"> = {
      index: i, total: cards.length, active: i === active, near: Math.abs(i - active) <= 1,
      fav: favSet.has(c.key), collected: feedState.collections.some((col) => col.items.includes(c.key)),
      onFav: () => toggleFavorite(c.key), onCollect: () => setCollectKey(c.key),
    };
    switch (c.kind) {
      case "trade": return <TradeReel key={c.key} card={c} {...common} />;
      case "setup": return <SetupReel key={c.key} card={c} {...common} />;
      case "lesson": return <LessonReel key={c.key} card={c} {...common} />;
      case "video": return <VideoReel key={c.key} card={c} {...common} />;
      case "starter": return <StarterReel key={c.key} card={c} {...common} />;
    }
  };

  const loading = tab === "foryou" && !batch;

  return (
    <div className="fd-root" data-tab={tab}>
      <div className="fd-grid">
        <div className="fd-col">
          <header className="fd-top">
            {openCol ? (
              <>
                <button className="fd-iconbtn" onClick={() => setOpenColId(null)} aria-label="Back to collections"><XIcon /></button>
                <p className="fd-chip" style={{ minHeight: "2.25rem", fontSize: "0.8125rem" }}><span>{openCol.name} · {openCol.items.length}</span></p>
                <span className="fd-spacer" />
                <button className="fd-iconbtn" onClick={() => setManageOpen(true)} aria-label="Manage collection"><SlidersIcon /></button>
              </>
            ) : (
              <>
                <div ref={tabsRef} className="fd-tabs" role="tablist" aria-label="Feed sections">
                  {TABS.map((t) => (
                    <button key={t.id} role="tab" id={`fd-tab-${t.id}`} className="fd-tab" aria-selected={tab === t.id} onClick={() => changeTab(t.id)}>{t.label}</button>
                  ))}
                </div>
                <span className="fd-spacer" />
                <button className="fd-iconbtn" onClick={() => setSettingsOpen(true)} aria-label="Feed settings"><SlidersIcon /></button>
              </>
            )}
          </header>

          {showReels ? (
            cards.length > 0 ? (
              <div ref={scroller} className="fd-scroller" role="feed" aria-label="Study feed" aria-busy={loading} tabIndex={0}>
                {cards.map(renderCard)}
              </div>
            ) : loading ? (
              <div className="fd-panel" role="status" aria-label="Loading your feed"><div className="fd-skel" style={{ height: "60%", borderRadius: "1.25rem", marginTop: "1rem" }} /></div>
            ) : (
              <div className="fd-panel"><div className="fd-empty">
                <h2>{tab === "saved" ? "Nothing saved yet" : "This collection is empty"}</h2>
                <p>{tab === "saved" ? "Tap the heart on any card to keep it here." : "Use Collect on any card to add it."}</p>
                <button className="fd-linkbtn is-primary" onClick={() => changeTab("foryou")}>Back to For you</button>
              </div></div>
            )
          ) : tab === "collections" ? (
            <CollectionsPanel onOpen={(c: FeedCollection) => setOpenColId(c.id)} />
          ) : (
            <ProgressPanel minutes={session.minutes} limit={prefs.dailyMinutes} />
          )}
        </div>
        <SidePanel minutes={session.minutes} limit={prefs.dailyMinutes} saved={savedSet.size} />
      </div>

      <CollectSheet itemKey={collectKey} onClose={() => setCollectKey(null)} />
      <ManageCollectionSheet collection={manageOpen ? openCol : null} onClose={() => setManageOpen(false)} onDeleted={() => { setManageOpen(false); setOpenColId(null); }} />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <BreakPrompt kind={session.prompt} minutes={session.minutes}
        onBreak={() => { music.stop(200); router.push("/dashboard"); }} onMore={() => session.more(5)} />
    </div>
  );
}
