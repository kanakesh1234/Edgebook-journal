/**
 * "How did it feel?" — the answer after a trade. The first group are one tap away; the rest sit behind "More…".
 * `flag` keeps the older psychology fields (fomo / revenge / fearExit) meaningful for the rest of the app,
 * and `tone` lets the Weekly Review say whether a feeling tends to travel with good or poor process.
 */
export type FeelingKey =
  | "calm" | "proud" | "confident" | "adrenaline" | "fomo" | "revenge" | "fear"
  | "focused" | "excited" | "relieved" | "satisfied" | "anxious" | "frustrated" | "regretful" | "overconfident" | "tired";

export type Feeling = { key: FeelingKey; label: string; tone: "good" | "neutral" | "risk"; drive: "conviction" | "urgency" | "" };

export const FEELINGS: Feeling[] = [
  { key: "calm", label: "Calm", tone: "good", drive: "conviction" },
  { key: "proud", label: "Proud", tone: "good", drive: "conviction" },
  { key: "confident", label: "Confident", tone: "good", drive: "conviction" },
  { key: "adrenaline", label: "Adrenaline rush", tone: "risk", drive: "urgency" },
  { key: "fomo", label: "FOMO", tone: "risk", drive: "urgency" },
  { key: "revenge", label: "Urgent", tone: "risk", drive: "urgency" },
  { key: "fear", label: "Hesitant", tone: "risk", drive: "" },
  { key: "focused", label: "Focused", tone: "good", drive: "conviction" },
  { key: "excited", label: "Excited", tone: "neutral", drive: "urgency" },
  { key: "relieved", label: "Relieved", tone: "neutral", drive: "" },
  { key: "satisfied", label: "Satisfied", tone: "good", drive: "conviction" },
  { key: "anxious", label: "Anxious", tone: "risk", drive: "urgency" },
  { key: "frustrated", label: "Frustrated", tone: "risk", drive: "urgency" },
  { key: "regretful", label: "Regretful", tone: "risk", drive: "" },
  { key: "overconfident", label: "Overconfident", tone: "risk", drive: "urgency" },
  { key: "tired", label: "Tired", tone: "neutral", drive: "" },
];
export const PRIMARY_FEELINGS = FEELINGS.slice(0, 7);
export const MORE_FEELINGS = FEELINGS.slice(7);

const BY_KEY = new Map(FEELINGS.map((f) => [f.key, f]));
export const feelingOf = (k: string | undefined | null): Feeling | null => (k && BY_KEY.get(k as FeelingKey)) || null;
export const isFeelingKey = (k: unknown): k is FeelingKey => typeof k === "string" && BY_KEY.has(k as FeelingKey);

/** Reads a stored review back into one feeling, including trades reviewed before the longer list existed. */
export function feelingFromReview(p: { emotionAfter?: string; fomo?: boolean | null; revenge?: boolean | null; fearExit?: boolean | null; convictionOrUrgency?: string } | undefined): FeelingKey | "" {
  if (!p) return "";
  if (isFeelingKey(p.emotionAfter)) return p.emotionAfter;
  if (p.fomo) return "fomo";
  if (p.revenge) return "revenge";
  if (p.fearExit) return "fear";
  return p.convictionOrUrgency === "conviction" ? "calm" : "";
}
