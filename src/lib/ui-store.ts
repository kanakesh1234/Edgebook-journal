"use client";

import { create } from "zustand";

/* Global UI state: cross-page modals & overlays + Drive connection status + Docked Minato layout. */

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
  /** MINATO companion panel + optional trade-review focus + desktop docked width & focus mode. */
  minatoOpen: boolean;
  minatoTradeId: string | null;
  minatoWidth: number; // 400..640px on desktop
  minatoFocused: boolean; // expand-to-focus mode
  setMinatoOpen(open: boolean): void;
  setMinatoWidth(width: number): void;
  setMinatoFocused(focused: boolean): void;
  openMinatoWithTrade(tradeId: string | null): void;
  /** Collapsible sidebar on tablet/desktop. */
  sidebarCollapsed: boolean;
  setSidebarCollapsed(collapsed: boolean): void;
  toggleSidebar(): void;
  /** Canonical Drive connection status for the authenticated session. */
  driveStatus: DriveStatus;
  setDriveStatus(status: DriveStatus): void;
}

export const MINATO_MIN_WIDTH = 400;
export const MINATO_MAX_WIDTH = 640;
export const MINATO_DEFAULT_WIDTH = 440;

export const useUi = create<UiState>((set) => ({
  newEntryOpen: false,
  openNewEntry: () => set({ newEntryOpen: true }),
  closeNewEntry: () => set({ newEntryOpen: false }),
  minatoOpen: false,
  minatoTradeId: null,
  minatoWidth: MINATO_DEFAULT_WIDTH,
  minatoFocused: false,
  setMinatoOpen: (open) => set((s) => ({ minatoOpen: open, minatoFocused: open ? s.minatoFocused : false })),
  setMinatoWidth: (width) =>
    set({ minatoWidth: Math.max(MINATO_MIN_WIDTH, Math.min(MINATO_MAX_WIDTH, Math.round(width))) }),
  setMinatoFocused: (focused) => set({ minatoFocused: focused }),
  openMinatoWithTrade: (tradeId) => set({ minatoOpen: true, minatoTradeId: tradeId }),
  sidebarCollapsed: false,
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  driveStatus: "connecting",
  setDriveStatus: (status) => {
    console.info(`[BOOTSTRAP] drive_status=${status}`);
    set({ driveStatus: status });
  },
}));
