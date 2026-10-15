/**
 * Risk companion — the animation engine.
 *
 * A hand-rigged, physics-driven 2D character (original "Minato" art: dark spiky hair, candlestick
 * headband) that drags/holds a boulder on a rope. Everything is simulated, nothing is a pre-baked
 * clip: springs drive the pose, face and hair; a verlet chain is the rope; the boulder has mass and
 * momentum. The only inputs are the real numbers from the risk calculation (ratio, net, status).
 *
 * Pure canvas-2D, no dependencies, one <canvas>. React wiring lives in ./companion.tsx.
 */

export type CompanionInput = {
  /** Projected deepest drawdown ÷ daily loss limit (uncapped, same value the risk bar uses). */
  ratio: number;
  /** The day's net P&L if this trade is saved. */
  net: number;
  limit: number;
  status: "ok" | "near" | "hit" | "over";
};

type RGB = [number, number, number];
export type Palette = { ink: RGB; gold: RGB; goldStrong: RGB; loss: RGB; profit: RGB; canvas: RGB; raised: RGB; muted: RGB; dark: boolean };

export const SCENE_W = 360;
export const SCENE_H = 168;
const W = SCENE_W, H = SCENE_H;
const GY = 136;          // ground line
const GE = 322;          // cliff edge
const BR = 24;           // boulder radius
const FLAG_X = 30;
const BX_SAFE = 190, BX_EDGE = 304;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const mixc = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgba = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${clamp(a, 0, 1).toFixed(3)})`;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export function parseColor(css: string, fb: RGB): RGB {
  const s = css.trim();
  let m = /^#([0-9a-f]{3})$/i.exec(s);
  if (m) { const h = m[1]; return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]; }
  m = /^#([0-9a-f]{6})/i.exec(s);
  if (m) { const h = m[1]; return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; }
  const r = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/.exec(s);
  if (r) return [+r[1], +r[2], +r[3]];
  return fb;
}

export function readPalette(el: Element): Palette {
  const cs = getComputedStyle(el);
  const g = (n: string, fb: RGB) => parseColor(cs.getPropertyValue(n), fb);
  const canvas = g("--canvas", [247, 244, 238]);
  return {
    ink: g("--ink", [38, 34, 26]), gold: g("--gold", [140, 109, 46]), goldStrong: g("--gold-strong", [183, 142, 62]),
    loss: g("--loss", [172, 81, 87]), profit: g("--profit", [64, 121, 91]), canvas, raised: g("--raised", [255, 254, 251]),
    muted: g("--muted", [110, 102, 87]), dark: (canvas[0] * 0.3 + canvas[1] * 0.59 + canvas[2] * 0.11) < 90,
  };
}

/* ------------------------------------------------------------------ springs */
class Sp {
  x: number; v = 0; t: number;
  constructor(x = 0, public k = 140, public d = 16) { this.x = x; this.t = x; }
  step(dt: number) { this.v += (this.k * (this.t - this.x) - this.d * this.v) * dt; this.x += this.v * dt; }
  snap(x: number) { this.x = x; this.t = x; this.v = 0; }
}

/** A light verlet strand: headband tails and the scarf. Anchored to the body, driven by inertia, gravity and wind. */
class Strand {
  x: Float32Array; y: Float32Array; px: Float32Array; py: Float32Array; ready = false;
  constructor(public n: number, public seg: number) { this.x = new Float32Array(n); this.y = new Float32Array(n); this.px = new Float32Array(n); this.py = new Float32Array(n); }
  step(dt: number, ax: number, ay: number, wind: number, g: number) {
    const n = this.n, x = this.x, y = this.y, px = this.px, py = this.py;
    if (!this.ready) { for (let i = 0; i < n; i++) { x[i] = px[i] = ax + i * this.seg * 0.9; y[i] = py[i] = ay + i * this.seg * 0.3; } this.ready = true; }
    x[0] = ax; y[0] = ay; const d2 = dt * dt;
    for (let i = 1; i < n; i++) { const vx = (x[i] - px[i]) * 0.985, vy = (y[i] - py[i]) * 0.985; px[i] = x[i]; py[i] = y[i]; x[i] += vx + wind * d2 * (0.6 + 0.4 * i / n); y[i] += vy + g * d2; }
    for (let it = 0; it < 4; it++) for (let i = 0; i < n - 1; i++) {
      const dx = x[i + 1] - x[i], dy = y[i + 1] - y[i], d = Math.hypot(dx, dy) || 1e-4, k = (d - this.seg) / d;
      if (i === 0) { x[1] -= dx * k; y[1] -= dy * k; } else { x[i] += dx * k * 0.5; y[i] += dy * k * 0.5; x[i + 1] -= dx * k * 0.5; y[i + 1] -= dy * k * 0.5; }
    }
  }
}

type Foot = { x: number; from: number; to: number; t: number; dur: number; step: boolean; lift: number };

/* ---------------------------------------------------------------- particles */
const DUST = 0, SWEAT = 1, PEBBLE = 2, SPARK = 3, PUFF = 4, FIBER = 5, LINE = 6, RING = 7;
type Part = { k: number; x: number; y: number; vx: number; vy: number; life: number; max: number; s: number; r: number; vr: number };

type Tuft = { b: Sp; a: Sp; rest: number; len: number; w: number; x: number; y: number; gain: number; ph: number };
const mkTuft = (x: number, y: number, rest: number, len: number, w: number, k: number, d: number, gain: number, ph: number): Tuft =>
  ({ b: new Sp(rest, k * 0.5, d * 0.6), a: new Sp(rest, k, d), rest, len, w, x, y, gain, ph });

/* -------------------------------------------------------------------- rope */
const ROPE_N = 16;

export class Companion {
  time = 0;
  quality = 1;
  reduced = false;
  pal: Palette;

  // inputs
  private ratio = 0;
  private net = 0;
  private limit = 1;
  private status: CompanionInput["status"] = "ok";
  private hasInput = false;
  private pending: { at: number; target: number; mag: number; up: boolean } | null = null;
  private lastReact = -9;

  // expression / pose springs
  private T = new Sp(0, 60, 9);          // displayed tension (0‥1.35)
  private joy = new Sp(0, 50, 8);
  private shock = new Sp(0, 240, 12);    // event: gasp
  private relief = new Sp(0, 110, 9);    // event: sigh of relief
  private lean = new Sp(-0.03, 110, 9);
  private crouch = new Sp(0, 150, 12);
  private squash = new Sp(0, 210, 11);   // +tall / −squat
  private cx = new Sp(112, 80, 11);
  private hop = new Sp(0, 300, 15);
  private headRot = new Sp(0, 130, 8);
  private headX = new Sp(0, 150, 9);
  private headY = new Sp(0, 150, 9);
  private gx = new Sp(0, 240, 22);
  private gy = new Sp(0, 240, 22);
  private openL = new Sp(1, 320, 26);
  private openR = new Sp(1, 320, 26);
  private pupil = new Sp(1, 200, 18);
  private browYL = new Sp(0, 190, 13);
  private browYR = new Sp(0, 150, 12);
  private browTL = new Sp(0, 170, 14);
  private browTR = new Sp(0, 140, 13);
  private happy = new Sp(0, 120, 16);
  private strain = new Sp(0, 230, 22);
  private mOpen = new Sp(0, 210, 15);
  private mSmile = new Sp(0, 130, 13);
  private grit = new Sp(0, 210, 20);
  private blush = new Sp(0, 60, 10);
  private gloom = new Sp(0, 40, 10);
  private tears = new Sp(0, 50, 10);
  private bTilt = new Sp(0, 55, 6);
  private bSq = new Sp(0, 210, 12);
  private shake = new Sp(0, 420, 16);
  private camZ = new Sp(1, 62, 11);
  private camX = new Sp(0, 40, 9);
  private camY = new Sp(0, 40, 9);
  private camRoll = new Sp(0, 90, 9);
  private bHop = new Sp(0, 260, 12);
  private charm = new Sp(0, 55, 2.4);
  private hitstop = 0; private slowmo = 0; private bHopPrev = 0;
  private feet: Foot[] = [{ x: 100, from: 0, to: 0, t: 1, dur: 0.2, step: false, lift: 0 }, { x: 120, from: 0, to: 0, t: 1, dur: 0.2, step: false, lift: 0 }];
  private scarf = new Strand(8, 5.6);
  private tails = [new Strand(7, 6.2), new Strand(6, 5.6)];
  private all: Sp[];

  // boulder
  private bx = BX_SAFE; private bvx = 0; private bAcc = 0; private bRot = 0; private bTarget = BX_SAFE;
  private prevCx = 112; private cvx = 0;

  // face timing
  private blinkIn = 1.4; private blinkT = 9; private dbl = false;
  private gazeIn = 1; private pantPh = 0;

  // rope: verlet
  private rx = new Float32Array(ROPE_N); private ry = new Float32Array(ROPE_N);
  private px = new Float32Array(ROPE_N); private py = new Float32Array(ROPE_N);
  private ropeInit = false;

  // hair
  private topTufts: Tuft[]; private bangs: Tuft[]; private sides: Tuft[]; private ahoge: Tuft; private backTufts: Tuft[];

  private parts: Part[] = [];
  private sweatAcc = 0; private dustAcc = 0; private pebbleAcc = 0;
  private seed = [1.0, 0.86, 1.08, 0.92, 1.04, 0.9, 1.1, 0.95, 1.02, 0.88, 1.06];
  private strainP = 0;
  private bodyXf = { x: 0, y: 0, rot: 0, sx: 1, sy: 1 };
  private speedLine = 0;

  constructor(pal: Palette) {
    this.pal = pal;
    this.all = [this.T, this.joy, this.shock, this.relief, this.lean, this.crouch, this.squash, this.cx, this.hop, this.headRot, this.headX, this.headY,
      this.gx, this.gy, this.openL, this.openR, this.pupil, this.browYL, this.browYR, this.browTL, this.browTR, this.happy, this.strain,
      this.mOpen, this.mSmile, this.grit, this.blush, this.gloom, this.tears, this.bTilt, this.bSq, this.shake, this.camZ, this.camX, this.camY, this.camRoll, this.bHop, this.charm];
    const P = Math.PI;
    this.ahoge = mkTuft(-1, -29, -P / 2 - 0.15, 17, 5.5, 55, 2.6, 1.4, 0.5);
    this.topTufts = [-19, -10, 0, 10, 19].map((x, i) => mkTuft(x, -23 - (1 - Math.abs(x) / 24) * 4, -P / 2 + x * 0.026, 10.5 + (i % 2) * 3, 11, 85, 4.2, 1, i));
    this.bangs = [-17, -8.5, 0, 8.5, 17].map((x, i) => mkTuft(x, -20, P / 2 + (x > 0 ? -0.18 : 0.18) * (Math.abs(x) / 17) + (i === 2 ? 0.12 : 0), 13.5 - Math.abs(x) * 0.12, 11, 100, 4.6, 0.8, i + 3));
    this.sides = [-1, 1].map((s, i) => mkTuft(s * 22.8, -13, P / 2 + s * 0.13, 21, 7, 70, 3.4, 1.0, i * 2));
    this.backTufts = [-1, 1].map((s, i) => mkTuft(s * 15, 12, P / 2 + s * 0.16, 12, 11, 60, 3, 1.0, i));
  }

  /* ================================================================ input */
  setInput(m: CompanionInput) {
    const r = clamp(m.ratio, 0, 1.35);
    this.net = m.net; this.limit = Math.max(1, m.limit); this.status = m.status;
    if (!this.hasInput) { // first sight: place everything, then a little hello
      this.hasInput = true; this.ratio = r; this.bTarget = this.bxFor(r); this.bx = this.bTarget;
      this.T.snap(r); this.cx.snap(this.cxFor(r)); this.feet[0].x = this.cx.x - 13 - 7 * Math.min(r, 1.1); this.feet[1].x = this.cx.x + 8 + 4 * Math.min(r, 1.1); this.prevCx = this.cx.x; this.joy.snap(this.joyTarget());
      this.lean.snap(this.leanFor(r)); this.squash.v = -2.4; this.hop.v = -50 * (1 - smooth(0.2, 0.7, r)); this.shock.v = r > 0.5 ? 2 : 0;
      this.tears.snap(m.status === "over" ? 1 : 0); this.gloom.snap(m.status === "over" ? 1 : 0);
      return;
    }
    const d = r - this.ratio;
    this.ratio = r;
    if (Math.abs(d) < 0.01) { this.bTarget = this.bxFor(r); return; }
    const mag = clamp(Math.abs(d) * 4, 0.18, 1);
    const calm = this.time - this.lastReact > 0.35; // typing digits shouldn't re-run the wind-up each keystroke
    this.lastReact = this.time;
    if (calm) { // anticipation: a beat of wind-up before the boulder actually moves
      if (d > 0) { this.lean.t += 0; this.lean.v += 1.6 * mag; this.squash.v += 4 * mag; this.openL.v += 3; this.openR.v += 3; this.shock.x = Math.max(this.shock.x, 0.25 * mag); this.gazeKick(0.9, 0); }
      else { this.crouch.v += 38 * mag; this.squash.v -= 5 * mag; this.lean.v -= 1.4 * mag; }
      this.pending = { at: this.time + (d > 0 ? 0.13 : 0.16), target: r, mag, up: d > 0 };
    } else {
      this.pending = null; this.burst(d > 0, mag); this.bTarget = this.bxFor(r);
    }
  }

  private bxFor(r: number) { return BX_SAFE + (BX_EDGE - BX_SAFE) * clamp(r, 0, 1) + 14 * clamp((r - 1) / 0.35, 0, 1); }
  private cxFor(r: number) { return 112 + 44 * clamp(r, 0, 1.2); }
  private leanFor(r: number) { return lerp(-0.03, -0.4, clamp(r, 0, 1.1)); }
  private joyTarget() {
    const r = this.ratio, n = this.net / this.limit;
    const calm = 1 - smooth(0.15, 0.7, r);
    const base = this.net > 0 ? 0.55 + 0.45 * Math.min(1, n * 2) : this.net === 0 ? 0.28 : 0.08;
    return calm * base;
  }
  private gazeKick(x: number, y: number) { this.gx.v += x * 8; this.gy.v += y * 8; this.gx.t = x; this.gy.t = y; this.gazeIn = 0.9; }

  /** The moment the boulder lurches (or is hauled back). */
  private burst(up: boolean, mag: number) {
    const q = this.quality;
    if (up) {
      this.bvx += 70 * mag; this.cx.v += 90 * mag; this.lean.v -= 5.2 * mag; this.squash.v -= 6 * mag; this.crouch.v += 20 * mag;
      this.shock.x = Math.min(1.3, this.shock.x + 0.6 * mag); this.shock.v += 6 * mag; this.shake.v += 70 * mag;
      this.headY.v += 70 * mag; this.headX.v -= 60 * mag; this.browYL.v += 25 * mag; this.browYR.v += 20 * mag;
      this.ropeTwang(5 * mag); this.speedLine = 0.38 + 0.3 * mag;
      this.sweatBurst(Math.round((3 + 9 * mag) * q), mag);
      this.dustBurst(this.cx.x, GY, 6 * mag * q, 1); this.dustBurst(this.bx, GY - 1, 7 * mag * q, 1);
      this.gazeKick(0.95, -0.1);
      this.bHop.v -= 40 * mag; this.camZ.v += 1.1 * mag; this.camRoll.v += 0.12 * mag;
      if (mag > 0.5) { this.hitstop = 0.07; this.slowmo = 0.32; }
    } else {
      this.bvx -= 55 * mag; this.cx.v -= 55 * mag; this.lean.v += 4.4 * mag; this.squash.v += 7 * mag; this.hop.v -= 90 * mag;
      this.relief.x = Math.min(1.2, this.relief.x + 0.8 * mag); this.relief.v += 4 * mag; this.shake.v += 25 * mag;
      this.ropeTwang(3 * mag); this.dustBurst(this.bx, GY - 1, 5 * mag * q, -1); this.dustBurst(this.cx.x, GY, 3 * mag * q, -1);
      this.puff(); this.gazeKick(-0.1, -0.7);
      this.bHop.v -= 22 * mag; this.camZ.v -= 0.7 * mag; this.camRoll.v -= 0.08 * mag; if (mag > 0.6) this.slowmo = 0.38;
      if (this.ratio < 0.65) this.sparkBurst(Math.round((4 + 8 * mag) * q), this.ratio < 0.3);
    }
  }
  private applyPending() {
    const p = this.pending; if (!p) return; this.pending = null;
    this.bTarget = this.bxFor(p.target); this.burst(p.up, p.mag);
  }

  /* ------------------------------------------------------------ particles */
  private add(p: Part) { if (this.parts.length < 160) this.parts.push(p); }
  private dustBurst(x: number, y: number, n: number, dir: number) {
    for (let i = 0; i < n; i++) this.add({ k: DUST, x: x + rnd(-8, 8), y: y - rnd(0, 3), vx: dir * rnd(10, 46) + rnd(-12, 12), vy: -rnd(8, 34), life: 0, max: rnd(0.5, 0.95), s: rnd(2.5, 5.5), r: 0, vr: 0 });
  }
  private sweatBurst(n: number, mag: number) {
    const b = this.bodyXf; const hx = b.x + Math.sin(-b.rot) * 52 + this.headX.x, hy = b.y - Math.cos(b.rot) * 52 + this.headY.x;
    for (let i = 0; i < n; i++) { const s = Math.random() < 0.5 ? -1 : 1; this.add({ k: SWEAT, x: hx + s * 21, y: hy - 4, vx: s * rnd(30, 110) * (0.5 + mag), vy: -rnd(40, 120) * (0.5 + mag), life: 0, max: rnd(0.7, 1.1), s: rnd(1.7, 3), r: 0, vr: 0 }); }
  }
  private sparkBurst(n: number, coins: boolean) {
    const hx = this.bodyXf.x, hy = this.bodyXf.y - 56;
    for (let i = 0; i < n; i++) this.add({ k: SPARK, x: hx + rnd(-26, 26), y: hy + rnd(-22, 14), vx: rnd(-18, 18), vy: -rnd(14, 46), life: 0, max: rnd(0.8, 1.5), s: rnd(2.2, 4.8) * (coins && i % 3 === 0 ? 1.3 : 1), r: rnd(0, 6), vr: rnd(-3, 3) });
  }
  private puff() { // a visible exhale
    const b = this.bodyXf; this.add({ k: PUFF, x: b.x + 6 + this.headX.x, y: b.y - 40 + this.headY.x, vx: 22, vy: -10, life: 0, max: 0.9, s: 3, r: 0, vr: 0 });
  }
  private thud(v: number) {
    const m = clamp(v / 60, 0.2, 1), q = this.quality;
    this.add({ k: RING, x: this.bx, y: GY, vx: 0, vy: 0, life: 0, max: 0.55, s: 1, r: 0, vr: 0 });
    this.dustBurst(this.bx, GY - 1, Math.round(6 * m * q), 1); this.dustBurst(this.bx, GY - 1, Math.round(4 * m * q), -1);
    this.shake.v += 40 * m; this.camZ.v += 0.35 * m; this.cx.v += 26 * m; this.ropeTwang(2.5 * m);
  }
  private ropeTwang(a: number) {
    for (let i = 2; i < ROPE_N - 2; i++) { const w = Math.sin((i / (ROPE_N - 1)) * Math.PI); this.py[i] += a * w * (i % 2 ? 1 : -1) * 0.9; }
  }

  /* ================================================================= step */
  step(dtReal: number) {
    let dt = dtReal;
    if (this.hitstop > 0) { this.hitstop -= dtReal; dt = dtReal * 0.05; } else if (this.slowmo > 0) { this.slowmo -= dtReal; dt = dtReal * 0.5; }
    this.time += dt; const t = this.time;
    if (this.pending && t >= this.pending.at) this.applyPending();

    const r = this.ratio, over = this.status === "over", hit = this.status === "hit" || over;
    const net = this.net;
    const Tt = clamp(r + (net < 0 ? 0.04 : 0), 0, 1.35);

    // targets: pose
    this.T.t = Tt;
    this.joy.t = this.joyTarget();
    this.shock.t = 0; this.relief.t = 0;
    const Td = clamp(this.T.x, 0, 1.35);
    // grunting: the effort comes in pulses, faster and harder the more risk there is
    const pw = 2.4 + 3.2 * Td;
    const pulse = Td > 0.3 ? Math.pow(Math.max(0, Math.sin(t * pw)), 2) * smooth(0.3, 0.85, Td) : 0;
    const moving = clamp(Math.abs(this.bvx) / 45, 0, 1) * smooth(0.1, 0.5, Td);
    const P = Math.max(pulse, moving * 0.9); this.strainP = P;
    this.lean.t = this.leanFor(Td) - 0.07 * P * Td + 0.012 * Math.sin(t * 1.3);
    this.crouch.t = 7 * Math.min(Td, 1.1) + 2.5 * P * Td;
    this.cx.t = this.cxFor(Td) + 3 * P * Td;
    this.squash.t = -0.02 * Td + 0.012 * Math.sin(t * (1.8 + 4 * Td));
    this.hop.t = 0;

    // blink + eyes
    this.blinkIn -= dt;
    if (this.blinkIn <= 0 && this.blinkT > 5) { this.blinkT = 0; this.dbl = Math.random() < 0.2; this.blinkIn = rnd(2, 4.6) * (1 - 0.45 * Td); }
    let blinkAmt = 0;
    if (this.blinkT < 5) { this.blinkT += dt; const b = this.blinkT; blinkAmt = b < 0.07 ? b / 0.07 : b < 0.19 ? 1 - (b - 0.07) / 0.12 : 0; if (b > 0.19) { if (this.dbl) { this.dbl = false; this.blinkT = 0; } else this.blinkT = 9; } }
    const S = clamp(this.shock.x, 0, 1.3), J = clamp(this.joy.x, 0, 1), Rl = clamp(this.relief.x, 0, 1.2);
    const strainOn = smooth(0.42, 0.9, Td) * smooth(0.45, 0.8, P) * (1 - smooth(0.2, 0.6, S)) * (over ? 0.55 : 1);
    const happyOn = Math.max(smooth(0.55, 0.92, J), smooth(0.35, 0.9, Rl)) * (1 - smooth(0.5, 0.9, Td));
    const base = 1 + 0.28 * S + 0.12 * J * 0 - 0.1 * Td * (1 - S) + 0.06 * Math.sin(t * 20) * smooth(0.9, 1.3, Td);
    this.openL.t = clamp(base * (1 - blinkAmt) * (1 - 0.55 * P * Td), 0, 1.35);
    this.openR.t = clamp(base * (1 - blinkAmt * 0.97) * (1 - 0.5 * P * Td), 0, 1.35);
    this.pupil.t = 1 - 0.42 * clamp(S + (over ? 0.6 : 0), 0, 1) - 0.22 * Td + 0.12 * happyOn;
    this.strain.t = strainOn; this.happy.t = happyOn;

    // gaze: watch the boulder when worried, glance at the cliff, drift when calm
    this.gazeIn -= dt;
    if (this.gazeIn <= 0) {
      if (Td > 0.2) { this.gx.t = rnd(0.55, 1) ; this.gy.t = rnd(-0.1, 0.35); if (Math.random() < 0.3) this.gx.t = 1.15; }
      else if (J > 0.5) { this.gx.t = rnd(-0.4, 0.2); this.gy.t = rnd(-0.6, -0.1); }
      else { this.gx.t = rnd(-0.6, 0.7); this.gy.t = rnd(-0.35, 0.3); }
      this.gazeIn = rnd(0.6, 2.1) * (Td > 0.5 ? 0.6 : 1);
    }

    // brows
    const worry = Td * (1 - P * 0.8), determined = P * Td;
    this.browYL.t = 0.5 * S + 0.25 * J + 0.3 * Rl - 0.35 * determined + 0.1 * Math.sin(t * 0.9);
    this.browYR.t = 0.4 * S + 0.3 * J + 0.3 * Rl - 0.3 * determined;
    this.browTL.t = 0.95 * worry + 0.6 * S - 1.0 * determined - 0.2 * J;
    this.browTR.t = 0.85 * worry + 0.5 * S - 0.9 * determined - 0.2 * J;

    // mouth
    this.pantPh += dt * (6 + 10 * Td);
    const panting = 0.2 * Td * (0.5 + 0.5 * Math.sin(this.pantPh)) * (1 - P);
    this.mSmile.t = clamp(J * 1.0 + 0.5 * Rl - 1.05 * Td * (1 - 0.3 * S), -1, 1);
    this.mOpen.t = clamp(0.95 * S + 0.55 * Rl * (J + 0.3) + panting + 0.25 * J * smooth(0.7, 1, J), 0, 1.2);
    this.grit.t = smooth(0.5, 0.9, P * Td) * (1 - smooth(0.2, 0.6, S));
    this.blush.t = 0.75 * J + 0.45 * Rl - 0.1 * Td;
    this.gloom.t = over ? 1 : hit ? 0.35 : 0;
    this.tears.t = over ? 1 : 0;
    this.bSq.t = 0;

    // boulder
    const rock = hit ? Math.sin(t * 9.5) * 0.03 * (over ? 1.6 : 1) : 0;
    this.bTilt.t = (over ? 0.32 : hit ? 0.1 : 0.03 * Td) + rock;
    const ba = 26 * (this.bTarget - this.bx) - 5.6 * this.bvx;
    this.bvx += ba * dt; this.bx += this.bvx * dt;
    if (Math.abs(this.bvx) < 0.4 && Math.abs(this.bTarget - this.bx) < 0.35) { this.bvx = 0; this.bx = this.bTarget; }
    this.bRot += (this.bvx * dt) / BR;
    // heavy things shudder when they're pulling against a taut rope
    const stuck = hit ? 1.0 : smooth(0.5, 1, Td);
    const jit = (Math.sin(t * 31) + Math.sin(t * 17.3)) * 0.4 * stuck * P;
    // the boulder's acceleration is felt through the rope
    const dAcc = (ba - this.bAcc) ; this.bAcc = ba;
    this.cx.v += ba * dt * 0.10; this.lean.v -= ba * dt * 0.0055; this.headX.v -= ba * dt * 0.05; this.headY.v += Math.abs(ba) * dt * 0.01;
    this.bSq.t = 0; this.bSq.v += clamp(-Math.abs(dAcc) * 0.0006, -1, 0);
    this.shake.t = (0.7 + 1.6 * Td * Td) * (Td > 0.35 ? 1 : 0) * (0.6 + 0.4 * P) + (over ? 1.2 : 0);

    // sub-step all springs
    const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
    this.cvx = (this.cx.x - this.prevCx) / Math.max(dt, 1e-4); this.prevCx = this.cx.x;
    for (let i = 0; i < n; i++) for (const s of this.all) s.step(h);
    this.lean.x = clamp(this.lean.x, -0.56, 0.2); // heaves hard, but never folds over
    const Tc = clamp(this.T.x, 0, 1.35), zt = 1 + 0.1 * smooth(0.35, 1.1, Tc) + (this.status === "over" ? 0.03 : 0), zz = Math.max(1, this.camZ.x);
    this.camZ.t = zt; this.camRoll.t = 0;
    this.camX.t = clamp(lerp(this.cx.x, this.bx, 0.45) - W / (2 * zz), 0, W - W / zz); this.camY.t = clamp(GY - 44 - H / (2 * zz), 0, H - H / zz);
    // boulder: hops when jerked and lands with a thud that travels down the rope
    if (this.bHop.x > 0) { const v = this.bHop.v; this.bHop.x = 0; this.bHop.v = -v * 0.25; if (v > 14) this.thud(v); }
    this.charm.t = 0; this.charm.v += (this.cvx * 0.05 + this.lean.v * 4.5 + this.shake.v * 0.002) * dt;
    this.headRot.t = this.lean.x * 0.5 + this.gx.x * 0.05 + 0.06 * Math.sin(t * 1.1) * (1 - Td) - 0.08 * P * Td + (over ? 0.1 : 0) + 0.1 * J * Math.sin(t * 2.2);
    this.headX.t = -this.lean.x * 3 * 0 + 0.7 * Math.sin(t * 1.9) * (1 - Td);
    this.headY.t = 0.6 * Math.sin(t * 2.4) + 1.8 * Td + 1.5 * P * Td - 1.2 * J;
    this.shock.x = Math.max(this.shock.x, -0.05);

    // body transform
    const breathe = Math.sin(t * (2.1 + 3.5 * Td)) * (0.012 + 0.02 * Td);
    const sq = clamp(this.squash.x, -0.28, 0.28);
    const sy = 1 + sq + breathe, sx = 1 - sq * 0.75 - breathe * 0.4;
    const shk = this.shake.x * 0.5;
    this.bodyXf = {
      x: this.cx.x + Math.sin(t * 47) * shk + jit * 0.4,
      y: GY - 17 + this.crouch.x + this.hop.x + Math.cos(t * 53) * shk * 0.6 - (sy - 1) * -4,
      rot: this.lean.x, sx, sy,
    };

    // hair: each tuft is a damped angular spring kicked by head motion and wind
    const ax = this.headX.v * 0.02, ay = this.headY.v * 0.02;
    const wind = (0.04 + 0.16 * Td + 0.06 * P) ;
    const tufts = [...this.topTufts, ...this.bangs, ...this.sides, ...this.backTufts, this.ahoge];
    for (const f of tufts) {
      f.a.t = f.rest - this.lean.x * 0.55 * (f === this.ahoge ? 1.2 : 0.8) + Math.sin(t * (2.6 + 5 * Td) + f.ph) * wind * f.gain - (f.y > 0 || f.len > 20 ? 0.0 : 0);
      f.a.v += (-ax * Math.cos(f.rest) * 0.6 + ay * Math.sin(f.rest) * 0.35 - this.shake.x * 0.02 * Math.sin(t * 40 + f.ph)) * f.gain;
      f.b.t = f.a.x; for (let i = 0; i < n; i++) { f.a.step(h); f.b.step(h); }
    }

    this.stepRope(dt, Td);
    this.stepStrands(dt, Td);
    this.stepFeet(dt, Td);
    this.emit(dt, Td, P, hit);
    this.stepParts(dt);
    if (this.speedLine > 0) this.speedLine = Math.max(0, this.speedLine - dt);
  }

  /* ---------------------------------------------------------------- world */
  private toWorld(lx: number, ly: number) {
    const b = this.bodyXf, c = Math.cos(b.rot), s = Math.sin(b.rot), x = lx * b.sx, y = ly * b.sy;
    return { x: b.x + x * c - y * s, y: b.y + x * s + y * c };
  }
  private leftHand() { const T = clamp(this.T.x, 0, 1.2); return this.toWorld(9 + 12 * T, -17 - 2 * T); }
  private boulderY() { return GY - BR + 1 + Math.min(0, this.bHop.x) + 7 * smooth(0.9, 1.3, this.ratio) * (this.status === "over" ? 1 : 0.4) + this.bSq.x * -6; }
  private ringPos() { const a = this.bRot + Math.PI; const rr = BR * 0.86; return { x: this.bx + Math.cos(a) * rr * 0.9, y: this.boulderY() + Math.sin(a) * rr * 0.9 - 0 }; }

  private stepRope(dt: number, T: number) {
    const a = this.leftHand(), b = this.ropeEnd();
    if (!this.ropeInit) {
      for (let i = 0; i < ROPE_N; i++) { const u = i / (ROPE_N - 1); this.rx[i] = this.px[i] = lerp(a.x, b.x, u); this.ry[i] = this.py[i] = Math.min(GY - 1.5, lerp(a.y, b.y, u) + Math.sin(u * Math.PI) * 10); }
      this.ropeInit = true;
    }
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const taut = smooth(0.12, 0.95, T);
    const total = dist * lerp(1.5, 0.985, taut) + 6 * (1 - taut);
    const seg = total / (ROPE_N - 1);
    const g = 520, damp = 0.985;
    for (let i = 1; i < ROPE_N - 1; i++) {
      const vx = (this.rx[i] - this.px[i]) * damp, vy = (this.ry[i] - this.py[i]) * damp;
      this.px[i] = this.rx[i]; this.py[i] = this.ry[i];
      this.rx[i] += vx; this.ry[i] += vy + g * dt * dt * (1 - taut * 0.85);
    }
    this.rx[0] = a.x; this.ry[0] = a.y; this.rx[ROPE_N - 1] = b.x; this.ry[ROPE_N - 1] = b.y;
    for (let it = 0; it < 9; it++) {
      for (let i = 0; i < ROPE_N - 1; i++) {
        let dx = this.rx[i + 1] - this.rx[i], dy = this.ry[i + 1] - this.ry[i]; const d = Math.hypot(dx, dy) || 1e-4;
        const diff = (d - seg) / d * 0.5; dx *= diff; dy *= diff;
        if (i === 0) { this.rx[i + 1] -= dx * 2; this.ry[i + 1] -= dy * 2; }
        else if (i === ROPE_N - 2) { this.rx[i] += dx * 2; this.ry[i] += dy * 2; }
        else { this.rx[i] += dx; this.ry[i] += dy; this.rx[i + 1] -= dx; this.ry[i + 1] -= dy; }
      }
      for (let i = 1; i < ROPE_N - 1; i++) if (this.ry[i] > GY - 1.6) this.ry[i] = GY - 1.6; // lies on the ground when slack
    }
  }
  private headToWorld(lx: number, ly: number) {
    const r = this.headRot.x, c = Math.cos(r), sn = Math.sin(r), x1 = lx, y1 = ly - 25;
    return this.toWorld(x1 * c - y1 * sn + this.headX.x, x1 * sn + y1 * c - 31 + this.headY.x - 1);
  }
  private stepStrands(dt: number, T: number) {
    const t = this.time, wind = 55 + 150 * Math.min(T, 1.2) + 40 * Math.sin(t * 2.3) + this.shake.x * 20;
    const sa = this.toWorld(5, -29); this.scarf.step(dt, sa.x, sa.y, wind, 300);
    const a0 = this.headToWorld(21, -15), a1 = this.headToWorld(20, -12);
    this.tails[0].step(dt, a0.x, a0.y, wind * 1.15, 260); this.tails[1].step(dt, a1.x, a1.y, wind * 0.95, 290);
  }
  private stepFeet(dt: number, T: number) {
    const Tm = Math.min(T, 1.1), tg = [this.cx.x - 13 - 7 * Tm, this.cx.x + 8 + 4 * Tm], skid = Math.abs(this.cvx) > 55;
    for (let i = 0; i < 2; i++) {
      const f = this.feet[i], o = this.feet[1 - i];
      if (f.step) {
        f.t += dt / f.dur; const u = Math.min(1, f.t), e = u * u * (3 - 2 * u); f.x = lerp(f.from, f.to, e); f.lift = Math.sin(Math.PI * u) * 6;
        if (u >= 1) { f.step = false; f.lift = 0; this.dustBurst(f.x, GY, Math.round(2 * this.quality), 0); this.shake.v += 6; }
      } else {
        const err = tg[i] - f.x;
        if (skid) f.x += err * Math.min(1, dt * 7);          // dragged: boots skid through the dirt
        else if (Math.abs(err) > 6 + 3 * (1 - Math.min(T, 1)) && !o.step) { f.step = true; f.t = 0; f.from = f.x; f.to = tg[i] + Math.sign(err) * 2.5; f.dur = 0.17 + 0.06 * (1 - Math.min(T, 1)); }
      }
    }
  }
  private ropeEnd() { return this.ringPos(); }

  /* ------------------------------------------------------------ emitters */
  private emit(dt: number, T: number, P: number, hit: boolean) {
    const q = this.quality;
    // sweat flicks off in proportion to effort
    this.sweatAcc += dt * (Math.pow(T, 1.6) * 5 + P * T * 6) * q;
    while (this.sweatAcc > 1) { this.sweatAcc -= 1; this.sweatBurst(1, 0.2 + T * 0.4); }
    // dust where the boulder drags and where his boots dig in
    const sp = Math.abs(this.bvx) + Math.abs(this.cvx) * 0.6;
    this.dustAcc += dt * clamp(sp / 18, 0, 6) * 9 * q;
    while (this.dustAcc > 1) {
      this.dustAcc -= 1;
      if (Math.random() < 0.6) this.dustBurst(this.bx - Math.sign(this.bvx || 1) * 14, GY - 1, 1, -Math.sign(this.bvx || 1));
      else this.dustBurst(this.cx.x + (Math.random() < 0.5 ? -12 : 10), GY, 1, -Math.sign(this.cvx || 1));
    }
    // loose stones tumble off the cliff when the boulder is on the lip
    this.pebbleAcc += dt * smooth(0.7, 1.1, this.ratio) * (hit ? 7 : 2.5) * q;
    while (this.pebbleAcc > 1) { this.pebbleAcc -= 1; this.add({ k: PEBBLE, x: GE - rnd(0, 6), y: GY, vx: rnd(10, 40), vy: -rnd(0, 30), life: 0, max: 2, s: rnd(1.4, 3), r: rnd(0, 6), vr: rnd(-8, 8) }); }
    // a calm, happy day: occasional gold glints
    if (this.joy.x > 0.55 && this.quality > 0.7 && Math.random() < dt * 2.2 * this.joy.x) this.sparkBurst(1, this.net > 0);
    // frayed fibres when the rope is at its limit
    if (this.status === "over" && Math.random() < dt * 10 * q) { const i = 4 + ((Math.random() * (ROPE_N - 8)) | 0); this.add({ k: FIBER, x: this.rx[i], y: this.ry[i], vx: rnd(-20, 20), vy: -rnd(10, 40), life: 0, max: 0.6, s: rnd(2, 4), r: rnd(0, 6), vr: rnd(-9, 9) }); }
  }
  private stepParts(dt: number) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i]; p.life += dt;
      if (p.life >= p.max) { this.parts.splice(i, 1); continue; }
      switch (p.k) {
        case DUST: p.vx *= 1 - 1.6 * dt; p.vy = p.vy * (1 - 1.2 * dt) - 6 * dt; break;
        case SWEAT: p.vy += 420 * dt; p.vx *= 1 - 0.4 * dt; break;
        case PEBBLE: p.vy += 540 * dt; p.r += p.vr * dt; if (p.y > H + 8) { this.parts.splice(i, 1); continue; } break;
        case SPARK: p.vy -= 4 * dt; p.vx *= 1 - dt; p.r += p.vr * dt; break;
        case PUFF: p.vx *= 1 - 1.4 * dt; p.vy *= 1 - 1.4 * dt; p.s += 14 * dt; break;
        case FIBER: p.vy += 160 * dt; p.r += p.vr * dt; break;
      }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.k === SWEAT && p.y > GY - 1 && p.vy > 0) { p.vy *= -0.18; p.vx *= 0.5; p.y = GY - 1; p.life += 0.25; }
    }
  }

  /** Reduced-motion: simulate until everything has settled, no loop needed. */
  settle(seconds = 2.2) { const dt = 1 / 60; for (let t = 0; t < seconds; t += dt) this.step(dt); this.parts.length = 0; this.dropMotion(); }
  private dropMotion() { for (const s of this.all) s.v = 0; this.bvx = 0; this.shock.snap(0); this.relief.snap(0); this.shake.snap(0); this.pending = null; this.speedLine = 0; }

  /* ================================================================ draw */
  draw(ctx: CanvasRenderingContext2D, pxW: number, pxH: number) {
    const pal = this.pal, s = pxW / W, danger = smooth(0.35, 1.05, this.ratio);
    const z = Math.max(1, this.camZ.x), vx0 = clamp(this.camX.x, 0, W - W / z), vy0 = clamp(this.camY.x, 0, H - H / z);
    const sk = this.reduced ? 0 : this.shake.x * 0.35, shx = Math.sin(this.time * 61) * sk, shy = Math.cos(this.time * 57) * sk;
    const cam = (par: number) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.translate(pxW / 2, pxH / 2); ctx.rotate(this.reduced ? 0 : this.camRoll.x); ctx.translate(-pxW / 2, -pxH / 2);
      const sz = s * z; ctx.translate((shx - vx0 * par) * sz, (shy - vy0 * par) * sz); ctx.scale(sz, sz);
    };
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, pxW, pxH);
    // sky grade: warm gold glow when safe, a bruised red dusk as the risk climbs
    const sg = ctx.createRadialGradient(pxW * 0.16, pxH * 0.12, 4, pxW * 0.16, pxH * 0.12, pxW * 0.75);
    sg.addColorStop(0, rgba(pal.goldStrong, (pal.dark ? 0.16 : 0.2) * (1 - danger))); sg.addColorStop(1, rgba(pal.goldStrong, 0)); ctx.fillStyle = sg; ctx.fillRect(0, 0, pxW, pxH);
    const dg = ctx.createLinearGradient(0, 0, 0, pxH); dg.addColorStop(0, rgba(pal.loss, 0.16 * danger)); dg.addColorStop(1, rgba(pal.loss, 0)); ctx.fillStyle = dg; ctx.fillRect(0, 0, pxW, pxH);
    // parallax hills (move less than the action → depth when the camera pushes in)
    const hill = (par: number, base: number, amp: number, f: number, ph: number, col: RGB, al: number) => {
      cam(par); ctx.beginPath(); ctx.moveTo(-120, GY + 4); for (let x = -120; x <= W + 320; x += 12) ctx.lineTo(x, base + Math.sin(x * f + ph) * amp + Math.sin(x * f * 2.3 + ph * 2) * amp * 0.35);
      ctx.lineTo(W + 320, GY + 4); ctx.closePath(); ctx.fillStyle = rgba(col, al); ctx.fill();
    };
    hill(0.3, GY - 40, 11, 0.021, 1, mixc(pal.raised, mixc(pal.gold, pal.loss, danger * 0.6), 0.22), 0.5);
    hill(0.55, GY - 21, 7, 0.036, 2.4, mixc(pal.raised, mixc(pal.gold, pal.loss, danger * 0.6), 0.34), 0.62);
    // light shafts, fading as the mood turns
    if (danger < 0.9) { cam(0.7); const a = (pal.dark ? 0.1 : 0.085) * (1 - danger); for (let i = 0; i < 3; i++) { const x0 = 20 + i * 62, g = ctx.createLinearGradient(x0, 0, x0 + 40, GY); g.addColorStop(0, rgba(pal.goldStrong, a)); g.addColorStop(1, rgba(pal.goldStrong, 0)); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x0, -10); ctx.lineTo(x0 + 22 + i * 4, -10); ctx.lineTo(x0 + 92, GY); ctx.lineTo(x0 + 44, GY); ctx.closePath(); ctx.fill(); } }
    cam(1);
    this.drawScene(ctx, pal, danger);
    this.drawBoulder(ctx, pal, danger);
    if (this.speedLine > 0 && !this.reduced) this.drawSpeedLines(ctx, pal);
    this.drawParts(ctx, pal, true);
    this.drawRope(ctx, pal);
    this.drawCharacter(ctx, pal);
    this.drawParts(ctx, pal, false);
    // grade: a vignette that closes in and throbs with a heartbeat when the day is in trouble
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const Td = clamp(this.T.x, 0, 1.3), ph = (this.time * (1.1 + 1.7 * Td)) % 1, env = Math.max(Math.exp(-ph * 10), 0.6 * Math.exp(-Math.pow((ph - 0.22) * 10, 2)));
    const va = 0.04 + 0.3 * danger * (this.reduced ? 0.8 : 0.55 + 0.45 * env);
    const vg = ctx.createRadialGradient(pxW / 2, pxH * 0.58, pxH * 0.4, pxW / 2, pxH * 0.58, pxW * 0.64);
    vg.addColorStop(0, rgba(pal.loss, 0)); vg.addColorStop(1, rgba(mixc(pal.ink, pal.loss, danger), va)); ctx.fillStyle = vg; ctx.fillRect(0, 0, pxW, pxH);
  }

  private drawScene(ctx: CanvasRenderingContext2D, pal: Palette, danger: number) {
    const ground = mixc(pal.raised, pal.goldStrong, pal.dark ? 0.1 : 0.16);
    // chasm: a cold depth with a red glow that grows with the risk
    const gl = ctx.createLinearGradient(0, GY - 30, 0, H);
    gl.addColorStop(0, rgba(pal.loss, 0)); gl.addColorStop(1, rgba(pal.loss, 0.06 + 0.3 * danger));
    ctx.fillStyle = gl; ctx.fillRect(GE - 6, GY - 30, W - GE + 6, H - GY + 30);
    const vd = ctx.createLinearGradient(0, GY, 0, H);
    vd.addColorStop(0, rgba(pal.ink, 0.0)); vd.addColorStop(1, rgba(pal.ink, pal.dark ? 0.3 : 0.14));
    ctx.fillStyle = vd; ctx.fillRect(GE + 4, GY, W - GE, H - GY);
    // ground slab with a crumbling lip
    ctx.beginPath(); ctx.moveTo(0, GY); ctx.lineTo(GE, GY); ctx.lineTo(GE - 1, GY + 5); ctx.lineTo(GE + 5, GY + 11); ctx.lineTo(GE + 1, GY + 18); ctx.lineTo(GE + 6, H); ctx.lineTo(0, H); ctx.closePath();
    ctx.fillStyle = rgba(ground); ctx.fill();
    ctx.strokeStyle = rgba(mixc(pal.gold, pal.ink, 0.25), 0.55); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, GY); ctx.lineTo(GE, GY); ctx.stroke();
    // danger hatch along the last stretch of ground
    if (danger > 0.02) {
      ctx.save(); ctx.beginPath(); ctx.rect(236, GY, GE - 236, 7); ctx.clip();
      ctx.strokeStyle = rgba(pal.loss, 0.5 * danger); ctx.lineWidth = 2.2;
      for (let x = 230; x < GE + 10; x += 9) { ctx.beginPath(); ctx.moveTo(x, GY + 8); ctx.lineTo(x + 7, GY); ctx.stroke(); }
      ctx.restore();
    }
    // ground texture
    ctx.fillStyle = rgba(pal.gold, 0.16); for (let i = 0; i < 14; i++) { const x = 12 + i * 23.1 % (GE - 20); ctx.fillRect(x, GY + 8 + (i * 7) % 18, 7 + (i % 3) * 3, 1.4); }
    // safe zone: flag + soft glow that warms when things are going well
    const safe = (1 - smooth(0.15, 0.7, this.ratio));
    const sg = ctx.createRadialGradient(FLAG_X, GY - 20, 2, FLAG_X, GY - 20, 46);
    sg.addColorStop(0, rgba(pal.profit, 0.1 + 0.2 * safe)); sg.addColorStop(1, rgba(pal.profit, 0));
    ctx.fillStyle = sg; ctx.fillRect(0, GY - 70, 90, 70);
    ctx.strokeStyle = rgba(pal.ink, 0.75); ctx.lineWidth = 1.8; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(FLAG_X, GY); ctx.lineTo(FLAG_X, GY - 44); ctx.stroke();
    const wv = this.time * (2.4 + this.T.x * 4), pennant = 20;
    ctx.beginPath(); ctx.moveTo(FLAG_X, GY - 43);
    for (let i = 0; i <= 8; i++) { const u = i / 8; ctx.lineTo(FLAG_X + u * pennant, GY - 43 + Math.sin(wv + u * 4) * 2.4 * u + u * 3); }
    for (let i = 8; i >= 0; i--) { const u = i / 8; ctx.lineTo(FLAG_X + u * (pennant - 4), GY - 31 + Math.sin(wv + u * 4 - 0.4) * 2.2 * u - u * 2); }
    ctx.closePath(); ctx.fillStyle = rgba(pal.goldStrong, 0.95); ctx.fill(); ctx.strokeStyle = rgba(pal.ink, 0.6); ctx.lineWidth = 0.9; ctx.stroke();
    ctx.fillStyle = rgba(pal.canvas, 0.9); ctx.beginPath(); ctx.arc(FLAG_X + 5.5, GY - 37.4, 1.6, 0, 7); ctx.fill();
    // little grass tufts
    ctx.strokeStyle = rgba(pal.profit, 0.55); ctx.lineWidth = 1.2;
    for (const gx of [48, 70, 84, 224, 256]) { for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(gx + k * 2, GY); ctx.quadraticCurveTo(gx + k * 2.6, GY - 3, gx + k * 4 + Math.sin(this.time * 2 + gx) * 0.8, GY - 6); ctx.stroke(); } }
  }

  private stone(pal: Palette) {
    const base: RGB = pal.dark ? [112, 102, 88] : [150, 138, 120];
    return { base, light: mixc(base, [255, 244, 220], 0.38), dark: mixc(base, [38, 30, 22], 0.5), out: [32, 25, 19] as RGB };
  }

  private drawBoulder(ctx: CanvasRenderingContext2D, pal: Palette, danger: number) {
    const by = this.boulderY(), st = this.stone(pal);
    // contact shadow
    ctx.fillStyle = rgba(pal.ink, pal.dark ? 0.35 : 0.18); ctx.beginPath(); ctx.ellipse(this.bx + 4, GY + 1.5, BR * 1.05, 4, 0, 0, 7); ctx.fill();
    const stretch = clamp(Math.abs(this.bvx) / 240, 0, 0.13);
    ctx.save(); ctx.translate(this.bx, by);
    ctx.rotate(this.bTilt.x * 0.55); ctx.scale(1 + stretch - this.bSq.x * 0.2, 1 - stretch * 0.8 + this.bSq.x * 0.2);
    ctx.rotate(this.bRot);
    const n = 11, pts: [number, number][] = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, rr = BR * this.seed[i]; pts.push([Math.cos(a) * rr, Math.sin(a) * rr]); }
    const path = () => { ctx.beginPath(); for (let i = 0; i < n; i++) { const [x0, y0] = pts[i], [x1, y1] = pts[(i + 1) % n]; const mx = (x0 + x1) / 2, my = (y0 + y1) / 2; if (i === 0) ctx.moveTo((pts[n - 1][0] + x0) / 2, (pts[n - 1][1] + y0) / 2); ctx.quadraticCurveTo(x0, y0, mx, my); } ctx.closePath(); };
    path();
    const g = ctx.createRadialGradient(-8, -9, 3, 0, 0, BR * 1.1);
    g.addColorStop(0, rgba(st.light)); g.addColorStop(0.55, rgba(st.base)); g.addColorStop(1, rgba(st.dark));
    ctx.fillStyle = g; ctx.fill();
    ctx.save(); path(); ctx.clip();
    // facets & cracks (cel-style hard shapes)
    ctx.fillStyle = rgba(st.dark, 0.38); ctx.beginPath(); ctx.moveTo(-6, 4); ctx.lineTo(10, -2); ctx.lineTo(24, 12); ctx.lineTo(0, 26); ctx.closePath(); ctx.fill();
    ctx.fillStyle = rgba([255, 246, 225], 0.3); ctx.beginPath(); ctx.moveTo(-18, -8); ctx.lineTo(-6, -17); ctx.lineTo(0, -10); ctx.lineTo(-12, -2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgba(st.out, 0.55); ctx.lineWidth = 1.2; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(4, -22); ctx.lineTo(1, -12); ctx.lineTo(7, -5); ctx.lineTo(3, 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-14, 10); ctx.lineTo(-8, 14); ctx.lineTo(-9, 21); ctx.stroke();
    // gold ore flecks
    ctx.fillStyle = rgba(pal.goldStrong, 0.95);
    for (const [x, y, z] of [[-3, -16, 1.8], [12, 6, 1.4], [-15, 3, 1.2], [6, 16, 1.6]]) { ctx.beginPath(); ctx.moveTo(x, y - z * 1.4); ctx.lineTo(x + z, y); ctx.lineTo(x, y + z * 1.2); ctx.lineTo(x - z, y); ctx.closePath(); ctx.fill(); }
    // rim light from the danger side
    if (danger > 0.02) { const rg = ctx.createRadialGradient(BR * 0.9, 2, 2, BR * 0.9, 2, BR * 1.25); rg.addColorStop(0, rgba(pal.loss, 0.55 * danger)); rg.addColorStop(1, rgba(pal.loss, 0)); ctx.fillStyle = rg; ctx.fillRect(-BR, -BR, BR * 2, BR * 2); }
    ctx.restore();
    path(); ctx.strokeStyle = rgba(st.out, 0.92); ctx.lineWidth = 1.9; ctx.lineJoin = "round"; ctx.stroke();
    // iron ring the rope is knotted to
    ctx.beginPath(); ctx.arc(-BR * 0.8, -1, 3.8, 0, 7); ctx.strokeStyle = rgba(st.out); ctx.lineWidth = 3.6; ctx.stroke();
    ctx.strokeStyle = rgba(pal.goldStrong); ctx.lineWidth = 1.8; ctx.stroke();
    ctx.restore();
  }

  private drawSpeedLines(ctx: CanvasRenderingContext2D, pal: Palette) {
    const a = clamp(this.speedLine / 0.5, 0, 1);
    ctx.save(); ctx.lineCap = "round"; ctx.strokeStyle = rgba(pal.ink, 0.35 * a); ctx.lineWidth = 1.4;
    const by = this.boulderY();
    for (let i = 0; i < 7; i++) { const y = by - 22 + i * 7.2, x = this.bx - BR - 10 - ((i * 13) % 11) - (1 - a) * 12, l = 12 + ((i * 7) % 9); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - l, y); ctx.stroke(); }
    ctx.restore();
  }

  private drawRope(ctx: CanvasRenderingContext2D, pal: Palette) {
    const T = clamp(this.T.x, 0, 1.3);
    const col = mixc(mixc(pal.gold, pal.ink, 0.35), pal.loss, smooth(0.7, 1.2, T) * 0.7);
    const pts: [number, number][] = []; for (let i = 0; i < ROPE_N; i++) pts.push([this.rx[i], this.ry[i]]);
    const trace = () => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < ROPE_N - 1; i++) { const mx = (pts[i][0] + pts[i + 1][0]) / 2, my = (pts[i][1] + pts[i + 1][1]) / 2; ctx.quadraticCurveTo(pts[i][0], pts[i][1], mx, my); } ctx.lineTo(pts[ROPE_N - 1][0], pts[ROPE_N - 1][1]); };
    ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
    const w = lerp(3.6, 2.5, smooth(0.3, 1.1, T));
    trace(); ctx.strokeStyle = "rgba(30,22,16,0.9)"; ctx.lineWidth = w + 1.8; ctx.stroke();
    trace(); ctx.strokeStyle = rgba(mixc(col, [255, 240, 205], 0.18)); ctx.lineWidth = w; ctx.stroke();
    if (this.quality > 0.5) { trace(); ctx.strokeStyle = rgba(mixc(col, [30, 22, 16], 0.45), 0.9); ctx.lineWidth = w * 0.55; ctx.setLineDash([1.6, 2.4]); ctx.lineDashOffset = -this.time * 3 * T; ctx.stroke(); ctx.setLineDash([]); }
    ctx.restore();
  }

  /* -------------------------------------------------------------- character */
  private drawCharacter(ctx: CanvasRenderingContext2D, pal: Palette) {
    const b = this.bodyXf, OUT = "#231a14";
    const skin: RGB = [247, 218, 190], skinSh: RGB = [226, 178, 146];
    const jacket: RGB = pal.dark ? [76, 84, 108] : [58, 65, 84], jacketHi = mixc(jacket, [255, 255, 255], 0.14);
    const gold = pal.goldStrong, pants: RGB = pal.dark ? [58, 62, 80] : [44, 49, 64];
    const T = clamp(this.T.x, 0, 1.3);
    ctx.save(); ctx.lineJoin = "round"; ctx.lineCap = "round";
    // ground shadow
    ctx.fillStyle = rgba(pal.ink, pal.dark ? 0.38 : 0.2); ctx.beginPath(); ctx.ellipse(this.cx.x - this.lean.x * 14, GY + 1.5, 20 - this.hop.x * 0.1, 3.8, 0, 0, 7); ctx.fill();

    // legs: planted in the world, knees solved from the hips
    const fy = (f: Foot) => GY + Math.min(0, this.hop.x) * 0.6 - f.lift;
    const legs = [{ hip: this.toWorld(-6.5, 0), foot: { x: this.feet[0].x, y: fy(this.feet[0]) }, kneeDir: 1, c: shade(pants, -0.1) }, { hip: this.toWorld(6.5, 0), foot: { x: this.feet[1].x, y: fy(this.feet[1]) }, kneeDir: 1, c: pants }];
    for (const L of legs) {
      const k = ik(L.hip.x, L.hip.y, L.foot.x, L.foot.y, 10.2, 9.4, L.kneeDir);
      ctx.strokeStyle = OUT; ctx.lineWidth = 9.4; ctx.beginPath(); ctx.moveTo(L.hip.x, L.hip.y); ctx.lineTo(k.x, k.y); ctx.lineTo(L.foot.x, L.foot.y - 3); ctx.stroke();
      ctx.strokeStyle = rgba(L.c); ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(L.hip.x, L.hip.y); ctx.lineTo(k.x, k.y); ctx.lineTo(L.foot.x, L.foot.y - 3); ctx.stroke();
      // boot
      ctx.fillStyle = "#2b2420"; ctx.strokeStyle = OUT; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.roundRect(L.foot.x - 5.5, L.foot.y - 5, 12.5, 5.2, 2.2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = rgba(gold); ctx.fillRect(L.foot.x - 4.5, L.foot.y - 4.2, 10, 1);
    }

    // headband tails + scarf tail stream out behind (verlet cloth)
    this.ribbon(ctx, this.scarf, 7.2, 3, rgba(gold), OUT);
    this.ribbon(ctx, this.tails[0], 6.2, 2.2, rgba(mixc(gold, [255, 240, 205], 0.12)), OUT);
    this.ribbon(ctx, this.tails[1], 5.4, 2, rgba(mixc(gold, [60, 40, 10], 0.15)), OUT);

    // torso + head in body space
    ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.rot); ctx.scale(b.sx, b.sy);
    // jacket
    ctx.beginPath(); ctx.moveTo(-10, 1); ctx.quadraticCurveTo(-13, -14, -14.5, -26); ctx.quadraticCurveTo(0, -32, 14.5, -26); ctx.quadraticCurveTo(13, -14, 10, 1); ctx.quadraticCurveTo(0, 4.5, -10, 1); ctx.closePath();
    const jg = ctx.createLinearGradient(-14, -30, 14, 4); jg.addColorStop(0, rgba(jacketHi)); jg.addColorStop(1, rgba(jacket));
    ctx.fillStyle = jg; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.strokeStyle = rgba(gold); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, -29); ctx.lineTo(0, 2); ctx.stroke(); // placket
    ctx.beginPath(); ctx.moveTo(-10, -3); ctx.quadraticCurveTo(0, 1, 10, -3); ctx.stroke(); // belt trim
    ctx.fillStyle = rgba(gold); for (const y of [-21, -13, -6]) { ctx.beginPath(); ctx.arc(2.4, y, 1.1, 0, 7); ctx.fill(); }
    // stand collar
    ctx.beginPath(); ctx.moveTo(-8.5, -29); ctx.lineTo(-6, -34); ctx.lineTo(0, -31); ctx.lineTo(6, -34); ctx.lineTo(8.5, -29); ctx.quadraticCurveTo(0, -26, -8.5, -29); ctx.closePath();
    ctx.fillStyle = rgba(jacket); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.strokeStyle = rgba(gold); ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(-7.5, -30.2); ctx.lineTo(-5.5, -33.2); ctx.moveTo(7.5, -30.2); ctx.lineTo(5.5, -33.2); ctx.stroke();
    // scarf wrap
    ctx.beginPath(); ctx.moveTo(-9.5, -29.5); ctx.quadraticCurveTo(0, -24.5, 9.5, -29.5); ctx.lineTo(9, -33); ctx.quadraticCurveTo(0, -28.6, -9, -33); ctx.closePath();
    ctx.fillStyle = rgba(gold); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.4; ctx.stroke();
    // neck
    ctx.fillStyle = rgba(skinSh); ctx.fillRect(-3.2, -36, 6.4, 6);
    // head (own transform: follow-through lags the body)
    ctx.save(); ctx.translate(this.headX.x, this.headY.x - 1); ctx.translate(0, -31); ctx.rotate(this.headRot.x - this.lean.x * 0.0); ctx.translate(0, -25);
    this.drawHead(ctx, pal, OUT, skin, skinSh, gold);
    ctx.restore();
    ctx.restore();

    // belt charm: a gold coin on a cord that swings on its own
    { const p = this.toWorld(10.5, -1), a = this.charm.x, ex = p.x + Math.sin(a) * 9, ey = p.y + Math.cos(a) * 9;
      ctx.strokeStyle = OUT; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.beginPath(); ctx.arc(ex, ey + 2, 3.2, 0, 7); ctx.fillStyle = rgba(gold); ctx.fill(); ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = "rgba(255,246,214,0.85)"; ctx.beginPath(); ctx.arc(ex - 0.9, ey + 1.2, 0.9, 0, 7); ctx.fill(); }
    // arms in world space (hands grip the rope)
    this.drawArms(ctx, pal, OUT, jacket, skin, gold);
    ctx.restore();
  }

  private drawArms(ctx: CanvasRenderingContext2D, pal: Palette, OUT: string, jacket: RGB, skin: RGB, gold: RGB) {
    const T = clamp(this.T.x, 0, 1.2);
    const hand1 = this.leftHand();
    const sh1 = this.toWorld(-12.5, -25), sh2 = this.toWorld(12.5, -25);
    // second hand slides along the rope a little ahead of the first
    const ri = 2, tx = this.rx[ri], ty = this.ry[ri];
    const reach = 19.5;
    let hx2 = tx, hy2 = ty; const d2 = Math.hypot(hx2 - sh2.x, hy2 - sh2.y); if (d2 > reach) { hx2 = sh2.x + (hx2 - sh2.x) * reach / d2; hy2 = sh2.y + (hy2 - sh2.y) * reach / d2; }
    const arms = [{ s: sh1, h: hand1, dir: -1 }, { s: sh2, h: { x: hx2, y: hy2 }, dir: -1 }];
    for (const A of arms) {
      const k = ik(A.s.x, A.s.y, A.h.x, A.h.y, 10.5, 9.8, A.dir);
      ctx.strokeStyle = OUT; ctx.lineWidth = 7.6; ctx.beginPath(); ctx.moveTo(A.s.x, A.s.y); ctx.lineTo(k.x, k.y); ctx.lineTo(A.h.x, A.h.y); ctx.stroke();
      ctx.strokeStyle = rgba(jacket); ctx.lineWidth = 5.4; ctx.beginPath(); ctx.moveTo(A.s.x, A.s.y); ctx.lineTo(k.x, k.y); ctx.lineTo(A.h.x, A.h.y); ctx.stroke();
      ctx.strokeStyle = rgba(gold); ctx.lineWidth = 1.3; ctx.beginPath(); ctx.arc(k.x * 0.6 + A.h.x * 0.4, k.y * 0.6 + A.h.y * 0.4, 0.1, 0, 7); ctx.stroke();
      ctx.fillStyle = rgba(skin); ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(A.h.x, A.h.y, 4.1 - 0.4 * T, 0, 7); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = "rgba(35,26,20,0.55)"; ctx.lineWidth = 0.9; ctx.beginPath(); ctx.moveTo(A.h.x - 1.5, A.h.y - 2.2); ctx.lineTo(A.h.x - 1.5, A.h.y + 2.2); ctx.moveTo(A.h.x + 0.6, A.h.y - 2.4); ctx.lineTo(A.h.x + 0.6, A.h.y + 2.4); ctx.stroke();
    }
  }

  private ribbon(ctx: CanvasRenderingContext2D, st: Strand, w0: number, w1: number, fill: string, out: string) {
    const n = st.n, L: number[] = [], R: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1), dx = st.x[b] - st.x[a], dy = st.y[b] - st.y[a], d = Math.hypot(dx, dy) || 1, hw = lerp(w0, w1, i / (n - 1)) / 2;
      L.push(st.x[i] - (dy / d) * hw, st.y[i] + (dx / d) * hw); R.push(st.x[i] + (dy / d) * hw, st.y[i] - (dx / d) * hw);
    }
    ctx.beginPath(); ctx.moveTo(L[0], L[1]); for (let i = 1; i < n; i++) ctx.lineTo(L[i * 2], L[i * 2 + 1]);
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(R[i * 2], R[i * 2 + 1]);
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = out; ctx.lineWidth = 1.3; ctx.lineJoin = "round"; ctx.stroke();
  }

  private drawTuft(ctx: CanvasRenderingContext2D, f: Tuft, fill: string, out: string, hi: string | null) {
    const a = f.a.x, dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
    const bend = clamp((f.b.x - f.a.x) * f.len * 1.25 + f.a.v * 0.12, -f.len * 0.4, f.len * 0.4), L = f.len, w = f.w;
    const tx = f.x + dx * L + nx * bend, ty = f.y + dy * L + ny * bend;
    ctx.beginPath(); ctx.moveTo(f.x - nx * w / 2, f.y - ny * w / 2);
    ctx.quadraticCurveTo(f.x + dx * L * 0.55 - nx * w * 0.42 + nx * bend * 0.5, f.y + dy * L * 0.55 - ny * w * 0.42 + ny * bend * 0.5, tx, ty);
    ctx.quadraticCurveTo(f.x + dx * L * 0.55 + nx * w * 0.42 + nx * bend * 0.5, f.y + dy * L * 0.55 + ny * w * 0.42 + ny * bend * 0.5, f.x + nx * w / 2, f.y + ny * w / 2);
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = out; ctx.lineWidth = 1.5; ctx.stroke();
    if (hi) { ctx.strokeStyle = hi; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(f.x - nx * w * 0.15 + dx * 2, f.y - ny * w * 0.15 + dy * 2); ctx.quadraticCurveTo(f.x + dx * L * 0.5 - nx * w * 0.12 + nx * bend * 0.45, f.y + dy * L * 0.5 - ny * w * 0.12 + ny * bend * 0.45, f.x + dx * L * 0.78 + nx * bend * 0.8, f.y + dy * L * 0.78 + ny * bend * 0.8); ctx.stroke(); }
  }

  private drawHead(ctx: CanvasRenderingContext2D, pal: Palette, OUT: string, skin: RGB, skinSh: RGB, gold: RGB) {
    const hair = pal.dark ? "#3a4154" : "#2b2f3a", hairHi = pal.dark ? "rgba(168,178,204,0.7)" : "rgba(104,116,146,0.8)";
    const T = clamp(this.T.x, 0, 1.3), J = clamp(this.joy.x, 0, 1);
    // back hair
    for (const f of this.backTufts) this.drawTuft(ctx, f, hair, OUT, null);
    this.drawTuft(ctx, this.ahoge, hair, OUT, hairHi);
    ctx.beginPath(); ctx.ellipse(0, -4, 26.5, 26, 0, 0, 7); ctx.fillStyle = hair; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.8; ctx.stroke();
    // face
    const face = () => { ctx.beginPath(); ctx.moveTo(-23, -6); ctx.bezierCurveTo(-24, 8, -14, 20.5, 0, 22.5); ctx.bezierCurveTo(14, 20.5, 24, 8, 23, -6); ctx.bezierCurveTo(23, -21, 12, -26, 0, -26); ctx.bezierCurveTo(-12, -26, -23, -21, -23, -6); ctx.closePath(); };
    face(); const fg = ctx.createLinearGradient(0, -26, 0, 22); fg.addColorStop(0, rgba(skin)); fg.addColorStop(1, rgba(mixc(skin, skinSh, 0.35))); ctx.fillStyle = fg; ctx.fill();
    ctx.save(); face(); ctx.clip();
    // fringe shadow (cel shading), blush, and a cool pallor when frightened
    ctx.fillStyle = rgba(skinSh, 0.5); ctx.fillRect(-26, -26, 52, 25 + 3.5 * this.bangs.length * 0);
    ctx.fillStyle = rgba(skin, 1); ctx.fillRect(-26, -26, 52, 0);
    const bl = clamp(this.blush.x, 0, 1);
    if (bl > 0.02) { for (const s of [-1, 1]) { const g = ctx.createRadialGradient(s * 14.5, 11, 0.5, s * 14.5, 11, 7.5); g.addColorStop(0, `rgba(238,108,112,${0.6 * bl})`); g.addColorStop(1, "rgba(238,108,112,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(s * 14.5, 11, 8, 5.2, 0, 0, 7); ctx.fill(); } }
    if (bl > 0.5) { ctx.strokeStyle = `rgba(226,92,100,${0.55 * bl})`; ctx.lineWidth = 0.9; for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(s * 11.4 + k * 2.3 * s, 9.6); ctx.lineTo(s * 12.8 + k * 2.3 * s, 12.8); ctx.stroke(); } }
    const gl = clamp(this.gloom.x, 0, 1);
    if (gl > 0.02) { const g = ctx.createLinearGradient(0, -22, 0, 12); g.addColorStop(0, `rgba(96,112,186,${0.5 * gl})`); g.addColorStop(1, "rgba(96,112,186,0)"); ctx.fillStyle = g; ctx.fillRect(-26, -26, 52, 40); }
    ctx.restore();
    face(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.8; ctx.stroke();
    // ears peeking out
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.ellipse(s * 23.5, 3, 2.6, 4, 0, 0, 7); ctx.fillStyle = rgba(skinSh); ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.stroke(); }
    // tiny nose
    ctx.strokeStyle = "rgba(150,92,70,0.8)"; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(0.4, 10.6); ctx.quadraticCurveTo(1.6, 11.6, 0.2, 12); ctx.stroke();

    this.drawEye(ctx, -1, OUT); this.drawEye(ctx, 1, OUT);
    this.drawBrows(ctx, hair);
    this.drawMouth(ctx, OUT);

    // top hair cap over the forehead, then the headband, then the fringe on top of both
    ctx.beginPath(); ctx.moveTo(-26.5, -4); ctx.bezierCurveTo(-27, -22, -14, -32, 0, -32); ctx.bezierCurveTo(14, -32, 27, -22, 26.5, -4); ctx.lineTo(24, -17); ctx.quadraticCurveTo(0, -23, -24, -17); ctx.closePath();
    ctx.fillStyle = hair; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.7; ctx.stroke();
    for (const f of this.topTufts) this.drawTuft(ctx, f, hair, OUT, hairHi);
    // headband with candlestick plate
    ctx.save(); ctx.beginPath(); ctx.moveTo(-24.4, -13.2); ctx.quadraticCurveTo(0, -19.6, 24.4, -13.2); ctx.lineTo(24.6, -19.2); ctx.quadraticCurveTo(0, -25.6, -24.6, -19.2); ctx.closePath();
    const bg = ctx.createLinearGradient(0, -23, 0, -13); bg.addColorStop(0, rgba(mixc(gold, [255, 240, 205], 0.28))); bg.addColorStop(1, rgba(mixc(gold, [60, 40, 10], 0.25)));
    ctx.fillStyle = bg; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-6, -21.6, 12, 8, 2); ctx.fillStyle = "#2b2f3a"; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.2; ctx.stroke();
    ctx.strokeStyle = rgba(gold); ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(-2.4, -20.4); ctx.lineTo(-2.4, -15); ctx.moveTo(2.4, -19.8); ctx.lineTo(2.4, -14.6); ctx.stroke();
    ctx.fillStyle = rgba(gold); ctx.fillRect(-3.4, -18.6, 2, 3.4); ctx.fillStyle = rgba(mixc(gold, pal.profit, 0.0)); ctx.fillRect(1.4, -17.8, 2, 2.8);
    ctx.restore();
    for (const f of this.bangs) this.drawTuft(ctx, f, hair, OUT, hairHi);
    for (const f of this.sides) this.drawTuft(ctx, f, hair, OUT, hairHi);

    // sweat drop that lives on the temple (big, anime), wobbling
    const sd = smooth(0.35, 0.75, T);
    if (sd > 0.02) {
      const wob = Math.sin(this.time * 6) * 0.5, sl = 1 + 0.35 * smooth(0.8, 1.2, T), s = 3.1 * sd;
      ctx.save(); ctx.translate(20.8 + wob, -12 + (this.time * 2 % 1) * 3 * sd); ctx.scale(1, sl);
      this.dropPath(ctx, s); ctx.fillStyle = `rgba(170,214,240,${0.95 * sd})`; ctx.fill(); ctx.strokeStyle = `rgba(55,104,150,${0.9 * sd})`; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = `rgba(255,255,255,${0.9 * sd})`; ctx.beginPath(); ctx.ellipse(-s * 0.3, s * 0.1, s * 0.2, s * 0.35, 0, 0, 7); ctx.fill(); ctx.restore();
    }
    // gloom lines when it's all going wrong
    const gloom = clamp(this.gloom.x, 0, 1);
    if (gloom > 0.02) {
      ctx.save(); ctx.lineCap = "round";
      for (let i = 0; i < 6; i++) { const x = -17 + i * 6.8, len = (5 + (i * 5) % 5) * gloom, y0 = -21, g = ctx.createLinearGradient(0, y0, 0, y0 + len); g.addColorStop(0, `rgba(70,84,170,${0.85 * gloom})`); g.addColorStop(1, "rgba(70,84,170,0)"); ctx.strokeStyle = g; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(x, y0 + Math.sin(this.time * 9 + i) * 0.6); ctx.lineTo(x, y0 + len); ctx.stroke(); }
      ctx.restore();
    }
    void J;
  }

  private dropPath(ctx: CanvasRenderingContext2D, s: number) { ctx.beginPath(); ctx.moveTo(0, -s * 1.5); ctx.bezierCurveTo(s * 0.95, -s * 0.2, s * 1.0, s * 1.0, 0, s * 1.05); ctx.bezierCurveTo(-s * 1.0, s * 1.0, -s * 0.95, -s * 0.2, 0, -s * 1.5); ctx.closePath(); }

  private drawEye(ctx: CanvasRenderingContext2D, side: -1 | 1, OUT: string) {
    const left = side === -1, ex = side * 10.6, ey = 2.6;
    const open = clamp((left ? this.openL.x : this.openR.x) * (1 - smooth(0, 0.8, Math.max(this.happy.x, this.strain.x)) * 0.92), 0.03, 1.4);
    const hap = clamp(this.happy.x, 0, 1), str = clamp(this.strain.x, 0, 1), alt = Math.max(hap, str), vis = 1 - smooth(0.72, 0.95, alt);
    const ps = clamp(this.pupil.x, 0.35, 1.25), S = clamp(this.shock.x, 0, 1.3), pal = this.pal;
    const gx = clamp(this.gx.x, -1.3, 1.3), gy = clamp(this.gy.x, -1, 1);
    if (vis > 0.01) {
      ctx.save(); ctx.globalAlpha *= vis; ctx.translate(ex, ey);
      const rx = 8.1 + 0.7 * S, ry = 10.6 * Math.min(open, 1.25);
      ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, 7); ctx.fillStyle = "#fffdf8"; ctx.fill();
      ctx.save(); ctx.clip();
      const irx = 6.4 * (0.92 + 0.12 * S * 0 + (S > 0.4 ? -0.1 : 0.02)), iry = Math.min(8.9, ry * 0.94);
      const trem = clamp(S * 0.8 + this.gloom.x * 0.8, 0, 1), ix = gx * 2.3 + Math.sin(this.time * 43 + side) * 0.5 * trem, iy = gy * 1.7 + 0.8 - Math.max(0, 1 - open) * 1.5 + Math.cos(this.time * 37 + side) * 0.4 * trem;
      const ig = ctx.createLinearGradient(0, iy - iry, 0, iy + iry); ig.addColorStop(0, "#2a1c10"); ig.addColorStop(0.45, rgba(mixc([120, 78, 22], pal.goldStrong, 0.35))); ig.addColorStop(1, rgba(mixc(pal.goldStrong, [255, 226, 150], 0.5)));
      ctx.beginPath(); ctx.ellipse(ix, iy, irx, iry, 0, 0, 7); ctx.fillStyle = ig; ctx.fill();
      ctx.beginPath(); ctx.ellipse(ix, iy + 0.3, 2.8 * ps, 3.9 * ps, 0, 0, 7); ctx.fillStyle = "#150d07"; ctx.fill();
      ctx.beginPath(); ctx.ellipse(ix, iy, irx, iry, 0, 0, 7); ctx.strokeStyle = "rgba(25,14,6,0.8)"; ctx.lineWidth = 1; ctx.stroke();
      // highlights (they hold still while the iris moves — that's what sells the sparkle)
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.ellipse(-2.5 + ix * 0.4, -3.4 + iy * 0.3, 2.1, 2.5, -0.3, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(2.6 + ix * 0.3, 3.6 + iy * 0.3, 1.1, 1.1, 0, 0, 7); ctx.fill();
      if (this.joy.x > 0.5) { ctx.globalAlpha *= smooth(0.5, 0.9, this.joy.x); ctx.beginPath(); ctx.arc(1.4 + ix * 0.3, -0.6 + iy * 0.3, 0.8, 0, 7); ctx.fill(); }
      // determined glare: the upper lid slams down toward the nose while he heaves
      const det = smooth(0.3, 0.9, this.strainP * clamp(this.T.x, 0, 1.2)) * (1 - smooth(0.15, 0.5, S));
      if (det > 0.02) { const xin = -side * (rx + 1.5), xout = side * (rx + 1.5); ctx.beginPath(); ctx.moveTo(xout, -ry - 3); ctx.lineTo(xin, -ry - 3); ctx.lineTo(xin, -ry + 7.5 * det); ctx.lineTo(xout, -ry + 2.8 * det); ctx.closePath(); ctx.fillStyle = "rgb(240,208,180)"; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(xin, -ry + 7.5 * det); ctx.lineTo(xout, -ry + 2.8 * det); ctx.stroke(); }
      ctx.restore();
      // lid line + lash flick, lower lash
      ctx.strokeStyle = OUT; ctx.lineCap = "round";
      ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, Math.PI * 1.02, Math.PI * 1.98); ctx.stroke();
      ctx.lineWidth = 1.9; ctx.beginPath(); ctx.moveTo(side * (rx - 0.5), -ry * 0.42); ctx.quadraticCurveTo(side * (rx + 2), -ry * 0.55, side * (rx + 3.6), -ry * 0.75); ctx.stroke();
      ctx.lineWidth = 1; ctx.globalAlpha *= 0.55; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0.15, Math.PI - 0.15); ctx.stroke();
      ctx.restore();
    }
    // happy ^ eye
    if (hap > 0.01) { ctx.save(); ctx.globalAlpha *= smooth(0.45, 0.8, hap); ctx.strokeStyle = OUT; ctx.lineCap = "round"; ctx.lineWidth = 2.8; ctx.beginPath(); ctx.arc(ex, ey + 5.2 - 0.9 * this.relief.x, 6.4, Math.PI * 1.12, Math.PI * 1.88); ctx.stroke(); ctx.lineWidth = 1.7; ctx.beginPath(); ctx.moveTo(ex + side * 6.2, ey - 0.6); ctx.lineTo(ex + side * 8.4, ey - 2.2); ctx.stroke(); ctx.restore(); }
    // strained > < eye
    if (str > 0.01) { ctx.save(); ctx.globalAlpha *= smooth(0.45, 0.8, str); ctx.strokeStyle = OUT; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.lineWidth = 2.8; ctx.beginPath(); ctx.moveTo(ex + side * 6.4, ey - 4.4); ctx.lineTo(ex - side * 4.6, ey + 0.8); ctx.lineTo(ex + side * 6.4, ey + 6); ctx.stroke(); ctx.restore(); }
    // tears
    const tr = clamp(this.tears.x, 0, 1);
    if (tr > 0.02) { ctx.save(); ctx.translate(ex + side * 2.5, ey + 10.5); ctx.fillStyle = `rgba(190,228,250,${0.85 * tr})`; ctx.strokeStyle = `rgba(70,120,170,${0.8 * tr})`; ctx.lineWidth = 0.9;
      const len = 3 + 4 * tr + Math.sin(this.time * 5 + side) * 1; ctx.beginPath(); ctx.moveTo(-1.2, 0); ctx.quadraticCurveTo(-2, len * 0.6, 0, len + 1); ctx.quadraticCurveTo(2, len * 0.6, 1.2, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); }
  }

  private drawBrows(ctx: CanvasRenderingContext2D, hair: string) {
    ctx.save(); ctx.lineCap = "round"; ctx.strokeStyle = hair === "#2b2f3a" ? "#241c18" : "#3a3330"; ctx.lineWidth = 2.5;
    for (const side of [-1, 1] as const) {
      const left = side === -1, y = clamp(left ? this.browYL.x : this.browYR.x, -1, 1.4), tl = clamp(left ? this.browTL.x : this.browTR.x, -1.2, 1.4);
      const cx = side * 10.6, base = -7.8 - y * 3.2;
      // tilt: positive = inner end rises (worried), negative = inner end drops (determined)
      const inner = [cx - side * 5.6, base - tl * 2.6], outer = [cx + side * 6.4, base + tl * 1.4];
      ctx.beginPath(); ctx.moveTo(inner[0], inner[1]); ctx.quadraticCurveTo(cx, base - 1.7 - Math.abs(tl) * 0.2, outer[0], outer[1]); ctx.stroke();
    }
    ctx.restore();
  }

  private drawMouth(ctx: CanvasRenderingContext2D, OUT: string) {
    const sm = clamp(this.mSmile.x, -1.1, 1.1), op = clamp(this.mOpen.x, 0, 1.2), gr = clamp(this.grit.x, 0, 1);
    const w = 4.6 + 2.4 * Math.abs(sm) + 2 * op + 1.6 * gr, my = 15.6, corner = my - sm * 2.3 + (sm < 0 ? 0.6 : 0);
    ctx.save(); ctx.lineCap = "round"; ctx.lineJoin = "round";
    if (gr > 0.05) { // teeth gritted in effort
      ctx.globalAlpha = gr; const hh = 3.4 + op * 2;
      ctx.beginPath(); ctx.roundRect(-w, my - hh * 0.5, w * 2, hh, 1.6); ctx.fillStyle = "#fffdf8"; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.lineWidth = 0.9; ctx.beginPath(); for (let i = -2; i <= 2; i++) { ctx.moveTo(i * w * 0.38, my - hh * 0.5); ctx.lineTo(i * w * 0.38, my + hh * 0.5); } ctx.moveTo(-w, my); ctx.lineTo(w, my); ctx.stroke(); ctx.globalAlpha = 1;
    }
    if (gr < 0.95) {
      ctx.globalAlpha = 1 - gr;
      const topC = corner + sm * 3.4 - (sm < 0 ? 0.5 : 0), depth = op * (6.5 + 2 * Math.max(0, sm));
      if (op > 0.07) {
        ctx.beginPath(); ctx.moveTo(-w, corner); ctx.quadraticCurveTo(0, topC * 2 - corner + 0.2, w, corner);
        ctx.quadraticCurveTo(w * 0.8, corner + depth * 1.25 + 1, 0, corner + depth * 1.3 + sm * 1.4 + 1); ctx.quadraticCurveTo(-w * 0.8, corner + depth * 1.25 + 1, -w, corner); ctx.closePath();
        ctx.fillStyle = "#6d1f26"; ctx.fill(); ctx.strokeStyle = OUT; ctx.lineWidth = 1.6; ctx.stroke();
        ctx.save(); ctx.clip(); ctx.fillStyle = "#e8737c"; ctx.beginPath(); ctx.ellipse(0, corner + depth * 1.25 + 1, w * 0.55, depth * 0.55, 0, 0, 7); ctx.fill();
        if (sm > 0.25) { ctx.fillStyle = "#fffdf8"; ctx.fillRect(-w, corner - 1, w * 2, 2.4 + 1.2 * op); } ctx.restore();
      } else {
        const fear = clamp(this.gloom.x, 0, 1); ctx.beginPath();
        if (fear > 0.3) { ctx.moveTo(-w, corner); for (let i = 1; i <= 6; i++) ctx.lineTo(-w + (i * 2 * w) / 6, corner + (i % 2 ? -1.3 : 1.3) * fear + Math.sin(this.time * 30 + i) * 0.35); }
        else { ctx.moveTo(-w, corner); ctx.quadraticCurveTo(0, topC * 2 - corner, w, corner); }
        ctx.strokeStyle = "#7a3b2e"; ctx.lineWidth = 1.7; ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  /* ----------------------------------------------------------- particles */
  private drawParts(ctx: CanvasRenderingContext2D, pal: Palette, behind: boolean) {
    for (const p of this.parts) {
      const front = p.k === SWEAT || p.k === SPARK || p.k === PUFF || p.k === FIBER;
      if (front === behind) continue;
      const u = p.life / p.max, a = 1 - u;
      ctx.save(); ctx.translate(p.x, p.y);
      switch (p.k) {
        case DUST: { const r = p.s * (0.7 + u * 1.6); ctx.fillStyle = rgba(mixc(pal.raised, pal.gold, pal.dark ? 0.35 : 0.3), 0.5 * a); ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill(); break; }
        case SWEAT: { ctx.rotate(Math.atan2(p.vy, p.vx) - Math.PI / 2 * 0 + Math.PI / 2 * 0 - Math.PI / 2 + Math.PI); this.dropPath(ctx, p.s); ctx.fillStyle = `rgba(176,218,244,${0.95 * Math.min(1, a * 2)})`; ctx.fill(); ctx.strokeStyle = `rgba(60,110,155,${0.8 * Math.min(1, a * 2)})`; ctx.lineWidth = 0.7; ctx.stroke(); break; }
        case PEBBLE: { ctx.rotate(p.r); ctx.fillStyle = rgba(this.stone(pal).base, a > 0.2 ? 1 : a * 5); ctx.strokeStyle = "rgba(32,25,19,0.9)"; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-p.s, 0); ctx.lineTo(-p.s * 0.2, -p.s); ctx.lineTo(p.s, -p.s * 0.2); ctx.lineTo(p.s * 0.4, p.s); ctx.closePath(); ctx.fill(); ctx.stroke(); break; }
        case SPARK: { const tw = 0.6 + 0.4 * Math.sin(this.time * 14 + p.r * 3), s = p.s * tw * (u < 0.2 ? u * 5 : 1); ctx.rotate(p.r * 0.3); ctx.fillStyle = rgba(mixc(pal.goldStrong, [255, 236, 170], 0.45), a); ctx.beginPath(); ctx.moveTo(0, -s * 1.8); ctx.quadraticCurveTo(0, 0, s * 1.8, 0); ctx.quadraticCurveTo(0, 0, 0, s * 1.8); ctx.quadraticCurveTo(0, 0, -s * 1.8, 0); ctx.quadraticCurveTo(0, 0, 0, -s * 1.8); ctx.fill(); break; }
        case RING: { const r = 4 + u * 36; ctx.strokeStyle = rgba(mixc(pal.ink, pal.gold, 0.4), 0.5 * a); ctx.lineWidth = 1.6 * a + 0.4; ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.17, 0, 0, 7); ctx.stroke(); break; }
        case PUFF: { ctx.fillStyle = rgba(pal.raised, 0.7 * a); ctx.strokeStyle = rgba(pal.ink, 0.25 * a); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(0, 0, p.s, 0, 7); ctx.arc(p.s * 0.9, -p.s * 0.3, p.s * 0.7, 0, 7); ctx.fill(); break; }
        case FIBER: { ctx.rotate(p.r); ctx.strokeStyle = rgba(mixc(pal.gold, pal.ink, 0.3), a); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-p.s, 0); ctx.lineTo(p.s, 0); ctx.stroke(); break; }
      }
      ctx.restore();
    }
  }
}

/* ------------------------------------------------------------------ helpers */
function shade(c: RGB, k: number): RGB { return k < 0 ? mixc(c, [0, 0, 0], -k) : mixc(c, [255, 255, 255], k); }

/** Two-bone IK in the plane. Returns the middle joint; `dir` picks which side it bends toward. */
function ik(x0: number, y0: number, x1: number, y1: number, l1: number, l2: number, dir: number) {
  let dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy);
  const maxD = l1 + l2 - 0.01; if (d > maxD) { dx *= maxD / d; dy *= maxD / d; d = maxD; }
  d = Math.max(d, Math.abs(l1 - l2) + 0.01);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / d, uy = dy / d, mx = x0 + ux * a, my = y0 + uy * a;
  return { x: mx + -uy * h * dir * -1, y: my + ux * h * dir * -1 };
}
