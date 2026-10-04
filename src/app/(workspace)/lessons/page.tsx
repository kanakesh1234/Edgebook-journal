"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { btn3d, btn3dDanger, btn3dPrimary, pill } from "@/components/lessons/buttons";
import { BookmarkIcon } from "@/components/lessons/bookmark-icon";

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
    if (!picked.size || !confirm(`Delete ${picked.size} lesson${picked.size > 1 ? "s" : ""}? This can’t be undone.`)) return;
    await send({ action: "delete", ids: [...picked] });
    setPicked(new Set()); setSelecting(false); load();
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold text-ink">Lessons</h1>
        <div className="flex gap-2">
          {mine.length > 0 && (
            <button className={btn3d} onClick={() => { setSelecting(!selecting); setPicked(new Set()); }}>
              {selecting ? "Done" : "Select"}
            </button>
          )}
          <Link href="/lessons/new" className={btn3dPrimary}>Write a lesson</Link>
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
          <button className={btn3dDanger} disabled={!picked.size} onClick={remove}>Delete ({picked.size})</button>
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

      <div className="space-y-4">
        {shown?.map((l) => {
          const cover = l.cover;
          const isPicked = picked.has(l.id);
          return (
            <article key={l.id}
              onClick={() => (selecting ? l.mine && toggle(l.id) : router.push(`/lessons/${l.id}`))}
              className={`cursor-pointer rounded-2xl border bg-surface p-4 transition-colors hover:bg-raised ${isPicked ? "border-gold" : "border-line"} ${selecting && !l.mine ? "opacity-50" : ""}`}>
              {l.repostedBy.length > 0 && <p className="mb-1 text-[11px] text-faint">{l.repostedBy.join(", ")} reposted</p>}
              <div className="flex items-center gap-2 text-xs text-faint">
                {selecting && l.mine && <input type="checkbox" checked={isPicked} readOnly />}
                <span>{l.bylines.length ? l.bylines.join(", ") : l.mine ? "You" : l.author.name} · @{l.author.handle} · {new Date(l.createdAt).toLocaleDateString()} · {l.readMins} min read</span>
              </div>
              {cover && /* eslint-disable-next-line @next/next/no-img-element */ <img src={cover} alt="" className="mt-3 max-h-72 w-full rounded-xl object-cover" />}
              <h2 className="mt-3 text-lg font-semibold text-ink">{l.title}</h2>
              {(l.hook || l.subtitle || l.excerpt) && <p className="mt-1 line-clamp-2 text-[15px] leading-snug text-muted">{l.hook || l.subtitle || l.excerpt}</p>}

              {!selecting && (
                <div className="mt-3 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
                  <button onClick={(e) => act(e, l.id, "like")} className={pill + (l.likedByMe ? " text-gold" : " text-faint")}>{l.likedByMe ? "♥" : "♡"} {l.likes}</button>
                  {l.settings.comments && <button onClick={() => { setOpenId(openId === l.id ? null : l.id); setDraft(""); }} className={pill + (openId === l.id ? " text-gold" : " text-faint")}>Comments {l.comments.length}</button>}
                  {(l.settings.reposts || l.repostedByMe) && <button onClick={(e) => act(e, l.id, "repost")} className={pill + (l.repostedByMe ? " text-gold" : " text-faint")}>{l.repostedByMe ? "Reposted" : "Repost"} {l.reposts}</button>}
                  <button onClick={(e) => act(e, l.id, "save")} aria-pressed={l.savedByMe} className={pill + " ml-auto" + (l.savedByMe ? " text-gold" : " text-faint")}><BookmarkIcon filled={l.savedByMe} />{l.savedByMe ? "Saved" : "Save"}</button>
                </div>
              )}

              {openId === l.id && !selecting && l.settings.comments && (
                <div className="mt-3 space-y-2 border-t border-line pt-3" onClick={(e) => e.stopPropagation()}>
                  {l.comments.map((c) => <p key={c.id} className="text-sm text-muted"><span className="font-medium text-ink">{c.by}</span> {c.body}</p>)}
                  <div className="flex gap-2">
                    <input value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && comment(l.id)}
                      placeholder="Add a comment" className="min-w-0 flex-1 rounded-lg border border-line bg-canvas px-3 py-1.5 text-sm text-ink outline-none focus:border-line-strong" />
                    <button className={btn3dPrimary} onClick={() => comment(l.id)}>Send</button>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}
