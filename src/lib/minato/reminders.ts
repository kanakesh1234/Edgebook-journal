/**
 * MINATO APPLE HIG REMINDER & MEMORY NUDGE STORE
 *
 * When the trader tells Minato to "remember" or "remind me" of something:
 *  1. Extracts a minimal, to-the-point reminder text (Apple HIG principle: concise, high-clarity, zero fluff).
 *  2. Stores it in persistent reminders (`edgebook:minato:reminders:v1`) + syncs with semantic memory.
 *  3. Fires an Apple HIG translucent notification banner (`MinatoReminderPopup`) when needed:
 *     - Immediately as a live confirmation preview when created
 *     - At a scheduled time if the trader said "remind me in X minutes" or "remind me at HH:MM"
 *     - Right when the trader opens "Plan a trade" or "Add trade" (`pre_trade` trigger) so their rule is front-and-center.
 */

import { create } from "zustand";

export type ReminderTrigger = "pre_trade" | "timed" | "always";

export interface MinatoReminderItem {
  id: string;
  /** Minimal, to-the-point text (<= 72 chars) shown in the Apple HIG pop-up */
  text: string;
  /** Full original text said by the trader */
  fullText: string;
  trigger: ReminderTrigger;
  /** Optional epoch ms when a timed reminder should fire */
  dueAt: number | null;
  /** Optional HH:MM daily clock time */
  clockTime: string | null;
  pinned: boolean;
  active: boolean;
  createdAt: number;
  lastShownAt: number | null;
}

const STORAGE_KEY = "edgebook:minato:reminders:v1";

/** Condenses a verbose user sentence into a crisp, minimal Apple-style reminder phrase. */
export function condenseReminderText(raw: string): string {
  const cleaned = raw
    .replace(
      /^\s*(?:hey\s+|hi\s+)?(?:minato|sensei)?[\s,]*(?:please\s+|can\s+you\s+|could\s+you\s+)?(?:remember(?:\s+that|\s+to)?|remind\s+me(?:\s+that|\s+to)?|make\s+me\s+remember(?:\s+to|\s+that)?|don'?t\s+let\s+me\s+forget(?:\s+to|\s+that)?|keep\s+in\s+mind(?:\s+that)?)[\s,:]*/i,
      "",
    )
    .replace(/\b(?:when\s+i\s+(?:plan|log|take|enter)\s+a?\s*trade|before\s+(?:every|each|my)\s+trade|every\s+day)\b/gi, "")
    .replace(/\b(?:in\s+\d+\s*(?:min(?:ute)?s?|hrs?|hours?))\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[,\-:;]+|[.!]+$/g, "")
    .trim();

  if (!cleaned) return raw.trim().slice(0, 68);
  const cap = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  return cap.length > 72 ? `${cap.slice(0, 69).trim()}…` : cap;
}

/**
 * Parses a natural-language message to see if the trader is asking Minato to remember
 * or remind them of something.
 */
export function parseRememberOrRemindCommand(
  input: string,
  now = Date.now(),
): {
  matched: boolean;
  item: MinatoReminderItem | null;
} {
  const trimmed = input.trim();
  const isRememberOrRemind =
    /^\s*(?:hey\s+|hi\s+)?(?:minato|sensei)?[\s,]*(?:please\s+|can\s+you\s+|could\s+you\s+)?(?:remember\b|remind\s+me\b|make\s+me\s+remember\b|don'?t\s+let\s+me\s+forget\b)/i.test(
      trimmed,
    ) ||
    /\b(?:minato|sensei)\s+remember\b/i.test(trimmed) ||
    /\bmake\s+me\s+remind\b/i.test(trimmed);

  if (!isRememberOrRemind) {
    return { matched: false, item: null };
  }

  const concise = condenseReminderText(trimmed);
  if (concise.length < 3) {
    return { matched: false, item: null };
  }

  // Check if there is a relative timer ("in 15 minutes", "in 1 hour")
  let dueAt: number | null = null;
  let clockTime: string | null = null;
  let trigger: ReminderTrigger = "pre_trade";

  const inMinMatch = trimmed.match(/\bin\s+(\d+)\s*(min(?:ute)?s?|hrs?|hours?|sec(?:ond)?s?)\b/i);
  if (inMinMatch) {
    const val = Number(inMinMatch[1]);
    const unit = inMinMatch[2]!.toLowerCase();
    const mult = unit.startsWith("h") ? 3600_000 : unit.startsWith("s") ? 1000 : 60_000;
    dueAt = now + Math.max(5_000, val * mult);
    trigger = "timed";
  } else {
    const atTimeMatch = trimmed.match(/\bat\s+(\d{1,2}):(\d{2})\s*(am|pm)?\b/i);
    if (atTimeMatch) {
      let h = Number(atTimeMatch[1]);
      const m = Number(atTimeMatch[2]);
      const ampm = atTimeMatch[3]?.toLowerCase();
      if (ampm === "pm" && h < 12) h += 12;
      if (ampm === "am" && h === 12) h = 0;
      clockTime = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const target = new Date(now);
      target.setHours(h, m, 0, 0);
      if (target.getTime() <= now) target.setDate(target.getDate() + 1);
      dueAt = target.getTime();
      trigger = "timed";
    }
  }

  const id = `rem-${concise.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 28)}`;
  return {
    matched: true,
    item: {
      id,
      text: concise,
      fullText: trimmed,
      trigger,
      dueAt,
      clockTime,
      pinned: true,
      active: true,
      createdAt: now,
      lastShownAt: null,
    },
  };
}

export function loadStoredReminders(): MinatoReminderItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as MinatoReminderItem[]) : [];
  } catch {
    return [];
  }
}

export function saveStoredReminders(list: MinatoReminderItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(-30)));
  } catch {
    /* ignore */
  }
}

interface ReminderPopupState {
  reminders: MinatoReminderItem[];
  activePopup: {
    reminder: MinatoReminderItem;
    contextLabel: string;
  } | null;
  hydrate: () => void;
  upsertReminder: (item: MinatoReminderItem, showImmediatePreview?: boolean) => void;
  dismissPopup: () => void;
  snoozePopup: (minutes?: number) => void;
  deleteReminder: (id: string) => void;
  triggerContextReminders: (contextLabel: string) => void;
}

export const useMinatoReminders = create<ReminderPopupState>((set, get) => ({
  reminders: [],
  activePopup: null,

  hydrate: () => {
    const loaded = loadStoredReminders();
    set({ reminders: loaded });
  },

  upsertReminder: (item, showImmediatePreview = true) => {
    const cur = get().reminders.filter((r) => r.id !== item.id && r.text.toLowerCase() !== item.text.toLowerCase());
    const next = [item, ...cur].slice(0, 25);
    saveStoredReminders(next);
    set({
      reminders: next,
      ...(showImmediatePreview
        ? {
            activePopup: {
              reminder: item,
              contextLabel: item.trigger === "timed" ? "Scheduled Reminder Saved" : "Saved to Minato Reminders",
            },
          }
        : {}),
    });
  },

  dismissPopup: () => {
    const cur = get().activePopup;
    if (!cur) return;
    const now = Date.now();
    const updated = get().reminders.map((r) =>
      r.id === cur.reminder.id
        ? { ...r, lastShownAt: now, ...(r.trigger === "timed" ? { dueAt: null } : {}) }
        : r,
    );
    saveStoredReminders(updated);
    set({ reminders: updated, activePopup: null });
  },

  snoozePopup: (minutes = 15) => {
    const cur = get().activePopup;
    if (!cur) return;
    const dueAt = Date.now() + minutes * 60_000;
    const updated = get().reminders.map((r) =>
      r.id === cur.reminder.id ? { ...r, trigger: "timed" as const, dueAt, lastShownAt: Date.now() } : r,
    );
    saveStoredReminders(updated);
    set({ reminders: updated, activePopup: null });
  },

  deleteReminder: (id) => {
    const updated = get().reminders.filter((r) => r.id !== id);
    saveStoredReminders(updated);
    const cur = get().activePopup;
    set({
      reminders: updated,
      activePopup: cur?.reminder.id === id ? null : cur,
    });
  },

  triggerContextReminders: (contextLabel) => {
    const list = get().reminders.filter((r) => r.active);
    if (list.length === 0) return;
    const now = Date.now();
    // Pick the most recent active reminder that hasn't been shown in the last 90 seconds
    const candidate = list.find((r) => !r.lastShownAt || now - r.lastShownAt > 90_000) ?? list[0];
    if (!candidate) return;
    set({
      activePopup: {
        reminder: candidate,
        contextLabel,
      },
    });
  },
}));
