import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FINDING_TYPES, GHOST_IDS, RUN_RESULTS, type Finding, type Run, type Step } from '../data/types';
import { FINDING_LABELS } from '../model/findingLabels';
import { GHOSTS } from '../model/ghosts';
import { resultHeadline, watchStep } from '../model/results';

// Independent oracle, written from Req 21.4 and the Watch_Step and Mission_Verb definitions.
const DETERMINERS = ['a', 'an', 'the', 'this', 'that', 'my', 'your', 'our', 'their'];

function oracleVerb(goal: string): string | null {
  const words = goal.trim().split(/\s+/);
  const first = words[0] ?? '';
  if (first === '' || !/^[A-Za-z]+$/.test(first)) return null;
  return DETERMINERS.includes(first.toLowerCase()) ? null : first.toLowerCase();
}

function mentionsPopUp(text: string): boolean {
  return /\b(dialog|modal|pop-?up)\b/i.test(text);
}

function expectedHeadline(run: Run): string {
  const name = GHOSTS[run.ghost].name;
  if (run.steps.length === 0) return `${name} recorded no steps.`;
  const verb = oracleVerb(run.mission.goal);
  const couldnt = verb === null ? "couldn't finish the task" : `couldn't ${verb}`;
  const managed = verb === null ? 'made it through' : `managed to ${verb}`;
  let lastN = -Infinity;
  for (const s of run.steps) lastN = Math.max(lastN, s.n);

  if (run.result === 'error') return `${name} hit a technical error and ${couldnt}.`;
  if (run.result === 'gave_up') {
    let atLast: Finding | undefined;
    for (const f of run.findings) {
      if (f.step === lastN) {
        atLast = f;
        break;
      }
    }
    if (!atLast) return `${name} gave up at step ${lastN} and ${couldnt}.`;
    const spoken = run.steps.filter((s) => s.n === atLast.step).map((s) => s.spoken)[0] ?? '';
    const popUp =
      atLast.type === 'focus_trap' && (mentionsPopUp(atLast.title) || mentionsPopUp(atLast.evidence) || mentionsPopUp(spoken));
    const blocker = popUp ? 'got trapped in a pop-up' : FINDING_LABELS[atLast.type].blocker;
    return `${name} ${blocker} and ${couldnt}.`;
  }
  if (run.findings.length === 0) return `${name} ${managed} with no problems.`;
  // Earliest by step; among equal steps, the first in the file.
  let earliest = run.findings[0]!;
  for (const f of run.findings) if (f.step < earliest.step) earliest = f;
  const others = run.findings.length - 1;
  const more = others === 0 ? '' : ` and ${others} more ${others === 1 ? 'problem' : 'problems'}`;
  return `${name} ${managed}, but found ${FINDING_LABELS[earliest.type].thing}${more}.`;
}

function expectedWatchStep(run: Run): number | null {
  if (run.steps.length === 0) return null;
  const ns = run.steps.map((s) => s.n);
  if (run.result !== 'succeeded') return Math.max(...ns);
  const matching = run.findings.map((f) => f.step).filter((n) => ns.includes(n));
  return matching.length > 0 ? Math.min(...matching) : run.steps[0]!.n;
}

const TEXTS = ['Button', 'Dialog, Payment confirmation', 'Cannot escape the modal', 'Pop-up opened', 'Popup', 'Text', ''];
const GOALS = ["Pay this month's electricity bill", 'Find the opening hours', 'The bill', '3 tickets', 'your account', '  Book a seat', 'Sign-up form', ''];

const runArb: fc.Arbitrary<Run> = fc
  .record({
    ghost: fc.constantFrom(...GHOST_IDS),
    result: fc.constantFrom(...RUN_RESULTS),
    goal: fc.constantFrom(...GOALS),
    ns: fc.uniqueArray(fc.integer({ min: 1, max: 12 }), { maxLength: 8 }).map((ns) => [...ns].sort((a, b) => a - b)),
    spoken: fc.array(fc.constantFrom(...TEXTS), { minLength: 8, maxLength: 8 }),
    findings: fc.array(
      fc.record({
        type: fc.constantFrom(...FINDING_TYPES),
        step: fc.integer({ min: 0, max: 14 }),
        title: fc.constantFrom(...TEXTS),
        evidence: fc.constantFrom(...TEXTS),
      }),
      { maxLength: 4 },
    ),
    lastFinding: fc.option(fc.constantFrom(...FINDING_TYPES), { nil: undefined }),
  })
  .map(({ ghost, result, goal, ns, spoken, findings, lastFinding }) => {
    const steps: Step[] = ns.map((n, i) => ({
      n,
      page: '/',
      action: 'Tab',
      spoken: spoken[i]!,
      thought: '',
      screenshot: null,
      focusBox: null,
      waitMs: 100,
    }));
    const all: Finding[] = findings.map((f) => ({ ...f, screenshot: null }));
    // Often put a finding on the last step, so the gave-up rules with a finding are well covered.
    const last = ns[ns.length - 1];
    if (lastFinding && last !== undefined) all.push({ type: lastFinding, step: last, title: 'x', evidence: 'y', screenshot: null });
    return {
      key: 'k',
      folder: 'f',
      origin: 'runs',
      formatVersion: 1,
      runId: 'k',
      ghost,
      mission: { id: 'm', goal, requirement: 'r', successCheck: 's' },
      site: { name: 'Site', url: 'http://localhost:3000', commit: 'abc' },
      startedAt: '2026-11-03T14:22:15Z',
      result,
      steps,
      findings: all,
      warnings: [],
    } satisfies Run;
  });

describe('Feature: haunt-dashboard, Property 14: Result_Headline and Watch_Step follow the rules for every run', () => {
  it('matches the oracle, starts with the ghost, ends with one full stop, and opens a real step', () => {
    fc.assert(
      fc.property(runArb, (run) => {
        const headline = resultHeadline(run);
        expect(headline).toBe(expectedHeadline(run));
        if (run.steps.length > 0) expect(headline.startsWith(GHOSTS[run.ghost].name)).toBe(true);
        expect(headline).toMatch(/[^.]\.$/);

        const step = watchStep(run);
        expect(step).toBe(expectedWatchStep(run));
        if (step !== null) expect(run.steps.some((s) => s.n === step)).toBe(true);
      }),
      { numRuns: 300 },
    );
  });
});
