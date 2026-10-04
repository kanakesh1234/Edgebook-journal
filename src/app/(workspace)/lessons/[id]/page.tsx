"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { btnDanger, btnPrimary, pill } from "@/components/lessons/buttons";
import { ConfirmDialog } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toast";
import "@/components/lessons/lessons.css";
import { BookmarkIcon } from "@/components/lessons/bookmark-icon";
import type { LessonView } from "../page";

export default function LessonPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [l, setL] = useState<LessonView | null | undefined>(undefined);
  const [text, setText] = useState("");
  const [askDelete, setAskDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/lessons?id=${id}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setL(d?.lesson ?? null))
      .catch(() => setL(null));
  }, [id]);
  useEffect(load, [load]);

  const post = async (action: string, body?: string) => {
    await fetch("/api/lessons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id, body }) });
    load();
  };
  const remove = async () => {
    setDeleting(true);
    try {
      const res = await fetch("/api/lessons", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", ids: [id] }) });
      if (!res.ok) {
        const detail = await res.json().then((j: { detail?: string; error?: string }) => j?.detail ?? j?.error).catch(() => undefined);
        throw new Error(res.status === 401 ? "Please log in again." : detail ? `${res.status}: ${detail}` : `Server said ${res.status}.`);
      }
      toast.success("Lesson deleted");
      router.push("/lessons");
    } catch (e) {
      toast.error("Couldn't delete", e instanceof Error ? e.message : "Try again.");
      setDeleting(false); setAskDelete(false);
    }
  };

  if (l === undefined) return <p className="p-8 text-sm text-faint">Loading…</p>;
  if (l === null) return <p className="p-8 text-sm text-muted">This lesson isn’t available. <Link href="/lessons" className="text-gold">Back to Lessons</Link></p>;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between">
        <Link href="/lessons" className="text-sm text-faint hover:text-ink">← Lessons</Link>
        {l.mine && <button className={btnDanger} onClick={() => setAskDelete(true)}>Delete</button>}
      </div>
      <h1 className="mt-4 font-display text-3xl font-semibold text-ink">{l.title}</h1>
      {l.subtitle && <p className="mt-2 text-lg text-muted">{l.subtitle}</p>}
      <p className="mt-2 text-xs text-faint">{l.bylines.length ? l.bylines.join(", ") : l.mine ? "You" : l.author.name} · @{l.author.handle} · {new Date(l.createdAt).toLocaleDateString()} · {l.readMins} min read</p>

      <div className="lesson-prose mt-8" dangerouslySetInnerHTML={{ __html: l.html }} />

      <div className="mt-8 flex gap-3 border-y border-line py-4">
        <button onClick={() => post("like")} className={pill + (l.likedByMe ? " text-gold" : " text-faint")}>{l.likedByMe ? "♥" : "♡"} {l.likes}</button>
        {(l.settings.reposts || l.repostedByMe) && <button onClick={() => post("repost")} className={pill + (l.repostedByMe ? " text-gold" : " text-faint")}>{l.repostedByMe ? "Reposted" : "Repost"} {l.reposts}</button>}
        <button onClick={() => navigator.clipboard.writeText(location.href)} className={pill + " text-faint"}>Copy link</button>
        <button onClick={() => post("save")} aria-pressed={l.savedByMe} className={pill + " ml-auto" + (l.savedByMe ? " text-gold" : " text-faint")}><BookmarkIcon filled={l.savedByMe} />{l.savedByMe ? "Saved" : "Save"}</button>
      </div>

      {!l.settings.comments ? <p className="mt-6 text-sm text-faint">Comments are turned off for this lesson.</p> : <section className="mt-6">
        <h3 className="text-sm font-semibold text-ink">{l.comments.length} comments</h3>
        <div className="mt-3 space-y-3">
          {l.comments.map((c) => <p key={c.id} className="text-sm text-muted"><span className="font-medium text-ink">{c.by}</span> {c.body}</p>)}
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Add a comment"
          className="mt-4 min-h-[72px] w-full rounded-xl border border-line bg-surface p-3 text-sm text-ink outline-none focus:border-line-strong" />
        <button onClick={() => { if (text.trim()) { void post("comment", text); setText(""); } }} className={btnPrimary + " mt-3"}>Comment</button>
      </section>}
      <ConfirmDialog
        open={askDelete}
        onClose={() => !deleting && setAskDelete(false)}
        onConfirm={remove}
        busy={deleting}
        title="Delete this lesson?"
        body="This can't be undone."
      />
    </div>
  );
}
