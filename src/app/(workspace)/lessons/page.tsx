"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { btn, btnDanger, btnPrimary, pill } from "@/components/lessons/buttons";
import { BookmarkIcon } from "@/components/lessons/bookmark-icon";
import { ConfirmDialog } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toast";
import "@/components/lessons/lessons.css";

export interface LessonView {
  id: string; title: string; subtitle: string; createdAt: number;
  html: string; cover: string | null; excerpt: string; hook: string; readMins: number;
  author: { handle: string; name: string }; bylines: string[]; settings: { comments: boolean; reposts: boolean }; mine: boolean;
  likes: number; likedByMe: boolean; reposts: number; repostedByMe: boolean; savedByMe: boolean; repostedBy: string[];
  comments: { id: string; by: string; body: string; at: number }[];
}

const send = (body: object) =>
  fetch("/api/lessons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

export default function LessonsPage() {
  const router = useRouter();
  const [items, setItems] = useState<LessonView[] | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null); // inline comments
  const [draft, setDraft] = useState("");
  const [view, setView] = useState<"all" | "saved">("all");
  const [askDelete, setAskDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    fetch("/api/lessons", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { lessons: [] }))
      .then((d) => setItems(d.lessons ?? []))
      .catch(() => setItems([]));
  }, []);
  useEffect(load, [load]);

  const mine = (items ?? []).filter((l) => l.mine);
  const savedCount = (items ?? []).filter((l) => l.savedByMe).length;
  const shown = view === "saved" ? (items ?? []).filter((l) => l.savedByMe) : items;
  const allPicked = mine.length > 0 && mine.every((l) => picked.has(l.id));

  // Optimistic: the button flips instantly while scrolling, then the server state is re-synced.
  const act = async (e: React.MouseEvent, id: string, action: "like" | "repost" | "save") => {
    e.stopPropagation();
    setItems((cur) => cur && cur.map((l) => {
      if (l.id !== id) return l;
      if (action === "like") return { ...l, likedByMe: !l.likedByMe, likes: l.likes + (l.likedByMe ? -1 : 1) };
      if (action === "repost") return { ...l, repostedByMe: !l.repostedByMe, reposts: l.reposts + (l.repostedByMe ? -1 : 1) };
      return { ...l, savedByMe: !l.savedByMe };
    }));
    await send({ action, id }).catch(() => {});
    load();
  };
  const comment = async (id: string) => {
    if (!draft.trim()) return;
    await send({ action: "comment", id, body: draft });
    setDraft("");
    load();
  };
  const toggle = (id: string) =>
    setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const remove = async () => {
    if (!picked.size) return;
    setDeleting(true);
    try {
      const res = await send({ action: "delete", ids: [...picked] });
      if (!res.ok) {
        const detail = await res.json().then((j: { detail?: string; error?: string }) => j?.detail ?? j?.error).catch(() => undefined);
        throw new Error(res.status === 401 ? "Please log in again." : detail ? `${res.status}: ${detail}` : `Server said ${res.status}.`);
      }
      const gone = new Set(picked);
      setItems((cur) => cur && cur.filter((l) => !gone.has(l.id)));
      toast.success(`Deleted ${gone.size} lesson${gone.size > 1 ? "s" : ""}`);
      setPicked(new Set()); setSelecting(false);
    } catch (e) {
      toast.error("Couldn't delete", e instanceof Error ? e.message : "Try again.");
    } finally {
      setDeleting(false); setAskDelete(false); load();
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-ink">Lessons</h1>
        <div className="flex gap-2">
          {mine.length > 0 && (
            <button className={btn} onClick={() => { setSelecting(!selecting); setPicked(new Set()); }}>
              {selecting ? "Done" : "Select"}
            </button>
          )}
          <Link href="/lessons/new" className={btnPrimary}>Write a lesson</Link>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        <button onClick={() => setView("all")} className={pill + (view === "all" ? " text-gold" : " text-faint")}>All</button>
        <button onClick={() => setView("saved")} className={pill + (view === "saved" ? " text-gold" : " text-faint")}>
          <BookmarkIcon filled={view === "saved"} />Saved{savedCount > 0 ? ` ${savedCount}` : ""}
        </button>
      </div>

      {selecting && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-line bg-raised px-4 py-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={allPicked}
              onChange={() => setPicked(allPicked ? new Set() : new Set(mine.map((l) => l.id)))} />
            Select all my lessons ({mine.length})
          </label>
          <button className={btnDanger} disabled={!picked.size} onClick={() => setAskDelete(true)}>Delete ({picked.size})</button>
        </div>
      )}

      {items === null && <p className="text-sm text-faint">Loading…</p>}
      {view === "saved" && items && items.length > 0 && shown?.length === 0 && (
        <p className="rounded-xl border border-dashed border-line-strong p-6 text-sm text-muted">
          Nothing saved yet. Tap Save on any lesson to keep it here.
        </p>
      )}
      {items?.length === 0 && (
        <p className="rounded-xl border border-dashed border-line-strong p-6 text-sm text-muted">
          No lessons yet. Write the first one, or add friends in Friends to see theirs here.
        </p>
      )}

      <div className="lesson-feed space-y-6">
        {shown?.map((l) => {
          const cover = l.cover;
          const isPicked = picked.has(l.id);
          const dek = l.hook || l.subtitle || l.excerpt;
          const open = () => (selecting ? l.mine && toggle(l.id) : router.push(`/lessons/${l.id}`));
          return (
            <article key={l.id}
              role="link"
              tabIndex={0}
              onClick={open}
              onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(); } }}
              className={`lesson-card${isPicked ? " is-picked" : ""}${selecting && !l.mine ? " opacity-50" : ""}`}>
              {l.repostedBy.length > 0 && <p className="lc-eyebrow mb-2">{l.repostedBy.join(", ")} reposted</p>}
              <div className="lc-eyebrow flex items-center gap-2">
                {selecting && l.mine && <input type="checkbox" checked={isPicked} readOnly />}
                <span>
                  <b>{l.bylines.length ? l.bylines.join(", ") : l.mine ? "You" : l.author.name}</b> · @{l.author.handle} · {new Date(l.createdAt).toLocaleDateString()} · {l.readMins} min read
                </span>
              </div>
              {cover && /* eslint-disable-next-line @next/next/no-img-element */ <img src={cover} alt="" className="lc-cover" loading="lazy" />}
              <h2 className="lc-title">{l.title}</h2>
              {dek && <p className="lc-dek">{dek}</p>}

              {!selecting && (
                <div className="lc-actions" onClick={(e) => e.stopPropagation()}>
                  <button onClick={(e) => act(e, l.id, "like")} className={pill + " lc-pill" + (l.likedByMe ? " text-gold" : " text-faint")}>{l.likedByMe ? "♥" : "♡"} {l.likes}</button>
                  {l.settings.comments && <button onClick={() => { setOpenId(openId === l.id ? null : l.id); setDraft(""); }} className={pill + " lc-pill" + (openId === l.id ? " text-gold" : " text-faint")}>Comments {l.comments.length}</button>}
                  {(l.settings.reposts || l.repostedByMe) && <button onClick={(e) => act(e, l.id, "repost")} className={pill + " lc-pill" + (l.repostedByMe ? " text-gold" : " text-faint")}>{l.repostedByMe ? "Reposted" : "Repost"} {l.reposts}</button>}
                  <button onClick={(e) => act(e, l.id, "save")} aria-pressed={l.savedByMe} className={pill + " lc-pill ml-auto" + (l.savedByMe ? " text-gold" : " text-faint")}><BookmarkIcon filled={l.savedByMe} />{l.savedByMe ? "Saved" : "Save"}</button>
                </div>
              )}

              {openId === l.id && !selecting && l.settings.comments && (
                <div className="mt-4 space-y-2 border-t border-line pt-4" onClick={(e) => e.stopPropagation()}>
                  {l.comments.map((c) => <p key={c.id} className="text-sm text-muted"><span className="font-medium text-ink">{c.by}</span> {c.body}</p>)}
                  <div className="flex gap-2">
                    <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && comment(l.id)}
                      placeholder="Add a comment" className="min-w-0 flex-1 rounded-xl border border-line bg-canvas/70 px-3.5 py-2 text-sm text-ink outline-none focus:border-line-strong" />
                    <button className={btnPrimary} onClick={() => comment(l.id)}>Send</button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
      <ConfirmDialog
        open={askDelete}
        onClose={() => !deleting && setAskDelete(false)}
        onConfirm={remove}
        busy={deleting}
        title={`Delete ${picked.size} lesson${picked.size > 1 ? "s" : ""}?`}
        body="This can't be undone."
      />
    </div>
  );
}
