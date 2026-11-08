/// <reference types="node" />
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  COLORS,
  COLOR_PAIRS,
  THRESHOLDS,
  TRANSCRIPT_FADES,
  blend,
  contrastRatio,
  type ColorToken,
} from '../styles/tokens';

const srcDir = join(__dirname, '..');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return name === '__tests__' ? [] : sourceFiles(full);
    return /\.(css|ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe('design token contrast', () => {
  it.each(COLOR_PAIRS.map((p) => [`${p.fg} on ${p.bg} (${p.use})`, p] as const))('%s passes AA', (_name, pair) => {
    const ratio = contrastRatio(COLORS[pair.fg], COLORS[pair.bg]);
    expect(ratio).toBeGreaterThanOrEqual(THRESHOLDS[pair.kind]);
    // The documented ratio must match the recomputed one.
    expect(Math.abs(ratio - pair.ratio)).toBeLessThan(0.01);
  });

  it.each(Object.entries(TRANSCRIPT_FADES))(
    '%s transcript fades step down in contrast and stay at least 4.5:1',
    (_panel, { bg, levels }) => {
      const ratios = levels.map((fg) => contrastRatio(COLORS[fg], COLORS[bg]));
      ratios.forEach((ratio, i) => {
        expect(ratio).toBeGreaterThanOrEqual(4.5);
        if (i > 0) expect(ratio).toBeLessThan(ratios[i - 1]!);
        // Every level is a documented text pair.
        expect(
          COLOR_PAIRS.some((p) => p.fg === levels[i] && p.bg === bg && p.kind === 'text'),
        ).toBe(true);
      });
    },
  );

  // Nav_Fog: the brightest point behind the nav is --spectral composited over --bg at the fog's
  // opacity. 0.18 is the default `.fog`; 0.25 is `.dense` and the motion-limits ceiling.
  describe('Nav_Fog blend', () => {
    const FOG_OPACITIES = [0.18, 0.25] as const;
    const FOG_TEXT: ColorToken[] = ['text', 'spectral'];

    it.each(FOG_OPACITIES.flatMap((alpha) => FOG_TEXT.map((fg) => [fg, alpha] as const)))(
      '%s on blend(spectral, bg, %s) passes AA for text',
      (fg, alpha) => {
        const behind = blend(COLORS.spectral, COLORS.bg, alpha);
        expect(contrastRatio(COLORS[fg], behind)).toBeGreaterThanOrEqual(THRESHOLDS.text);
      },
    );

    it('Fog.module.css never exceeds the tested 0.25 opacity', () => {
      const css = readFileSync(join(srcDir, 'components', 'layout', 'Fog.module.css'), 'utf8');
      const opacities = [...css.matchAll(/(?<![-\w])opacity:\s*([\d.]+)/g)].map((m) => Number(m[1]));
      expect(opacities).toEqual(expect.arrayContaining([0.18, 0.25]));
      for (const value of opacities) expect(value).toBeLessThanOrEqual(0.25);
    });

    it('blend composites per channel', () => {
      expect(blend(COLORS.spectral, COLORS.bg, 0)).toBe(COLORS.bg);
      expect(blend(COLORS.spectral, COLORS.bg, 1)).toBe(COLORS.spectral);
      expect(blend('#ffffff', '#000000', 0.5)).toBe('#808080');
    });
  });

  it('keeps failure red out of text', () => {
    expect(contrastRatio(COLORS.failure, COLORS.bg)).toBeLessThan(4.5);
    expect(COLOR_PAIRS.some((p) => p.fg === 'failure' && p.kind === 'text')).toBe(false);
  });

  it('mirrors tokens.css exactly', () => {
    const css = readFileSync(join(srcDir, 'styles', 'tokens.css'), 'utf8');
    const kebab = (name: string) => `--${name.replace(/[A-Z]|\d+/g, (c) => `-${c.toLowerCase()}`)}`;
    for (const [name, value] of Object.entries(COLORS)) {
      expect(css).toContain(`${kebab(name)}: ${value};`);
    }
    const declared = css.match(/#[0-9a-fA-F]{6}\b/g) ?? [];
    expect(declared).toHaveLength(Object.keys(COLORS).length);
  });

  it('defines hex colors only in tokens.css and tokens.ts', () => {
    const files = sourceFiles(srcDir).filter((f) => !/[\\/]styles[\\/]tokens\.(css|ts)$/.test(f));
    expect(files.length).toBeGreaterThan(5);
    const offenders = files
      .filter((f) => /#[0-9a-fA-F]{3,8}\b/.test(readFileSync(f, 'utf8')))
      .map((f) => relative(srcDir, f));
    expect(offenders).toEqual([]);
  });
});
