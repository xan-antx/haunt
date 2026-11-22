import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Recorder } from '../src/core/recorder.ts';
import { runLoop } from '../src/core/runLoop.ts';
import type { Decision, GiveUpReason, Mind, RunState } from '../src/core/types.ts';
import type { Heard } from '../src/ghosts/listener/ax.ts';
import type { ListenerAction } from '../src/ghosts/listener/body.ts';
import { FakeBody, FakeDetectors, makeDriver, mission } from './helpers/aiFakes.ts';

/**
 * Feature: listener-ai-mind, Property 8: The AI driver and `runLoop` share one pipeline
 * **Validates: Requirements 4.2**
 */
const RUNS = { numRuns: 100 };

const step = fc.option(fc.integer({ min: 1, max: 8 }), { nil: undefined });

const script = fc.record({
  failAt: step,
  successAtCall: step,
  stopAtSteps: step,
  stopReason: fc.constantFrom<GiveUpReason>('trapped', 'slow_wait', 'misclicks'),
  maxSteps: fc.integer({ min: 1, max: 8 }),
});

const TAB: ListenerAction = { type: 'key', key: 'Tab' };

describe('Feature: listener-ai-mind, Property 8: The AI driver and runLoop share one pipeline', () => {
  it('ends with the same outcome and the same number of steps for the same script', async () => {
    await fc.assert(
      fc.asyncProperty(script, async (s) => {
        // runLoop with a Mind that presses Tab forever.
        const loopRecorder = new Recorder({ width: 100, height: 100, deviceScaleFactor: 1 });
        let loopSuccessCalls = 0;
        const mind: Mind<Heard, ListenerAction> = {
          decide: (): Decision<ListenerAction> => ({ kind: 'act', action: TAB, thought: 'I press Tab.', intentionId: 'x' }),
          giveUpThought: () => 'I give up.',
        };
        const expected = await runLoop({
          body: new FakeBody(),
          mind,
          detectors: new FakeDetectors(s.failAt === undefined ? {} : { failAt: s.failAt }),
          recorder: loopRecorder,
          mission,
          url: 'http://127.0.0.1:5173/',
          maxSteps: s.maxSteps,
          stopRule: (state: RunState) => (s.stopAtSteps !== undefined && state.steps.length >= s.stopAtSteps ? s.stopReason : null),
          checkSuccess: async () => {
            loopSuccessCalls += 1;
            return s.successAtCall !== undefined && loopSuccessCalls >= s.successAtCall;
          },
        });

        // The AI driver with an agent that presses Tab until the run ends.
        const { driver, recorder } = makeDriver({
          detectors: new FakeDetectors(s.failAt === undefined ? {} : { failAt: s.failAt }),
          ...(s.successAtCall === undefined ? {} : { successAtCall: s.successAtCall }),
          ...(s.stopAtSteps === undefined ? {} : { stopAtSteps: s.stopAtSteps }),
          stopReason: s.stopReason,
          maxSteps: s.maxSteps,
        });
        await driver.start();
        for (let i = 0; i < 20 && driver.outcome === null; i++) await driver.handle({ name: 'press_key', key: 'Tab' });

        expect(driver.outcome).not.toBeNull();
        expect(driver.outcome?.result).toBe(expected.result);
        expect(driver.outcome?.reason).toBe(expected.reason);
        expect(driver.outcome?.errorMessage).toBe(expected.errorMessage);
        expect(recorder.steps.length).toBe(loopRecorder.steps.length);
      }),
      RUNS,
    );
  });
});
