import { describe, expect, it } from 'vitest';
import { COLORS, blend } from '../styles/tokens';

describe('blend', () => {
  it('returns bg at alpha 0 and fg at alpha 1', () => {
    expect(blend(COLORS.spectral, COLORS.bg, 0)).toBe(COLORS.bg);
    expect(blend(COLORS.spectral, COLORS.bg, 1)).toBe(COLORS.spectral);
  });

  it('composites spectral over bg at the header fog opacity (0.18)', () => {
    // Per channel: dc/1a -> 3d, eb/18 -> 3e, ff/16 -> 40 (design.md, Nav_Fog amendment).
    expect(blend(COLORS.spectral, COLORS.bg, 0.18)).toBe('#3d3e40');
  });

  it('rounds each channel and pads to lowercase #rrggbb', () => {
    // 0x00 and 0xff at 0.5 give 127.5, which rounds to 128 (0x80).
    expect(blend(COLORS.onFailure, COLORS.spokenBg, 0.5)).toBe('#808080');
    // Small values keep their leading zero.
    expect(blend(COLORS.onFailure, COLORS.spokenBg, 0.02)).toBe('#050505');
  });
});
