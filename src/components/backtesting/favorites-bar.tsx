"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useBacktest } from "@/lib/backtesting/store";
import { getUiPrefs, reorder, resetFavorites, setFavUI, setFavorites, useUiPrefs } from "@/lib/backtesting/ui-prefs";
import { haptic } from "@/lib/haptics";
import { I } from "./tv-icons";
import { toast } from "./ej-toast";
import { toggleFavorite } from "./left-toolbar";
import { ITEM_BY_TOOL, isCursorTool } from "./tool-catalog";
import { onMenuKeyDown, focusFirstItem } from "./tv-ui";
import { DEFAULT_FRAC, avoidObstacles, fracToXY, snapXY, travel, xyToFrac, type Box, type Insets } from "./fav-geometry";

/** Space the chart reserves for its price scale (right) and time scale (bottom). */
const INSETS: Insets = { l: 0, t: 0, r: 76, b: 32 };
const OBSTACLES = ".tv-legend, .tv-replay, .tv-ticket, .tv-dtb, .tv-rtbanner";

function useMounted(on: boolean, ms: number) {
  const [mounted, setMounted] = useState(on);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (on) { setMounted(true); const id = requestAnimationFrame(() => setShown(true)); return () => cancelAnimationFrame(id); }
    setShown(false);
    const id = window.setTimeout(() => setMounted(false), ms);
    return () => window.clearTimeout(id);
  }, [on, ms]);
  return { mounted, shown };
}

type Pop = { kind: "menu" | "item"; x: number; y: number; tool?: string };

/** Floating favorites palette: hidden by default, editable, draggable, edge-snapping, auto-dimming. */
export default function FavoritesBar() {
  const visible = useUiPrefs((p) => p.fav.visible);
  const vertical = useUiPrefs((p) => p.fav.vertical);
  const compact = useUiPrefs((p) => p.fav.compact);
  const autoHide = useUiPrefs((p) => p.fav.autoHide);
  const pos = useUiPrefs((p) => p.fav.pos);
  const favTools = useUiPrefs((p) => p.favTools);
  const tool = useBacktest((s) => s.activeDrawingTool);
  const setTool = useBacktest((s) => s.setActiveDrawingTool);

  const { mounted, shown } = useMounted(visible, 200);
  const barRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const cur = useRef({ x: 0, y: 0 });
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [pop, setPop] = useState<Pop | null>(null);
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);

  const known = favTools.filter((t) => ITEM_BY_TOOL.has(t));
  const order = dragOrder ?? known;
  const toolActive = !!tool && tool !== "cursor" && !isCursorTool(tool);
  const dim = autoHide && !hover && !focus && !dragging && !toolActive && !pop;

  /* ----------------------------- placement ----------------------------- */
  const metrics = useCallback(() => {
    const el = barRef.current, stage = el?.offsetParent as HTMLElement | null;
    if (!el || !stage) return null;
    const w = el.offsetWidth, h = el.offsetHeight;
    return { el, stage, w, h, tr: travel(stage.clientWidth, stage.clientHeight, w, h, INSETS) };
  }, []);

  const obstacles = useCallback((stage: HTMLElement): Box[] => {
    const s = stage.getBoundingClientRect();
    return Array.from(stage.querySelectorAll<HTMLElement>(OBSTACLES)).map((o) => {
      const r = o.getBoundingClientRect();
      return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height };
    }).filter((b) => b.w > 0 && b.h > 0);
  }, []);

  const apply = useCallback((x: number, y: number) => {
    cur.current = { x, y };
    if (barRef.current) barRef.current.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
  }, []);

  const place = useCallback(() => {
    const m = metrics();
    if (!m) return;
    const p = fracToXY(getUiPrefs().fav.pos ?? DEFAULT_FRAC, m.tr);
    const a = avoidObstacles({ x: p.x, y: p.y, w: m.w, h: m.h }, obstacles(m.stage), m.tr);
    apply(a.x, a.y);
  }, [apply, metrics, obstacles]);

  useLayoutEffect(() => { if (mounted) place(); }, [mounted, place, order.length, vertical, compact, pos]);
  useEffect(() => {
    if (!mounted) return;
    const stage = barRef.current?.offsetParent as HTMLElement | null;
    const ro = stage && typeof ResizeObserver !== "undefined" ? new ResizeObserver(place) : null;
    if (stage) ro?.observe(stage);
    return () => ro?.disconnect();
  }, [mounted, place]);

  /* ------------------------------- moving ------------------------------ */
  const move = useRef<{ sx: number; sy: number; x: number; y: number; snapX: number; snapY: number } | null>(null);

  const finishMove = (persist: boolean) => {
    const m = metrics();
    move.current = null;
    setDragging(false);
    barRef.current?.classList.add("is-settle");
    if (!m) return;
    const a = avoidObstacles({ x: cur.current.x, y: cur.current.y, w: m.w, h: m.h }, obstacles(m.stage), m.tr);
    apply(a.x, a.y);
    if (persist) setFavUI({ pos: xyToFrac(a.x, a.y, m.tr) });
    window.setTimeout(() => barRef.current?.classList.remove("is-settle"), 300);
  };

  const gripProps = {
    onPointerDown: (e: React.PointerEvent<HTMLElement>) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      e.preventDefault(); e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      barRef.current?.classList.remove("is-settle");
      move.current = { sx: e.clientX, sy: e.clientY, x: cur.current.x, y: cur.current.y, snapX: 0, snapY: 0 };
      setDragging(true);
    },
    onPointerMove: (e: React.PointerEvent<HTMLElement>) => {
      const d = move.current, m = metrics();
      if (!d || !m) return;
      const s = snapXY(d.x + e.clientX - d.sx, d.y + e.clientY - d.sy, m.tr);
      if ((s.sx !== d.snapX && s.sx !== 0) || (s.sy !== d.snapY && s.sy !== 0)) haptic.selection();
      d.snapX = s.sx; d.snapY = s.sy;
      apply(s.x, s.y);
    },
    onPointerUp: () => { if (move.current) finishMove(true); },
    onPointerCancel: () => { if (move.current) finishMove(true); },
    onDoubleClick: () => { haptic.selection(); setFavUI({ pos: null }); },
    onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => {
      const step = e.shiftKey ? 32 : 8;
      const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
      const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
      if (e.key === "Home") { e.preventDefault(); e.stopPropagation(); setFavUI({ pos: null }); return; }
      if (!dx && !dy) return;
      e.preventDefault(); e.stopPropagation(); // never step the replay
      const m = metrics();
      if (!m) return;
      const s = snapXY(cur.current.x + dx, cur.current.y + dy, m.tr, 4);
      apply(s.x, s.y);
      setFavUI({ pos: xyToFrac(s.x, s.y, m.tr) });
    },
  };

  /* ------------------------------ reordering --------------------------- */
  const drag = useRef<{ tool: string; pid: number; sx: number; sy: number; grab: number; started: boolean; last: number } | null>(null);
  const prevOff = useRef<Map<string, number>>(new Map());
  const suppress = useRef(false);

  const mainOff = (el: HTMLElement) => (vertical ? el.offsetTop : el.offsetLeft);
  const placeDragged = () => {
    const d = drag.current, list = listRef.current;
    if (!d || !d.started || !list) return;
    const el = list.querySelector<HTMLElement>(`[data-fav="${d.tool}"]`);
    if (!el) return;
    const rect = list.getBoundingClientRect();
    const t = d.last - (vertical ? rect.top : rect.left) - d.grab - mainOff(el);
    el.style.transform = vertical ? `translateY(${t}px)` : `translateX(${t}px)`;
  };

  // FLIP: neighbours glide to their new slot when the order changes mid-drag.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const now = new Map<string, number>();
    const slots = Array.from(list.querySelectorAll<HTMLElement>("[data-fav]"));
    slots.forEach((el) => now.set(el.dataset.fav!, mainOff(el)));
    if (drag.current?.started) {
      slots.forEach((el) => {
        const t = el.dataset.fav!;
        if (t === drag.current!.tool) return;
        const delta = (prevOff.current.get(t) ?? now.get(t)!) - now.get(t)!;
        if (!delta) return;
        el.style.transition = "none";
        el.style.transform = vertical ? `translateY(${delta}px)` : `translateX(${delta}px)`;
        void el.offsetWidth;
        el.style.transition = "";
        el.style.transform = "";
      });
      placeDragged();
    }
    prevOff.current = now;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.join("|"), vertical, compact]);

  const itemDown = (e: React.PointerEvent<HTMLElement>, t: string) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const slot = e.currentTarget.closest<HTMLElement>("[data-fav]");
    const list = listRef.current;
    if (!slot || !list) return;
    const rect = list.getBoundingClientRect();
    const p = vertical ? e.clientY : e.clientX;
    drag.current = { tool: t, pid: e.pointerId, sx: e.clientX, sy: e.clientY, grab: p - (vertical ? rect.top : rect.left) - mainOff(slot), started: false, last: p };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const itemMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current, list = listRef.current;
    if (!d || !list || d.pid !== e.pointerId) return;
    if (!d.started) {
      if (Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 5) return;
      d.started = true; suppress.current = true;
      prevOff.current = new Map(Array.from(list.querySelectorAll<HTMLElement>("[data-fav]")).map((el) => [el.dataset.fav!, mainOff(el)]));
      list.classList.add("is-reordering");
      list.querySelector(`[data-fav="${d.tool}"]`)?.classList.add("is-lifted");
      haptic.selection();
      setDragOrder(known);
    }
    d.last = vertical ? e.clientY : e.clientX;
    placeDragged();
    // target index = how many other slots' centres sit before the dragged centre
    const el = list.querySelector<HTMLElement>(`[data-fav="${d.tool}"]`);
    if (!el) return;
    const size = vertical ? el.offsetHeight : el.offsetWidth;
    const rect = list.getBoundingClientRect();
    const centre = d.last - (vertical ? rect.top : rect.left) - d.grab + size / 2;
    const others = Array.from(list.querySelectorAll<HTMLElement>("[data-fav]")).filter((s) => s !== el);
    const idx = others.filter((s) => mainOff(s) + (vertical ? s.offsetHeight : s.offsetWidth) / 2 < centre).length;
    const from = order.indexOf(d.tool);
    if (idx !== from && from >= 0) { haptic.selection(); setDragOrder(reorder(order, from, idx)); }
  };
  const itemUp = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current, list = listRef.current;
    drag.current = null;
    if (!d) return;
    if (d.started) {
      list?.classList.remove("is-reordering");
      list?.querySelectorAll<HTMLElement>("[data-fav]").forEach((s) => { s.classList.remove("is-lifted"); s.style.transform = ""; });
      if (dragOrder) setFavorites(dragOrder);
      setDragOrder(null);
      window.setTimeout(() => { suppress.current = false; }, 0);
    }
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* released */ }
  };

  /* ------------------------------ popovers ------------------------------ */
  useEffect(() => {
    if (!pop) return;
    focusFirstItem(popRef.current);
    const down = (e: PointerEvent) => { if (!popRef.current?.contains(e.target as Node)) setPop(null); };
    window.addEventListener("pointerdown", down, true);
    return () => window.removeEventListener("pointerdown", down, true);
  }, [pop]);
  useLayoutEffect(() => {
    const el = popRef.current;
    if (!el || !pop) return;
    el.style.left = `${Math.max(8, Math.min(pop.x, window.innerWidth - el.offsetWidth - 8))}px`;
    el.style.top = `${Math.max(8, Math.min(pop.y, window.innerHeight - el.offsetHeight - 8))}px`;
  }, [pop]);

  const openMenu = (btn: HTMLElement) => {
    const r = btn.getBoundingClientRect();
    const below = r.top < window.innerHeight / 2;
    setPop({ kind: "menu", x: r.left - 120, y: below ? r.bottom + 8 : r.top - 8 - 190 });
  };

  if (!mounted) return null;

  const side = vertical ? "auto-v" : "auto-h";
  const runItem = (t: string) => {
    if (suppress.current) return;
    haptic.selection();
    const it = ITEM_BY_TOOL.get(t)!;
    setTool(tool === it.tool && !isCursorTool(it.tool) ? "cursor" : it.tool);
  };

  return (
    <div ref={barRef} className={`ej-fav${vertical ? " is-v" : " is-h"}${dragging ? " is-dragging" : ""}`} onPointerDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
      <div
        className={`ej-fav-card${shown ? " is-in" : ""}${dim ? " is-dim" : ""}${compact ? " is-compact" : ""}`}
        role="toolbar" aria-label="Favorite tools" aria-orientation={vertical ? "vertical" : "horizontal"}
        onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}
        onFocus={() => setFocus(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocus(false); }}
      >
        <span className="ej-fav-grip" role="button" tabIndex={0} aria-label="Move favorites bar (arrow keys, Home to reset)" data-tip="Drag to move · double-click to reset" data-tip-side={side} {...gripProps} />
        <div ref={listRef} className="ej-fav-list">
          {order.map((t) => {
            const it = ITEM_BY_TOOL.get(t)!;
            const on = tool === it.tool || (it.tool === "crosshair" && tool === "cursor");
            const label = `${it.label}${it.hint ? ` (${it.hint})` : ""}`;
            return (
              <div className="ej-fav-slot" data-fav={t} key={t}>
                <button
                  type="button" className={`ej-fav-item${on ? " is-on" : ""}`} aria-pressed={on} aria-label={label} data-tip={label} data-tip-side={side}
                  onPointerDown={(e) => itemDown(e, t)} onPointerMove={itemMove} onPointerUp={itemUp} onPointerCancel={itemUp}
                  onClick={() => runItem(t)}
                  onContextMenu={(e) => { e.preventDefault(); setPop({ kind: "item", x: e.clientX, y: e.clientY, tool: t }); }}
                >
                  <I name={it.icon} size={20} filled={on} />
                  {!compact && <span className="ej-fav-lb">{it.label}</span>}
                </button>
                <button type="button" className="ej-fav-x" aria-label={`Remove ${it.label} from favorites`} data-tip="Remove" data-tip-side={side} onClick={() => toggleFavorite(t)}>
                  <I name="close" size={10} />
                </button>
              </div>
            );
          })}
          {order.length === 0 && <span className="ej-fav-empty">Star tools in any flyout to pin them here</span>}
        </div>
        <i className="ej-fav-sep" />
        <button type="button" className="ej-fav-btn" aria-label="Favorites options" aria-haspopup="menu" aria-expanded={pop?.kind === "menu"} data-tip="Options" data-tip-side={side}
          onClick={(e) => (pop ? setPop(null) : openMenu(e.currentTarget))}>
          <I name="more" size={20} />
        </button>
      </div>

      {pop && barRef.current?.closest(".tv-root") && createPortal(
        <div ref={popRef} className="ej-pop" role="menu" onKeyDown={(e) => onMenuKeyDown(e, popRef.current, () => setPop(null))} onPointerDown={(e) => e.stopPropagation()}>
          {pop.kind === "item" ? (
            <>
              <button type="button" role="menuitem" className="ej-pop-item is-danger" onClick={() => { toggleFavorite(pop.tool!); setPop(null); }}>
                <I name="close" size={16} /><span>Remove from favorites</span>
              </button>
              <button type="button" role="menuitem" className="ej-pop-item" onClick={() => { setPop(null); const before = getUiPrefs().favTools; resetFavorites(); toast({ kind: "info", text: "Favorites reset to defaults", action: { label: "Undo", run: () => setFavorites(before) } }); }}>
                <I name="reset" size={16} /><span>Reset to defaults</span>
              </button>
            </>
          ) : (
            <>
              <button type="button" role="menuitemcheckbox" aria-checked={!compact} className="ej-pop-item" onClick={() => { haptic.selection(); setFavUI({ compact: !compact }); }}>
                <I name={compact ? "grid" : "list"} size={16} /><span>Show labels</span>{!compact && <I name="check" size={14} className="ej-pop-ck" />}
              </button>
              <button type="button" role="menuitemcheckbox" aria-checked={vertical} className="ej-pop-item" onClick={() => { haptic.selection(); setFavUI({ vertical: !vertical }); }}>
                <I name={vertical ? "layoutV" : "layoutH"} size={16} /><span>Vertical layout</span>{vertical && <I name="check" size={14} className="ej-pop-ck" />}
              </button>
              <button type="button" role="menuitemcheckbox" aria-checked={autoHide} className="ej-pop-item" onClick={() => { haptic.selection(); setFavUI({ autoHide: !autoHide }); }}>
                <I name="eye" size={16} /><span>Auto-hide when idle</span>{autoHide && <I name="check" size={14} className="ej-pop-ck" />}
              </button>
              <i className="ej-pop-sep" />
              <button type="button" role="menuitem" className="ej-pop-item" onClick={() => { setPop(null); const before = getUiPrefs().favTools; resetFavorites(); toast({ kind: "info", text: "Favorites reset to defaults", action: { label: "Undo", run: () => setFavorites(before) } }); }}>
                <I name="reset" size={16} /><span>Reset favorites</span>
              </button>
              <button type="button" role="menuitem" className="ej-pop-item" onClick={() => { setPop(null); setFavUI({ visible: false }); toast({ kind: "info", text: "Favorites bar hidden", action: { label: "Undo", run: () => setFavUI({ visible: true }) } }); }}>
                <I name="close" size={16} /><span>Hide favorites bar</span>
              </button>
            </>
          )}
        </div>,
        barRef.current.closest(".tv-root") as Element,
      )}
    </div>
  );
}
