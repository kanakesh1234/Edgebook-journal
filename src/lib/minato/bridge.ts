"use client";

/**
 * Bridge between the Minato panel (which owns the live brain) and the Settings screen "What Minato remembers".
 * The panel publishes its brain here and registers a handler; Settings reads the brain and sends operations to it.
 * Supports: view, edit, add, pin/unpin, delete/reject, restore, clear, and debug retrieval logs.
 */
import { create } from "zustand";
import type { MinatoBrain, Commitment } from "./brain-ml";
import { clearMemory, emptyMemory, observe, pinMemory, rejectMemory, restoreMemory, type MemoryEvent, type MemoryItem } from "./memory";
import type { RetrievalDebugLog } from "./retrieve";

export type MemoryOp =
  | { type: "reject"; id: string }
  | { type: "delete"; id: string }
  | { type: "restore"; id: string }
  | { type: "pin"; id: string; pinned: boolean }
  | { type: "edit"; id: string; text: string; short?: string }
  | { type: "add"; text: string; short?: string; category?: string }
  | { type: "clear" }
  | { type: "commit"; id: string; status: Commitment["status"] }
  | { type: "unsave"; id: string };

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trim()}…` : s);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "item";

/** Pure: apply one trader action to a brain. */
export function applyMemoryOp(b: MinatoBrain, op: MemoryOp, now: number): MinatoBrain {
  switch (op.type) {
    case "reject":
      return b.memory ? { ...b, memory: rejectMemory(b.memory, op.id, now) } : b;
    case "delete": {
      if (!b.memory) return b;
      const items = { ...b.memory.items };
      const existing = items[op.id];
      delete items[op.id];
      const rejected = { ...b.memory.rejected };
      if (existing && existing.origin !== "user") {
        rejected[op.id] = { at: now, n: existing.n };
      }
      return { ...b, memory: { ...b.memory, items, rejected, updatedAt: now } };
    }
    case "restore":
      return b.memory ? { ...b, memory: restoreMemory(b.memory, op.id, now) } : b;
    case "pin":
      return b.memory ? { ...b, memory: pinMemory(b.memory, op.id, op.pinned) } : b;
    case "edit": {
      if (!b.memory || !b.memory.items[op.id]) return b;
      const it: MemoryItem = b.memory.items[op.id];
      const cleanText = clip(op.text.trim(), 280);
      const cleanShort = clip((op.short ?? op.text).trim(), 48);
      if (!cleanText) return b;
      const ev: MemoryEvent = {
        at: now,
        op: "revised",
        why: "edited by trader in Settings",
        prev: { status: it.status, confidence: it.confidence, n: it.n, against: it.against, text: it.text, supersededBy: it.supersededBy },
      };
      const updated: MemoryItem = {
        ...it,
        text: cleanText,
        short: cleanShort,
        lastReinforced: now,
        log: [...it.log, ev].slice(-4),
      };
      return { ...b, memory: { ...b.memory, items: { ...b.memory.items, [op.id]: updated }, updatedAt: now } };
    }
    case "add": {
      const store = b.memory ?? emptyMemory();
      const cleanText = clip(op.text.trim(), 240);
      if (!cleanText) return b;
      const nextStore = observe(
        store,
        {
          id: `usr:${slug(cleanText)}:${now.toString(36).slice(-4)}`,
          kind: "semantic",
          topic: "fact",
          text: cleanText,
          short: clip((op.short ?? cleanText).trim(), 48),
          stance: "fact",
          polarity: "neutral",
          level: "established",
          confidence: 0.95,
          n: 1,
          evidence: [{ date: new Date(now).toISOString().slice(0, 10), note: "added in Settings" }],
          tags: op.category ? [`cat:${op.category}`] : [],
          origin: "user",
          pinned: true,
        },
        now,
      );
      return { ...b, memory: { ...nextStore, updatedAt: now } };
    }
    // Clearing also lets go of feelings it was holding; the counters that power the readiness check are kept.
    case "clear":
      return { ...b, memory: b.memory ? clearMemory(b.memory, now) : b.memory, mind: { ...b.mind, notes: [] } };
    case "commit":
      return { ...b, commitments: b.commitments.map((c) => (c.id === op.id ? { ...c, status: op.status, auto: false } : c)) };
    case "unsave":
      return { ...b, saved: b.saved.filter((x) => x.id !== op.id) };
  }
}

interface MindView {
  brain: MinatoBrain | null;
  debugLogs: RetrievalDebugLog[];
  debugMode: boolean;
  handler: ((op: MemoryOp) => void) | null;
  publish(b: MinatoBrain): void;
  pushDebugLog(log: RetrievalDebugLog): void;
  setDebugMode(enabled: boolean): void;
  register(h: ((op: MemoryOp) => void) | null): void;
  send(op: MemoryOp): void;
}

export const useMindView = create<MindView>((set, get) => ({
  brain: null,
  debugLogs: [],
  debugMode: false,
  handler: null,
  publish: (brain) => set({ brain }),
  pushDebugLog: (log) => set((s) => ({ debugLogs: [log, ...s.debugLogs].slice(0, 20) })),
  setDebugMode: (debugMode) => set({ debugMode }),
  register: (handler) => set({ handler }),
  send: (op) => get().handler?.(op),
}));
