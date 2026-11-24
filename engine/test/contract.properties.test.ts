import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { validateSchema } from '../src/contract/schema.ts';

const NINE = [
  'unlabeled_button',
  'focus_trap',
  'unannounced_error',
  'slow_wait',
  'misclick',
  'cut_off_text',
  'untranslated',
  'dark_pattern',
  'unlabeled_field',
];

function exampleRun(): any {
  const url = new URL('../../contract/example-run.json', import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), 'utf8'));
}

function withType(type: string): unknown {
  const run = exampleRun();
  run.findings[0].type = type;
  return run;
}

describe('Feature: memos-real-world-haunt, Property 11: The run schema accepts a finding type if and only if it is one of the nine', () => {
  it('accepts a generated type exactly when it is one of the nine', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string(), fc.constantFrom(...NINE)), (type) => {
        const problems = validateSchema(withType(type));
        expect(problems.length === 0).toBe(NINE.includes(type));
      }),
      { numRuns: 100 },
    );
  });

  it('accepts unlabeled_field, rejects an unknown type, and keeps the eight earlier types', () => {
    expect(validateSchema(withType('unlabeled_field'))).toEqual([]);
    expect(validateSchema(withType('unlabeled_nothing')).length).toBeGreaterThan(0);
    for (const type of NINE.filter((t) => t !== 'unlabeled_field')) {
      expect(validateSchema(withType(type))).toEqual([]);
    }
  });
});
