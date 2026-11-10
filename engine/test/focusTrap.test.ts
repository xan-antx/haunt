import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { HauntConfig } from '../src/config/loadConfig.ts';
import { DetectorRunner } from '../src/core/detectors.ts';
import { Recorder } from '../src/core/recorder.ts';
import type { ActionResult, RunState, StepTrace } from '../src/core/types.ts';
import { createFocusTrapDetector, listenerStopRule } from '../src/detectors/focusTrap.ts';
import { listenerStopRule as listenerStopRuleFromGhost } from '../src/ghosts/listener/stopRule.ts';
import { pageInitScripts } from '../src/ghosts/registry.ts';
import { loadMission } from '../src/missions/loadMission.ts';
import { startFixtureServer, type FixtureServer } from './fixtureServer.ts';

/**
 * The `focus_trap` Detector and the Listener's stop rule, in Chromium against fixture pages, through
 * the real DetectorRunner and Recorder. The Steps are fake: the test presses the keys itself, the way
 * The Listener would, and logs each press in the Step's trace with the focus and dialog keys from
 * `window.__haunt.keys`, the same way the Listener's Body does.
 * **Validates: Requirements 10.3, 10.4, 11.1, 7.6**
 */

const config: HauntConfig = {
  allowedDomains: [],
  sites: { 'lantern-bills': { name: 'Lantern Bills demo', allowedTerms: ['Lantern Bills'] } },
};
const site = config.sites['lantern-bills']!;
const mission = loadMission(fileURLToPath(new URL('../missions/', import.meta.url)), 'pay-bill');

type TraceKey = StepTrace['keys'][number];

describe('focus_trap Detector and the Listener stop rule in Chromium', () => {
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
  }, 60_000);

  afterAll(async () => {
    await context?.close();
    await browser?.close();
    await server?.close();
  });

  /** Opens a fixture and returns a Recorder and DetectorRunner for a new Run on it. */
  async function startRun(pathname: string) {
    await page.goto(server.url(pathname));
    const recorder = new Recorder({ width: 800, height: 600, deviceScaleFactor: 1 });
    const runner = new DetectorRunner({ detectors: [createFocusTrapDetector()], page, cdp: session, config, site, recorder });

    /** Presses one key like The Listener's Body: log the key with the focus and dialog keys after it. */
    async function press(key: string): Promise<TraceKey> {
      await page.keyboard.press(key);
      const focus = (await page.evaluate('window.__haunt.keys.focus()')) as { focusKey: string | null; dialogKey: string | null };
      return { key, focusKey: focus.focusKey, dialogKey: focus.dialogKey };
    }

    /** Records a Step in which the given keys were pressed, then lets the Detectors observe it. */
    async function step(text: string, keys: string[] = []): Promise<void> {
      const logged: TraceKey[] = [];
      for (const key of keys) logged.push(await press(key));
      const result: ActionResult = {
        actionText: text,
        spoken: '',
        focusBox: null,
        screenshot: Buffer.from('png'),
        trace: {
          pathBefore: '/',
          pathAfter: '/',
          keys: logged,
          touchedKeys: [],
          actionEndedAt: 0,
          readyAt: 0,
          waits: [],
          announcements: [],
        },
      };
      recorder.add(result, 'Listening.');
      expect(await runner.observe(recorder.last!)).toBeNull();
    }

    await step('Open the fixture');
    return { recorder, runner, step };
  }

  const stateOf = (runner: DetectorRunner, recorder: Recorder): RunState => ({
    steps: recorder.steps,
    findingCounts: runner.findingCounts,
    mission,
  });

  it('records the trap at the Escape Step, with the reached controls, the unreached controls and why', async () => {
    const { recorder, runner, step } = await startRun('/focus-trap.html');
    const domBefore = await page.evaluate('document.documentElement.outerHTML');

    // Tab round: the checkbox has focus; Tab goes to "Learn more", then back to the checkbox.
    await step('Tab', ['Tab']);
    await step('Tab', ['Tab']);
    expect(runner.findings).toHaveLength(0); // no Shift+Tab and no Escape yet
    // Shift+Tab round.
    await step('Shift+Tab', ['Shift+Tab']);
    await step('Shift+Tab', ['Shift+Tab']);
    expect(runner.findings).toHaveLength(0); // no Escape yet
    expect(listenerStopRule(stateOf(runner, recorder))).toBeNull();

    // Escape does nothing.
    await step('Escape', ['Escape']);
    expect(recorder.steps).toHaveLength(6);
    expect(runner.findings).toHaveLength(1);

    const finding = runner.findings[0]!;
    expect(finding.type).toBe('focus_trap');
    expect(finding.stepN).toBe(6);
    expect(finding.screenshot).toBe('step');
    expect(finding.title).toBe('Keyboard focus is trapped in a dialog');
    expect(finding.evidence).toContain('the dialog "Protect your payment"');
    expect(finding.evidence).toContain(
      'Tab (2 presses) reached 2 controls, in order: "Learn more" (button), "Payment protection for ₹99" (checkbox).',
    );
    expect(finding.evidence).toContain(
      'A Tab press landed on "Payment protection for ₹99" (checkbox), which it had already reached (Step 3).',
    );
    expect(finding.evidence).toContain(
      'Shift+Tab (2 presses) reached 2 controls, in order: "Learn more" (button), "Payment protection for ₹99" (checkbox).',
    );
    expect(finding.evidence).toContain('A Shift+Tab press landed on "Learn more" (button), which it had already reached (Step 4).');
    expect(finding.evidence).toContain(
      '2 visible, enabled controls were never reached: "Close dialog" (button, tabindex="-1") and "Continue" (button, tabindex="-1").',
    );
    expect(finding.evidence).toContain('Escape was pressed at Step 6 and the dialog stayed open, with focus still inside it.');
    // Disabled and hidden controls are not "visible, enabled" controls.
    expect(finding.evidence).not.toContain('Pay later');
    expect(finding.evidence).not.toContain('Secret');
    expect(finding.evidence).not.toContain('Behind the dialog');

    // The stop rule now ends the Run as trapped.
    expect(runner.findingCounts.focus_trap).toBe(1);
    expect(listenerStopRule(stateOf(runner, recorder))).toBe('trapped');
    expect(listenerStopRuleFromGhost).toBe(listenerStopRule);

    // Observing again, at a later Step, records nothing new.
    await step('Escape again', ['Escape']);
    expect(runner.findings).toHaveLength(1);

    // The Detector only read: the focus and the page are as the key presses left them.
    expect(await page.evaluate('document.activeElement.id')).toBe('cover');
    expect(await page.evaluate('document.documentElement.outerHTML')).toBe(domBefore);
  });

  it('gives the same Finding when the same keys are pressed in one Step, and again on a new Run', async () => {
    const keys = ['Tab', 'Tab', 'Shift+Tab', 'Shift+Tab', 'Escape'];
    const first = await startRun('/focus-trap.html');
    await first.step('Many keys', keys);
    const second = await startRun('/focus-trap.html');
    await second.step('Many keys', keys);

    expect(first.runner.findings).toHaveLength(1);
    expect(first.runner.findings[0]!.stepN).toBe(2);
    expect(second.runner.findings).toEqual(first.runner.findings);
  });

  it('does not fire before all of Tab, Shift+Tab and Escape have happened', async () => {
    // No Shift+Tab: Tab round, then Escape.
    const noShift = await startRun('/focus-trap.html');
    await noShift.step('Tab', ['Tab']);
    await noShift.step('Tab', ['Tab']);
    await noShift.step('Escape', ['Escape']);
    expect(noShift.runner.findings).toHaveLength(0);

    // No Tab repeat: one Tab, one Shift+Tab, then Escape.
    const noRepeat = await startRun('/focus-trap.html');
    await noRepeat.step('Tab', ['Tab']);
    await noRepeat.step('Shift+Tab', ['Shift+Tab']);
    await noRepeat.step('Escape', ['Escape']);
    expect(noRepeat.runner.findings).toHaveLength(0);
    expect(listenerStopRule(stateOf(noRepeat.runner, noRepeat.recorder))).toBeNull();
  });

  it('does not fire when Escape closes the dialog', async () => {
    const { runner, step } = await startRun('/focus-trap.html?escape=close');
    await step('Tab', ['Tab']);
    await step('Tab', ['Tab']);
    await step('Shift+Tab', ['Shift+Tab']);
    await step('Shift+Tab', ['Shift+Tab']);
    await step('Escape', ['Escape']);
    expect(await page.evaluate("document.getElementById('dlg').hidden")).toBe(true);
    expect(runner.findings).toHaveLength(0);
  });

  it('does not fire for a dialog whose controls are all reachable and that closes on Escape', async () => {
    const { runner, recorder, step } = await startRun('/focus-dialog-ok.html');
    // Tab wraps inside the dialog: name, Cancel, OK, then back to the name field.
    await step('Tab', ['Tab', 'Tab', 'Tab']);
    await step('Shift+Tab', ['Shift+Tab', 'Shift+Tab']);
    await step('Escape', ['Escape']);
    expect(await page.evaluate("document.getElementById('dlg').hidden")).toBe(true);
    expect(runner.findings).toHaveLength(0);
    expect(listenerStopRule(stateOf(runner, recorder))).toBeNull();
  });

  it('does not fire when Tab reaches every control, even if Escape does nothing', async () => {
    const { runner, step } = await startRun('/focus-dialog-ok.html?escape=ignore');
    await step('Tab', ['Tab', 'Tab', 'Tab']);
    await step('Shift+Tab', ['Shift+Tab', 'Shift+Tab']);
    await step('Escape', ['Escape']);
    expect(await page.evaluate("document.getElementById('dlg').hidden")).toBe(false);
    expect(runner.findings).toHaveLength(0);
  });

  it('does not fire when focus leaves the dialog', async () => {
    const { runner, step } = await startRun('/focus-dialog-ok.html?trap=off&escape=ignore');
    await step('Tab', ['Tab', 'Tab']); // name -> Cancel -> OK
    await step('Tab', ['Tab']); // OK -> out of the dialog
    expect(await page.evaluate("document.activeElement.closest('[role=dialog]')")).toBeNull();
    await step('Shift+Tab', ['Shift+Tab']);
    await step('Escape', ['Escape']);
    expect(runner.findings).toHaveLength(0);
  });
});

describe('listenerStopRule', () => {
  const state = (findingCounts: RunState['findingCounts']): RunState => ({ steps: [], findingCounts, mission });

  it('returns trapped as soon as a focus_trap Finding exists', () => {
    expect(listenerStopRule(state({ focus_trap: 1 }))).toBe('trapped');
    expect(listenerStopRule(state({ focus_trap: 3, unlabeled_button: 1 }))).toBe('trapped');
  });

  it('returns null when there is no focus_trap Finding', () => {
    expect(listenerStopRule(state({}))).toBeNull();
    expect(listenerStopRule(state({ focus_trap: 0 }))).toBeNull();
    expect(listenerStopRule(state({ unlabeled_button: 2, unannounced_error: 1 }))).toBeNull();
  });
});
