import { NextResponse } from "next/server";
import { getGoogleConfig } from "@/lib/server/google-config";
import { APP_SESSION_COOKIE, openAppSession, readCookie } from "@/lib/server/session";
import { getAccount } from "@/lib/server/accounts";
import { listFor } from "@/lib/server/friends";
import { uid, type Lesson } from "@/lib/server/lessons-store";
import { deleteLessons, getLesson, getLessons, removeMedia, saveLesson } from "@/lib/server/storage";
import { blocksToHtml, cleanHtml, coverOf, hookOf, readMinutes, textOf } from "@/lib/server/lessons-html";

export const dynamic = "force-dynamic";

function sessionEmail(request: Request): string | null {
  const config = getGoogleConfig();
  const cookie = readCookie(request, APP_SESSION_COOKIE);
  return config && cookie ? openAppSession(cookie, config.tokenSecret)?.email ?? null : null;
}

/** Me + accepted friends: the only people whose lessons I may see. */
async function circle(me: string): Promise<Set<string>> {
  const set = new Set<string>([me]);
  for (const r of await listFor(me)) {
    if (r.status === "accepted") set.add(r.from === me ? r.to : r.from);
  }
  return set;
}

async function who(email: string) {
  const a = await getAccount(email);
  return { handle: a?.handle ?? "trader", name: a?.name?.split(" ")[0] ?? a?.handle ?? "Trader" };
}

async function present(l: Lesson, me: string) {
  const html = l.html ?? blocksToHtml(l.blocks ?? []);
  const comments = await Promise.all(
    l.comments.map(async (c) => ({ id: c.id, body: c.body, at: c.at, by: (await who(c.by)).name })),
  );
  return {
    id: l.id,
    title: l.title,
    subtitle: l.subtitle,
    html,
    cover: coverOf(html),
    excerpt: textOf(html).slice(0, 180),
    hook: hookOf(html),
    readMins: readMinutes(html),
    createdAt: l.createdAt,
    author: await who(l.author),
    bylines: l.bylines ?? [],
    settings: { comments: l.settings?.comments !== false, reposts: l.settings?.reposts !== false },
    mine: l.author.toLowerCase() === me.toLowerCase(),
    likes: l.likes.length,
    likedByMe: l.likes.includes(me),
    reposts: l.reposts.length,
    repostedByMe: l.reposts.includes(me),
    savedByMe: (l.saves ?? []).includes(me),
    repostedBy: await Promise.all(l.reposts.filter((e) => e !== me).slice(0, 2).map(async (e) => (await who(e)).name)),
    comments,
  };
}

export async function GET(request: Request) {
  const me = sessionEmail(request);
  if (!me) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
  const ok = await circle(me);
  const id = new URL(request.url).searchParams.get("id");
  const visible = (await getLessons()).filter((l) => ok.has(l.author));

  if (id) {
    const l = visible.find((x) => x.id === id);
    if (!l) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ lesson: await present(l, me) });
  }
  visible.sort((a, b) => b.createdAt - a.createdAt);
  return NextResponse.json({ lessons: await Promise.all(visible.map((l) => present(l, me))) });
}

export async function POST(request: Request) {
  const me = sessionEmail(request);
  if (!me) return NextResponse.json({ error: "not_logged_in" }, { status: 401 });
  const b = (await request.json().catch(() => ({}))) as {
    action?: string; id?: string; title?: string; subtitle?: string; html?: string; body?: string; ids?: string[]; bylines?: unknown; settings?: { comments?: unknown; reposts?: unknown };
  };
  try {
    if (b.action === "create") {
      const title = (b.title ?? "").trim();
      if (!title) return NextResponse.json({ error: "title_required" }, { status: 400 });
      if ((b.html ?? "").length > 2_000_000) return NextResponse.json({ error: "too_long" }, { status: 413 });
      const lesson: Lesson = {
        id: uid(), author: me, title: title.slice(0, 200), subtitle: (b.subtitle ?? "").slice(0, 300),
        blocks: [], html: cleanHtml(b.html ?? ""), createdAt: Date.now(),
        bylines: Array.isArray(b.bylines) ? b.bylines.filter((x): x is string => typeof x === "string").map((x) => x.trim().slice(0, 60)).filter(Boolean).slice(0, 5) : [],
        settings: { comments: b.settings?.comments !== false, reposts: b.settings?.reposts !== false },
        likes: [], reposts: [], saves: [], comments: [],
      };
      await saveLesson(lesson);
      return NextResponse.json({ ok: true, id: lesson.id });
    }

    if (b.action === "delete") {
      // You can only delete your own lessons; ids that are not yours are ignored.
      const wanted = new Set(Array.isArray(b.ids) ? b.ids : []);
      const gone = (await getLessons()).filter((l) => wanted.has(l.id) && l.author.toLowerCase() === me.toLowerCase());
      if (!gone.length) return NextResponse.json({ error: "nothing_deleted" }, { status: 404 });
      await deleteLessons(gone.map((l) => l.id));
      await removeMedia(gone);
      return NextResponse.json({ ok: true, deleted: gone.length });
    }

    const ok = await circle(me);
    const l = b.id ? await getLesson(b.id) : null;
    if (!l || !ok.has(l.author)) return NextResponse.json({ error: "not_found" }, { status: 404 });
    l.comments ??= []; l.likes ??= []; l.reposts ??= [];
    const flip = (arr: string[]) => (arr.includes(me) ? arr.filter((e) => e !== me) : [...arr, me]);

    if (b.action === "like") l.likes = flip(l.likes);
    else if (b.action === "save") l.saves = flip(l.saves ?? []); // private bookmark; works on any lesson I can see
    else if (b.action === "repost") {
      if (l.settings?.reposts === false && !l.reposts.includes(me)) return NextResponse.json({ error: "reposts_off" }, { status: 403 });
      l.reposts = flip(l.reposts);
    }
    else if (b.action === "comment" && b.body?.trim()) {
      if (l.settings?.comments === false) return NextResponse.json({ error: "comments_off" }, { status: 403 });
      l.comments.push({ id: uid(), by: me, body: b.body.trim().slice(0, 1000), at: Date.now() });
    }
    else return NextResponse.json({ error: "unknown_action" }, { status: 400 });

    await saveLesson(l);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[lessons] POST failed:", err);
    return NextResponse.json({ error: "storage_error", detail: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
