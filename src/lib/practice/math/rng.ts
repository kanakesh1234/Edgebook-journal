export interface Rng { next(): number; int(min: number, max: number): number; pick<T>(items: readonly T[]): T; }

export function seededRng(seed: number): Rng {
  let state = seed >>> 0 || 0x9e3779b9;
  const next = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 0x1_0000_0000; };
  return { next, int: (min, max) => min + Math.floor(next() * (max - min + 1)), pick: <T>(items: readonly T[]) => items[Math.floor(next() * items.length)]! };
}
