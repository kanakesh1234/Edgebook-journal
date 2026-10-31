"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useBacktest } from "@/lib/backtesting/store";
import { EMOJI_CHOICES } from "@/lib/backtesting/drawings/tools";
import { getUiPrefs, setFavUI, setFavorites, setLastTool, setRail, useUiPrefs } from "@/lib/backtesting/ui-prefs";
import { haptic } from "@/lib/haptics";
import { I } from "./tv-icons";
import { toast } from "./ej-toast";
import { GROUPS, ITEM_BY_TOOL, SECTION_ORDER, SECTION_TITLES, isCursorTool, type ToolGroup, type ToolItem } from "./tool-catalog";

type Fly = { id: string; top: number; left: number; oy: number };

const MAGNET_MODES = [
  { id: "off", label: "Magnet off" },
  { id: "weak", label: "Weak magnet" },
  { id: "strong", label: "Strong magnet" },
] as const;

/** Add / remove a tool from the favorites bar, with an Undo toast (shared by flyout stars + the bar itself). */
export function toggleFavorite(tool: string) {
  const before = getUiPrefs().favTools;
  const item = ITEM_BY_TOOL.get(tool);
  const label = item?.label ?? tool;
  haptic.selection();
  if (before.includes(tool)) {
    setFavorites(before.filter((t) => t !== tool));
    toast({ kind: "info", text: `Removed ${label} from Favorites`, action: { label: "Undo", run: () => setFavorites(before) } });
  } else {
    setFavorites([...before, tool]);
    // Starring something is an explicit "I want a favorites bar" — reveal it the first time.
    if (!getUiPrefs().fav.visible) setFavUI({ visible: true });
    toast({ text: `Added ${label} to Favorites`, action: { label: "Undo", run: () => setFavorites(before) } });
  }
}

export default function LeftToolbar({ symbol }: { symbol: string }) {
  const tool = useBacktest((s) => s.activeDrawingTool);
  const setTool = useBacktest((s) => s.setActiveDrawingTool);
  const magnet = useBacktest((s) => s.magnetMode);
  const setMagnet = useBacktest((s) => s.setMagnetMode);
  const stay = useBacktest((s) => s.stayInDrawing);
  const setStay = useBacktest((s) => s.setStayInDrawing);
  const locked = useBacktest((s) => s.drawingsLocked);
  const setLocked = useBacktest((s) => s.setDrawingsLocked);
  const hidden = useBacktest((s) => s.drawingsHidden);
  const setHidden = useBacktest((s) => s.setDrawingsHidden);
  const clearDrawings = useBacktest((s) => s.clearDrawings);
  const undoDrawing = useBacktest((s) => s.undoDrawing);
  const activeEmoji = useBacktest((s) => s.activeEmoji);
  const setEmoji = useBacktest((s) => s.setActiveEmoji);
  const count = useBacktest((s) => (s.drawings[symbol] || []).length);

  const rail = useUiPrefs((p) => p.rail);
  const lastTool = useUiPrefs((p) => p.lastTool);
  const favTools = useUiPrefs((p) => p.favTools);
  const favVisible = useUiPrefs((p) => p.fav.visible);

  const [open, setOpen] = useState<Fly | null>(null);
  const flyRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const close = useCallback(() => setOpen(null), []);

  // Outside-press closes the flyout — except on its own trigger (that click toggles it).
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (flyRef.current?.contains(t) || triggerRef.current?.parentElement?.contains(t)) return;
      setOpen(null);
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(null); };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("pointerdown", down, true); window.removeEventListener("keydown", key); };
  }, [open]);

  // Remember the last-used sub-tool per group — also when it was picked via a shortcut or the favorites bar.
  useEffect(() => {
    const it = tool ? ITEM_BY_TOOL.get(tool) : undefined;
    if (it) setLastTool(it.group, it.tool);
  }, [tool]);

  const openFly = (id: string, trigger: HTMLElement) => {
    const r = trigger.getBoundingClientRect();
    triggerRef.current = trigger;
    setOpen((o) => (o?.id === id ? null : { id, top: r.top - 6, left: r.right + 8, oy: r.height / 2 + 6 }));
  };

  // Keep the flyout fully on screen (small laptops, short windows) and move focus into it.
  useLayoutEffect(() => {
    const el = flyRef.current;
    if (!el || !open) return;
    const h = el.offsetHeight, w = el.offsetWidth;
    const top = Math.max(8, Math.min(open.top, window.innerHeight - h - 8));
    const left = Math.max(8, Math.min(open.left, window.innerWidth - w - 8));
    el.style.top = `${top}px`;
    el.style.left = `${left}px`;
    el.style.setProperty("--oy", `${Math.max(12, open.oy + (open.top - top))}px`);
    el.style.maxHeight = `${window.innerHeight - 16}px`;
    const first = el.querySelector<HTMLElement>(".is-on.ej-fly-item, .is-on.ej-emoji") ?? el.querySelector<HTMLElement>(".ej-fly-item, .ej-emoji");
    first?.focus({ preventScroll: true });
  }, [open]);

  const closeAndRestore = () => { setOpen(null); triggerRef.current?.focus({ preventScroll: true }); };

  const onFlyKey = (e: React.KeyboardEvent) => {
    const root = flyRef.current;
    if (!root) return;
    const k = e.key;
    const items = Array.from(root.querySelectorAll<HTMLElement>(".ej-fly-item, .ej-emoji"));
    const idx = items.indexOf(document.activeElement as HTMLElement);
    const move = (n: number) => { e.preventDefault(); e.stopPropagation(); items[(n + items.length) % items.length]?.focus(); };
    if (k === "Escape") { e.preventDefault(); e.stopPropagation(); closeAndRestore(); return; }
    if (k === "ArrowDown") return move(idx + 1);
    if (k === "ArrowUp") return move(idx - 1);
    if (k === "Home") return move(0);
    if (k === "End") return move(items.length - 1);
    if (k === "ArrowRight" || k === "ArrowLeft") {
      const a = document.activeElement as HTMLElement | null;
      const row = a?.closest(".ej-fly-row");
      if (row) {
        e.preventDefault(); e.stopPropagation();
        (k === "ArrowRight" ? row.querySelector<HTMLElement>(".ej-fly-star") : row.querySelector<HTMLElement>(".ej-fly-item"))?.focus();
      } else if (root.querySelector(".ej-emoji")) move(idx + (k === "ArrowRight" ? 1 : -1));
      return;
    }
    if (k === "Tab") { closeAndRestore(); }
  };

  const groupActive = (g: ToolGroup): boolean =>
    g.id === "cursors" ? isCursorTool(tool ?? "cursor") || tool === "eraser" : g.items.some((i) => i.tool === tool);

  const pickItem = (it: ToolItem) => {
    haptic.selection();
    setTool(it.tool);
    setOpen(null);
  };

  const renderGroup = (g: ToolGroup) => {
    const fromLast = g.items.find((i) => i.tool === lastTool[g.id]);
    const live = g.items.find((i) => i.tool === tool);
    const cur: ToolItem = live ?? fromLast ?? g.items[0];
    const active = groupActive(g);
    const multi = g.items.length > 1 || g.id === "emoji";
    const label = `${cur.label}${cur.hint ? ` (${cur.hint})` : ""}`;
    const isOpen = open?.id === g.id;
    return (
      <div className={`ej-lgroup${isOpen ? " is-open" : ""}`} key={g.id}>
        <button
          type="button" data-tip={label} data-tip-side="right" aria-label={label} aria-pressed={active}
          aria-haspopup={g.id === "emoji" ? "menu" : undefined}
          className={`ej-lbtn${active ? " is-on" : ""}`}
          onClick={(e) => {
            if (g.id === "emoji") { openFly(g.id, e.currentTarget); return; }
            haptic.selection();
            // Clicking the active drawing tool again drops back to the cursor, like TradingView.
            setTool(g.id !== "cursors" && active && tool === cur.tool ? "cursor" : cur.tool);
          }}
          onContextMenu={(e) => { if (multi) { e.preventDefault(); openFly(g.id, e.currentTarget); } }}
          onKeyDown={(e) => { if (multi && e.key === "ArrowRight" && !open) { e.preventDefault(); e.stopPropagation(); openFly(g.id, e.currentTarget); } }}
        >
          {g.id === "emoji" && tool === "emoji"
            ? <span className="ej-lemoji" aria-hidden="true">{activeEmoji}</span>
            : <I name={cur.icon} size={20} filled={active} />}
        </button>
        {multi && (
          <button
            type="button" className="ej-lcaret" aria-label={`${g.title} menu`} aria-haspopup="menu" aria-expanded={isOpen}
            data-tip={`${g.title}`} data-tip-side="right" tabIndex={-1}
            onClick={(e) => openFly(g.id, (e.currentTarget.previousElementSibling as HTMLElement) ?? e.currentTarget)}
          >
            <I name="chevronRight" size={10} />
          </button>
        )}
      </div>
    );
  };

  const toggle = (on: boolean, set: (v: boolean) => void) => () => { haptic.selection(); set(!on); };

  const flyGroup = open && open.id !== "magnet" && open.id !== "emoji" ? GROUPS.find((x) => x.id === open.id) : undefined;

  return (
    <div className={`ej-rail-wrap${rail === "hidden" ? " is-hidden" : ""}`}>
      <nav className="ej-rail" aria-label="Drawing tools" inert={rail === "hidden"} onScroll={close}>
        {SECTION_ORDER.map((sec, i) => (
          <Fragment key={sec}>
            {i > 0 && <i className="ej-rail-sep" />}
            <div className="ej-rail-sec" role="group" aria-label={SECTION_TITLES[sec]}>
              {GROUPS.filter((g) => g.section === sec).map(renderGroup)}
            </div>
          </Fragment>
        ))}

        <i className="ej-rail-sep" />
        <div className="ej-rail-sec" role="group" aria-label="Utilities">
          <div className={`ej-lgroup${open?.id === "magnet" ? " is-open" : ""}`}>
            <button
              type="button" className={`ej-lbtn${magnet !== "off" ? " is-on" : ""}`} data-tip={`Magnet: ${magnet}`} data-tip-side="right"
              aria-label={`Magnet mode: ${magnet}`} aria-haspopup="menu" aria-pressed={magnet !== "off"}
              onClick={(e) => openFly("magnet", e.currentTarget)}
            >
              <I name="magnet" size={20} filled={magnet !== "off"} />
            </button>
          </div>
          <div className="ej-lgroup">
            <button type="button" className={`ej-lbtn${stay ? " is-on" : ""}`} data-tip="Stay in drawing mode" data-tip-side="right" aria-label="Stay in drawing mode" aria-pressed={stay} onClick={toggle(stay, setStay)}>
              <I name="stayDraw" size={20} filled={stay} />
            </button>
          </div>
          <div className="ej-lgroup">
            <button type="button" className={`ej-lbtn${locked ? " is-on" : ""}`} data-tip={locked ? "Unlock all drawings" : "Lock all drawings"} data-tip-side="right" aria-label="Lock all drawings" aria-pressed={locked} onClick={toggle(locked, setLocked)}>
              <I name={locked ? "lock" : "unlock"} size={20} filled={locked} />
            </button>
          </div>
          <div className="ej-lgroup">
            <button type="button" className={`ej-lbtn${hidden ? " is-on" : ""}`} data-tip={hidden ? "Show all drawings (Ctrl+Alt+H)" : "Hide all drawings (Ctrl+Alt+H)"} data-tip-side="right" aria-label="Hide all drawings" aria-pressed={hidden} onClick={toggle(hidden, setHidden)}>
              <I name={hidden ? "eyeOff" : "eye"} size={20} filled={hidden} />
            </button>
          </div>
          <div className="ej-lgroup">
            <button
              type="button" className="ej-lbtn is-danger" disabled={count === 0} data-tip="Remove all drawings" data-tip-side="right" aria-label="Remove all drawings"
              onClick={() => {
                const n = count;
                haptic.selection();
                clearDrawings(symbol);
                toast({ kind: "info", text: `Removed ${n} drawing${n === 1 ? "" : "s"}`, action: { label: "Undo", run: () => undoDrawing(symbol) } });
              }}
            >
              <I name="trash" size={20} />
            </button>
          </div>
        </div>

        <span className="ej-rail-grow" />
        <i className="ej-rail-sep" />
        <div className="ej-rail-sec" role="group" aria-label="Workspace">
          <div className="ej-lgroup">
            <button
              type="button" className={`ej-lbtn${favVisible ? " is-on" : ""}`} data-tip={favVisible ? "Hide favorites bar" : "Show favorites bar"} data-tip-side="right"
              aria-label="Favorites bar" aria-pressed={favVisible} onClick={() => { haptic.selection(); setFavUI({ visible: !favVisible }); }}
            >
              <I name="star" size={20} filled={favVisible} />
            </button>
          </div>
          <div className="ej-lgroup">
            <button type="button" className="ej-lbtn" data-tip="Hide toolbar" data-tip-side="right" aria-label="Hide toolbar" onClick={() => { haptic.selection(); setOpen(null); setRail("hidden"); }}>
              <I name="sidebar" size={20} />
            </button>
          </div>
        </div>
      </nav>

      {/* Reveal tab (only when the rail is hidden) */}
      <button
        type="button" className="ej-rail-reveal" tabIndex={rail === "hidden" ? 0 : -1} aria-hidden={rail !== "hidden"}
        data-tip="Show toolbar" data-tip-side="right" aria-label="Show toolbar" onClick={() => { haptic.selection(); setRail("open"); }}
      >
        <I name="chevronRight" size={14} />
      </button>

      {open && (
        <div
          ref={flyRef} className="ej-fly" role="menu" aria-label={flyGroup?.title ?? (open.id === "magnet" ? "Magnet mode" : "Icons")}
          style={{ top: Math.max(8, open.top), left: open.left }} onKeyDown={onFlyKey}
        >
          {open.id === "emoji" ? (
            <>
              <div className="ej-fly-head">Icons</div>
              <div className="ej-emoji-grid">
                {EMOJI_CHOICES.map((e) => (
                  <button key={e} type="button" role="menuitem" className={`ej-emoji${activeEmoji === e && tool === "emoji" ? " is-on" : ""}`} aria-label={`Emoji ${e}`}
                    onClick={() => { haptic.selection(); setEmoji(e); setTool("emoji"); setOpen(null); }}>{e}</button>
                ))}
              </div>
            </>
          ) : open.id === "magnet" ? (
            <>
              <div className="ej-fly-head">Magnet</div>
              {MAGNET_MODES.map((m) => (
                <div className="ej-fly-row" key={m.id}>
                  <button type="button" role="menuitemradio" aria-checked={magnet === m.id} className={`ej-fly-item${magnet === m.id ? " is-on" : ""}`}
                    onClick={() => { haptic.selection(); setMagnet(m.id); setOpen(null); }}>
                    <span className="ej-fly-ic"><I name="magnet" size={20} filled={m.id !== "off"} style={{ opacity: m.id === "weak" ? 0.7 : 1 }} /></span>
                    <span className="ej-fly-lb">{m.label}</span>
                    {magnet === m.id && <I name="check" size={16} className="ej-fly-ck" />}
                  </button>
                </div>
              ))}
            </>
          ) : flyGroup ? (
            <>
              <div className="ej-fly-head">{flyGroup.title}</div>
              {flyGroup.items.map((it) => {
                const on = tool === it.tool;
                const fav = favTools.includes(it.tool);
                return (
                  <div className="ej-fly-row" key={it.tool + it.icon}>
                    <button type="button" role="menuitem" className={`ej-fly-item${on ? " is-on" : ""}`} onClick={() => pickItem(it)}>
                      <span className="ej-fly-ic"><I name={it.icon} size={20} filled={on} /></span>
                      <span className="ej-fly-lb">{it.label}</span>
                      {it.hint && <kbd className="ej-fly-kb">{it.hint}</kbd>}
                      {on && <I name="check" size={16} className="ej-fly-ck" />}
                    </button>
                    <button
                      type="button" className={`ej-fly-star${fav ? " is-on" : ""}`} aria-pressed={fav}
                      aria-label={fav ? `Remove ${it.label} from favorites` : `Add ${it.label} to favorites`}
                      data-tip={fav ? "Remove from favorites" : "Add to favorites"} data-tip-side="right"
                      onClick={(e) => { e.stopPropagation(); toggleFavorite(it.tool); }}
                    >
                      <I name="star" size={16} filled={fav} />
                    </button>
                  </div>
                );
              })}
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
