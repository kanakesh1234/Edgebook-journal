import { NextResponse } from "next/server";
import { cardFromFact, type FactAtom, type QuestionFormat } from "@/lib/practice/time-machine";
import { getOpenRouterConfig } from "@/lib/services/ai";

export const dynamic = "force-dynamic";

type Seen = { factId: string; format: string; variant: number; date: string };
type Proposal = { factId: string; format: QuestionFormat; variant: number };
const formats: QuestionFormat[] = ["cloze", "true-false", "pick-the-real-rule", "scenario", "reverse-recall", "order-steps", "spot-the-flaw"];
const bank = new Map<string, { cards: unknown[]; createdAt: number }>();

function validAtom(value: unknown): value is FactAtom {
  if (!value || typeof value !== "object") return false;
  const atom = value as Partial<FactAtom>;
  return [atom.id, atom.entryId, atom.pin, atom.field, atom.value, atom.date].every((item) => typeof item === "string")
    && (atom.numeric === undefined || typeof atom.numeric === "number")
    && (atom.steps === undefined || (Array.isArray(atom.steps) && atom.steps.every((step) => typeof step === "string")));
}

function key(atoms: FactAtom[], seen: Seen[], count: number) {
  return JSON.stringify({ atoms: atoms.map((atom) => [atom.id, atom.value]), seen: seen.map((item) => [item.factId, item.format, item.variant]), count });
}

function locallyValidate(proposals: Proposal[], atoms: FactAtom[], seen: Seen[], count: number) {
  const atomById = new Map(atoms.map((atom) => [atom.id, atom]));
  const seenKeys = new Set(seen.map((item) => `${item.factId}:${item.format}:${item.variant}`));
  const cards = [];
  for (const proposal of proposals) {
    const atom = atomById.get(proposal.factId);
    if (!atom || !formats.includes(proposal.format) || !Number.isInteger(proposal.variant) || proposal.variant < 0 || proposal.variant > 3) continue;
    if (seenKeys.has(`${proposal.factId}:${proposal.format}:${proposal.variant}`)) continue;
    // The template is the validator: it draws every time/price/number and
    // the factual answer from the atom, never from AI-generated prose.
    const card = cardFromFact(atom, atoms, proposal.format, proposal.variant, proposal.variant + cards.length + 13);
    if (card) cards.push(card);
    if (cards.length >= count) break;
  }
  if (cards.length < count) {
    for (const atom of atoms) for (const format of formats) for (let variant = 0; variant < 4; variant++) {
      const card = cardFromFact(atom, atoms, format, variant, variant + cards.length);
      if (card && !cards.some((existing) => existing.id === card.id)) cards.push(card);
      if (cards.length >= count) return cards;
    }
  }
  return cards;
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as { atoms?: unknown[]; doNotRepeat?: Seen[]; count?: number; seed?: string };
  const atoms = (Array.isArray(body.atoms) ? body.atoms : []).filter(validAtom).slice(0, 300);
  const seen = Array.isArray(body.doNotRepeat) ? body.doNotRepeat.slice(-500) : [];
  const count = Math.min(50, Math.max(1, Math.round(body.count ?? 10)));
  if (!atoms.length) return NextResponse.json({ cards: [], source: "local", reason: "No evidence facts supplied." });
  const cacheKey = key(atoms, seen, count);
  const cached = bank.get(cacheKey);
  if (cached) return NextResponse.json({ ...cached, source: "cache" });

  let proposals: Proposal[] = [];
  const config = getOpenRouterConfig();
  if (config) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST", headers: { "Authorization": `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: config.model, temperature: 0.8, response_format: { type: "json_object" }, messages: [
          { role: "system", content: "Return strict JSON only: {\"questions\":[{\"factId\":string,\"format\":string,\"variant\":0-3}]}. Pick varied formats. Use only supplied fact IDs; do not write questions, answers, numbers, times, prices, or rules." },
          { role: "user", content: JSON.stringify({ facts: atoms, doNotRepeat: seen, count, seed: body.seed ?? "" }) },
        ] }),
      });
      const payload = await response.json() as { choices?: { message?: { content?: string } }[] };
      const parsed = JSON.parse(payload.choices?.[0]?.message?.content ?? "{}") as { questions?: Proposal[] };
      proposals = Array.isArray(parsed.questions) ? parsed.questions : [];
    } catch { /* local templates below are the intentionally safe fallback */ }
  }
  const cards = locallyValidate(proposals, atoms, seen, count);
  const value = { cards, createdAt: Date.now() };
  bank.set(cacheKey, value);
  return NextResponse.json({ ...value, source: proposals.length ? "ai-validated" : "local" });
}
