import type { JournalEntry, TradePlan } from "../types";
import type { MistakeKey } from "../mistakes";
import { buildBundle, hasWords, inputsFromEntry, type TagBundle, type TagInputs } from "./evidence";
import { decide, scanBundle, type Decision } from "./policy";
import { groundRun, type ModelRun } from "./prompt";
import { synthesizeBrainTagRun } from "../ai-brain";

export * from "./evidence";
export * from "./policy";
export { GUIDE, type ModelRun } from "./prompt";

/**
 * Tags one trade from everything the trader wrote and everything the data shows.
 *
 * Never blocks the trader: the offline rules + measured facts + EdgeBook's local AI Brain always produce a grounded answer;
 * external LLM models are asked in addition and verified against verbatim quotes.
 */
export async function tagTrade(entry: JournalEntry, entries: JournalEntry[], plans: TradePlan[], inputs: TagInputs, timeoutMs = 35_000): Promise<Decision & { bundle: TagBundle }> {
  const bundle = buildBundle(entry, entries, plans, inputs);
  const { runs, reason } = hasWords(bundle) || bundle.facts.length > 0
    ? await askModels(bundle, timeoutMs)
    : { runs: [] as ModelRun[], reason: "There was nothing written to read yet." };
  const d = decide(bundle, runs, scanBundle(bundle));
  return { ...d, tagging: d.tagging.degraded && reason ? { ...d.tagging, reason } : d.tagging, bundle };
}

/** Re-checks a saved trade from its stored review (for trades finished before multi-tagging existed). */
export const retagEntry = (entry: JournalEntry, entries: JournalEntry[], plans: TradePlan[], timeoutMs?: number) => tagTrade(entry, entries, plans, inputsFromEntry(entry), timeoutMs);

async function askModels(bundle: TagBundle, timeoutMs: number): Promise<{ runs: ModelRun[]; reason?: string }> {
  if (typeof fetch === "undefined") {
    return { runs: [synthesizeBrainTagRun(bundle)] };
  }
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch("/api/journal/tag-trade", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctl.signal,
      body: JSON.stringify({ bundle }),
    });
    const data = (await res.json().catch(() => ({}))) as { runs?: { model?: unknown; tags?: unknown; unclear?: unknown }[]; reason?: unknown; error?: unknown };
    if (!res.ok) {
      return { runs: [synthesizeBrainTagRun(bundle)] };
    }
    const runs = (data.runs ?? []).flatMap((r) => (typeof r.model === "string" ? [groundRun(r.model, { tags: r.tags, unclear: r.unclear }, bundle)] : []));
    if (runs.length === 0) {
      return { runs: [synthesizeBrainTagRun(bundle)] };
    }
    return { runs };
  } catch {
    return { runs: [synthesizeBrainTagRun(bundle)] };
  } finally {
    clearTimeout(timer);
  }
}

/** The MistakeKey a trade's decision settled on, if anything was filed. */
export const filedPrimary = (d: Decision): MistakeKey | null => { const t = d.tags.find((x) => x.primary) ?? d.tags[0]; return t ? (t.key as MistakeKey) : null; };
