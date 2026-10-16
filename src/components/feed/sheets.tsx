"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useDragControls, useReducedMotion } from "motion/react";
import { toast } from "@/components/ui/toast";
import { uid } from "@/lib/utils";
import { LIMITS } from "@/lib/feed/state";
import type { FeedCollection, FeedKey } from "@/lib/feed/types";
import { AMBIENT, MAX_TRACKS, addTrack, listTracks, music, removeTrack, type CustomTrack } from "@/lib/feed/music";
import { useFeed } from "./feed-store";
import { CheckIcon, PlusIcon, XIcon, MusicIcon } from "./feed-icons";

/* ------------------------------ sheet shell ------------------------------ */

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select,textarea,[tabindex]:not([tabindex="-1"])';

/** Bottom sheet on phones, centred dialog from tablet up. Portaled above the tab bar; Esc and the scrim close it; focus is trapped and restored. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const controls = useDragControls();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = window.setTimeout(() => (ref.current?.querySelector<HTMLElement>("input,button") ?? ref.current)?.focus(), 60);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); return; }
      if (e.key !== "Tab" || !ref.current) return;
      const els = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (!els.length) return;
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey, true);
    return () => { window.clearTimeout(t); document.removeEventListener("keydown", onKey, true); prev?.focus?.(); };
  }, [open, onClose]);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div key="scrim" className="fd-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduce ? 0 : 0.2 }} onClick={onClose} aria-hidden />
          <div key="wrap" className="fd-sheet-wrap">
            <motion.div ref={ref} className="fd-sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
              initial={reduce ? { opacity: 0 } : { y: "100%" }} animate={reduce ? { opacity: 1 } : { y: 0 }} exit={reduce ? { opacity: 0 } : { y: "100%" }}
              transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 38 }}
              drag={reduce ? false : "y"} dragControls={controls} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.5 }} dragListener={false}
              onDragEnd={(_, i) => { if (i.offset.y > 110 || i.velocity.y > 600) onClose(); }}>
              <div className="fd-sheet-drag" onPointerDown={(e) => { if (!reduce) controls.start(e); }} style={{ touchAction: "none" }}>
              <div className="fd-sheet-grab" aria-hidden />
              <div className="fd-sheet-head">
                <h3>{title}</h3>
                <button className="fd-iconbtn" onClick={onClose} aria-label="Close" onPointerDown={(e) => e.stopPropagation()}><XIcon /></button>
              </div>
              </div>
              <div className="fd-sheet-body">{children}</div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}

const Switch = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
  <button role="switch" aria-checked={checked} aria-label={label} className="fd-switch" onClick={() => onChange(!checked)} />
);

/* ---------------------------- add to collection ---------------------------- */

export function CollectSheet({ itemKey, onClose }: { itemKey: FeedKey | null; onClose: () => void }) {
  const collections = useFeed((s) => s.state.collections);
  const toggle = useFeed((s) => s.toggleInCollection);
  const create = useFeed((s) => s.createCollection);
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  useEffect(() => { if (itemKey) { setName(""); setErr(""); } }, [itemKey]);

  const submit = () => {
    if (!itemKey) return;
    const r = create(name, itemKey);
    if (!r.ok) { setErr(r.reason === "empty" ? "Give it a name." : r.reason === "duplicate" ? "You already have a collection with that name." : `You can have up to ${LIMITS.collections} collections.`); return; }
    setName(""); setErr(""); toast.success("Added to a new collection");
  };

  return (
    <Sheet open={!!itemKey} onClose={onClose} title="Save to collection">
      {collections.length > 0 && (
        <div role="group" aria-label="Collections" style={{ display: "grid", gap: "0.5rem" }}>
          {collections.map((c) => {
            const has = !!itemKey && c.items.includes(itemKey);
            return (
              <button key={c.id} className="fd-opt" role="checkbox" aria-checked={has} onClick={() => itemKey && toggle(c.id, itemKey)}>
                <span><b>{c.name}</b><small>{c.items.length} saved</small></span>
                <span aria-hidden style={{ color: "var(--st-gold)", width: 20 }}>{has && <CheckIcon style={{ width: 20, height: 20 }} />}</span>
              </button>
            );
          })}
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); submit(); }} style={{ display: "grid", gap: "0.5rem" }}>
        <label className="fd-label" htmlFor="fd-new-col">New collection</label>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <input id="fd-new-col" className="fd-input" value={name} maxLength={LIMITS.nameLength} placeholder="e.g. NY open, Mistakes to review" onChange={(e) => { setName(e.target.value); setErr(""); }} />
          <button type="submit" className="fd-linkbtn is-primary" style={{ minWidth: "5rem" }}><PlusIcon />Add</button>
        </div>
        {err && <p role="alert" className="fd-help" style={{ color: "var(--st-down)" }}>{err}</p>}
      </form>
    </Sheet>
  );
}

/* ---------------------------- manage a collection ---------------------------- */

export function ManageCollectionSheet({ collection, onClose, onDeleted }: { collection: FeedCollection | null; onClose: () => void; onDeleted: () => void }) {
  const rename = useFeed((s) => s.renameCollection);
  const del = useFeed((s) => s.deleteCollection);
  const [name, setName] = useState("");
  const [armed, setArmed] = useState(false);
  useEffect(() => { setName(collection?.name ?? ""); setArmed(false); }, [collection?.id, collection?.name]);
  return (
    <Sheet open={!!collection} onClose={onClose} title="Manage collection">
      <form onSubmit={(e) => { e.preventDefault(); if (collection) { rename(collection.id, name); onClose(); } }} style={{ display: "grid", gap: "0.5rem" }}>
        <label className="fd-label" htmlFor="fd-ren">Name</label>
        <input id="fd-ren" className="fd-input" value={name} maxLength={LIMITS.nameLength} onChange={(e) => setName(e.target.value)} />
        <button type="submit" className="fd-linkbtn is-primary" style={{ justifySelf: "start" }}>Save name</button>
      </form>
      <div style={{ display: "grid", gap: "0.5rem" }}>
        <p className="fd-help">Deleting a collection never deletes the trades, setups or lessons inside it.</p>
        <button className="fd-linkbtn" style={{ justifySelf: "start", color: armed ? "#fff" : "var(--st-down)", background: armed ? "#c4545c" : undefined }}
          onClick={() => { if (!armed) { setArmed(true); return; } if (collection) { del(collection.id); onDeleted(); } }}>
          {armed ? "Tap again to delete" : "Delete collection"}
        </button>
      </div>
    </Sheet>
  );
}

/* ------------------------------- settings ------------------------------- */

const LIMIT_CHOICES = [10, 20, 30, 45, 0] as const;

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const prefs = useFeed((s) => s.state.prefs);
  const setPrefs = useFeed((s) => s.setPrefs);
  const [tracks, setTracks] = useState<CustomTrack[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [rights, setRights] = useState(false);
  const [license, setLicense] = useState("");
  const [adding, setAdding] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) void listTracks().then(setTracks); else { music.stop(200); setPreviewing(false); } }, [open]);

  const preview = async () => {
    if (previewing) { music.stop(300); setPreviewing(false); return; }
    const r = await music.play(prefs.music.source, prefs.music.volume);
    if (r === "ok") setPreviewing(true);
    else if (r === "missing") toast.info("That track isn’t on this device", "Add it again or pick another source.");
    else toast.info("Couldn’t start audio", "Your browser blocked it. Tap preview again.");
  };

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setAdding(true);
    const r = await addTrack(f, license, rights, uid("trk"));
    setAdding(false);
    if (!r.ok) { toast.error("Couldn’t add that track", r.reason); return; }
    setTracks((t) => [...t, r.track]); setLicense(""); setRights(false);
    setPrefs({ music: { source: `custom:${r.track.id}` } });
    toast.success("Track added", "It stays on this device only.");
    if (file.current) file.current.value = "";
  };

  const remove = async (t: CustomTrack) => {
    await removeTrack(t.id);
    setTracks((x) => x.filter((y) => y.id !== t.id));
    if (prefs.music.source === `custom:${t.id}`) { music.stop(200); setPreviewing(false); setPrefs({ music: { source: "ambient-calm" } }); }
  };

  return (
    <Sheet open={open} onClose={onClose} title="Feed settings">
      <section style={{ display: "grid", gap: "0.625rem" }} aria-labelledby="fd-s-time">
        <p className="fd-label" id="fd-s-time">Daily time</p>
        <div role="radiogroup" aria-label="Daily time limit" style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
          {LIMIT_CHOICES.map((m) => (
            <button key={m} role="radio" aria-checked={prefs.dailyMinutes === m} className="fd-opt" style={{ width: "auto", minWidth: "4.25rem", justifyContent: "center" }} onClick={() => setPrefs({ dailyMinutes: m })}>
              {m === 0 ? "No limit" : `${m} min`}
            </button>
          ))}
        </div>
        <p className="fd-help">A gentle reminder, not a lock. When you reach it you’ll be offered a break — you can always keep going or change this.</p>
      </section>

      <section style={{ display: "grid", gap: "0.5rem" }}>
        <p className="fd-label">Playback</p>
        <div className="fd-opt"><span><b>Autoplay replays</b><small>Off by default. Replays start only when you press play.</small></span><Switch checked={prefs.autoplayReplay} onChange={(v) => setPrefs({ autoplayReplay: v })} label="Autoplay replays" /></div>
        <div className="fd-opt"><span><b>Haptic feedback</b><small>Light taps on phones that support it.</small></span><Switch checked={prefs.haptics} onChange={(v) => setPrefs({ haptics: v })} label="Haptic feedback" /></div>
      </section>

      <section style={{ display: "grid", gap: "0.625rem" }} aria-labelledby="fd-s-music">
        <p className="fd-label" id="fd-s-music">Music during replays</p>
        <div className="fd-opt"><span><b>Play music while a replay runs</b><small>Off by default. It never starts on its own.</small></span><Switch checked={prefs.music.enabled} onChange={(v) => setPrefs({ music: { enabled: v } })} label="Music during replays" /></div>

        <div role="radiogroup" aria-label="Music source" style={{ display: "grid", gap: "0.5rem" }}>
          {AMBIENT.map((a) => (
            <button key={a.id} role="radio" aria-checked={prefs.music.source === a.id} className="fd-opt" onClick={() => setPrefs({ music: { source: a.id } })}>
              <span><b>{a.label}</b><small>{a.detail} · built in, original</small></span>
              {prefs.music.source === a.id && <CheckIcon style={{ width: 18, height: 18, color: "var(--st-gold)" }} />}
            </button>
          ))}
          {tracks.map((t) => (
            <div key={t.id} className="fd-opt" role="radio" aria-checked={prefs.music.source === `custom:${t.id}`} tabIndex={0}
              onClick={() => setPrefs({ music: { source: `custom:${t.id}` } })} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPrefs({ music: { source: `custom:${t.id}` } }); } }}>
              <span style={{ minWidth: 0 }}><b style={{ overflowWrap: "anywhere" }}>{t.name}</b><small>Your file · {(t.size / 1048576).toFixed(1)} MB{t.license ? ` · ${t.license}` : ""}</small></span>
              <button className="fd-small" onClick={(e) => { e.stopPropagation(); void remove(t); }} aria-label={`Remove ${t.name}`}><XIcon /></button>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <label htmlFor="fd-vol" className="fd-help" style={{ flex: "none" }}>Volume</label>
          <input id="fd-vol" className="fd-range" type="range" min={0} max={100} value={Math.round(prefs.music.volume * 100)}
            onChange={(e) => { const v = Number(e.target.value) / 100; music.setVolume(v); setPrefs({ music: { volume: v } }); }} />
          <button className="fd-linkbtn" onClick={() => void preview()} aria-pressed={previewing}><MusicIcon />{previewing ? "Stop" : "Preview"}</button>
        </div>

        <div className="fd-card-box" role="group" aria-label="Add your own audio">
          <p><b>Add your own audio</b></p>
          <p className="fd-help">Edgebook doesn’t include any songs. If you own a Telugu track — or have a licence to use it — you can add it here. Files stay in this browser only: they’re never uploaded or sent to Google Drive, so they won’t appear on your other devices.</p>
          <label className="fd-opt" style={{ cursor: "pointer" }}>
            <span><b>I own this audio or have a licence to use it</b></span>
            <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} style={{ width: 22, height: 22, accentColor: "#dcb872" }} />
          </label>
          <input className="fd-input" value={license} maxLength={200} onChange={(e) => setLicense(e.target.value)} placeholder="Licence or source note (optional)" aria-label="Licence or source note" />
          <input ref={file} type="file" accept="audio/*,.mp3,.m4a,.aac,.ogg,.opus,.wav,.flac" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
          <button className="fd-linkbtn is-primary" style={{ justifySelf: "start" }} disabled={!rights || adding || tracks.length >= MAX_TRACKS} onClick={() => file.current?.click()}>{adding ? "Adding…" : "Choose audio file"}</button>
          {tracks.length >= MAX_TRACKS && <p className="fd-help">You’ve reached {MAX_TRACKS} tracks. Remove one to add another.</p>}
        </div>
      </section>

      <section style={{ display: "grid", gap: "0.5rem" }}>
        <p className="fd-label">On this device</p>
        <button className="fd-linkbtn" style={{ justifySelf: "start" }} onClick={() => { try { localStorage.removeItem("edgebook.feed.seen.v1"); } catch { /* ignore */ } toast.success("Cleared", "Reopen the Feed to see everything ranked fresh.\u200b"); }}>Reset “already seen” history</button>
      </section>
    </Sheet>
  );
}

/* ------------------------------ break prompt ------------------------------ */

export function BreakPrompt({ kind, minutes, onBreak, onMore }: { kind: "none" | "break" | "enough"; minutes: number; onBreak: () => void; onMore: () => void }) {
  const open = kind !== "none";
  return (
    <Sheet open={open} onClose={onMore} title={kind === "enough" ? "That’s a good stopping point" : "Time for a short break?"}>
      <p className="fd-help" style={{ fontSize: "0.9375rem", color: "var(--st-ink)" }}>
        {kind === "enough"
          ? `You’ve spent ${minutes} minutes in the Feed today. The best study sticks when you step away — your cards will be here tomorrow.`
          : `You’ve spent ${minutes} minutes in the Feed today, which is your daily limit. Stretch, drink some water, look away from the screen.`}
      </p>
      <div style={{ display: "grid", gap: "0.5rem" }}>
        <button className="fd-linkbtn is-primary" style={{ justifyContent: "center", minHeight: "3rem" }} onClick={onBreak}>{kind === "enough" ? "Done for today" : "Take a break"}</button>
        <button className="fd-linkbtn" style={{ justifyContent: "center", minHeight: "3rem" }} onClick={onMore}>{kind === "enough" ? "Keep going anyway (5 more minutes)" : "5 more minutes"}</button>
      </div>
      <p className="fd-help">You can change or turn off this reminder in Feed settings.</p>
    </Sheet>
  );
}
