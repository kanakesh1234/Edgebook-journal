# Minato Brain patch

Unzip over the project root (same paths). No new dependencies. Apply after the earlier patches.

- src/lib/minato/brain-ml.ts (NEW): day brief, commitments, local semantic recall, personal risk neural net
- src/lib/types.ts: `AiBrainMemory.minato` (synced to Drive inside settings.aiBrain)
- src/lib/ai-brain.ts: journal sync now preserves `minato`
- src/lib/tagging/index.ts: the autopsy tagger receives what the trader told Minato (context only)
- src/components/ai/minato.tsx: Mind tab (Right now, Today, Commitments, Saved), Save this, hydration and persistence
- src/app/api/minato/chat/route.ts: prompt explains the brain payload
