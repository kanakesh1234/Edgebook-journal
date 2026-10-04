import "server-only";
import sanitizeHtml from "sanitize-html";
import type { Block } from "./lessons-store";

const COLOR = /^(#[0-9a-f]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\))$/i;

/** Friends' content is rendered as HTML, so everything is cleaned here before it is stored. */
export function cleanHtml(dirty: string): string {
  return sanitizeHtml(dirty, {
    allowedTags: ["p", "h2", "h3", "strong", "em", "u", "s", "code", "pre", "blockquote", "ul", "ol", "li", "hr", "br", "a", "img", "video", "audio", "iframe", "span", "mark"],
    allowedAttributes: {
      "*": ["style"],
      a: ["href", "target", "rel", "class"], p: ["class"], mark: ["data-color"],
      img: ["src", "alt"], video: ["src", "controls"], audio: ["src", "controls"], iframe: ["src", "allowfullscreen"],
    },
    // Only colour and alignment survive from inline styles; button styling comes from two fixed class names.
    allowedStyles: {
      "*": {
        color: [COLOR, /^inherit$/],
        "background-color": [COLOR],
        "text-align": [/^(left|center|right|justify)$/],
      },
    },
    allowedClasses: { a: ["lesson-btn", "lesson-btn-outline"], p: ["lesson-btn-wrap"] },
    allowedSchemes: ["http", "https", "mailto"],
    allowedIframeHostnames: ["www.youtube.com", "www.youtube-nocookie.com"],
    transformTags: { a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }) },
    // Images and videos must be files uploaded through Lessons.
    exclusiveFilter: (f) =>
      ((f.tag === "img" || f.tag === "video" || f.tag === "audio") && !/^\/api\/lessons\/media\?id=[a-z0-9]+\.(png|jpg|gif|webp|mp4|webm|mov|mp3|wav|m4a|ogg)$/.test(f.attribs.src ?? "")) ||
      (f.tag === "iframe" && !f.attribs.src),
  });
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Lessons saved by the first version (block list) are shown through the same renderer. */
export function blocksToHtml(blocks: Block[]): string {
  return blocks.map((b) => {
    if (b.t === "text") return b.v.split(/\n{2,}/).map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
    if (b.t === "image") return `<img src="${esc(b.v)}">`;
    const yt = b.v.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{11})/);
    return yt ? `<iframe src="https://www.youtube.com/embed/${yt[1]}" allowfullscreen></iframe>` : `<video src="${esc(b.v)}" controls></video>`;
  }).join("");
}

export const textOf = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ").trim();
export const coverOf = (html: string) => html.match(/<img[^>]+src="([^"]+)"/)?.[1] ?? null;
export const readMinutes = (html: string) => Math.max(1, Math.ceil(textOf(html).split(" ").filter(Boolean).length / 200));

const decode = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&amp;/g, "&");

/**
 * One short line from the start of the lesson, shown while scrolling the feed so people
 * know what they are about to read. Uses the first real sentence of the body (headings,
 * paragraphs, quotes, list items), skipping images and empty blocks. Returns "" when
 * the body has no text, so callers can fall back to the subtitle.
 */
export function hookOf(html: string, max = 110): string {
  // Body text makes a better hook than a heading, so headings are only a fallback.
  const grab = (tags: string) => html.match(new RegExp(`<(${tags})\\b[^>]*>[\\s\\S]*?<\\/\\1>`, "gi")) ?? [];
  for (const block of [...grab("p|blockquote|li"), ...grab("h2|h3")]) {
    const text = decode(textOf(block));
    if (text.replace(/[^\p{L}\p{N}]/gu, "").length < 3) continue;
    const sentences = text.match(/[^.!?]+(?:[.!?]+(?=\s|$)|$)/g) ?? [text];
    let hook = "";
    for (const raw of sentences) {
      const s = raw.trim();
      if (!s) continue;
      if (hook && (hook + " " + s).length > max) break;
      hook = hook ? hook + " " + s : s;
      if (hook.length >= 60) break; // long enough to intrigue; stop here
    }
    if (hook.length > max) hook = hook.slice(0, max).replace(/\s+\S*$/, "").replace(/[,;:\-–—\s]+$/, "") + "…";
    return hook;
  }
  return "";
}
