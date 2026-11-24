import { readFileSync } from 'node:fs';
import path from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FINDING_TYPES } from '../data/types';
import type { Finding, Run } from '../data/types';
import { FINDING_LABELS } from '../model/findingLabels';
import { stuckPhrase, trapPlace } from '../model/findingWords';
import { blockingFindings, resultHeadline } from '../model/results';
import { listenerRun } from './fixtures/samples';

function withFinding(evidence: string, title = 'Keyboard focus is trapped in a text box'): { run: Run; finding: Finding } {
  const run = structuredClone(listenerRun());
  const finding: Finding = { type: 'focus_trap', step: run.steps[run.steps.length - 1]!.n, title, evidence, screenshot: null };
  run.findings = [finding];
  return { run, finding };
}

describe('Feature: memos-real-world-haunt, Property 11 (dashboard half): FINDING_TYPES equals the schema list', () => {
  it('matches contract/run.schema.json', () => {
    const file = path.resolve(process.cwd(), '..', 'contract', 'run.schema.json');
    const schema: unknown = JSON.parse(readFileSync(file, 'utf8'));
    // The enumeration that holds the finding types, wherever the schema keeps it.
    const lists: string[][] = [];
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) node.forEach(walk);
      else if (node !== null && typeof node === 'object') {
        for (const [key, value] of Object.entries(node)) {
          if (key === 'enum' && Array.isArray(value) && value.includes('focus_trap')) lists.push(value as string[]);
          else walk(value);
        }
      }
    };
    walk(schema);
    expect(lists).toHaveLength(1);
    expect([...FINDING_TYPES].sort()).toEqual([...lists[0]!].sort());
  });
});

describe('Feature: memos-real-world-haunt, Property 12: Every finding type has complete plain words', () => {
  it('has every phrase for every type, and the unlabeled_field words', () => {
    fc.assert(
      fc.property(fc.constantFrom(...FINDING_TYPES), (type) => {
        const words = FINDING_LABELS[type];
        for (const text of [words.label, words.helped, words.blocker, words.thing, words.stuck, words.summary]) {
          expect(text.trim()).not.toBe('');
        }
      }),
      { numRuns: 100 },
    );
    expect(FINDING_LABELS.unlabeled_field.label).toBe('Field with no name');
    expect(FINDING_LABELS.unlabeled_field.helped).not.toBe('');
    expect(FINDING_LABELS.unlabeled_field.summary).not.toBe('');
  });
});

describe('Feature: memos-real-world-haunt, Property 13: An element trap is named as the element, and is blocking', () => {
  const nameArb = fc
    .string({ minLength: 1, maxLength: 20, unit: fc.constantFrom(...'abcdefghij KLMN12'.split('')) })
    .filter((s) => s.trim() !== '' && !/dialog|modal|pop-?up/i.test(s));

  it('names a named text box, and counts as blocking in a gave_up run', () => {
    fc.assert(
      fc.property(nameArb, (name) => {
        const clean = name.trim();
        const { run, finding } = withFinding(`Keyboard focus could not leave the text box "${clean}" (role textbox). Tab (1 press) left focus on it.`);
        expect(trapPlace(run, finding)).toBe(`the '${clean}' text box`);
        expect(stuckPhrase(run, finding)).toBe(`got trapped in the '${clean}' text box`);
        expect(blockingFindings(run)).toContain(finding);
        expect(resultHeadline(run)).toContain(`got trapped in the '${clean}' text box`);
      }),
      { numRuns: 100 },
    );
  });

  it('names a text box with no name, and one whose name could not be read', () => {
    const none = withFinding('Keyboard focus could not leave a text box with no name (role textbox). Tab (1 press) left focus on it.');
    expect(trapPlace(none.run, none.finding)).toBe('a text box with no name');
    expect(resultHeadline(none.run)).toContain('got trapped in a text box with no name');
    const unread = withFinding('Keyboard focus could not leave a text box (role textbox); its accessible name could not be read.');
    expect(trapPlace(unread.run, unread.finding)).toBe('a text box');
  });

  it('keeps the dialog wording unchanged', () => {
    const { run, finding } = withFinding('Keyboard focus stayed inside the dialog "Protect your payment".', 'Keyboard focus is trapped in a dialog');
    expect(trapPlace(run, finding)).toBe("the 'Protect your payment' dialog");
    expect(resultHeadline(run)).toContain('got trapped in a pop-up');
  });
});
