// fast-check arbitraries for contract-shaped run JSON.

import fc from 'fast-check';
import { FINDING_TYPES, GHOST_IDS, RUN_RESULTS } from '../data/types';

const pageArb = fc.constantFrom('/', '/bill', '/autopay', '/confirm');
const textArb = fc.string({ maxLength: 40 });
const isoArb = fc
  .date({ min: new Date('2000-01-01T00:00:00Z'), max: new Date('2099-12-31T23:59:59Z'), noInvalidDate: true })
  .map((d) => d.toISOString());

const focusBoxArb = fc.record({
  x: fc.integer({ min: 0, max: 1280 }),
  y: fc.integer({ min: 0, max: 800 }),
  w: fc.integer({ min: 1, max: 600 }),
  h: fc.integer({ min: 1, max: 400 }),
});

function stepArb(n: number) {
  return fc
    .record(
      {
        page: pageArb,
        action: fc.constantFrom('Tab', 'Enter', 'Space', 'Click', 'Type'),
        spoken: textArb,
        thought: textArb,
        focusBox: focusBoxArb,
        waitMs: fc.integer({ min: 0, max: 30000 }),
      },
      { requiredKeys: ['page', 'action', 'spoken', 'thought', 'waitMs'] },
    )
    .map((s) => ({ n, ...s, screenshot: `shots/${String(n).padStart(3, '0')}.png` }));
}

/** Any run JSON that follows contract/run-format.md. */
export const contractRunArb = fc
  .integer({ min: 1, max: 12 })
  .chain((count) =>
    fc.record({
      steps: fc.tuple(...Array.from({ length: count }, (_, i) => stepArb(i + 1))),
      findings: fc.array(
        fc.record({
          type: fc.constantFrom(...FINDING_TYPES),
          step: fc.integer({ min: 1, max: count }),
          title: textArb,
          evidence: textArb,
          screenshot: fc.constant('shots/001.png'),
        }),
        { maxLength: 6 },
      ),
    }),
  )
  .chain(({ steps, findings }) =>
    fc.record({
      formatVersion: fc.constant(1),
      runId: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim() !== ''),
      ghost: fc.constantFrom(...GHOST_IDS),
      mission: fc.record({
        id: fc.constantFrom('pay-bill', 'set-up-autopay'),
        goal: textArb,
        requirement: textArb,
        successCheck: textArb,
      }),
      site: fc.record({
        name: fc.constantFrom('Lantern Bills demo', 'Other site'),
        url: fc.constantFrom('http://localhost:3000', 'http://localhost:4000/app'),
        commit: fc.string({ unit: fc.constantFrom(...'0123456789abcdef'), minLength: 7, maxLength: 7 }),
      }),
      startedAt: isoArb,
      result: fc.constantFrom(...RUN_RESULTS),
      steps: fc.constant(steps),
      findings: fc.constant(findings),
    }),
  );
