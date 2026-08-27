"use client";

import { useEffect } from "react";
import { useApp } from "./store";
import type { User } from "./services/auth";
import { GoogleDriveDataStore, IdbDataStore, setActiveStore } from "./services/storage";
import { useUi, type DriveStatus } from "./ui-store";

/**
 * Runs the auth/session hydration exactly once per page load.
 *
 * Session precedence:
 *   1. Google session (server-verified) → GoogleDriveDataStore ALWAYS.
 *      Transient Drive problems set driveStatus=temporarily_unavailable but
 *      NEVER log the user out, NEVER clear data, NEVER switch to IndexedDB.
 *   2. Local account (email/password, dev path) → IndexedDB.
 *   3. Guest → login screen (only after conclusive answers, with retries).
 */
let bootstrapped = false;

export function useBootstrap() {
  const init = useApp((s) => s.init);
  const setDriveStatus = useUi((s) => s.setDriveStatus);
  useEffect(() => {
    if (bootstrapped) return;
    bootstrapped = true;

    const boot = async () => {
      let googleUser: User | null = null;
      let driveState: "connected" | "auth_required" | "temporarily_unavailable" | "not_authorized" | null = null;
      let serverReachable = false;
      type SessionDriveState = NonNullable<typeof driveState>;

      // Ask the server up to 3 times before concluding. A single failed or
      // slow response (dev-server cold start, transient network) must never
      // bounce an authenticated user back to /login.
      for (let attempt = 1; attempt <= 3; attempt++) {
        console.info(`[BOOTSTRAP] session_check_start attempt=${attempt}`);
        try {
          const res = await fetch("/api/auth/google/session", { cache: "no-store" });
          if (res.ok) {
            serverReachable = true;
            const s = (await res.json()) as {
              loggedIn: boolean;
              user: User | null;
              drive: { connected: boolean; state: SessionDriveState };
            };
            if (s.loggedIn && s.user) {
              googleUser = s.user;
              driveState = s.drive?.state ?? (s.drive?.connected ? "connected" : "temporarily_unavailable");
            }
            console.info(`[BOOTSTRAP] session_check_success loggedIn=${s.loggedIn} drive=${driveState ?? "n/a"}`);
            break; // conclusive
          }
          if (res.status === 401 || res.status === 403) {
            serverReachable = true;
            console.info(`[BOOTSTRAP] session_check_failed status=${res.status} (conclusive guest)`);
            break; // definitive rejection
          }
          console.info(`[BOOTSTRAP] session_check_retry status=${res.status}`);
        } catch {
          console.info("[BOOTSTRAP] session_check_retry network_error");
        }
        await new Promise((r) => setTimeout(r, attempt * 350));
      }

      if (googleUser) {
        // Google Drive is the ONLY store for Google-authenticated users.
        // A temporary failure keeps the session and in-memory data intact.
        setActiveStore(new GoogleDriveDataStore());
        setDriveStatus(
          driveState === "connected" ? "connected"
          : driveState === "auth_required" ? "auth_required"
          : "temporarily_unavailable",
        );
        console.info(`[BOOTSTRAP] bootstrap_authenticated drive=${driveState}`);
        await init(googleUser);
        return;
      }

      // No conclusive Google session → local/guest paths.
      if (!googleUser && serverReachable && driveState === null) {
        setDriveStatus("connecting");
      }
      const localUser = await useApp.getState().localSession();
      if (localUser) {
        setActiveStore(new IdbDataStore());
        await init(localUser);
        return;
      }

      setActiveStore(new IdbDataStore());
      console.info("[BOOTSTRAP] bootstrap_guest");
      await init();
    };

    void boot();
  }, [init, setDriveStatus]);
}
