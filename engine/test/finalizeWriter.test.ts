import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { validate } from '../src/contract/invariants.ts';
import type { Run } from '../src/contract/types.ts';
import { finalizeRun, formatStartedAt, normalizeSiteUrl } from '../src/core/finalize.ts';
import type { FinalizeInput, FindingInput } from '../src/core/finalize.ts';
import { Recorder, computeWaitMs, shotPath, toFocusBox } from '../src/core/recorder.ts';
import { formatRunId } from '../src/core/runId.ts';
import type { ActionResult, Box, StepTrace } from '../src/core/types.ts';
import { InvalidRunError, writeRunFolder } from '../src/core/writer.ts';

/*
 * Tests for src/core/recorder.ts, finalize.ts and writer.ts.
 * Everything is written into a temporary folder under os.tmpdir(); nothing touches runs/.
 */

// 400x300 CSS px at scale 2 gives 800x600 screenshots.
const VIEWPORT = { width: 400, height: 300, deviceScaleFactor: 2 };
const SCREENSHOT_SIZE = { width: 800, height: 600 };

const SITE_KEY = 'lantern-bills';
const STARTED_AT = new Date(Date.UTC(2026, 9, 31, 14, 5, 59, 999));
const RUN_ID = formatRunId(STARTED_AT, 'listener', 'pay-bill');

const MISSION = {
  id: 'pay-bill',
  goal: 'Pay the electricity bill',
  requirement: 'Every control has a name.',
  successCheck: { text: 'A payment confirmation is shown', visible: 'Payment received' },
};

function png(label: string): Buffer {
  return Buffer.from(`fake-png:${label}`);
}

function trace(overrides: Partial<StepTrace> = {}): StepTrace {
  return {
    pathBefore: '/before',
    pathAfter: '/after',
    keys: [],
    touchedKeys: [],
    actionEndedAt: 1000,
    readyAt: 1000,
    waits: [],
    announcements: [],
    ...overrides,
  };
}

interface ResultOptions {
  focusBox?: Box | null;
  seen?: boolean;
  trace?: Partial<StepTrace>;
}

function actionResult(label: string, options: ResultOptions = {}): ActionResult {
  const result: ActionResult = {
    actionText: `action ${label}`,
    spoken: `spoken ${label}`,
    focusBox: options.focusBox ?? null,
    trace: trace(options.trace),
    screenshot: png(`step-${label}`),
  };
  if (options.seen) result.seenScreenshot = png(`seen-${label}`);
  return result;
}

/** Three Steps: step 2 and step 3 both have a seen screenshot. */
function threeStepRecorder(): Recorder {
  const recorder = new Recorder(VIEWPORT);
  recorder.add(actionResult('1'), 'Opening the page.');
  recorder.add(actionResult('2', { seen: true, focusBox: { x: 10, y: 20, w: 30, h: 40 } }), 'Looking at the button.');
  recorder.add(actionResult('3', { seen: true }), 'Pressing it.');
  return recorder;
}

function finalizeInput(recorder: Recorder, findings: FindingInput[], overrides: Partial<FinalizeInput> = {}): FinalizeInput {
  return {
    runId: RUN_ID,
    ghost: 'listener',
    mission: MISSION,
    site: { name: 'Lantern Bills' },
    url: 'http://localhost:3000/',
    commit: 'abc1234',
    startedAt: STARTED_AT,
    result: 'gave_up',
    recorder,
    findings,
    screenshotSize: SCREENSHOT_SIZE,
    ...overrides,
  };
}

/** Sorted, forward-slash relative paths of everything under `dir` (empty list when it does not exist). */
function listing(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true })
    .map((entry) => String(entry).replaceAll('\\', '/'))
    .sort();
}

let tmp: string;
let outRoot: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), 'haunt-finalize-'));
  outRoot = path.join(tmp, 'out');
});

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe('recorder', () => {
  it('numbers Steps from 1 and names screenshots shots/NNN.png', () => {
    const recorder = new Recorder(VIEWPORT);
    const first = recorder.add(actionResult('a'), 'one');
    const second = recorder.add(actionResult('b'), 'two');
    const third = recorder.add(actionResult('c'), 'three');

    expect([first.step.n, second.step.n, third.step.n]).toEqual([1, 2, 3]);
    expect(recorder.toSteps().map((s) => s.screenshot)).toEqual(['shots/001.png', 'shots/002.png', 'shots/003.png']);
    expect(recorder.last?.step.n).toBe(3);
    expect(recorder.steps).toHaveLength(3);
  });

  it('uses pathAfter for Step 1 and pathBefore for later Steps', () => {
    const recorder = new Recorder(VIEWPORT);
    const t = { pathBefore: '/before', pathAfter: '/after' };
    recorder.add(actionResult('1', { trace: t }), 'open');
    recorder.add(actionResult('2', { trace: t }), 'act');

    const [one, two] = recorder.toSteps();
    expect(one!.page).toBe('/after');
    expect(two!.page).toBe('/before');
  });

  it('builds seen screenshot names and rejects Step numbers that do not fit', () => {
    expect(shotPath(7)).toBe('shots/007.png');
    expect(shotPath(7, 'seen')).toBe('shots/007-seen.png');
    expect(shotPath(999)).toBe('shots/999.png');
    for (const bad of [0, -1, 1000, 1.5, Number.NaN]) {
      expect(() => shotPath(bad)).toThrow(RangeError);
    }
  });

  it('keeps a seen screenshot only for the Step that has one', () => {
    const recorder = threeStepRecorder();
    expect(recorder.hasSeenScreenshot(1)).toBe(false);
    expect(recorder.hasSeenScreenshot(2)).toBe(true);
    expect(recorder.screenshotByName('shots/002-seen.png')?.toString()).toBe('fake-png:seen-2');
    expect(recorder.screenshotByName('shots/001-seen.png')).toBeUndefined();
  });

  it('filesToWrite gives every Step screenshot and only the referenced seen screenshots', () => {
    const recorder = threeStepRecorder();
    expect([...recorder.filesToWrite().keys()].sort()).toEqual(['shots/001.png', 'shots/002.png', 'shots/003.png']);
    expect([...recorder.filesToWrite(['shots/003-seen.png']).keys()].sort()).toEqual([
      'shots/001.png',
      'shots/002.png',
      'shots/003-seen.png',
      'shots/003.png',
    ]);
    // A name that is not a kept seen screenshot is ignored.
    expect(recorder.filesToWrite(['shots/001-seen.png', '../evil.png']).size).toBe(3);
  });

  it('appends text to the last Step thought', () => {
    const recorder = new Recorder(VIEWPORT);
    recorder.appendToLastThought('ignored with no steps');
    recorder.add(actionResult('1'), 'I looked.');
    recorder.appendToLastThought('I give up.');
    expect(recorder.toSteps()[0]!.thought).toBe('I looked. I give up.');
  });

  describe('waitMs', () => {
    it('rounds to whole milliseconds', () => {
      expect(computeWaitMs(1000, 1100.4)).toBe(100);
      expect(computeWaitMs(1000, 1100.5)).toBe(101);
      expect(computeWaitMs(1000, 1000)).toBe(0);
    });

    it('is never negative, NaN or infinite', () => {
      expect(computeWaitMs(1000, 900)).toBe(0);
      expect(computeWaitMs(1000, Number.NaN)).toBe(0);
      expect(computeWaitMs(1000, Number.POSITIVE_INFINITY)).toBe(0);
    });

    it('is recorded on the Step', () => {
      const recorder = new Recorder(VIEWPORT);
      recorder.add(actionResult('1', { trace: { actionEndedAt: 50, readyAt: 1250.6 } }), 'wait');
      recorder.add(actionResult('2', { trace: { actionEndedAt: 5000, readyAt: 4000 } }), 'clock went back');
      expect(recorder.toSteps().map((s) => s.waitMs)).toEqual([1201, 0]);
    });
  });

  describe('focusBox', () => {
    it('converts CSS pixels to screenshot pixels by the device scale factor', () => {
      expect(toFocusBox({ x: 10, y: 20, w: 30, h: 40 }, VIEWPORT)).toEqual({ x: 20, y: 40, w: 60, h: 80 });
      expect(toFocusBox({ x: 10, y: 20, w: 30, h: 40 }, { ...VIEWPORT, deviceScaleFactor: 1 })).toEqual({
        x: 10,
        y: 20,
        w: 30,
        h: 40,
      });
    });

    it('is left out for no box, a zero-area box or a non-finite box', () => {
      expect(toFocusBox(null, VIEWPORT)).toBeUndefined();
      expect(toFocusBox(undefined, VIEWPORT)).toBeUndefined();
      expect(toFocusBox({ x: 10, y: 10, w: 0, h: 20 }, VIEWPORT)).toBeUndefined();
      expect(toFocusBox({ x: 10, y: 10, w: 20, h: 0 }, VIEWPORT)).toBeUndefined();
      expect(toFocusBox({ x: 10, y: 10, w: -5, h: 20 }, VIEWPORT)).toBeUndefined();
      expect(toFocusBox({ x: Number.NaN, y: 10, w: 20, h: 20 }, VIEWPORT)).toBeUndefined();
    });

    it('is left out when the box is entirely outside the viewport', () => {
      expect(toFocusBox({ x: 0, y: 400, w: 50, h: 50 }, VIEWPORT)).toBeUndefined(); // below
      expect(toFocusBox({ x: 500, y: 10, w: 50, h: 50 }, VIEWPORT)).toBeUndefined(); // right
      expect(toFocusBox({ x: -60, y: 10, w: 50, h: 50 }, VIEWPORT)).toBeUndefined(); // left
      expect(toFocusBox({ x: 10, y: -60, w: 50, h: 50 }, VIEWPORT)).toBeUndefined(); // above
      expect(toFocusBox({ x: 400, y: 10, w: 50, h: 50 }, VIEWPORT)).toBeUndefined(); // touches the edge only
    });

    it('is clipped to the viewport when partly inside', () => {
      // Overflows the bottom right corner: 20x20 CSS px remain, 40x40 screenshot px.
      expect(toFocusBox({ x: 380, y: 280, w: 50, h: 50 }, VIEWPORT)).toEqual({ x: 760, y: 560, w: 40, h: 40 });
      // Overflows the top left corner.
      expect(toFocusBox({ x: -10, y: -10, w: 30, h: 30 }, VIEWPORT)).toEqual({ x: 0, y: 0, w: 40, h: 40 });
    });

    it('is stored on the Step only when present, and always passes the invariants', () => {
      const recorder = new Recorder(VIEWPORT);
      recorder.add(actionResult('1', { focusBox: { x: 0, y: 0, w: 0, h: 0 } }), 'zero area');
      recorder.add(actionResult('2', { focusBox: { x: 390, y: 290, w: 100, h: 100 } }), 'clipped');
      const steps = recorder.toSteps();
      expect('focusBox' in steps[0]!).toBe(false);
      expect(steps[1]!.focusBox).toEqual({ x: 780, y: 580, w: 20, h: 20 });

      const result = finalizeInput(recorder, []);
      expect(finalizeRun(result).problems).toEqual([]);
    });
  });
});

describe('finalizeRun', () => {
  it('copies mission fields, with successCheck taken from successCheck.text', () => {
    const { run } = finalizeRun(finalizeInput(threeStepRecorder(), []));
    expect(run.mission).toEqual({
      id: 'pay-bill',
      goal: 'Pay the electricity bill',
      requirement: 'Every control has a name.',
      successCheck: 'A payment confirmation is shown',
    });
    expect(run.site).toEqual({ name: 'Lantern Bills', url: 'http://localhost:3000', commit: 'abc1234' });
    expect(run.formatVersion).toBe(1);
    expect(run.runId).toBe(RUN_ID);
    expect(run.ghost).toBe('listener');
    expect(run.result).toBe('gave_up');
    expect(run.steps.map((s) => s.n)).toEqual([1, 2, 3]);
  });

  it('formats startedAt as UTC YYYY-MM-DDTHH:mm:ssZ with the milliseconds dropped', () => {
    expect(formatStartedAt(STARTED_AT)).toBe('2026-10-31T14:05:59Z');
    expect(formatStartedAt(new Date(Date.UTC(2026, 0, 2, 3, 4, 5)))).toBe('2026-01-02T03:04:05Z');
    expect(formatStartedAt(new Date(Date.UTC(2026, 0, 2, 3, 4, 5)))).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(() => formatStartedAt(new Date(Number.NaN))).toThrow(RangeError);
    expect(finalizeRun(finalizeInput(threeStepRecorder(), [])).run.startedAt).toBe('2026-10-31T14:05:59Z');
  });

  it('removes the slash after the host for the root path and keeps real paths', () => {
    expect(normalizeSiteUrl('http://localhost:3000/')).toBe('http://localhost:3000');
    expect(normalizeSiteUrl('http://localhost:3000')).toBe('http://localhost:3000');
    expect(normalizeSiteUrl('http://localhost/')).toBe('http://localhost');
    expect(normalizeSiteUrl('http://127.0.0.1:5173/bills')).toBe('http://127.0.0.1:5173/bills');
    expect(normalizeSiteUrl('http://localhost:3000/bills/')).toBe('http://localhost:3000/bills/');
    expect(normalizeSiteUrl('http://localhost:3000/bills?x=1')).toBe('http://localhost:3000/bills?x=1');
    expect(() => normalizeSiteUrl('not a url')).toThrow(TypeError);

    for (const [url, expected] of [
      ['http://localhost:3000/', 'http://localhost:3000'],
      ['http://localhost:3000/pay/now', 'http://localhost:3000/pay/now'],
    ] as const) {
      const { run } = finalizeRun(finalizeInput(threeStepRecorder(), [], { url }));
      expect(run.site.url).toBe(expected);
    }
  });

  it('refers to exactly the files it lists and finds no problems for a valid run', () => {
    const findings: FindingInput[] = [
      { type: 'unlabeled_button', stepN: 2, title: 'Button has no name', evidence: 'Heard "button"', screenshot: 'seen' },
    ];
    const result = finalizeRun(finalizeInput(threeStepRecorder(), findings));
    expect(result.problems).toEqual([]);
    expect(result.run.findings).toEqual([
      {
        type: 'unlabeled_button',
        step: 2,
        title: 'Button has no name',
        evidence: 'Heard "button"',
        screenshot: 'shots/002-seen.png',
      },
    ]);
    expect([...result.files.keys()].sort()).toEqual([
      'shots/001.png',
      'shots/002-seen.png',
      'shots/002.png',
      'shots/003.png',
    ]);
  });

  it('reports a finding that refers to a missing step, with a JSON path', () => {
    const { problems } = finalizeRun(
      finalizeInput(threeStepRecorder(), [
        { type: 'focus_trap', stepN: 99, title: 't', evidence: 'e', screenshot: 'step' },
      ]),
    );
    expect(problems.map((p) => p.path)).toContain('findings[0].step');
    expect(problems.every((p) => p.path !== '' && p.message !== '')).toBe(true);
  });

  it('reports a seen finding without a seen screenshot once, at findings[i].screenshot', () => {
    const { problems } = finalizeRun(
      finalizeInput(threeStepRecorder(), [
        { type: 'misclick', stepN: 1, title: 't', evidence: 'e', screenshot: 'seen' },
      ]),
    );
    const onScreenshot = problems.filter((p) => p.path === 'findings[0].screenshot');
    expect(onScreenshot).toHaveLength(1);
    expect(onScreenshot[0]!.message).toContain('shots/001-seen.png');
  });

  it('reports a run with no Steps', () => {
    const { problems } = finalizeRun(finalizeInput(new Recorder(VIEWPORT), []));
    expect(problems.map((p) => p.path)).toContain('steps');
  });

  it('reports a Run_Id that does not match the ghost', () => {
    const { problems } = finalizeRun(finalizeInput(threeStepRecorder(), [], { ghost: 'bebe' }));
    expect(problems.map((p) => p.path)).toContain('runId');
  });
});

describe('writeRunFolder', () => {
  const referencedFindings: FindingInput[] = [
    { type: 'unlabeled_button', stepN: 2, title: 'Button has no name', evidence: 'e', screenshot: 'seen' },
    { type: 'focus_trap', stepN: 3, title: 'Trapped', evidence: 'e', screenshot: 'step' },
  ];

  it('writes run.json and exactly the referenced screenshots, and nothing else', async () => {
    const recorder = threeStepRecorder();
    const result = finalizeRun(finalizeInput(recorder, referencedFindings));
    expect(result.problems).toEqual([]);

    const written = await writeRunFolder({ outRoot, siteKey: SITE_KEY, result });

    const finalFolder = path.join(outRoot, SITE_KEY, RUN_ID);
    expect(written.folder).toBe(finalFolder);
    expect(written.runJsonPath).toBe(path.join(finalFolder, 'run.json'));

    // Step 3 has a seen screenshot, but no finding refers to it, so it must not be written.
    expect(listing(finalFolder)).toEqual([
      'run.json',
      'shots',
      'shots/001.png',
      'shots/002-seen.png',
      'shots/002.png',
      'shots/003.png',
    ]);
    // No leftover temp folder next to the run folder, and nothing else under the Out_Root.
    expect(listing(outRoot).filter((p) => !p.startsWith(`${SITE_KEY}/${RUN_ID}`))).toEqual([SITE_KEY]);
    expect(readdirSync(path.join(outRoot, SITE_KEY))).toEqual([RUN_ID]);

    // The files hold the recorded bytes.
    expect(readFileSync(path.join(finalFolder, 'shots', '002-seen.png')).toString()).toBe('fake-png:seen-2');
    expect(readFileSync(path.join(finalFolder, 'shots', '003.png')).toString()).toBe('fake-png:step-3');
  });

  it('writes a run.json that parses, equals the run and passes validate()', async () => {
    const result = finalizeRun(finalizeInput(threeStepRecorder(), referencedFindings));
    const written = await writeRunFolder({ outRoot, siteKey: SITE_KEY, result });

    const parsed = JSON.parse(readFileSync(written.runJsonPath, 'utf8')) as Run;
    expect(parsed).toEqual(JSON.parse(JSON.stringify(result.run)));

    const shotsOnDisk = listing(path.dirname(written.runJsonPath))
      .filter((p) => p.startsWith('shots/'))
      .sort();
    expect(validate(parsed, shotsOnDisk, { screenshotSize: SCREENSHOT_SIZE })).toEqual([]);
    // Every Step screenshot and Finding screenshot named in the file exists on disk.
    for (const name of [...parsed.steps.map((s) => s.screenshot), ...parsed.findings.map((f) => f.screenshot)]) {
      expect(existsSync(path.join(path.dirname(written.runJsonPath), ...name.split('/')))).toBe(true);
    }
  });

  it('builds the temp folder first and renames it to the final folder', async () => {
    const result = finalizeRun(finalizeInput(threeStepRecorder(), referencedFindings));
    const calls: { from: string; to: string; hadRunJson: boolean }[] = [];
    await writeRunFolder({
      outRoot,
      siteKey: SITE_KEY,
      result,
      pid: 4242,
      rename: async (from, to) => {
        calls.push({ from, to, hadRunJson: existsSync(path.join(from, 'run.json')) });
        const { rename } = await import('node:fs/promises');
        await rename(from, to);
      },
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.from).toBe(path.join(outRoot, SITE_KEY, `.${RUN_ID}.tmp-4242`));
    expect(calls[0]!.to).toBe(path.join(outRoot, SITE_KEY, RUN_ID));
    expect(calls[0]!.hadRunJson).toBe(true);
  });

  it('refuses an invalid run, throws InvalidRunError with JSON paths and leaves the out folder unchanged', async () => {
    const result = finalizeRun(
      finalizeInput(threeStepRecorder(), [
        { type: 'focus_trap', stepN: 99, title: 't', evidence: 'e', screenshot: 'step' },
        { type: 'misclick', stepN: 1, title: 't', evidence: 'e', screenshot: 'seen' },
      ]),
    );
    expect(result.problems.length).toBeGreaterThan(0);

    // The out folder does not exist yet; it must not be created.
    const before = listing(outRoot);
    const error = await writeRunFolder({ outRoot, siteKey: SITE_KEY, result }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InvalidRunError);
    const invalid = error as InvalidRunError;
    expect(invalid.problems).toEqual(result.problems);
    expect(invalid.message).toContain('findings[0].step');
    expect(invalid.message).toContain('findings[1].screenshot');
    expect(existsSync(outRoot)).toBe(false);
    expect(listing(outRoot)).toEqual(before);
  });

  it('leaves an existing out folder unchanged when the run is invalid', async () => {
    mkdirSync(path.join(outRoot, SITE_KEY, 'earlier-run'), { recursive: true });
    writeFileSync(path.join(outRoot, SITE_KEY, 'earlier-run', 'run.json'), '{}', 'utf8');
    const before = listing(outRoot);

    const result = finalizeRun(finalizeInput(new Recorder(VIEWPORT), []));
    await expect(writeRunFolder({ outRoot, siteKey: SITE_KEY, result })).rejects.toBeInstanceOf(InvalidRunError);

    expect(listing(outRoot)).toEqual(before);
    expect(readFileSync(path.join(outRoot, SITE_KEY, 'earlier-run', 'run.json'), 'utf8')).toBe('{}');
  });

  it('leaves no final folder and no temp folder when the rename fails', async () => {
    const result = finalizeRun(finalizeInput(threeStepRecorder(), referencedFindings));
    let renameCalled = false;
    const failure = new Error('simulated rename failure');

    await expect(
      writeRunFolder({
        outRoot,
        siteKey: SITE_KEY,
        result,
        rename: async (from) => {
          renameCalled = true;
          // The temp folder is complete at this point, so a missing cleanup would be visible.
          expect(existsSync(path.join(from, 'run.json'))).toBe(true);
          throw failure;
        },
      }),
    ).rejects.toBe(failure);

    expect(renameCalled).toBe(true);
    expect(existsSync(path.join(outRoot, SITE_KEY, RUN_ID))).toBe(false);
    // Nothing is left under the site folder: no final folder, no `.tmp-` folder.
    expect(listing(path.join(outRoot, SITE_KEY))).toEqual([]);
  });

  it('refuses to overwrite an existing final folder', async () => {
    const finalFolder = path.join(outRoot, SITE_KEY, RUN_ID);
    mkdirSync(finalFolder, { recursive: true });
    writeFileSync(path.join(finalFolder, 'marker.txt'), 'keep me', 'utf8');
    const before = listing(outRoot);

    const result = finalizeRun(finalizeInput(threeStepRecorder(), referencedFindings));
    await expect(writeRunFolder({ outRoot, siteKey: SITE_KEY, result })).rejects.toThrow(/already exists/);

    expect(listing(outRoot)).toEqual(before);
    expect(readFileSync(path.join(finalFolder, 'marker.txt'), 'utf8')).toBe('keep me');
  });

  it('refuses unsafe folder names', async () => {
    const result = finalizeRun(finalizeInput(threeStepRecorder(), referencedFindings));
    await expect(writeRunFolder({ outRoot, siteKey: '..', result })).rejects.toThrow(/not a safe folder name/);
    await expect(writeRunFolder({ outRoot, siteKey: 'a/b', result })).rejects.toThrow(/not a safe folder name/);
    expect(existsSync(outRoot)).toBe(false);
  });
});
