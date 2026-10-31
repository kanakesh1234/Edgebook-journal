"use client";

import { useEffect, useRef } from "react";
import { parseTip } from "./tip-parse";

/**
 * One tooltip for the whole workspace — replaces native `title` tooltips.
 *
 * Usage: add `data-tip="Label"` or `data-tip="Label (Alt+T)"` to any element inside `.tv-root`.
 *  · a trailing "(…)" that looks like a shortcut becomes `kbd` chips (override with data-tip-kbd)
 *  · data-tip-side="right|left|top|bottom" (default bottom)
 *  · shows after 450ms on hover (80ms when moving between neighbours), immediately on keyboard focus
 *  · one delegated listener set, no per-element React state → zero re-renders while replaying
 */

const GAP = 8;

export default function TooltipLayer() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tip = ref.current;
    if (!tip) return;
    const labelEl = tip.querySelector<HTMLElement>(".ej-tip-l")!;
    const keysEl = tip.querySelector<HTMLElement>(".ej-tip-k")!;
    let timer = 0;
    let cur: HTMLElement | null = null;
    let lastShown = 0;

    const hide = () => {
      window.clearTimeout(timer);
      cur = null;
      tip.classList.remove("is-on");
    };

    const place = (target: HTMLElement) => {
      let side = target.dataset.tipSide ?? "bottom";
      const rr = target.getBoundingClientRect();
      if (side === "auto-h") side = rr.top + rr.height / 2 > window.innerHeight / 2 ? "top" : "bottom";
      else if (side === "auto-v") side = rr.left + rr.width / 2 > window.innerWidth / 2 ? "left" : "right";
      const r = target.getBoundingClientRect();
      const w = tip.offsetWidth, h = tip.offsetHeight;
      let x = 0, y = 0;
      if (side === "right") { x = r.right + GAP; y = r.top + r.height / 2 - h / 2; }
      else if (side === "left") { x = r.left - GAP - w; y = r.top + r.height / 2 - h / 2; }
      else if (side === "top") { x = r.left + r.width / 2 - w / 2; y = r.top - GAP - h; }
      else { x = r.left + r.width / 2 - w / 2; y = r.bottom + GAP; }
      // never clip
      x = Math.max(8, Math.min(window.innerWidth - w - 8, x));
      y = Math.max(8, Math.min(window.innerHeight - h - 8, y));
      tip.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
      tip.dataset.side = side;
    };

    const show = (target: HTMLElement) => {
      if (!target.isConnected) return;
      const raw = target.dataset.tip;
      if (!raw) return;
      const { label, keys } = parseTip(raw, target.dataset.tipKbd);
      labelEl.textContent = label;
      keysEl.replaceChildren(...keys.map((k) => { const el = document.createElement("kbd"); el.textContent = k; return el; }));
      keysEl.style.display = keys.length ? "" : "none";
      place(target);
      tip.classList.add("is-on");
      lastShown = performance.now();
    };

    const find = (n: EventTarget | null): HTMLElement | null => {
      const el = n instanceof Element ? n.closest<HTMLElement>("[data-tip]") : null;
      return el && el.closest(".tv-root") ? el : null;
    };

    const onOver = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const t = find(e.target);
      if (t === cur) return;
      hide();
      if (!t) return;
      cur = t;
      const warm = performance.now() - lastShown < 500 && tip.classList.contains("is-on");
      timer = window.setTimeout(() => show(t), warm ? 80 : 450);
    };
    const onDown = () => hide();
    const onFocus = (e: FocusEvent) => {
      const t = find(e.target);
      if (!t || !t.matches(":focus-visible")) return;
      hide(); cur = t;
      timer = window.setTimeout(() => show(t), 120);
    };
    const onBlur = () => hide();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") hide(); };

    document.addEventListener("pointerover", onOver, true);
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("focusin", onFocus, true);
    document.addEventListener("focusout", onBlur, true);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("resize", hide);
    window.addEventListener("blur", hide);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("pointerover", onOver, true);
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("focusin", onFocus, true);
      document.removeEventListener("focusout", onBlur, true);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("resize", hide);
      window.removeEventListener("blur", hide);
    };
  }, []);

  return (
    <div ref={ref} className="ej-tip" role="tooltip" aria-hidden="true">
      <span className="ej-tip-l" />
      <span className="ej-tip-k" />
    </div>
  );
}
