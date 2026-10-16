"use client";

import { useCallback, useEffect, useState } from "react";
import { todayKey } from "@/lib/format";
import { EXTEND_MIN, extend, freshClock, minutesUsed, parseClock, promptFor, remainingMinutes, tick, type Prompt, type SessionClock } from "@/lib/feed/session";

const KEY = "edgebook.feed.session.v1";

/** Counts active Feed time today (tab visible only), survives reloads, resets at midnight. Device-local. */
export function useSessionClock(dailyMinutes: number) {
  const [clock, setClock] = useState<SessionClock>(() => freshClock(todayKey()));

  useEffect(() => {
    try { setClock(parseClock(JSON.parse(localStorage.getItem(KEY) ?? "null"), todayKey())); } catch { /* fresh clock */ }
  }, []);

  useEffect(() => {
    let last = Date.now();
    const id = window.setInterval(() => {
      const now = Date.now(), d = now - last;
      last = now;
      if (document.visibilityState === "visible") setClock((c) => tick(c, d, todayKey()));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  const bucket = Math.floor(clock.ms / 5000);
  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(clock)); } catch { /* private mode */ }
    // write about every 5 seconds, and whenever the allowance changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bucket, clock.extraMin, clock.day]);

  const prompt: Prompt = promptFor(clock, dailyMinutes);
  const more = useCallback((m = EXTEND_MIN) => setClock((c) => extend(c, m)), []);
  return { clock, prompt, minutes: minutesUsed(clock), remaining: remainingMinutes(clock, dailyMinutes), more };
}
