"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JournalEntry, JournalSettings, TradePlan } from "@/lib/types";
import {
  buildInterventionIndex,
  candidateInterventions,
  DISMISS_MS,
  emptyPrefs,
  emptySession,
  mutedKind,
  pickIntervention,
  snoozed,
  type Intervention,
  type NudgePrefs,
  type PlanSnapshot,
} from "@/lib/minato/plan-intervention";

/** The trader must have stopped typing/tapping this long before anything may appear, so it never lands mid-action. */
const IDLE_MS = 1600;
const STORE = "edgebook:plan-nudges:v1";

const load = (key: string): NudgePrefs => {
  try {
    const raw = window.localStorage.getItem(`${STORE}:${key}`);
    const v = raw ? (JSON.parse(raw) as Partial<NudgePrefs>) : null;
    return { snoozed: v?.snoozed ?? {}, muted: v?.muted ?? {} };
  } catch {
    return emptyPrefs();
  }
};
const save = (key: string, prefs: NudgePrefs) => {
  try { window.localStorage.setItem(`${STORE}:${key}`, JSON.stringify(prefs)); } catch { /* private mode / quota: preferences just last this sitting */ }
};

/**
 * Decides when Plan Trade shows its one contextual popup.
 *
 *  - Does nothing until `active` (the checklist step is on screen) AND the journal passes the data gate.
 *  - Re-evaluates only after the trader goes quiet, so typing and ticking are never interrupted.
 *  - At most one popup at a time, at most MAX_PER_SESSION per planning sitting, never the same one twice.
 *  - If the trader fixes what the popup was about, it folds away on its own.
 *  - Tapping it away snoozes that exact situation for a day; "show fewer like this" mutes the kind for 30.
 */
export function usePlanIntervention(opts: {
  active: boolean;
  /** Flips to false when the flow closes: the sitting ends and its memory resets. */
  sitting: boolean;
  snapshot: PlanSnapshot;
  entries: JournalEntry[];
  plans: TradePlan[];
  settings: JournalSettings;
  sym: string;
}) {
  const { active, sitting, snapshot, entries, plans, settings, sym } = opts;
  const userKey = settings.handle ?? "me";
  const [current, setCurrent] = useState<Intervention | null>(null);
  const currentRef = useRef<Intervention | null>(null);
  currentRef.current = current;
  const session = useRef(emptySession());
  const prefs = useRef<NudgePrefs | null>(null);
  const lastActivity = useRef(0);

  // Built only once the checklist step is reached, and only again when the journal itself changes (never per keystroke).
  const index = useMemo(
    () => (active ? buildInterventionIndex(entries, plans, settings, sym) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [active, entries, plans, settings.aiBrain?.minato, settings.practiceProgress?.seedLessons, sym],
  );

  useEffect(() => { if (!sitting) { session.current = emptySession(); setCurrent(null); } }, [sitting]);

  useEffect(() => {
    if (!active) return;
    const mark = () => { lastActivity.current = Date.now(); };
    const evs = ["pointerdown", "keydown", "input"] as const;
    evs.forEach((t) => window.addEventListener(t, mark, true));
    mark();
    return () => evs.forEach((t) => window.removeEventListener(t, mark, true));
  }, [active]);

  useEffect(() => {
    if (!active || !index?.readiness.ready) { setCurrent(null); return; }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => {
      const quiet = Date.now() - lastActivity.current;
      if (quiet < IDLE_MS) { timer = setTimeout(run, IDLE_MS - quiet + 40); return; }
      if (document.hidden) return;
      const cands = candidateInterventions(index, snapshot);
      const shown = currentRef.current;
      if (shown) { if (!cands.some((c) => c.id === shown.id)) setCurrent(null); return; }
      prefs.current ??= load(userKey);
      const next = pickIntervention(cands, session.current, prefs.current, Date.now());
      if (next) { session.current.shown.push(next.id); setCurrent(next); }
    };
    timer = setTimeout(run, IDLE_MS);
    return () => { if (timer) clearTimeout(timer); };
  }, [active, index, snapshot, userKey]);

  const dismiss = useCallback(() => {
    const c = currentRef.current;
    if (!c) return;
    session.current.dismissed.push(c.id);
    prefs.current = snoozed(prefs.current ?? load(userKey), c.id, Date.now(), DISMISS_MS);
    save(userKey, prefs.current);
    setCurrent(null);
  }, [userKey]);

  const mute = useCallback(() => {
    const c = currentRef.current;
    if (!c) return;
    session.current.dismissed.push(c.id);
    prefs.current = mutedKind(snoozed(prefs.current ?? load(userKey), c.id, Date.now()), c.kind, Date.now());
    save(userKey, prefs.current);
    setCurrent(null);
  }, [userKey]);

  /** Acting on the popup resolves it for this sitting without snoozing it for a week. */
  const resolve = useCallback(() => {
    const c = currentRef.current;
    if (c) session.current.dismissed.push(c.id);
    setCurrent(null);
  }, []);

  return { current, dismiss, mute, resolve };
}
