"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { persistFailedSince, useApp } from "@/lib/store";
import type { ReviewNotes, ReviewStore } from "@/lib/types";

export type ReviewKind = "weekly" | "monthly";
export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export const emptyNotes = (): ReviewNotes => ({ text: {}, lists: {}, done: {}, dayMarks: {}, mistakePlans: {}, updatedAt: 0 });
const norm = (n: Partial<ReviewNotes> | undefined): ReviewNotes => ({ ...emptyNotes(), ...(n ?? {}) });
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
  target.current = { kind, key };

  const flush = useCallback(async () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    if (!dirty.current) return;
    dirty.current = false;
    const { kind: k, key: kk } = target.current;
    const snapshot = { ...latest.current, updatedAt: Date.now() };
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
    latest.current = fresh; dirty.current = false; setNotes(fresh); setState("idle");
    return () => { void flush(); };
  }, [kind, key, flush]);

  // Another surface changed this period's notes and we have nothing unsaved — adopt them.
  useEffect(() => { if (!dirty.current && stored) { const n = norm(stored); latest.current = n; setNotes(n); } }, [stored]);

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
