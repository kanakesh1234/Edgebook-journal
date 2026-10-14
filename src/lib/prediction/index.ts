import type { JournalEntry, TradePlan } from "../types";
import { buildOutlookFacts, localOutlook, type Outlook, type PlanDraft } from "./outlook";

export * from "./outlook";

/** The offline outlook, instantly. */
export function outlookNow(d: PlanDraft, entries: JournalEntry[], plans: TradePlan[]): Outlook {
  return localOutlook(buildOutlookFacts(d, entries, plans), d);
}

/** Asks the AI to read the new plan together with the statistics. Resolves to null on any failure (the offline outlook stays). */
export async function outlookWithAi(d: PlanDraft, entries: JournalEntry[], plans: TradePlan[], signal?: AbortSignal): Promise<{ outlook: Outlook | null; reason?: string }> {
  const facts = buildOutlookFacts(d, entries, plans);
  if (facts.baseline.n < 5) return { outlook: null, reason: "Not enough history for the AI to compare against yet." };
  try {
    const res = await fetch("/api/journal/outlook", { method: "POST", headers: { "Content-Type": "application/json" }, signal, body: JSON.stringify({ draft: d, facts }) });
    const data = (await res.json().catch(() => ({}))) as { outlook?: Outlook | null; reason?: string };
    return { outlook: data.outlook ?? null, reason: data.reason };
  } catch { return { outlook: null, reason: "Could not reach the AI." }; }
}
