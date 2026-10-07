"use client";

/**
 * Supabase Working-Memory Integration
 *
 * Connects the Supabase fast-state layer to the existing app without changing
 * the Drive persistence architecture at all:
 *
 *   UI change → Zustand store → Supabase (instant) → Drive (queued)
 *                                                    ↓
 *                                         Supabase record deleted
 *                                         on Drive confirmation
 *
 * Provides hooks and helpers for:
 *   1. Auto-saving drafts (entry/plan form state) to Supabase
 *   2. Recovering unsaved drafts on page reload
 *   3. Session heartbeats for multi-tab awareness
 *   4. Wrapping the existing persist() chain with Supabase bookkeeping
 */

import { useEffect, useRef, useCallback } from "react";
import { getWorkingMemory, clearWorkingMemory, type DraftType, type WorkingDraft } from "./services/supabase-memory";

/* ------------------------------------------------------------------ */
/*  Snapshot lifecycle — fast write to Supabase, cleanup after Drive   */
/* ------------------------------------------------------------------ */

/**
 * Save a journal snapshot to Supabase working memory BEFORE the Drive
 * write begins. Called from the store's persist() path.
 *
 * Returns a cleanup function that marks the snapshot as persisted and
 * schedules deletion. Failures are swallowed — Supabase is advisory.
 */
export async function snapshotToWorkingMemory(
  userId: string,
  snapshotKey: string,
  payload: unknown,
): Promise<() => void> {
  try {
    const wm = getWorkingMemory(userId);
    await wm.saveDraft("journal_snapshot", snapshotKey, payload);
  } catch {
    // Supabase failure must never block the critical Drive path.
  }

  return () => {
    // Fire-and-forget: mark as persisted, then delete.
    try {
      const wm = getWorkingMemory(userId);
      void wm.markDraftPersisted("journal_snapshot", snapshotKey).then(() =>
        wm.deleteDraft("journal_snapshot", snapshotKey),
      );
    } catch {
      /* swallow */
    }
  };
}

/**
 * Notify Supabase that a Drive write failed, so the snapshot stays available
 * for recovery.
 */
export function markSnapshotFailed(userId: string, snapshotKey: string): void {
  try {
    const wm = getWorkingMemory(userId);
    void wm.saveDraft("journal_snapshot", snapshotKey, { failedAt: Date.now() });
  } catch {
    /* swallow */
  }
}

/* ------------------------------------------------------------------ */
/*  Draft auto-save hook — for form components                        */
/* ------------------------------------------------------------------ */

/**
 * Auto-saves an in-progress draft to Supabase at a debounced interval.
 * When the user finishes (submits), call the returned `discard()`.
 *
 * Usage in a form component:
 *   const { discard } = useDraftAutoSave(userId, 'entry', entryId, draft);
 *   // on submit:
 *   discard();
 */
export function useDraftAutoSave(
  userId: string | null,
  type: DraftType,
  key: string,
  draft: unknown,
  debounceMs = 2000,
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  useEffect(() => {
    if (!userId || !key) return;
    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      try {
        const wm = getWorkingMemory(userId);
        void wm.saveDraft(type, key, draftRef.current);
      } catch {
        /* swallow */
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [userId, type, key, draft, debounceMs]);

  const discard = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!userId || !key) return;
    try {
      const wm = getWorkingMemory(userId);
      void wm.deleteDraft(type, key);
    } catch {
      /* swallow */
    }
  }, [userId, type, key]);

  return { discard };
}

/**
 * Recover any unsaved drafts of a given type on mount. Returns them once
 * and then lets the component decide what to do (restore or discard).
 */
export async function recoverDrafts(
  userId: string,
  type: DraftType,
): Promise<WorkingDraft[]> {
  try {
    const wm = getWorkingMemory(userId);
    return await wm.loadDrafts(type);
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */
/*  Session heartbeat hook                                             */
/* ------------------------------------------------------------------ */

const HEARTBEAT_INTERVAL = 60_000; // 1 minute

/**
 * Registers this browser tab as an active session and sends periodic
 * heartbeats so stale sessions can be pruned.
 *
 * Used in the root layout or shell component.
 */
export function useSessionHeartbeat(userId: string | null, currentView?: string) {
  const registeredRef = useRef(false);

  useEffect(() => {
    if (!userId) return;

    const wm = getWorkingMemory(userId);

    if (!registeredRef.current) {
      void wm.registerSession(currentView);
      registeredRef.current = true;
    }

    const interval = setInterval(() => {
      void wm.heartbeat(currentView);
    }, HEARTBEAT_INTERVAL);

    const handleUnload = () => {
      // Best-effort session cleanup on tab close.
      void wm.endSession();
    };
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      clearInterval(interval);
      window.removeEventListener("beforeunload", handleUnload);
    };
  }, [userId, currentView]);

  // Cleanup on sign-out (userId goes null).
  useEffect(() => {
    return () => {
      if (!userId) {
        clearWorkingMemory();
        registeredRef.current = false;
      }
    };
  }, [userId]);
}

/* ------------------------------------------------------------------ */
/*  Cleanup utility                                                    */
/* ------------------------------------------------------------------ */

/**
 * Run periodic cleanup of stale Supabase records.
 * Call once after successful bootstrap.
 */
export function scheduleWorkingMemoryCleanup(userId: string): void {
  try {
    const wm = getWorkingMemory(userId);
    // Immediate cleanup of any persisted drafts from previous sessions
    void wm.cleanupPersistedDrafts();
  } catch {
    /* swallow */
  }
}
