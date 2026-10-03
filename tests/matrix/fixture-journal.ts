export const fixtureJournal = {
  entries: [
    { id: "long-win", date: "2026-10-01", entryPrice: 100, stopLoss: 95, exitPrice: 110, direction: "long" as const },
    { id: "short-loss", date: "2026-09-30", entryPrice: 100, stopLoss: 105, exitPrice: 103, direction: "short" as const },
    { id: "incomplete", date: "2026-09-29", entryPrice: 100, stopLoss: null, exitPrice: null, direction: "long" as const },
  ],
};
