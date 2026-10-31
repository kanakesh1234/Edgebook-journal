"use client";

/**
 * Bridge between the Minato panel (which owns the live brain) and the Settings screen "What Minato remembers".
 * The panel publishes its brain here and registers a handler; Settings reads the brain and sends operations to it.
 * One owner of the state means no sync race between the two screens.
 */
import { create } from "zustand";
import type { MinatoBrain, Commitment } from "./brain-ml";
import { clearMemory, pinMemory, rejectMemory, restoreMemory } from "./memory";

export type MemoryOp =
  | { type: "reject"; id: string }
  | { type: "restore"; id: string }
  | { type: "pin"; id: string; pinned: boolean }
  | { type: "clear" }
  | { type: "commit"; id: string; status: Commitment["status"] }
  | { type: "unsave"; id: string };

/** Pure: apply one trader action to a brain. */
export function applyMemoryOp(b: MinatoBrain, op: MemoryOp, now: number): MinatoBrain {
  switch (op.type) {
    case "reject": return b.memory ? { ...b, memory: rejectMemory(b.memory, op.id, now) } : b;
    case "restore": return b.memory ? { ...b, memory: restoreMemory(b.memory, op.id, now) } : b;
    case "pin": return b.memory ? { ...b, memory: pinMemory(b.memory, op.id, op.pinned) } : b;
    // Clearing also lets go of feelings it was holding; the counters that power the readiness check are kept.
    case "clear": return { ...b, memory: b.memory ? clearMemory(b.memory, now) : b.memory, mind: { ...b.mind, notes: [] } };
    case "commit": return { ...b, commitments: b.commitments.map((c) => (c.id === op.id ? { ...c, status: op.status, auto: false } : c)) };
    case "unsave": return { ...b, saved: b.saved.filter((x) => x.id !== op.id) };
  }
}

interface MindView {
  brain: MinatoBrain | null;
  handler: ((op: MemoryOp) => void) | null;
  publish(b: MinatoBrain): void;
  register(h: ((op: MemoryOp) => void) | null): void;
  send(op: MemoryOp): void;
}

export const useMindView = create<MindView>((set, get) => ({
  brain: null,
  handler: null,
  publish: (brain) => set({ brain }),
  register: (handler) => set({ handler }),
  send: (op) => get().handler?.(op),
}));
