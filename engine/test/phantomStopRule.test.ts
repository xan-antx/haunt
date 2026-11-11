import { describe, expect, it } from 'vitest';
import type { HauntConfig } from '../src/config/loadConfig.ts';
import { DetectorRunner } from '../src/core/detectors.ts';
import { Recorder } from '../src/core/recorder.ts';
import { runLoop } from '../src/core/runLoop.ts';
import type { ActionResult, Decision, Probe, RecordedStep, RunState, StepTrace } from '../src/core/types.ts';
import { createMisclickDetector } from '../src/detectors/misclick.ts';
import { createSlowWaitDetector } from '../src/detectors/slowWait.ts';
import { misclickStreak, phantomGhost, phantomStopRule } from '../src/ghosts/phantom/index.ts';
import type { Mission } from '../src/missions/loadMission.ts';

/**
 * The Phantom's stop rules and the Misclick_Streak, with fake histories. No browser is started.
 * **Validates: Requirements 16.1, 16.2, 16.3, 16.4**
 */

const mission: Mission = {
  id: 'pay-bill',
  site: 'lantern-bills',
  goal: 'Pay this month’s electricity bill',
  requirement: 'a requirement',
  successCheck: { text: 'The confirmation is visible', visible: '[data-haunt="payment-success"]' },
  intentions: [],
};

/** What one fake Step was. */
type Kind = 'open' | 'correct' | 'misclick' | 'recovery' | 'recovery-miss' | 'unmeasured' | 'wait';

function trace(click?: { aimedKey: string; hitKey: string | null }): StepTrace {
  const t: StepTrace = {
    pathBefore: '/',
    pathAfter: '/',
    keys: [],
    touchedKeys: [],
    actionEndedAt: 0,
    readyAt: 0,
    waits: [],
    announcements: [],
  };
  if (click) {
    t.click = { aimed: { x: 16, y: 170, w: 132, h: 48 }, point: { x: 82, y: 194 }, hitKey: click.hitKey, at: 2000, aimedItem: 's1' };
  }
  return t;
}

function clickOf(kind: Kind): { aimedKey: string; hitKey: string | null } | undefined {
  switch (kind) {
    case 'correct':
    case 'recovery':
      return { aimedKey: 'k1', hitKey: 'k1' };
    case 'misclick':
    case 'recovery-miss':
      return { aimedKey: 'k1', hitKey: 'k2' };
    case 'unmeasured':
      return { aimedKey: 'k1', hitKey: null };
    default:
      return undefined;
  }
}

/** A recorded Step of the given kind for Intention `intentionId`. */
function fakeStep(n: number, kind: Kind, intentionId = 'pay'): RecordedStep {
  const click = clickOf(kind);
  const probe: Probe = click ? { at: 1000, itemKeys: { s1: click.aimedKey } } : { at: 1000 };
  const recorded: RecordedStep = {
    step: { n, page: '/', action: kind, spoken: '', thought: '', screenshot: `shots/${String(n).padStart(3, '0')}.png`, waitMs: 0 },
    trace: trace(click),
    probe,
  };
  if (kind !== 'open') recorded.intention = { intentionId, recovery: kind.startsWith('recovery') };
  return recorded;
}

/** Builds a history: Step 1 opens the page, then one Step per entry. */
function history(...entries: (Kind | [Kind, string])[]): RecordedStep[] {
  const steps = [fakeStep(1, 'open')];
  entries.forEach((e, i) => {
    const [kind, id] = typeof e === 'string' ? [e, 'pay'] : e;
    steps.push(fakeStep(i + 2, kind, id));
  });
  return steps;
}

const state = (steps: RecordedStep[], findingCounts: RunState['findingCounts'] = {}): RunState => ({
  steps,
  findingCounts,
  mission,
});

describe('misclickStreak', () => {
  it('is 0 before any decision', () => {
    expect(misclickStreak([])).toBe(0);
    expect(misclickStreak(history())).toBe(0);
  });

  it('counts misclicks in a row on the same Intention', () => {
    expect(misclickStreak(history('misclick'))).toBe(1);
    expect(misclickStreak(history('misclick', 'misclick'))).toBe(2);
  });

  it('does not reset on a recovery click, whether it hit or missed', () => {
    expect(misclickStreak(history('misclick', 'recovery'))).toBe(1);
    expect(misclickStreak(history('misclick', 'recovery', 'misclick'))).toBe(2);
    expect(misclickStreak(history('misclick', 'recovery-miss'))).toBe(1);
  });

  it('resets to 0 on a correct click on the target', () => {
    expect(misclickStreak(history('misclick', 'correct'))).toBe(0);
    expect(misclickStreak(history('misclick', 'correct', 'misclick'))).toBe(1);
  });

  it('ignores Steps that are not clicks and clicks that could not be measured', () => {
    expect(misclickStreak(history('misclick', 'wait', 'unmeasured', 'misclick'))).toBe(2);
  });

  it('only counts the current Intention', () => {
    expect(misclickStreak(history(['misclick', 'find'], ['misclick', 'pay']))).toBe(1);
    expect(misclickStreak(history(['misclick', 'find'], ['correct', 'pay'], ['misclick', 'pay']))).toBe(1);
  });
});

describe('phantomStopRule', () => {
  it('returns slow_wait as soon as a slow_wait Finding exists', () => {
    expect(phantomStopRule(state(history('wait'), { slow_wait: 1 }))).toBe('slow_wait');
    expect(phantomStopRule(state(history('misclick', 'misclick'), { slow_wait: 1, misclick: 2 }))).toBe('slow_wait');
  });

  it('returns misclicks when the Misclick_Streak reaches 2', () => {
    expect(phantomStopRule(state(history('misclick', 'recovery', 'misclick'), { misclick: 2 }))).toBe('misclicks');
  });

  it('returns null otherwise', () => {
    expect(phantomStopRule(state(history()))).toBeNull();
    expect(phantomStopRule(state(history('misclick', 'recovery'), { misclick: 1 }))).toBeNull();
    expect(phantomStopRule(state(history('misclick', 'correct', 'misclick'), { misclick: 2 }))).toBeNull();
    expect(phantomStopRule(state(history('wait'), { slow_wait: 0 }))).toBeNull();
  });

  it('is The Phantom’s stop rule, with the misclick and slow_wait Detectors', () => {
    expect(phantomGhost.stopRule).toBe(phantomStopRule);
    expect(phantomGhost.detectors().map((d) => d.type)).toEqual([
      createMisclickDetector().type,
      createSlowWaitDetector().type,
    ]);
  });
});

describe('the run loop with The Phantom’s stop rule', () => {
  const config: HauntConfig = {
    allowedDomains: [],
    sites: { 'lantern-bills': { name: 'Lantern Bills demo', allowedTerms: [] } },
  };

  /** Runs a scripted sequence of click outcomes; each decision acts on the next one. */
  async function runScript(script: ('correct' | 'misclick' | 'recovery')[]) {
    const recorder = new Recorder({ width: 360, height: 640, deviceScaleFactor: 2 });
    const runner = new DetectorRunner({
      detectors: [],
      page: { evaluate: async () => undefined } as never,
      cdp: { send: async () => ({}) } as never,
      config,
      site: config.sites['lantern-bills']!,
      recorder,
    });
    let i = 0;
    const result = (kind?: Kind): ActionResult => ({
      actionText: kind ?? 'open',
      spoken: '',
      focusBox: null,
      screenshot: Buffer.from('png'),
      trace: trace(kind ? clickOf(kind) : undefined),
    });
    const outcome = await runLoop<number, Kind>({
      body: {
        open: async () => result(),
        perceive: async () => ({ perception: i, probe: { at: 1000, itemKeys: { s1: 'k1' } } }),
        act: async (kind) => result(kind),
      },
      mind: {
        decide: (n): Decision<Kind> => {
          const kind = script[n];
          i = n + 1;
          if (kind === undefined) return { kind: 'give_up', reason: 'no_match', thought: 'none left' };
          return kind === 'recovery'
            ? { kind: 'act', action: kind, thought: kind, intentionId: 'pay', recovery: true }
            : { kind: 'act', action: kind, thought: kind, intentionId: 'pay' };
        },
        giveUpThought: (reason) => `I gave up (${reason}).`,
      },
      stopRule: phantomStopRule,
      detectors: runner,
      recorder,
      mission,
      url: 'http://127.0.0.1:3000/',
      checkSuccess: async () => false,
    });
    return { outcome, recorder };
  }

  it('records each Step’s Intention and ends the Run at the second misclick in a row', async () => {
    const { outcome, recorder } = await runScript(['misclick', 'recovery', 'misclick', 'correct']);
    expect(outcome).toEqual({ result: 'gave_up', reason: 'misclicks' });
    expect(recorder.steps).toHaveLength(4);
    expect(recorder.steps[0]!.intention).toBeUndefined();
    expect(recorder.steps[2]!.intention).toEqual({ intentionId: 'pay', recovery: true });
    expect(recorder.steps[3]!.intention).toEqual({ intentionId: 'pay', recovery: false });
    expect(recorder.last!.step.thought).toBe('misclick I gave up (misclicks).');
  });

  it('keeps going when a correct click comes between two misclicks', async () => {
    const { outcome, recorder } = await runScript(['misclick', 'correct', 'misclick']);
    expect(outcome).toEqual({ result: 'gave_up', reason: 'no_match' });
    expect(recorder.steps).toHaveLength(4);
  });
});
