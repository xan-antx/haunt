/**
 * mulberry32: a small seeded random number generator.
 * The seed is reduced to an unsigned 32-bit integer. Each call returns a number in [0, 1).
 */
export function mulberry32(seed: number): () => number {
  if (!Number.isInteger(seed)) {
    throw new RangeError(`The seed must be an integer, got ${String(seed)}.`);
  }
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
