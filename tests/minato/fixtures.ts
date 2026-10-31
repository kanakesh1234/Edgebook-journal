import type { JournalEntry } from "../../src/lib/types.ts";

export function rng(seed: number) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

export interface Spec { days: number; perDay?: number; breakAfterLoss: number; breakBase: number; seed: number; startDay?: number; reviewed?: number; idPrefix?: string }

/** Deterministic journal where the chance of breaking process depends on whether the previous same-day trade lost. */
export function journal(spec: Spec): JournalEntry[] {
  const r = rng(spec.seed), out: JournalEntry[] = [];
  let n = 0;
  for (let d = 0; d < spec.days; d++) {
    const date = new Date(Date.UTC(2026, 5, 1 + (spec.startDay ?? 0) + d)).toISOString().slice(0, 10);
    if ([0, 6].includes(new Date(`${date}T12:00:00Z`).getUTCDay())) continue;
    let prevLoss: boolean = false;
    for (let k = 0; k < (spec.perDay ?? 2); k++) {
      const broke: boolean = r() < (prevLoss ? spec.breakAfterLoss : spec.breakBase);
      const loss: boolean = r() < (broke ? 0.7 : 0.35);
      const reviewed = r() < (spec.reviewed ?? 1);
      n++;
      out.push({
        id: `${spec.idPrefix ?? "t"}${n}`, date, pnl: loss ? -100 : 120, rr: loss ? -1 : 1.2, instrument: "MNQ", direction: "long", setup: k === 0 ? "Sweep" : "Retest",
        notes: broke ? "chased the move, felt rushed" : "", images: [], entryTime: `${String(9 + k).padStart(2, "0")}:${String(Math.floor(r() * 50)).padStart(2, "0")}`, quantity: 2,
        reflection: reviewed ? { followedSetup: !broke, followedRisk: true, updatedAt: 1 } : undefined,
        createdAt: Date.UTC(2026, 5, 1 + d, 14 + k), updatedAt: Date.UTC(2026, 5, 1 + d, 14 + k),
      } as unknown as JournalEntry);
      prevLoss = loss;
    }
  }
  return out;
}
