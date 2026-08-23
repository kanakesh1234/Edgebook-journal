"use client";

import { create } from "zustand";

/* Global UI state: cross-page modals & overlays. */

interface UiState {
  /** Global "new trade" composer, reachable from any page. */
  newEntryOpen: boolean;
  openNewEntry(): void;
  closeNewEntry(): void;
}

export const useUi = create<UiState>((set) => ({
  newEntryOpen: false,
  openNewEntry: () => set({ newEntryOpen: true }),
  closeNewEntry: () => set({ newEntryOpen: false }),
}));
