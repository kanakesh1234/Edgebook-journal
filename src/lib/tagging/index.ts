import type { JournalEntry, TradePlan } from "../types";
import type { MistakeKey } from "../mistakes";
import { buildBundle, hasWords, inputsFromEntry, type TagBundle, type TagInputs } from "./evidence";
import { decide, scanBundle, type Decision } from "./policy";
import { groundRun, type ModelRun } from "./prompt";

export * from "./evidence";
export * from "./policy";
export { GUIDE, type ModelRun } from "./prompt";

/**
 * Tags one trade from everything the trader wrote and everything the data shows.
 *
 * Never blocks the trader: the offline rules + measured facts always produce an answer; AI is asked in addition, and if it
 * is slow, down, or not configured, the decision is simply made without it (and marked `degraded`).
 */
export async function tagTrade(entry: JournalEntry, entries: JournalEntry[], plans: TradePlan[], inputs: TagInputs, timeoutMs = 12_000): Promise<Decision & { bundle: TagBundle }> {
  const bundle = buildBundle(entry, entries, plans, inputs);
  const runs = hasWords(bundle) || bundle.facts.length > 0 ? await askModels(bundle, timeoutMs) : [];
  return { ...decide(bundle, runs, scanBundle(bundle)), bundle };
}

/** Re-checks a saved trade from its stored review (for trades finished before multi-tagging existed). */
export const retagEntry = (entry: JournalEntry, entries: JournalEntry[], plans: TradePlan[], timeoutMs?: number) => tagTrade(entry, entries, plans, inputsFromEntry(entry), timeoutMs);

async function askModels(bundle: TagBundle, timeoutMs: number): Promise<ModelRun[]> {
  if (typeof fetch === "undefined") return [];
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch("/api/journal/tag-trade", { method: "POST", headers: { "Content-Type": "application/json" }, signal: ctl.signal, body: JSON.stringify({ bundle }) });
    if (!res.ok) return [];
    const data = (await res.json()) as { runs?: { model?: unknown; tags?: unknown; unclear?: unknown }[] };
    // Verify again on this side: the verdict must never depend on the network having been honest.
    return (data.runs ?? []).flatMap((r) => (typeof r.model === "string" ? [groundRun(r.model, { tags: r.tags, unclear: r.unclear }, bundle)] : []));
  } catch { return []; } finally { clearTimeout(timer); }
}

/** The MistakeKey a trade's decision settled on, if anything was filed. */
export const filedPrimary = (d: Decision): MistakeKey | null => { const t = d.tags.find((x) => x.primary) ?? d.tags[0]; return t ? (t.key as MistakeKey) : null; };
