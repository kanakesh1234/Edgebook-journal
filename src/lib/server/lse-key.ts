import fs from 'node:fs';
import path from 'node:path';

/* ------------------------------------------------------------------ */
/*  LSE_API_KEY resolver — server-side only                             */
/*                                                                      */
/*  Next.js reads .env.local ONCE at startup. If the key was added (or  */
/*  fixed) while `npm run dev` was running — or the server was started  */
/*  from another folder — process.env.LSE_API_KEY is empty even though  */
/*  the file is correct. This helper:                                   */
/*   1. uses process.env.LSE_API_KEY when present (always in prod)      */
/*   2. otherwise (dev only) re-reads .env.local / .env from disk,      */
/*      so adding the key works without restarting the server.          */
/*  The key is never logged and never sent to the browser.              */
/* ------------------------------------------------------------------ */

const NAME = 'LSE_API_KEY';
const FILES = ['.env.local', '.env.development.local', '.env'];

let cache: { key: string | null; stamp: string } | null = null;

function clean(v: string | undefined | null): string | null {
  if (!v) return null;
  const t = v.trim().replace(/^['"]|['"]$/g, '').trim();
  return t || null;
}

function parse(text: string): string | null {
  let found: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?LSE_API_KEY\s*=\s*(.*)$/);
    if (m) {
      // strip trailing inline comment on unquoted values
      const raw = m[1].trim();
      const val = /^['"]/.test(raw) ? raw : raw.replace(/\s+#.*$/, '');
      found = clean(val) ?? found;
    }
  }
  return found;
}

export function getLseApiKey(): string | null {
  const fromEnv = clean(process.env[NAME]);
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === 'production') return null;

  // Dev fallback: look in cwd and its parent (covers starting from a sub-folder).
  const dirs = [process.cwd(), path.resolve(process.cwd(), '..')];
  const paths = dirs.flatMap((d) => FILES.map((f) => path.join(d, f)));

  let stamp = '';
  const existing: string[] = [];
  for (const p of paths) {
    try {
      const st = fs.statSync(p);
      existing.push(p);
      stamp += `${p}:${st.mtimeMs};`;
    } catch { /* missing file */ }
  }
  if (cache && cache.stamp === stamp) return cache.key;

  let key: string | null = null;
  for (const p of existing) {
    try {
      key = parse(fs.readFileSync(p, 'utf8'));
      if (key) break;
    } catch { /* unreadable */ }
  }
  cache = { key, stamp };
  if (key) process.env[NAME] = key; // so any other reader sees it too
  return key;
}

export const LSE_KEY_HELP =
  'LSE_API_KEY was not found. Add LSE_API_KEY=your_key to .env.local in the project root (next to package.json) and click Retry.';
