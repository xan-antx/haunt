/**
 * Layout properties.
 *
 * jsdom has no layout engine, so these tests check what can be checked without one:
 * runtime behaviour (timing, DOM) and the CSS rules parsed from the real stylesheets,
 * from which rendered sizes are derived. The real-browser measurements (Chrome) are
 * done in the final integration verification (task 35).
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { OverflowingSummary } from '../../components/OverflowingSummary';
import { narrowViewportArbitrary } from '../generators';
import { renderAppAt } from '../helpers';

const RUN_TIMEOUT = 120_000;
const REM_PX = 16;

// Vitest stubs CSS imports, so read the real source files from disk.
function readSource(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
}
const bannerSvg = readSource('../../assets/banner.svg');
const lateBannerCss = readSource('../../components/LateBanner.module.css');
const summaryCss = readSource('../../components/OverflowingSummary.module.css');

afterEach(() => {
  vi.useRealTimers();
});

// ---- tiny CSS helpers (the stylesheets here are simple, flat rules) ----------------

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Body of the first `{ ... }` block that follows `header`, honouring nested braces. */
function blockAfter(css: string, header: string): string {
  const start = css.indexOf(header);
  if (start === -1) throw new Error(`"${header}" not found`);
  const open = css.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`Unbalanced braces after "${header}"`);
}

function declarations(block: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of block.split(';')) {
    const idx = part.indexOf(':');
    if (idx > 0) out[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  return out;
}

function toPx(value: string | undefined): number {
  if (!value) return NaN;
  if (value.endsWith('rem')) return parseFloat(value) * REM_PX;
  if (value.endsWith('px')) return parseFloat(value);
  return NaN;
}

/** Rules for `selector` inside the `@media (max-width: 640px)` block. */
function narrowRule(selector: string): Record<string, string> {
  const css = stripComments(summaryCss);
  const media = blockAfter(css, '@media (max-width: 640px)');
  return declarations(blockAfter(media, selector));
}

// ---- Property 13 -----------------------------------------------------------------

describe('Layout properties', () => {
  /**
   * Feature: lantern-bills, Property 13: Layout Shift Magnitude
   * Validates: Requirements 7.4
   */
  it('Feature: lantern-bills, Property 13: Layout Shift Magnitude', async () => {
    const css = stripComments(lateBannerCss);
    // One rule styles the banner before and after load; there is no separate "loaded" size.
    expect(css).not.toMatch(/\.loaded/);
    const box = declarations(blockAfter(css, '.banner'));

    // Space is reserved before the image loads.
    expect(box['aspect-ratio']).toMatch(/^4\s*\/\s*1$/);
    expect(box).toHaveProperty('min-height');

    // Intrinsic aspect ratio of the banner asset matches the reserved ratio.
    const svgWidth = Number(/<svg[^>]*\swidth="(\d+)"/.exec(bannerSvg)?.[1]);
    const svgHeight = Number(/<svg[^>]*\sheight="(\d+)"/.exec(bannerSvg)?.[1]);
    expect(svgWidth).toBe(1200);
    expect(svgHeight).toBe(300);
    const minHeight = toPx(box['min-height']);

    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 320, max: 1920 }), async viewport => {
        // The box fills the container (width: 100%) up to the 800px page column minus padding.
        const containerWidth = Math.min(viewport - 32, 768);
        const reservedHeight = Math.max(minHeight, (containerWidth * 300) / 1200);
        // The loaded image has the same intrinsic ratio and object-fit: cover in the same box.
        const loadedHeight = Math.max(minHeight, (containerWidth * svgHeight) / svgWidth);
        // Nothing below the banner moves when the image arrives.
        expect(loadedHeight - reservedHeight).toBe(0);
        expect(reservedHeight).toBeGreaterThanOrEqual(100);

        vi.useFakeTimers();
        try {
          renderAppAt('/');
          const img = document.querySelector('img') as HTMLImageElement;
          expect(img).not.toHaveAttribute('src');
          // Size hints are there from the start, so the browser reserves the ratio.
          expect(img).toHaveAttribute('width', '1200');
          expect(img).toHaveAttribute('height', '300');
          // The offer text takes its space from the start (hidden, not removed).
          expect(screen.getByTestId('banner-offer').className).toContain('offerPending');
          const classBefore = img.className;
          expect(screen.queryByRole('link', { name: /autopay/i })).not.toBeInTheDocument();

          await act(async () => {
            await vi.advanceTimersByTimeAsync(1499);
          });
          expect(img).not.toHaveAttribute('src');

          await act(async () => {
            await vi.advanceTimersByTimeAsync(1);
          });
          expect(img).toHaveAttribute('src');
          expect(img.className).toBe(classBefore);
          expect(img).toHaveAttribute('width', '1200');
          expect(img).toHaveAttribute('height', '300');
          expect(screen.getByTestId('banner-offer').className).not.toContain('offerPending');
          // The Autopay link is absolutely positioned over the banner, so it adds no height.
          expect(screen.getByRole('link', { name: /autopay/i })).toBeInTheDocument();
        } finally {
          cleanup();
          vi.useRealTimers();
        }
      }),
      { numRuns: 100 }
    );
  }, RUN_TIMEOUT);

  /**
   * Feature: lantern-bills, Property 14: Content Clipping at Narrow Viewport
   * Validates: Requirements 8.2, 8.3
   */
  it('Feature: lantern-bills, Property 14: Content Clipping at Narrow Viewport', () => {
    const box = narrowRule('.summary');
    const text = narrowRule('.amount');

    fc.assert(
      fc.property(narrowViewportArbitrary(), viewport => {
        // The 640px breakpoint covers every generated width.
        expect(viewport).toBeLessThanOrEqual(640);

        // Box: no fixed pixel width, fits its container, never clips.
        expect(box.width).toBe('auto');
        expect(box['max-width']).toBe('100%');
        expect(box).not.toHaveProperty('overflow');
        expect(box['white-space']).not.toBe('nowrap');

        // Total: wraps, even in the middle of a long number, and never clips.
        expect(text['white-space']).toBe('normal');
        expect(text['overflow-wrap']).toBe('anywhere');
        expect(text).not.toHaveProperty('overflow');
        expect(text['font-size']).toBeDefined();
      }),
      { numRuns: 100 }
    );
  }, RUN_TIMEOUT);

  it('keeps the full amount in the DOM at narrow widths (clipped visually, not removed)', () => {
    render(<OverflowingSummary amount="₹2,490.00" />);
    expect(screen.getByTestId('summary-amount')).toHaveTextContent('₹2,490.00');
  });

  it('does not apply the fixed width above the breakpoint', () => {
    const css = stripComments(summaryCss);
    const wide = declarations(blockAfter(blockAfter(css, '@media (min-width: 641px)'), '.summary'));
    expect(wide.width).toBe('auto');
  });
});
