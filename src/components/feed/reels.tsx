"use client";

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useReducedMotion } from "motion/react";
import { useApp } from "@/lib/store";
import { useUi } from "@/lib/ui-store";
import { formatSignedMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { useImageUrls } from "@/lib/hooks";
import { useReplayTrade } from "@/components/journal/replay-trade";
import { lessonsPost } from "@/components/lessons/api";
import { invalidateLessonIndex } from "@/components/lessons/use-lesson-index";
import { barDelay, endIdx, frameAt, idxFromProgress, progressOf, SPEEDS, stepIdx, type Speed } from "@/lib/feed/replay";
import type { EndCard, FeedCard, LessonCard, SetupCard, StarterCard, TradeCard, VideoCard } from "@/lib/feed/types";
import { useFeed } from "./feed-store";
import { useReplayData } from "./replay-chart";

const ReplayChart = lazy(() => import("./replay-canvas").then((m) => ({ default: m.ReplayChart })));
import {
  ArrowUpRightIcon, BookOpenIcon, BookmarkPlusIcon, HeartIcon, PauseIcon, PlayIcon, RestartIcon, SpeakerIcon, StepIcon,
} from "./feed-icons";

export type CardShape = "portrait" | "landscape" | "editorial" | "card";

export function cardShapeOf(card?: FeedCard): CardShape {
  if (!card) return "landscape";
  if (card.kind === "video") return "portrait";
  if (card.kind === "trade") return card.replayable || card.hasImage || card.videoUrl ? "landscape" : "card";
  if (card.kind === "lesson") return "editorial";
  return "card";
}

export interface ReelProps<T extends FeedCard = FeedCard> {
  card: T;
  index: number;
  total: number;
  /** The card filling the active viewport slot. */
  active: boolean;
  /** The active card and its neighbours — the only ones allowed to fetch. */
  near: boolean;
  fav: boolean;
  collected: boolean;
  onFav: () => void;
  onCollect: () => void;
}

/* -------------------------- visibility helper -------------------------- */

function useDocVisible(): boolean {
  const [visible, setVisible] = useState(() => (typeof document === "undefined" ? true : document.visibilityState === "visible"));
  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  return visible;
}

/* ----------------------------- shared frame ----------------------------- */

function Rail({
  fav,
  collected,
  onFav,
  onCollect,
  href,
  openLabel,
  onOpen,
}: Pick<ReelProps, "fav" | "collected" | "onFav" | "onCollect"> & { href?: string; openLabel?: string; onOpen?: () => void }) {
  const haptics = useFeed((s) => s.state.prefs.haptics);
  const [pop, setPop] = useState(false);
  return (
    <div className="fd-rail" role="group" aria-label="Card actions">
      <button
        type="button"
        className="fd-act"
        data-heart="true"
        aria-pressed={fav}
        aria-label={fav ? "Remove from favorites" : "Add to favorites"}
        onClick={() => {
          onFav();
          if (haptics) haptic.selection();
          setPop(true);
          window.setTimeout(() => setPop(false), 400);
        }}
      >
        <span className={cn(pop && fav && "fd-pop")}><HeartIcon filled={fav} /></span>
        <span>{fav ? "Saved" : "Favorite"}</span>
      </button>
      <button
        type="button"
        className="fd-act"
        aria-pressed={collected}
        aria-label="Add to a collection"
        onClick={() => {
          onCollect();
          if (haptics) haptic.selection();
        }}
      >
        <span><BookmarkPlusIcon filled={collected} /></span>
        <span>Collect</span>
      </button>
      {href && (
        <Link href={href} onClick={onOpen} className="fd-act" aria-label={openLabel ?? "Open"}>
          <span><ArrowUpRightIcon /></span>
          <span>{openLabel ?? "Open"}</span>
        </Link>
      )}
    </div>
  );
}

function Frame({
  props,
  rail,
  kind,
  shape,
  children,
  label,
  split,
}: {
  props: ReelProps;
  rail: ReactNode;
  kind: string;
  shape: CardShape;
  children: ReactNode;
  label: string;
  split?: boolean;
}) {
  return (
    <article
      className="fd-card"
      data-i={props.index}
      data-key={props.card.key}
      data-kind={props.card.kind}
      data-shape={shape}
      data-active={props.active || undefined}
      role="article"
      aria-posinset={props.index + 1}
      aria-setsize={props.total}
      aria-label={label}
    >
      <div className="fd-stage" data-shape={shape}>
        <div
          className="fd-inner"
          data-shape={shape}
          data-split={split ?? (kind === "Replay" || kind === "Chart" || kind === "Video") ? "" : undefined}
        >
          <div className="fd-card-head">
            <p className="fd-chip" title="Why you're seeing this"><span>{props.card.reason}</span></p>
            <p className="fd-kind">{kind}</p>
          </div>
          {children}
        </div>
        {rail}
      </div>
    </article>
  );
}

const Skeleton = ({ text }: { text: string }) => (
  <div className="fd-skel absolute inset-0 grid place-items-center text-[13px]" style={{ color: "var(--faint)" }} role="status"><span>{text}</span></div>
);

/* ------------------------- Reels video player ------------------------- */

export function FeedVideoPlayer({
  src,
  poster,
  active,
  near,
  label,
  aspect = "auto",
  onAspectDetected,
}: {
  src: string;
  poster?: string | null;
  active: boolean;
  near: boolean;
  label: string;
  aspect?: "16:9" | "9:16" | "auto";
  onAspectDetected?: (portrait: boolean) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const prefs = useFeed((s) => s.state.prefs);
  const muted = useFeed((s) => s.videoMuted);
  const setMuted = useFeed((s) => s.setVideoMuted);
  const setVideoAudioActive = useFeed((s) => s.setVideoAudioActive);
  const reduce = useReducedMotion();
  const docVisible = useDocVisible();

  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [portrait, setPortrait] = useState(aspect === "9:16");
  const [hud, setHud] = useState<"play" | "pause" | null>(null);
  const hudTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const userPausedRef = useRef(false);

  const flashHud = useCallback((state: "play" | "pause") => {
    if (hudTimer.current) clearTimeout(hudTimer.current);
    setHud(state);
    hudTimer.current = setTimeout(() => setHud(null), 650);
  }, []);

  useEffect(() => () => { if (hudTimer.current) clearTimeout(hudTimer.current); }, []);

  // Keep DOM muted property synced with store state
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.muted = muted;
  }, [muted]);

  // Coordinate overlapping audio: notify store when active video is playing with sound
  useEffect(() => {
    const activeWithSound = active && playing && !muted && docVisible;
    setVideoAudioActive(activeWithSound);
    return () => { if (active) setVideoAudioActive(false); };
  }, [active, playing, muted, docVisible, setVideoAudioActive]);

  // Autoplay when active card enters viewport; pause immediately when leaving or tab hidden
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    if (!active || !docVisible) {
      if (!el.paused) el.pause();
      setPlaying(false);
      if (!active) userPausedRef.current = false;
      return;
    }
    if (!prefs.autoplayReplay || reduce || userPausedRef.current || failed) return;

    let cancelled = false;
    const startPlayback = async () => {
      try {
        el.muted = useFeed.getState().videoMuted;
        await el.play();
        if (!cancelled) setPlaying(true);
      } catch {
        // Browser blocked unmuted autoplay: fall back gracefully to muted playback
        if (cancelled) return;
        el.muted = true;
        setMuted(true);
        try {
          await el.play();
          if (!cancelled) setPlaying(true);
        } catch {
          if (!cancelled) setPlaying(false);
        }
      }
    };
    void startPlayback();
    return () => {
      cancelled = true;
      if (!el.paused) el.pause();
    };
  }, [active, docVisible, prefs.autoplayReplay, reduce, failed, setMuted, src]);

  const togglePlay = useCallback(() => {
    const el = videoRef.current;
    if (!el || failed) return;
    if (el.paused) {
      userPausedRef.current = false;
      flashHud("play");
      void el.play().then(() => setPlaying(true)).catch(() => {
        el.muted = true;
        setMuted(true);
        void el.play().then(() => setPlaying(true)).catch(() => {});
      });
    } else {
      userPausedRef.current = true;
      el.pause();
      setPlaying(false);
      flashHud("pause");
    }
    if (prefs.haptics) haptic.selection();
  }, [failed, flashHud, prefs.haptics, setMuted]);

  const toggleRef = useRef(togglePlay);
  toggleRef.current = togglePlay;
  useEffect(() => {
    if (!active) return;
    const onToggle = () => toggleRef.current();
    window.addEventListener("fd:toggle-play", onToggle);
    return () => window.removeEventListener("fd:toggle-play", onToggle);
  }, [active]);

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    const el = videoRef.current;
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (el) {
      el.muted = nextMuted;
      if (!nextMuted && el.paused && active && !userPausedRef.current) {
        void el.play().then(() => setPlaying(true)).catch(() => {});
      }
    }
    if (prefs.haptics) haptic.selection();
  };

  const resolvedAspect = aspect === "auto" ? (portrait ? "9:16" : "16:9") : aspect;

  return (
    <div
      className={cn("fd-video-wrap", resolvedAspect === "16:9" ? "fd-video-wrap--16x9" : "fd-video-wrap--9x16")}
      onClick={togglePlay}
      data-playing={playing || undefined}
    >
      {near && !failed ? (
        <video
          ref={videoRef}
          className="fd-video"
          src={src}
          poster={poster ?? undefined}
          playsInline
          loop
          muted={muted}
          preload={active ? "auto" : "metadata"}
          aria-label={label}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (v.videoWidth > 0 && v.videoHeight > 0) {
              const isPort = v.videoHeight > v.videoWidth;
              setPortrait(isPort);
              onAspectDetected?.(isPort);
            }
          }}
          onLoadedData={() => setReady(true)}
          onCanPlay={() => setReady(true)}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onError={() => setFailed(true)}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (v.duration > 0) setProgress(Math.min(1, Math.max(0, v.currentTime / v.duration)));
          }}
        />
      ) : null}

      {!ready && !failed && !poster && <Skeleton text={near ? "Loading video…" : ""} />}
      {failed && (
        <div className="fd-overlay-msg">
          <p>This video couldn’t be loaded.</p>
        </div>
      )}

      {/* Subtle play/pause feedback indicator on tap or when manually paused */}
      {(hud || (!playing && ready && !failed)) && (
        <div className={cn("fd-tap-hud", hud && "is-transient")} aria-hidden="true">
          <span>{(hud ?? "pause") === "play" ? <PlayIcon /> : <PauseIcon />}</span>
        </div>
      )}

      {/* Unobtrusive Apple-style speaker/mute icon in the corner */}
      <button
        type="button"
        className="fd-mute-btn"
        aria-pressed={!muted}
        aria-label={muted ? "Unmute video" : "Mute video"}
        onClick={toggleMute}
      >
        <SpeakerIcon muted={muted} />
      </button>

      {/* Hairline playback progress along the bottom edge */}
      {ready && !failed && (
        <div className="fd-video-progress" aria-hidden="true">
          <i style={{ transform: `scaleX(${progress})` }} />
        </div>
      )}
    </div>
  );
}

/* -------------------------------- video -------------------------------- */

export function VideoReel(props: ReelProps<VideoCard>) {
  const { card, active, near } = props;
  const [portrait, setPortrait] = useState(true);
  const shape: CardShape = portrait ? "portrait" : "landscape";
  return (
    <Frame
      props={props}
      kind="Video"
      shape={shape}
      label={`Video: ${card.title}`}
      rail={<Rail {...props} href={card.href} openLabel="Open" />}
    >
      <div className={cn("fd-media", portrait ? "fd-media--9x16" : "fd-media--16x9")}>
        <FeedVideoPlayer
          src={card.videoUrl}
          poster={card.poster}
          active={active}
          near={near}
          label={card.title}
          aspect="auto"
          onAspectDetected={setPortrait}
        />
      </div>
      <div className="fd-info">
        <h3 className="fd-title">{card.title}</h3>
        {(card.subtitle || card.author) && (
          <p className="fd-sub fd-clamp2">
            {[card.author, card.subtitle].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
    </Frame>
  );
}

/* -------------------------------- trade -------------------------------- */

export function TradeReel(props: ReelProps<TradeCard>) {
  const { card, active, near } = props;
  const { entry } = card;
  const currency = useApp((s) => s.settings.currency);
  const money = (n: number) => formatSignedMoney(n, currency);
  const prefs = useFeed((s) => s.state.prefs);
  const reduce = useReducedMotion();
  const docVisible = useDocVisible();
  const setReplayPlaying = useFeed((s) => s.setReplayPlaying);
  const replayDone = useFeed((s) => s.replayDone);
  const setPrefs = useFeed((s) => s.setPrefs);
  const { plan, busy, start } = useReplayTrade(entry);

  const both = card.replayable && card.hasImage;
  const [mode, setMode] = useState<"replay" | "chart">(card.replayable ? "replay" : "chart");
  const [attempt, setAttempt] = useState(0);
  const data = useReplayData(entry, plan, card.replayable && mode === "replay" && near, attempt);
  const model = data.status === "ready" ? data.model : null;

  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(1);
  const [hud, setHud] = useState<"play" | "pause" | null>(null);
  const [controlsPeek, setControlsPeek] = useState(false);
  const hudTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const played = useRef(false);
  const reported = useRef(false);
  const userPausedRef = useRef(false);

  const flashHud = useCallback((state: "play" | "pause") => {
    if (hudTimer.current) clearTimeout(hudTimer.current);
    setHud(state);
    hudTimer.current = setTimeout(() => setHud(null), 600);
  }, []);

  const wakeControls = useCallback(() => {
    if (peekTimer.current) clearTimeout(peekTimer.current);
    setControlsPeek(true);
    peekTimer.current = setTimeout(() => setControlsPeek(false), 2200);
  }, []);

  useEffect(() => () => {
    if (hudTimer.current) clearTimeout(hudTimer.current);
    if (peekTimer.current) clearTimeout(peekTimer.current);
  }, []);

  useEffect(() => {
    if (model) {
      setIdx(model.startIdx);
      setPlaying(false);
      played.current = false;
      reported.current = false;
      userPausedRef.current = false;
    }
  }, [model]);

  // playback clock
  useEffect(() => {
    if (!playing || !model) return;
    const id = window.setInterval(() => setIdx((i) => stepIdx(model, i, 1)), barDelay(speed));
    return () => window.clearInterval(id);
  }, [playing, model, speed]);

  // stop at the end; count a replay only if it was actually watched
  useEffect(() => {
    if (!model) return;
    if (idx >= endIdx(model)) setPlaying(false);
    if (played.current && idx >= model.exitIdx && !reported.current) { reported.current = true; replayDone(card.key); }
  }, [idx, model, card.key, replayDone]);

  // leaving the card or hiding the tab pauses it; music follows the active card's playback
  useEffect(() => {
    if (!active || !docVisible) {
      setPlaying(false);
      if (!active) userPausedRef.current = false;
    }
  }, [active, docVisible]);

  useEffect(() => {
    if (!active) return;
    setReplayPlaying(playing);
    return () => setReplayPlaying(false);
  }, [active, playing, setReplayPlaying]);

  // Automatic playback when the active replay enters the feed (Instagram Reels / YouTube Shorts behavior)
  useEffect(() => {
    if (!active || !docVisible || mode !== "replay" || !model || !prefs.autoplayReplay || reduce || userPausedRef.current) return;
    const t = window.setTimeout(() => {
      setIdx((cur) => {
        if (cur >= endIdx(model)) {
          reported.current = false;
          return model.startIdx;
        }
        return cur;
      });
      played.current = true;
      setPlaying(true);
    }, 180);
    return () => window.clearTimeout(t);
  }, [active, docVisible, mode, model, prefs.autoplayReplay, reduce]);

  const frame = model ? frameAt(model, idx) : null;
  const togglePlay = useCallback((fromSurface = false) => {
    if (!model) return;
    if (idx >= endIdx(model)) { setIdx(model.startIdx); reported.current = false; }
    played.current = true;
    setPlaying((p) => {
      const next = !p;
      userPausedRef.current = !next;
      if (fromSurface) flashHud(next ? "play" : "pause");
      if (!next) wakeControls();
      return next;
    });
    if (prefs.haptics) haptic.selection();
  }, [model, idx, flashHud, wakeControls, prefs.haptics]);

  const toggleRef = useRef(togglePlay);
  toggleRef.current = togglePlay;
  useEffect(() => {
    if (!active) return;
    const h = () => toggleRef.current(true);
    window.addEventListener("fd:toggle-play", h);
    return () => window.removeEventListener("fd:toggle-play", h);
  }, [active]);

  const imgIds = useMemo(() => (near && card.hasImage ? entry.images.slice(0, 1).map((i) => i.id) : []), [near, card.hasImage, entry.images]);
  const urls = useImageUrls(imgIds);
  const shot = imgIds[0] ? urls[imgIds[0]] : undefined;

  const long = entry.direction === "long";
  const title = `${entry.instrument} ${long ? "Long" : "Short"}`;
  const times = entry.entryTime ? `${entry.entryTime}${entry.exitTime ? `–${entry.exitTime}` : ""} ET` : null;
  const date = new Date(`${entry.date}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
  const sign = (n: number) => (n > 0 ? "+" : n < 0 ? "−" : "");
  const label = `${title}, ${date}, ${money(entry.pnl)}`;

  let liveBadge: ReactNode = null;
  if (mode === "replay" && frame) {
    const r = frame.openR, pts = frame.openPts;
    const val = frame.done
      ? <strong className={cn("fd-num", entry.pnl >= 0 ? "fd-up" : "fd-down")}>{money(entry.pnl)}{typeof entry.rr === "number" ? ` · ${sign(entry.rr)}${Math.abs(entry.rr).toFixed(1)}R` : ""}</strong>
      : r != null ? <strong className={cn("fd-num", r >= 0 ? "fd-up" : "fd-down")}>{sign(r)}{Math.abs(r).toFixed(2)}R</strong>
      : pts != null ? <strong className={cn("fd-num", pts >= 0 ? "fd-up" : "fd-down")}>{sign(pts)}{Math.abs(pts).toFixed(2)} pts</strong>
      : null;
    liveBadge = (
      <div className="fd-live fd-live-overlay" aria-live="off">
        <small>{frame.phase === "setup" ? "Setup" : frame.phase === "open" ? (long ? "Long" : "Short") : "Closed"}</small>
        {val}
      </div>
    );
  }

  const isReplayView = mode === "replay" && card.replayable;
  const hasVisualMedia = card.replayable || card.hasImage || Boolean(card.videoUrl);
  const shape: CardShape = hasVisualMedia ? "landscape" : "card";
  const progressPct = model ? Math.round(progressOf(model, idx) * 1000) / 10 : 0;
  const showControls = !playing || controlsPeek;

  return (
    <Frame
      props={props}
      kind={card.replayable ? "Replay" : card.videoUrl ? "Video" : card.hasImage ? "Chart" : "Trade"}
      shape={shape}
      label={label}
      rail={<Rail {...props} href={`/journal?trade=${encodeURIComponent(entry.id)}`} openLabel="Trade" />}
    >
      <div
        className={cn("fd-media", hasVisualMedia && "fd-media--16x9")}
        data-controls-visible={showControls ? "true" : undefined}
        onClick={isReplayView && model ? () => togglePlay(true) : undefined}
        onPointerMove={isReplayView ? wakeControls : undefined}
        style={isReplayView && model ? { cursor: "pointer" } : undefined}
      >
        {isReplayView ? (
          data.status === "ready" && model ? (
            <>
              <Suspense fallback={<Skeleton text="Loading chart…" />}>
                <ReplayChart model={model} idx={idx} label={`${title} replay chart`} />
              </Suspense>
              {(hud || (!playing && userPausedRef.current)) && (
                <div className={cn("fd-tap-hud", hud && "is-transient")} aria-hidden="true">
                  <span>{(hud ?? "pause") === "play" ? <PlayIcon /> : <PauseIcon />}</span>
                </div>
              )}
            </>
          ) : data.status === "error" ? (
            <div className="fd-overlay-msg"><div><p>{data.message}</p><button className="fd-linkbtn mt-3" onClick={(e) => { e.stopPropagation(); setAttempt((a) => a + 1); }}>Try again</button></div></div>
          ) : <Skeleton text={near ? "Loading price data…" : ""} />
        ) : card.videoUrl ? (
          <FeedVideoPlayer
            src={card.videoUrl}
            poster={shot ?? null}
            active={active}
            near={near}
            label={`Video for ${title}`}
            aspect="16:9"
          />
        ) : card.hasImage ? (
          shot ? <img src={shot} alt={`Chart screenshot for ${title}`} draggable={false} />
          : shot === null ? <div className="fd-overlay-msg"><p>This screenshot couldn’t be loaded.</p></div> : <Skeleton text="" />
        ) : (
          <div className="fd-overlay-msg" style={{ background: "transparent", position: "static", padding: "2rem 1rem" }}>
            <div>
              <p className={cn("fd-big fd-num", entry.pnl >= 0 ? "fd-up" : "fd-down")}>{money(entry.pnl)}</p>
              {typeof entry.rr === "number" && <p className="mt-1">{sign(entry.rr)}{Math.abs(entry.rr).toFixed(1)}R</p>}
            </div>
          </div>
        )}

        {/* Top-left floating live status & P&L pill */}
        {liveBadge}

        {/* Top-left Replay / Screenshot toggle (auto-hidden while playing unless hovered/paused) */}
        {both && (
          <div className="fd-mode-pill" onClick={(e) => e.stopPropagation()}>
            <div className="fd-seg" role="tablist" aria-label="View">
              {(["replay", "chart"] as const).map((m) => (
                <button key={m} role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setPlaying(false); }}>{m === "replay" ? "Replay" : "Screenshot"}</button>
              ))}
            </div>
          </div>
        )}

        {/* Corner Apple-style speaker/mute icon */}
        {isReplayView && (
          <button
            type="button"
            className="fd-mute-btn"
            aria-pressed={prefs.music.enabled}
            aria-label={prefs.music.enabled ? "Music during replays: on. Turn off" : "Music during replays: off. Turn on"}
            onClick={(e) => {
              e.stopPropagation();
              setPrefs({ music: { enabled: !prefs.music.enabled } });
              if (prefs.haptics) haptic.selection();
            }}
          >
            <SpeakerIcon muted={!prefs.music.enabled} />
          </button>
        )}

        {/* Hidden Reels/Shorts transport controls: hidden during playback, revealed on pause, hover, or focus */}
        {isReplayView && (
          <div className="fd-hidden-dock" onClick={(e) => e.stopPropagation()}>
            <div className="fd-ctl" role="group" aria-label="Replay controls">
              <button className="fd-small" onClick={() => { if (model) { setIdx(model.startIdx); userPausedRef.current = true; setPlaying(false); reported.current = false; } }} disabled={!model} aria-label="Restart replay"><RestartIcon /></button>
              <button className="fd-small" onClick={() => { if (model) { userPausedRef.current = true; setPlaying(false); setIdx((i) => stepIdx(model, i, -1)); } }} disabled={!model} aria-label="Back one bar"><StepIcon dir={-1} /></button>
              <button className="fd-play" onClick={() => togglePlay(false)} disabled={!model} aria-label={playing ? "Pause replay" : "Play replay"}>{playing ? <PauseIcon /> : <PlayIcon />}</button>
              <button className="fd-small" onClick={() => { if (model) { userPausedRef.current = true; setPlaying(false); setIdx((i) => stepIdx(model, i, 1)); } }} disabled={!model} aria-label="Forward one bar"><StepIcon /></button>
              <button className="fd-small" onClick={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length])} aria-label={`Speed ${speed}×. Change speed`}>{speed}×</button>
            </div>
            <div className="fd-scrub">
              <div className="fd-edge-bar" aria-hidden="true"><i style={{ width: `${progressPct}%` }} /></div>
              <input
                className="fd-range"
                type="range"
                min={0}
                max={1000}
                value={model ? Math.round(progressOf(model, idx) * 1000) : 0}
                disabled={!model}
                onChange={(e) => {
                  if (model) {
                    userPausedRef.current = true;
                    setPlaying(false);
                    setIdx(idxFromProgress(model, Number(e.target.value) / 1000));
                  }
                }}
                aria-label="Replay position"
                aria-valuetext={frame ? `${frame.phase === "setup" ? "Before entry" : frame.phase === "open" ? "In trade" : "Closed"}` : "Not loaded"}
              />
            </div>
          </div>
        )}
      </div>

      <div className="fd-info">
        <div className="fd-info-row">
          <div className="min-w-0 flex-1">
            <h3 className="fd-title">{title}</h3>
            <p className="fd-sub fd-num">
              <span className={entry.pnl >= 0 ? "fd-up" : "fd-down"}>{money(entry.pnl)}</span>
              {entry.setup ? ` · ${entry.setup}` : ""} · {date}{times ? ` · ${times}` : ""}
            </p>
            {entry.notes && <p className="fd-sub fd-clamp2">{entry.notes}</p>}
          </div>
          {card.replayable && (
            <button className="fd-linkbtn is-primary shrink-0" onClick={() => void start()} disabled={busy}>{busy ? "Opening…" : "Open full replay"}<ArrowUpRightIcon /></button>
          )}
        </div>
      </div>
    </Frame>
  );
}

/* -------------------------------- setup -------------------------------- */

export function SetupReel(props: ReelProps<SetupCard>) {
  const { setup, stats } = props.card;
  const rules = (setup.rules ?? []).slice(0, 4);
  return (
    <Frame
      props={props}
      kind="Setup"
      shape="card"
      label={`Setup: ${setup.name}`}
      rail={<Rail {...props} href="/lab#setups" openLabel="Playbook" />}
    >
      <div className="fd-hero" data-tone="gold" data-layout="spread">
        {rules.length > 0 ? (
          <div><p className="fd-label" style={{ marginBottom: "0.625rem" }}>Your rules</p><ul className="fd-rules">{rules.map((r) => <li key={r.id}>{r.text}</li>)}</ul></div>
        ) : (
          <p className="fd-quote">No rules written for this setup yet. Add them in the Trading Lab and they’ll show up here.</p>
        )}
        <div className="fd-stats" aria-label="Setup statistics">
          <div className="fd-stat"><b className="fd-num">{stats.trades}</b><span>trades</span></div>
          <div className="fd-stat"><b className="fd-num">{stats.winRate === null ? "—" : `${Math.round(stats.winRate * 100)}%`}</b><span>win rate</span></div>
          <div className="fd-stat"><b className="fd-num">{stats.avgR === null ? "—" : `${stats.avgR >= 0 ? "+" : "−"}${Math.abs(stats.avgR).toFixed(2)}R`}</b><span>avg R</span></div>
        </div>
      </div>
      <div className="fd-info">
        <h3 className="fd-title">{setup.name}</h3>
        {(setup.purpose || setup.strategy) && <p className="fd-sub fd-clamp2">{setup.purpose || setup.strategy}</p>}
        {setup.minRR ? <p className="fd-sub">Minimum {setup.minRR}R{setup.invalidation ? ` · Invalid if: ${setup.invalidation}` : ""}</p> : null}
      </div>
    </Frame>
  );
}

/* -------------------------------- lesson -------------------------------- */

export function LessonReel(props: ReelProps<LessonCard>) {
  const { lesson, community, videoUrl } = props.card;
  const lessonOpened = useFeed((s) => s.lessonOpened);
  const [liked, setLiked] = useState(lesson.likedByMe);
  const [likes, setLikes] = useState(lesson.likes);
  const [broken, setBroken] = useState(false);
  const busy = useRef(false);
  useEffect(() => { setLiked(lesson.likedByMe); setLikes(lesson.likes); }, [lesson.likedByMe, lesson.likes]);

  const like = async () => {
    if (busy.current) return;
    busy.current = true;
    const next = !liked;
    setLiked(next); setLikes((n) => n + (next ? 1 : -1));
    const ok = await lessonsPost({ action: "like", id: lesson.id });
    if (!ok) { setLiked(!next); setLikes((n) => n + (next ? -1 : 1)); } else invalidateLessonIndex();
    busy.current = false;
  };

  const hasCover = Boolean(lesson.cover) && !broken;
  const pull = lesson.hook || lesson.excerpt;
  const summaryText = pull && pull !== lesson.subtitle ? pull : lesson.excerpt || lesson.subtitle;

  return (
    <Frame
      props={props}
      kind={community ? "Community" : "Lesson"}
      shape="editorial"
      label={`Lesson: ${lesson.title}`}
      split={false}
      rail={<Rail {...props} href={`/lessons/${lesson.id}`} openLabel="Read" onOpen={() => lessonOpened(props.card.key)} />}
    >
      <div className="fd-lesson-split">
        {/* Left: 16:9 landscape thumbnail or inline video */}
        <div className="fd-lesson-thumb" data-empty={!hasCover && !videoUrl ? "true" : undefined}>
          {videoUrl ? (
            <FeedVideoPlayer
              src={videoUrl}
              poster={hasCover ? lesson.cover : null}
              active={props.active}
              near={props.near}
              label={`Video for ${lesson.title}`}
              aspect="16:9"
            />
          ) : hasCover ? (
            <Link
              href={`/lessons/${lesson.id}`}
              onClick={() => lessonOpened(props.card.key)}
              className="block h-full w-full"
              tabIndex={-1}
              aria-hidden="true"
            >
              {props.near && (
                <img
                  className="fd-lesson-img"
                  src={lesson.cover ?? undefined}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  onError={() => setBroken(true)}
                />
              )}
            </Link>
          ) : (
            <div className="fd-lesson-poster" aria-hidden="true">
              <div className="fd-lesson-poster-top">
                <span className="fd-lesson-poster-icon"><BookOpenIcon /></span>
                <span className="fd-lesson-badge" style={{ position: "static" }}>{lesson.readMins} min read</span>
              </div>
              <p className="fd-lesson-poster-quote">{(pull || lesson.subtitle || lesson.title).slice(0, 90)}</p>
              <p className="fd-lesson-poster-kicker">{community ? `By ${lesson.author.name}` : "Playbook Lesson"}</p>
            </div>
          )}
        </div>

        {/* Right: concise scannable summary + clear primary action */}
        <div className="fd-lesson-summary">
          <p className="fd-lesson-meta">
            <span>{community ? lesson.author.name : "You"}</span>
            <span aria-hidden="true">·</span>
            <span>{lesson.readMins} min read</span>
          </p>
          <h3 className="fd-title fd-lesson-title">{lesson.title}</h3>
          {lesson.subtitle && <p className="fd-lesson-subtitle">{lesson.subtitle}</p>}
          {summaryText && summaryText !== lesson.subtitle && (
            <p className="fd-lesson-excerpt">{summaryText}</p>
          )}
          <div className="fd-row fd-lesson-actions">
            <Link href={`/lessons/${lesson.id}`} onClick={() => lessonOpened(props.card.key)} className="fd-linkbtn is-primary">
              Read lesson<ArrowUpRightIcon />
            </Link>
            <button type="button" className="fd-linkbtn" onClick={() => void like()} aria-pressed={liked} aria-label={liked ? "Unlike lesson" : "Like lesson"}>
              <HeartIcon filled={liked} />{likes > 0 ? likes : "Like"}
            </button>
          </div>
        </div>
      </div>
    </Frame>
  );
}

/* -------------------------------- starter -------------------------------- */

const STARTERS = {
  "first-trade": { title: "Log your first trade", body: "Cards here are built from your own journal. Add a trade with entry and exit times and it becomes a replay you can scrub through.", cta: "Add a trade" },
  "first-setup": { title: "Define a setup", body: "Write down the rules of one setup you trade. It appears here with your own win rate once trades are linked to it.", cta: "Open the Lab" },
  "first-lesson": { title: "Write a lesson", body: "Capture something you learned in a few lines. Your lessons — and your friends’ — show up in this feed.", cta: "Write a lesson" },
} as const;

export function StarterReel(props: ReelProps<StarterCard>) {
  const s = STARTERS[props.card.id];
  const openNew = useUi((u) => u.openNewEntry);
  return (
    <Frame props={props} kind="Get started" shape="card" label={s.title} rail={null}>
      <div className="fd-hero" data-tone="gold">
        <h3 className="fd-big">{s.title}</h3>
        <p className="fd-quote">{s.body}</p>
      </div>
      <div className="fd-info" style={{ paddingRight: 0 }}>
        {props.card.id === "first-trade" ? <button className="fd-linkbtn is-primary" onClick={openNew}>{s.cta}</button>
          : <Link className="fd-linkbtn is-primary" href={props.card.id === "first-setup" ? "/lab#setups" : "/lessons/new"}>{s.cta}</Link>}
      </div>
    </Frame>
  );
}

/* ---------------------------------- end ---------------------------------- */

export function EndReel({ card, index, total, active, onSaved, savedCount, minutes, today }: { card: EndCard; index: number; total: number; active: boolean; onSaved: () => void; savedCount: number; minutes: number; today: number }) {
  return (
    <article className="fd-card" data-i={index} data-key={card.key} data-kind="end" data-shape="card" data-active={active || undefined} role="article" aria-posinset={index + 1} aria-setsize={total} aria-label="You're all caught up">
      <div className="fd-stage" data-shape="card">
        <div className="fd-inner" data-shape="card">
          <div className="fd-card-head">
            <p className="fd-chip"><span>That’s everything for now</span></p>
          </div>
          <div className="fd-hero" data-tone="gold">
            <h3 className="fd-big">You’re all caught up.</h3>
            <p className="fd-quote">
              {today > 0 ? `You looked at ${today} card${today === 1 ? "" : "s"} today` : "Nothing new today"}{minutes > 0 ? ` over ${minutes} min` : ""}. This feed ends on purpose — new cards are ranked fresh tomorrow, so there’s nothing to keep refreshing for.
            </p>
          </div>
          <div className="fd-row">
            <Link href="/dashboard" className="fd-linkbtn is-primary">Back to Home</Link>
            {savedCount > 0 && <button className="fd-linkbtn" onClick={onSaved}>Review {savedCount} saved</button>}
            <Link href="/journal" className="fd-linkbtn">Open Journal</Link>
          </div>
        </div>
      </div>
    </article>
  );
}
