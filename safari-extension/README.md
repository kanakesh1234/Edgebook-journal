# Edgebook Quick Plan — macOS Safari Extension

A compact, Apple-crafted floating window that opens **Plan Trade** directly over **TradingView** in macOS Safari.

---

## Quick Installation (macOS)

1. Run the one-command installer in Terminal (already built inside `safari-extension/dist/Edgebook Quick Plan.app`):
   ```zsh
   ./safari-extension/install.sh
   ```
   *(Or drag `safari-extension/dist/Edgebook Quick Plan.app` directly into `/Applications` and launch it once.)*

2. Open **Safari → Settings → Advanced** and check **"Show features for web developers"**.
3. Open **Safari → Develop → Allow Unsigned Extensions** *(needed only because this local build is ad-hoc signed without an Apple Developer certificate; or select your personal Apple ID Team once in `safari-extension/macos-app/Edgebook Quick Plan/Edgebook Quick Plan.xcodeproj`)*.
4. Open **Safari → Settings → Extensions**, enable **Edgebook Quick Plan**, and click **Always Allow on Every Website…** (or grant access to `tradingview.com` and `edgebook-journal.vercel.app`).

---

## Keyboard Shortcuts & Controls

| Action | Shortcut | Titlebar Control |
|---|---|---|
| Toggle floating Quick Plan (open / hide) | **`Option + Shift + P` (`⌥ ⇧ P`)** | Toolbar icon / `×` |
| Capture clean TradingView chart *(hides Quick Plan, captures chart, restores & attaches)* | **`Option + Shift + E` (`⌥ ⇧ E`)** | Camera icon |
| Temporarily hide 6s for macOS screenshot (`⌘ ⇧ 4`) | Click Eye icon | Eye icon |
| Paste clipboard screenshot into attachments | **`Command + V` (`⌘ V`)** | Chart attachment area |
| Continue / Next step | **`Command + Enter` (`⌘ ↵`)** | Bottom primary button |

> Clicking the **`i`** icon inside the Quick Plan titlebar displays live shortcut registration status (`browser.commands.getAll()`), active Edgebook session sync status, and lets you reset the floating window back to `380 × 560`.

---

## Permissions Explained

- **`tradingview.com` (`*://*.tradingview.com/*`)**: Injects the persistent floating panel and cleanly hides it during chart capture.
- **`edgebook-journal.vercel.app`**: Syncs your existing Edgebook theme and session cleanly inside the floating container across Safari ITP partitions.
- **`tabs`, `activeTab`, `storage`**: Required by Safari's `tabs.captureVisibleTab` clean chart snapshot API and to persist window position/dimensions.
