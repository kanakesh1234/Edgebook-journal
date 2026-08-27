"use client";

import { create } from "zustand";

/* Global UI state: cross-page modals & overlays + Drive connection status. */

/**
 * Explicit Drive connection lifecycle (never collapse into one boolean):
 *   connecting            – bootstrap still establishing state
 *   connected             – server verified a working authorization
 *   temporarily_unavailable – a transient failure; session preserved, retrying
 *   auth_required         – server definitively reports reauthorization needed
 */
export type DriveStatus =
  | "connecting"
  | "connected"
  | "temporarily_unavailable"
  | "auth_required";

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
  /** Canonical Drive connection status for the authenticated session. */
  driveStatus: DriveStatus;
  setDriveStatus(status: DriveStatus): void;
}

export const useUi = create<UiState>((set) => ({
  newEntryOpen: false,
  openNewEntry: () => set({ newEntryOpen: true }),
  closeNewEntry: () => set({ newEntryOpen: false }),
  minatoOpen: false,
  minatoTradeId: null,
  setMinatoOpen: (open) => set({ minatoOpen: open }),
  openMinatoWithTrade: (tradeId) => set({ minatoOpen: true, minatoTradeId: tradeId }),
  driveStatus: "connecting",
  setDriveStatus: (status) => {
    console.info(`[BOOTSTRAP] drive_status=${status}`);
    set({ driveStatus: status });
  },
}));
