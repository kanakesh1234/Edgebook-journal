"use client";

import { useEffect } from "react";
import { useApp } from "./store";
import type { User } from "./services/auth";
import { GoogleDriveDataStore, IdbDataStore, setActiveStore } from "./services/storage";

/**
 * Runs the auth/session hydration exactly once per page load.
 *
 * Session precedence:
 *   1. Google session (server-verified) → user identity from Google;
 *      Drive store when the server confirms a working authorization,
 *      local store otherwise.
 *   2. Local account (email/password, dev path) → IndexedDB.
 *   3. Guest → login screen.
 */
let bootstrapped = false;

export function useBootstrap() {
  const init = useApp((s) => s.init);
  useEffect(() => {
    if (bootstrapped) return;
    bootstrapped = true;

    const boot = async () => {
      let googleUser: User | null = null;
      let driveConnected = false;
      try {
        const res = await fetch("/api/auth/google/session", { cache: "no-store" });
        if (res.ok) {
          const s = (await res.json()) as {
            loggedIn: boolean;
            user: User | null;
            drive: { connected: boolean };
          };
          if (s.loggedIn && s.user) {
            googleUser = s.user;
            driveConnected = s.drive.connected;
          }
        }
      } catch {
        /* server unreachable → local path */
      }

      if (googleUser) {
        // ALWAYS use the Drive store for Google-authenticated users.
        // Falling back to IndexedDB causes data "disappearance" when the
        // Drive token verification fails temporarily. The Drive store's
        // error handling will surface connection issues to the user.
        setActiveStore(new GoogleDriveDataStore());
        await init(googleUser);
        return;
      }

      const localUser = await useApp.getState().localSession();
      if (localUser) {
        setActiveStore(new IdbDataStore());
        await init(localUser);
        return;
      }

      setActiveStore(new IdbDataStore());
      await init();
    };

    void boot();
  }, [init]);
}
