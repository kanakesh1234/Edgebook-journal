import { Node } from "@tiptap/core";

/** Uploaded video files (YouTube links use the Youtube extension). */
export const Video = Node.create({
  name: "video", group: "block", atom: true, draggable: true,
  addAttributes: () => ({ src: { default: null } }),
  parseHTML: () => [{ tag: "video" }],
  renderHTML: ({ HTMLAttributes }) => ["video", { ...HTMLAttributes, controls: "true" }],
});

/** Uploaded audio files (mp3, wav, m4a, ogg). */
export const Audio = Node.create({
  name: "audio", group: "block", atom: true, draggable: true,
  addAttributes: () => ({ src: { default: null } }),
  parseHTML: () => [{ tag: "audio" }],
  renderHTML: ({ HTMLAttributes }) => ["audio", { ...HTMLAttributes, controls: "true" }],
});

/** Call-to-action button: a centred link styled as a button. */
export const CtaButton = Node.create({
  name: "ctaButton", group: "block", atom: true, draggable: true, selectable: true,
  addAttributes: () => ({ href: { default: "" }, label: { default: "Button" }, variant: { default: "solid" } }),
  parseHTML: () => [{
    tag: "p.lesson-btn-wrap",
    priority: 200,
    getAttrs: (el) => {
      const a = (el as HTMLElement).querySelector("a");
      if (!a) return false;
      return { href: a.getAttribute("href") ?? "", label: a.textContent || "Button", variant: a.classList.contains("lesson-btn-outline") ? "outline" : "solid" };
    },
  }],
  renderHTML: ({ node }) => [
    "p", { class: "lesson-btn-wrap" },
    ["a", {
      href: node.attrs.href,
      class: "lesson-btn" + (node.attrs.variant === "outline" ? " lesson-btn-outline" : ""),
      target: "_blank", rel: "noopener noreferrer",
    }, node.attrs.label],
  ],
});
