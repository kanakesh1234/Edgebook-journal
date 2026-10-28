import { create } from "zustand";
import { CATALOG, PALETTE, type IndicatorInst, type IndicatorKind } from "./indicators";

/* Indicator list is a chart preference (like TradingView's layout), not session data:
   kept in localStorage so it survives reloads and works for every symbol/session. */
const KEY = "edgebook.tv.indicators.v1";

function load(): IndicatorInst[] {
  try {
    const raw = typeof localStorage === "undefined" ? null : localStorage.getItem(KEY);
    const arr = raw ? (JSON.parse(raw) as IndicatorInst[]) : [];
    return Array.isArray(arr) ? arr.filter((i) => i && CATALOG[i.kind]) : [];
  } catch { return []; }
}
const save = (list: IndicatorInst[]) => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* private mode */ } };

interface IndicatorState {
  list: IndicatorInst[];
  hydrated: boolean;
  panelOpen: boolean;
  setPanel: (open: boolean) => void;
  hydrate: () => void;
  add: (kind: IndicatorKind) => void;
  remove: (id: string) => void;
  update: (id: string, patch: Partial<Pick<IndicatorInst, "params" | "color" | "visible">>) => void;
  clear: () => void;
}

export const useIndicators = create<IndicatorState>((set, get) => {
  const commit = (list: IndicatorInst[]) => { save(list); set({ list }); };
  return {
    list: [],
    hydrated: false,
    panelOpen: false,
    setPanel: (panelOpen) => set({ panelOpen }),
    // Called once on the client (SSR-safe: localStorage is never touched during render).
    hydrate: () => { if (!get().hydrated) set({ list: load(), hydrated: true }); },
    add: (kind) => {
      const list = get().list;
      const color = PALETTE[list.filter((i) => !CATALOG[i.kind].pane).length % PALETTE.length];
      commit([...list, { id: `${kind}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, kind, params: [...CATALOG[kind].defaults], color, visible: true }]);
    },
    remove: (id) => commit(get().list.filter((i) => i.id !== id)),
    update: (id, patch) => commit(get().list.map((i) => (i.id === id ? { ...i, ...patch } : i))),
    clear: () => commit([]),
  };
});
