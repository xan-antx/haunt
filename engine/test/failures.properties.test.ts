import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ENGINE_ERROR_PREFIX } from '../src/core/stepPipeline.ts';
import { FakeBody, makeDriver } from './helpers/aiFakes.ts';

/**
 * Feature: listener-ai-mind, Property 4: Browser failures surface and end the run
 * **Validates: Requirements 1.9**
 */
const RUNS = { numRuns: 100 };

const line = fc.stringMatching(/^[a-z][a-z ]{0,20}[a-z]$/);
const message = fc
  .record({
    blanks: fc.array(fc.constantFrom('', ' ', '\t'), { maxLength: 3 }),
    first: line,
    rest: fc.array(line, { maxLength: 3 }),
  })
  .map(({ blanks, first, rest }) => ({
    raw: [...blanks, first, ...rest].join('\n'),
    first,
  }));

describe('Feature: listener-ai-mind, Property 4: Browser failures surface and end the run', () => {
  it.each([
    ['perceive', { name: 'read_page' } as const],
    ['act', { name: 'press_key', key: 'Tab' } as const],
  ])('a failure in %s gives a tool error with the first line and an error outcome', async (where, call) => {
    await fc.assert(
      fc.asyncProperty(message, async ({ raw, first }) => {
        const failing = () => new Error(raw);
        const body = new FakeBody(where === 'perceive' ? { perceiveError: failing } : { actError: failing });
        const { driver, recorder } = makeDriver({ body });
        await driver.start();

        // For `act`, the implicit perceive works; for `read_page`, perceive fails right away.
        const result = await driver.handle(call);
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.error).toContain(first);

        expect(driver.outcome).toEqual({ result: 'error', errorMessage: first });
        expect(recorder.last?.step.thought).toContain(`${ENGINE_ERROR_PREFIX} ${first}`);

        // Anything after the end is refused.
        const later = await driver.handle({ name: 'read_page' });
        expect(later.ok).toBe(false);
      }),
      RUNS,
    );
  });
});
