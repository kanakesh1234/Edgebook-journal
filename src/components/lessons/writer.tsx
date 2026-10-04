"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Youtube from "@tiptap/extension-youtube";
import Highlight from "@tiptap/extension-highlight";
import TextAlign from "@tiptap/extension-text-align";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import { Placeholder } from "@tiptap/extensions";
import { useApp } from "@/lib/store";
import { Audio, CtaButton, Video } from "@/components/lessons/extensions";
import { Caret, Icon, type IconName } from "@/components/lessons/writer-icons";
import "@fontsource/spectral/400.css";
import "@fontsource/spectral/400-italic.css";
import "@fontsource/spectral/600.css";
import "@fontsource/spectral/700.css";
import "@/components/lessons/lessons.css";
import { ImageError, imageTypeOf, MAX_LESSON_MEDIA_BYTES, prepareLessonImage } from "@/lib/images";
import "@/components/lessons/writer.css";

/* ------------------------------------------------------------------ */
/*  Types, constants, helpers                                          */
/* ------------------------------------------------------------------ */

type Settings = { comments: boolean; reposts: boolean };
interface Draft { title: string; subtitle: string; html: string; bylines: string[]; header: string; footer: string; settings: Settings }
interface Snapshot { at: number; title: string; subtitle: string; html: string; words: number }

const DRAFT = "edgebook-lesson-draft";
const HISTORY = "edgebook-lesson-history";
const VID = /^video\/(mp4|webm|quicktime)$/;
const AUD = /^audio\/(mpeg|wav|x-wav|mp4|x-m4a|ogg)$/;
// Images are normalised in the browser (see prepareLessonImage), so anything the browser can decode is welcome.
const anyMedia = (f: File) => !!imageTypeOf(f) || VID.test(f.type) || AUD.test(f.type);
const ERR_TEXT: Record<string, string> = {
  not_logged_in: "You're signed out. Sign in again, then retry.",
  unsupported_type: "That file type isn't supported.",
  too_large: "That file is over 4 MB. Use a smaller (or compressed) file.",
  rate_limited: "Too many uploads in a row. Wait a minute and retry.",
  bad_content: "That file doesn't look like a valid image, video or audio file.",
  storage_failed: "The server couldn't save the file. Try again in a moment.",
};

const TEXT_COLORS = ["#e03131", "#f76707", "#f59f00", "#2f9e44", "#1c7ed6", "#7048e8", "#d6336c", "#868e96"];
const HILITES = ["#ffe066", "#b2f2bb", "#a5d8ff", "#ffc9c9", "#eebefa", "#ffd8a8", "#dee2e6"];

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const note = (s: string) => `<p><em>${esc(s.trim()).replace(/\n/g, "<br>")}</em></p>`;
const compose = (html: string, header: string, footer: string) =>
  (header.trim() ? note(header) + "<hr>" : "") + html + (footer.trim() ? "<hr>" + note(footer) : "");
const cleanUrl = (u: string) => { const v = u.trim(); if (!v) return ""; return /^(https?:\/\/|mailto:)/i.test(v) ? v : `https://${v}`; };

const TEMPLATES: { name: string; hint: string; html: string }[] = [
  { name: "Concept explainer", hint: "What it is, why it works, how to spot it", html: "<h2>What it is</h2><p></p><h2>Why it works</h2><p></p><h2>How I spot it</h2><ul><li><p></p></li></ul><h2>An example</h2><p></p>" },
  { name: "Trade review", hint: "Setup, plan vs execution, takeaways", html: "<h2>The setup</h2><p></p><h2>Plan vs execution</h2><p></p><h2>What I would repeat</h2><ul><li><p></p></li></ul><h2>What I would change</h2><ul><li><p></p></li></ul>" },
  { name: "Rule & checklist", hint: "A rule, when it applies, a checklist", html: "<h2>The rule</h2><p></p><h2>When it applies</h2><p></p><h2>Checklist</h2><ol><li><p></p></li><li><p></p></li><li><p></p></li></ol>" },
  { name: "Weekly recap", hint: "Numbers, wins, misses, next week", html: "<h2>The week in numbers</h2><p></p><h2>What worked</h2><ul><li><p></p></li></ul><h2>What did not</h2><ul><li><p></p></li></ul><h2>Focus for next week</h2><p></p>" },
];

function readHistory(): Snapshot[] {
  try { return JSON.parse(localStorage.getItem(HISTORY) ?? "[]") as Snapshot[]; } catch { return []; }
}

/* ------------------------------------------------------------------ */
/*  Small UI pieces                                                    */
/* ------------------------------------------------------------------ */

const keepSelection = (e: React.MouseEvent) => e.preventDefault();

function Tb({ title, onClick, active, disabled, children }: { title: string; onClick: () => void; active?: boolean; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" title={title} aria-label={title} disabled={disabled} onMouseDown={keepSelection} onClick={onClick} className={"wr-tb" + (active ? " is-on" : "")}>
      {children}
    </button>
  );
}

function Menu({ open, setOpen, trigger, title, text, wide, right, children }: {
  open: boolean; setOpen: (v: boolean) => void; trigger: ReactNode; title: string; text?: boolean; wide?: boolean; right?: boolean; children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open, setOpen]);
  return (
    <div ref={ref} className="wr-menu">
      <button type="button" title={title} aria-label={title} aria-expanded={open} onMouseDown={keepSelection} onClick={() => setOpen(!open)}
        className={"wr-tb" + (text ? " wr-tb-text" : wide ? " wr-tb-wide" : "") + (open ? " is-on" : "")}>
        {trigger}
      </button>
      {open && (
        <div className={"wr-pop" + (right ? " is-right" : "")} onMouseDown={(e) => { if (!(e.target as HTMLElement).closest("input,textarea")) e.preventDefault(); }}>
          {children}
        </div>
      )}
    </div>
  );
}

function Item({ onClick, active, children, hint }: { onClick: () => void; active?: boolean; children: ReactNode; hint?: string }) {
  return (
    <button type="button" className="wr-item" onClick={onClick}>
      <span>{children}{hint && <small>{hint}</small>}</span>
      {active && <span className="wr-ck"><Icon name="check" size={15} /></span>}
    </button>
  );
}

function Toggle({ on, onChange, label, hint }: { on: boolean; onChange: (v: boolean) => void; label: string; hint: string }) {
  return (
    <div className="wr-tog">
      <span>{label}<small>{hint}</small></span>
      <button type="button" role="switch" aria-checked={on} aria-label={label} className="wr-sw-btn" onClick={() => onChange(!on)} />
    </div>
  );
}

function Backdrop({ onClose, right, children }: { onClose: () => void; right?: boolean; children: ReactNode }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <div className={"wr-back-drop" + (right ? " is-right" : "")} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      {children}
    </div>
  );
}

function ModalHead({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="wr-mh">
      <h3>{title}</h3>
      <button type="button" className="wr-tb" aria-label="Close" onClick={onClose}><Icon name="x" /></button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Entry: read the saved draft first, then mount the editor once       */
/* ------------------------------------------------------------------ */

export default function LessonWriter() {
  const name = useApp((s) => s.user?.name) ?? "You";
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    let d: Partial<Draft> | null = null;
    try { d = JSON.parse(localStorage.getItem(DRAFT) ?? "null") as Partial<Draft> | null; } catch { d = null; }
    setDraft({
      title: d?.title ?? "", subtitle: d?.subtitle ?? "", html: d?.html ?? "",
      bylines: d?.bylines?.length ? d.bylines : [name],
      header: d?.header ?? "", footer: d?.footer ?? "",
      settings: { comments: d?.settings?.comments !== false, reposts: d?.settings?.reposts !== false },
    });
  }, [name]);

  if (!draft) return <div className="wr" />;
  return <Writer initial={draft} author={name} />;
}

/* ------------------------------------------------------------------ */
/*  The writer                                                         */
/* ------------------------------------------------------------------ */

function Writer({ initial, author }: { initial: Draft; author: string }) {
  const router = useRouter();
  const [title, setTitle] = useState(initial.title);
  const [subtitle, setSubtitle] = useState(initial.subtitle);
  const [html, setHtml] = useState(initial.html);
  const [bylines, setBylines] = useState(initial.bylines);
  const [header, setHeader] = useState(initial.header);
  const [footer, setFooter] = useState(initial.footer);
  const [settings, setSettings] = useState(initial.settings);

  const [menu, setMenu] = useState<string | null>(null);
  const [modal, setModal] = useState<null | "hf" | "settings" | "preview" | "continue">(null);
  const [corner, setCorner] = useState<null | "history" | "info">(null);
  const [moreSeen, setMoreSeen] = useState(false);
  const [status, setStatus] = useState<"saved" | "saving" | "error">("saved");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [toast, setToast] = useState("");
  const [uploading, setUploading] = useState(false);
  const [addingBy, setAddingBy] = useState(false);
  const [byDraft, setByDraft] = useState("");

  const [textColor, setTextColor] = useState(TEXT_COLORS[0]);
  const [hiColor, setHiColor] = useState(HILITES[0]);
  const [linkUrl, setLinkUrl] = useState("");
  const [ytUrl, setYtUrl] = useState("");
  const [btnLabel, setBtnLabel] = useState("");
  const [btnUrl, setBtnUrl] = useState("");
  const [btnVariant, setBtnVariant] = useState<"solid" | "outline">("solid");
  const [history, setHistory] = useState<Snapshot[]>([]);

  const edRef = useRef<Editor | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const subRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const kindRef = useRef<"image" | "video" | "audio">("image");
  const menuRef = useRef(setMenu);
  menuRef.current = setMenu;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastSnap = useRef(0);

  const say = useCallback((m: string) => {
    setToast(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3200);
  }, []);

  /* ----- upload ----- */
  const addFile = useCallback(async (picked: File) => {
    const ed = edRef.current;
    if (!ed) return;
    if (!anyMedia(picked)) return say("Use an image (png, jpg, gif, webp), video (mp4, webm, mov) or audio (mp3, wav, m4a, ogg) file.");
    if (!imageTypeOf(picked) && picked.size > MAX_LESSON_MEDIA_BYTES) return say("Video and audio files must be under 4 MB.");
    setUploading(true);
    try {
      let file = picked;
      if (imageTypeOf(picked)) {
        try { file = await prepareLessonImage(picked); }
        catch (err) { return say(err instanceof ImageError ? err.message : "That image could not be read."); }
      }
      const fd = new FormData(); fd.append("file", file);
      const r = await fetch("/api/lessons/media", { method: "POST", body: fd }).catch(() => null);
      if (!r) return say("Upload failed — check your connection and try again.");
      if (!r.ok) {
        const code = ((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "";
        return say(r.status === 413 ? "That file is too large to upload." : ERR_TEXT[code] ?? `Upload failed (${r.status}). Try again.`);
      }
      const d = (await r.json()) as { url: string; kind: "image" | "video" | "audio" };
      ed.chain().focus().insertContent([{ type: d.kind, attrs: { src: d.url } }, { type: "paragraph" }]).run();
    } finally {
      setUploading(false);
    }
  }, [say]);
  const filesOf = (list?: FileList | null) => [...(list ?? [])].filter(anyMedia);
  const pick = (kind: "image" | "video" | "audio") => {
    kindRef.current = kind;
    if (fileRef.current) {
      fileRef.current.accept = kind === "image" ? "image/*" : kind === "video" ? "video/mp4,video/webm,video/quicktime" : "audio/mpeg,audio/wav,audio/mp4,audio/x-m4a,audio/ogg";
      fileRef.current.click();
    }
    setMenu(null);
  };

  /* ----- editor ----- */
  const ed = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    autofocus: true,
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: true } }),
      TextStyle, Color, Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Image, Youtube.configure({ width: 640, height: 360 }), Video, Audio, CtaButton,
      Placeholder.configure({ placeholder: "Start writing…" }),
    ],
    content: initial.html,
    editorProps: {
      attributes: { class: "lesson-prose wr-editor" },
      handlePaste: (_v, e) => { const f = filesOf(e.clipboardData?.files); f.forEach((x) => void addFile(x)); return f.length > 0; },
      handleDrop: (_v, e) => { const f = filesOf((e as DragEvent).dataTransfer?.files); f.forEach((x) => void addFile(x)); return f.length > 0; },
      handleKeyDown: (_v, e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); menuRef.current("link"); return true; }
        return false;
      },
    },
    onCreate: ({ editor }) => { edRef.current = editor; },
    onUpdate: ({ editor }) => setHtml(editor.getHTML()),
  });

  /* ----- title / subtitle ----- */
  const grow = (el: HTMLTextAreaElement | null) => { if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } };
  useEffect(() => grow(titleRef.current), [title]);
  useEffect(() => grow(subRef.current), [subtitle]);

  /* ----- autosave + version history ----- */
  const words = ed ? ed.getText().split(/\s+/).filter(Boolean).length : 0;
  const snapshot = useCallback((force = false) => {
    const now = Date.now();
    if (!force && now - lastSnap.current < 45_000) return false;
    const h = readHistory();
    if (!force && h[0] && h[0].html === html && h[0].title === title) return false;
    const next = [{ at: now, title, subtitle, html, words }, ...h].slice(0, 20);
    try { localStorage.setItem(HISTORY, JSON.stringify(next)); } catch { return false; }
    lastSnap.current = now;
    return true;
  }, [html, title, subtitle, words]);

  useEffect(() => {
    if (!(title || subtitle || html.replace(/<[^>]+>/g, "").trim() || header || footer)) return;
    setStatus("saving");
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        const d: Draft = { title, subtitle, html, bylines, header, footer, settings };
        localStorage.setItem(DRAFT, JSON.stringify(d));
        if (title || words > 0) snapshot();
        setStatus("saved");
      } catch { setStatus("error"); }
    }, 500);
    return () => clearTimeout(saveTimer.current);
    // snapshot is intentionally excluded: it changes with html and would restart the timer twice
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, subtitle, html, bylines, header, footer, settings]);

  useEffect(() => { if (corner === "history") setHistory(readHistory()); }, [corner]);
  useEffect(() => {
    if (menu === "link" && ed) setLinkUrl((ed.getAttributes("link").href as string | undefined) ?? "");
  }, [menu, ed]);

  if (!ed) return <div className="wr" />;

  const c = () => ed.chain().focus();
  const align = (["left", "center", "right", "justify"] as const).find((a) => ed.isActive({ textAlign: a })) ?? "left";
  const alignIcon = ("align" + align[0].toUpperCase() + align.slice(1)) as IconName;
  const open = (name: string) => ({ open: menu === name, setOpen: (v: boolean) => setMenu(v ? name : null) });

  const applyLink = () => {
    const href = cleanUrl(linkUrl);
    if (!href) { c().extendMarkRange("link").unsetLink().run(); setMenu(null); return; }
    if (ed.state.selection.empty && !ed.isActive("link")) {
      c().insertContent({ type: "text", text: href, marks: [{ type: "link", attrs: { href } }] }).run();
    } else {
      c().extendMarkRange("link").setLink({ href }).run();
    }
    setMenu(null);
  };
  const embedYoutube = () => {
    if (!ytUrl.trim()) return;
    const ok = c().setYoutubeVideo({ src: cleanUrl(ytUrl) }).run();
    if (!ok) return say("That doesn’t look like a YouTube link.");
    c().insertContent({ type: "paragraph" }).run();
    setYtUrl(""); setMenu(null);
  };
  const insertButton = () => {
    const href = cleanUrl(btnUrl);
    if (!btnLabel.trim() || !href) return say("Add the button text and a link.");
    c().insertContent([{ type: "ctaButton", attrs: { href, label: btnLabel.trim().slice(0, 60), variant: btnVariant } }, { type: "paragraph" }]).run();
    setBtnLabel(""); setBtnUrl(""); setMenu(null);
  };
  const toggleText = () => (ed.isActive("textStyle", { color: textColor }) ? c().unsetColor().run() : c().setColor(textColor).run());
  const toggleHi = () => (ed.isActive("highlight", { color: hiColor }) ? c().unsetHighlight().run() : c().setHighlight({ color: hiColor }).run());
  const insertTemplate = (html: string) => { c().insertContent(html).run(); setMenu(null); };

  const addByline = () => {
    const v = byDraft.trim().slice(0, 60);
    if (v && !bylines.includes(v) && bylines.length < 5) setBylines([...bylines, v]);
    setByDraft(""); setAddingBy(false);
  };

  const restore = (s: Snapshot) => {
    snapshot(true);
    setTitle(s.title); setSubtitle(s.subtitle);
    ed.commands.setContent(s.html, { emitUpdate: true });
    setCorner(null);
    say("Version restored.");
  };

  const finalHtml = compose(html, header, footer);
  const hasBody = ed.getText().trim().length > 0;
  const images = (html.match(/<img /g) ?? []).length;
  const readMins = Math.max(1, Math.ceil(words / 200));
  const byline = bylines.length ? bylines.join(", ") : author;

  const publish = async () => {
    if (!title.trim()) return setErr("Add a title first.");
    setBusy(true); setErr("");
    const r = await fetch("/api/lessons", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create", title, subtitle, html: finalHtml, bylines, settings }),
    }).catch(() => null);
    const d = (await r?.json().catch(() => ({}))) as { id?: string; error?: string } | undefined;
    setBusy(false);
    if (!r?.ok || !d?.id) return setErr(
      r?.status === 413 ? "This lesson is too long to publish."
      : r?.status === 401 ? "You're signed out. Sign in again, then publish."
      : d?.error === "rate_limited" ? "You're publishing too fast. Wait a bit and retry."
      : d?.error === "storage_unavailable" ? "Lessons storage isn't reachable right now. Try again in a moment."
      : "Couldn’t publish. Check your connection and try again.");
    localStorage.removeItem(DRAFT);
    router.push(`/lessons/${d.id}`);
  };

  const ago = (t: number) => {
    const m = Math.round((Date.now() - t) / 60000);
    return m < 1 ? "Just now" : m < 60 ? `${m} min ago` : new Date(t).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
  };

  return (
    <div className="wr">
      {/* ---------- top ---------- */}
      <div className="wr-top">
        <div className="wr-topbar">
          <div className="wr-left">
            <button type="button" className="wr-back" aria-label="Back to Lessons" onClick={() => router.push("/lessons")}><Icon name="chevronLeft" size={20} /></button>
            <span className={"wr-saved" + (status === "saving" ? " is-saving" : status === "error" ? " is-error" : "")}>
              <i />{status === "saving" ? "Saving…" : status === "error" ? "Not saved" : "Saved"}
            </span>
          </div>
          <div className="wr-right">
            <button type="button" className="wr-pill" onClick={() => setModal("preview")}>Preview</button>
            <button type="button" className="wr-pill is-orange" onClick={() => { setErr(""); setModal("continue"); }}>Continue</button>
          </div>
        </div>

        <div className="wr-toolbar" role="toolbar" aria-label="Formatting">
          <Tb title="Undo" onClick={() => c().undo().run()} disabled={!ed.can().undo()}><Icon name="undo" /></Tb>
          <Tb title="Redo" onClick={() => c().redo().run()} disabled={!ed.can().redo()}><Icon name="redo" /></Tb>
          <span className="wr-sep" />

          <Menu {...open("style")} title="Text style" text trigger={<>Style<Caret /></>}>
            <Item active={ed.isActive("paragraph") && !ed.isActive("blockquote")} onClick={() => { c().setParagraph().run(); setMenu(null); }}>Paragraph</Item>
            <Item active={ed.isActive("heading", { level: 2 })} onClick={() => { c().toggleHeading({ level: 2 }).run(); setMenu(null); }}><b style={{ fontSize: 17, fontFamily: "var(--wr-serif)" }}>Heading</b></Item>
            <Item active={ed.isActive("heading", { level: 3 })} onClick={() => { c().toggleHeading({ level: 3 }).run(); setMenu(null); }}><b style={{ fontSize: 15, fontFamily: "var(--wr-serif)" }}>Subheading</b></Item>
            <Item active={ed.isActive("blockquote")} onClick={() => { c().toggleBlockquote().run(); setMenu(null); }}><i style={{ fontFamily: "var(--wr-serif)" }}>Quote</i></Item>
            <Item active={ed.isActive("codeBlock")} onClick={() => { c().toggleCodeBlock().run(); setMenu(null); }}><code>Code block</code></Item>
          </Menu>
          <span className="wr-sep" />

          <Tb title="Bold (Ctrl+B)" active={ed.isActive("bold")} onClick={() => c().toggleBold().run()}><Icon name="bold" /></Tb>
          <Tb title="Italic (Ctrl+I)" active={ed.isActive("italic")} onClick={() => c().toggleItalic().run()}><Icon name="italic" /></Tb>
          <Tb title="Strikethrough" active={ed.isActive("strike")} onClick={() => c().toggleStrike().run()}><Icon name="strike" /></Tb>
          <Tb title="Inline code" active={ed.isActive("code")} onClick={() => c().toggleCode().run()}><Icon name="code" /></Tb>
          <Tb title="Text colour" active={ed.isActive("textStyle", { color: textColor })} onClick={toggleText}><Icon name="textColor" /><span className="wr-uline" style={{ background: textColor }} /></Tb>
          <Tb title="Highlight" active={ed.isActive("highlight", { color: hiColor })} onClick={toggleHi}><Icon name="highlighter" /><span className="wr-uline" style={{ background: hiColor }} /></Tb>
          <Menu {...open("colors")} title="Colours" wide trigger={<><Icon name="colorA" /><Caret /></>}>
            <div className="wr-label">Text colour</div>
            <div className="wr-swatches">
              {TEXT_COLORS.map((col) => (
                <button key={col} type="button" aria-label={`Text ${col}`} className={"wr-sw" + (textColor === col && ed.isActive("textStyle", { color: col }) ? " is-on" : "")} style={{ background: col }}
                  onClick={() => { setTextColor(col); c().setColor(col).run(); setMenu(null); }} />
              ))}
            </div>
            <Item onClick={() => { c().unsetColor().run(); setMenu(null); }}>Default colour</Item>
            <div className="wr-label">Highlight</div>
            <div className="wr-swatches">
              {HILITES.map((col) => (
                <button key={col} type="button" aria-label={`Highlight ${col}`} className={"wr-sw" + (hiColor === col && ed.isActive("highlight", { color: col }) ? " is-on" : "")} style={{ background: col }}
                  onClick={() => { setHiColor(col); c().setHighlight({ color: col }).run(); setMenu(null); }} />
              ))}
            </div>
            <Item onClick={() => { c().unsetHighlight().run(); setMenu(null); }}>No highlight</Item>
          </Menu>
          <span className="wr-sep" />

          <Menu {...open("link")} title="Link (Ctrl+K)" trigger={<Icon name="link" />}>
            <form className="wr-form" onSubmit={(e) => { e.preventDefault(); applyLink(); }}>
              <input className="wr-input" autoFocus placeholder="Paste or type a link" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
              <div className="wr-row">
                <button type="submit" className="wr-mini is-orange">{ed.isActive("link") ? "Update" : "Add link"}</button>
                {ed.isActive("link") && <button type="button" className="wr-mini" onClick={() => { c().extendMarkRange("link").unsetLink().run(); setMenu(null); }}>Remove</button>}
              </div>
            </form>
          </Menu>
          <Tb title="Image" onClick={() => pick("image")}><Icon name="image" /></Tb>
          <Tb title="Audio" onClick={() => pick("audio")}><Icon name="headphones" /></Tb>
          <Menu {...open("video")} title="Video" trigger={<Icon name="video" />}>
            <Item onClick={() => pick("video")}>Upload a video<small>mp4, webm or mov, up to 50 MB</small></Item>
            <div className="wr-label">Or embed from YouTube</div>
            <form className="wr-form" onSubmit={(e) => { e.preventDefault(); embedYoutube(); }}>
              <input className="wr-input" placeholder="https://youtube.com/watch?v=…" value={ytUrl} onChange={(e) => setYtUrl(e.target.value)} />
              <button type="submit" className="wr-mini is-orange">Embed</button>
            </form>
          </Menu>
          <Tb title="Quote" active={ed.isActive("blockquote")} onClick={() => c().toggleBlockquote().run()}><Icon name="quote" /></Tb>
          <span className="wr-sep" />

          <Tb title="Bulleted list" active={ed.isActive("bulletList")} onClick={() => c().toggleBulletList().run()}><Icon name="listUl" /></Tb>
          <Tb title="Numbered list" active={ed.isActive("orderedList")} onClick={() => c().toggleOrderedList().run()}><Icon name="listOl" /></Tb>
          <Menu {...open("align")} title="Alignment" wide trigger={<><Icon name={alignIcon} /><Caret /></>}>
            {(["left", "center", "right", "justify"] as const).map((a) => (
              <Item key={a} active={align === a} onClick={() => { c().setTextAlign(a).run(); setMenu(null); }}>{a[0].toUpperCase() + a.slice(1)}</Item>
            ))}
          </Menu>
          <span className="wr-sep" />

          <Menu {...open("button")} title="Insert button" text trigger={<>Button<Caret /></>}>
            <form className="wr-form" onSubmit={(e) => { e.preventDefault(); insertButton(); }}>
              <input className="wr-input" placeholder="Button text" value={btnLabel} onChange={(e) => setBtnLabel(e.target.value)} />
              <input className="wr-input" placeholder="https://…" value={btnUrl} onChange={(e) => setBtnUrl(e.target.value)} />
              <div className="wr-seg">
                <button type="button" className={btnVariant === "solid" ? "is-on" : ""} onClick={() => setBtnVariant("solid")}>Solid</button>
                <button type="button" className={btnVariant === "outline" ? "is-on" : ""} onClick={() => setBtnVariant("outline")}>Outline</button>
              </div>
              <button type="submit" className="wr-mini is-orange">Insert button</button>
            </form>
          </Menu>
          <span className="wr-sep" />
          <Menu {...open("template")} title="Templates" text trigger={<>Template<Caret /></>}>
            {TEMPLATES.map((t) => <Item key={t.name} hint={t.hint} onClick={() => insertTemplate(t.html)}>{t.name}</Item>)}
          </Menu>
          <span className="wr-sep" />
          <Menu open={menu === "more"} setOpen={(v) => { setMenu(v ? "more" : null); if (v) setMoreSeen(true); }} title="More" text right
            trigger={<><span style={{ position: "relative" }}>More{!moreSeen && <span className="wr-dot" />}</span><Caret /></>}>
            <Item active={ed.isActive("underline")} onClick={() => { c().toggleUnderline().run(); setMenu(null); }}>Underline</Item>
            <Item onClick={() => { c().setHorizontalRule().run(); setMenu(null); }}>Divider</Item>
            <Item active={ed.isActive("codeBlock")} onClick={() => { c().toggleCodeBlock().run(); setMenu(null); }}>Code block</Item>
            <Item onClick={() => { c().unsetAllMarks().clearNodes().run(); setMenu(null); }}>Clear formatting</Item>
          </Menu>
        </div>
      </div>

      {/* ---------- page ---------- */}
      <div className="wr-scroll">
        <div className="wr-col">
          <button type="button" className={"wr-hf" + (header.trim() || footer.trim() ? " has-content" : "")} onClick={() => setModal("hf")}>
            <Icon name="headerFooter" size={15} />Email header / footer
          </button>

          <textarea ref={titleRef} rows={1} className="wr-title" placeholder="Title" aria-label="Title" value={title} maxLength={200}
            onChange={(e) => setTitle(e.target.value.replace(/\n/g, " "))}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); subRef.current?.focus(); } }} />
          <textarea ref={subRef} rows={1} className="wr-subtitle" placeholder="Add a subtitle…" aria-label="Subtitle" value={subtitle} maxLength={300}
            onChange={(e) => setSubtitle(e.target.value.replace(/\n/g, " "))}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ed.commands.focus("start"); } }} />

          <div className="wr-bylines">
            {bylines.map((b) => (
              <span key={b} className="wr-chip">{b}
                <button type="button" aria-label={`Remove ${b}`} onClick={() => setBylines(bylines.filter((x) => x !== b))}><Icon name="x" size={9} /></button>
              </span>
            ))}
            {addingBy ? (
              <input autoFocus className="wr-byin" placeholder="Add a name" value={byDraft} maxLength={60} onChange={(e) => setByDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addByline(); if (e.key === "Escape") { setByDraft(""); setAddingBy(false); } }} onBlur={addByline} />
            ) : bylines.length < 5 && (
              <button type="button" className="wr-add" aria-label="Add a byline" onClick={() => setAddingBy(true)}><Icon name="plus" size={15} /></button>
            )}
          </div>

          <div className="wr-body"><EditorContent editor={ed} /></div>
        </div>
      </div>

      <input ref={fileRef} type="file" hidden
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void addFile(f); e.target.value = ""; }} />

      {/* ---------- corners ---------- */}
      <div className="wr-corner is-l">
        <div style={{ position: "relative" }}>
          <button type="button" className={"wr-sq" + (corner === "history" ? " is-on" : "")} aria-label="Version history" onClick={() => setCorner(corner === "history" ? null : "history")}><Icon name="history" /></button>
          {corner === "history" && (
            <div className="wr-panel">
              <h4>Version history</h4>
              <button type="button" className="wr-mini is-orange" style={{ margin: "0 6px 8px" }} onClick={() => { snapshot(true); setHistory(readHistory()); say("Version saved."); }}>Save version now</button>
              {history.length === 0 && <p className="wr-note" style={{ margin: "6px" }}>Versions are saved automatically as you write.</p>}
              {history.map((s) => (
                <Item key={s.at} hint={`${s.words} words`} onClick={() => restore(s)}>{s.title || "Untitled"} · {ago(s.at)}</Item>
              ))}
            </div>
          )}
        </div>
        <div style={{ position: "relative" }}>
          <button type="button" className={"wr-sq" + (corner === "info" ? " is-on" : "")} aria-label="Info and shortcuts" onClick={() => setCorner(corner === "info" ? null : "info")}><Icon name="info" /></button>
          {corner === "info" && (
            <div className="wr-panel">
              <h4>This lesson</h4>
              <div className="wr-stat"><span>Words</span><b>{words}</b></div>
              <div className="wr-stat"><span>Characters</span><b>{ed.getText().length}</b></div>
              <div className="wr-stat"><span>Reading time</span><b>{readMins} min</b></div>
              <div className="wr-stat"><span>Images</span><b>{images}</b></div>
              <hr className="wr-hr" />
              <h4>Shortcuts</h4>
              <div className="wr-kbd"><span>Bold</span><kbd>Ctrl B</kbd></div>
              <div className="wr-kbd"><span>Italic</span><kbd>Ctrl I</kbd></div>
              <div className="wr-kbd"><span>Link</span><kbd>Ctrl K</kbd></div>
              <div className="wr-kbd"><span>Undo / Redo</span><kbd>Ctrl Z / Ctrl Shift Z</kbd></div>
              <div className="wr-kbd"><span>Heading</span><kbd>Ctrl Alt 2</kbd></div>
              <div className="wr-kbd"><span>Bulleted list</span><kbd>Ctrl Shift 8</kbd></div>
              <div className="wr-kbd"><span>Paste or drop</span><kbd>images, video, audio</kbd></div>
            </div>
          )}
        </div>
      </div>
      <div className="wr-corner is-r">
        <button type="button" className="wr-set" onClick={() => setModal("settings")}><Icon name="settings" size={16} />Settings</button>
      </div>

      {uploading && <div className="wr-toast">Uploading…</div>}
      {!uploading && toast && <div className="wr-toast" role="status">{toast}</div>}

      {/* ---------- header / footer ---------- */}
      {modal === "hf" && (
        <Backdrop onClose={() => setModal(null)}>
          <div className="wr-modal" role="dialog" aria-label="Header and footer">
            <ModalHead title="Header & footer" onClose={() => setModal(null)} />
            <p className="wr-note">Optional notes that frame the lesson. The header sits above the text and the footer closes it.</p>
            <div className="wr-label" style={{ padding: "0 0 4px" }}>Header</div>
            <textarea className="wr-area" value={header} maxLength={400} placeholder="e.g. Part 2 of my risk series" onChange={(e) => setHeader(e.target.value)} />
            <div className="wr-label" style={{ padding: "12px 0 4px" }}>Footer</div>
            <textarea className="wr-area" value={footer} maxLength={400} placeholder="e.g. Questions? Drop a comment below." onChange={(e) => setFooter(e.target.value)} />
            <div className="wr-actions"><button type="button" className="wr-pill is-orange" onClick={() => setModal(null)}>Done</button></div>
          </div>
        </Backdrop>
      )}

      {/* ---------- settings ---------- */}
      {modal === "settings" && (
        <Backdrop onClose={() => setModal(null)} right>
          <div className="wr-drawer" role="dialog" aria-label="Lesson settings">
            <ModalHead title="Settings" onClose={() => setModal(null)} />
            <Toggle on={settings.comments} onChange={(v) => setSettings({ ...settings, comments: v })} label="Allow comments" hint="Friends can reply under this lesson." />
            <Toggle on={settings.reposts} onChange={(v) => setSettings({ ...settings, reposts: v })} label="Allow reposts" hint="Friends can repost this lesson to their circle." />
            <div className="wr-tog" style={{ display: "block" }}>
              <span>Visibility<small>Lessons are shown to you and your accepted friends only.</small></span>
            </div>
          </div>
        </Backdrop>
      )}

      {/* ---------- continue ---------- */}
      {modal === "continue" && (
        <Backdrop onClose={() => setModal(null)}>
          <div className="wr-modal" role="dialog" aria-label="Ready to publish">
            <ModalHead title="Ready to publish?" onClose={() => setModal(null)} />
            <div className="wr-stat"><span>Title</span><b style={{ maxWidth: 260, textAlign: "right" }}>{title.trim() || "Missing"}</b></div>
            <div className="wr-stat"><span>By</span><b>{byline}</b></div>
            <div className="wr-stat"><span>Length</span><b>{words} words · {readMins} min read</b></div>
            <div className="wr-stat"><span>Comments / reposts</span><b>{settings.comments ? "On" : "Off"} / {settings.reposts ? "On" : "Off"}</b></div>
            {!title.trim() && <p className="wr-err">A lesson needs a title before it can be published.</p>}
            {title.trim() && !hasBody && <p className="wr-err" style={{ color: "var(--wr-muted)" }}>The lesson has no text yet. You can still publish it.</p>}
            {err && <p className="wr-err">{err}</p>}
            <div className="wr-actions">
              <button type="button" className="wr-pill" onClick={() => setModal("settings")}>Settings</button>
              <button type="button" className="wr-pill" onClick={() => setModal(null)}>Keep editing</button>
              <button type="button" className="wr-pill is-orange" disabled={busy || !title.trim()} onClick={publish}>{busy ? "Publishing…" : "Publish now"}</button>
            </div>
          </div>
        </Backdrop>
      )}

      {/* ---------- preview ---------- */}
      {modal === "preview" && (
        <div className="wr-preview" role="dialog" aria-label="Preview">
          <div className="wr-preview-bar">
            <span>Preview — this is how your lesson will read</span>
            <button type="button" className="wr-pill" onClick={() => setModal(null)}>Close</button>
          </div>
          <article className="wr-article">
            <h1>{title.trim() || "Untitled"}</h1>
            {subtitle.trim() && <p className="sub">{subtitle}</p>}
            <p className="by">{byline} · {new Date().toLocaleDateString()} · {readMins} min read</p>
            <div className="lesson-prose" dangerouslySetInnerHTML={{ __html: finalHtml }} />
          </article>
        </div>
      )}
    </div>
  );
}
