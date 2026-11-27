/* Persistent draggable/resizable/minimizable floating Quick Plan window on TradingView. */
(() => {
  if (window.__edgebookQuickPlanInjected) return;
  window.__edgebookQuickPlanInjected = true;

  const EDGEBOOK_ORIGIN = "https://edgebook-journal.vercel.app";
  const api = globalThis.browser ?? globalThis.chrome;
  const WINDOW_KEY = "eb_window_state";

  const DEFAULT_STATE = {
    open: false,
    minimized: false,
    width: 380,
    height: 560,
    left: null,
    top: 76,
  };

  let state = { ...DEFAULT_STATE };
  let themeChoice = "system";
  let sessionToken = null;
  let registeredCommands = {};
  let iframeReady = false;
  let pendingCaptures = [];
  let manualHideTimer = null;

  let rootEl = null;
  let iframeEl = null;
  let badgeEl = null;
  let popoverEl = null;
  let infoBtnEl = null;
  let toastEl = null;
  let toastTimer = null;

  function resolveTheme(choice) {
    if (choice === "light" || choice === "dark") return choice;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme() {
    if (!rootEl) return;
    rootEl.setAttribute("data-eb-theme", resolveTheme(themeChoice));
  }

  window.matchMedia?.("(prefers-color-scheme: dark)")?.addEventListener("change", () => {
    if (themeChoice === "system") applyTheme();
  });

  function clampPosition(left, top, width, height, minimized) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const effW = minimized ? 210 : width;
    const effH = minimized ? 42 : height;
    const rawLeft = left == null ? vw - effW - 22 : left;
    const clampedLeft = Math.max(8, Math.min(vw - effW - 8, rawLeft));
    const clampedTop = Math.max(8, Math.min(vh - effH - 8, top ?? 76));
    return { left: Math.round(clampedLeft), top: Math.round(clampedTop) };
  }

  function saveWindowState() {
    if (!api?.storage?.local) return;
    void api.storage.local.set({ [WINDOW_KEY]: state }).catch(() => {});
  }

  function applyLayout() {
    if (!rootEl) return;
    const { left, top } = clampPosition(state.left, state.top, state.width, state.height, state.minimized);
    state.left = left;
    state.top = top;

    rootEl.classList.toggle("is-hidden", !state.open);
    rootEl.classList.toggle("is-minimized", Boolean(state.minimized));

    rootEl.style.left = `${left}px`;
    rootEl.style.top = `${top}px`;
    if (!state.minimized) {
      rootEl.style.width = `${state.width}px`;
      rootEl.style.height = `${state.height}px`;
    }
  }

  function buildEmbedUrl() {
    const hashParams = new URLSearchParams();
    if (sessionToken) hashParams.set("eb_token", sessionToken);
    if (themeChoice) hashParams.set("eb_theme", themeChoice);
    const hash = hashParams.toString();
    return `${EDGEBOOK_ORIGIN}/embed/plan-trade${hash ? `#${hash}` : ""}`;
  }

  function postToEmbed(payload) {
    if (!iframeEl?.contentWindow) return;
    try {
      iframeEl.contentWindow.postMessage(
        { source: "edgebook-quick-plan-host", ...payload },
        EDGEBOOK_ORIGIN,
      );
    } catch {
      /* ignore before origin ready */
    }
  }

  function flushCaptures() {
    if (!iframeReady || pendingCaptures.length === 0) return;
    const copy = pendingCaptures.splice(0, pendingCaptures.length);
    for (const item of copy) {
      postToEmbed({
        type: "edgebook:captured-screenshot",
        dataUrl: item.dataUrl,
        fileName: item.fileName,
      });
    }
  }

  function showMiniToast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      if (toastEl) toastEl.hidden = true;
    }, 2400);
  }

  function refreshShortcutsPopover() {
    if (!popoverEl) return;
    const pCmd = registeredCommands["toggle-quick-plan"];
    const eCmd = registeredCommands["capture-clean-chart"];
    const pAccepted = pCmd?.accepted;
    const eAccepted = eCmd?.accepted;
    const pLabel = pCmd?.shortcut || "⌥⇧P (fallback active)";
    const eLabel = eCmd?.shortcut || "⌥⇧E (fallback active)";

    popoverEl.innerHTML = `
      <div class="eb-qp-pop-h">
        <span>Quick Plan Shortcuts</span>
        <span style="font-size:11px;color:${sessionToken ? "var(--eb-profit)" : "var(--eb-muted)"}">${sessionToken ? "Connected" : "Sign in"}</span>
      </div>
      <div class="eb-qp-shortcut-row">
        <div>
          <span style="font-weight:500">Toggle Quick Plan</span>
          <span class="eb-qp-pop-sub">${pAccepted ? "Safari command registered" : "Active over TradingView"}</span>
        </div>
        <kbd class="eb-qp-kbd">${pLabel}</kbd>
      </div>
      <div class="eb-qp-shortcut-row">
        <div>
          <span style="font-weight:500">Capture Clean Chart</span>
          <span class="eb-qp-pop-sub">${eAccepted ? "Safari command registered" : "Auto-hides window, attaches PNG"}</span>
        </div>
        <kbd class="eb-qp-kbd">${eLabel}</kbd>
      </div>
      <div class="eb-qp-pop-actions">
        <button type="button" class="eb-qp-pop-btn" data-act="sync">Sync Session</button>
        <button type="button" class="eb-qp-pop-btn" data-act="reset-pos">Reset 380×560</button>
      </div>
    `;
  }

  function createFloatingWindow() {
    if (rootEl) return;

    rootEl = document.createElement("section");
    rootEl.className = "eb-qp-root is-hidden";
    rootEl.setAttribute("aria-label", "Edgebook Quick Plan");
    applyTheme();

    const titlebar = document.createElement("header");
    titlebar.className = "eb-qp-titlebar";

    titlebar.innerHTML = `
      <div class="eb-qp-brand">
        <span class="eb-qp-logo" aria-hidden="true">E</span>
        <span class="eb-qp-title">Quick Plan</span>
        <span class="eb-qp-badge" hidden></span>
      </div>
      <div class="eb-qp-actions">
        <button type="button" class="eb-qp-btn" data-btn="capture" title="Capture clean TradingView chart (⌥⇧E)" aria-label="Capture clean chart (Option+Shift+E)">
          <svg viewBox="0 0 24 24"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6h2l1.3-1.8a1.5 1.5 0 0 1 1.2-.6h2a1.5 1.5 0 0 1 1.2.6L15.5 6h2A2.5 2.5 0 0 1 20 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 17.5v-9Z"/><circle cx="12" cy="12.5" r="3.2"/></svg>
        </button>
        <button type="button" class="eb-qp-btn" data-btn="hide-temp" title="Hide 6s for macOS screenshot (⌘⇧4 + ⌘V)" aria-label="Hide temporarily for macOS screenshot">
          <svg viewBox="0 0 24 24"><path d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z"/><circle cx="12" cy="12" r="2.5"/></svg>
        </button>
        <button type="button" class="eb-qp-btn" data-btn="info" title="Shortcuts & session settings (⌥⇧P / ⌥⇧E)" aria-label="Shortcuts and connection">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 10v6"/><circle cx="12" cy="7.5" r="0.6" fill="currentColor" stroke="none"/></svg>
        </button>
        <button type="button" class="eb-qp-btn" data-btn="minimize" title="Minimize / Restore" aria-label="Minimize or restore window">
          <svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>
        </button>
        <button type="button" class="eb-qp-btn" data-btn="close" title="Hide Quick Plan (⌥⇧P)" aria-label="Hide Quick Plan (Option+Shift+P)">
          <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>
        </button>
      </div>
    `;

    badgeEl = titlebar.querySelector(".eb-qp-badge");
    infoBtnEl = titlebar.querySelector('[data-btn="info"]');

    const body = document.createElement("div");
    body.className = "eb-qp-body";

    iframeEl = document.createElement("iframe");
    iframeEl.className = "eb-qp-iframe";
    iframeEl.setAttribute("allow", "clipboard-read; clipboard-write");
    iframeEl.addEventListener("load", () => {
      // Wait one tick after browser load for Next.js hydration, or flush on bridge-ready
      setTimeout(() => {
        iframeReady = true;
        postToEmbed({ type: "edgebook:init", token: sessionToken, theme: themeChoice });
        flushCaptures();
      }, 150);
    });
    body.appendChild(iframeEl);

    popoverEl = document.createElement("div");
    popoverEl.className = "eb-qp-popover";
    popoverEl.hidden = true;
    popoverEl.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const act = btn.getAttribute("data-act");
      if (act === "sync") {
        void syncBootstrap(true);
        showMiniToast("Syncing Edgebook session…");
      } else if (act === "reset-pos") {
        state.width = DEFAULT_STATE.width;
        state.height = DEFAULT_STATE.height;
        state.left = null;
        state.top = DEFAULT_STATE.top;
        state.minimized = false;
        applyLayout();
        saveWindowState();
      }
      popoverEl.hidden = true;
      infoBtnEl?.classList.remove("is-active");
    });

    toastEl = document.createElement("div");
    toastEl.className = "eb-qp-toast";
    toastEl.hidden = true;

    const resizeHandle = document.createElement("div");
    resizeHandle.className = "eb-qp-resize";
    resizeHandle.title = "Resize Quick Plan";

    rootEl.appendChild(titlebar);
    rootEl.appendChild(body);
    rootEl.appendChild(popoverEl);
    rootEl.appendChild(toastEl);
    rootEl.appendChild(resizeHandle);
    document.documentElement.appendChild(rootEl);

    // Wire title bar button clicks (ignore drag when pressing buttons)
    titlebar.addEventListener("pointerdown", (e) => {
      if (e.target.closest(".eb-qp-actions")) {
        e.stopPropagation();
        return;
      }
      if (e.button !== 0) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const origLeft = state.left ?? (window.innerWidth - state.width - 22);
      const origTop = state.top ?? 76;
      rootEl.classList.add("is-dragging");
      titlebar.setPointerCapture(e.pointerId);

      const onMove = (ev) => {
        const next = clampPosition(
          origLeft + (ev.clientX - startX),
          origTop + (ev.clientY - startY),
          state.width,
          state.height,
          state.minimized,
        );
        state.left = next.left;
        state.top = next.top;
        rootEl.style.left = `${next.left}px`;
        rootEl.style.top = `${next.top}px`;
      };
      const onUp = () => {
        rootEl.classList.remove("is-dragging");
        titlebar.removeEventListener("pointermove", onMove);
        titlebar.removeEventListener("pointerup", onUp);
        titlebar.removeEventListener("pointercancel", onUp);
        saveWindowState();
      };
      titlebar.addEventListener("pointermove", onMove);
      titlebar.addEventListener("pointerup", onUp);
      titlebar.addEventListener("pointercancel", onUp);
    });

    titlebar.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-btn]");
      if (!btn) return;
      const act = btn.getAttribute("data-btn");
      if (act === "capture") {
        void api.runtime.sendMessage({ type: "EDGEBOOK_CAPTURE_REQUEST" });
      } else if (act === "hide-temp") {
        hideTemporarilyForNativeCapture();
      } else if (act === "info") {
        refreshShortcutsPopover();
        const show = popoverEl.hidden;
        popoverEl.hidden = !show;
        infoBtnEl?.classList.toggle("is-active", show);
      } else if (act === "minimize") {
        popoverEl.hidden = true;
        infoBtnEl?.classList.remove("is-active");
        state.minimized = !state.minimized;
        applyLayout();
        saveWindowState();
      } else if (act === "close") {
        setWindowOpen(false);
      }
    });

    // Resize drag
    resizeHandle.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || state.minimized) return;
      e.stopPropagation();
      const startX = e.clientX;
      const startY = e.clientY;
      const origW = state.width;
      const origH = state.height;
      rootEl.classList.add("is-resizing");
      resizeHandle.setPointerCapture(e.pointerId);

      const onMove = (ev) => {
        const maxW = Math.min(540, window.innerWidth - (state.left ?? 16) - 8);
        const maxH = Math.min(820, window.innerHeight - (state.top ?? 16) - 8);
        state.width = Math.max(320, Math.min(maxW, Math.round(origW + (ev.clientX - startX))));
        state.height = Math.max(420, Math.min(maxH, Math.round(origH + (ev.clientY - startY))));
        rootEl.style.width = `${state.width}px`;
        rootEl.style.height = `${state.height}px`;
      };
      const onUp = () => {
        rootEl.classList.remove("is-resizing");
        resizeHandle.removeEventListener("pointermove", onMove);
        resizeHandle.removeEventListener("pointerup", onUp);
        resizeHandle.removeEventListener("pointercancel", onUp);
        saveWindowState();
      };
      resizeHandle.addEventListener("pointermove", onMove);
      resizeHandle.addEventListener("pointerup", onUp);
      resizeHandle.addEventListener("pointercancel", onUp);
    });
  }

  function ensureIframeLoaded() {
    createFloatingWindow();
    if (!iframeEl.getAttribute("src")) {
      iframeReady = false;
      iframeEl.src = buildEmbedUrl();
    }
  }

  function setWindowOpen(nextOpen) {
    if (manualHideTimer) {
      clearTimeout(manualHideTimer);
      manualHideTimer = null;
    }
    createFloatingWindow();
    state.open = nextOpen;
    if (nextOpen) {
      state.minimized = false;
      ensureIframeLoaded();
      postToEmbed({ type: "edgebook:session", token: sessionToken, theme: themeChoice });
    } else if (popoverEl) {
      popoverEl.hidden = true;
      infoBtnEl?.classList.remove("is-active");
    }
    applyLayout();
    saveWindowState();
  }

  function hideTemporarilyForNativeCapture() {
    if (!rootEl) return;
    if (manualHideTimer) clearTimeout(manualHideTimer);
    state.open = false;
    applyLayout();
    manualHideTimer = setTimeout(() => {
      manualHideTimer = null;
      setWindowOpen(true);
      showMiniToast("Paste in Chart with ⌘V");
    }, 6000);
  }

  async function syncBootstrap(pushToIframe = false) {
    try {
      const b = await api.runtime.sendMessage({ type: "EDGEBOOK_GET_BOOTSTRAP" });
      if (!b) return;
      if (b.theme) themeChoice = b.theme;
      if ("token" in b) sessionToken = b.token;
      if (b.commands) registeredCommands = b.commands;
      applyTheme();
      refreshShortcutsPopover();
      if (pushToIframe && iframeEl?.getAttribute("src")) {
        postToEmbed({ type: "edgebook:session", token: sessionToken, theme: themeChoice });
      }
      return b;
    } catch {
      return null;
    }
  }

  // Listen to messages from `/embed/plan-trade` iframe
  window.addEventListener("message", (event) => {
    if (event.origin !== EDGEBOOK_ORIGIN) return;
    const data = event.data;
    if (!data || data.source !== "edgebook-quick-plan-embed") return;

    if (data.type === "edgebook:bridge-ready") {
      iframeReady = true;
      postToEmbed({ type: "edgebook:init", token: sessionToken, theme: themeChoice });
      flushCaptures();
    } else if (data.type === "edgebook:close") {
      setWindowOpen(false);
    } else if (data.type === "edgebook:request-session") {
      void syncBootstrap(true);
    } else if (data.type === "edgebook:capture-request") {
      void api.runtime.sendMessage({ type: "EDGEBOOK_CAPTURE_REQUEST" });
    } else if (data.type === "edgebook:hotkey" && data.action) {
      void api.runtime.sendMessage({ type: "EDGEBOOK_PAGE_HOTKEY", action: data.action });
    } else if (data.type === "edgebook:state" && badgeEl) {
      const n = data.attachedCount || 0;
      badgeEl.hidden = n === 0;
      badgeEl.textContent = n > 0 ? `${n}/2` : "";
    }
  });

  // Fallback keyboard handler when focus is on TradingView chart (never steals text inputs,
  // and deduplicated in background against native Safari `commands.onCommand`)
  function isEditableElement(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    return el.getAttribute("role") === "textbox";
  }

  window.addEventListener(
    "keydown",
    (e) => {
      if (e.repeat || !e.altKey || !e.shiftKey || e.metaKey || e.ctrlKey) return;
      if (isEditableElement(e.target)) return;
      if (e.code === "KeyP") {
        e.preventDefault();
        void api.runtime.sendMessage({ type: "EDGEBOOK_PAGE_HOTKEY", action: "toggle-quick-plan" });
      } else if (e.code === "KeyE") {
        e.preventDefault();
        void api.runtime.sendMessage({ type: "EDGEBOOK_PAGE_HOTKEY", action: "capture-clean-chart" });
      }
    },
    true,
  );

  // Keep window inside viewport on macOS window resize
  window.addEventListener("resize", () => {
    if (state.open) applyLayout();
  });

  // Messages from background service worker
  api.runtime.onMessage.addListener((msg) => {
    if (!msg || typeof msg !== "object") return undefined;

    if (msg.type === "EDGEBOOK_TOGGLE") {
      if (msg.bootstrap) {
        themeChoice = msg.bootstrap.theme || themeChoice;
        if ("token" in msg.bootstrap) sessionToken = msg.bootstrap.token;
        if (msg.bootstrap.commands) registeredCommands = msg.bootstrap.commands;
        applyTheme();
      }
      setWindowOpen(!state.open);
      return Promise.resolve({ open: state.open });
    }

    if (msg.type === "EDGEBOOK_HIDE_FOR_CAPTURE") {
      const wasVisible = Boolean(state.open && !rootEl?.classList.contains("is-hidden"));
      if (rootEl) {
        rootEl.style.transition = "none";
        rootEl.classList.add("is-hidden");
      }
      return new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve({ wasVisible })));
      });
    }

    if (msg.type === "EDGEBOOK_RESTORE_WITH_CAPTURE") {
      if (msg.bootstrap) {
        themeChoice = msg.bootstrap.theme || themeChoice;
        if ("token" in msg.bootstrap) sessionToken = msg.bootstrap.token;
        if (msg.bootstrap.commands) registeredCommands = msg.bootstrap.commands;
        applyTheme();
      }
      if (rootEl) rootEl.style.transition = "";
      state.open = true;
      state.minimized = false;
      ensureIframeLoaded();
      applyLayout();
      saveWindowState();

      if (msg.dataUrl) {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, "0");
        const fileName = `TradingView ${pad(d.getHours())}.${pad(d.getMinutes())}.${pad(d.getSeconds())}.png`;
        pendingCaptures.push({ dataUrl: msg.dataUrl, fileName });
        flushCaptures();
        showMiniToast("Clean chart attached");
      }
      return Promise.resolve({ ok: true });
    }

    if (msg.type === "EDGEBOOK_RESTORE_AFTER_ERROR") {
      if (rootEl) rootEl.style.transition = "";
      setWindowOpen(msg.wasVisible !== false);
      showMiniToast(msg.message || "Allow TradingView permission in Safari");
      return Promise.resolve({ ok: true });
    }

    if (msg.type === "EDGEBOOK_THEME_UPDATE") {
      themeChoice = msg.theme || "system";
      applyTheme();
      postToEmbed({ type: "edgebook:theme", theme: themeChoice });
    }

    if (msg.type === "EDGEBOOK_SESSION_UPDATE") {
      sessionToken = msg.token ?? null;
      refreshShortcutsPopover();
      postToEmbed({ type: "edgebook:session", token: sessionToken, theme: themeChoice });
    }

    return undefined;
  });

  // Restore window automatically across TradingView reloads / chart symbol switches
  void (async () => {
    const b = await syncBootstrap(false);
    const saved = b?.windowState;
    if (saved) {
      state = {
        ...DEFAULT_STATE,
        ...saved,
        width: Math.max(320, Math.min(540, saved.width || DEFAULT_STATE.width)),
        height: Math.max(420, Math.min(820, saved.height || DEFAULT_STATE.height)),
      };
    }
    if (state.open) {
      createFloatingWindow();
      ensureIframeLoaded();
      applyLayout();
    }
  })();
})();
