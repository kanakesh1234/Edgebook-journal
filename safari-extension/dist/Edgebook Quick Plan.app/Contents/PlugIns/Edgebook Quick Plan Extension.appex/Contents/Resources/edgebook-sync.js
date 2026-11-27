/* First-party sync running on https://edgebook-journal.vercel.app/*.
 * Mirrors user theme (`edgebook.theme`) and active session token into the Safari
 * extension storage so Quick Plan on TradingView stays logged in & theme-synced.
 */
(() => {
  const api = globalThis.browser ?? globalThis.chrome;
  if (!api?.runtime?.sendMessage) return;

  let lastTheme = null;
  let syncInFlight = false;

  async function syncState() {
    if (syncInFlight) return;
    syncInFlight = true;
    try {
      const themeRaw = window.localStorage.getItem("edgebook.theme");
      const theme = themeRaw === "light" || themeRaw === "dark" ? themeRaw : "system";
      lastTheme = theme;

      let token = null;
      let user = null;
      try {
        const res = await fetch("/api/embed/session", { credentials: "include", cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data?.loggedIn && data?.token) {
            token = data.token;
            user = data.user ?? null;
          }
        }
      } catch {
        /* ignore offline state */
      }

      await api.runtime.sendMessage({
        type: "EDGEBOOK_SYNC_FROM_SITE",
        theme,
        token,
        user,
      });
    } catch {
      /* extension context might reload */
    } finally {
      syncInFlight = false;
    }
  }

  function pushThemeOnly() {
    const raw = window.localStorage.getItem("edgebook.theme");
    const theme = raw === "light" || raw === "dark" ? raw : "system";
    if (theme === lastTheme) return;
    lastTheme = theme;
    void api.runtime.sendMessage({ type: "EDGEBOOK_SYNC_FROM_SITE", theme }).catch(() => {});
  }

  // Watch theme changes cleanly (`data-theme` attribute flips immediately when user toggles)
  const mo = new MutationObserver(() => pushThemeOnly());
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  window.addEventListener("storage", (e) => {
    if (e.key === "edgebook.theme") pushThemeOnly();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void syncState();
  });

  void syncState();
})();
