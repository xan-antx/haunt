import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FINDING_TYPES, RUN_RESULTS, type Finding, type FindingType, type RunResult, type Step } from '../data/types';
import { FINDING_LABELS } from '../model/findingLabels';
import { RESULT_LABELS } from '../model/ghosts';
import { outcomeLine } from '../model/outcome';

interface OracleRun {
  result: RunResult;
  steps: Step[];
  findings: Finding[];
}

/**
 * Independent oracle, written from Req 7.14–7.19.
 * Returns the expected text and the number the text must contain (null for 7.19).
 */
function expectedOutcome(run: OracleRun): { text: string; number: number | null } {
  // 7.19: empty steps wins over every other rule, for any result.
  if (run.steps.length === 0) return { text: 'No steps were recorded', number: null };

  // 7.14: N is the number of entries in steps, singular "step" when N is 1.
  if (run.result === 'succeeded') {
    const count = run.steps.length;
    return { text: `Made it through in ${count} ${count === 1 ? 'step' : 'steps'}`, number: count };
  }

  // "Last step" is the step with the highest n.
  let lastN = run.steps[0]!.n;
  for (const step of run.steps) if (step.n > lastN) lastN = step.n;

  // 7.17: error ignores findings.
  if (run.result === 'error') {
    return { text: `Stopped by a technical error at step ${lastN}`, number: lastN };
  }

  // 7.15 / 7.16: gave_up uses the first finding (array order) at the last step.
  let first: Finding | undefined;
  for (const finding of run.findings) {
    if (finding.step === lastN) {
      first = finding;
      break;
    }
  }
  if (first === undefined) return { text: `Gave up at step ${lastN}`, number: lastN };

  const label = FINDING_LABELS[first.type].label;
  if (first.type === 'focus_trap') {
    const lowered = label.slice(0, 1).toLowerCase() + label.slice(1);
    return { text: `Trapped by a ${lowered} at step ${lastN}`, number: lastN };
  }
  return { text: `Stuck at step ${lastN}: ${label}`, number: lastN };
}

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

const findingArb = (step: fc.Arbitrary<number>): fc.Arbitrary<Finding> =>
  fc.record({
    type: fc.constantFrom<FindingType>(...FINDING_TYPES),
    step,
    title: fc.string({ maxLength: 10 }),
    evidence: fc.string({ maxLength: 10 }),
    screenshot: fc.constant(null),
  });

/** Step counts include 0 and 1 often; steps are numbered 1..count as in the contract. */
const stepCountArb = fc.oneof(fc.constant(0), fc.constant(1), fc.integer({ min: 0, max: 15 }));

const outcomeRunArb: fc.Arbitrary<OracleRun> = stepCountArb.chain((count) => {
  const anyStep = fc.integer({ min: 1, max: Math.max(count, 3) });
  // Findings at the last step: zero, one, or several, in any position of the array.
  const atLast = count > 0 ? fc.array(findingArb(fc.constant(count)), { maxLength: 4 }) : fc.constant([]);
  return fc
    .record({
      result: fc.constantFrom<RunResult>(...RUN_RESULTS),
      others: fc.array(findingArb(anyStep), { maxLength: 6 }),
      atLast,
    })
    .chain(({ result, others, atLast: last }) => {
      const all = [...others, ...last];
      return fc
        .shuffledSubarray(all, { minLength: all.length, maxLength: all.length })
        .map((findings) => ({
          result,
          steps: Array.from({ length: count }, (_, i) => makeStep(i + 1)),
          findings,
        }));
    });
});

describe('Feature: haunt-dashboard, Property 11: Outcome_Line follows the rules for every run', () => {
  /** **Validates: Requirements 7.14, 7.15, 7.16, 7.17, 7.18, 7.19** */
  it('matches the oracle, differs from the badge text and contains the step number', () => {
    fc.assert(
      fc.property(outcomeRunArb, (run) => {
        const line = outcomeLine(run);
        const expected = expectedOutcome(run);
        expect(line).toBe(expected.text);

        // Req 7.18: never identical to the badge beside it (or any badge label).
        expect(line).not.toBe(RESULT_LABELS[run.result]);
        for (const label of Object.values(RESULT_LABELS)) expect(line).not.toBe(label);

        // Req 7.18: contains the step count / step number, except under 7.19.
        if (expected.number === null) {
          expect(run.steps).toHaveLength(0);
        } else {
          expect(line).toMatch(/\d/);
          expect(line).toMatch(new RegExp(`(^|\\D)${expected.number}(\\D|$)`));
        }
      }),
      { numRuns: 300 },
    );
  });

  /** **Validates: Requirements 7.15** */
  it('builds the right line for every finding type at the last step of a gave_up run', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<FindingType>(...FINDING_TYPES),
        fc.integer({ min: 1, max: 15 }),
        (type, count) => {
          const run: OracleRun = {
            result: 'gave_up',
            steps: Array.from({ length: count }, (_, i) => makeStep(i + 1)),
            findings: [{ type, step: count, title: '', evidence: '', screenshot: null }],
          };
          expect(outcomeLine(run)).toBe(expectedOutcome(run).text);
        },
      ),
      { numRuns: 100 },
    );
  });
});
