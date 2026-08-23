"use client";

import { Button } from "./button";
import { Modal } from "./modal";
import { AlertTriangleIcon } from "./icons";

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = "Delete",
  busy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: string;
  confirmLabel?: string;
  busy?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} size="sm" label={title}>
      <div className="px-6 py-6">
        <div className="mb-4 inline-grid h-11 w-11 place-items-center rounded-xl border border-loss/30 bg-loss/[0.08] text-loss">
          <AlertTriangleIcon className="h-5 w-5" />
        </div>
        <h2 className="font-display text-lg font-semibold tracking-tight text-ink">{title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted">{body}</p>
        <div className="mt-6 flex justify-end gap-2.5">
          <Button variant="subtle" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={busy} disabled={busy}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
