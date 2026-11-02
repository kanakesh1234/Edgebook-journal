"use client";

import { useEffect, useRef, useState } from "react";
import {
  CatmullRomCurve3,
  Vec3,
  createNotebookSpreadTexture,
  createUnitBoxGeometry,
  mat4LookAt,
  mat4Multiply,
  mat4Perspective,
} from "./three-mini";
import {
  clamp,
  isLowPowerDevice,
  lerp,
  prefersReducedMotion,
  smooth,
  theatreState,
} from "./motion-utils";

/* ========================================================================== */
/*  GLSL Shaders — Single-Light Emissive + Fog + Instanced Box & Particles    */
/* ========================================================================== */

const BOX_VERT = `
attribute vec3 aPos;
attribute vec3 aNormal;
attribute vec2 aUv;

// Per-instance attributes:
// iTrans: xyz = world center, w = yaw rotation (radians)
// iScale: xyz = box dimensions, w = pitch/tilt (radians)
// iColor: rgb = base albedo, a = emissive boost (0..2)
attribute vec4 iTrans;
attribute vec4 iScale;
attribute vec4 iColor;

uniform mat4 uProjView;
uniform vec3 uCameraPos;

varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec2 vUv;
varying vec4 vColor;

void main() {
  // Scale
  vec3 p = aPos * iScale.xyz;
  vec3 n = aNormal;

  // Pitch tilt around X axis (used for open notebook pages & light cone)
  float pitch = iScale.w;
  if (abs(pitch) > 0.001) {
    float cp = cos(pitch);
    float sp = sin(pitch);
    p = vec3(p.x, p.y * cp - p.z * sp, p.y * sp + p.z * cp);
    n = vec3(n.x, n.y * cp - n.z * sp, n.y * sp + n.z * cp);
  }

  // Yaw rotation around Y axis
  float yaw = iTrans.w;
  if (abs(yaw) > 0.001) {
    float cy = cos(yaw);
    float sy = sin(yaw);
    p = vec3(p.x * cy + p.z * sy, p.y, -p.x * sy + p.z * cy);
    n = vec3(n.x * cy + n.z * sy, n.y, -n.x * sy + n.z * cy);
  }

  vec3 worldPos = p + iTrans.xyz;
  vWorldPos = worldPos;
  vNormal = normalize(n);
  vUv = aUv;
  vColor = iColor;

  gl_Position = uProjView * vec4(worldPos, 1.0);
}
`;

const BOX_FRAG = `
precision mediump float;

varying vec3 vNormal;
varying vec3 vWorldPos;
varying vec2 vUv;
varying vec4 vColor;

uniform vec3 uCameraPos;
uniform vec3 uLightPos;
uniform vec3 uFogColor;
uniform float uUseTex;
uniform sampler2D uTex;

void main() {
  vec3 N = normalize(vNormal);
  vec3 L = normalize(uLightPos - vWorldPos);
  vec3 V = normalize(uCameraPos - vWorldPos);
  vec3 H = normalize(L + V);

  // Single warm key light + soft ground bounce
  float diff = max(dot(N, L), 0.0);
  float hemi = 0.5 + 0.5 * N.y;
  float spec = pow(max(dot(N, H), 0.0), 28.0) * 0.35;

  vec3 base = vColor.rgb;
  if (uUseTex > 0.5) {
    vec4 texel = texture2D(uTex, vUv);
    base = mix(base, texel.rgb, 0.92);
  }

  float emissive = vColor.a;
  // Subtle edge rim for architectural depth
  float fresnel = pow(1.0 - max(dot(N, V), 0.0), 3.0);

  vec3 lit = base * (0.24 + 0.32 * hemi + 0.68 * diff)
           + vec3(0.88, 0.72, 0.44) * spec
           + base * emissive
           + vec3(0.82, 0.67, 0.42) * fresnel * (0.12 + emissive * 0.22);

  // Exponential distance fog matching the dark study / cream transition
  float dist = length(vWorldPos - uCameraPos);
  float fogFactor = clamp(exp(-dist * 0.0185), 0.0, 1.0);
  vec3 finalRgb = mix(uFogColor, lit, fogFactor);

  gl_FragColor = vec4(finalRgb, 1.0);
}
`;

const PARTICLE_VERT = `
attribute vec4 aParticle; // xyz = base pos, w = seed (0..1)
attribute vec3 aColor;

uniform mat4 uProjView;
uniform float uTime;
uniform float uDriveProg;
uniform vec3 uCameraPos;
uniform float uDpr;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vec3 pos = aParticle.xyz;
  float seed = aParticle.w;

  // Ambient dust drift in study & pillar canyon
  pos.x += sin(uTime * 0.55 + seed * 24.0) * 0.38;
  pos.y += cos(uTime * 0.42 + seed * 17.0) * 0.28;

  // Particles in the Drive Vault zone (z < -180) stream helically into the vault core (0, 1.2, -216)
  if (pos.z < -180.0) {
    float streamT = fract(seed + uTime * (0.14 + uDriveProg * 0.22));
    float radius = mix(11.5, 0.55, streamT);
    float angle = seed * 62.8 + streamT * 14.0 + uTime * 0.9;
    vec3 vaultCore = vec3(0.0, 1.35, -216.0);
    pos.x = vaultCore.x + cos(angle) * radius;
    pos.y = vaultCore.y + sin(angle * 1.3) * (radius * 0.48);
    pos.z = mix(-186.0, vaultCore.z, streamT);
  }

  float dist = length(pos - uCameraPos);
  gl_Position = uProjView * vec4(pos, 1.0);

  // Size attenuates with distance
  float baseSize = mix(2.2, 5.2, fract(seed * 13.7)) * uDpr;
  gl_PointSize = clamp(baseSize * (18.0 / max(4.0, dist)), 1.2, 9.0);

  // Fade out far particles and very close particles
  float nearFade = smoothstep(1.5, 5.0, dist);
  float farFade = 1.0 - smoothstep(42.0, 72.0, dist);
  vAlpha = nearFade * farFade * (0.45 + 0.45 * sin(uTime * 1.8 + seed * 31.0));
  vColor = aColor;
}
`;

const PARTICLE_FRAG = `
precision mediump float;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float r2 = dot(c, c);
  if (r2 > 0.25) discard;
  float soft = smoothstep(0.25, 0.02, r2);
  gl_FragColor = vec4(vColor, vAlpha * soft);
}
`;

const BEAM_VERT = `
attribute vec3 aPos;
uniform mat4 uProjView;
varying float vHeight;
varying vec3 vLocalPos;

void main() {
  vLocalPos = aPos;
  vHeight = aPos.y + 0.5;
  // Cone tapering from ceiling lamp down onto the open notebook on the desk (z = 9.5)
  float taper = mix(2.6, 0.45, vHeight);
  vec3 worldPos = vec3(aPos.x * taper, mix(0.2, 6.2, vHeight), 9.5 + aPos.z * taper);
  gl_Position = uProjView * vec4(worldPos, 1.0);
}
`;

const BEAM_FRAG = `
precision mediump float;
varying float vHeight;
varying vec3 vLocalPos;
uniform float uBeamAlpha;

void main() {
  float radial = 1.0 - clamp(length(vLocalPos.xz) * 1.85, 0.0, 1.0);
  float vert = sin(clamp(vHeight, 0.0, 1.0) * 3.14159);
  float a = radial * vert * uBeamAlpha;
  gl_FragColor = vec4(0.86, 0.71, 0.42, a);
}
`;

/* ========================================================================== */
/*  Camera Path Keyframes (Catmull-Rom Spline through all 7 Acts)             */
/* ========================================================================== */

const CAMERA_STOPS = [
  new Vec3(0.0, 2.25, 16.5),   // 0.00: Hero — Dark study above desk, pushing toward open notebook
  new Vec3(0.0, 1.55, 11.2),   // 0.12: Hero close-up on notebook & glowing candle pillars ahead
  new Vec3(-0.6, 2.40, -8.0),  // 0.24: The Inner Film — Entering candlestick pillar canyon
  new Vec3(0.6, 2.65, -36.0),  // 0.34: The Inner Film — Deep inside the candle colonnade
  new Vec3(0.0, 2.30, -64.0),  // 0.44: Daily Ritual — Approaching the 5 glowing ritual doors
  new Vec3(0.0, 2.30, -104.0), // 0.54: Daily Ritual — Passing through portal 05
  new Vec3(0.0, 2.50, -128.0), // 0.64: The Gap — Confronting Plan vs. Execution split monoliths
  new Vec3(0.0, 2.15, -164.0), // 0.76: Minato — Arriving at the floating glass monolith
  new Vec3(0.0, 2.25, -198.0), // 0.88: Your Drive — Particle stream into the Drive Vault
  new Vec3(0.0, 3.80, -232.0), // 1.00: Toolkit & Final CTA — Pull back to calm horizon
];

const LOOKAT_STOPS = [
  new Vec3(0.0, 0.48, 9.2),    // 0.00: Looking down at the open notebook on the desk
  new Vec3(0.0, 0.85, 2.0),    // 0.12: Looking past the notebook into the glowing pillars
  new Vec3(0.2, 2.10, -24.0),  // 0.24: Looking through the candlestick canyon
  new Vec3(-0.2, 2.20, -54.0), // 0.34: Looking toward the Ritual portals
  new Vec3(0.0, 2.10, -82.0),  // 0.44: Looking down the 5-door ritual axis
  new Vec3(0.0, 2.10, -120.0), // 0.54: Looking toward The Gap chasm
  new Vec3(0.0, 2.20, -144.0), // 0.64: Centered on the splitting/closing Gap slabs
  new Vec3(0.0, 2.05, -176.0), // 0.76: Centered on the Minato glass monolith
  new Vec3(0.0, 1.45, -216.0), // 0.88: Centered on the Sovereign Google Drive Vault
  new Vec3(0.0, 2.60, -256.0), // 1.00: Calm horizon
];

function compileShader(gl: WebGLRenderingContext, type: number, src: string): WebGLShader | null {
  const s = gl.createShader(type);
  if (!s) return null;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    gl.deleteShader(s);
    return null;
  }
  return s;
}

function createProgram(gl: WebGLRenderingContext, vsSrc: string, fsSrc: string): WebGLProgram | null {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSrc);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSrc);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  if (!prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    gl.deleteProgram(prog);
    return null;
  }
  return prog;
}

export default function TheatreCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [contextLost, setContextLost] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (prefersReducedMotion()) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const lowPower = isLowPowerDevice();
    const isMobile = window.innerWidth < 768;

    // Cap DPR strictly for 60fps mobile/desktop budget
    const maxAllowedDpr = lowPower ? 1.0 : isMobile ? 1.25 : 1.75;
    let currentDpr = Math.min(window.devicePixelRatio || 1, maxAllowedDpr);
    theatreState.activeDpr = currentDpr;

    let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
    let rafId = 0;
    let isPageVisible = !document.hidden;
    let disposed = false;

    const cameraCurve = new CatmullRomCurve3(CAMERA_STOPS);
    const lookAtCurve = new CatmullRomCurve3(LOOKAT_STOPS);
    const camPos = new Vec3();
    const lookTarget = new Vec3();
    const projMat = new Float32Array(16);
    const viewMat = new Float32Array(16);
    const projViewMat = new Float32Array(16);

    // Precompute static & dynamic instance slots (max 190 instances in 1 draw call)
    const MAX_INSTANCES = 190;
    const instanceData = new Float32Array(MAX_INSTANCES * 12); // 3 vec4s per instance (iTrans, iScale, iColor)
    let totalInstances = 0;

    // Track indices of dynamic instances so we can animate them per frame in O(1)
    let notebookLeftIdx = 0;
    let notebookRightIdx = 0;
    let candleStartIdx = 0;
    const CANDLE_COUNT = lowPower ? 32 : 56;
    let portalStartIdx = 0;
    let gapStartIdx = 0;
    let minatoStartIdx = 0;
    let vaultStartIdx = 0;

    const setInstance = (
      idx: number,
      x: number,
      y: number,
      z: number,
      yaw: number,
      sx: number,
      sy: number,
      sz: number,
      pitch: number,
      r: number,
      g: number,
      b: number,
      emissive: number,
    ) => {
      const o = idx * 12;
      instanceData[o] = x;
      instanceData[o + 1] = y;
      instanceData[o + 2] = z;
      instanceData[o + 3] = yaw;
      instanceData[o + 4] = sx;
      instanceData[o + 5] = sy;
      instanceData[o + 6] = sz;
      instanceData[o + 7] = pitch;
      instanceData[o + 8] = r;
      instanceData[o + 9] = g;
      instanceData[o + 10] = b;
      instanceData[o + 11] = emissive;
    };

    const buildSceneInstances = () => {
      let idx = 0;

      // 0..1: Open Archival Notebook on the Desk (rendered first with notebook spread texture!)
      notebookLeftIdx = idx++;
      setInstance(notebookLeftIdx, -0.58, 0.34, 9.5, 0.04, 1.12, 0.03, 1.48, 0.06, 0.97, 0.95, 0.90, 0.18);
      notebookRightIdx = idx++;
      setInstance(notebookRightIdx, 0.58, 0.34, 9.5, -0.04, 1.12, 0.03, 1.48, -0.06, 0.97, 0.95, 0.90, 0.18);

      // 2: Dark Walnut/Obsidian Study Desk Slab
      setInstance(idx++, 0, 0.08, 9.5, 0, 5.4, 0.22, 3.2, 0, 0.12, 0.09, 0.07, 0.0);
      // 3: Gold Desk Inlay Trim
      setInstance(idx++, 0, 0.20, 10.95, 0, 5.2, 0.02, 0.04, 0, 0.79, 0.65, 0.42, 0.45);
      // 4: Brass & Ebony Fountain Pen resting beside notebook
      setInstance(idx++, 1.48, 0.32, 9.55, 0.38, 0.06, 0.05, 1.15, 0, 0.82, 0.67, 0.38, 0.55);

      // 5..N: Instanced Candlestick Pillars (Hero distance + The Inner Film canyon, z = 4 to -58)
      candleStartIdx = idx;
      for (let i = 0; i < CANDLE_COUNT; i++) {
        const side = i % 2 === 0 ? -1 : 1;
        const row = Math.floor(i / 2);
        const z = 4.0 - row * 2.25;
        const xSpread = 3.2 + Math.sin(row * 0.45) * 1.35 + (i % 3) * 0.85;
        const x = side * xSpread;
        const isBull = (i * 7 + 3) % 3 !== 0;
        const isGold = i % 5 === 0;
        const h = 1.6 + ((i * 13) % 7) * 0.52;
        const y = 0.2 + h * 0.5 + Math.sin(i * 1.7) * 0.35;

        // Palette strictly from Edgebook tokens: gold (#cba76b), profit (#74b08c), loss (#cd8484)
        const r = isGold ? 0.80 : isBull ? 0.45 : 0.80;
        const g = isGold ? 0.65 : isBull ? 0.69 : 0.52;
        const b = isGold ? 0.42 : isBull ? 0.55 : 0.52;

        // Candle body
        setInstance(idx++, x, y, z, 0, 0.42, h, 0.42, 0, r, g, b, 0.32);
        // Candle wick (thin tall core)
        setInstance(idx++, x, y, z, 0, 0.06, h + 1.35, 0.06, 0, r, g, b, 0.65);
      }

      // Daily Ritual: 5 Glowing Portal Stations along z = -68 to -108
      portalStartIdx = idx;
      for (let s = 0; s < 5; s++) {
        const pz = -68.0 - s * 10.0;
        const sideOffset = (s % 2 === 0 ? -1 : 1) * 0.35;
        // Left jamb, Right jamb, Top lintel, Floor threshold bar
        setInstance(idx++, -2.65 + sideOffset, 2.2, pz, 0, 0.28, 4.4, 0.28, 0, 0.79, 0.65, 0.42, 0.25);
        setInstance(idx++, 2.65 + sideOffset, 2.2, pz, 0, 0.28, 4.4, 0.28, 0, 0.79, 0.65, 0.42, 0.25);
        setInstance(idx++, sideOffset, 4.35, pz, 0, 5.58, 0.24, 0.28, 0, 0.79, 0.65, 0.42, 0.35);
        setInstance(idx++, sideOffset, 0.04, pz, 0, 5.0, 0.06, 0.32, 0, 0.45, 0.69, 0.55, 0.4);
      }

      // The Gap: Plan (Left tectonic slabs) vs. Execution (Right tectonic slabs) at z = -140..-148
      gapStartIdx = idx;
      for (let gIdx = 0; gIdx < 8; gIdx++) {
        const isLeft = gIdx < 4;
        const layer = gIdx % 4;
        const gz = -139.0 - layer * 2.4;
        const h = 3.2 - layer * 0.35;
        const xBase = isLeft ? -1.45 : 1.45;
        // Left = disciplined gold/profit, Right = impulsive crimson shifting to gold as gap closes
        const r = isLeft ? 0.79 : 0.80;
        const g = isLeft ? 0.65 : 0.52;
        const b = isLeft ? 0.42 : 0.52;
        setInstance(idx++, xBase, 1.6, gz, 0, 2.6, h, 1.4, 0, r, g, b, 0.25);
      }

      // Minato: Floating Glass Panel Monolith + Gold Frame at z = -176
      minatoStartIdx = idx;
      // Glass core
      setInstance(idx++, 0, 2.1, -176.0, 0, 4.6, 3.2, 0.14, 0, 0.16, 0.14, 0.11, 0.22);
      // Brushed gold frame (Left, Right, Top, Bottom)
      setInstance(idx++, -2.35, 2.1, -175.9, 0, 0.12, 3.32, 0.18, 0, 0.80, 0.65, 0.42, 0.65);
      setInstance(idx++, 2.35, 2.1, -175.9, 0, 0.12, 3.32, 0.18, 0, 0.80, 0.65, 0.42, 0.65);
      setInstance(idx++, 0, 3.72, -175.9, 0, 4.82, 0.12, 0.18, 0, 0.80, 0.65, 0.42, 0.65);
      setInstance(idx++, 0, 0.48, -175.9, 0, 4.82, 0.12, 0.18, 0, 0.80, 0.65, 0.42, 0.65);

      // Your Drive: Sovereign Vault Core Cube + Orbiting Lock Rings at z = -216
      vaultStartIdx = idx;
      setInstance(idx++, 0, 1.45, -216.0, 0.78, 1.85, 1.85, 1.85, 0.35, 0.80, 0.65, 0.42, 0.55);
      setInstance(idx++, 0, 1.45, -216.0, -0.45, 2.55, 0.14, 2.55, 0.2, 0.45, 0.69, 0.55, 0.45);
      setInstance(idx++, 0, 1.45, -216.0, 0.25, 0.14, 2.55, 2.55, -0.2, 0.80, 0.65, 0.42, 0.45);

      totalInstances = idx;
    };

    buildSceneInstances();

    // Particle Buffer Data (Dust motes in Study/Film + Streaming Data Particles in Drive Vault)
    const MAX_PARTICLES = lowPower ? 320 : 880;
    const particleCoords = new Float32Array(MAX_PARTICLES * 4);
    const particleColors = new Float32Array(MAX_PARTICLES * 3);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const seed = (i * 0.61803398875) % 1;
      const inDriveZone = i >= MAX_PARTICLES * 0.55;
      const px = (Math.sin(i * 12.9898) * 0.5) * (inDriveZone ? 16 : 14);
      const py = 0.2 + ((i * 7.13) % 5.2);
      const pz = inDriveZone
        ? -184.0 - ((i * 3.7) % 38.0)
        : 15.0 - ((i * 2.9) % 185.0);

      particleCoords[i * 4] = px;
      particleCoords[i * 4 + 1] = py;
      particleCoords[i * 4 + 2] = pz;
      particleCoords[i * 4 + 3] = seed;

      // Warm gold & emerald particles
      const isEmerald = inDriveZone && i % 3 === 0;
      particleColors[i * 3] = isEmerald ? 0.45 : 0.86;
      particleColors[i * 3 + 1] = isEmerald ? 0.72 : 0.71;
      particleColors[i * 3 + 2] = isEmerald ? 0.56 : 0.43;
    }

    // GPU Resources for clean disposal
    let boxProg: WebGLProgram | null = null;
    let particleProg: WebGLProgram | null = null;
    let beamProg: WebGLProgram | null = null;
    let posBuf: WebGLBuffer | null = null;
    let normBuf: WebGLBuffer | null = null;
    let uvBuf: WebGLBuffer | null = null;
    let idxBuf: WebGLBuffer | null = null;
    let instBuf: WebGLBuffer | null = null;
    let partCoordBuf: WebGLBuffer | null = null;
    let partColBuf: WebGLBuffer | null = null;
    let notebookTex: WebGLTexture | null = null;

    const cleanupGpu = () => {
      if (!gl) return;
      if (posBuf) gl.deleteBuffer(posBuf);
      if (normBuf) gl.deleteBuffer(normBuf);
      if (uvBuf) gl.deleteBuffer(uvBuf);
      if (idxBuf) gl.deleteBuffer(idxBuf);
      if (instBuf) gl.deleteBuffer(instBuf);
      if (partCoordBuf) gl.deleteBuffer(partCoordBuf);
      if (partColBuf) gl.deleteBuffer(partColBuf);
      if (notebookTex) gl.deleteTexture(notebookTex);
      if (boxProg) gl.deleteProgram(boxProg);
      if (particleProg) gl.deleteProgram(particleProg);
      if (beamProg) gl.deleteProgram(beamProg);
      posBuf = normBuf = uvBuf = idxBuf = instBuf = partCoordBuf = partColBuf = null;
      notebookTex = null;
      boxProg = particleProg = beamProg = null;
    };

    let instExt: ANGLE_instanced_arrays | null = null;
    let isWebGL2 = false;

    const initGpu = (): boolean => {
      gl =
        (canvas.getContext("webgl2", {
          alpha: false,
          antialias: !lowPower && !isMobile,
          powerPreference: "high-performance",
        }) as WebGL2RenderingContext | null) ||
        (canvas.getContext("webgl", {
          alpha: false,
          antialias: false,
          powerPreference: "high-performance",
        }) as WebGLRenderingContext | null);

      if (!gl) return false;

      isWebGL2 = typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
      if (!isWebGL2) {
        instExt = gl.getExtension("ANGLE_instanced_arrays");
      }

      boxProg = createProgram(gl, BOX_VERT, BOX_FRAG);
      particleProg = createProgram(gl, PARTICLE_VERT, PARTICLE_FRAG);
      beamProg = createProgram(gl, BEAM_VERT, BEAM_FRAG);
      if (!boxProg || !particleProg || !beamProg) return false;

      const boxGeo = createUnitBoxGeometry();
      posBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.bufferData(gl.ARRAY_BUFFER, boxGeo.positions, gl.STATIC_DRAW);

      normBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
      gl.bufferData(gl.ARRAY_BUFFER, boxGeo.normals, gl.STATIC_DRAW);

      uvBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
      gl.bufferData(gl.ARRAY_BUFFER, boxGeo.uvs, gl.STATIC_DRAW);

      idxBuf = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, boxGeo.indices, gl.STATIC_DRAW);

      instBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
      gl.bufferData(gl.ARRAY_BUFFER, instanceData, gl.DYNAMIC_DRAW);

      partCoordBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, partCoordBuf);
      gl.bufferData(gl.ARRAY_BUFFER, particleCoords, gl.STATIC_DRAW);

      partColBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, partColBuf);
      gl.bufferData(gl.ARRAY_BUFFER, particleColors, gl.STATIC_DRAW);

      notebookTex = createNotebookSpreadTexture(gl);

      gl.enable(gl.DEPTH_TEST);
      gl.enable(gl.CULL_FACE);
      return true;
    };

    if (!initGpu()) return;

    const resize = () => {
      if (!gl || !canvas) return;
      const w = Math.max(1, Math.floor(window.innerWidth * currentDpr));
      const h = Math.max(1, Math.floor(window.innerHeight * currentDpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };

    resize();
    window.addEventListener("resize", resize, { passive: true });

    // Adaptive FPS Quality Monitor (lowers DPR & particles if frame rate dips)
    let frameCount = 0;
    let fpsAccumTime = 0;
    let activeParticleCount = MAX_PARTICLES;

    const updateDynamicInstances = (time: number) => {
      // 1. Subtle breathing of the open notebook pages in the study
      const breath = Math.sin(time * 1.4) * 0.012;
      instanceData[notebookLeftIdx * 12 + 7] = 0.06 + breath;
      instanceData[notebookRightIdx * 12 + 7] = -0.06 - breath;

      // 2. Subtle vertical pulse of Candlestick Pillars during Hero & Inner Film
      for (let i = 0; i < CANDLE_COUNT; i++) {
        const bodyIdx = candleStartIdx + i * 2;
        const wickIdx = bodyIdx + 1;
        const wave = Math.sin(time * 1.8 + i * 0.7) * 0.14;
        const baseH = 1.6 + ((i * 13) % 7) * 0.52;
        const baseY = 0.2 + baseH * 0.5 + Math.sin(i * 1.7) * 0.35;
        instanceData[bodyIdx * 12 + 1] = baseY + wave;
        instanceData[wickIdx * 12 + 1] = baseY + wave;
      }

      // 3. Daily Ritual Portals: Active step brightens dramatically
      const activeStep = theatreState.ritualStep;
      for (let s = 0; s < 5; s++) {
        const isCurrent = s === activeStep;
        const basePortal = portalStartIdx + s * 4;
        const boost = isCurrent ? 1.15 + Math.sin(time * 3.2) * 0.15 : 0.18;
        const r = isCurrent ? 0.88 : 0.65;
        const g = isCurrent ? 0.74 : 0.54;
        const b = isCurrent ? 0.44 : 0.36;

        for (let part = 0; part < 4; part++) {
          const pIdx = (basePortal + part) * 12;
          instanceData[pIdx + 8] = r;
          instanceData[pIdx + 9] = g;
          instanceData[pIdx + 10] = b;
          instanceData[pIdx + 11] = part === 3 && isCurrent ? 1.45 : boost;
        }
      }

      // 4. The Gap: World splits into Plan vs. Execution and closes as you scroll
      const split = theatreState.gapSplit; // 1 = split apart, 0 = locked together
      const separation = split * 3.8;
      for (let gIdx = 0; gIdx < 8; gIdx++) {
        const isLeft = gIdx < 4;
        const layer = gIdx % 4;
        const idx = (gapStartIdx + gIdx) * 12;
        const closedX = isLeft ? -1.32 : 1.32;
        const dir = isLeft ? -1 : 1;
        instanceData[idx] = closedX + dir * (separation + layer * 0.35 * split);
        instanceData[idx + 3] = dir * split * 0.14; // yaw fracture when split
        // Right side transitions from crimson (#cd8484) to disciplined emerald/gold as gap closes
        if (!isLeft) {
          instanceData[idx + 8] = lerp(0.45, 0.80, split);
          instanceData[idx + 9] = lerp(0.69, 0.45, split);
          instanceData[idx + 10] = lerp(0.55, 0.48, split);
          instanceData[idx + 11] = lerp(0.55, 0.25, split);
        }
      }

      // 5. Minato Glass Panel subtle cursor tilt
      const minatoYaw = theatreState.pointerX * 0.12;
      for (let m = 0; m < 5; m++) {
        instanceData[(minatoStartIdx + m) * 12 + 3] = minatoYaw;
      }

      // 6. Sovereign Google Drive Vault rotation
      const v0 = vaultStartIdx * 12;
      const v1 = (vaultStartIdx + 1) * 12;
      const v2 = (vaultStartIdx + 2) * 12;
      instanceData[v0 + 3] = time * 0.45 + theatreState.driveProgress * 3.14;
      instanceData[v1 + 3] = -time * 0.7;
      instanceData[v2 + 3] = time * 0.55;
    };

    let lastFrameTime = performance.now();

    const renderFrame = (now: number) => {
      if (disposed) return;
      rafId = window.requestAnimationFrame(renderFrame);

      if (!isPageVisible || !gl || !boxProg || !particleProg || !beamProg) return;

      // Pause heavy GPU work if the canvas is nearly faded out during calm cream sections
      if (theatreState.creamMix > 0.96) return;

      const dt = Math.min(0.1, Math.max(0.001, (now - lastFrameTime) / 1000));
      lastFrameTime = now;

      // Adaptive FPS governor
      frameCount++;
      fpsAccumTime += dt;
      if (frameCount >= 45) {
        const measuredFps = Math.round(frameCount / fpsAccumTime);
        theatreState.fps = measuredFps;
        if (measuredFps < 48 && currentDpr > 1.0) {
          currentDpr = Math.max(0.85, currentDpr - 0.25);
          theatreState.activeDpr = currentDpr;
          theatreState.quality = currentDpr <= 1.0 ? "medium" : "high";
          activeParticleCount = Math.floor(MAX_PARTICLES * 0.55);
          resize();
        } else if (measuredFps < 34 && theatreState.quality !== "low") {
          theatreState.quality = "low";
          activeParticleCount = Math.floor(MAX_PARTICLES * 0.3);
        }
        frameCount = 0;
        fpsAccumTime = 0;
      }

      const time = now * 0.001;
      const s = clamp(theatreState.splineProgress, 0, 1);

      // Evaluate 3D Catmull-Rom spline camera position & target
      cameraCurve.getPoint(s, camPos);
      lookAtCurve.getPoint(s, lookTarget);

      // Apply desktop cursor-reactive parallax & subtle breathing
      camPos.x += theatreState.pointerX * 0.65;
      camPos.y += -theatreState.pointerY * 0.38 + Math.sin(time * 0.9) * 0.04;
      lookTarget.x += theatreState.pointerX * 0.95;
      lookTarget.y += -theatreState.pointerY * 0.55;

      const aspect = Math.max(0.2, canvas.width / Math.max(1, canvas.height));
      const fovRad = ((isMobile ? 58 : 48) * Math.PI) / 180;
      mat4Perspective(projMat, fovRad, aspect, 0.25, 110.0);
      mat4LookAt(viewMat, camPos, lookTarget, theatreState.velocity * -0.02, 1, 0);
      mat4Multiply(projViewMat, projMat, viewMat);

      updateDynamicInstances(time);

      // Theme-aware fog color: blends from dark study (#120f0b) toward warm cream (#f7f4ee) when creamMix rises
      const isDarkTheme = document.documentElement.dataset.theme === "dark";
      const calmR = isDarkTheme ? 0.082 : 0.968;
      const calmG = isDarkTheme ? 0.071 : 0.957;
      const calmB = isDarkTheme ? 0.051 : 0.933;
      const mix = smooth(theatreState.creamMix);
      const fogR = lerp(0.071, calmR, mix);
      const fogG = lerp(0.059, calmG, mix);
      const fogB = lerp(0.043, calmB, mix);

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(fogR, fogG, fogB, 1.0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      let drawCalls = 0;

      // ---------------- PASS 1 & 2: Instanced 3D World Meshes ----------------
      gl.useProgram(boxProg);
      gl.uniformMatrix4fv(gl.getUniformLocation(boxProg, "uProjView"), false, projViewMat);
      gl.uniform3f(gl.getUniformLocation(boxProg, "uCameraPos"), camPos.x, camPos.y, camPos.z);
      gl.uniform3f(
        gl.getUniformLocation(boxProg, "uLightPos"),
        camPos.x + 2.5,
        camPos.y + 5.5,
        camPos.z - 4.0,
      );
      gl.uniform3f(gl.getUniformLocation(boxProg, "uFogColor"), fogR, fogG, fogB);

      const aPosLoc = gl.getAttribLocation(boxProg, "aPos");
      const aNormLoc = gl.getAttribLocation(boxProg, "aNormal");
      const aUvLoc = gl.getAttribLocation(boxProg, "aUv");
      const iTransLoc = gl.getAttribLocation(boxProg, "iTrans");
      const iScaleLoc = gl.getAttribLocation(boxProg, "iScale");
      const iColorLoc = gl.getAttribLocation(boxProg, "iColor");

      gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
      gl.enableVertexAttribArray(aPosLoc);
      gl.vertexAttribPointer(aPosLoc, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, normBuf);
      gl.enableVertexAttribArray(aNormLoc);
      gl.vertexAttribPointer(aNormLoc, 3, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
      gl.enableVertexAttribArray(aUvLoc);
      gl.vertexAttribPointer(aUvLoc, 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);

      gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, instanceData.subarray(0, totalInstances * 12));

      const stride = 48; // 12 floats * 4 bytes
      const bindInstancePointers = (startInstance: number) => {
        const baseByteOffset = startInstance * stride;
        gl!.enableVertexAttribArray(iTransLoc);
        gl!.vertexAttribPointer(iTransLoc, 4, gl!.FLOAT, false, stride, baseByteOffset);
        gl!.enableVertexAttribArray(iScaleLoc);
        gl!.vertexAttribPointer(iScaleLoc, 4, gl!.FLOAT, false, stride, baseByteOffset + 16);
        gl!.enableVertexAttribArray(iColorLoc);
        gl!.vertexAttribPointer(iColorLoc, 4, gl!.FLOAT, false, stride, baseByteOffset + 32);

        if (isWebGL2) {
          const gl2 = gl as WebGL2RenderingContext;
          gl2.vertexAttribDivisor(iTransLoc, 1);
          gl2.vertexAttribDivisor(iScaleLoc, 1);
          gl2.vertexAttribDivisor(iColorLoc, 1);
        } else if (instExt) {
          instExt.vertexAttribDivisorANGLE(iTransLoc, 1);
          instExt.vertexAttribDivisorANGLE(iScaleLoc, 1);
          instExt.vertexAttribDivisorANGLE(iColorLoc, 1);
        }
      };

      // Draw Pass 1: Textured Open Notebook Spread (2 instances)
      if (notebookTex && s < 0.25) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, notebookTex);
        gl.uniform1i(gl.getUniformLocation(boxProg, "uTex"), 0);
        gl.uniform1f(gl.getUniformLocation(boxProg, "uUseTex"), 1.0);
        bindInstancePointers(0);
        if (isWebGL2) {
          (gl as WebGL2RenderingContext).drawElementsInstanced(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0, 2);
          drawCalls++;
        } else if (instExt) {
          instExt.drawElementsInstancedANGLE(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0, 2);
          drawCalls++;
        }
      }

      // Draw Pass 2: All Remaining Procedural Architectural Meshes in 1 Instanced Call
      gl.uniform1f(gl.getUniformLocation(boxProg, "uUseTex"), 0.0);
      bindInstancePointers(2);
      const remainingCount = totalInstances - 2;
      if (isWebGL2) {
        (gl as WebGL2RenderingContext).drawElementsInstanced(
          gl.TRIANGLES,
          36,
          gl.UNSIGNED_SHORT,
          0,
          remainingCount,
        );
        drawCalls++;
      } else if (instExt) {
        instExt.drawElementsInstancedANGLE(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0, remainingCount);
        drawCalls++;
      }

      // Reset attribute divisors before non-instanced passes
      if (isWebGL2) {
        const gl2 = gl as WebGL2RenderingContext;
        gl2.vertexAttribDivisor(iTransLoc, 0);
        gl2.vertexAttribDivisor(iScaleLoc, 0);
        gl2.vertexAttribDivisor(iColorLoc, 0);
      } else if (instExt) {
        instExt.vertexAttribDivisorANGLE(iTransLoc, 0);
        instExt.vertexAttribDivisorANGLE(iScaleLoc, 0);
        instExt.vertexAttribDivisorANGLE(iColorLoc, 0);
      }
      gl.disableVertexAttribArray(iTransLoc);
      gl.disableVertexAttribArray(iScaleLoc);
      gl.disableVertexAttribArray(iColorLoc);

      // ---------------- PASS 3: Volumetric Gold Light Cone in Study ----------------
      if (s < 0.22) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
        gl.depthMask(false);
        gl.disable(gl.CULL_FACE);

        gl.useProgram(beamProg);
        gl.uniformMatrix4fv(gl.getUniformLocation(beamProg, "uProjView"), false, projViewMat);
        const beamAlpha = clamp(1.0 - s * 4.8, 0.0, 1.0) * 0.16;
        gl.uniform1f(gl.getUniformLocation(beamProg, "uBeamAlpha"), beamAlpha);

        const bPosLoc = gl.getAttribLocation(beamProg, "aPos");
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
        gl.enableVertexAttribArray(bPosLoc);
        gl.vertexAttribPointer(bPosLoc, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, idxBuf);
        gl.drawElements(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0);
        drawCalls++;

        gl.enable(gl.CULL_FACE);
      }

      // ---------------- PASS 4: GPU Dust & Vault Particle Stream ----------------
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.depthMask(false);

      gl.useProgram(particleProg);
      gl.uniformMatrix4fv(gl.getUniformLocation(particleProg, "uProjView"), false, projViewMat);
      gl.uniform1f(gl.getUniformLocation(particleProg, "uTime"), time);
      gl.uniform1f(gl.getUniformLocation(particleProg, "uDriveProg"), theatreState.driveProgress);
      gl.uniform3f(gl.getUniformLocation(particleProg, "uCameraPos"), camPos.x, camPos.y, camPos.z);
      gl.uniform1f(gl.getUniformLocation(particleProg, "uDpr"), currentDpr);

      const pCoordLoc = gl.getAttribLocation(particleProg, "aParticle");
      const pColLoc = gl.getAttribLocation(particleProg, "aColor");

      gl.bindBuffer(gl.ARRAY_BUFFER, partCoordBuf);
      gl.enableVertexAttribArray(pCoordLoc);
      gl.vertexAttribPointer(pCoordLoc, 4, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, partColBuf);
      gl.enableVertexAttribArray(pColLoc);
      gl.vertexAttribPointer(pColLoc, 3, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.POINTS, 0, activeParticleCount);
      drawCalls++;

      gl.depthMask(true);
      gl.disable(gl.BLEND);

      theatreState.drawCalls = drawCalls;
    };

    // Visibility & WebGL context loss handlers
    const onVisibilityChange = () => {
      isPageVisible = !document.hidden;
    };

    const onContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
      if (rafId) window.cancelAnimationFrame(rafId);
    };

    const onContextRestored = () => {
      setContextLost(false);
      cleanupGpu();
      if (initGpu()) {
        resize();
        lastFrameTime = performance.now();
        rafId = window.requestAnimationFrame(renderFrame);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextrestored", onContextRestored);

    rafId = window.requestAnimationFrame(renderFrame);

    return () => {
      disposed = true;
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);
      cleanupGpu();
    };
  }, []);

  if (contextLost) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 h-full w-full"
    />
  );
}
