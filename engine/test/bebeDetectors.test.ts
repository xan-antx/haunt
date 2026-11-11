import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { HauntConfig } from '../src/config/loadConfig.ts';
import { DetectorRunner } from '../src/core/detectors.ts';
import { Recorder } from '../src/core/recorder.ts';
import { mulberry32 } from '../src/core/rng.ts';
import type { ActionResult, Body, Probe } from '../src/core/types.ts';
import { createCutOffTextDetector, CUT_OFF_TITLE } from '../src/detectors/cutOffText.ts';
import { createDarkPatternDetector, PRE_TICKED_TITLE, TOTAL_TITLE } from '../src/detectors/darkPattern.ts';
import { createUntranslatedDetector } from '../src/detectors/untranslated.ts';
import { bebeProfile } from '../src/ghosts/bebe/profile.ts';
import { pageInitScripts } from '../src/ghosts/registry.ts';
import { createVisualBody } from '../src/ghosts/visual/body.ts';
import type { Sight, VisualAction } from '../src/ghosts/visual/types.ts';
import { startFixtureServer, type FixtureServer } from './fixtureServer.ts';

/**
 * Bebe's Detectors on local fixture pages (task 20.5), one page where each Detector must record a
 * Finding and one where it must not:
 *
 *   cut_off_text  clipped text that can't be scrolled versus the same text in a box that scrolls;
 *   untranslated  English words versus allowed terms, acronyms and numbers, on a `lang="pa"` page;
 *   dark_pattern  a pre-ticked ₹99 option versus an unticked one and one Bebe ticked herself, and a
 *                 total higher than the bill versus an equal one;
 *
 * and the step rule: a problem below the fold is reported at the Step it scrolls into view, and one
 * that never does is reported from `finish()` at the first Step it was present, with the note that it
 * was outside the visible part of the screen.
 *
 * Every page is opened in Chromium with Bebe's browser profile (640×400 at scale 2, `pa-IN`) and the
 * engine's page init scripts, driven by the real visual Body, and checked through the real
 * DetectorRunner and Recorder with all three of Bebe's Detectors, so each page also shows that the
 * other two Detectors stay quiet. The Body's timing is shortened (Settle 150 ms, Reaction_Delay
 * 50 ms) to keep the test fast; the Detectors don't depend on it.
 * **Validates: Requirements 19.1, 19.2, 19.3, 19.4, 20.3**
 */

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const config: HauntConfig = {
  allowedDomains: [],
  sites: { 'lantern-bills': { name: 'Lantern Bills demo', allowedTerms: ['Lantern Bills'] } },
};
const site = config.sites['lantern-bills']!;

const OUTSIDE = 'It was outside the visible part of the screen.';

interface Run {
  recorder: Recorder;
  runner: DetectorRunner;
  body: Body<Sight, VisualAction>;
}

describe("Bebe's Detectors on fixture pages", () => {
  let server: FixtureServer;
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let session: CDPSession;

  beforeAll(async () => {
    server = await startFixtureServer();
    browser = await chromium.launch();
    context = await browser.newContext({
      viewport: { width: bebeProfile.width, height: bebeProfile.height },
      deviceScaleFactor: bebeProfile.deviceScaleFactor,
      locale: bebeProfile.locale,
      isMobile: bebeProfile.isMobile,
      hasTouch: bebeProfile.hasTouch,
      ...(bebeProfile.extraHTTPHeaders === undefined ? {} : { extraHTTPHeaders: bebeProfile.extraHTTPHeaders }),
    });
    for (const source of pageInitScripts) await context.addInitScript(source);
    page = await context.newPage();
    session = await context.newCDPSession(page);
  });

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  /** Records one Step and runs every Detector after it, as the run loop does. */
  async function record(run: Run, result: Promise<ActionResult>, probe?: Probe): Promise<void> {
    run.recorder.add(await result, 'Looking.', probe);
    expect(await run.runner.observe(run.recorder.last!)).toBeNull();
  }

  /** Starts a Run with a fresh Recorder, Detectors and Body, and records Step 1: opening the page. */
  async function open(path: string): Promise<Run> {
    const recorder = new Recorder({
      width: bebeProfile.width,
      height: bebeProfile.height,
      deviceScaleFactor: bebeProfile.deviceScaleFactor,
    });
    const runner = new DetectorRunner({
      detectors: [createCutOffTextDetector(), createUntranslatedDetector(), createDarkPatternDetector()],
      page,
      cdp: session,
      config,
      site,
      recorder,
    });
    const body = createVisualBody(page, {
      settleQuietMs: 150,
      reactionDelay: { minMs: 50, maxMs: 50 },
      typingDelayMs: 5,
      rng: mulberry32(1),
    });
    const run = { recorder, runner, body };
    await record(run, body.open(server.url(path)));
    return run;
  }

  async function finish(run: Run): Promise<void> {
    expect(await run.runner.finish()).toBeNull();
  }

  /** Bebe looks, then clicks the checkbox the test picks from what she sees. */
  async function clickCheckbox(run: Run, pick: (boxes: Sight['items']) => Sight['items'][number] | undefined): Promise<void> {
    const { perception, probe } = await run.body.perceive();
    const box = pick(perception.items.filter((i) => i.look === 'checkbox'));
    expect(box).toBeDefined();
    await record(run, run.body.act({ type: 'click', itemId: box!.id }), probe);
  }

  describe('cut_off_text', () => {
    it('records text that is clipped and cannot be scrolled', async () => {
      const run = await open('/bebe-cut-off.html');
      await finish(run);

      expect(run.runner.findings.map((f) => [f.type, f.stepN, f.title])).toEqual([['cut_off_text', 1, CUT_OFF_TITLE]]);
      const { evidence } = run.runner.findings[0]!;
      // 140 px wide plus 8 px of padding on each side is a 156 px wide padding box.
      const visible = /^The text "₹2,490\.00" is cut off: only "([^"]+)" fits inside its 156 px wide box \(ਭੁਗਤਾਨ ਸਾਰ\), and the box can't be scrolled\./.exec(
        evidence,
      );
      expect(visible, evidence).not.toBeNull();
      expect('₹2,490.00'.startsWith(visible![1]!)).toBe(true);
      expect(visible![1]).not.toBe('₹2,490.00');
      expect(evidence).toContain('overflow-x: hidden and overflow-y: hidden');
      expect(evidence).not.toContain(OUTSIDE);
    });

    it('records nothing when the overflowing box can be scrolled', async () => {
      const run = await open('/bebe-scrollable.html');
      // The amount really overflows the box: the user can scroll to it.
      expect(await page.evaluate("(() => { const s = document.querySelector('.summary'); return s.scrollWidth > s.clientWidth; })()")).toBe(
        true,
      );
      await finish(run);
      expect(run.runner.findings).toEqual([]);
    });
  });

  describe('untranslated', () => {
    it('records English words on a page shown in Punjabi', async () => {
      const run = await open('/bebe-english.html');
      await finish(run);

      expect(run.runner.findings.map((f) => [f.type, f.stepN])).toEqual([['untranslated', 1]]);
      const { evidence } = run.runner.findings[0]!;
      expect(evidence.startsWith('The button text "Pay this bill" is in English on a page shown in Punjabi (lang="pa").')).toBe(true);
      expect(evidence).toContain('it still has 3 English words: "Pay", "this" and "bill".');
      expect(evidence).toContain('It is on page /bebe-english.html.');
      expect(evidence).not.toContain(OUTSIDE);
    });

    it('records nothing for allowed terms, acronyms, numbers and a single English word', async () => {
      const run = await open('/bebe-allowed-terms.html');
      await finish(run);
      expect(run.runner.findings).toEqual([]);
    });
  });

  describe('dark_pattern: pre-ticked paid option', () => {
    it('records a ₹99 option that was ticked when it appeared', async () => {
      const run = await open('/bebe-pre-ticked.html');
      await finish(run);

      expect(run.runner.findings.map((f) => [f.type, f.stepN, f.title, f.evidence])).toEqual([
        [
          'dark_pattern',
          1,
          PRE_TICKED_TITLE,
          'The paid option "₹99 ਲਈ ਭੁਗਤਾਨ ਸੁਰੱਖਿਆ" (₹99) was already ticked when it appeared on /bebe-pre-ticked.html at Step 1. ' +
            'Bebe did not tick it.',
        ],
      ]);
    });

    it('records nothing for an unticked option, nor for options Bebe ticked herself', async () => {
      const run = await open('/bebe-unticked.html');

      // Step 2: Bebe ticks the ₹99 option the Detector already saw unticked at Step 1.
      await clickCheckbox(run, (boxes) => boxes[0]);
      expect(await page.evaluate("document.getElementById('protection').checked")).toBe(true);

      // Step 3: a ₹49 option appears, and Bebe ticks it before any Detector has seen it. The Detector
      // first sees it ticked, and must tell from the Step's touchedKeys that Bebe ticked it.
      await page.evaluate('window.showReminder()');
      await clickCheckbox(run, (boxes) => boxes.find((b) => b.checked === false));
      expect(await page.evaluate("document.getElementById('reminder').checked")).toBe(true);
      const reminderKey = await page.evaluate("window.__haunt.keys.key(document.getElementById('reminder'))");
      expect(run.recorder.last!.trace.touchedKeys).toEqual([reminderKey]);

      await finish(run);
      expect(run.runner.findings).toEqual([]);
    });
  });

  describe('dark_pattern: total higher than the bill', () => {
    it('records a total higher than the bill amount', async () => {
      const run = await open('/bebe-total-raised.html');
      await finish(run);

      expect(run.runner.findings.map((f) => [f.type, f.stepN, f.title, f.evidence])).toEqual([
        [
          'dark_pattern',
          1,
          TOTAL_TITLE,
          'The total says ₹2,589.00 ("ਕੁੱਲ" ₹2,589.00, on /bebe-total-raised.html) but the bill was ₹2,490.00 (₹99.00 more). ' +
            'The bill amount is the first amount on the first page (/bebe-total-raised.html), read at Step 1.',
        ],
      ]);
    });

    it('records nothing when the total equals the bill amount', async () => {
      const run = await open('/bebe-total-equal.html');
      await finish(run);
      expect(run.runner.findings).toEqual([]);
    });
  });

  describe('the step rule', () => {
    it('reports a problem at the Step it scrolls into view, and one never in view at its first Step, saying so', async () => {
      const run = await open('/bebe-below-fold.html');
      expect(run.runner.findings).toEqual([]);

      // Step 2: one scroll of 320 px; the problems at 760 px are still below the fold.
      await run.body.perceive();
      await record(run, run.body.act({ type: 'scroll', dir: 'down' }));
      expect(await page.evaluate('window.scrollY')).toBe(320);
      expect(run.runner.findings).toEqual([]);

      // Step 3: a second scroll brings them into view.
      await run.body.perceive();
      await record(run, run.body.act({ type: 'scroll', dir: 'down' }));
      expect(await page.evaluate('window.scrollY')).toBe(640);

      const atStep3 = run.runner.findings.map((f) => ({ type: f.type, stepN: f.stepN, evidence: f.evidence }));
      expect(atStep3.map((f) => [f.type, f.stepN])).toEqual([
        ['cut_off_text', 3],
        ['untranslated', 3],
        ['dark_pattern', 3],
        ['dark_pattern', 3],
      ]);
      expect(atStep3[0]!.evidence).toMatch(/^The text "ਭੁਗਤਾਨ ਦਾ ਪੂਰਾ ਵੇਰਵਾ ਇੱਥੇ" is cut off/);
      expect(atStep3[1]!.evidence).toMatch(/^The text "Your card was declined" is in English/);
      // The pre-ticked option was present from Step 1: the evidence says where it first appeared.
      expect(atStep3[2]!.evidence).toMatch(/^The paid option "₹99 ਲਈ ਭੁਗਤਾਨ ਸੁਰੱਖਿਆ" \(₹99\) was already ticked when it appeared on \/bebe-below-fold\.html at Step 1\./);
      expect(atStep3[3]!.evidence).toMatch(/^The total says ₹2,589\.00 /);
      for (const f of atStep3) expect(f.evidence).not.toContain(OUTSIDE);

      // The end of the Run: the problems at 5000 px were never in view. They go at Step 1, where they
      // were first present, and the evidence ends with the note.
      await finish(run);
      const fromFinish = run.runner.findings.slice(4);
      expect(fromFinish.map((f) => [f.type, f.stepN])).toEqual([
        ['cut_off_text', 1],
        ['untranslated', 1],
        ['dark_pattern', 1],
        ['dark_pattern', 1],
      ]);
      expect(fromFinish[0]!.evidence).toMatch(/^The text "ਸ਼ਰਤਾਂ ਅਤੇ ਨਿਯਮ ਬਹੁਤ ਲੰਬੇ ਹਨ" is cut off/);
      expect(fromFinish[1]!.evidence).toMatch(/^The text "Card number is invalid" is in English/);
      expect(fromFinish[2]!.evidence).toMatch(/^The paid option "₹49 ਲਈ SMS ਯਾਦ-ਦਹਾਨੀ" \(₹49\)/);
      expect(fromFinish[3]!.evidence).toMatch(/^The total says ₹2,539\.00 /);
      for (const f of fromFinish) expect(f.evidence.endsWith(OUTSIDE), f.evidence).toBe(true);
      expect(run.runner.findings).toHaveLength(8);
    });
  });
});
