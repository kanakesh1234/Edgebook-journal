import type { Rng } from "../rng";
export type MathFamily = "breakeven" | "expectancy" | "sizing" | "fees" | "streak" | "at-least-one" | "buffer" | "net-positive";
export type MathFormat = "numeric" | "multiple-choice" | "which-is-true" | "spot-the-error" | "reverse";
export interface MathQuestion { id: string; family: MathFamily; level: 1 | 2 | 3 | 4; source: "drill" | "linked"; prompt: string; givens: string[]; answerKind: "number" | "percent" | "contracts"; answer: number; tolerance: number; unit: string; parSeconds: number; steps: string[]; signature: string; params: Record<string, number>; format?: MathFormat; choices?: number[]; }
export type FamilyGenerator = (rng: Rng, level: MathQuestion["level"]) => MathQuestion;
