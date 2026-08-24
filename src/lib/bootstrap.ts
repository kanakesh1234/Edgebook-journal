"use client";

import { useEffect } from "react";
import { useApp } from "./store";
import { GoogleDriveDataStore, IdbDataStore, setActiveStore } from "./services/storage";

/**
 * Runs the auth/session hydration exactly once per page load.
 *
 * Backend Phase A: before hydrating the journal, ask the server whether a
 * Google Drive session exists. Connected → persist through the user's
 * Drive (server-resolved, session-bound). Not connected or not configured
 * → local IndexedDB, exactly as before. Failure to reach the server
 * (offline dev) also falls back to local.
 */
let bootstrapped = false;

export function useBootstrap() {
  const init = useApp((s) => s.init);
  useEffect(() => {
    if (bootstrapped) return;
    bootstrapped = true;

    const boot = async () => {
      try {
        const res = await fetch("/api/auth/google/session", { cache: "no-store" });
        if (res.ok) {
          const session = (await res.json()) as { configured: boolean; connected: boolean };
          if (session.configured && session.connected) {
            setActiveStore(new GoogleDriveDataStore());
          } else {
            setActiveStore(new IdbDataStore());
          }
        } else {
          setActiveStore(new IdbDataStore());
        }
      } catch {
        setActiveStore(new IdbDataStore());
      }
      await init();
    };

    void boot();
  }, [init]);
}
