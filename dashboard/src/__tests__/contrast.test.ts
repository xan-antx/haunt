/// <reference types="node" />
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { COLORS, COLOR_PAIRS, THRESHOLDS, contrastRatio } from '../styles/tokens';

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

  it('keeps failure red out of text', () => {
    expect(contrastRatio(COLORS.failure, COLORS.bg)).toBeLessThan(4.5);
    expect(COLOR_PAIRS.some((p) => p.fg === 'failure' && p.kind === 'text')).toBe(false);
  });

  it('mirrors tokens.css exactly', () => {
    const css = readFileSync(join(srcDir, 'styles', 'tokens.css'), 'utf8');
    const kebab = (name: string) => `--${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
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
