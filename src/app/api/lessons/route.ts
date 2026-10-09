import { NextResponse } from "next/server";
import { sessionEmail, rateLimited } from "@/lib/server/auth";
import { listAccounts } from "@/lib/server/accounts";
import { listFor } from "@/lib/server/friends";
import { readLessons, updateLessons, removeMedia, removeUnusedMedia, isCoverUrl, uid, type Lesson } from "@/lib/server/lessons-store";
import { blocksToHtml, cleanHtml, coverOf, hookOf, readMinutes, textOf } from "@/lib/server/lessons-html";

export const dynamic = "force-dynamic";

const MAX_HTML = 2_000_000;
const MAX_COMMENTS_PER_LESSON = 300;

/** Me + accepted friends: the only people whose lessons I may see. */
async function circle(me: string): Promise<Set<string>> {
  const set = new Set<string>([me]);
  for (const r of await listFor(me)) {
    if (r.status === "accepted") set.add(r.from === me ? r.to : r.from);
  }
  return set;
}

const parseBylines = (v: unknown) =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 60)).filter(Boolean).slice(0, 5) : [];

type Names = (email: string) => { handle: string; name: string };

/** One accounts read for the whole request (instead of one Drive read per lesson / comment). */
async function nameLookup(): Promise<Names> {
  const byEmail = new Map((await listAccounts()).map((a) => [a.email.toLowerCase(), a]));
  return (email) => {
    const a = byEmail.get(email.toLowerCase());
    return { handle: a?.handle ?? "trader", name: a?.name?.split(" ")[0] ?? a?.handle ?? "Trader" };
  };
}

function present(l: Lesson, me: string, who: Names, brief = false) {
  const html = l.html ?? blocksToHtml(l.blocks ?? []);
  return {
    // `brief` drops the body and comments: a light index for pickers and link chips (the Journal).
    id: l.id,
    title: l.title,
    subtitle: l.subtitle,
    html: brief ? "" : html,
    cover: l.cover ?? coverOf(html),
    customCover: l.cover ?? null,
    excerpt: textOf(html).slice(0, 180),
    hook: hookOf(html),
    readMins: readMinutes(html),
    createdAt: l.createdAt,
    author: who(l.author),
    bylines: l.bylines ?? [],
    settings: { comments: l.settings?.comments !== false, reposts: l.settings?.reposts !== false },
    mine: l.author === me,
    likes: l.likes.length,
    likedByMe: l.likes.includes(me),
    reposts: l.reposts.length,
    repostedByMe: l.reposts.includes(me),
    savedByMe: (l.saves ?? []).includes(me),
    repostedBy: l.reposts.filter((e) => e !== me).slice(0, 2).map((e) => who(e).name),
    comments: brief ? [] : l.comments.map((c) => ({ id: c.id, body: c.body, at: c.at, by: who(c.by).name })),
  };
}

const unavailable = (err: unknown) => {
  console.error("[lessons] storage error:", err instanceof Error ? err.message : err);
  return NextResponse.json({ error: "storage_unavailable" }, { status: 503 });
};

export async function GET(request: Request) {
  const me = sessionEmail(request);
  if (!me) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
  try {
    const [ok, all, who] = await Promise.all([circle(me), readLessons(), nameLookup()]);
    const id = new URL(request.url).searchParams.get("id");
    const visible = all.filter((l) => ok.has(l.author));

    if (id) {
      const l = visible.find((x) => x.id === id);
      if (!l) return NextResponse.json({ error: "not_found" }, { status: 404 });
      return NextResponse.json({ lesson: present(l, me, who) });
    }
    visible.sort((a, b) => b.createdAt - a.createdAt);
    const brief = new URL(request.url).searchParams.get("brief") === "1";
    return NextResponse.json({ lessons: visible.map((l) => present(l, me, who, brief)) });
  } catch (err) {
    return unavailable(err);
  }
}

export async function POST(request: Request) {
  const me = sessionEmail(request);
  if (!me) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
  if (rateLimited(`lessons:${me}`, 120, 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });

  const b = (await request.json().catch(() => ({}))) as {
    action?: unknown; id?: unknown; title?: unknown; subtitle?: unknown; html?: unknown; body?: unknown; ids?: unknown; bylines?: unknown;
    settings?: { comments?: unknown; reposts?: unknown };
    cover?: unknown;
  };
  const str = (v: unknown) => (typeof v === "string" ? v : "");

  try {
    if (b.action === "create") {
      if (rateLimited(`lessons-create:${me}`, 20, 60 * 60_000)) return NextResponse.json({ error: "rate_limited" }, { status: 429 });
      const title = str(b.title).trim();
      if (!title) return NextResponse.json({ error: "title_required" }, { status: 400 });
      if (str(b.html).length > MAX_HTML) return NextResponse.json({ error: "too_long" }, { status: 413 });
      if (typeof b.cover === "string" && !isCoverUrl(b.cover)) return NextResponse.json({ error: "bad_cover" }, { status: 400 });
      const lesson: Lesson = {
        id: uid(), author: me, title: title.slice(0, 200), subtitle: str(b.subtitle).slice(0, 300),
        blocks: [], html: cleanHtml(str(b.html)), createdAt: Date.now(),
        ...(typeof b.cover === "string" ? { cover: b.cover } : {}),
        bylines: parseBylines(b.bylines),
        settings: { comments: b.settings?.comments !== false, reposts: b.settings?.reposts !== false },
        likes: [], reposts: [], saves: [], comments: [],
      };
      await updateLessons((all) => ({ next: [lesson, ...all], result: null }));
      return NextResponse.json({ ok: true, id: lesson.id });
    }

    if (b.action === "update") {
      const title = str(b.title).trim();
      if (!title) return NextResponse.json({ error: "title_required" }, { status: 400 });
      if (str(b.html).length > MAX_HTML) return NextResponse.json({ error: "too_long" }, { status: 413 });
      // `cover`: a URL sets it, null removes it, anything else (omitted) leaves it as it was.
      if (typeof b.cover === "string" && !isCoverUrl(b.cover)) return NextResponse.json({ error: "bad_cover" }, { status: 400 });
      const html = cleanHtml(str(b.html));

      type Media = Pick<Lesson, "html" | "blocks" | "cover">;
      const outcome = await updateLessons<{ before: Media; after: Media } | null>((all) => {
        const l = all.find((x) => x.id === str(b.id) && x.author === me); // you can only edit your own
        if (!l) return { result: null };
        const before = { html: l.html, blocks: l.blocks ?? [], cover: l.cover };
        l.title = title.slice(0, 200);
        l.subtitle = str(b.subtitle).slice(0, 300);
        l.html = html;
        l.blocks = []; // legacy blocks are superseded by html once edited
        l.bylines = parseBylines(b.bylines);
        l.settings = { comments: b.settings?.comments !== false, reposts: b.settings?.reposts !== false };
        if (typeof b.cover === "string") l.cover = b.cover;
        else if (b.cover === null) delete l.cover;
        return { next: all, result: { before, after: { html: l.html, blocks: l.blocks, cover: l.cover } } };
      });
      if (!outcome) return NextResponse.json({ error: "not_found" }, { status: 404 });
      await removeUnusedMedia(outcome.before, outcome.after);
      return NextResponse.json({ ok: true, id: str(b.id) });
    }

    if (b.action === "delete") {
      const ids = new Set(Array.isArray(b.ids) ? b.ids.filter((x): x is string => typeof x === "string").slice(0, 200) : []);
      const gone = await updateLessons((all) => {
        const removed = all.filter((l) => ids.has(l.id) && l.author === me); // you can only delete your own
        return { next: removed.length ? all.filter((l) => !removed.includes(l)) : undefined, result: removed };
      });
      await removeMedia(gone);
      return NextResponse.json({ ok: true, deleted: gone.length });
    }

    const action = str(b.action);
    if (!["like", "save", "repost", "comment"].includes(action)) return NextResponse.json({ error: "unknown_action" }, { status: 400 });
    const lessonId = str(b.id);
    const body = str(b.body).trim().slice(0, 1000);
    if (action === "comment" && !body) return NextResponse.json({ error: "empty_comment" }, { status: 400 });
    const ok = await circle(me);

    const outcome = await updateLessons((all) => {
      const l = all.find((x) => x.id === lessonId && ok.has(x.author));
      if (!l) return { result: "not_found" as const };
      const flip = (arr: string[]) => (arr.includes(me) ? arr.filter((e) => e !== me) : [...arr, me]);
      if (action === "like") l.likes = flip(l.likes);
      else if (action === "save") l.saves = flip(l.saves ?? []); // private bookmark
      else if (action === "repost") {
        if (l.settings?.reposts === false && !l.reposts.includes(me)) return { result: "reposts_off" as const };
        l.reposts = flip(l.reposts);
      } else {
        if (l.settings?.comments === false) return { result: "comments_off" as const };
        if (l.comments.length >= MAX_COMMENTS_PER_LESSON) return { result: "too_many" as const };
        l.comments.push({ id: uid(), by: me, body, at: Date.now() });
      }
      return { next: all, result: "ok" as const };
    });

    if (outcome === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
    if (outcome === "reposts_off" || outcome === "comments_off") return NextResponse.json({ error: outcome }, { status: 403 });
    if (outcome === "too_many") return NextResponse.json({ error: "too_many_comments" }, { status: 429 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return unavailable(err);
  }
}
