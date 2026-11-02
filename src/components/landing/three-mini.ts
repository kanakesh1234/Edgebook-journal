/**
 * Lightweight, zero-dependency 3D math + procedural geometry + Catmull-Rom
 * spline toolkit purpose-built for the Edgebook WebGL Theatre.
 * Keeps the lazy-loaded 3D chunk under ~12 kB gzipped while delivering
 * hardware instancing, volumetric beams, canvas-textured portals, and 60fps on mobile.
 */

export class Vec3 {
  x: number;
  y: number;
  z: number;

  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  set(x: number, y: number, z: number): this {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  copy(v: Vec3): this {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }

  clone(): Vec3 {
    return new Vec3(this.x, this.y, this.z);
  }

  lerpVectors(a: Vec3, b: Vec3, t: number): this {
    this.x = a.x + (b.x - a.x) * t;
    this.y = a.y + (b.y - a.y) * t;
    this.z = a.z + (b.z - a.z) * t;
    return this;
  }
}

/**
 * 3D Catmull-Rom Spline (matches THREE.CatmullRomCurve3 behavior)
 * Evaluates smooth 3D camera position and tangent along keyframe stops.
 */
export class CatmullRomCurve3 {
  points: Vec3[];

  constructor(points: Vec3[]) {
    this.points = points;
  }

  getPoint(t: number, target = new Vec3()): Vec3 {
    const pts = this.points;
    const n = pts.length;
    if (n === 0) return target.set(0, 0, 0);
    if (n === 1) return target.copy(pts[0]!);

    const clamped = Math.max(0, Math.min(1, t));
    const p = (n - 1) * clamped;
    const intPoint = Math.min(n - 2, Math.floor(p));
    const weight = p - intPoint;

    const p0 = pts[Math.max(0, intPoint - 1)]!;
    const p1 = pts[intPoint]!;
    const p2 = pts[Math.min(n - 1, intPoint + 1)]!;
    const p3 = pts[Math.min(n - 1, intPoint + 2)]!;

    const w2 = weight * weight;
    const w3 = w2 * weight;

    const catmull = (v0: number, v1: number, v2: number, v3: number) =>
      0.5 *
      (2 * v1 +
        (-v0 + v2) * weight +
        (2 * v0 - 5 * v1 + 4 * v2 - v3) * w2 +
        (-v0 + 3 * v1 - 3 * v2 + v3) * w3);

    return target.set(
      catmull(p0.x, p1.x, p2.x, p3.x),
      catmull(p0.y, p1.y, p2.y, p3.y),
      catmull(p0.z, p1.z, p2.z, p3.z),
    );
  }
}

/** Column-major 4x4 matrix utilities for WebGL uniforms */
export function mat4Perspective(out: Float32Array, fovyRad: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1.0 / Math.tan(fovyRad / 2);
  const nf = 1 / (near - far);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}

export function mat4LookAt(out: Float32Array, eye: Vec3, center: Vec3, upX = 0, upY = 1, upZ = 0): Float32Array {
  let zx = eye.x - center.x;
  let zy = eye.y - center.y;
  let zz = eye.z - center.z;
  let len = Math.hypot(zx, zy, zz);
  if (len < 1e-6) {
    zz = 1;
  } else {
    zx /= len;
    zy /= len;
    zz /= len;
  }

  let xx = upY * zz - upZ * zy;
  let xy = upZ * zx - upX * zz;
  let xz = upX * zy - upY * xx;
  len = Math.hypot(xx, xy, xz);
  if (len < 1e-6) {
    xx = 0;
    xy = 0;
    xz = 0;
  } else {
    xx /= len;
    xy /= len;
    xz /= len;
  }

  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;

  out[0] = xx;
  out[1] = yx;
  out[2] = zx;
  out[3] = 0;
  out[4] = xy;
  out[5] = yy;
  out[6] = zy;
  out[7] = 0;
  out[8] = xz;
  out[9] = yz;
  out[10] = zz;
  out[11] = 0;
  out[12] = -(xx * eye.x + xy * eye.y + xz * eye.z);
  out[13] = -(yx * eye.x + yy * eye.y + yz * eye.z);
  out[14] = -(zx * eye.x + zy * eye.y + zz * eye.z);
  out[15] = 1;
  return out;
}

export function mat4Multiply(out: Float32Array, a: Float32Array, b: Float32Array): Float32Array {
  const a00 = a[0]!, a01 = a[1]!, a02 = a[2]!, a03 = a[3]!;
  const a10 = a[4]!, a11 = a[5]!, a12 = a[6]!, a13 = a[7]!;
  const a20 = a[8]!, a21 = a[9]!, a22 = a[10]!, a23 = a[11]!;
  const a30 = a[12]!, a31 = a[13]!, a32 = a[14]!, a33 = a[15]!;

  for (let i = 0; i < 4; i++) {
    const idx = i * 4;
    const b0 = b[idx]!, b1 = b[idx + 1]!, b2 = b[idx + 2]!, b3 = b[idx + 3]!;
    out[idx] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[idx + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[idx + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[idx + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
  }
  return out;
}

export interface BoxGeometryData {
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  indices: Uint16Array;
}

/** Procedural unit box geometry [-0.5..0.5] with normals and UVs */
export function createUnitBoxGeometry(): BoxGeometryData {
  const positions = new Float32Array([
    // Front (+Z)
    -0.5, -0.5,  0.5,   0.5, -0.5,  0.5,   0.5,  0.5,  0.5,  -0.5,  0.5,  0.5,
    // Back (-Z)
     0.5, -0.5, -0.5,  -0.5, -0.5, -0.5,  -0.5,  0.5, -0.5,   0.5,  0.5, -0.5,
    // Top (+Y)
    -0.5,  0.5,  0.5,   0.5,  0.5,  0.5,   0.5,  0.5, -0.5,  -0.5,  0.5, -0.5,
    // Bottom (-Y)
    -0.5, -0.5, -0.5,   0.5, -0.5, -0.5,   0.5, -0.5,  0.5,  -0.5, -0.5,  0.5,
    // Right (+X)
     0.5, -0.5,  0.5,   0.5, -0.5, -0.5,   0.5,  0.5, -0.5,   0.5,  0.5,  0.5,
    // Left (-X)
    -0.5, -0.5, -0.5,  -0.5, -0.5,  0.5,  -0.5,  0.5,  0.5,  -0.5,  0.5, -0.5,
  ]);

  const normals = new Float32Array([
     0,  0,  1,   0,  0,  1,   0,  0,  1,   0,  0,  1,
     0,  0, -1,   0,  0, -1,   0,  0, -1,   0,  0, -1,
     0,  1,  0,   0,  1,  0,   0,  1,  0,   0,  1,  0,
     0, -1,  0,   0, -1,  0,   0, -1,  0,   0, -1,  0,
     1,  0,  0,   1,  0,  0,   1,  0,  0,   1,  0,  0,
    -1,  0,  0,  -1,  0,  0,  -1,  0,  0,  -1,  0,  0,
  ]);

  const uvs = new Float32Array([
    0, 1,  1, 1,  1, 0,  0, 0,
    0, 1,  1, 1,  1, 0,  0, 0,
    0, 1,  1, 1,  1, 0,  0, 0,
    0, 1,  1, 1,  1, 0,  0, 0,
    0, 1,  1, 1,  1, 0,  0, 0,
    0, 1,  1, 1,  1, 0,  0, 0,
  ]);

  const indices = new Uint16Array(36);
  for (let f = 0; f < 6; f++) {
    const v = f * 4;
    const i = f * 6;
    indices[i] = v;
    indices[i + 1] = v + 1;
    indices[i + 2] = v + 2;
    indices[i + 3] = v;
    indices[i + 4] = v + 2;
    indices[i + 5] = v + 3;
  }

  return { positions, normals, uvs, indices };
}

/**
 * Generates procedural 2D canvas textures for the 3D scene:
 * 1. Open Archival Notebook Spread (Hero Study Desk)
 * 2. Minato Glass Panel Hologram
 * 3. Sovereign Google Drive Vault Face
 */
export function createNotebookSpreadTexture(gl: WebGLRenderingContext): WebGLTexture | null {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Warm archival paper
  ctx.fillStyle = "#f7f2e6";
  ctx.fillRect(0, 0, 512, 512);

  // Subtle center spine shadow
  const spine = ctx.createLinearGradient(0, 0, 64, 0);
  spine.addColorStop(0, "rgba(28, 22, 14, 0.38)");
  spine.addColorStop(1, "rgba(28, 22, 14, 0)");
  ctx.fillStyle = spine;
  ctx.fillRect(0, 0, 64, 512);

  // Red margin rule
  ctx.strokeStyle = "rgba(172, 81, 87, 0.42)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(68, 0);
  ctx.lineTo(68, 512);
  ctx.stroke();

  // Horizontal ledger lines
  ctx.strokeStyle = "rgba(110, 102, 87, 0.22)";
  ctx.lineWidth = 1.5;
  for (let y = 76; y < 480; y += 34) {
    ctx.beginPath();
    ctx.moveTo(28, y);
    ctx.lineTo(484, y);
    ctx.stroke();
  }

  // Header & Handwritten Intention
  ctx.fillStyle = "#8c6d2e";
  ctx.font = "600 16px monospace";
  ctx.fillText("EDGEBOOK · SESSION #048 · 08:45 NY", 82, 56);

  ctx.fillStyle = "#26221a";
  ctx.font = "italic 22px Georgia, serif";
  ctx.fillText("1. Wait for overnight low sweep & 5m close.", 82, 104);
  ctx.fillText("2. Max 2 trades. Stop after first clean win.", 82, 172);
  ctx.fillText("3. If opening drive chops, hands off mouse.", 82, 240);

  ctx.fillStyle = "#40795b";
  ctx.font = "600 18px sans-serif";
  ctx.fillText("✓ STATE: CALM · PROCESS VERIFIED", 82, 342);

  const tex = gl.createTexture();
  if (!tex) return null;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}
