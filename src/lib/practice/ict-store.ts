import { useApp } from "@/lib/store";
import { dataStore } from "@/lib/services/storage";
import { dropImageUrl } from "@/lib/images";
import { uid } from "@/lib/utils";
import type { EntryImage } from "@/lib/types";
import type { GameProgress, IctCard } from "./progress-ext";

const FRESH: GameProgress = { xp: 0, streak: 0, freezeDays: 1 };

export const readCards = (): IctCard[] => (useApp.getState().settings.practiceProgress as GameProgress | undefined)?.ictCards ?? [];

/** Applies a change to the saved ICT cards, always against the latest saved progress. */
export async function updateCards(change: (cards: IctCard[]) => IctCard[]): Promise<void> {
  const app = useApp.getState();
  const live = (app.settings.practiceProgress as GameProgress | undefined) ?? FRESH;
  const next: GameProgress = { ...live, ictCards: change(live.ictCards ?? []) };
  await app.updateSettings({ practiceProgress: next });
}

export interface CardDraft { question: string; answer: string; notes: string; concept: string; tags: string[]; images: Array<{ meta: EntryImage; blob: Blob | null }> }

/** Saves a new or edited card: picture binaries first, then the card itself; pictures removed while editing are deleted. */
export async function saveCard(draft: CardDraft, existing?: IctCard): Promise<IctCard> {
  const now = Date.now();
  await Promise.all(draft.images.filter((i) => i.blob).map((i) => dataStore.putImage(i.meta.id, i.blob!)));
  const keep = new Set(draft.images.map((i) => i.meta.id));
  for (const old of existing?.images ?? []) if (!keep.has(old.id)) { try { await dataStore.deleteImage(old.id); } catch { /* an orphaned picture is harmless */ } dropImageUrl(old.id); }
  const changed = !existing || existing.question !== draft.question || existing.answer !== draft.answer;
  const card: IctCard = {
    ...(existing ?? { id: uid("ict"), createdAt: now }),
    question: draft.question, answer: draft.answer, notes: draft.notes || undefined, images: draft.images.map((i) => i.meta), updatedAt: now,
    concept: draft.concept || undefined, tags: draft.tags.length ? draft.tags : undefined,
    // New wording means the AI question styles written for the old wording are no longer valid.
    ...(changed ? { variants: undefined, variantsFor: undefined } : {}),
  };
  await updateCards((cards) => (existing ? cards.map((c) => (c.id === card.id ? card : c)) : [card, ...cards]));
  return card;
}

export async function deleteCard(card: IctCard): Promise<void> {
  for (const img of card.images) { try { await dataStore.deleteImage(img.id); } catch { /* best effort */ } dropImageUrl(img.id); }
  await updateCards((cards) => cards.filter((c) => c.id !== card.id));
}
