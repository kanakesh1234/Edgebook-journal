import { NextResponse } from "next/server";
import { getOpenRouterConfig } from "@/lib/services/ai";
import { rateLimited, sessionEmail } from "@/lib/server/auth";
import { getGoogleConfig } from "@/lib/server/google-config";

export const dynamic = "force-dynamic";

type MatrixQuestionInput = { signature?: unknown; type?: unknown; prompt?: unknown; explanation?: unknown; answer?: unknown; unit?: unknown };
type SubmittedAnswers = Record<string, string | number | null>;
type ValidQuestion = { signature: string; type: string; prompt: string; explanation: string; answer?: unknown; unit?: unknown };

function validQuestion(value: unknown): value is ValidQuestion {
  if (!value || typeof value !== "object") return false;
  const item = value as MatrixQuestionInput;
  return typeof item.signature === "string" && typeof item.type === "string" && typeof item.prompt === "string" && typeof item.explanation === "string";
}

function fallback(questions: ReturnType<typeof normalize>, action: "frame" | "explain") {
  return questions.map((question) => ({
    signature: question.signature,
    prompt: question.prompt,
    explanation: action === "explain" ? question.explanation : "MINATO is unavailable, so this evidence-backed question is shown in its original wording.",
  }));
}

function normalize(items: unknown[]) {
  return items.filter(validQuestion).slice(0, 8).map((item) => ({
    signature: item.signature,
    type: item.type,
    prompt: item.prompt,
    explanation: item.explanation,
    // The deterministic engine verifies answers. AI receives no answer value.
    unit: typeof item.unit === "string" ? item.unit : undefined,
  }));
}

export async function POST(request: Request) {
  const me = sessionEmail(request);
  if (getGoogleConfig() && !me) return NextResponse.json({ items: [] }, { status: 401 });
  if (rateLimited(`matrix:${me ?? "local"}`, 30, 5 * 60_000)) return NextResponse.json({ items: [] }, { status: 429 });
  const body = await request.json().catch(() => ({})) as { action?: unknown; questions?: unknown[]; submittedAnswers?: unknown };
  const action = body.action === "explain" ? "explain" : body.action === "frame" ? "frame" : null;
  const questions = normalize(Array.isArray(body.questions) ? body.questions : []);
  if (!action || !questions.length) return NextResponse.json({ items: [] }, { status: 400 });
  const submitted = body.submittedAnswers && typeof body.submittedAnswers === "object" ? body.submittedAnswers as SubmittedAnswers : {};
  const config = getOpenRouterConfig();
  if (!config) return NextResponse.json({ items: fallback(questions, action), source: "local" });

  const instruction = action === "frame"
    ? "Rephrase each prompt so it feels distinct and engaging. Keep every factual value and its meaning exactly unchanged."
    : "Write a short supportive explanation after the trader submitted an answer. Explain only using the supplied deterministic explanation and prompt; do not introduce facts, prices, trade advice, or a different answer.";
  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.model,
        temperature: action === "frame" ? 0.9 : 0.5,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "You are MINATO. Return strict JSON only: {\"items\":[{\"signature\":string,\"prompt\":string,\"explanation\":string}]}. Preserve every signature. Never create or alter answers. Never add facts, numbers, prices, setups, or trade advice. Keep each field below 500 characters." },
          { role: "user", content: JSON.stringify({ task: instruction, questions, submittedAnswers: action === "explain" ? submitted : undefined }) },
        ],
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return NextResponse.json({ items: fallback(questions, action), source: "local" });
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const parsed = JSON.parse(payload.choices?.[0]?.message?.content ?? "{}") as { items?: unknown[] };
    const received = Array.isArray(parsed.items) ? parsed.items.filter(validQuestion) : [];
    const expected = new Map(questions.map((question) => [question.signature, question]));
    const items = received.filter((item) => expected.has(item.signature)).map((item) => ({ signature: item.signature, prompt: item.prompt.slice(0, 500), explanation: item.explanation.slice(0, 500) }));
    return NextResponse.json({ items: items.length === questions.length ? items : fallback(questions, action), source: items.length === questions.length ? "minato" : "local" });
  } catch {
    return NextResponse.json({ items: fallback(questions, action), source: "local" });
  }
}
