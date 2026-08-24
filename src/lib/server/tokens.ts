/* SERVER-ONLY module — import exclusively from route handlers (src/app/api/**). Never import from client components. */
import crypto from "node:crypto";

/* ------------------------------------------------------------------ */
/*  Token encryption — refresh tokens never touch the browser.         */
/*  AES-256-GCM, key derived from GOOGLE_TOKEN_SECRET via scrypt.      */
/* ------------------------------------------------------------------ */

const ALGO = "aes-256-gcm";

function deriveKey(secret: string): Buffer {
  return crypto.scryptSync(secret, "edgebook.token.v1", 32);
}

/** Encrypt a refresh token → single safe-to-store string (iv.tag.cipher, b64). */
export function encryptToken(plaintext: string, secret: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, deriveKey(secret), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64url")}.${tag.toString("base64url")}.${enc.toString("base64url")}`;
}

/** Decrypt; returns null on tamper or wrong key (never throws). */
export function decryptToken(payload: string, secret: string): string | null {
  try {
    const [ivB64, tagB64, dataB64] = payload.split(".");
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const decipher = crypto.createDecipheriv(ALGO, deriveKey(secret), Buffer.from(ivB64, "base64url"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64url"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64url")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/** HMAC-signed OAuth state parameter (CSRF protection). */
export function signState(secret: string, nonce: string): string {
  const mac = crypto.createHmac("sha256", secret).update(nonce).digest("base64url");
  return `${nonce}.${mac}`;
}

export function verifyState(secret: string, state: string): string | null {
  const [nonce, mac] = state.split(".");
  if (!nonce || !mac) return null;
  const expected = crypto.createHmac("sha256", secret).update(nonce).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return nonce;
}

export function randomNonce(): string {
  return crypto.randomBytes(16).toString("base64url");
}
