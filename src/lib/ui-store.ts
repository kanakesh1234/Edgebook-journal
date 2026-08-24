"use client";

import { create } from "zustand";

/* Global UI state: cross-page modals & overlays. */

interface UiState {
  /** Global "new trade" composer, reachable from any page. */
  newEntryOpen: boolean;
  openNewEntry(): void;
  closeNewEntry(): void;
  /** MINATO companion panel + optional trade-review focus. */
  minatoOpen: boolean;
  minatoTradeId: string | null;
  setMinatoOpen(open: boolean): void;
  openMinatoWithTrade(tradeId: string | null): void;
}

export const useUi = create<UiState>((set) => ({
  newEntryOpen: false,
  openNewEntry: () => set({ newEntryOpen: true }),
  closeNewEntry: () => set({ newEntryOpen: false }),
  minatoOpen: false,
  minatoTradeId: null,
  setMinatoOpen: (open) => set({ minatoOpen: open }),
  openMinatoWithTrade: (tradeId) => set({ minatoOpen: true, minatoTradeId: tradeId }),
}));
