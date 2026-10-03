import type { MathQuestion } from "./families/types";

export interface PhraseTemplate { id: string; family: string; unknown: string; text: string; placeholders: string[]; usedAt?: number; }
const key = "edgebook.math-duel.phrasebook.v1";
export const placeholdersFor = (question: MathQuestion) => Object.keys(question.params);
export function renderTemplate(template: PhraseTemplate, params: Record<string, number>) { return template.text.replace(/\{([a-z]+)\}/g, (_, name: string) => String(params[name] ?? `{${name}}`)); }
export function validateTemplate(text: string, required: string[]) {
  if (text.length < 18 || text.length > 220 || /\d/.test(text) || /(?:answer|solution)\s*(?:is|=)/i.test(text)) return false;
  const found = [...text.matchAll(/\{([a-z]+)\}/g)].map((match) => match[1]!);
  return found.length === required.length && required.every((name) => found.filter((value) => value === name).length === 1) && found.every((name) => required.includes(name));
}
export function builtinTemplate(question: MathQuestion): PhraseTemplate { const placeholders = placeholdersFor(question); return { id: `builtin:${question.family}:${placeholders.join("-")}`, family: question.family, unknown: question.family, placeholders, text: `Minato drill: use ${placeholders.map((name) => `{${name}}`).join(", ")} and calculate the requested value.` }; }
export function loadPhrasebook(): PhraseTemplate[] { try { return JSON.parse(localStorage.getItem(key) ?? "[]") as PhraseTemplate[]; } catch { return []; } }
export function savePhrasebook(templates: PhraseTemplate[]) { try { localStorage.setItem(key, JSON.stringify(templates.slice(-1200))); } catch { /* storage is an optional cache */ } }
export function chooseTemplate(question: MathQuestion, templates: PhraseTemplate[], recent: string[]) { const required = placeholdersFor(question); return templates.find((template) => template.family === question.family && validateTemplate(template.text, required) && !recent.includes(template.id)) ?? builtinTemplate(question); }
