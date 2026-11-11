import { describe, expect, it } from 'vitest';
import type { HauntConfig } from '../src/config/loadConfig.ts';
import type { DetectorContext, RecordedStep, StepTrace } from '../src/core/types.ts';
import { createSlowWaitDetector, findSlowWaits, slowWaitEvidence } from '../src/detectors/slowWait.ts';

/**
 * The `slow_wait` Detector on hand-made Step histories (the wait spans the visual Body records). The
 * page itself is not needed: the only page read is the screen text, which the fake context returns.
 * **Validates: Requirements 15.1, 15.2**
 */

type Span = StepTrace['waits'][number];

function span(from: number, to: number, progress: number[] = [], loadingUntil: number | null = null): Span {
  return { from, to, progress, loadingUntil };
}

function recorded(n: number, action: string, waits: Span[]): RecordedStep {
  return {
    step: { n, page: '/', action, spoken: '', thought: '', screenshot: `shots/${String(n).padStart(3, '0')}.png`, waitMs: 0 },
    trace: {
      pathBefore: '/',
      pathAfter: '/',
      keys: [],
      touchedKeys: [],
      actionEndedAt: waits[0]?.from ?? 0,
      readyAt: waits[waits.length - 1]?.to ?? 0,
      waits,
      announcements: [],
    },
    probe: { at: 0 },
  };
}

/** A wait Step as the visual Body records it: up to 2000 ms of waiting, then a 1250 ms Settle. */
function waitStep(n: number, start: number, progress: number[] = []): RecordedStep {
  const inSpan = (a: number, b: number) => progress.filter((p) => p >= a && p <= b);
  return recorded(n, 'Wait', [span(start, start + 2000, inSpan(start, start + 2000)), span(start + 2000, start + 3250, inSpan(start + 2000, start + 3250))]);
}

/** Open (quiet Settle of 1250 ms), then wait Steps 300 ms apart on the same page clock. */
function blankPage(waitSteps: number, progress: number[] = []): RecordedStep[] {
  const steps = [recorded(1, 'Open http://localhost/', [span(0, 1250, progress.filter((p) => p <= 1250))])];
  let end = 1250;
  for (let i = 0; i < waitSteps; i += 1) {
    const start = end + 300;
    steps.push(waitStep(i + 2, start, progress));
    end = start + 3250;
  }
  return steps;
}

const config: HauntConfig = { allowedDomains: [], sites: { demo: { name: 'Demo', allowedTerms: [] } } };

function fakeContext(steps: RecordedStep[], screenText: string): DetectorContext {
  return {
    inspect: async <T>() => screenText as unknown as T,
    cdp: { send: async () => { throw new Error('slow_wait must not use CDP'); } },
    steps,
    current: steps[steps.length - 1]!,
    config,
    site: config.sites.demo!,
  };
}

describe('findSlowWaits', () => {
  it('joins an Open and the wait Steps after it into one quiet stretch', () => {
    expect(findSlowWaits(blankPage(2))).toEqual([]); // 8.35 s
    expect(findSlowWaits(blankPage(3))).toEqual([
      { startStep: 1, passedStep: 4, endStep: 4, lengthMs: 11_900, end: 'ongoing' },
    ]);
  });

  it('a visible loading indicator or a page change is a sign of progress', () => {
    const spinner: number[] = [];
    for (let t = 0; t <= 20_000; t += 50) spinner.push(t);
    expect(findSlowWaits(blankPage(5, spinner))).toEqual([]);
    // One page change at 6 s splits 11.9 s into two quiet stretches of under 10 s.
    expect(findSlowWaits(blankPage(3, [6000]))).toEqual([]);
  });

  it('a pending load event counts as progress up to loadingUntil', () => {
    const steps = blankPage(3);
    const [first, second] = steps[1]!.trace.waits;
    steps[1] = recorded(2, 'Wait', [{ ...first!, loadingUntil: 3000 }, second!]);
    expect(findSlowWaits(steps)).toEqual([]); // quiet from 3 s to 11.9 s: 8.9 s
  });

  it('an action other than a wait ends the chain', () => {
    const steps = blankPage(3);
    steps[2] = recorded(3, 'Scroll down', steps[2]!.trace.waits);
    expect(findSlowWaits(steps)).toEqual([]);
  });

  it('does not count a gap between Steps that are on different clocks', () => {
    // Each Step starts again near 0 (a new document each time): only the spans' own lengths count.
    const steps = [
      recorded(1, 'Open http://localhost/', [span(500, 3500)]),
      recorded(2, 'Wait', [span(100, 2100), span(2100, 3300)]),
      recorded(3, 'Wait', [span(200, 2200), span(2200, 3400)]),
    ];
    expect(findSlowWaits(steps)).toEqual([]); // 3.0 + 3.2 + 3.2 = 9.4 s
    steps.push(recorded(4, 'Wait', [span(50, 1050)]));
    expect(findSlowWaits(steps)).toEqual([{ startStep: 1, passedStep: 4, endStep: 4, lengthMs: 10_400, end: 'ongoing' }]);
  });

  it('reports a stretch that ended with progress with its full length', () => {
    const steps = [recorded(1, 'Open http://localhost/', [span(0, 12_000, [11_000])])];
    expect(findSlowWaits(steps)).toEqual([{ startStep: 1, passedStep: 1, endStep: 1, lengthMs: 11_000, end: 'progress' }]);
  });
});

describe('slow_wait Detector', () => {
  it('records one Finding on the Step where the wait passed 10 s, with seconds, Steps and screen text', async () => {
    const detector = createSlowWaitDetector();
    const history = blankPage(4);
    const found = [];
    for (let i = 1; i <= history.length; i += 1) {
      const ctx = fakeContext(history.slice(0, i), '  Lantern   Bills\n');
      found.push(...(await detector.observe(ctx)));
    }
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ key: 'wait-1', stepN: 4, screenshot: 'step', title: 'Long wait with no sign of progress' });
    expect(found[0]!.evidence).toBe(
      'Waited 11.9 seconds from step 1 to step 4 with nothing changing on the screen and no loading sign ' +
        '(no change on the page, no visible loading indicator, and the page had finished loading). ' +
        'Nothing had changed by the end of step 4. The screen showed: "Lantern Bills"',
    );
  });

  it('says when the screen had no text, and cuts long text to 80 characters', () => {
    const wait = { startStep: 2, passedStep: 2, endStep: 2, lengthMs: 12_449, end: 'ongoing' as const };
    expect(slowWaitEvidence(wait, '')).toContain('Waited 12.4 seconds at step 2 ');
    expect(slowWaitEvidence(wait, '')).toContain('The screen showed no text.');
    expect(slowWaitEvidence(wait, 'ਭ'.repeat(100))).toContain(`"${'ਭ'.repeat(80)}…"`);
  });
});
