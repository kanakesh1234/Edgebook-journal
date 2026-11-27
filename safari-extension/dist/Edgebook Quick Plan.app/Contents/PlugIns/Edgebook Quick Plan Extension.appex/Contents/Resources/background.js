/* Background service worker for Edgebook Quick Plan (macOS Safari MV3).
 *
 * Responsibilities:
 *  1. Handles toolbar clicks & Safari `commands` hotkeys (`Option+Shift+P`, `Option+Shift+E`).
 *  2. Coordinates clean TradingView screenshot capture (hide -> captureVisibleTab -> restore -> attach).
 *  3. Fetches HMAC-sealed Edgebook session tokens from the user's logged-in first-party session
 *     when Safari ITP blocks cookies inside TradingView's third-party iframe.
 */

const EDGEBOOK_ORIGIN = "https://edgebook-journal.vercel.app";
const api = globalThis.browser ?? globalThis.chrome;

const STORAGE_KEYS = {
  token: "eb_session_token",
  user: "eb_session_user",
  theme: "eb_theme",
  windowState: "eb_window_state",
};

const lastCommandAt = new Map();
const DEDUP_MS = 350;

function shouldSkipDuplicate(tabId, commandName) {
  const key = `${tabId}:${commandName}`;
  const now = Date.now();
  const prev = lastCommandAt.get(key) ?? 0;
  if (now - prev < DEDUP_MS) return true;
  lastCommandAt.set(key, now);
  return false;
}

function isTradingViewUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && (u.hostname === "tradingview.com" || u.hostname.endsWith(".tradingview.com"));
  } catch {
    return false;
  }
}

async function getActiveTab() {
  const tabs = await api.tabs.query({ active: true, currentWindow: true });
  return tabs[0] ?? null;
}

async function fetchFirstPartySession() {
  try {
    const res = await fetch(`${EDGEBOOK_ORIGIN}/api/embed/session`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data.loggedIn && data.token) {
        await api.storage.local.set({
          [STORAGE_KEYS.token]: data.token,
          [STORAGE_KEYS.user]: data.user ?? null,
        });
        return { loggedIn: true, token: data.token, user: data.user ?? null };
      }
    }
    if (res.status === 401) {
      // Only clear if definitively unauthenticated cleanly
      const stored = await api.storage.local.get([STORAGE_KEYS.token, STORAGE_KEYS.user]);
      return {
        loggedIn: false,
        token: stored[STORAGE_KEYS.token] ?? null,
        user: stored[STORAGE_KEYS.user] ?? null,
      };
    }
  } catch {
    /* ignore transient offline network error; fall back to cached state */
  }
  const stored = await api.storage.local.get([STORAGE_KEYS.token, STORAGE_KEYS.user]);
  return {
    loggedIn: Boolean(stored[STORAGE_KEYS.token]),
    token: stored[STORAGE_KEYS.token] ?? null,
    user: stored[STORAGE_KEYS.user] ?? null,
  };
}

async function getCommandDiagnostics() {
  try {
    const list = await api.commands.getAll();
    const byName = {};
    for (const c of list || []) {
      byName[c.name] = {
        shortcut: c.shortcut || "",
        description: c.description || "",
        accepted: Boolean(c.shortcut && c.shortcut.trim().length > 0),
      };
    }
    return byName;
  } catch {
    return {};
  }
}

async function getOverlayBootstrap() {
  const [session, stored, commands] = await Promise.all([
    fetchFirstPartySession(),
    api.storage.local.get([STORAGE_KEYS.theme, STORAGE_KEYS.windowState]),
    getCommandDiagnostics(),
  ]);
  return {
    token: session.token,
    user: session.user,
    theme: stored[STORAGE_KEYS.theme] || "system",
    windowState: stored[STORAGE_KEYS.windowState] || null,
    commands,
  };
}

async function toggleOnTab(tab) {
  if (!tab?.id || !isTradingViewUrl(tab.url)) {
    await api.tabs.create({ url: `${EDGEBOOK_ORIGIN}/dashboard` });
    return;
  }
  const bootstrap = await getOverlayBootstrap();
  try {
    await api.tabs.sendMessage(tab.id, { type: "EDGEBOOK_TOGGLE", bootstrap });
  } catch {
    /* content script not injected on non-chart frame */
  }
}

async function runCleanCaptureOnTab(tab) {
  if (!tab?.id || !isTradingViewUrl(tab.url)) return { ok: false, error: "not_tradingview" };
  const bootstrap = await getOverlayBootstrap();
  let wasVisible = false;
  try {
    const hideAck = await api.tabs.sendMessage(tab.id, { type: "EDGEBOOK_HIDE_FOR_CAPTURE" });
    wasVisible = Boolean(hideAck?.wasVisible);
    // Allow WebKit compositor an extra beat after opacity/display hidden commit
    await new Promise((r) => setTimeout(r, 90));
    const dataUrl = await api.tabs.captureVisibleTab(tab.windowId, { format: "png" });
    await api.tabs.sendMessage(tab.id, {
      type: "EDGEBOOK_RESTORE_WITH_CAPTURE",
      dataUrl,
      wasVisible,
      bootstrap,
    });
    return { ok: true };
  } catch (err) {
    try {
      await api.tabs.sendMessage(tab.id, {
        type: "EDGEBOOK_RESTORE_AFTER_ERROR",
        wasVisible,
        message: err?.message || "Capture requires permission on TradingView.",
      });
    } catch {
      /* ignore */
    }
    return { ok: false, error: err?.message || "capture_failed" };
  }
}

// Broadcast theme or token updates to all TradingView tabs immediately
async function broadcastToTradingView(message) {
  try {
    const tabs = await api.tabs.query({ url: ["https://*.tradingview.com/*"] });
    for (const tab of tabs) {
      if (tab.id) {
        api.tabs.sendMessage(tab.id, message).catch(() => {});
      }
    }
  } catch {
    /* ignore */
  }
}

// Toolbar click toggles the persistent floating window on TradingView
api.action.onClicked.addListener(async (tab) => {
  await toggleOnTab(tab);
});

// Registered macOS Safari commands API (`Option+Shift+P` and `Option+Shift+E`)
if (api.commands?.onCommand) {
  api.commands.onCommand.addListener(async (command, tab) => {
    const targetTab = tab?.id ? tab : await getActiveTab();
    if (!targetTab?.id) return;
    if (shouldSkipDuplicate(targetTab.id, command)) return;
    if (command === "toggle-quick-plan") {
      await toggleOnTab(targetTab);
    } else if (command === "capture-clean-chart") {
      await runCleanCaptureOnTab(targetTab);
    }
  });
}

// Keep overlay synced when theme or session changes on Edgebook tab
api.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== "local") return;
  if (changes[STORAGE_KEYS.theme]) {
    void broadcastToTradingView({
      type: "EDGEBOOK_THEME_UPDATE",
      theme: changes[STORAGE_KEYS.theme].newValue || "system",
    });
  }
  if (changes[STORAGE_KEYS.token]) {
    void broadcastToTradingView({
      type: "EDGEBOOK_SESSION_UPDATE",
      token: changes[STORAGE_KEYS.token].newValue ?? null,
    });
  }
});

api.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || typeof msg !== "object") return undefined;

  if (msg.type === "EDGEBOOK_GET_BOOTSTRAP") {
    return getOverlayBootstrap();
  }

  if (msg.type === "EDGEBOOK_SYNC_FROM_SITE") {
    const update = {};
    if ("theme" in msg) update[STORAGE_KEYS.theme] = msg.theme || "system";
    if ("token" in msg) {
      update[STORAGE_KEYS.token] = msg.token || null;
      update[STORAGE_KEYS.user] = msg.user || null;
    }
    return api.storage.local.set(update).then(() => ({ ok: true }));
  }

  if (msg.type === "EDGEBOOK_CAPTURE_REQUEST") {
    const tab = sender?.tab;
    if (tab?.id && shouldSkipDuplicate(tab.id, "capture-clean-chart")) {
      return Promise.resolve({ ok: true, deduped: true });
    }
    return (tab?.id ? Promise.resolve(tab) : getActiveTab()).then((t) => runCleanCaptureOnTab(t));
  }

  if (msg.type === "EDGEBOOK_PAGE_HOTKEY") {
    const tab = sender?.tab;
    if (!tab?.id) return Promise.resolve({ ok: false });
    if (shouldSkipDuplicate(tab.id, msg.action)) {
      return Promise.resolve({ ok: true, deduped: true });
    }
    if (msg.action === "toggle-quick-plan") {
      return toggleOnTab(tab).then(() => ({ ok: true }));
    }
    if (msg.action === "capture-clean-chart") {
      return runCleanCaptureOnTab(tab);
    }
  }

  return undefined;
});
