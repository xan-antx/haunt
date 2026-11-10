import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { HauntConfig } from '../src/config/loadConfig.ts';
import { finalizeRun, type FindingInput } from '../src/core/finalize.ts';
import { DetectorRunner } from '../src/core/detectors.ts';
import { Recorder } from '../src/core/recorder.ts';
import { formatRunId } from '../src/core/runId.ts';
import type { ActionResult, Detector, FindingType, StepTrace } from '../src/core/types.ts';
import { createFocusTrapDetector } from '../src/detectors/focusTrap.ts';
import { createUnannouncedErrorDetector } from '../src/detectors/unannouncedError.ts';
import { createUnlabeledButtonDetector } from '../src/detectors/unlabeledButton.ts';
import { enableAccessibility } from '../src/ghosts/listener/ax.ts';
import { pageInitScripts } from '../src/ghosts/registry.ts';
import { loadMission } from '../src/missions/loadMission.ts';
import { readFocusKeys } from '../src/page/elementKeys.ts';
import { drainLiveAnnouncements } from '../src/page/liveRegions.ts';
import { startFixtureServer, type FixtureServer } from './fixtureServer.ts';

/**
 * The three Listener Detectors together, in Chromium, through one real DetectorRunner and a Recorder.
 *
 * Part 1 runs all three on a Lantern-Bills-like page (`listener-detectors-lantern.html`) that is driven
 * with real key presses, and checks that they coexist, record each problem once at the right Step, leave
 * the page alone, and give evidence with the measured facts.
 * Part 2 is the positive/negative pair for each Detector. Every page is watched by all three Detectors.
 *
 * The Steps are fake: the test presses the keys itself and logs each press in the Step's trace with the
 * focus and dialog keys, and drains the Live_Announcements into the trace, the way the Listener's Body does.
 * **Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 12.2, 7.3, 7.5, 7.6**
 */

const config: HauntConfig = {
  allowedDomains: [],
  sites: { 'lantern-bills': { name: 'Lantern Bills demo', allowedTerms: ['Lantern Bills'] } },
};
const site = config.sites['lantern-bills']!;
const mission = loadMission(fileURLToPath(new URL('../missions/', import.meta.url)), 'pay-bill');

type TraceKey = StepTrace['keys'][number];

interface StepOptions {
  /** Page-side code that changes the page before the keys are pressed (stands for the page's own timers). */
  act?: string;
  keys?: string[];
  /** How many times the Detectors observe the Step. Observing more than once must change nothing. */
  observes?: number;
}

interface Play {
  recorder: Recorder;
  runner: DetectorRunner;
  step(text: string, options?: StepOptions): Promise<void>;
}

const types = (findings: readonly FindingInput[]): FindingType[] => findings.map((f) => f.type).sort();
const ofType = (findings: readonly FindingInput[], type: FindingType): FindingInput[] =>
  findings.filter((f) => f.type === type);

describe('The Listener Detectors together in Chromium', () => {
  let server: FixtureServer;
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let session: CDPSession;

  beforeAll(async () => {
    server = await startFixtureServer();
    browser = await chromium.launch();
    context = await browser.newContext({ viewport: { width: 800, height: 600 } });
    for (const source of pageInitScripts) await context.addInitScript(source);
    page = await context.newPage();
    session = await context.newCDPSession(page);
    await enableAccessibility(session);
  }, 60_000);

  afterAll(async () => {
    await context?.close();
    await browser?.close();
    await server?.close();
  });

  const allThree = (): Detector[] => [
    createUnlabeledButtonDetector(),
    createFocusTrapDetector(),
    createUnannouncedErrorDetector(),
  ];

  /** Opens a fixture and starts a Run on it with the given Detectors. */
  async function startPlay(pathname: string, detectors: Detector[]): Promise<Play> {
    await page.goto(server.url(pathname));
    await drainLiveAnnouncements(page); // nothing announced before the Run starts
    const recorder = new Recorder({ width: 800, height: 600, deviceScaleFactor: 1 });
    const runner = new DetectorRunner({ detectors, page, cdp: session, config, site, recorder });

    async function step(text: string, options: StepOptions = {}): Promise<void> {
      if (options.act) await page.evaluate(options.act);
      const logged: TraceKey[] = [];
      for (const key of options.keys ?? []) {
        await page.keyboard.press(key);
        const focus = await readFocusKeys(page);
        logged.push({ key, focusKey: focus?.focusKey ?? null, dialogKey: focus?.dialogKey ?? null });
      }
      const result: ActionResult = {
        actionText: text,
        spoken: '',
        focusBox: null,
        screenshot: Buffer.from('png'),
        trace: {
          pathBefore: '/pay',
          pathAfter: '/pay',
          keys: logged,
          touchedKeys: [],
          actionEndedAt: 0,
          readyAt: 0,
          waits: [],
          announcements: await drainLiveAnnouncements(page),
        },
      };
      recorder.add(result, 'Listening.');
      for (let i = 0; i < (options.observes ?? 1); i += 1) expect(await runner.observe(recorder.last!)).toBeNull();
    }

    return { recorder, runner, step };
  }

  /** The Lantern-Bills-like walk. Every Step is observed three times to check that Findings are recorded once. */
  async function playLantern(detectors: Detector[]): Promise<Play> {
    const play = await startPlay('/listener-detectors-lantern.html', detectors);
    const observes = 3;
    await play.step('Open the page', { observes }); // 1
    await play.step('Tab x3 to the icon button', { keys: ['Tab', 'Tab', 'Tab'], observes }); // 2
    await play.step('Enter on the icon button', { keys: ['Enter'], observes }); // 3: three errors appear
    await play.step('Enter in the cardholder field', { keys: ['Enter'], observes }); // 4: the dialog opens
    await play.step('Tab', { keys: ['Tab'], observes }); // 5
    await play.step('Tab', { keys: ['Tab'], observes }); // 6: back on a control already reached
    await play.step('Shift+Tab', { keys: ['Shift+Tab'], observes }); // 7: same for Shift+Tab
    await play.step('Escape', { keys: ['Escape'], observes }); // 8: the dialog stays open
    await play.step('Escape again', { keys: ['Escape'], observes }); // 9
    return play;
  }

  describe('all three Detectors on one Lantern-Bills-like page', () => {
    it('record each problem once, at the right Step, with the measured facts', async () => {
      const { recorder, runner } = await playLantern(allThree());
      expect(recorder.steps).toHaveLength(9);
      expect(await runner.finish()).toBeNull();
      expect(await runner.finish()).toBeNull(); // a second finish() adds nothing

      const findings = runner.findings;
      // One Finding per Detector. The named search button, the alert, the aria-describedby error and the
      // dialog's Close button (tabindex -1 but with a name) are not problems of their own.
      expect(types(findings)).toEqual(['focus_trap', 'unannounced_error', 'unlabeled_button']);
      expect(runner.findingCounts).toEqual({ unlabeled_button: 1, focus_trap: 1, unannounced_error: 1 });

      // Every Finding has what Requirement 7.3 asks for, and points to a Step that exists.
      for (const f of findings) {
        expect(Number.isInteger(f.stepN)).toBe(true);
        expect(f.stepN).toBeGreaterThanOrEqual(1);
        expect(f.stepN).toBeLessThanOrEqual(recorder.steps.length);
        expect(f.title.trim()).not.toBe('');
        expect(f.evidence.trim()).not.toBe('');
        expect(f.screenshot).toBe('step');
      }

      // --- unlabeled_button (10.1, 10.2): the Step The Listener first focused it; where, what, which sources, "button".
      const button = ofType(findings, 'unlabeled_button')[0]!;
      expect(button.stepN).toBe(2);
      expect(button.title).toBe('Button has no accessible name');
      expect(button.evidence).toContain('On page /pay');
      expect(button.evidence).toContain('at form#pay-form > div > button#pay-icon');
      expect(button.evidence).toMatch(/button 2 of 2 on the page/);
      expect(button.evidence).toContain('inside a form with no name, within the "Payment Information" section');
      expect(button.evidence).toContain('contains only an <svg aria-hidden="true">');
      expect(button.evidence).toContain('It has no text, no aria-label, no aria-labelledby and no title');
      expect(button.evidence).toContain('a screen reader says only "button"');
      expect(button.evidence).toContain('The Listener first focused it at Step 2.');
      expect(button.evidence).not.toContain('search'); // the named icon-only button is not mentioned

      // --- focus_trap (10.3, 10.4): at the Escape Step; Tab and Shift+Tab reached; unreached controls and why; Escape.
      const trap = ofType(findings, 'focus_trap')[0]!;
      expect(trap.stepN).toBe(8);
      expect(trap.title).toBe('Keyboard focus is trapped in a dialog');
      expect(trap.evidence).toContain('the dialog "Protect your payment"');
      expect(trap.evidence).toContain(
        'Tab (2 presses) reached 2 controls, in order: "Learn more" (button), "Payment protection for ₹99" (checkbox).',
      );
      expect(trap.evidence).toContain('A Tab press landed on "Payment protection for ₹99" (checkbox), which it had already reached');
      expect(trap.evidence).toContain('Shift+Tab (1 press) reached 1 control, in order: "Learn more" (button).');
      expect(trap.evidence).toContain('A Shift+Tab press landed on "Learn more" (button), which it had already reached (Step 7).');
      expect(trap.evidence).toContain(
        '2 visible, enabled controls were never reached: "Close dialog" (button, tabindex="-1") and "Continue" (button, tabindex="-1").',
      );
      expect(trap.evidence).toContain('Escape was pressed at Step 8 and the dialog stayed open, with focus still inside it.');

      // --- unannounced_error (10.5, 10.6): only the silent card error, at the Step where it appeared.
      const error = ofType(findings, 'unannounced_error')[0]!;
      expect(error.stepN).toBe(3);
      expect(error.title).toBe('Error message is not announced');
      expect(error.evidence).toContain('The text "Invalid card number" appeared in <div class="errorText"> at Step 3');
      // Steps 3 to 9 is 7 Steps, although each of them was observed three times.
      expect(error.evidence).toContain('visible for 7 Steps (Steps 3 to 9)');
      expect(error.evidence).toContain('No live region, role="alert" or aria-live announced it');
      expect(error.evidence).toContain('the accessible description of the focused field did not include it');
      expect(error.evidence).toContain('a screen reader user hears nothing');
      expect(error.evidence).toContain('It was still on the screen when the Run ended.');
      // The alert and the described error are heard: they are not in any Finding.
      const all = findings.map((f) => f.evidence).join('\n');
      expect(all).not.toContain('Invalid expiry date');
      expect(all).not.toContain('Cardholder name is required');

      // The Live_Announcements of the page were what made the alert "heard".
      expect(recorder.steps[2]!.trace.announcements).toEqual(['Invalid expiry date']);
    });

    it('make a Run that passes the Run_Schema and the Run_Invariants', async () => {
      const { recorder, runner } = await playLantern(allThree());
      await runner.finish();
      const { problems, run } = finalizeRun({
        runId: formatRunId(new Date(Date.UTC(2026, 9, 31, 14, 5, 59)), 'listener', 'pay-bill'),
        ghost: 'listener',
        mission,
        site,
        url: 'http://localhost:3000/',
        commit: 'abc1234',
        startedAt: new Date(Date.UTC(2026, 9, 31, 14, 5, 59)),
        result: 'gave_up',
        recorder,
        findings: runner.findings,
        screenshotSize: { width: 800, height: 600 },
      });
      expect(problems).toEqual([]);
      expect(run.findings.map((f) => f.step).sort()).toEqual([2, 3, 8]);
      expect(run.findings.every((f) => /^shots\/\d{3}\.png$/.test(f.screenshot))).toBe(true);
    });

    it('do not interfere with each other: the order of the Detectors changes nothing', async () => {
      const forward = await playLantern(allThree());
      await forward.runner.finish();
      const reversed = await playLantern(allThree().reverse());
      await reversed.runner.finish();
      const sorted = (list: readonly FindingInput[]): FindingInput[] =>
        [...list].sort((a, b) => a.type.localeCompare(b.type));
      expect(sorted(reversed.runner.findings)).toEqual(sorted(forward.runner.findings));
      expect(forward.runner.findings).toHaveLength(3);
    });

    it('find the same problems when a Detector runs alone', async () => {
      const unlabeled = await playLantern([createUnlabeledButtonDetector()]);
      await unlabeled.runner.finish();
      const trap = await playLantern([createFocusTrapDetector()]);
      await trap.runner.finish();
      const errors = await playLantern([createUnannouncedErrorDetector()]);
      await errors.runner.finish();
      const together = await playLantern(allThree());
      await together.runner.finish();

      const alone = [...unlabeled.runner.findings, ...trap.runner.findings, ...errors.runner.findings];
      expect(alone).toHaveLength(3);
      for (const f of alone) expect(together.runner.findings).toContainEqual(f);
    });

    it('only read: no focus, key, click, scroll, value or DOM change while they observe and finish', async () => {
      const { recorder, runner } = await playLantern(allThree());

      const snapshot = (): Promise<string> =>
        page.evaluate(
          `document.documentElement.outerHTML + '|' + document.activeElement.id + '|' + window.scrollX + ',' + window.scrollY` +
            ` + '|' + [...document.querySelectorAll('input')].map((i) => i.id + '=' + i.value + ':' + i.checked).join(',')`,
        );
      const before = await snapshot();
      await page.evaluate(`(() => {
        window.__events = 0;
        window.__changes = 0;
        for (const type of ['focus', 'blur', 'focusin', 'focusout', 'click', 'keydown', 'keyup', 'keypress', 'input', 'change',
          'scroll', 'submit', 'mousedown', 'mouseup', 'pointerdown', 'wheel']) {
          addEventListener(type, () => { window.__events += 1; }, true);
        }
        window.__observer = new MutationObserver((records) => { window.__changes += records.length; });
        window.__observer.observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
      })()`);

      for (let i = 0; i < 3; i += 1) expect(await runner.observe(recorder.last!)).toBeNull();
      expect(await runner.finish()).toBeNull();
      expect(await runner.finish()).toBeNull();

      expect(await page.evaluate('window.__observer.takeRecords().length + window.__changes')).toBe(0);
      expect(await page.evaluate('window.__events')).toBe(0);
      expect(await snapshot()).toBe(before);
      expect(runner.findings).toHaveLength(3);
    });

    it('record the focus_trap Finding on the Escape Step, not before, and not twice', async () => {
      const detectors = allThree();
      const play = await startPlay('/listener-detectors-lantern.html', detectors);
      await play.step('Open the page');
      await play.step('Tab x3', { keys: ['Tab', 'Tab', 'Tab'] });
      await play.step('Enter', { keys: ['Enter'] });
      await play.step('Enter in the cardholder field', { keys: ['Enter'] });
      await play.step('Tab', { keys: ['Tab'] });
      await play.step('Tab', { keys: ['Tab'] });
      await play.step('Shift+Tab', { keys: ['Shift+Tab'] });
      expect(ofType(play.runner.findings, 'focus_trap')).toHaveLength(0); // Escape has not been pressed
      await play.step('Escape', { keys: ['Escape'] });
      expect(ofType(play.runner.findings, 'focus_trap').map((f) => f.stepN)).toEqual([8]);
      await play.step('Escape', { keys: ['Escape'] });
      await play.step('Escape', { keys: ['Escape'] });
      expect(ofType(play.runner.findings, 'focus_trap')).toHaveLength(1);
      // The other two Detectors write their Findings when the Run ends.
      expect(play.runner.findings).toHaveLength(1);
      await play.runner.finish();
      expect(types(play.runner.findings)).toEqual(['focus_trap', 'unannounced_error', 'unlabeled_button']);
    });
  });

  describe('unlabeled_button: an icon-only button versus one with aria-label', () => {
    it('records the button that holds only an aria-hidden icon', async () => {
      const { runner, step } = await startPlayOnButton(false);
      await step('Tab', { keys: ['Tab'] });
      await runner.finish();
      expect(runner.findings).toHaveLength(1);
      const f = runner.findings[0]!;
      expect(f.type).toBe('unlabeled_button');
      expect(f.stepN).toBe(2); // the Step at which The Listener focused it
      expect(f.evidence).toContain('form > button#icon');
      expect(f.evidence).toContain('contains only an <svg aria-hidden="true">');
      expect(f.evidence).toContain('It has no text, no aria-label, no aria-labelledby and no title');
      expect(f.evidence).toContain('a screen reader says only "button"');
    });

    it('records nothing when the same button has an aria-label', async () => {
      const { runner, step } = await startPlayOnButton(true);
      await step('Tab', { keys: ['Tab'] });
      await runner.finish();
      expect(runner.findings).toEqual([]);
      const tree = await session.send('Accessibility.getFullAXTree');
      const named = tree.nodes.find((n) => n.role?.value === 'button');
      expect(named?.name?.value).toBe('Pay this bill'); // the Listener hears a name
    });

    async function startPlayOnButton(named: boolean): Promise<Play> {
      const play = await startPlay(named ? '/listener-pair-button.html?named' : '/listener-pair-button.html', allThree());
      await play.step('Open the page', { observes: 2 });
      return play;
    }

    it('uses the Step where the button was first present when it is never focused', async () => {
      const { runner, step } = await startPlayOnButton(false);
      await step('Look around', { observes: 2 });
      await runner.finish();
      expect(runner.findings.map((f) => f.stepN)).toEqual([1]);
      expect(runner.findings[0]!.evidence).toContain('The Listener never focused it; it was first present at Step 1.');
    });
  });

  describe('focus_trap: a trapping dialog versus a dialog that can be left', () => {
    /** Tab round, Shift+Tab round, then Escape, one Step each, like the Listener's search inside a dialog. */
    async function playDialog(pathname: string): Promise<Play> {
      const play = await startPlay(pathname, allThree());
      await play.step('Open the page', { observes: 2 });
      await play.step('Tab', { keys: ['Tab'], observes: 2 });
      await play.step('Tab', { keys: ['Tab'], observes: 2 });
      await play.step('Tab', { keys: ['Tab'], observes: 2 });
      await play.step('Shift+Tab', { keys: ['Shift+Tab'], observes: 2 });
      await play.step('Shift+Tab', { keys: ['Shift+Tab'], observes: 2 });
      await play.step('Escape', { keys: ['Escape'], observes: 2 });
      await play.runner.finish();
      return play;
    }

    it('records the dialog whose Close and Continue have tabindex="-1" and that ignores Escape', async () => {
      const { runner, recorder } = await playDialog('/focus-trap.html');
      expect(types(runner.findings)).toEqual(['focus_trap']);
      const f = runner.findings[0]!;
      expect(f.stepN).toBe(recorder.steps.length); // the Escape Step
      expect(f.evidence).toContain('the dialog "Protect your payment"');
      expect(f.evidence).toContain('"Learn more" (button)');
      expect(f.evidence).toContain('"Close dialog" (button, tabindex="-1")');
      expect(f.evidence).toContain('"Continue" (button, tabindex="-1")');
      expect(f.evidence).toContain('and the dialog stayed open, with focus still inside it');
      expect(await page.evaluate("document.getElementById('dlg').hidden")).toBe(false);
    });

    it('records nothing for a dialog whose controls are all reachable and that closes on Escape', async () => {
      const { runner } = await playDialog('/focus-dialog-ok.html');
      expect(runner.findings).toEqual([]);
      expect(await page.evaluate("document.getElementById('dlg').hidden")).toBe(true);
    });

    it('records nothing for a trapping dialog that closes on Escape', async () => {
      const { runner } = await playDialog('/focus-trap.html?escape=close');
      expect(runner.findings).toEqual([]);
      expect(await page.evaluate("document.getElementById('dlg').hidden")).toBe(true);
    });
  });

  describe('unannounced_error: a silent error versus role="alert" and aria-describedby', () => {
    const SILENT = 'Invalid card number';

    /** Opens the fixture, makes the error appear at Step 2 with the given helper, and lets two more Steps pass. */
    async function playError(helper: string): Promise<Play> {
      const play = await startPlay('/unannounced-error.html', allThree());
      await play.step('Open the page', { observes: 2 });
      await play.step('The page validates', { act: `window.${helper}(${JSON.stringify(SILENT)})`, observes: 2 });
      await play.step('Wait', { observes: 2 });
      await play.step('Wait', { observes: 2 });
      await play.runner.finish();
      return play;
    }

    it('records an error shown in a plain div, at the Step where it appeared', async () => {
      const { runner } = await playError('showSilentError');
      expect(types(runner.findings)).toEqual(['unannounced_error']);
      const f = runner.findings[0]!;
      expect(f.stepN).toBe(2);
      expect(f.evidence).toContain(`The text "${SILENT}" appeared in <div class="errorText"> at Step 2`);
      expect(f.evidence).toContain('visible for 3 Steps (Steps 2 to 4)');
      expect(f.evidence).toContain('No live region, role="alert" or aria-live announced it');
      expect(f.evidence).toContain('the accessible description of the focused field did not include it');
      expect(f.evidence).toContain('It was still on the screen when the Run ended.');
    });

    it('records nothing when the same error is in role="alert"', async () => {
      const { runner, recorder } = await playError('showAlertError');
      expect(runner.findings).toEqual([]);
      expect(recorder.steps[1]!.trace.announcements).toEqual([SILENT]);
    });

    it('records nothing when the error is linked to the focused field with aria-describedby', async () => {
      const { runner, recorder } = await playError('showDescribedError');
      expect(runner.findings).toEqual([]);
      expect(recorder.steps.flatMap((s) => s.trace.announcements)).toEqual([]); // not announced, but in the description
      expect(await page.evaluate('document.activeElement.id')).toBe('card');
    });

    it('records an error that disappears, and says that it disappeared', async () => {
      const play = await startPlay('/unannounced-error.html', allThree());
      await play.step('Open the page');
      await play.step('The page validates', { act: `window.showSilentError(${JSON.stringify(SILENT)})` });
      await play.step('The page clears it', { act: 'window.clearSlot()' });
      await play.runner.finish();
      expect(play.runner.findings.map((f) => f.stepN)).toEqual([2]);
      expect(play.runner.findings[0]!.evidence).toContain('It then disappeared.');
    });
  });

  describe('Requirement 7.5: the same problem is recorded once per Run', () => {
    it('counts a Step once however often it is observed', async () => {
      const play = await startPlay('/unannounced-error.html', [createUnannouncedErrorDetector()]);
      await play.step('Open the page', { observes: 5 });
      await play.step('The page validates', { act: 'window.showSilentError("Invalid card number")', observes: 5 });
      await play.step('Wait', { observes: 5 });
      await play.runner.finish();
      await play.runner.finish();
      expect(play.runner.findings).toHaveLength(1);
      expect(play.runner.findings[0]!.evidence).toContain('visible for 2 Steps (Steps 2 to 3)');
    });

    it('does not record a second unlabeled_button or focus_trap Finding for the same button or dialog', async () => {
      const play = await playLantern(allThree());
      // Three more Steps with more observations.
      await play.step('Shift+Tab', { keys: ['Shift+Tab'], observes: 4 });
      await play.step('Escape', { keys: ['Escape'], observes: 4 });
      await play.runner.finish();
      expect(play.runner.findingCounts).toEqual({ unlabeled_button: 1, focus_trap: 1, unannounced_error: 1 });
    });
  });
});
