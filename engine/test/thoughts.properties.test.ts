import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { makeDriver } from './helpers/aiFakes.ts';

/**
 * Feature: listener-ai-mind, Property 9: Thoughts come from `think` or the fallback
 * **Validates: Requirements 4.5, 4.6**
 */
const RUNS = { numRuns: 100 };

const thinkText = fc
  .record({ pad: fc.constantFrom('', ' ', '  '), body: fc.stringMatching(/^[a-z][a-z ]{0,30}[a-z]$/) })
  .map(({ pad, body }) => ({ sent: `${pad}${body}${pad}`, trimmed: body }));

/** For each action step, the think calls made before it. */
const steps = fc.array(fc.array(thinkText, { maxLength: 3 }), { minLength: 1, maxLength: 12 });

describe('Feature: listener-ai-mind, Property 9: Thoughts come from think or the fallback', () => {
  it('records the last think text before a step, or a non-empty fallback', async () => {
    await fc.assert(
      fc.asyncProperty(steps, async (perStep) => {
        const { driver, recorder } = makeDriver();
        await driver.start();

        for (const thoughts of perStep) {
          for (const t of thoughts) expect((await driver.handle({ name: 'think', text: t.trimmed })).ok).toBe(true);
          expect((await driver.handle({ name: 'press_key', key: 'Tab' })).ok).toBe(true);
        }

        const recorded = recorder.steps.slice(1).map((r) => r.step.thought);
        expect(recorded).toHaveLength(perStep.length);
        recorded.forEach((thought, i) => {
          const thoughts = perStep[i]!;
          if (thoughts.length === 0) {
            expect(thought.trim()).not.toBe('');
            expect(thought).toBe('I press Tab and listen.');
          } else {
            expect(thought).toBe(thoughts[thoughts.length - 1]!.trimmed);
          }
        });
      }),
      RUNS,
    );
  });

  it('never changes the thought of an earlier step when a later think call arrives', async () => {
    await fc.assert(
      fc.asyncProperty(steps, thinkText, async (perStep, later) => {
        const { driver, recorder } = makeDriver();
        await driver.start();
        for (const thoughts of perStep) {
          for (const t of thoughts) await driver.handle({ name: 'think', text: t.trimmed });
          await driver.handle({ name: 'press_key', key: 'Tab' });
          const before = recorder.steps.map((r) => r.step.thought);
          await driver.handle({ name: 'think', text: later.trimmed });
          expect(recorder.steps.map((r) => r.step.thought)).toEqual(before);
          // Use up the trailing think so the next step starts clean.
          await driver.handle({ name: 'think', text: later.trimmed });
        }
      }),
      RUNS,
    );
  });
});
