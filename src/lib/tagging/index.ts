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
export async function tagTrade(entry: JournalEntry, entries: JournalEntry[], plans: TradePlan[], inputs: TagInputs, timeoutMs = 50_000): Promise<Decision & { bundle: TagBundle }> {
  const bundle = buildBundle(entry, entries, plans, inputs);
  const { runs, reason } = hasWords(bundle) || bundle.facts.length > 0 ? await askModels(bundle, timeoutMs) : { runs: [] as ModelRun[], reason: "There was nothing written to read yet." };
  const d = decide(bundle, runs, scanBundle(bundle));
  // Tell the trader WHY the AI did not answer, instead of a bare "unavailable".
  return { ...d, tagging: d.tagging.degraded && reason ? { ...d.tagging, reason } : d.tagging, bundle };
}

/** Re-checks a saved trade from its stored review (for trades finished before multi-tagging existed). */
export const retagEntry = (entry: JournalEntry, entries: JournalEntry[], plans: TradePlan[], timeoutMs?: number) => tagTrade(entry, entries, plans, inputsFromEntry(entry), timeoutMs);

async function askModels(bundle: TagBundle, timeoutMs: number): Promise<{ runs: ModelRun[]; reason?: string }> {
  if (typeof fetch === "undefined") return { runs: [], reason: "No network in this environment." };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch("/api/journal/tag-trade", { method: "POST", headers: { "Content-Type": "application/json" }, signal: ctl.signal, body: JSON.stringify({ bundle }) });
    const data = (await res.json().catch(() => ({}))) as { runs?: { model?: unknown; tags?: unknown; unclear?: unknown }[]; reason?: unknown; error?: unknown };
    if (!res.ok) return { runs: [], reason: typeof data.reason === "string" ? data.reason : typeof data.error === "string" ? data.error : `The tagging service answered with an error (${res.status}).` };
    // Verify again on this side: the verdict must never depend on the network having been honest.
    const runs = (data.runs ?? []).flatMap((r) => (typeof r.model === "string" ? [groundRun(r.model, { tags: r.tags, unclear: r.unclear }, bundle)] : []));
    return { runs, reason: runs.length === 0 ? (typeof data.reason === "string" ? data.reason : "No AI model answered.") : undefined };
  } catch (err) {
    return { runs: [], reason: err instanceof Error && err.name === "AbortError" ? "The AI took too long to answer." : "Could not reach the tagging service." };
  } finally { clearTimeout(timer); }
}

/** The MistakeKey a trade's decision settled on, if anything was filed. */
export const filedPrimary = (d: Decision): MistakeKey | null => { const t = d.tags.find((x) => x.primary) ?? d.tags[0]; return t ? (t.key as MistakeKey) : null; };
