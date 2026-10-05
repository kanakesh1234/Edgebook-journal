"use client";

import type { JournalEntry } from "@/lib/types";
import { toast } from "@/components/ui/toast";
import { Modal } from "@/components/ui/modal";
import { AutopsyBody, useAutopsy } from "./autopsy";
import { Hint, PrimaryButton, SheetFrame } from "./flow-ui";

/**
 * Standalone Autopsy (opened from a trade's review page / the journal).
 * The same four questions as the Plan & Record flow. It always reads the live
 * trade from the store, so attached screenshots are never reported as missing.
 */
export function TradeReviewFlow({ open, entry, onClose }: { open: boolean; entry: JournalEntry | null; onClose: () => void }) {
  const a = useAutopsy(entry?.id ?? null, open, entry);
  if (!entry) return null;

  const complete = async () => {
    if (await a.submit()) {
      toast.success("Autopsy complete", "Process noted — outcome is just data.");
      onClose();
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="md" label="Trade autopsy">
      <SheetFrame
        onClose={onClose}
        hint={<Hint text={a.error ?? (a.ready ? null : "Answer the first three to finish")} tone={a.error ? "warn" : "muted"} />}
        actions={<PrimaryButton disabled={!a.ready} loading={a.saving} onClick={() => void complete()}>Complete</PrimaryButton>}
      >
        <AutopsyBody a={a} />
      </SheetFrame>
    </Modal>
  );
}
