"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { haptic } from "@/lib/haptics";
import { I } from "./tv-icons";

/* Tiny toast store: success / info / warn / error, optional action (e.g. Undo). */

export type ToastKind = "success" | "info" | "warn" | "error";
export interface Toast {
  id: number;
  kind: ToastKind;
  text: string;
  action?: { label: string; run: () => void };
  /** ms before auto-dismiss */
  ms: number;
  /** leaving animation in progress */
  leaving?: boolean;
}

let list: Toast[] = [];
let nextId = 1;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

export function toast(t: { kind?: ToastKind; text: string; action?: Toast["action"]; ms?: number }): number {
  const id = nextId++;
  const item: Toast = { id, kind: t.kind ?? "success", text: t.text, action: t.action, ms: t.ms ?? (t.action ? 6000 : 3200) };
  // newest on top, max 3 visible
  list = [item, ...list].slice(0, 3);
  emit();
  if (item.kind === "success") haptic.success();
  else if (item.kind === "error") haptic.error();
  return id;
}

export function dismissToast(id: number) {
  const t = list.find((x) => x.id === id);
  if (!t || t.leaving) return;
  list = list.map((x) => (x.id === id ? { ...x, leaving: true } : x));
  emit();
  window.setTimeout(() => { list = list.filter((x) => x.id !== id); emit(); }, 200);
}

const subscribe = (cb: () => void) => { subs.add(cb); return () => { subs.delete(cb); }; };
const snapshot = () => list;
const EMPTY: Toast[] = [];

const ICON: Record<ToastKind, string> = { success: "check", info: "info", warn: "alert", error: "close" };

function ToastItem({ t }: { t: Toast }) {
  const timer = useRef(0);
  const arm = (ms: number) => { window.clearTimeout(timer.current); timer.current = window.setTimeout(() => dismissToast(t.id), ms); };
  useEffect(() => { arm(t.ms); return () => window.clearTimeout(timer.current); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [t.id]);

  return (
    <div
      className={`ej-toast is-${t.kind}${t.leaving ? " is-leaving" : ""}`} role={t.kind === "error" || t.kind === "warn" ? "alert" : "status"}
      onPointerEnter={() => window.clearTimeout(timer.current)} onPointerLeave={() => arm(1600)}
    >
      <span className="ej-toast-badge" aria-hidden="true"><I name={ICON[t.kind]} size={16} filled={t.kind === "warn"} /></span>
      <span className="ej-toast-text">{t.text}</span>
      {t.action && (
        <button type="button" className="ej-toast-act" onClick={() => { t.action!.run(); dismissToast(t.id); }}>{t.action.label}</button>
      )}
      <button type="button" className="ej-toast-x" aria-label="Dismiss" onClick={() => dismissToast(t.id)}><I name="close" size={14} /></button>
    </div>
  );
}

/** Mount once inside `.tv-root`. */
export default function ToastHost() {
  const items = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  return (
    <div className="ej-toasts" aria-live="polite">
      {items.map((t) => <ToastItem key={t.id} t={t} />)}
    </div>
  );
}
