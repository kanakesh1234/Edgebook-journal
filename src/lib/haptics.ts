"use client";

/**
 * Dependency-free haptics.
 * - iOS Safari 17.4+: toggling a hidden <input type="checkbox" switch> fires the system haptic
 *   (best effort; must run from a user gesture, and newer iOS releases may block it).
 * - Android / Chrome: the Vibration API.
 * Always a progressive enhancement: every call is wrapped so failures are silent.
 */

const isIOS = (): boolean =>
  typeof navigator !== "undefined" &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

function iosTick() {
  try {
    const label = document.createElement("label");
    label.setAttribute("aria-hidden", "true");
    label.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    label.appendChild(input);
    document.body.appendChild(label);
    label.click();
    window.setTimeout(() => label.remove(), 60);
  } catch { /* unsupported */ }
}

/** `pattern` is vibrate-style on/off durations (ms); on iOS each "on" entry becomes one tick. */
function play(pattern: number[]) {
  if (typeof window === "undefined") return;
  try {
    if (isIOS()) {
      let t = 0;
      pattern.forEach((ms, i) => {
        if (i % 2 === 0) window.setTimeout(iosTick, t);
        t += ms;
      });
    } else if (typeof navigator.vibrate === "function") {
      navigator.vibrate(pattern);
    }
  } catch { /* unsupported */ }
}

export const haptic = {
  /** A light tick — selection changes (chips, segments, stepper). */
  selection: () => play([10]),
  success: () => play([20, 60, 30]),
  error: () => play([25, 50, 25, 50, 25]),
};
