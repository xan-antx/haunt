import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { HauntConfig } from '../src/config/loadConfig.ts';
import { validate } from '../src/contract/invariants.ts';
import type { Run } from '../src/contract/types.ts';
import { DetectorRunner } from '../src/core/detectors.ts';
import { finalizeRun } from '../src/core/finalize.ts';
import { Recorder } from '../src/core/recorder.ts';
import { mulberry32 } from '../src/core/rng.ts';
import { formatRunId } from '../src/core/runId.ts';
import { OPENING_THOUGHT, runLoop, type RunLoopOutcome } from '../src/core/runLoop.ts';
import type { Body, BodyOptions } from '../src/core/types.ts';
import { writeRunFolder } from '../src/core/writer.ts';
import { phantomGhost, phantomProfile, phantomStopRule, phantomTiming } from '../src/ghosts/phantom/index.ts';
import { pageInitScripts } from '../src/ghosts/registry.ts';
import { createVisualBody } from '../src/ghosts/visual/body.ts';
import type { Sight, VisualAction } from '../src/ghosts/visual/types.ts';
import type { Mission } from '../src/missions/loadMission.ts';
import { startFixtureServer, type FixtureServer } from './fixtureServer.ts';

/**
 * The Phantom's Detectors on local fixture pages (task 19.4), one page where each Detector must
 * record a Finding and one where it must not, and the rule that `shots/NNN-seen.png` is written only
 * when a Finding refers to it.
 *
 *   misclick   a button that moves under a link 1 s after the load event, versus a stable button;
 *   slow_wait  a page that stays blank for 12 s after the load event, versus one that shows a
 *              (still) spinner for those 12 s;
 *   seen       the misclick Runs go through the Recorder, `finalizeRun` and `writeRunFolder` into
 *              `engine/test-output/phantom-detectors/`, and the folder holds a seen screenshot only
 *              for the Step a Finding refers to.
 *
 * Everything runs in Chromium with The Phantom's browser profile (360×640 at scale 2, mobile, touch,
 * the old Android user agent, `en-IN`) and the engine's page init scripts, with The Phantom's own
 * Mind, Detectors and stop rule. Network and CPU throttling are left off to keep the test fast: the
 * Detectors read only the page and the Body's timings, and `test/throttling.test.ts` checks the
 * throttling itself. Without throttling a local page fires its load event at once, so the "load
 * event pending" sign of progress plays no part here.
 *
 * Timing of the moving button. The Phantom's real Settle waits until the page has shown no change
 * for 1200 ms. A move 1 s after the load event happens inside that Settle, so the Settle waits it
 * out and The Phantom taps the button in its new place: no misclick (the second misclick test, with
 * The Phantom's exact timing, checks this). For the Sight to come before the move, as it does on
 * Lantern Bills where the banner moves the layout 1.5 s after the last change, the misclick Run
 * shortens only the Settle's quiet time to 600 ms and keeps The Phantom's real Reaction_Delay of 550
 * to 650 ms from the seed: the Sight is taken about 0.6 to 0.7 s after load, the move comes at 1 s,
 * and the tap lands at 1.15 s or later, on the link.
 *
 * The slow_wait pages use The Phantom's exact timing: Settle 1200 ms, and the wait action (up to
 * 2000 ms or until the page changes, then a Settle), chosen by The Phantom's Mind because the
 * screen shows nothing to act on.
 * **Validates: Requirements 15.1, 15.2, 15.3, 15.4, 20.3**
 */

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const ENGINE_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const TEST_OUTPUT = path.join(ENGINE_ROOT, 'test-output');
const OUT_BASE = path.join(TEST_OUTPUT, 'phantom-detectors');

const SITE_KEY = 'lantern-bills';
const config: HauntConfig = {
  allowedDomains: [],
  sites: { [SITE_KEY]: { name: 'Lantern Bills demo', allowedTerms: ['Lantern Bills'] } },
};
const site = config.sites[SITE_KEY]!;

const mission: Mission = {
  id: 'pay-bill',
  site: SITE_KEY,
  goal: 'Pay the bill on a fixture page',
  requirement: 'Controls stay where the user saw them, and a long wait shows a sign of progress.',
  successCheck: { text: 'The "Paid" message is visible', visible: '[data-haunt="paid"]' },
  intentions: [
    {
      id: 'pay',
      do: 'activate',
      thought: 'I want to pay this bill, so I am looking for the button that pays it.',
      target: { kind: 'button', en: ['^pay this bill$'] },
      doneWhen: 'success',
    },
  ],
};

const SCREENSHOT_SIZE = {
  width: phantomProfile.width * phantomProfile.deviceScaleFactor,
  height: phantomProfile.height * phantomProfile.deviceScaleFactor,
};

/** The Phantom's Body with only the Settle's quiet time shortened (see the file comment). */
function earlySightBody(page: Page, _cdp: CDPSession, opts: BodyOptions): Body<Sight, VisualAction> {
  return createVisualBody(page, { ...phantomTiming, settleQuietMs: 600, rng: opts.rng });
}

/** Sorted, forward-slash relative paths of everything under `dir`. */
function listing(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { recursive: true })
    .map((entry) => String(entry).replaceAll('\\', '/'))
    .sort();
}

describe("The Phantom's Detectors on fixture pages", () => {
  let server: FixtureServer;
  let browser: Browser;
  let context: BrowserContext;

  beforeAll(async () => {
    // Everything this file writes goes under engine/test-output/phantom-detectors/.
    expect(OUT_BASE.startsWith(TEST_OUTPUT + path.sep)).toBe(true);
    rmSync(OUT_BASE, { recursive: true, force: true });

    server = await startFixtureServer();
    browser = await chromium.launch();
    context = await browser.newContext({
      viewport: { width: phantomProfile.width, height: phantomProfile.height },
      deviceScaleFactor: phantomProfile.deviceScaleFactor,
      locale: phantomProfile.locale,
      isMobile: phantomProfile.isMobile,
      hasTouch: phantomProfile.hasTouch,
      ...(phantomProfile.userAgent === undefined ? {} : { userAgent: phantomProfile.userAgent }),
    });
    for (const source of pageInitScripts) await context.addInitScript(source);

    // Warm up: the first page and screenshot of a fresh browser take far longer than later ones, and
    // that would push the first Run's Sight past the 1 s move.
    const warm = await context.newPage();
    await warm.goto(server.url('/phantom-stable.html'));
    await warm.screenshot();
    await warm.close();
  });

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  interface PhantomRun {
    outcome: RunLoopOutcome;
    recorder: Recorder;
    runner: DetectorRunner;
    /** The written Run_Folder. */
    folder: string;
    run: Run;
  }

  /**
   * One whole Run of The Phantom on a fixture page, through the real run loop, and saved like the CLI
   * saves it: `finalizeRun`, then `writeRunFolder` into `engine/test-output/phantom-detectors/<name>`.
   * The success check is the CLI's locator without its 300 ms wait, so the Sight is not delayed.
   */
  async function phantomRun(
    name: string,
    fixture: string,
    createBody: (page: Page, cdp: CDPSession, opts: BodyOptions) => Body<Sight, VisualAction>,
  ): Promise<PhantomRun> {
    const page = await context.newPage();
    try {
      const cdp = await context.newCDPSession(page);
      const rng = mulberry32(1);
      const recorder = new Recorder({
        width: phantomProfile.width,
        height: phantomProfile.height,
        deviceScaleFactor: phantomProfile.deviceScaleFactor,
      });
      const runner = new DetectorRunner({ detectors: phantomGhost.detectors(), page, cdp, config, site, recorder });
      const startedAt = new Date(Math.floor(Date.now() / 1000) * 1000);
      const url = server.url(fixture);

      const outcome = await runLoop({
        body: createBody(page, cdp, { rng, site, profile: phantomProfile }),
        mind: phantomGhost.createMind(mission, { rng }),
        stopRule: phantomGhost.stopRule,
        detectors: runner,
        recorder,
        mission,
        url,
        checkSuccess: () => page.locator(mission.successCheck.visible).first().isVisible(),
        maxSteps: 6,
      });

      const finalized = finalizeRun({
        runId: formatRunId(startedAt, 'phantom', mission.id),
        ghost: 'phantom',
        mission,
        site,
        url,
        commit: 'unknown',
        startedAt,
        result: outcome.result,
        recorder,
        findings: runner.findings,
        screenshotSize: SCREENSHOT_SIZE,
      });
      expect(finalized.problems).toEqual([]);
      const written = await writeRunFolder({ outRoot: path.join(OUT_BASE, name), siteKey: SITE_KEY, result: finalized });
      expect(written.folder.startsWith(OUT_BASE + path.sep)).toBe(true);

      const run = JSON.parse(readFileSync(written.runJsonPath, 'utf8')) as Run;
      const shotsOnDisk = listing(written.folder).filter((p) => p.startsWith('shots/'));
      expect(validate(run, shotsOnDisk, { screenshotSize: SCREENSHOT_SIZE })).toEqual([]);
      return { outcome, recorder, runner, folder: written.folder, run };
    } finally {
      await page.close();
    }
  }

  describe('misclick', () => {
    it('records the tap that lands on the link when the button moves under it 1 s after load, and saves only that seen screenshot', async () => {
      const { outcome, recorder, runner, folder, run } = await phantomRun('moving', '/phantom-moving.html', earlySightBody);

      // Step 2 hits the link that moved into the button's place; Step 3 taps the button where it is now.
      expect(outcome).toEqual({ result: 'succeeded' });
      expect(run.steps.map((s) => s.action)).toEqual([
        `Open ${server.url('/phantom-moving.html')}`,
        'Click "Pay this bill"',
        'Click "Pay this bill"',
      ]);
      expect(recorder.steps[1]!.trace.click!.hitText).toBe('See what changed');
      expect(recorder.steps[2]!.trace.click!.hitText).toBe('Pay this bill');

      expect(runner.findings.map((f) => [f.type, f.stepN, f.screenshot])).toEqual([['misclick', 2, 'seen']]);
      const { evidence } = runner.findings[0]!;
      expect(evidence).toMatch(/^Aimed at "Pay this bill" \(seen at x 16, y \d+, 200×48\)\. \d\.\d s later the click landed on "See what changed"\./);
      expect(evidence).toMatch(/"Pay this bill" moved from x 16, y (\d+), 200×48 to x 16, y \d+, 200×48/);
      const [, fromY, toY] = /"Pay this bill" moved from x 16, y (\d+), 200×48 to x 16, y (\d+), 200×48/.exec(evidence)!;
      expect(Number(toY) - Number(fromY)).toBe(64);
      expect(evidence.endsWith('Before: shots/002-seen.png. After: shots/002.png.')).toBe(true);

      // Both clicks kept the Sight they were aimed from, but only Step 2's is referred to by a Finding.
      expect(recorder.hasSeenScreenshot(2)).toBe(true);
      expect(recorder.hasSeenScreenshot(3)).toBe(true);
      expect(run.findings.map((f) => f.screenshot)).toEqual(['shots/002-seen.png']);
      expect(listing(folder)).toEqual(['run.json', 'shots', 'shots/001.png', 'shots/002-seen.png', 'shots/002.png', 'shots/003.png']);
      expect(readFileSync(path.join(folder, 'shots', '002-seen.png')).equals(recorder.screenshotByName('shots/002-seen.png')!)).toBe(true);
      expect(readFileSync(path.join(folder, 'shots', '002-seen.png')).equals(readFileSync(path.join(folder, 'shots', '002.png')))).toBe(false);
    });

    it("with The Phantom's own 1200 ms Settle, the Settle waits out the move and the tap hits the button", async () => {
      const { outcome, recorder, runner, folder, run } = await phantomRun('moving-full-settle', '/phantom-moving.html', phantomGhost.createBody);

      expect(outcome).toEqual({ result: 'succeeded' });
      expect(run.steps).toHaveLength(2);
      expect(recorder.steps[1]!.trace.click!.hitText).toBe('Pay this bill');
      expect(runner.findings).toEqual([]);
      // The seen screenshot was kept in memory but no Finding refers to it, so it is not written.
      expect(recorder.hasSeenScreenshot(2)).toBe(true);
      expect(listing(folder)).toEqual(['run.json', 'shots', 'shots/001.png', 'shots/002.png']);
    });

    it('records nothing for a button that stays where it was seen', async () => {
      const { outcome, recorder, runner, folder, run } = await phantomRun('stable', '/phantom-stable.html', earlySightBody);

      expect(outcome).toEqual({ result: 'succeeded' });
      expect(run.steps.map((s) => s.action)).toEqual([`Open ${server.url('/phantom-stable.html')}`, 'Click "Pay this bill"']);
      expect(recorder.steps[1]!.trace.click!.hitText).toBe('Pay this bill');
      expect(runner.findings).toEqual([]);
      expect(run.findings).toEqual([]);
      expect(recorder.hasSeenScreenshot(2)).toBe(true);
      expect(listing(folder)).toEqual(['run.json', 'shots', 'shots/001.png', 'shots/002.png']);
    });
  });

  describe.concurrent('slow_wait', () => {
    /**
     * Opens the page with The Phantom's exact Body and lets The Phantom's Mind look and decide, Step
     * after Step, as the run loop does, until a Finding stops the Run (The Phantom's stop rule) or the
     * bill appears. Every decision on these pages must be a wait.
     */
    async function waitOnPage(fixture: string) {
      const page = await context.newPage();
      try {
        const cdp = await context.newCDPSession(page);
        const rng = mulberry32(1);
        const recorder = new Recorder({
          width: phantomProfile.width,
          height: phantomProfile.height,
          deviceScaleFactor: phantomProfile.deviceScaleFactor,
        });
        const runner = new DetectorRunner({ detectors: phantomGhost.detectors(), page, cdp, config, site, recorder });
        const body = phantomGhost.createBody(page, cdp, { rng, site, profile: phantomProfile });
        const mind = phantomGhost.createMind(mission, { rng });
        const stopped = () => phantomStopRule({ steps: recorder.steps, findingCounts: runner.findingCounts, mission });

        recorder.add(await body.open(server.url(fixture)), OPENING_THOUGHT);
        expect(await runner.observe(recorder.last!)).toBeNull();

        let billShown = false;
        for (let i = 0; i < 8 && stopped() === null; i++) {
          billShown = await page.locator('#bill').isVisible();
          if (billShown) break;
          const { perception, probe } = await body.perceive();
          const decision = mind.decide(perception);
          expect(decision.kind === 'act' && decision.action.type === 'wait', JSON.stringify(decision)).toBe(true);
          if (decision.kind !== 'act') break;
          recorder.add(await body.act(decision.action), decision.thought, probe, { intentionId: decision.intentionId, recovery: false });
          expect(await runner.observe(recorder.last!)).toBeNull();
        }
        const sinceLoad = (await page.evaluate(
          "performance.now() - performance.getEntriesByType('navigation')[0].loadEventEnd",
        )) as number;
        return { recorder, runner, stopReason: stopped(), billShown, sinceLoad };
      } finally {
        await page.close();
      }
    }

    it('records a wait of more than 10 s on a page that stays blank for 12 s after load', async () => {
      const { recorder, runner, stopReason } = await waitOnPage('/phantom-blank.html');

      expect(runner.findings).toHaveLength(1);
      const finding = runner.findings[0]!;
      expect(finding).toMatchObject({ type: 'slow_wait', screenshot: 'step', title: 'Long wait with no sign of progress' });
      // The wait began with opening the page and went on through the wait Steps after it.
      expect(recorder.steps.slice(1).every((s) => s.step.action === 'Wait')).toBe(true);
      expect(finding.stepN).toBe(recorder.steps.length);
      const measured = /^Waited (\d+\.\d) seconds from step 1 to step (\d+) with nothing changing on the screen and no loading sign/.exec(
        finding.evidence,
      );
      expect(measured, finding.evidence).not.toBeNull();
      expect(Number(measured![1])).toBeGreaterThan(10);
      expect(Number(measured![1])).toBeLessThan(13);
      expect(Number(measured![2])).toBe(finding.stepN);
      expect(finding.evidence).toMatch(/The screen showed no text\.$|The screen showed: "Your bill/);
      // The Phantom gives up with slow_wait at this Step.
      expect(stopReason).toBe('slow_wait');
    });

    it('records nothing while a spinner is visible for the same 12 s', async () => {
      const { recorder, runner, stopReason, billShown, sinceLoad } = await waitOnPage('/phantom-spinner.html');

      // The Phantom waited through the whole 12 s until the bill replaced the spinner.
      expect(billShown).toBe(true);
      expect(sinceLoad).toBeGreaterThanOrEqual(12_000);
      expect(recorder.steps.length).toBeGreaterThanOrEqual(4);
      expect(recorder.steps.slice(1).every((s) => s.step.action === 'Wait')).toBe(true);
      // Until the Step in which the bill appeared, the spinner was a sign of progress in every waiting span.
      for (const { trace } of recorder.steps.slice(0, -1)) {
        for (const span of trace.waits) expect(span.progress.length, JSON.stringify(span)).toBeGreaterThan(0);
      }
      expect(runner.findings).toEqual([]);
      expect(stopReason).toBeNull();
    });
  });
});
