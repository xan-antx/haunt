import { describe, expect, it, vi } from 'vitest';
import type { HauntConfig } from '../src/config/loadConfig.ts';
import { DetectorRunner } from '../src/core/detectors.ts';
import { Recorder } from '../src/core/recorder.ts';
import {
  ENGINE_ERROR_PREFIX,
  MAX_STEPS,
  OPENING_THOUGHT,
  runLoop,
  type RunLoopOptions,
  type RunLoopOutcome,
} from '../src/core/runLoop.ts';
import type {
  ActionResult,
  DetectedProblem,
  Decision,
  Detector,
  FindingType,
  GiveUpReason,
  Probe,
  RunState,
} from '../src/core/types.ts';
import type { Mission } from '../src/missions/loadMission.ts';

/**
 * Unit tests for the run loop, with a fake Body, Mind, Detectors, success check and stop rule.
 * No browser is started.
 * **Validates: Requirements 7.6, 11.1, 11.2, 11.3, 11.4, 11.5, 11.6**
 */

const URL_UNDER_TEST = 'http://127.0.0.1:5173/';

const mission: Mission = {
  id: 'pay-bill',
  site: 'lantern-bills',
  goal: 'Pay this month’s electricity bill',
  requirement: 'a requirement',
  successCheck: { text: 'The confirmation is visible', visible: '[data-haunt="payment-success"]' },
  intentions: [],
};

const config: HauntConfig = {
  allowedDomains: [],
  sites: { 'lantern-bills': { name: 'Lantern Bills demo', allowedTerms: [] } },
};

function actionResult(actionText: string): ActionResult {
  return {
    actionText,
    spoken: `spoken: ${actionText}`,
    focusBox: null,
    screenshot: Buffer.from('png'),
    trace: {
      pathBefore: '/',
      pathAfter: '/',
      keys: [],
      touchedKeys: [],
      actionEndedAt: 0,
      readyAt: 0,
      waits: [],
      announcements: [],
    },
  };
}

function problem(key: string, stepN: number, overrides: Partial<DetectedProblem> = {}): DetectedProblem {
  return { key, stepN, title: `title ${key}`, evidence: `evidence ${key}`, screenshot: 'step', ...overrides };
}

function detector(type: FindingType, observe: Detector['observe'], finish?: Detector['finish']): Detector {
  return finish ? { type, observe, finish } : { type, observe };
}

type Overrides = Partial<Omit<RunLoopOptions<string, string>, 'detectors'>> & {
  detectors?: Detector[];
};

/** Everything a test needs to look at after the run. */
interface Harness {
  outcome: RunLoopOutcome;
  recorder: Recorder;
  runner: DetectorRunner;
  calls: string[];
  open: ReturnType<typeof vi.fn<(url: string) => Promise<ActionResult>>>;
  perceive: ReturnType<typeof vi.fn<() => Promise<{ perception: string; probe: Probe }>>>;
  act: ReturnType<typeof vi.fn<(action: string) => Promise<ActionResult>>>;
  decide: ReturnType<typeof vi.fn<(perception: string) => Decision<string>>>;
  giveUpThought: ReturnType<typeof vi.fn<(reason: GiveUpReason) => string>>;
  checkSuccess: ReturnType<typeof vi.fn<() => Promise<boolean>>>;
  stopRule: ReturnType<typeof vi.fn<(state: RunState) => GiveUpReason | null>>;
}

async function run(
  overrides: Overrides | ((recorder: Recorder) => Overrides) = {},
): Promise<Harness> {
  const recorder = new Recorder({ width: 1280, height: 800, deviceScaleFactor: 1 });
  const extra = typeof overrides === 'function' ? overrides(recorder) : overrides;
  const calls: string[] = [];

  let perceived = 0;
  const open = vi.fn(async (url: string) => {
    calls.push(`open ${url}`);
    return actionResult(`Open ${url}`);
  });
  const perceive = vi.fn(async () => {
    perceived += 1;
    calls.push('perceive');
    return { perception: `view ${perceived}`, probe: { at: 1000 + perceived, itemKeys: { secret: `key-${perceived}` } } };
  });
  const act = vi.fn(async (action: string) => {
    calls.push(`act ${action}`);
    return actionResult(action);
  });
  const decide = vi.fn((perception: string): Decision<string> => ({
    kind: 'act',
    action: `do ${perception}`,
    thought: `thought after ${perception}`,
    intentionId: 'x',
  }));
  const giveUpThought = vi.fn((reason: GiveUpReason) => `I gave up (${reason}).`);
  const checkSuccess = vi.fn(async () => false);
  const stopRule = vi.fn((_state: RunState): GiveUpReason | null => null);

  const runner = new DetectorRunner({
    detectors: extra.detectors ?? [],
    page: { evaluate: async () => undefined } as never,
    cdp: { send: async () => ({}) } as never,
    config,
    site: config.sites['lantern-bills']!,
    recorder,
  });

  const options: RunLoopOptions<string, string> = {
    body: { open: extra.body?.open ?? open, perceive: extra.body?.perceive ?? perceive, act: extra.body?.act ?? act },
    mind: { decide: extra.mind?.decide ?? decide, giveUpThought: extra.mind?.giveUpThought ?? giveUpThought },
    stopRule: extra.stopRule ?? stopRule,
    detectors: runner,
    recorder,
    mission,
    url: URL_UNDER_TEST,
    checkSuccess: extra.checkSuccess ?? checkSuccess,
    ...(extra.onOpenFailure ? { onOpenFailure: extra.onOpenFailure } : {}),
    ...(extra.maxSteps !== undefined ? { maxSteps: extra.maxSteps } : {}),
  };

  const outcome = await runLoop(options);
  return { outcome, recorder, runner, calls, open, perceive, act, decide, giveUpThought, checkSuccess, stopRule };
}

const lastThought = (h: Harness): string => h.recorder.last!.step.thought;

describe('Step 1', () => {
  it('is body.open(url), recorded before anything is perceived', async () => {
    const h = await run((r) => ({ checkSuccess: async () => r.steps.length >= 2 }));
    expect(h.open).toHaveBeenCalledTimes(1);
    expect(h.open).toHaveBeenCalledWith(URL_UNDER_TEST);
    expect(h.calls[0]).toBe(`open ${URL_UNDER_TEST}`);
    expect(h.recorder.steps[0]!.step.n).toBe(1);
    expect(h.recorder.steps[0]!.step.action).toBe(`Open ${URL_UNDER_TEST}`);
    expect(h.recorder.steps[0]!.step.thought).toBe(OPENING_THOUGHT);
  });

  it('records Chromium’s error page as Step 1 when open fails and onOpenFailure supplies it', async () => {
    const onOpenFailure = vi.fn(() => actionResult('Chromium error page'));
    const h = await run({
      body: {
        open: async () => {
          throw new Error('net::ERR_CONNECTION_REFUSED\n  at Page.goto (call log...)');
        },
        perceive: async () => {
          throw new Error('must not be called');
        },
        act: async () => {
          throw new Error('must not be called');
        },
      },
      onOpenFailure,
    });
    expect(onOpenFailure).toHaveBeenCalledTimes(1);
    expect(h.outcome).toEqual({ result: 'error', errorMessage: 'net::ERR_CONNECTION_REFUSED' });
    expect(h.recorder.steps).toHaveLength(1);
    expect(h.recorder.steps[0]!.step.action).toBe('Chromium error page');
    expect(h.recorder.steps[0]!.step.thought).toContain("I couldn't open the page.");
    expect(h.recorder.steps[0]!.step.thought).toContain(`${ENGINE_ERROR_PREFIX} net::ERR_CONNECTION_REFUSED`);
    expect(h.recorder.steps[0]!.step.thought).not.toContain('Page.goto');
  });

  it('records no Step when open fails and there is no onOpenFailure', async () => {
    const h = await run({
      body: {
        open: async () => {
          throw new Error('cannot open');
        },
        perceive: async () => ({ perception: 'x', probe: { at: 0 } }),
        act: async () => actionResult('x'),
      },
    });
    expect(h.outcome).toEqual({ result: 'error', errorMessage: 'cannot open' });
    expect(h.recorder.steps).toHaveLength(0);
  });

  it('records no Step when onOpenFailure returns null or throws', async () => {
    const failingOpen = async (): Promise<ActionResult> => {
      throw new Error('cannot open');
    };
    const body = {
      open: failingOpen,
      perceive: async () => ({ perception: 'x', probe: { at: 0 } }),
      act: async () => actionResult('x'),
    };
    const nullCase = await run({ body, onOpenFailure: () => null });
    expect(nullCase.outcome.result).toBe('error');
    expect(nullCase.recorder.steps).toHaveLength(0);

    const throwCase = await run({
      body,
      onOpenFailure: () => {
        throw new Error('no page');
      },
    });
    expect(throwCase.outcome).toEqual({ result: 'error', errorMessage: 'cannot open' });
    expect(throwCase.recorder.steps).toHaveLength(0);
  });
});

describe('success', () => {
  it('ends the Run with succeeded, even when the Step also has Findings', async () => {
    const h = await run((r) => ({
      detectors: [
        detector('unlabeled_button', async (ctx) => (ctx.current.step.n === 3 ? [problem('pay', 3)] : [])),
      ],
      checkSuccess: async () => r.steps.length === 3,
    }));
    expect(h.outcome).toEqual({ result: 'succeeded' });
    expect(h.recorder.steps).toHaveLength(3);
    expect(h.runner.findings).toHaveLength(1);
    expect(h.runner.findings[0]).toMatchObject({ type: 'unlabeled_button', stepN: 3 });
    // No give-up sentence, no error sentence.
    expect(h.giveUpThought).not.toHaveBeenCalled();
    expect(lastThought(h)).toBe('thought after view 2');
  });

  it('wins over the stop rule and the 60-Step limit', async () => {
    const stopRule = vi.fn(() => 'trapped' as const);
    const atOne = await run({ checkSuccess: async () => true, stopRule });
    expect(atOne.outcome).toEqual({ result: 'succeeded' });
    expect(stopRule).not.toHaveBeenCalled();

    const atLimit = await run((r) => ({ checkSuccess: async () => r.steps.length === MAX_STEPS }));
    expect(atLimit.outcome).toEqual({ result: 'succeeded' });
    expect(atLimit.recorder.steps).toHaveLength(MAX_STEPS);
  });

  it('runs the Detectors before the success check, on the Step just recorded', async () => {
    const order: string[] = [];
    const h = await run({
      detectors: [
        detector('focus_trap', async (ctx) => {
          order.push(`detect ${ctx.current.step.n}`);
          return [];
        }),
      ],
      checkSuccess: async () => {
        order.push('success');
        return true;
      },
    });
    expect(h.outcome.result).toBe('succeeded');
    expect(order).toEqual(['detect 1', 'success']);
  });
});

describe('stop rule', () => {
  it('ends the Run with gave_up and appends the Give_Up_Thought to the last Step’s thought', async () => {
    const h = await run((r) => ({
      stopRule: (_state) => (r.steps.length === 3 ? 'trapped' : null),
    }));
    expect(h.outcome).toEqual({ result: 'gave_up', reason: 'trapped' });
    expect(h.recorder.steps).toHaveLength(3);
    expect(lastThought(h)).toBe('thought after view 2 I gave up (trapped).');
    // Earlier Steps are untouched.
    expect(h.recorder.steps[1]!.step.thought).toBe('thought after view 1');
  });

  it('gives the Mind only the reason code', async () => {
    const h = await run((r) => ({ stopRule: () => (r.steps.length === 2 ? 'misclicks' : null) }));
    expect(h.giveUpThought.mock.calls).toEqual([['misclicks']]);
  });

  it('is asked after the Detectors, with the Steps, the Mission and the finding counts', async () => {
    const seen: RunState[] = [];
    const h = await run((r) => ({
      detectors: [
        detector('slow_wait', async (ctx) => (ctx.current.step.n === 2 ? [problem('wait', 2)] : [])),
        detector('misclick', async (ctx) =>
          ctx.current.step.n === 2 ? [problem('a', 2), problem('b', 2)] : [],
        ),
      ],
      stopRule: (state) => {
        seen.push(state);
        return r.steps.length === 3 ? 'slow_wait' : null;
      },
    }));
    expect(h.outcome).toEqual({ result: 'gave_up', reason: 'slow_wait' });
    expect(seen).toHaveLength(3);
    expect(seen[0]!.findingCounts).toEqual({});
    expect(seen[1]!.findingCounts).toEqual({ slow_wait: 1, misclick: 2 });
    expect(seen[2]!.findingCounts).toEqual({ slow_wait: 1, misclick: 2 });
    expect(seen[2]!.steps).toHaveLength(3);
    expect(seen[2]!.mission).toBe(mission);
  });

  it('takes priority over the Step limit on the 60th Step', async () => {
    const h = await run((r) => ({ stopRule: () => (r.steps.length === MAX_STEPS ? 'slow_wait' : null) }));
    expect(h.outcome).toEqual({ result: 'gave_up', reason: 'slow_wait' });
  });
});

describe('Step limit', () => {
  it('ends the Run on the 60th Step with gave_up / step_limit, and Step 61 never happens', async () => {
    const h = await run();
    expect(h.outcome).toEqual({ result: 'gave_up', reason: 'step_limit' });
    expect(h.recorder.steps).toHaveLength(60);
    expect(h.recorder.steps.map((s) => s.step.n)).toEqual(Array.from({ length: 60 }, (_, i) => i + 1));
    // Step 1 is the open; Steps 2 to 60 are 59 perceive/decide/act rounds. No 60th round.
    expect(h.perceive).toHaveBeenCalledTimes(59);
    expect(h.decide).toHaveBeenCalledTimes(59);
    expect(h.act).toHaveBeenCalledTimes(59);
    expect(h.giveUpThought.mock.calls).toEqual([['step_limit']]);
    expect(lastThought(h)).toBe('thought after view 59 I gave up (step_limit).');
  });

  it('still runs the Detectors after the 60th Step', async () => {
    const seenSteps: number[] = [];
    await run({
      detectors: [
        detector('focus_trap', async (ctx) => {
          seenSteps.push(ctx.current.step.n);
          return [];
        }),
      ],
    });
    expect(seenSteps).toHaveLength(60);
    expect(seenSteps[59]).toBe(60);
  });
});

describe('Mind gives up', () => {
  it('a no_match decision ends the Run with gave_up / no_match and the Give_Up_Thought', async () => {
    const decide = vi.fn(
      (perception: string): Decision<string> =>
        perception === 'view 2'
          ? { kind: 'give_up', reason: 'no_match', thought: 'Nothing here matches.' }
          : { kind: 'act', action: 'go', thought: 'going', intentionId: 'x' },
    );
    const h = await run({ mind: { decide, giveUpThought: (reason) => `I gave up (${reason}).` } });
    expect(h.outcome).toEqual({ result: 'gave_up', reason: 'no_match' });
    // open, one action, then the give-up decision: no third action.
    expect(h.recorder.steps).toHaveLength(2);
    expect(lastThought(h)).toBe('going I gave up (no_match).');
  });

  it('passes only the reason code to giveUpThought', async () => {
    const giveUpThought = vi.fn((_reason: GiveUpReason) => 'Nothing matched.');
    const h = await run({
      mind: {
        decide: () => ({ kind: 'give_up', reason: 'no_match', thought: 'x' }),
        giveUpThought,
      },
    });
    expect(h.outcome).toEqual({ result: 'gave_up', reason: 'no_match' });
    expect(giveUpThought.mock.calls).toEqual([['no_match']]);
    expect(lastThought(h)).toBe(`${OPENING_THOUGHT} Nothing matched.`);
  });
});

describe('errors', () => {
  it('a throwing body.act gives result error with the message in the last thought', async () => {
    let acts = 0;
    const h = await run({
      body: {
        open: async () => actionResult('open'),
        perceive: async () => ({ perception: 'p', probe: { at: 0 } }),
        act: async () => {
          acts += 1;
          if (acts === 2) throw new Error('Target page, context or browser has been closed');
          return actionResult('act');
        },
      },
    });
    expect(h.outcome).toEqual({ result: 'error', errorMessage: 'Target page, context or browser has been closed' });
    // open + one successful act; the failing act records nothing.
    expect(h.recorder.steps).toHaveLength(2);
    expect(lastThought(h)).toBe(
      `thought after p ${ENGINE_ERROR_PREFIX} Target page, context or browser has been closed`,
    );
  });

  it('keeps only the first line of a multi-line error message', async () => {
    const h = await run({
      body: {
        open: async () => actionResult('open'),
        perceive: async () => ({ perception: 'p', probe: { at: 0 } }),
        act: async () => {
          throw new Error('Timeout 30000ms exceeded.\nCall log:\n  - waiting for locator');
        },
      },
    });
    expect(h.outcome).toEqual({ result: 'error', errorMessage: 'Timeout 30000ms exceeded.' });
    expect(lastThought(h)).toBe(`${OPENING_THOUGHT} ${ENGINE_ERROR_PREFIX} Timeout 30000ms exceeded.`);
    expect(lastThought(h)).not.toContain('Call log');
  });

  it('a throwing body.perceive gives result error', async () => {
    const h = await run({
      body: {
        open: async () => actionResult('open'),
        perceive: async () => {
          throw new Error('perceive broke');
        },
        act: async () => actionResult('act'),
      },
    });
    expect(h.outcome).toEqual({ result: 'error', errorMessage: 'perceive broke' });
    expect(lastThought(h)).toContain('perceive broke');
  });

  it('a throwing Mind gives result error', async () => {
    const h = await run({
      mind: {
        decide: () => {
          throw new Error('mind exploded');
        },
        giveUpThought: () => 'unused',
      },
    });
    expect(h.outcome).toEqual({ result: 'error', errorMessage: 'mind exploded' });
    expect(h.recorder.steps).toHaveLength(1);
    expect(lastThought(h)).toBe(`${OPENING_THOUGHT} ${ENGINE_ERROR_PREFIX} mind exploded`);
  });

  it('a throwing checkSuccess gives result error', async () => {
    const h = await run({
      checkSuccess: async () => {
        throw new Error('locator failed');
      },
    });
    expect(h.outcome).toEqual({ result: 'error', errorMessage: 'locator failed' });
    expect(lastThought(h)).toContain('locator failed');
  });

  it('a throwing stop rule gives result error', async () => {
    const h = await run({
      stopRule: () => {
        throw new Error('rule failed');
      },
    });
    expect(h.outcome).toEqual({ result: 'error', errorMessage: 'rule failed' });
  });

  it('a Detector that throws gives result error, and the error names the Detector', async () => {
    const h = await run({
      detectors: [
        detector('focus_trap', async (ctx) => {
          if (ctx.current.step.n === 2) throw new Error('kaboom');
          return [];
        }),
      ],
    });
    expect(h.outcome.result).toBe('error');
    expect(h.outcome.errorMessage).toBe('focus_trap failed: kaboom');
    expect(h.recorder.steps).toHaveLength(2);
    expect(lastThought(h)).toBe(`thought after view 1 ${ENGINE_ERROR_PREFIX} focus_trap failed: kaboom`);
  });

  it('a Detector reporting a stepN that is not recorded gives result error and no Finding', async () => {
    const h = await run({
      detectors: [detector('misclick', async () => [problem('ghost-step', 2), problem('also-bad', 99)])],
    });
    expect(h.outcome.result).toBe('error');
    expect(h.outcome.errorMessage).toMatch(/^misclick failed: .*Step 2/);
    expect(h.runner.findings).toHaveLength(0);
    expect(h.recorder.steps).toHaveLength(1);
  });

  it.each([0, -1, 1.5, Number.NaN])('rejects the invalid stepN %s', async (stepN) => {
    const h = await run({ detectors: [detector('misclick', async () => [problem('bad', stepN)])] });
    expect(h.outcome.result).toBe('error');
    expect(h.runner.findings).toHaveLength(0);
  });

  it('a Detector whose finish throws gives result error, and the give-up sentence is not added', async () => {
    const h = await run((r) => ({
      detectors: [
        detector(
          'cut_off_text',
          async () => [],
          async () => {
            throw new Error('end check failed');
          },
        ),
      ],
      stopRule: () => (r.steps.length === 2 ? 'trapped' : null),
    }));
    expect(h.outcome).toEqual({ result: 'error', errorMessage: 'cut_off_text failed: end check failed' });
    expect(h.giveUpThought).not.toHaveBeenCalled();
  });

  it('does not run finish() after an error', async () => {
    const finish = vi.fn(async () => []);
    await run({
      detectors: [detector('focus_trap', async () => [], finish)],
      mind: {
        decide: () => {
          throw new Error('x');
        },
        giveUpThought: () => '',
      },
    });
    expect(finish).not.toHaveBeenCalled();
  });

  it('runs finish() once when the Run ends normally, and records its Findings', async () => {
    const finish = vi.fn(async () => [problem('late', 1)]);
    const h = await run({
      detectors: [detector('cut_off_text', async () => [], finish)],
      checkSuccess: async () => true,
    });
    expect(h.outcome).toEqual({ result: 'succeeded' });
    expect(finish).toHaveBeenCalledTimes(1);
    expect(h.runner.findings).toHaveLength(1);
    expect(h.runner.findings[0]).toMatchObject({ type: 'cut_off_text', stepN: 1 });
  });

  it('an error in giveUpThought gives result error', async () => {
    const h = await run((r) => ({
      stopRule: () => (r.steps.length === 2 ? 'trapped' : null),
      mind: {
        decide: () => ({ kind: 'act', action: 'a', thought: 't', intentionId: 'x' }),
        giveUpThought: () => {
          throw new Error('no memory');
        },
      },
    }));
    expect(h.outcome).toEqual({ result: 'error', errorMessage: 'no memory' });
  });
});

describe('Detector de-duplication in the loop', () => {
  it('records a problem with the same type and key once, however many Steps report it', async () => {
    const h = await run((r) => ({
      detectors: [detector('unannounced_error', async (ctx) => [problem('card-error', ctx.current.step.n)])],
      checkSuccess: async () => r.steps.length === 5,
    }));
    expect(h.outcome).toEqual({ result: 'succeeded' });
    expect(h.runner.findings).toHaveLength(1);
    // The first report wins.
    expect(h.runner.findings[0]!.stepN).toBe(1);
    expect(h.runner.findingCounts).toEqual({ unannounced_error: 1 });
  });
});

describe('the Mind’s input', () => {
  it('decide receives exactly the Perception, never the Probe', async () => {
    const h = await run((r) => ({ checkSuccess: async () => r.steps.length === 4 }));
    expect(h.decide).toHaveBeenCalledTimes(3);
    h.decide.mock.calls.forEach((args, i) => {
      expect(args).toEqual([`view ${i + 1}`]);
      expect(args).toHaveLength(1);
      expect(JSON.stringify(args)).not.toContain('secret');
      expect(JSON.stringify(args)).not.toContain('itemKeys');
    });
  });

  it('keeps the Probe with the recorded Step for the Detectors', async () => {
    const h = await run((r) => ({ checkSuccess: async () => r.steps.length === 3 }));
    expect(h.recorder.steps[1]!.probe).toEqual({ at: 1001, itemKeys: { secret: 'key-1' } });
    expect(h.recorder.steps[2]!.probe).toEqual({ at: 1002, itemKeys: { secret: 'key-2' } });
    // Step 1 has no Perception, so its Probe falls back to the ready time.
    expect(h.recorder.steps[0]!.probe).toEqual({ at: 0 });
  });

  it('acts on the decision it got, in the order open, perceive, act', async () => {
    const h = await run((r) => ({ checkSuccess: async () => r.steps.length === 3 }));
    expect(h.calls).toEqual([
      `open ${URL_UNDER_TEST}`,
      'perceive',
      'act do view 1',
      'perceive',
      'act do view 2',
    ]);
  });
});
