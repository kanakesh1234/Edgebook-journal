import type { MathFamily } from "./families/types";
export type FamilyRating = Record<string, { level: 1 | 2 | 3 | 4; weakRounds: number }>;
export function nextLevel(ratings: FamilyRating, family: MathFamily, accuracy: number): 1 | 2 | 3 | 4 { const current = ratings[family]?.level ?? 1; const weak = accuracy < .5 ? (ratings[family]?.weakRounds ?? 0) + 1 : 0; if (weak >= 2) return Math.max(1, current - 1) as 1 | 2 | 3 | 4; return accuracy < .5 ? current : Math.min(4, current + 1) as 1 | 2 | 3 | 4; }
export function updateRating(ratings: FamilyRating, family: MathFamily, accuracy: number): FamilyRating { const weakRounds = accuracy < .5 ? (ratings[family]?.weakRounds ?? 0) + 1 : 0; return { ...ratings, [family]: { level: nextLevel(ratings, family, accuracy), weakRounds } }; }
