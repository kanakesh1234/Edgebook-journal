"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useIndicators } from "@/lib/backtesting/indicator-store";
import { CATALOG, KINDS, label } from "@/lib/backtesting/indicators";
import { I } from "./tv-icons";
import { onMenuKeyDown, useOutside } from "./tv-ui";
import EJMark from "./ej-mark";
import MobileSheet, { useMobileUI } from "./mobile-sheet";

/** TradingView-style "Indicators" button + searchable panel (add, edit length/colour, hide, remove). */
export default function IndicatorsMenu() {
  const open = useIndicators((s) => s.panelOpen);
  const setPanel = useIndicators((s) => s.setPanel);
  const list = useIndicators((s) => s.list);
  const hydrate = useIndicators((s) => s.hydrate);
  const add = useIndicators((s) => s.add);
  const remove = useIndicators((s) => s.remove);
  const update = useIndicators((s) => s.update);
  const clear = useIndicators((s) => s.clear);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const mobile = useMobileUI();

  useEffect(() => { hydrate(); }, [hydrate]);
  useOutside(ref, open && !mobile, () => setPanel(false));
  useEffect(() => { if (open && !mobile) searchRef.current?.focus(); else if (!open) setQ(""); }, [open, mobile]);

  // "/" opens the indicator search (like TradingView), unless typing somewhere.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      setPanel(true);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [setPanel]);

  const filterMatches = (query: string) => {
    const t = query.trim().toLowerCase();
    return KINDS.filter((k) => !t || `${CATALOG[k].name} ${k} ${CATALOG[k].desc}`.toLowerCase().includes(t));
  };

  const matches = useMemo(() => filterMatches(q), [q]);

  const renderBody = (query: string, items: typeof KINDS) => (
    <>
      {list.length > 0 && !query && (
        <>
          <div className="tv-menu-head">On chart <button type="button" className="tv-linkbtn" onClick={clear}>Remove all</button></div>
          {list.map((i) => (
            <div key={i.id} className="tv-ind-edit">
              <span className="tv-ind-edit-name">{label({ kind: i.kind, params: [] })}</span>
              {CATALOG[i.kind].paramLabels.map((pl, k) => (
                <label key={pl} data-tip={pl}>
                  <small>{pl}</small>
                  <input type="number" aria-label={pl} min={1} step={k === 1 && i.kind === "bb" ? 0.5 : 1} value={i.params[k] ?? ""} style={{ fontSize: 16 }}
                    onChange={(e) => { const v = parseFloat(e.target.value); const next = [...i.params]; next[k] = Number.isFinite(v) && v > 0 ? v : CATALOG[i.kind].defaults[k]; update(i.id, { params: next }); }} />
                </label>
              ))}
              {!CATALOG[i.kind].pane && i.kind !== "volume" && <input type="color" value={i.color} onChange={(e) => update(i.id, { color: e.target.value })} aria-label="Colour" data-tip="Colour" />}
              <button type="button" className="tv-linkbtn" onClick={() => update(i.id, { visible: !i.visible })}>{i.visible ? "Hide" : "Show"}</button>
              <button type="button" className="tv-linkbtn" aria-label="Remove indicator" onClick={() => remove(i.id)}><I name="close" size={14} /></button>
            </div>
          ))}
          <div className="tv-menu-sep" />
        </>
      )}

      <div className="tv-menu-head">{query ? "Results" : "Add indicator"}</div>
      {items.length === 0 && <div className="ej-empty-inline"><EJMark size={18} />No indicators match “{query}”.</div>}
      {items.map((k) => (
        <button key={k} type="button" role="menuitem" className={mobile ? "ej-sheet-row" : "tv-menu-item"} onClick={() => add(k)}>
          <span style={{ flex: 1 }}><b>{CATALOG[k].name}</b></span>
          <kbd>{CATALOG[k].pane ? "pane" : "overlay"}</kbd>
        </button>
      ))}
    </>
  );

  return (
    <div className="tv-dd" ref={ref}>
      <button type="button" data-tip="Indicators (/)" aria-label="Indicators" aria-haspopup="dialog" aria-expanded={open} className={`tv-tbtn${open || list.length ? " is-on" : ""}`} style={{ touchAction: "manipulation" }} onClick={() => setPanel(!open)}>
        <I name="indicators" size={20} filled={list.length > 0} /><span className="tv-hide-sm">Indicators{list.length ? ` ${list.length}` : ""}</span>
      </button>
      {mobile ? (
        <MobileSheet open={open} onClose={() => setPanel(false)} title="Indicators" searchable searchPlaceholder="Search indicators…">
          {(sheetQ) => renderBody(sheetQ, filterMatches(sheetQ))}
        </MobileSheet>
      ) : open && (
        <div className="tv-menu tv-ind-panel" role="dialog" aria-label="Indicators" onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); setPanel(false); } else if (e.target === searchRef.current) e.stopPropagation(); else onMenuKeyDown(e, ref.current, () => setPanel(false)); }}>
          <input ref={searchRef} className="tv-ind-search" aria-label="Search indicators" placeholder="Search indicators…" value={q} onChange={(e) => setQ(e.target.value)} />
          {renderBody(q, matches)}
        </div>
      )}
    </div>
  );
}
