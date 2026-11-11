import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Finding, FindingType, GhostId, Run, RunResult, Step } from '../data/types';
import { FINDING_TYPES, GHOST_IDS, RUN_RESULTS } from '../data/types';
import { stuckNotice } from '../model/stuckNotice';

// Oracle written from the requirement text, not from the implementation.
const GHOST_NAME: Record<GhostId, string> = { listener: 'The Listener', phantom: 'The Phantom', bebe: 'Bebe' };
const GAVE_UP = 'gave up here';
const GAVE_UP_MERGED = ' and gave up.';
const ERROR_TEXT = 'This run stopped because of an error, so its findings may be incomplete.';
const TRAPPED = 'got trapped here';
const PROBLEM = 'hit a problem here';

const countOf = (text: string, phrase: string): number => text.split(phrase).length - 1;

// Plain words only, so free text can never contain a notice phrase by accident.
const wordArb = fc.stringMatching(/^[A-Za-z0-9 ]{1,20}$/).filter((s) => s.trim() !== '');

const makeStep = (n: number): Step => ({
  n,
  page: '/page',
  action: 'Tab',
  spoken: '',
  thought: '',
  screenshot: null,
  focusBox: null,
  waitMs: 0,
});

const runArb = fc
  .record({
    ghost: fc.constantFrom<GhostId>(...GHOST_IDS),
    result: fc.constantFrom<RunResult>(...RUN_RESULTS),
    gaps: fc.array(fc.integer({ min: 1, max: 3 }), { minLength: 1, maxLength: 10 }),
    start: fc.integer({ min: 1, max: 5 }),
  })
  .chain(({ ghost, result, gaps, start }) => {
    const ns: number[] = [];
    let n = start;
    for (const gap of gaps) {
      ns.push(n);
      n += gap;
    }
    const findingArb = fc.record({
      type: fc.constantFrom<FindingType>(...FINDING_TYPES),
      step: fc.constantFrom(...ns),
      title: wordArb,
      evidence: wordArb,
      screenshot: fc.constant(null),
    });
    return fc.array(findingArb, { maxLength: 12 }).map((findings: Finding[]) => {
      const run: Run = {
        key: 'k',
        folder: 'k',
        origin: 'runs',
        formatVersion: 1,
        runId: 'r',
        ghost,
        mission: { id: 'm', goal: 'g', requirement: 'r', successCheck: 's' },
        site: { name: 'Site', url: 'http://localhost', commit: 'abc' },
        startedAt: '2026-01-01T00:00:00Z',
        result,
        steps: ns.map(makeStep),
        findings,
        warnings: [],
      };
      return run;
    });
  });

// Biased generator: a run with several findings piled on one step, so the "+N more" path is hit often.
const crowdedRunArb = runArb.chain((run) =>
  fc
    .tuple(
      fc.constantFrom(...run.steps.map((s) => s.n)),
      fc.array(
        fc.record({
          type: fc.constantFrom<FindingType>(...FINDING_TYPES),
          title: wordArb,
          evidence: wordArb,
          screenshot: fc.constant(null),
        }),
        { minLength: 2, maxLength: 4 },
      ),
    )
    .map(([step, extra]) => ({
      ...run,
      findings: [...run.findings, ...extra.map((f) => ({ ...f, step }))],
    })),
);

// **Validates: Requirements 10.12, 10.13, 10.30, 10.31, 10.36**
describe('Feature: haunt-dashboard, Property 13: One merged Stuck_Notice per step', () => {
  it('builds one notice with the right phrases exactly when a finding or the give-up applies', () => {
    fc.assert(
      fc.property(fc.oneof(runArb, crowdedRunArb), (run) => {
        const last = Math.max(...run.steps.map((s) => s.n));
        for (const step of run.steps) {
          const found = run.findings.filter((f) => f.step === step.n);
          const gaveUp = run.result === 'gave_up' && step.n === last;
          const errored = run.result === 'error' && step.n === last;
          const notice = stuckNotice(run, step);

          if (found.length === 0 && errored) {
            expect(notice!.lines).toEqual([ERROR_TEXT]);
            expect(notice!.tone).toBe('warning');
            continue;
          }
          if (found.length === 0 && !gaveUp) {
            expect(notice).toBeNull();
            continue;
          }
          expect(notice!.tone).toBe('stuck');
          expect(notice).not.toBeNull();
          const { lines, fullText } = notice!;
          expect(lines.length).toBeGreaterThanOrEqual(1);
          expect(lines.length).toBeLessThanOrEqual(3);
          expect(fullText).toBe(lines.join(' '));

          const all = lines.join('\n');
          const name = GHOST_NAME[run.ghost];

          // Give-up wording appears once, in line 1, when the run gave up at its last step, otherwise
          // never: "<Ghost> gave up here." alone, or "... and gave up." after a finding's lead.
          const phrase = found.length > 0 ? GAVE_UP_MERGED : GAVE_UP;
          expect(countOf(lines[0]!, phrase)).toBe(gaveUp ? 1 : 0);
          expect(countOf(all, phrase)).toBe(gaveUp ? 1 : 0);
          expect(countOf(all, GAVE_UP)).toBe(gaveUp && found.length === 0 ? 1 : 0);

          if (found.length > 0) {
            const trapped = run.ghost === 'listener' && found[0]!.type === 'focus_trap';
            expect(countOf(lines[0]!, trapped ? TRAPPED : PROBLEM)).toBe(1);
            expect(countOf(lines[0]!, trapped ? PROBLEM : TRAPPED)).toBe(0);
            expect(countOf(all, TRAPPED) + countOf(all, PROBLEM)).toBe(1);
            expect(lines[0]!.startsWith(trapped ? 'The Listener got trapped' : `${name} hit a problem`)).toBe(true);
            // The first finding's title and evidence are shown; extra findings are counted, not listed.
            // Plain-word evidence is one readable sentence, shown with a full stop added (Req 10.36).
            expect(lines).toHaveLength(3);
            expect(lines[1]).toContain(found[0]!.title);
            expect(lines[2]).toBe(`${found[0]!.evidence.trim()}.`);
            if (found.length > 1) expect(lines[1]).toContain(`(+${found.length - 1} more at this step)`);
            else expect(lines[1]).not.toContain('more at this step');
            // The full details list every finding at the step, in file order, with its evidence unchanged.
            expect(notice!.details.map((d) => [d.title, d.evidence])).toEqual(found.map((f) => [f.title, f.evidence]));
          } else {
            expect(lines).toEqual([`${name} gave up here.`]);
            expect(countOf(all, TRAPPED) + countOf(all, PROBLEM)).toBe(0);
            expect(notice!.details).toEqual([]);
          }
        }
      }),
      { numRuns: 200 },
    );
  });
});
