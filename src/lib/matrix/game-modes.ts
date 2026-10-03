export const MATRIX_GAME_MODES = ["classic", "time-attack", "what-if", "pro"] as const;
export type MatrixGameMode = (typeof MATRIX_GAME_MODES)[number];

export const MATRIX_MODE_DETAILS: Record<MatrixGameMode, { label: string; description: string; xpMultiplier: number; secondsPerQuestion?: number }> = {
  classic: { label: "Classic", description: "The standard recorded-trade test.", xpMultiplier: 1 },
  "time-attack": { label: "Time Attack", description: "Thirty seconds per question for 50% more XP.", xpMultiplier: 1.5, secondsPerQuestion: 30 },
  "what-if": { label: "What-If", description: "Recorded entry and stop levels applied to alternative targets.", xpMultiplier: 1 },
  pro: { label: "Pro", description: "Multi-step price and risk calculations from this trade.", xpMultiplier: 1 },
};

export function isMatrixGameMode(value: string | null | undefined): value is MatrixGameMode {
  return !!value && MATRIX_GAME_MODES.includes(value as MatrixGameMode);
}
