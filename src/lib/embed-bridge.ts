"use client";

import { setThemeChoice, type ThemeChoice } from "./theme";

/**
 * Runtime bridge for `/embed/plan-trade` running inside the macOS Safari
 * Quick Plan floating iframe over TradingView.
 *
 * Responsibilities (zero effect on normal Edgebook pages):
 *  1. Accepts an HMAC-sealed session token via `#eb_token=...` or trusted
 *     parent `postMessage` and strips fragments from the URL immediately.
 *  2. Attaches `Authorization: Bearer <token>` on same-origin `/api/*` requests
 *     so Google Drive sync, session checks and AI endpoints work even when
 *     Safari ITP blocks cross-origin cookies inside the TradingView iframe.
 *  3. Syncs light/dark theme preferences from the user's Edgebook website state.
 *  4. Delivers clean TradingView screenshots captured by the Safari extension
 *     directly into PlanTradeFlow's attachment pipeline.
 */

type ScreenshotHandler = (file: File) => void;
type TokenChangeHandler = (token: string | null) => void;

let _initialized = false;
let _embedToken: string | null = null;
let _fetchPatched = false;
const _screenshotHandlers = new Set<ScreenshotHandler>();
const _tokenHandlers = new Set<TokenChangeHandler>();
const _queuedScreenshots: File[] = [];

function isTrustedParentOrigin(origin: string): boolean {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    if (u.protocol === "https:") {
      return (
        u.hostname === "tradingview.com" ||
        u.hostname.endsWith(".tradingview.com") ||
        u.hostname === "edgebook-journal.vercel.app"
      );
    }
    if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function getEmbedToken(): string | null {
  return _embedToken;
}

export function setEmbedToken(token: string | null): void {
  const clean = token && token.trim().length > 10 ? token.trim() : null;
  if (_embedToken === clean) return;
  _embedToken = clean;
  _tokenHandlers.forEach((fn) => fn(_embedToken));
}

export function subscribeEmbedToken(fn: TokenChangeHandler): () => void {
  _tokenHandlers.add(fn);
  return () => {
    _tokenHandlers.delete(fn);
  };
}

export function subscribeEmbedScreenshots(fn: ScreenshotHandler): () => void {
  _screenshotHandlers.add(fn);
  // Flush any screenshot captured just before PlanTradeFlow mounted/opened
  while (_queuedScreenshots.length > 0) {
    const f = _queuedScreenshots.shift();
    if (f) fn(f);
  }
  return () => {
    _screenshotHandlers.delete(fn);
  };
}

function dataUrlToFile(dataUrl: string, fileName: string): File | null {
  try {
    const [head, body] = dataUrl.split(",", 2);
    if (!head || !body) return null;
    const mimeMatch = /data:([^;]+)/.exec(head);
    const mime = mimeMatch?.[1] || "image/png";
    const bin = atob(body);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new File([arr], fileName, { type: mime });
  } catch {
    return null;
  }
}

function emitCapturedScreenshot(dataUrl: string, fileName?: string) {
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const name = fileName || `TradingView capture ${hh}.${mm}.png`;
  const file = dataUrlToFile(dataUrl, name);
  if (!file) return;
  if (_screenshotHandlers.size === 0) {
    _queuedScreenshots.push(file);
    return;
  }
  _screenshotHandlers.forEach((fn) => fn(file));
}

function installSameOriginBearerFetch() {
  if (_fetchPatched || typeof window === "undefined") return;
  _fetchPatched = true;
  const origFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (!_embedToken) return origFetch(input, init);
    try {
      const rawUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const target = new URL(rawUrl, window.location.origin);
      if (target.origin === window.location.origin && target.pathname.startsWith("/api/")) {
        const headers = new Headers(
          init?.headers ?? (input instanceof Request ? input.headers : undefined),
        );
        if (!headers.has("Authorization")) {
          headers.set("Authorization", `Bearer ${_embedToken}`);
        }
        return origFetch(input, { ...init, headers });
      }
    } catch {
      /* fall through to original fetch */
    }
    return origFetch(input, init);
  };
}

function applyThemeChoice(raw: string | null | undefined) {
  if (raw === "light" || raw === "dark" || raw === "system") {
    setThemeChoice(raw as ThemeChoice);
  }
}

/** Call once before `useBootstrap()` mounts inside `/embed/plan-trade`. */
export function bootstrapEmbedBridge(): void {
  if (_initialized || typeof window === "undefined") return;
  _initialized = true;

  // 1. Extract token/theme from `#fragment` cleanly without hitting server HTTP logs
  const hash = window.location.hash.replace(/^#/, "");
  if (hash) {
    const params = new URLSearchParams(hash);
    const token = params.get("eb_token");
    const theme = params.get("eb_theme");
    if (token) setEmbedToken(token);
    if (theme) applyThemeChoice(theme);
    params.delete("eb_token");
    params.delete("eb_theme");
    const nextHash = params.toString();
    const cleanUrl =
      window.location.pathname +
      window.location.search +
      (nextHash ? `#${nextHash}` : "");
    try {
      window.history.replaceState(null, "", cleanUrl);
    } catch {
      /* ignore */
    }
  } else {
    const sp = new URLSearchParams(window.location.search);
    applyThemeChoice(sp.get("theme"));
  }

  // 2. Patch same-origin `/api/*` fetch to forward Bearer token automatically
  installSameOriginBearerFetch();

  // 3. Listen for live extension bridge updates (theme, refreshed session, clean screenshot captures)
  window.addEventListener("message", (event: MessageEvent) => {
    if (!isTrustedParentOrigin(event.origin)) return;
    const data = event.data as {
      source?: string;
      type?: string;
      token?: string | null;
      theme?: string | null;
      dataUrl?: string;
      fileName?: string;
    } | null;
    if (!data || data.source !== "edgebook-quick-plan-host") return;

    if (data.type === "edgebook:init" || data.type === "edgebook:session") {
      if ("token" in data) setEmbedToken(data.token ?? null);
      if (data.theme) applyThemeChoice(data.theme);
    } else if (data.type === "edgebook:theme") {
      applyThemeChoice(data.theme);
    } else if (data.type === "edgebook:captured-screenshot" && data.dataUrl) {
      emitCapturedScreenshot(data.dataUrl, data.fileName);
    }
  });

  // 4. Support Option+Shift+P / Option+Shift+E even while focus sits inside the embedded iframe
  window.addEventListener(
    "keydown",
    (e: KeyboardEvent) => {
      if (e.repeat || !e.altKey || !e.shiftKey || e.metaKey || e.ctrlKey) return;
      if (e.code === "KeyP") {
        e.preventDefault();
        postToEmbedHost("edgebook:hotkey", { action: "toggle-quick-plan" });
      } else if (e.code === "KeyE") {
        e.preventDefault();
        postToEmbedHost("edgebook:hotkey", { action: "capture-clean-chart" });
      }
    },
    true,
  );
}

export function postToEmbedHost(type: string, detail?: Record<string, unknown>): void {
  if (typeof window === "undefined" || window.parent === window) return;
  try {
    window.parent.postMessage({ source: "edgebook-quick-plan-embed", type, ...detail }, "*");
  } catch {
    /* ignore */
  }
}
