import { describe, expect, it, vi } from 'vitest';
import { Recorder } from '../src/core/recorder.ts';
import type { RunLoopDetectors } from '../src/core/runLoop.ts';
import { ENGINE_ERROR_PREFIX, afterStep, closeRun, type StepPipelineOptions } from '../src/core/stepPipeline.ts';
import type { ActionResult, GiveUpReason, RunState } from '../src/core/types.ts';
import type { Mission } from '../src/missions/loadMission.ts';

/**
 * Unit tests for the step pipeline shared by `runLoop` and the AI run driver.
 * **Validates: Requirements 4.2, 4.7**
 */

const mission: Mission = {
  id: 'pay-bill',
  site: 'lantern-bills',
  goal: 'Pay the bill',
  requirement: 'a requirement',
  successCheck: { text: 'Confirmation is visible', visible: '[data-haunt="payment-success"]' },
  intentions: [],
};

function actionResult(actionText: string): ActionResult {
  return {
    actionText,
    spoken: actionText,
    focusBox: null,
    screenshot: Buffer.from('png'),
    trace: { pathBefore: '/', pathAfter: '/', keys: [], touchedKeys: [], actionEndedAt: 0, readyAt: 0, waits: [], announcements: [] },
  };
}

interface Harness {
  options: StepPipelineOptions;
  calls: string[];
  recorder: Recorder;
  finish: ReturnType<typeof vi.fn<() => Promise<null | { thought: string }>>>;
}

function harness(
  overrides: {
    observe?: () => Promise<{ thought: string } | null>;
    success?: boolean;
    stop?: GiveUpReason | null;
    maxSteps?: number;
    steps?: number;
    finish?: () => Promise<{ thought: string } | null>;
  } = {},
): Harness {
  const recorder = new Recorder({ width: 100, height: 100, deviceScaleFactor: 1 });
  for (let i = 0; i < (overrides.steps ?? 1); i++) recorder.add(actionResult(`step ${i + 1}`), `thought ${i + 1}`);
  const calls: string[] = [];
  const finish = vi.fn(async () => {
    calls.push('finish');
    return (await overrides.finish?.()) ?? null;
  }) as Harness['finish'];
  const detectors = {
    observe: async () => {
      calls.push('detectors');
      return (await overrides.observe?.()) ?? null;
    },
    finish,
    findingCounts: {},
  } as unknown as RunLoopDetectors;
  const options: StepPipelineOptions = {
    mission,
    detectors,
    recorder,
    stopRule: (_state: RunState) => {
      calls.push('stopRule');
      return overrides.stop ?? null;
    },
    checkSuccess: async () => {
      calls.push('success');
      return overrides.success ?? false;
    },
    ...(overrides.maxSteps === undefined ? {} : { maxSteps: overrides.maxSteps }),
  };
  return { options, calls, recorder, finish };
}

describe('afterStep', () => {
  it('runs the detectors, the success check and the stop rule in that order, then lets the run go on', async () => {
    const h = harness();
    expect(await afterStep(h.options)).toBeNull();
    expect(h.calls).toEqual(['detectors', 'success', 'stopRule']);
  });

  it('ends with error when a detector fails, before the success check', async () => {
    const h = harness({ observe: async () => ({ thought: 'detector broke' }), success: true });
    expect(await afterStep(h.options)).toEqual({ result: 'error', errorMessage: 'detector broke' });
    expect(h.calls).toEqual(['detectors']);
  });

  it('lets success win over the stop rule and the step limit', async () => {
    const h = harness({ success: true, stop: 'trapped', maxSteps: 1 });
    expect(await afterStep(h.options)).toEqual({ result: 'succeeded' });
    expect(h.calls).toEqual(['detectors', 'success']);
  });

  it('gives up with the stop rule reason before the step limit', async () => {
    const h = harness({ stop: 'trapped', maxSteps: 1 });
    expect(await afterStep(h.options)).toEqual({ result: 'gave_up', reason: 'trapped' });
  });

  it('gives up with step_limit once the limit is reached', async () => {
    const h = harness({ steps: 3, maxSteps: 3 });
    expect(await afterStep(h.options)).toEqual({ result: 'gave_up', reason: 'step_limit' });
  });

  it('throws when no step was recorded', async () => {
    const h = harness({ steps: 0 });
    await expect(afterStep(h.options)).rejects.toThrow('no Step was recorded');
  });
});

describe('closeRun', () => {
  it('runs the detectors finish() and appends the give-up sentence', async () => {
    const h = harness();
    const outcome = await closeRun(h.options, { result: 'gave_up', reason: 'no_match' }, (r) => `I gave up (${r}).`);
    expect(outcome).toEqual({ result: 'gave_up', reason: 'no_match' });
    expect(h.finish).toHaveBeenCalledTimes(1);
    expect(h.recorder.last?.step.thought).toBe('thought 1 I gave up (no_match).');
  });

  it('skips finish() when the outcome is an error and appends the engine error sentence', async () => {
    const h = harness();
    const outcome = await closeRun(h.options, { result: 'error', errorMessage: 'boom' }, () => 'unused');
    expect(outcome).toEqual({ result: 'error', errorMessage: 'boom' });
    expect(h.finish).not.toHaveBeenCalled();
    expect(h.recorder.last?.step.thought).toBe(`thought 1 ${ENGINE_ERROR_PREFIX} boom`);
  });

  it('turns a failing finish() into an error outcome', async () => {
    const h = harness({ finish: async () => ({ thought: 'finish failed' }) });
    const outcome = await closeRun(h.options, { result: 'succeeded' }, () => 'unused');
    expect(outcome).toEqual({ result: 'error', errorMessage: 'finish failed' });
  });

  it('leaves a succeeded run without a closing sentence', async () => {
    const h = harness();
    await closeRun(h.options, { result: 'succeeded' }, () => 'unused');
    expect(h.recorder.last?.step.thought).toBe('thought 1');
  });
});
