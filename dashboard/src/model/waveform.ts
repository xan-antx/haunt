// Deterministic waveform bars derived from spoken text. Purely decorative (aria-hidden).

function hash(text: string, seed: number): number {
  // FNV-1a
  let h = 0x811c9dc5 ^ seed;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * `count` bar heights in [0.15, 1], the same for the same text and frame.
 * Frame 0 is the still image; later frames are used while playing.
 */
export function waveformBars(text: string, count = 32, frame = 0): number[] {
  const random = mulberry32(hash(text, frame));
  const words = text.trim() === '' ? 1 : text.trim().split(/\s+/).length;
  return Array.from({ length: count }, (_, i) => {
    // A soft envelope with one bump per word, so longer phrases look busier.
    const envelope = 0.55 + 0.45 * Math.abs(Math.sin(((i + 0.5) / count) * Math.PI * Math.min(words, 6)));
    const value = 0.15 + 0.85 * envelope * (0.35 + 0.65 * random());
    return Math.round(Math.min(1, Math.max(0.15, value)) * 1000) / 1000;
  });
}
