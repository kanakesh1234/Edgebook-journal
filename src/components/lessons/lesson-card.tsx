"use client";

import { useState } from "react";
import Link from "next/link";
import { LessonsIcon } from "./lessons-icon";
import { BookmarkIcon, CheckIcon, CommentIcon, HeartIcon } from "./lesson-icons";
import { statusOf, type ReadEntry } from "./progress";
import { byline, fmtShort } from "./format";
import type { LessonAction, LessonView } from "./types";

interface Props {
  l: LessonView;
  entry?: ReadEntry;
  selecting: boolean;
  picked: boolean;
  onPick: (id: string) => void;
  onAct: (id: string, action: LessonAction) => void;
}

/**
 * One lesson in the library.
 * Reading comes first: cover, title, a short dek. Engagement is reduced to a like, a quiet
 * comment count and a bookmark. Repost and discussion live on the lesson page.
 * The whole card is one stretched link (title), so it is a real, focusable anchor.
 */
export function LessonCard({ l, entry, selecting, picked, onPick, onAct }: Props) {
  const status = statusOf(entry);
  const pct = Math.round((entry?.p ?? 0) * 100);
  const dek = l.hook || l.subtitle || l.excerpt;
  const selectable = selecting && l.mine;
  const [loaded, setLoaded] = useState(false);
  const [broken, setBroken] = useState(false);
  const hasCover = Boolean(l.cover) && !broken;

  return (
    <article
      className="lc"
      data-picked={picked ? "true" : undefined}
      data-dim={selecting && !l.mine ? "true" : undefined}
    >
      {/* Media is always rendered, so every card keeps the same silhouette. */}
      <div className="lc-media" data-empty={hasCover ? undefined : "true"}>
        {hasCover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={(el) => {
              if (el?.complete && el.naturalWidth > 0) setLoaded(true);
            }}
            src={l.cover ?? undefined}
            alt=""
            data-ready={loaded ? "true" : undefined}
            loading="lazy"
            decoding="async"
            draggable={false}
            onLoad={() => setLoaded(true)}
            onError={() => setBroken(true)}
          />
        ) : (
          <LessonsIcon className="h-8 w-8 opacity-70" />
        )}
      </div>

      <div className="lc-body">
        {l.repostedBy.length > 0 && <p className="lc-kicker">{l.repostedBy.join(", ")} reposted</p>}

        <p className="lc-meta">
          {selectable && (
            <span className="lc-check" data-on={picked ? "true" : undefined} aria-hidden="true">
              {picked && <CheckIcon className="h-3 w-3" />}
            </span>
          )}
          <span className="lc-author">{byline(l)}</span>
          <span aria-hidden="true">·</span>
          <span>{fmtShort(l.createdAt)}</span>
          <span aria-hidden="true">·</span>
          <span>{l.readMins} min</span>
          {status === "read" && (
            <span className="lc-state">
              <CheckIcon className="h-3 w-3" />
              Read
            </span>
          )}
          {status === "reading" && (
            <span className="lc-state" data-reading="true">
              {pct}%
            </span>
          )}
        </p>

        <h3 className="lc-title">
          {selectable ? (
            <button type="button" className="lc-hit" aria-pressed={picked} onClick={() => onPick(l.id)}>
              {l.title}
            </button>
          ) : selecting ? (
            <span>{l.title}</span>
          ) : (
            <Link href={`/lessons/${l.id}`} className="lc-hit">
              {l.title}
            </Link>
          )}
        </h3>

        <p className="lc-dek">{dek}</p>

        {!selecting && (
          <div className="lc-foot">
            <button
              type="button"
              className="lc-act"
              data-on={l.likedByMe ? "true" : undefined}
              aria-pressed={l.likedByMe}
              aria-label={l.likedByMe ? "Remove like" : "Like"}
              onClick={() => onAct(l.id, "like")}
            >
              <HeartIcon filled={l.likedByMe} className="h-[17px] w-[17px]" />
              {l.likes > 0 && <span>{l.likes}</span>}
            </button>

            {l.settings.comments && l.comments.length > 0 && (
              <span className="lc-stat" aria-label={`${l.comments.length} comment${l.comments.length === 1 ? "" : "s"}`}>
                <CommentIcon className="h-[16px] w-[16px]" />
                <span>{l.comments.length}</span>
              </span>
            )}

            <button
              type="button"
              className="lc-act ml-auto"
              data-on={l.savedByMe ? "true" : undefined}
              aria-pressed={l.savedByMe}
              aria-label={l.savedByMe ? "Remove from saved" : "Save for later"}
              title={l.savedByMe ? "Saved" : "Save for later"}
              onClick={() => onAct(l.id, "save")}
            >
              <BookmarkIcon filled={l.savedByMe} className="h-[17px] w-[17px]" />
            </button>
          </div>
        )}
      </div>

      {status === "reading" && (
        <div className="lc-bar" role="progressbar" aria-label="Reading progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
          <i style={{ width: `${pct}%` }} />
        </div>
      )}
    </article>
  );
}

/** Placeholder with the exact silhouette of a card, shown while the library loads. */
export function LessonCardSkeleton() {
  return (
    <div className="lc lc-skel animate-pulse-soft" aria-hidden="true">
      <div className="lc-media" />
      <div className="lc-body">
        <div className="h-3 w-2/5 rounded bg-ink/[0.07]" />
        <div className="mt-3.5 h-5 w-11/12 rounded bg-ink/[0.08]" />
        <div className="mt-2 h-5 w-3/5 rounded bg-ink/[0.08]" />
        <div className="mt-4 h-3.5 w-full rounded bg-ink/[0.05]" />
        <div className="mt-2 h-3.5 w-4/5 rounded bg-ink/[0.05]" />
      </div>
    </div>
  );
}
