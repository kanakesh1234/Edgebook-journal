"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { btn, btnPrimary } from "@/components/lessons/buttons";
import { lessonsPost } from "@/components/lessons/api";
import { ago, byline, fmtLong, initialOf, plural } from "@/components/lessons/format";
import {
  ArrowDownIcon,
  BookmarkIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  CommentIcon,
  HeartIcon,
  MoreIcon,
  PencilIcon,
  RepostIcon,
  ShareIcon,
  TrashIcon,
} from "@/components/lessons/lesson-icons";
import { LessonsIcon } from "@/components/lessons/lessons-icon";
import { Portal } from "@/components/lessons/portal";
import { readEntry, recordProgress, resetProgress, useReadProgress } from "@/components/lessons/progress";
import type { LessonAction, LessonView } from "@/components/lessons/types";
import { useApp } from "@/lib/store";
import { formatSignedMoney } from "@/lib/format";
import { dayShort, tradeTitle } from "@/components/journal/journal-model";
import { Sym } from "@/components/journal/symbols";
import { TradePicker } from "@/components/journal/lesson-links";
import { invalidateLessonIndex } from "@/components/lessons/use-lesson-index";
import { ConfirmDialog } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import "@/components/lessons/lessons.css";

export default function LessonPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [l, setL] = useState<LessonView | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [text, setText] = useState("");
  const [discussOpen, setDiscussOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dockOn, setDockOn] = useState(false);
  const [resume, setResume] = useState<number | null>(null);

  const entries = useReadProgress();
  const entry = entries[id];
  const proseRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const loadedId = l?.id;

  /* ------------------------------- Data ------------------------------- */

  const load = useCallback(() => {
    fetch(`/api/lessons?id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 404) return null;
        if (!r.ok) throw new Error(String(r.status));
        return ((await r.json()) as { lesson?: LessonView }).lesson ?? null;
      })
      .then((lesson) => {
        setL(lesson);
        setFailed(false);
      })
      .catch(() => {
        setFailed(true);
        setL((cur) => cur ?? null);
      });
  }, [id]);
  useEffect(load, [load]);

  useEffect(() => {
    if (!loadedId) return;
    const prev = document.title;
    if (l?.title) document.title = `${l.title} · Edgebook`;
    return () => {
      document.title = prev;
    };
  }, [loadedId, l?.title]);

  /** Optimistic like / repost / save, then re-sync. */
  const act = async (action: LessonAction) => {
    setL((cur) => {
      if (!cur) return cur;
      if (action === "like") return { ...cur, likedByMe: !cur.likedByMe, likes: cur.likes + (cur.likedByMe ? -1 : 1) };
      if (action === "repost") return { ...cur, repostedByMe: !cur.repostedByMe, reposts: cur.reposts + (cur.repostedByMe ? -1 : 1) };
      return { ...cur, savedByMe: !cur.savedByMe };
    });
    await lessonsPost({ action, id });
    load();
  };

  const sendComment = async () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    if (!(await lessonsPost({ action: "comment", id, body }))) setText(body);
    load();
  };

  const remove = async () => {
    setBusy(true);
    const ok = await lessonsPost({ action: "delete", ids: [id] });
    setBusy(false);
    if (ok) { invalidateLessonIndex(); router.push("/lessons"); }
    else setConfirmOpen(false);
  };

  const share = async () => {
    if (!l) return;
    const url = window.location.href;
    if (typeof navigator.share === "function" && window.matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title: l.title, url });
      } catch {
        /* cancelled */
      }
      return;
    }
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    } catch {
      toast.error("Couldn’t copy the link", "Copy it from the address bar instead.");
    }
  };

  /* ------------------------- Reading progress ------------------------- */

  // What was the reader's furthest point when they arrived? (Drives the "Resume" affordance.)
  useEffect(() => {
    if (!loadedId) return;
    const e = readEntry(loadedId);
    setResume(e && !e.done && e.p >= 0.06 && e.p < 0.95 ? e.p : null);
  }, [loadedId]);

  // Tracks scroll through the article body: drives the top bar, the dock, and the saved progress.
  useEffect(() => {
    const el = proseRef.current;
    if (!el || !loadedId) return;
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let interacted = false;
    let last = 0;

    const measure = () => {
      raf = 0;
      const r = el.getBoundingClientRect();
      if (r.height <= 0) return;
      // Fraction of the article that has passed the bottom edge of the screen.
      const p = Math.max(0, Math.min(1, (window.innerHeight - r.top) / r.height));
      last = p;
      if (barRef.current) barRef.current.style.transform = `scaleX(${p})`;
      setDockOn(window.scrollY > 160 || document.documentElement.scrollHeight - window.innerHeight < 240);
      if (window.scrollY > 160) setResume(null);
      // Don't count a lesson as read just because it opened before its images laid out.
      if (interacted) {
        clearTimeout(timer);
        timer = setTimeout(() => recordProgress(loadedId, p), 350);
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    const onUser = () => {
      interacted = true;
      schedule();
    };

    window.addEventListener("scroll", onUser, { passive: true });
    window.addEventListener("wheel", onUser, { passive: true });
    window.addEventListener("touchmove", onUser, { passive: true });
    window.addEventListener("resize", schedule);
    const ro = new ResizeObserver(schedule); // images and embeds finish loading
    ro.observe(el);
    // Short lessons that fit on one screen are read by being open for a moment.
    const dwell = setTimeout(onUser, 4000);
    measure();

    return () => {
      window.removeEventListener("scroll", onUser);
      window.removeEventListener("wheel", onUser);
      window.removeEventListener("touchmove", onUser);
      window.removeEventListener("resize", schedule);
      ro.disconnect();
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      clearTimeout(dwell);
      if (interacted) recordProgress(loadedId, last);
    };
  }, [loadedId]);

  const resumeReading = () => {
    const el = proseRef.current;
    if (!el || resume === null) return;
    const top = el.getBoundingClientRect().top + window.scrollY;
    const y = Math.max(0, top + resume * el.offsetHeight - window.innerHeight * 0.55);
    window.scrollTo({ top: y, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    setResume(null);
  };

  const openDiscussion = () => {
    setDiscussOpen(true);
    // Wait a beat so the panel has mounted, then scroll the heading to just under the top chrome.
    setTimeout(() => {
      const el = document.getElementById("discussion");
      if (!el) return;
      const offset = window.matchMedia("(min-width: 1024px)").matches ? 24 : 72;
      const y = el.getBoundingClientRect().top + window.scrollY - offset;
      window.scrollTo({ top: y, behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    }, 80);
  };

  /* ------------------------------- States ------------------------------- */

  if (l === undefined) return <ReaderSkeleton />;

  if (l === null) {
    return (
      <div className="mx-auto w-full max-w-[680px]">
        <EmptyState
          className="mt-6 py-14"
          icon={<LessonsIcon className="h-7 w-7" />}
          title={failed ? "Couldn’t load this lesson" : "This lesson isn’t available"}
          body={failed ? "Check your connection and try again." : "It may have been deleted, or it isn’t shared with you."}
          action={
            <>
              {failed && (
                <button
                  type="button"
                  className={btn}
                  onClick={() => {
                    setL(undefined);
                    setFailed(false);
                    load();
                  }}
                >
                  Try again
                </button>
              )}
              <Link href="/lessons" className={failed ? btn : btnPrimary}>
                Back to Lessons
              </Link>
            </>
          }
        />
      </div>
    );
  }

  const author = byline(l);
  const hasMenu = l.mine || !!entry;

  return (
    <div className="lesson-reader mx-auto w-full max-w-[680px] pb-40 sm:pb-32">
      {/* Reading progress, pinned to the top edge of the content (below the mobile header) */}
      <Portal>
        <div className="lesson-topbar" aria-hidden="true">
          <div ref={barRef} className="lesson-topbar-fill" style={{ transform: "scaleX(0)" }} />
        </div>
      </Portal>

      {/* Top row: back + overflow */}
      <div className="flex items-center justify-between">
        <Link href="/lessons" className="-ml-2 inline-flex h-10 items-center gap-0.5 rounded-full pl-1.5 pr-3 text-[14px] font-medium text-muted transition-colors hover:text-ink">
          <ChevronLeftIcon className="h-[18px] w-[18px]" />
          Lessons
        </Link>

        {hasMenu && (
          <div className="relative">
            <button
              type="button"
              aria-label="More actions"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
              className="-mr-2 grid h-10 w-10 place-items-center rounded-full text-muted transition-colors hover:bg-ink/[0.05] hover:text-ink"
            >
              <MoreIcon className="h-5 w-5" />
            </button>
            <AnimatePresence>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} aria-hidden="true" />
                  <motion.div
                    role="menu"
                    className="lesson-menu"
                    initial={{ opacity: 0, y: -4, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -4, scale: 0.98 }}
                    transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                    onKeyDown={(e) => e.key === "Escape" && setMenuOpen(false)}
                  >
                    {l.mine && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setMenuOpen(false);
                          router.push(`/lessons/${id}/edit`);
                        }}
                      >
                        <PencilIcon className="h-4 w-4" />
                        Edit lesson
                      </button>
                    )}
                    {entry && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          resetProgress(id);
                          setMenuOpen(false);
                          toast.success("Marked as unread");
                        }}
                      >
                        Mark as unread
                      </button>
                    )}
                    {l.mine && (
                      <button
                        type="button"
                        role="menuitem"
                        data-danger="true"
                        onClick={() => {
                          setMenuOpen(false);
                          setConfirmOpen(true);
                        }}
                      >
                        <TrashIcon className="h-4 w-4" />
                        Delete lesson
                      </button>
                    )}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Title block */}
      <header className="mt-6 sm:mt-10">
        <h1 className="text-balance text-[30px] font-semibold leading-[1.1] tracking-[-0.028em] text-ink sm:text-[38px] lg:text-[44px]">{l.title}</h1>
        {l.subtitle && <p className="mt-4 text-pretty text-[18px] leading-[1.5] text-muted sm:text-[20px]">{l.subtitle}</p>}

        <div className="mt-7 flex items-center gap-3">
          <span className="lesson-avatar" aria-hidden="true">
            {initialOf(author)}
          </span>
          <div className="min-w-0 text-[13px] leading-5">
            <p className="truncate font-semibold text-ink">{author}</p>
            <p className="truncate text-faint">
              @{l.author.handle} · {fmtLong(l.createdAt)} · {l.readMins} min read
            </p>
          </div>
        </div>

        <AnimatePresence>
          {resume !== null && (
            <motion.button
              type="button"
              onClick={resumeReading}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="lesson-resume mt-6"
            >
              <ArrowDownIcon className="h-4 w-4" />
              Resume where you left off
              <span className="tabular text-faint">{Math.round(resume * 100)}%</span>
            </motion.button>
          )}
        </AnimatePresence>
      </header>

      {/* Custom cover (only when the author picked one; otherwise the lesson opens as before) */}
      {l.customCover && (
        <figure className="lesson-cover mt-8 sm:mt-10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={l.customCover} alt="" decoding="async" />
        </figure>
      )}

      {/* Body */}
      <div ref={proseRef} className="lesson-prose mt-9 sm:mt-11" dangerouslySetInnerHTML={{ __html: l.html }} />

      <div className="mt-14 flex items-center gap-4 text-[12px] font-medium uppercase tracking-[0.1em] text-faint" aria-hidden="true">
        <span className="h-px flex-1 bg-line" />
        End of lesson
        <span className="h-px flex-1 bg-line" />
      </div>

      {/* Trades this lesson is linked to (the other half of the Journal link) */}
      <LinkedTrades lessonId={l.id} title={l.title} />

      {/* Discussion — collapsed until asked for */}
      {l.settings.comments && (
        <section id="discussion" className="mt-8 scroll-mt-24">
          <button
            type="button"
            aria-expanded={discussOpen}
            aria-controls="discussion-panel"
            onClick={() => setDiscussOpen((o) => !o)}
            className="flex min-h-12 w-full items-center justify-between rounded-control px-1 text-left"
          >
            <span className="text-[17px] font-semibold tracking-[-0.015em] text-ink">
              {l.comments.length ? `Discussion` : "Start the discussion"}
              {l.comments.length > 0 && <span className="ml-2 text-[14px] font-medium tabular text-faint">{l.comments.length}</span>}
            </span>
            <ChevronDownIcon className={cn("h-5 w-5 text-faint transition-transform duration-300", discussOpen && "rotate-180")} />
          </button>

          <AnimatePresence initial={false}>
            {discussOpen && (
              <motion.div
                id="discussion-panel"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className="pt-3">
                  {l.comments.length > 0 && (
                    <ul className="space-y-5">
                      {l.comments.map((c) => (
                        <li key={c.id} className="flex gap-3">
                          <span className="lesson-avatar lesson-avatar-sm" aria-hidden="true">
                            {initialOf(c.by)}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] leading-5">
                              <span className="font-semibold text-ink">{c.by}</span>
                              <span className="ml-2 text-faint">{ago(c.at)}</span>
                            </p>
                            <p className="mt-0.5 whitespace-pre-wrap break-words text-[15px] leading-[1.6] text-ink">{c.body}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className={cn(l.comments.length > 0 && "mt-6")}>
                    <label htmlFor="comment-box" className="sr-only">
                      Add a comment
                    </label>
                    <textarea
                      id="comment-box"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          e.preventDefault();
                          void sendComment();
                        }
                      }}
                      maxLength={1000}
                      rows={3}
                      placeholder="Add to the discussion"
                      className="min-h-[88px] w-full resize-y rounded-control border border-line bg-raised px-3.5 py-3 text-base leading-relaxed text-ink transition-[border-color,box-shadow] duration-200 placeholder:text-faint hover:border-line-strong focus:border-gold/60 focus:outline-none focus:ring-4 focus:ring-gold/10 sm:text-[15px]"
                    />
                    <div className="mt-3 flex items-center justify-end gap-3">
                      <span className="hidden text-[12px] text-faint sm:inline">⌘↵ to send</span>
                      <button type="button" className={btnPrimary} disabled={!text.trim()} onClick={() => void sendComment()}>
                        Comment
                      </button>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}

      {/* Floating action dock — appears once you're reading */}
      <Portal>
        <div className="lesson-float" data-show={dockOn ? "true" : "false"}>
          <div className="lesson-dock" role="toolbar" aria-label="Lesson actions">
            <button type="button" className="lesson-dock-btn" data-on={l.likedByMe ? "true" : undefined} aria-pressed={l.likedByMe} aria-label={l.likedByMe ? "Remove like" : "Like"} onClick={() => act("like")}>
              <HeartIcon filled={l.likedByMe} className="h-5 w-5" />
              {l.likes > 0 && <span>{l.likes}</span>}
            </button>
            {l.settings.comments && (
              <button type="button" className="lesson-dock-btn" aria-label={`Discussion, ${plural(l.comments.length, "comment")}`} onClick={openDiscussion}>
                <CommentIcon className="h-5 w-5" />
                {l.comments.length > 0 && <span>{l.comments.length}</span>}
              </button>
            )}
            {(l.settings.reposts || l.repostedByMe) && (
              <button type="button" className="lesson-dock-btn" data-on={l.repostedByMe ? "true" : undefined} aria-pressed={l.repostedByMe} aria-label={l.repostedByMe ? "Undo repost" : "Repost"} onClick={() => act("repost")}>
                <RepostIcon className="h-5 w-5" />
                {l.reposts > 0 && <span>{l.reposts}</span>}
              </button>
            )}
            <span className="lesson-dock-sep" aria-hidden="true" />
            <button type="button" className="lesson-dock-btn" data-on={l.savedByMe ? "true" : undefined} aria-pressed={l.savedByMe} aria-label={l.savedByMe ? "Remove from saved" : "Save for later"} onClick={() => act("save")}>
              <BookmarkIcon filled={l.savedByMe} className="h-5 w-5" />
            </button>
            <button type="button" className="lesson-dock-btn" aria-label="Share" onClick={() => void share()}>
              <ShareIcon className="h-5 w-5" />
            </button>
          </div>
        </div>
      </Portal>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => !busy && setConfirmOpen(false)}
        onConfirm={remove}
        busy={busy}
        title="Delete this lesson?"
        body="This can’t be undone. Its images and videos are removed too."
        confirmLabel="Delete"
      />
    </div>
  );
}

/** Trades linked to this lesson — the same link you can make from a trade in the Journal. */
function LinkedTrades({ lessonId, title }: { lessonId: string; title: string }) {
  const entries = useApp((s) => s.entries);
  const currency = useApp((s) => s.settings.currency);
  const [picking, setPicking] = useState(false);
  const linked = entries.filter((e) => e.lessonIds?.includes(lessonId)).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const net = linked.reduce((n, e) => n + e.pnl, 0);
  const tone = (n: number) => (n > 0 ? "text-profit" : n < 0 ? "text-loss" : "text-muted");

  return (
    <section aria-label="Linked trades" className="mt-8">
      <div className="flex min-h-12 items-center justify-between gap-3 px-1">
        <h2 className="text-[17px] font-semibold tracking-[-0.015em] text-ink">
          Trades
          {linked.length > 0 && <span className="ml-2 text-[14px] font-medium tabular text-faint">{linked.length}</span>}
        </h2>
        <button
          type="button" onClick={() => setPicking(true)}
          className="-mr-2 flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-medium text-gold outline-none transition-[background-color,transform] hover:bg-gold/10 active:scale-95 focus-visible:ring-2 focus-visible:ring-gold-strong/50"
        >
          <Sym name="link" className="h-4 w-4" />{linked.length ? "Edit" : "Link a trade"}
        </button>
      </div>

      {linked.length === 0 ? (
        <p className="px-1 pb-1 text-[14.5px] leading-relaxed text-muted">Link the trades that put this lesson to the test. They’ll show up here, and the lesson will show up on each trade in your Journal.</p>
      ) : (
        <>
          <ul className="overflow-hidden rounded-[16px] bg-ink/[0.035] ring-1 ring-inset ring-ink/[0.05]">
            <AnimatePresence initial={false}>
              {linked.slice(0, 6).map((e) => (
                <motion.li key={e.id} layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 420, damping: 36 }} className="relative after:absolute after:bottom-0 after:left-[60px] after:right-0 after:h-px after:bg-line-soft last:after:hidden">
                  <Link href={`/journal?trade=${encodeURIComponent(e.id)}`} className="group flex min-h-[56px] items-center gap-3 px-3 py-2 outline-none transition-colors hover:bg-ink/[0.04] active:bg-ink/[0.07] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-strong/50">
                    <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-ink/[0.05]", tone(e.pnl))}>
                      <Sym name={e.direction === "short" ? "arrowDownRight" : "arrowUpRight"} className="h-[18px] w-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium capitalize tracking-[-0.01em] text-ink">{tradeTitle(e)}</span>
                      <span className="block truncate text-[12.5px] text-muted">{[dayShort(e.date), e.setup].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className={cn("kpi text-[14.5px] tabular-nums", tone(e.pnl))}>{formatSignedMoney(e.pnl, currency)}</span>
                    <Sym name="chevronRight" className="h-4 w-4 shrink-0 text-faint transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
                  </Link>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          <div className="mt-3 flex items-center justify-between gap-3 px-1 text-[13px] text-muted">
            <span>Net <span className={cn("font-semibold tabular-nums", tone(net))}>{formatSignedMoney(net, currency)}</span> across {plural(linked.length, "trade")}</span>
            {linked.length > 6 && (
              <Link href={`/journal?lesson=${encodeURIComponent(lessonId)}`} className="font-medium text-gold transition-opacity hover:opacity-75">
                View all in Journal
              </Link>
            )}
          </div>
        </>
      )}
      <TradePicker open={picking} lessonId={lessonId} lessonTitle={title} onClose={() => setPicking(false)} />
    </section>
  );
}

function ReaderSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[680px] animate-pulse-soft" aria-busy="true" aria-label="Loading lesson">
      <div className="h-10 w-24 rounded-full bg-ink/[0.05]" />
      <div className="mt-8 h-9 w-11/12 rounded-lg bg-ink/[0.08]" />
      <div className="mt-3 h-9 w-2/3 rounded-lg bg-ink/[0.08]" />
      <div className="mt-6 h-5 w-4/5 rounded bg-ink/[0.05]" />
      <div className="mt-7 flex items-center gap-3">
        <div className="h-9 w-9 rounded-full bg-ink/[0.07]" />
        <div className="space-y-2">
          <div className="h-3 w-28 rounded bg-ink/[0.07]" />
          <div className="h-3 w-44 rounded bg-ink/[0.05]" />
        </div>
      </div>
      <div className="mt-11 space-y-3">
        {[100, 96, 100, 88, 100, 64].map((w, i) => (
          <div key={i} className="h-4 rounded bg-ink/[0.05]" style={{ width: `${w}%` }} />
        ))}
      </div>
    </div>
  );
}
