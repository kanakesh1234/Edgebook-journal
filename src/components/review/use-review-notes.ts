"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { persistFailedSince, useApp } from "@/lib/store";
import type { ReviewNotes, ReviewStore } from "@/lib/types";

export type ReviewKind = "weekly" | "monthly";
export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export const emptyNotes = (): ReviewNotes => ({ text: {}, lists: {}, done: {}, dayMarks: {}, mistakePlans: {}, updatedAt: 0 });

/**
 * Strip legacy auto-filled chip boilerplate so reflection questions remain purely user-written.
 */
const LEGACY_CHIP_PATTERNS: RegExp[] = [
  /Backed \d+\/\d+ trades with pre-trade If\s*→\s*Then thoughts[^.]*\./gi,
  /Logged pre-trade If\s*→\s*Then thoughts on \d+\/\d+ trades[^.]*\./gi,
  /Best execution:\s*[^.]*\.(?:\s*Tagged:\s*[^.]*\.)?/gi,
  /Hardest session:\s*[^.]*\.(?:\s*Tagged:\s*[^.]*\.)?/gi,
  /Best session:\s*[^.]*\./gi,
  /Strongest edge was confirming “[^”]+”[^.]*\./gi,
  /Practiced patience on [^.]* when no A\+ setup triggered\./gi,
  /Respected my predefined stop loss without widening or hesitating\./gi,
  /Primary leak was [^.]*\./gi,
  /Left \d+ weekdays? unlogged\s*—\s*log every session or mark Sat on hands\./gi,
  /Entered too early before the setup fully confirmed\./gi,
  /Took a lower-quality setup instead of waiting for A\+ criteria\./gi,
  /No major process leak this week; losses were normal variance\./gi,
  /Pause 10 seconds before entry to verify I am not repeating [^.]*\./gi,
  /Only execute when “[^”]+” is explicitly confirmed in pre-trade Thought\./gi,
  /Write at least one If\s*→\s*Then scenario in Pre-trade Thought before every (?:entry|trade)\./gi,
  /Wait for the confirmation candle to close before clicking entry\./gi,
  /Lock out for the session immediately after 2 losing trades\./gi,
  /Highest-probability combo:[^.]*\./gi,
  /Kept risk per trade consistent and protected my downside\./gi,
  /Costliest mistake was [^.]*\./gi,
  /Deepest drawdown was [^.]*\./gi,
  /Took \d+ trades with ≤2 criteria confirmed[^.]*\./gi,
  /Executed my plan cleanly; drawdowns were within normal rules\./gi,
  /Never enter a trade without checking for [^.]* in pre-trade Thought\./gi,
  /Require “[^”]+” \+ at least 3 confirmed checklist rules before sizing full risk\./gi,
  /Cap daily risk strictly at 1R after a losing trade so drawdown never compounds\./gi,
];

function stripLegacyChips(s: string | undefined): string {
  if (!s) return "";
  let out = s;
  for (const re of LEGACY_CHIP_PATTERNS) {
    out = out.replace(re, "");
  }
  return out.replace(/\s{2,}/g, " ").trim();
}

const norm = (n: Partial<ReviewNotes> | undefined): ReviewNotes => {
  const base = { ...emptyNotes(), ...(n ?? {}) };
  const cleanedText: Record<string, string> = {};
  for (const [k, v] of Object.entries(base.text ?? {})) {
    const cleaned = stripLegacyChips(v);
    if (cleaned) cleanedText[k] = cleaned;
  }
  const cleanedLists: Record<string, string[]> = {};
  for (const [k, arr] of Object.entries(base.lists ?? {})) {
    cleanedLists[k] = (arr ?? []).map((item) => stripLegacyChips(item));
  }
  return {
    ...base,
    text: cleanedText,
    lists: cleanedLists,
  };
};

const DEBOUNCE = 900;

/**
 * Editable review write-up for one week/month. Typing updates local state instantly; a debounced save writes
 * `settings.reviews` through the store, so it rides the same Google Drive write (with read-back) as every trade.
 * Pending edits are flushed when the period changes, the tab is hidden, or the page unmounts.
 */
export function useReviewNotes(kind: ReviewKind, key: string) {
  const stored = useApp((s) => s.settings.reviews?.[kind]?.[key]);
  const [notes, setNotes] = useState<ReviewNotes>(() => norm(stored));
  const [state, setState] = useState<SaveState>("idle");
  const latest = useRef(notes);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const target = useRef({ kind, key });
  /** Timestamp of the last save we initiated (so we can ignore our own write echoing back from Drive). */
  const lastSavedAt = useRef(0);
  target.current = { kind, key };

  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (!dirty.current) return;
    dirty.current = false;
    const { kind: k, key: kk } = target.current;
    const now = Date.now();
    const snapshot = { ...latest.current, updatedAt: now };
    lastSavedAt.current = now;
    const cur: ReviewStore = useApp.getState().settings.reviews ?? { weekly: {}, monthly: {} };
    const next: ReviewStore = { ...cur, [k]: { ...cur[k], [kk]: snapshot } };
    setState("saving");
    const t0 = Date.now();
    try {
      await useApp.getState().updateSettings({ reviews: next });
      setState(persistFailedSince(t0) ? "error" : "saved");
    } catch { setState("error"); }
  }, []);

  // Load the period's saved notes when it changes (flushing the previous period first).
  useEffect(() => {
    const fresh = norm(useApp.getState().settings.reviews?.[kind]?.[key]);
    latest.current = fresh; dirty.current = false; lastSavedAt.current = 0; setNotes(fresh); setState("idle");
    return () => { void flush(); };
  }, [kind, key, flush]);

  // Another surface changed this period's notes and we have nothing unsaved — adopt them,
  // but only if the incoming data is actually newer than what we last saved. This prevents
  // Drive read-back from overwriting the user's local edits after a save completes.
  useEffect(() => {
    if (dirty.current || !stored) return;
    const incomingTs = stored.updatedAt ?? 0;
    if (incomingTs <= lastSavedAt.current) return; // Our own write echoing back — ignore
    const n = norm(stored);
    latest.current = n;
    setNotes(n);
  }, [stored]);

  useEffect(() => {
    const hide = () => { if (document.visibilityState === "hidden") void flush(); };
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", hide);
    return () => { document.removeEventListener("visibilitychange", hide); window.removeEventListener("pagehide", hide); };
  }, [flush]);

  const update = useCallback((fn: (n: ReviewNotes) => ReviewNotes) => {
    const next = fn(latest.current);
    latest.current = next; dirty.current = true; setNotes(next); setState("dirty");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, DEBOUNCE);
  }, [flush]);

  const setText = useCallback((id: string, v: string) => update((n) => ({ ...n, text: { ...n.text, [id]: v } })), [update]);
  const setListItem = useCallback((id: string, i: number, v: string) => update((n) => { const l = [...(n.lists[id] ?? [])]; while (l.length <= i) l.push(""); l[i] = v; return { ...n, lists: { ...n.lists, [id]: l } }; }), [update]);
  const setDone = useCallback((id: string, v: boolean) => update((n) => ({ ...n, done: { ...n.done, [id]: v } })), [update]);
  const setMark = useCallback((date: string, patch: Partial<ReviewNotes["dayMarks"][string]>) => update((n) => {
    const cur = { ...n.dayMarks[date], ...patch };
    for (const k of Object.keys(cur) as (keyof typeof cur)[]) if (cur[k] === undefined || cur[k] === false) delete cur[k];
    const marks = { ...n.dayMarks }; if (Object.keys(cur).length) marks[date] = cur; else delete marks[date];
    return { ...n, dayMarks: marks };
  }), [update]);
  const setPlan = useCallback((id: string, v: string) => update((n) => ({ ...n, mistakePlans: { ...n.mistakePlans, [id]: v } })), [update]);

  return { notes, state, flush, setText, setListItem, setDone, setMark, setPlan };
}
