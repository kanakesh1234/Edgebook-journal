"use client";

import { lazy, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import type { EndCard, FeedCard, LessonCard, SetupCard, StarterCard, TradeCard } from "@/lib/feed/types";
import { useFeed } from "./feed-store";
import { useReplayData } from "./replay-chart";

const ReplayChart = lazy(() => import("./replay-canvas").then((m) => ({ default: m.ReplayChart })));
import { ArrowUpRightIcon, BookmarkPlusIcon, HeartIcon, PauseIcon, MusicIcon, PlayIcon, RestartIcon, StepIcon } from "./feed-icons";

export interface ReelProps<T extends FeedCard = FeedCard> {
  card: T;
  index: number;
  total: number;
  /** The card filling the screen. */
  active: boolean;
  /** The active card and its neighbours — the only ones allowed to fetch. */
  near: boolean;
  fav: boolean;
  collected: boolean;
  onFav: () => void;
  onCollect: () => void;
}

/* ----------------------------- shared frame ----------------------------- */

function Rail({ fav, collected, onFav, onCollect, href, openLabel, onOpen }: Pick<ReelProps, "fav" | "collected" | "onFav" | "onCollect"> & { href?: string; openLabel?: string; onOpen?: () => void }) {
  const haptics = useFeed((s) => s.state.prefs.haptics);
  const [pop, setPop] = useState(false);
  return (
    <div className="fd-rail" role="group" aria-label="Card actions">
      <button type="button" className="fd-act" data-heart="true" aria-pressed={fav} aria-label={fav ? "Remove from favorites" : "Add to favorites"}
        onClick={() => { onFav(); if (haptics) haptic.selection(); setPop(true); window.setTimeout(() => setPop(false), 400); }}>
        <span className={cn(pop && fav && "fd-pop")}><HeartIcon filled={fav} /></span>
        <span>{fav ? "Saved" : "Favorite"}</span>
      </button>
      <button type="button" className="fd-act" aria-pressed={collected} aria-label="Add to a collection" onClick={() => { onCollect(); if (haptics) haptic.selection(); }}>
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

function Frame({ props, rail, kind, children, label }: { props: ReelProps; rail: ReactNode; kind: string; children: ReactNode; label: string }) {
  return (
    <article className="fd-card" data-i={props.index} data-key={props.card.key} data-active={props.active || undefined} role="article" aria-posinset={props.index + 1} aria-setsize={props.total} aria-label={label}>
      <div className="fd-inner" data-split={kind === "Replay" || kind === "Chart" ? "" : undefined}>
        <div className="fd-row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
          <p className="fd-chip" title="Why you're seeing this"><span>{props.card.reason}</span></p>
          <p className="fd-kind">{kind}</p>
        </div>
        {children}
      </div>
      {rail}
    </article>
  );
}

const Skeleton = ({ text }: { text: string }) => (
  <div className="fd-skel absolute inset-0 grid place-items-center text-[13px]" style={{ color: "var(--faint)" }} role="status"><span>{text}</span></div>
);

/* -------------------------------- trade -------------------------------- */

export function TradeReel(props: ReelProps<TradeCard>) {
  const { card, active, near } = props;
  const { entry } = card;
  const currency = useApp((s) => s.settings.currency);
  const money = (n: number) => formatSignedMoney(n, currency);
  const prefs = useFeed((s) => s.state.prefs);
  const reduce = useReducedMotion();
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
  const played = useRef(false);
  const reported = useRef(false);

  useEffect(() => { if (model) { setIdx(model.startIdx); setPlaying(false); played.current = false; reported.current = false; } }, [model]);

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

  // leaving the card pauses it; music follows the active card's playback
  useEffect(() => { if (!active) setPlaying(false); }, [active]);
  useEffect(() => {
    if (!active) return;
    setReplayPlaying(playing);
    return () => setReplayPlaying(false);
  }, [active, playing, setReplayPlaying]);

  // optional autoplay: off unless the viewer turned it on, and never with reduced motion
  useEffect(() => {
    if (!active || !model || !prefs.autoplayReplay || reduce || played.current) return;
    const t = window.setTimeout(() => { played.current = true; setPlaying(true); }, 700);
    return () => window.clearTimeout(t);
  }, [active, model, prefs.autoplayReplay, reduce]);

  const frame = model ? frameAt(model, idx) : null;
  const togglePlay = () => {
    if (!model) return;
    if (idx >= endIdx(model)) { setIdx(model.startIdx); reported.current = false; }
    played.current = true;
    setPlaying((p) => !p);
    if (prefs.haptics) haptic.selection();
  };

  const toggleRef = useRef(togglePlay);
  toggleRef.current = togglePlay;
  useEffect(() => {
    if (!active) return;
    const h = () => toggleRef.current();
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

  let live: ReactNode = null;
  if (mode === "replay" && frame) {
    const r = frame.openR, pts = frame.openPts;
    const val = frame.done
      ? <strong className={cn("fd-num", entry.pnl >= 0 ? "fd-up" : "fd-down")}>{money(entry.pnl)}{typeof entry.rr === "number" ? ` · ${sign(entry.rr)}${Math.abs(entry.rr).toFixed(1)}R` : ""}</strong>
      : r != null ? <strong className={cn("fd-num", r >= 0 ? "fd-up" : "fd-down")}>{sign(r)}{Math.abs(r).toFixed(2)}R</strong>
      : pts != null ? <strong className={cn("fd-num", pts >= 0 ? "fd-up" : "fd-down")}>{sign(pts)}{Math.abs(pts).toFixed(2)} pts</strong>
      : null;
    live = <div className="fd-live" aria-live="off"><small>{frame.phase === "setup" ? "Entry coming up — press play" : frame.phase === "open" ? `In the trade · ${long ? "long" : "short"}` : model?.exitEstimated ? "End of window (no exit recorded)" : "Closed"}</small>{val}</div>;
  }

  return (
    <Frame props={props} kind={card.replayable ? "Replay" : card.hasImage ? "Chart" : "Trade"} label={label}
      rail={<Rail {...props} href={`/journal?trade=${encodeURIComponent(entry.id)}`} openLabel="Trade" />}>
      {card.replayable && (
        <div className="fd-row" style={{ justifyContent: "space-between", flexWrap: "nowrap", paddingRight: "3.5rem" }}>
          {both ? (
            <div className="fd-seg" role="tablist" aria-label="View">
              {(["replay", "chart"] as const).map((m) => (
                <button key={m} role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setPlaying(false); }}>{m === "replay" ? "Replay" : "Screenshot"}</button>
              ))}
            </div>
          ) : <span />}
          {mode === "replay" && (
            <button className="fd-iconbtn" style={{ width: "2.5rem", height: "2.5rem" }} aria-pressed={prefs.music.enabled}
              aria-label={prefs.music.enabled ? "Music during replays: on. Turn off" : "Music during replays: off. Turn on"}
              onClick={() => setPrefs({ music: { enabled: !prefs.music.enabled } })}><MusicIcon off={!prefs.music.enabled} /></button>
          )}
        </div>
      )}

      <div className="fd-media">
        {mode === "replay" && card.replayable ? (
          data.status === "ready" && model ? <Suspense fallback={<Skeleton text="Loading chart…" />}><ReplayChart model={model} idx={idx} label={`${title} replay chart`} /></Suspense>
          : data.status === "error" ? (
            <div className="fd-overlay-msg"><div><p>{data.message}</p><button className="fd-linkbtn mt-3" onClick={() => setAttempt((a) => a + 1)}>Try again</button></div></div>
          ) : <Skeleton text={near ? "Loading price data…" : ""} />
        ) : card.hasImage ? (
          shot ? <img src={shot} alt={`Chart screenshot for ${title}`} draggable={false} />
          : shot === null ? <div className="fd-overlay-msg"><p>This screenshot couldn’t be loaded.</p></div> : <Skeleton text="" />
        ) : (
          <div className="fd-overlay-msg" style={{ background: "transparent" }}>
            <div>
              <p className={cn("fd-big fd-num", entry.pnl >= 0 ? "fd-up" : "fd-down")}>{money(entry.pnl)}</p>
              {typeof entry.rr === "number" && <p className="mt-1">{sign(entry.rr)}{Math.abs(entry.rr).toFixed(1)}R</p>}
            </div>
          </div>
        )}
      </div>

      {live}

      {mode === "replay" && card.replayable && (
        <>
          <div className="fd-scrub">
            <input className="fd-range" type="range" min={0} max={1000} value={model ? Math.round(progressOf(model, idx) * 1000) : 0} disabled={!model}
              onChange={(e) => { if (model) { setPlaying(false); setIdx(idxFromProgress(model, Number(e.target.value) / 1000)); } }}
              aria-label="Replay position" aria-valuetext={frame ? `${frame.phase === "setup" ? "Before entry" : frame.phase === "open" ? "In trade" : "Closed"}` : "Not loaded"} />
          </div>
          <div className="fd-ctl" role="group" aria-label="Replay controls">
            <button className="fd-small" onClick={() => { if (model) { setIdx(model.startIdx); setPlaying(false); reported.current = false; } }} disabled={!model} aria-label="Restart replay"><RestartIcon /></button>
            <button className="fd-small" onClick={() => model && setIdx((i) => stepIdx(model, i, -1))} disabled={!model} aria-label="Back one bar"><StepIcon dir={-1} /></button>
            <button className="fd-play" onClick={togglePlay} disabled={!model} aria-label={playing ? "Pause replay" : "Play replay"}>{playing ? <PauseIcon /> : <PlayIcon />}</button>
            <button className="fd-small" onClick={() => model && setIdx((i) => stepIdx(model, i, 1))} disabled={!model} aria-label="Forward one bar"><StepIcon /></button>
            <button className="fd-small" onClick={() => setSpeed((s) => SPEEDS[(SPEEDS.indexOf(s) + 1) % SPEEDS.length])} aria-label={`Speed ${speed}×. Change speed`}>{speed}×</button>
          </div>
        </>
      )}

      <div className="fd-info">
        <h3 className="fd-title">{title}</h3>
        <p className="fd-sub fd-num">
          <span className={entry.pnl >= 0 ? "fd-up" : "fd-down"}>{money(entry.pnl)}</span>
          {entry.setup ? ` · ${entry.setup}` : ""} · {date}{times ? ` · ${times}` : ""}
        </p>
        {entry.notes && <p className="fd-sub fd-clamp2">{entry.notes}</p>}
        {card.replayable && (
          <div className="fd-row mt-2">
            <button className="fd-linkbtn is-primary" onClick={() => void start()} disabled={busy}>{busy ? "Opening…" : "Open full replay"}<ArrowUpRightIcon /></button>
          </div>
        )}
      </div>
    </Frame>
  );
}

/* -------------------------------- setup -------------------------------- */

export function SetupReel(props: ReelProps<SetupCard>) {
  const { setup, stats } = props.card;
  const rules = (setup.rules ?? []).slice(0, 4);
  return (
    <Frame props={props} kind="Setup" label={`Setup: ${setup.name}`} rail={<Rail {...props} href="/lab#setups" openLabel="Playbook" />}>
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
  const { lesson, community } = props.card;
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

  return (
    <Frame props={props} kind={community ? "Community" : "Lesson"} label={`Lesson: ${lesson.title}`}
      rail={<Rail {...props} href={`/lessons/${lesson.id}`} openLabel="Read" onOpen={() => lessonOpened(props.card.key)} />}>
      {hasCover ? (
        <div className="fd-hero" data-cover>
          {props.near && <img className="fd-hero-img" src={lesson.cover ?? undefined} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setBroken(true)} />}
          <div className="fd-hero-scrim" />
        </div>
      ) : (
        <div className="fd-hero" data-tone="gold" data-layout="spread">
          <p className="fd-qmark" aria-hidden>“</p>
          <div style={{ display: "grid", gap: "0.75rem" }}>
            <p className="fd-pull fd-clamp2" style={{ WebkitLineClamp: 7 }}>{pull || lesson.title}</p>
            <p className="fd-pull-meta">{community ? lesson.author.name : "You"} · {lesson.readMins} min read</p>
          </div>
        </div>
      )}
      <div className="fd-info">
        <h3 className="fd-title">{lesson.title}</h3>
        {(lesson.subtitle || (hasCover && pull)) && <p className="fd-sub fd-clamp2">{lesson.subtitle || pull}</p>}
        <div className="fd-row" style={{ marginTop: "0.625rem" }}>
          <Link href={`/lessons/${lesson.id}`} onClick={() => lessonOpened(props.card.key)} className="fd-linkbtn is-primary">Read lesson<ArrowUpRightIcon /></Link>
          <button className="fd-linkbtn" onClick={() => void like()} aria-pressed={liked} aria-label={liked ? "Unlike lesson" : "Like lesson"}>
            <HeartIcon filled={liked} />{likes > 0 ? likes : "Like"}
          </button>
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
    <Frame props={props} kind="Get started" label={s.title} rail={null}>
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
    <article className="fd-card" data-i={index} data-key={card.key} data-active={active || undefined} role="article" aria-posinset={index + 1} aria-setsize={total} aria-label="You're all caught up">
      <div className="fd-inner">
        <div className="fd-row" style={{ justifyContent: "space-between", flexWrap: "nowrap" }}>
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
    </article>
  );
}
