"use client";

import { useCallback, useRef, useState } from "react";
import { useBacktest, type ActiveTool } from "@/lib/backtesting/store";
import { EMOJI_CHOICES, TOOLS } from "@/lib/backtesting/drawings/tools";
import type { DrawingToolType } from "@/lib/backtesting/types";
import { I } from "./tv-icons";
import { useOutside } from "./tv-ui";

interface Item { tool: ActiveTool & string; label: string; icon: string; hint?: string }
interface Group { id: string; title: string; items: Item[] }

const t = (tool: DrawingToolType, icon: string): Item => ({
  tool, icon, label: TOOLS[tool].label, hint: TOOLS[tool].shortcut ? `Alt+${TOOLS[tool].shortcut.toUpperCase()}` : undefined,
});

const GROUPS: Group[] = [
  {
    id: "cursors", title: "Cursors",
    items: [
      { tool: "crosshair", label: "Cross", icon: "cross" },
      { tool: "dot", label: "Dot", icon: "dot" },
      { tool: "pointer", label: "Arrow", icon: "arrow" },
      { tool: "eraser", label: "Eraser", icon: "eraser" },
    ],
  },
  {
    id: "lines", title: "Trend line tools",
    items: [
      t("trend-line", "trendLine"), t("ray", "ray"), t("info-line", "infoLine"), t("extended-line", "extendedLine"),
      t("horizontal-line", "hLine"), t("horizontal-ray", "hRay"), t("vertical-line", "vLine"), t("cross-line", "crossLine"),
      t("parallel-channel", "channel"), t("arrow", "arrowMarker"),
    ],
  },
  { id: "fib", title: "Fibonacci tools", items: [t("fib-retracement", "fib")] },
  {
    id: "shapes", title: "Brushes & shapes",
    items: [t("brush", "brush"), t("rectangle", "rect"), t("ellipse", "ellipse"), t("triangle", "triangle")],
  },
  { id: "text", title: "Text", items: [t("text", "text")] },
  { id: "emoji", title: "Icons", items: [t("emoji", "emoji")] },
  {
    id: "measure", title: "Forecasting & measurement",
    items: [
      t("long-position", "longPos"), t("short-position", "shortPos"), t("price-range", "priceRange"),
      t("date-range", "dateRange"), t("date-price-range", "datePriceRange"), t("measure", "ruler"),
    ],
  },
  { id: "zoom", title: "Zoom", items: [{ tool: "zoom", label: "Zoom in", icon: "zoomIn" }] },
];

const CURSOR_TOOLS = new Set<string>(["cursor", "crosshair", "dot", "pointer"]);

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
  const activeEmoji = useBacktest((s) => s.activeEmoji);
  const setEmoji = useBacktest((s) => s.setActiveEmoji);
  const count = useBacktest((s) => (s.drawings[symbol] || []).length);

  const [last, setLast] = useState<Record<string, number>>({});
  const [open, setOpen] = useState<{ id: string; top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const flyRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(null), []);
  useOutside(flyRef, !!open, close);

  const openFly = (id: string, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setOpen((o) => (o?.id === id ? null : { id, top: r.top, left: r.right + 8 }));
  };

  const groupActive = (g: Group): boolean =>
    g.id === "cursors" ? CURSOR_TOOLS.has(tool ?? "cursor") || tool === "eraser" : g.items.some((i) => i.tool === tool);

  const pickItem = (g: Group, idx: number) => {
    const it = g.items[idx];
    setLast((l) => ({ ...l, [g.id]: idx }));
    setTool(it.tool);
    setOpen(null);
  };

  return (
    <div className="tv-left" ref={rootRef}>
      {GROUPS.map((g) => {
        const idx = Math.min(last[g.id] ?? 0, g.items.length - 1);
        let cur = g.items[idx];
        // Cursor group icon mirrors the active cursor flavour.
        if (g.id === "cursors" && tool && g.items.some((i) => i.tool === tool)) cur = g.items.find((i) => i.tool === tool)!;
        const active = groupActive(g);
        const multi = g.items.length > 1 || g.id === "emoji";
        const label = `${cur.label}${cur.hint ? ` (${cur.hint})` : ""}`;
        return (
          <div className="tv-lgroup" key={g.id}>
            <button
              type="button" title={label} aria-label={label}
              className={`tv-lbtn${active ? " is-on" : ""}${multi ? "" : " solo"}`}
              onClick={(e) => {
                if (g.id === "emoji") { openFly(g.id, e.currentTarget.parentElement as HTMLElement); return; }
                if (g.id === "cursors") { setTool(cur.tool === "crosshair" ? "crosshair" : cur.tool); return; }
                // Clicking the active tool again drops back to the cursor, like TradingView.
                setTool(active && g.id !== "cursors" && tool === cur.tool ? "cursor" : cur.tool);
              }}
            >
              {g.id === "emoji" && tool === "emoji" ? <span style={{ fontSize: 20 }}>{activeEmoji}</span> : <I name={cur.icon} />}
            </button>
            {multi && (
              <button
                type="button" aria-label={`${g.title} menu`} className={`tv-lcaret${open?.id === g.id ? " is-open" : ""}`}
                onClick={(e) => openFly(g.id, e.currentTarget.parentElement as HTMLElement)}
              >
                <I name="chevronRight" size={14} />
              </button>
            )}
          </div>
        );
      })}

      <div className="tv-lsep" />

      <div className="tv-lgroup">
        <button
          type="button" title={`Magnet mode: ${magnet}`} className={`tv-lbtn${magnet !== "off" ? " is-on" : ""}`}
          onClick={(e) => openFly("magnet", e.currentTarget.parentElement as HTMLElement)}
        >
          <I name="magnet" />
        </button>
      </div>
      <div className="tv-lgroup">
        <button type="button" title="Stay in drawing mode" className={`tv-lbtn solo${stay ? " is-on" : ""}`} onClick={() => setStay(!stay)}>
          <I name="stayDraw" />
        </button>
      </div>
      <div className="tv-lgroup">
        <button type="button" title="Lock all drawings" className={`tv-lbtn solo${locked ? " is-on" : ""}`} onClick={() => setLocked(!locked)}>
          <I name={locked ? "lock" : "unlock"} />
        </button>
      </div>
      <div className="tv-lgroup">
        <button type="button" title={hidden ? "Show all drawings" : "Hide all drawings (Ctrl+Alt+H)"} className={`tv-lbtn solo${hidden ? " is-on" : ""}`} onClick={() => setHidden(!hidden)}>
          <I name={hidden ? "eyeOff" : "eye"} />
        </button>
      </div>

      <div className="tv-lsep" />

      <div className="tv-lgroup">
        <button
          type="button" title="Remove drawings" disabled={count === 0} className="tv-lbtn solo"
          onClick={() => clearDrawings(symbol)}
        >
          <I name="trash" />
        </button>
      </div>

      {open && (
        <div ref={flyRef} className="tv-fly" style={{ top: Math.max(8, open.top - 4), left: open.left }}>
          {open.id === "emoji" ? (
            <div className="tv-emoji-grid">
              {EMOJI_CHOICES.map((e) => (
                <button key={e} type="button" onClick={() => { setEmoji(e); setTool("emoji"); setOpen(null); }}>{e}</button>
              ))}
            </div>
          ) : open.id === "magnet" ? (
            <>
              {(["off", "weak", "strong"] as const).map((m) => (
                <button key={m} type="button" className={`tv-menu-item${magnet === m ? " is-active" : ""}`} onClick={() => { setMagnet(m); setOpen(null); }}>
                  <span><I name="magnet" size={22} />{m === "off" ? "Magnet off" : m === "weak" ? "Weak magnet" : "Strong magnet"}</span>
                  {magnet === m && <I name="check" size={18} />}
                </button>
              ))}
            </>
          ) : (
            (() => {
              const g = GROUPS.find((x) => x.id === open.id);
              if (!g) return null;
              return (
                <>
                  <div className="tv-menu-head">{g.title.toUpperCase()}</div>
                  {g.items.map((it, i) => (
                    <button
                      key={it.tool + it.icon} type="button"
                      className={`tv-menu-item${tool === it.tool ? " is-active" : ""}`}
                      onClick={() => pickItem(g, i)}
                    >
                      <span><I name={it.icon} size={24} />{it.label}</span>
                      {it.hint && <kbd>{it.hint}</kbd>}
                    </button>
                  ))}
                </>
              );
            })()
          )}
        </div>
      )}
    </div>
  );
}
