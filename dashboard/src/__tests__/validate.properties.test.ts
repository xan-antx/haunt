import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { validateRun } from '../data/validate';
import { FINDING_TYPES, GHOST_IDS, RUN_RESULTS } from '../data/types';
import { contractRunArb } from './arbitraries';
import { LISTENER_META, listenerSample } from './fixtures/samples';

const meta = LISTENER_META;

describe('Feature: haunt-dashboard, Property 1: validateRun never throws', () => {
  it('returns ok: true, or ok: false with at least one error, for any JSON value', () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const loaded = validateRun(value, meta);
        if (!loaded.ok) expect(loaded.errors.length).toBeGreaterThan(0);
      }),
      { numRuns: 300 },
    );
  });

  it('never throws for sample runs with random fields replaced', () => {
    const fields = ['formatVersion', 'runId', 'ghost', 'mission', 'site', 'startedAt', 'result', 'steps', 'findings'];
    fc.assert(
      fc.property(fc.constantFrom(...fields), fc.jsonValue(), (field, value) => {
        const json = listenerSample();
        json[field] = value;
        const loaded = validateRun(json, meta);
        expect(typeof loaded.ok).toBe('boolean');
        if (!loaded.ok) expect(loaded.errors.length).toBeGreaterThan(0);
      }),
      { numRuns: 300 },
    );
  });
});

describe('Feature: haunt-dashboard, Property 2: contract-shaped runs validate', () => {
  it('accepts every run that follows the contract', () => {
    fc.assert(
      fc.property(contractRunArb, (json) => {
        const loaded = validateRun(json, meta);
        if (!loaded.ok) throw new Error(JSON.stringify(loaded.errors));
        expect(loaded.run.warnings).toEqual([]);
      }),
      { numRuns: 200 },
    );
  });
});

describe('Feature: haunt-dashboard, Property 7: only exact contract values are accepted', () => {
  const cases = [
    { field: 'ghost', allowed: GHOST_IDS as readonly string[], extra: ['poltergeist', 'Listener', 'LISTENER', ' bebe'] },
    { field: 'result', allowed: RUN_RESULTS as readonly string[], extra: ['success', 'failed', 'gave-up', 'Succeeded'] },
    { field: 'type', allowed: FINDING_TYPES as readonly string[], extra: ['keyboard_trap', 'Focus_trap', 'focus-trap'] },
  ];

  for (const { field, allowed, extra } of cases) {
    it(`accepts ${field} exactly when it is a contract value`, () => {
      const valueArb = fc.oneof(fc.constantFrom(...allowed), fc.constantFrom(...extra), fc.string({ maxLength: 20 }));
      fc.assert(
        fc.property(contractRunArb, valueArb, (json, value) => {
          const run = json as Record<string, unknown>;
          if (field === 'type') {
            const findings = run.findings as Array<Record<string, unknown>>;
            if (findings.length === 0) findings.push({ type: 'misclick', step: 1, title: 't', evidence: 'e' });
            findings[0]!.type = value;
          } else {
            run[field] = value;
          }
          const loaded = validateRun(run, meta);
          expect(loaded.ok).toBe(allowed.includes(value));
        }),
        { numRuns: 200 },
      );
    });
  }
});
