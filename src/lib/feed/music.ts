/* Optional music for chart replays.
 *
 * Two sources, and nothing else:
 *   1. Built-in ambience — synthesized live in the browser from oscillators. It is original, so there is no
 *      licensing question and nothing to download.
 *   2. The viewer's own audio files (for example Telugu tracks they own or are licensed to use). They are
 *      stored only in this browser (IndexedDB), never uploaded and never sent to Drive, and each one is added
 *      only after the viewer confirms they have the right to use it.
 *
 * Edgebook does not bundle, stream or link to any commercial music.
 */

import { get, set, del } from "idb-keyval";

export interface CustomTrack {
  id: string;
  name: string;
  size: number;
  /** What the viewer told us about the licence (free text, e.g. "Licensed from Artist, invoice #12"). */
  license: string;
  rightsConfirmedAt: number;
  addedAt: number;
}

export const AMBIENT = [
  { id: "ambient-calm", label: "Calm ambience", detail: "Soft, slow pad" },
  { id: "ambient-focus", label: "Focus drone", detail: "Low and steady" },
] as const;

export const MAX_TRACKS = 12;
export const MAX_TRACK_BYTES = 25 * 1024 * 1024;
const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|wav|flac|weba)$/i;
const META_KEY = "edgebook.feed.tracks.v1";
const blobKey = (id: string) => `edgebook.feed.track.${id}`;

/** null = acceptable, otherwise a plain-language reason. */
export function validateTrackFile(file: { name: string; type: string; size: number }, existing: number): string | null {
  if (existing >= MAX_TRACKS) return `You can keep up to ${MAX_TRACKS} tracks on this device. Remove one first.`;
  if (!(file.type.startsWith("audio/") || AUDIO_EXT.test(file.name))) return "That doesn't look like an audio file. Use MP3, M4A, WAV, OGG or FLAC.";
  if (file.size <= 0) return "That file is empty.";
  if (file.size > MAX_TRACK_BYTES) return `That file is ${(file.size / 1048576).toFixed(1)} MB. The limit is ${MAX_TRACK_BYTES / 1048576} MB per track.`;
  return null;
}

export const sourceLabel = (source: string, tracks: CustomTrack[]) =>
  AMBIENT.find((a) => a.id === source)?.label ?? tracks.find((t) => `custom:${t.id}` === source)?.name ?? "Calm ambience";

/* ---------------------------- device library ---------------------------- */

export async function listTracks(): Promise<CustomTrack[]> {
  try {
    const raw = await get<CustomTrack[]>(META_KEY);
    return Array.isArray(raw) ? raw.filter((t) => t && typeof t.id === "string" && typeof t.name === "string") : [];
  } catch { return []; }
}

export async function addTrack(file: File, license: string, rightsConfirmed: boolean, id: string): Promise<{ ok: true; track: CustomTrack } | { ok: false; reason: string }> {
  if (!rightsConfirmed) return { ok: false, reason: "Confirm that you have the right to use this audio first." };
  const tracks = await listTracks();
  const problem = validateTrackFile(file, tracks.length);
  if (problem) return { ok: false, reason: problem };
  const track: CustomTrack = {
    id, name: file.name.replace(/\.[^.]+$/, "").slice(0, 60) || "Track", size: file.size,
    license: license.trim().slice(0, 200), rightsConfirmedAt: Date.now(), addedAt: Date.now(),
  };
  try {
    await set(blobKey(id), file);
    await set(META_KEY, [...tracks, track]);
  } catch {
    return { ok: false, reason: "This browser couldn't store the file (storage may be full or private browsing is on)." };
  }
  return { ok: true, track };
}

export async function removeTrack(id: string): Promise<void> {
  try { await del(blobKey(id)); await set(META_KEY, (await listTracks()).filter((t) => t.id !== id)); } catch { /* best effort */ }
}

/* -------------------------------- engine -------------------------------- */

type Stopper = (fadeMs: number) => void;
export type PlayResult = "ok" | "missing" | "blocked" | "unsupported";

class MusicEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private stopCurrent: Stopper | null = null;
  private volume = 0.35;
  playing = false;
  private token = 0;

  private ensure(): boolean {
    if (this.ctx) return true;
    const AC = typeof window !== "undefined" ? window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext : undefined;
    if (!AC) return false;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(this.ctx.destination);
    return true;
  }

  setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v));
    if (this.ctx && this.master && this.playing) this.master.gain.setTargetAtTime(this.volume * 0.8, this.ctx.currentTime, 0.08);
  }

  async play(source: string, volume: number): Promise<PlayResult> {
    if (!this.ensure() || !this.ctx || !this.master) return "unsupported";
    const my = ++this.token;
    this.volume = volume;
    try { if (this.ctx.state !== "running") await this.ctx.resume(); } catch { return "blocked"; }
    if (this.ctx.state !== "running") return "blocked";
    this.halt(250);

    const ctx = this.ctx, master = this.master;
    let stopper: Stopper | null = null;
    if (source.startsWith("custom:")) {
      const blob = await get<Blob>(blobKey(source.slice(7))).catch(() => undefined);
      if (!blob) return "missing";
      if (my !== this.token) return "ok";
      const url = URL.createObjectURL(blob);
      const el = new Audio(url);
      el.loop = true;
      const node = ctx.createMediaElementSource(el);
      node.connect(master);
      try { await el.play(); } catch { URL.revokeObjectURL(url); node.disconnect(); return "blocked"; }
      stopper = (fade) => { window.setTimeout(() => { el.pause(); node.disconnect(); URL.revokeObjectURL(url); }, fade + 60); };
    } else {
      stopper = this.ambient(ctx, master, source === "ambient-focus" ? "focus" : "calm");
    }
    if (my !== this.token) { stopper(100); return "ok"; }
    this.stopCurrent = stopper;
    this.playing = true;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(master.gain.value, ctx.currentTime);
    master.gain.linearRampToValueAtTime(this.volume * 0.8, ctx.currentTime + 1.2);
    return "ok";
  }

  private halt(fadeMs: number) {
    if (this.ctx && this.master) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setValueAtTime(this.master.gain.value, this.ctx.currentTime);
      this.master.gain.linearRampToValueAtTime(0, this.ctx.currentTime + fadeMs / 1000);
    }
    this.stopCurrent?.(fadeMs);
    this.stopCurrent = null;
  }

  stop(fadeMs = 600) {
    this.token++;
    this.halt(fadeMs);
    this.playing = false;
  }

  /** A slow, soft pad: a few detuned oscillators through a gently sweeping low-pass filter. All original. */
  private ambient(ctx: AudioContext, master: GainNode, mood: "calm" | "focus"): Stopper {
    const chord = mood === "calm" ? [110, 164.81, 220, 261.63, 329.63] : [55, 82.41, 110, 164.81];
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = mood === "calm" ? 900 : 520;
    filter.Q.value = 0.6;
    const bus = ctx.createGain();
    bus.gain.value = 0.16;
    filter.connect(bus);
    bus.connect(master);

    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = mood === "calm" ? 0.07 : 0.045;
    lfoGain.gain.value = mood === "calm" ? 420 : 200;
    lfo.connect(lfoGain);
    lfoGain.connect(filter.frequency);
    lfo.start();

    const oscs = chord.flatMap((f, i) => [-6, 6].map((detune) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? "triangle" : "sine";
      o.frequency.value = f;
      o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.value = 1 / chord.length;
      o.connect(g);
      g.connect(filter);
      o.start();
      return o;
    }));
    return (fade) => window.setTimeout(() => {
      for (const o of [...oscs, lfo]) { try { o.stop(); o.disconnect(); } catch { /* already stopped */ } }
      try { filter.disconnect(); bus.disconnect(); lfoGain.disconnect(); } catch { /* ignore */ }
    }, fade + 80);
  }
}

export const music = new MusicEngine();
