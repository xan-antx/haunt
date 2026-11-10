import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CALLOUT_MARGIN, NARROW_VIEWPORT, placeCallout, type Box } from '../model/tour';

const M = CALLOUT_MARGIN;

const intersects = (a: Box, b: Box) =>
  a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;

const caseArb = fc
  .record({ width: fc.integer({ min: 320, max: 2560 }), height: fc.integer({ min: 320, max: 1600 }) })
  .chain((viewport) =>
    fc.record({
      viewport: fc.constant(viewport),
      // Any callout that fits inside the viewport with the margin.
      size: fc.record({
        width: fc.integer({ min: 0, max: viewport.width - 2 * M }),
        height: fc.integer({ min: 0, max: viewport.height - 2 * M }),
      }),
      // Targets may be partly or fully off screen.
      target: fc.option(
        fc.record({
          top: fc.integer({ min: -viewport.height, max: 2 * viewport.height }),
          left: fc.integer({ min: -viewport.width, max: 2 * viewport.width }),
          width: fc.integer({ min: 1, max: 2 * viewport.width }),
          height: fc.integer({ min: 1, max: 2 * viewport.height }),
        }),
        { nil: null },
      ),
    }),
  );

describe('Feature: haunt-dashboard, Property 15: The tour callout stays inside the viewport and off its target', () => {
  it('stays inside the margin, never covers the target beside it, and uses the far edge when narrow', () => {
    fc.assert(
      fc.property(caseArb, ({ viewport, size, target }) => {
        const place = placeCallout(target, size, viewport);
        const box: Box = { top: place.top, left: place.left, width: size.width, height: size.height };

        expect(box.top).toBeGreaterThanOrEqual(M);
        expect(box.left).toBeGreaterThanOrEqual(M);
        expect(box.top + box.height).toBeLessThanOrEqual(viewport.height - M);
        expect(box.left + box.width).toBeLessThanOrEqual(viewport.width - M);

        if (target && ['below', 'above', 'right', 'left'].includes(place.side)) {
          expect(intersects(box, target)).toBe(false);
        }

        if (viewport.width < NARROW_VIEWPORT) {
          expect(place.side).toBe('edge');
          const centre = box.top + box.height / 2;
          const targetCentre = target ? target.top + target.height / 2 : viewport.height;
          // The callout's centre is on the other half of the viewport from the target's centre.
          if (targetCentre < viewport.height / 2) expect(centre).toBeGreaterThanOrEqual(viewport.height / 2);
          else expect(centre).toBeLessThanOrEqual(viewport.height / 2);
        } else if (!target) {
          expect(place.side).toBe('center');
        }
      }),
      { numRuns: 500 },
    );
  });
});
