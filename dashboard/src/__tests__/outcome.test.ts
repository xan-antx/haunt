import { describe, expect, it } from 'vitest';
import type { Finding, FindingType, Run, RunResult, Step } from '../data/types';
import { recentRuns } from '../model/haunts';
import { outcomeLine } from '../model/outcome';
import { bebeRun, listenerRun } from './fixtures/samples';

const makeStep = (n: number): Step => ({
  n,
  page: '/',
  action: 'Tab',
  spoken: '',
  thought: '',
  screenshot: null,
  focusBox: null,
  waitMs: 0,
});

const makeFinding = (type: FindingType, step: number): Finding => ({
  type,
  step,
  title: '',
  evidence: '',
  screenshot: null,
});

function outcomeOf(result: RunResult, stepCount: number, findings: Finding[] = []): string {
  const steps = Array.from({ length: stepCount }, (_, i) => makeStep(i + 1));
  return outcomeLine({ result, steps, findings });
}

describe('outcomeLine', () => {
  it('gives the sample values', () => {
    expect(outcomeLine(listenerRun())).toBe('Trapped by a keyboard trap at step 9');
    expect(outcomeLine(bebeRun())).toBe('Made it through in 6 steps');
  });

  it('says no steps were recorded for an empty steps array, whatever the result', () => {
    for (const result of ['succeeded', 'gave_up', 'error'] as const) {
      expect(outcomeOf(result, 0, [makeFinding('focus_trap', 1)])).toBe('No steps were recorded');
    }
  });

  it('counts the steps of a succeeded run, singular for one step, ignoring findings', () => {
    expect(outcomeOf('succeeded', 6, [makeFinding('focus_trap', 6)])).toBe('Made it through in 6 steps');
    expect(outcomeOf('succeeded', 1)).toBe('Made it through in 1 step');
  });

  it('names the last step of an errored run, ignoring findings', () => {
    expect(outcomeOf('error', 3, [makeFinding('focus_trap', 3)])).toBe('Stopped by a technical error at step 3');
  });

  it('describes a focus_trap at the last step of a gave_up run', () => {
    expect(outcomeOf('gave_up', 9, [makeFinding('focus_trap', 9)])).toBe('Trapped by a keyboard trap at step 9');
  });

  it('uses the label as written for another finding type at the last step', () => {
    expect(outcomeOf('gave_up', 5, [makeFinding('cut_off_text', 5)])).toBe('Stuck at step 5: Text cut off');
  });

  it('says where a gave_up run stopped when no finding is at the last step', () => {
    expect(outcomeOf('gave_up', 4, [makeFinding('focus_trap', 2)])).toBe('Gave up at step 4');
  });

  it('uses the first finding in array order when several are at the last step', () => {
    const findings = [
      makeFinding('focus_trap', 1),
      makeFinding('misclick', 7),
      makeFinding('focus_trap', 7),
      makeFinding('dark_pattern', 7),
    ];
    expect(outcomeOf('gave_up', 7, findings)).toBe('Stuck at step 7: Clicked the wrong thing');
  });
});

describe('recentRuns', () => {
  function runAt(key: string, startedAt: string): Run {
    return { ...bebeRun(), key, startedAt };
  }

  const runs = [
    runAt('b', '2026-11-02T10:00:00Z'),
    runAt('d', '2026-11-04T10:00:00Z'),
    runAt('a', '2026-11-01T10:00:00Z'),
    runAt('c', '2026-11-03T10:00:00Z'),
  ];

  it('returns runs newest first by startedAt', () => {
    expect(recentRuns(runs, 10).map((r) => r.key)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('returns at most count runs', () => {
    expect(recentRuns(runs, 2).map((r) => r.key)).toEqual(['d', 'c']);
    expect(recentRuns(runs, 0)).toEqual([]);
  });

  it('does not mutate its input', () => {
    const before = runs.map((r) => r.key);
    recentRuns(runs, 3);
    expect(runs.map((r) => r.key)).toEqual(before);
  });
});
