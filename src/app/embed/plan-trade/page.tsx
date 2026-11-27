"use client";

import "./embed.css";
import { useEffect, useState } from "react";
import { useApp } from "@/lib/store";
import { useBootstrap } from "@/lib/bootstrap";
import { GoogleDriveDataStore, setActiveStore } from "@/lib/services/storage";
import { useUi } from "@/lib/ui-store";
import {
  bootstrapEmbedBridge,
  getEmbedToken,
  postToEmbedHost,
  subscribeEmbedToken,
} from "@/lib/embed-bridge";
import { PlanTradeFlow } from "@/components/journal/plan-trade-flow";
import { MinatoReminderPopup } from "@/components/ai/minato-reminder-popup";
import { AppErrorBoundary } from "@/components/ui/error-boundary";
import { LogoMark } from "@/components/landing/logo";

// Run synchronously on module load inside the embed route so the very first
// `useBootstrap()` fetch already carries any Safari extension Bearer token and theme.
if (typeof window !== "undefined") {
  bootstrapEmbedBridge();
}

export default function EmbedPlanTradePage() {
  return (
    <AppErrorBoundary>
      <EmbedPlanTradeShell />
    </AppErrorBoundary>
  );
}

function EmbedPlanTradeShell() {
  useBootstrap();
  const status = useApp((s) => s.status);
  const [retrying, setRetrying] = useState(false);

  // If Safari extension delivers a fresh token after initial mount while signed out, retry bootstrap cleanly
  useEffect(() => {
    return subscribeEmbedToken((token) => {
      if (token && useApp.getState().status === "guest") {
        void retryAuth();
      }
    });
  }, []);

  useEffect(() => {
    postToEmbedHost("edgebook:bridge-ready");
  }, []);

  useEffect(() => {
    postToEmbedHost("edgebook:status", { status });
  }, [status]);

  const retryAuth = async () => {
    setRetrying(true);
    try {
      const res = await fetch("/api/auth/google/session", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as {
          loggedIn: boolean;
          user: { id: string; name: string; email: string } | null;
          drive?: { state?: "connected" | "auth_required" | "temporarily_unavailable" | "not_authorized" };
        };
        if (data.loggedIn && data.user) {
          setActiveStore(new GoogleDriveDataStore());
          const ds = data.drive?.state;
          useUi.getState().setDriveStatus(
            ds === "connected" ? "connected" : ds === "auth_required" ? "auth_required" : "temporarily_unavailable",
          );
          await useApp.getState().init(data.user);
          return;
        }
      }
      await useApp.getState().init();
    } catch {
      /* stay cleanly on guest prompt */
    } finally {
      setRetrying(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="grid h-dvh w-full place-items-center bg-surface text-ink">
        <div className="flex flex-col items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-line-strong border-t-gold-strong" />
          <p className="text-[11px] font-medium tracking-[0.14em] uppercase text-faint">Opening Quick Plan</p>
        </div>
      </div>
    );
  }

  if (status === "guest") {
    const hasToken = Boolean(getEmbedToken());
    return (
      <div className="flex h-dvh w-full flex-col items-center justify-center bg-surface px-6 text-center text-ink">
        <LogoMark className="h-11 w-11" />
        <h1 className="mt-4 text-[18px] font-semibold tracking-[-0.02em] text-ink">
          {hasToken ? "Reconnect Edgebook" : "Sign in to Edgebook"}
        </h1>
        <p className="mt-1.5 max-w-[260px] text-[13px] leading-snug text-muted">
          Sign in on Edgebook in Safari so Quick Plan can sync your rules, journal, and Google Drive charts here.
        </p>

        <div className="mt-5 flex w-full max-w-[240px] flex-col gap-2">
          <a
            href="/login?embed=1"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-10 w-full items-center justify-center rounded-full bg-gradient-to-b from-gold-strong to-gold-deep px-4 text-[13.5px] font-semibold text-on-gold shadow-[0_6px_14px_-6px_var(--gold-strong)] transition-all hover:brightness-110 active:scale-[0.98]"
          >
            Sign in on Edgebook
          </a>
          <button
            type="button"
            disabled={retrying}
            onClick={() => {
              postToEmbedHost("edgebook:request-session");
              void retryAuth();
            }}
            className="inline-flex h-9 w-full items-center justify-center rounded-full border border-line bg-raised px-4 text-[12.5px] font-medium text-muted transition-colors hover:border-line-strong hover:text-ink disabled:opacity-50"
          >
            {retrying ? "Checking…" : "I’m signed in — Retry"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="eb-embed-flow h-dvh w-full overflow-hidden bg-surface text-ink">
      <PlanTradeFlow
        open={true}
        embedded={true}
        onClose={() => postToEmbedHost("edgebook:close")}
      />
      <MinatoReminderPopup />
    </div>
  );
}
