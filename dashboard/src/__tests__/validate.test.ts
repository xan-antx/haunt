import { describe, expect, it } from 'vitest';
import { validateRun } from '../data/validate';
import { BEBE_META, LISTENER_META, bebeSample, listenerSample } from './fixtures/samples';
import * as derived from './fixtures/derived';
import type { LoadedRun } from '../data/types';

const meta = LISTENER_META;

function errorsOf(loaded: LoadedRun): string[] {
  return loaded.ok ? [] : loaded.errors.map((e) => `${e.path}: ${e.message}`);
}

describe('validateRun with the samples', () => {
  it('accepts the Listener sample with no warnings', () => {
    const loaded = validateRun(listenerSample(), LISTENER_META);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.run.warnings).toEqual([]);
    expect(loaded.run.steps).toHaveLength(9);
    expect(loaded.run.findings).toHaveLength(2);
    expect(loaded.run.key).toBe('2026-11-03-listener-pay-bill');
  });

  it('accepts the Bebe sample with only the zero-sized focusBox warning', () => {
    const loaded = validateRun(bebeSample(), BEBE_META);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.run.warnings).toHaveLength(1);
    expect(loaded.run.warnings[0]!.path).toBe('steps[1].focusBox');
    expect(loaded.run.steps[1]!.focusBox).toBeNull();
    expect(loaded.run.steps[0]!.focusBox).toEqual({ x: 80, y: 116, w: 280, h: 64 });
  });
});

describe('validateRun rejects values outside the contract', () => {
  it('rejects result "success" and names the allowed values', () => {
    const errors = errorsOf(validateRun(derived.resultSuccess(), meta));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('result');
    expect(errors[0]).toContain('"succeeded", "gave_up", "error"');
    expect(errors[0]).toContain('"success"');
  });

  it('rejects finding type "keyboard_trap" and names the allowed values', () => {
    const errors = errorsOf(validateRun(derived.typeKeyboardTrap(), meta));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^findings\[1\]\.type: /);
    expect(errors[0]).toContain('"focus_trap"');
    expect(errors[0]).toContain('"dark_pattern"');
  });

  it('rejects ghost "poltergeist" and names the allowed values', () => {
    const errors = errorsOf(validateRun(derived.ghostPoltergeist(), meta));
    expect(errors).toEqual(['ghost: expected one of "listener", "phantom", "bebe", got "poltergeist"']);
  });
});

describe('validateRun error rows', () => {
  it.each([
    ['formatVersion', derived.wrongFormatVersion, 'formatVersion: expected 1, got 2'],
    ['runId', derived.missingRunId, 'runId: expected text, got nothing'],
    ['waitMs', derived.waitMsAsText, 'steps[3].waitMs: expected a number, got "fast"'],
    ['mission.goal', derived.missingMissionGoal, 'mission.goal: expected text, got nothing'],
  ])('reports a wrong or missing %s', (_name, make, message) => {
    expect(errorsOf(validateRun(make(), meta))).toEqual([message]);
  });

  it('rejects an unparseable startedAt', () => {
    const errors = errorsOf(validateRun(derived.badStartedAt(), meta));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/^startedAt: expected an ISO 8601 time/);
  });

  it('rejects duplicate step numbers', () => {
    const errors = errorsOf(validateRun(derived.duplicateStepNumber(), meta));
    expect(errors).toEqual(['steps[2].n: step number 2 is used twice (also at steps[1])']);
  });

  it.each([null, 42, 'text', [], undefined])('rejects a non-object file (%s)', (input) => {
    const loaded = validateRun(input, meta);
    expect(loaded.ok).toBe(false);
    expect(errorsOf(loaded)[0]).toMatch(/^\(file\): expected a run object/);
  });
});

describe('validateRun warning rows', () => {
  it('keeps a finding that points to a missing step and warns', () => {
    const loaded = validateRun(derived.findingMissingStep(), meta);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.run.findings).toHaveLength(2);
    expect(loaded.run.warnings).toEqual([
      { path: 'findings[0].step', message: 'points to step 42, which is not in this run' },
    ]);
  });

  it('treats unsafe screenshot paths as missing and warns for each', () => {
    const loaded = validateRun(derived.unsafeScreenshots(), meta);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.run.steps.slice(0, 4).map((s) => s.screenshot)).toEqual([null, null, null, null]);
    expect(loaded.run.steps[4]!.screenshot).toBe('shots/005.png');
    expect(loaded.run.warnings.map((w) => w.path)).toEqual([
      'steps[0].screenshot',
      'steps[1].screenshot',
      'steps[2].screenshot',
      'steps[3].screenshot',
    ]);
  });

  it('accepts every contract result value without warnings', () => {
    for (const result of ['succeeded', 'gave_up', 'error']) {
      const json = listenerSample();
      json.result = result;
      const loaded = validateRun(json, meta);
      expect(loaded.ok).toBe(true);
      if (loaded.ok) expect(loaded.run.warnings).toEqual([]);
    }
  });
});
