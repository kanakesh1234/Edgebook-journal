/** Split "Label (Alt+T)" into a label and key chips. */
const SHORTCUT = /^(?:(?:ctrl|cmd|alt|shift|⌘|⌥|⇧)\+.+|space|esc|del|enter|[a-z0-9/?.,;'[\]\-=]|[←→↑↓])$/i;

export function parseTip(raw: string, explicitKbd?: string | null): { label: string; keys: string[] } {
  let label = raw.trim();
  let kbd = explicitKbd ?? "";
  if (!kbd) {
    const m = /^(.*?)\s*\(([^()]+)\)\s*$/.exec(label);
    if (m && SHORTCUT.test(m[2].trim())) { label = m[1]; kbd = m[2].trim(); }
  }
  const keys = kbd ? kbd.split("+").map((k) => k.trim()).filter(Boolean) : [];
  return { label, keys };
}
