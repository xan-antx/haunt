import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { HauntConfig } from '../src/config/loadConfig.ts';
import { DetectorRunner } from '../src/core/detectors.ts';
import { Recorder } from '../src/core/recorder.ts';
import type { ActionResult, RunState, StepTrace } from '../src/core/types.ts';
import { createFocusTrapDetector, listenerStopRule } from '../src/detectors/focusTrap.ts';
import { pageInitScripts } from '../src/ghosts/registry.ts';
import { loadMission } from '../src/missions/loadMission.ts';
import { startFixtureServer, type FixtureServer } from './fixtureServer.ts';

/**
 * The element part of the `focus_trap` Detector, in Chromium against `element-trap.html`.
 * The test presses the keys itself and logs each press in the Step's trace, as The Listener's Body does.
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.7, 3.8, 3.9, 9.1**
 */
const config: HauntConfig = {
  allowedDomains: [],
  sites: { 'lantern-bills': { name: 'Lantern Bills demo', allowedTerms: ['Lantern Bills'] } },
};
const site = config.sites['lantern-bills']!;
const mission = loadMission(fileURLToPath(new URL('../missions/', import.meta.url)), 'pay-bill');

type TraceKey = StepTrace['keys'][number];

describe('focus_trap element part in Chromium', () => {
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
    await session.send('Accessibility.enable');
  }, 60_000);

  afterAll(async () => {
    await context?.close();
    await browser?.close();
    await server?.close();
  });

  async function startRun(pathname: string) {
    await page.goto(server.url(pathname));
    const recorder = new Recorder({ width: 800, height: 600, deviceScaleFactor: 1 });
    const runner = new DetectorRunner({ detectors: [createFocusTrapDetector()], page, cdp: session, config, site, recorder });

    async function press(key: string): Promise<TraceKey> {
      await page.keyboard.press(key);
      const focus = (await page.evaluate('window.__haunt.keys.focus()')) as { focusKey: string | null; dialogKey: string | null };
      return { key, focusKey: focus.focusKey, dialogKey: focus.dialogKey };
    }

    async function step(text: string, keys: string[] = []): Promise<void> {
      const logged: TraceKey[] = [];
      for (const key of keys) logged.push(await press(key));
      const result: ActionResult = {
        actionText: text,
        spoken: '',
        focusBox: null,
        screenshot: Buffer.from('png'),
        trace: { pathBefore: '/', pathAfter: '/', keys: logged, touchedKeys: [], actionEndedAt: 0, readyAt: 0, waits: [], announcements: [] },
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

  it('records a trapped text box at the Step of the second Escape, even when Escape pressed twice frees focus', async () => {
    const { recorder, runner, step } = await startRun('/element-trap.html');
    await step('Tab', ['Tab']);
    await step('Shift+Tab', ['Shift+Tab']);
    expect(runner.findings).toHaveLength(0);
    expect(listenerStopRule(stateOf(runner, recorder))).toBeNull();
    await step('Escape twice', ['Escape', 'Escape']);
    expect(await page.evaluate('document.activeElement.id')).toBe('after');

    expect(runner.findings).toHaveLength(1);
    const finding = runner.findings[0]!;
    expect(finding.type).toBe('focus_trap');
    expect(finding.stepN).toBe(4);
    expect(finding.title).toBe('Keyboard focus is trapped in a text box');
    expect(finding.evidence).toContain('Keyboard focus could not leave a text box with no name (role textbox).');
    expect(finding.evidence).toContain('Tab (1 press)');
    expect(finding.evidence).toContain('Shift+Tab (1 press)');
    expect(finding.evidence).toContain('Escape pressed twice did free focus');
    expect(finding.evidence).toContain('This exit is undocumented: no text on the page and no announcement says that Escape works.');
    expect(finding.evidence).toContain('Nothing was announced while focus was stuck.');
    expect(finding.evidence).not.toMatch(/dialog|modal|pop-?up/i);
    expect(listenerStopRule(stateOf(runner, recorder))).toBe('trapped');
  });

  it('names the text box with the name Chromium computes', async () => {
    const { runner, step } = await startRun('/element-trap.html?label=1');
    await step('Tab', ['Tab']);
    await step('Shift+Tab', ['Shift+Tab']);
    await step('Escape twice', ['Escape', 'Escape']);
    expect(runner.findings[0]!.evidence).toContain('Keyboard focus could not leave the text box "Note" (role textbox).');
  });

  it('shows the name Chromium computes, which is the aria-placeholder text when that is all there is', async () => {
    const { runner, step } = await startRun('/element-trap.html?aph=1');
    await step('Tab', ['Tab']);
    await step('Shift+Tab', ['Shift+Tab']);
    await step('Escape twice', ['Escape', 'Escape']);
    expect(runner.findings[0]!.evidence).toContain('Keyboard focus could not leave the text box "Any thoughts..." (role textbox).');
  });

  it('still records the finding when the page says that Escape works, and says so', async () => {
    const { recorder, runner, step } = await startRun('/element-trap.html?hint=1');
    await step('Tab', ['Tab']);
    await step('Shift+Tab', ['Shift+Tab']);
    await step('Escape twice', ['Escape', 'Escape']);
    expect(runner.findings).toHaveLength(1);
    const evidence = runner.findings[0]!.evidence;
    expect(evidence).toContain('Escape pressed twice did free focus');
    expect(evidence).toContain('The page does mention that Escape works, but Tab and Shift+Tab still cannot leave the text box.');
    expect(evidence).not.toContain('undocumented');
    expect(listenerStopRule(stateOf(runner, recorder))).toBe('trapped');
  });

  it('records a named text box after a Tab-based jump of 50 presses, then Shift+Tab and Escape in separate Steps', async () => {
    // The Memos run, step 26: "Next button (Tab ×50)" left focus on the editor ("Any thoughts...").
    const { recorder, runner, step } = await startRun('/element-trap.html?aph=1');
    await step('Next button (Tab ×50)', Array.from({ length: 50 }, () => 'Tab'));
    expect(runner.findings).toHaveLength(0);
    await step('Shift+Tab', ['Shift+Tab']);
    await step('Escape', ['Escape']);
    await step('Escape', ['Escape']);
    expect(await page.evaluate('document.activeElement.id')).toBe('after');

    expect(runner.findings).toHaveLength(1);
    const finding = runner.findings[0]!;
    expect(finding.type).toBe('focus_trap');
    expect(finding.stepN).toBe(5);
    expect(finding.evidence).toContain('Keyboard focus could not leave the text box "Any thoughts..." (role textbox).');
    expect(finding.evidence).toContain('Tab (50 presses)');
    expect(finding.evidence).toContain('Shift+Tab (1 press)');
    expect(finding.evidence).toContain('Escape pressed twice did free focus');
    expect(finding.evidence).toContain('This exit is undocumented');
    expect(listenerStopRule(stateOf(runner, recorder))).toBe('trapped');
  });

  it('records a text box that Escape pressed twice does not free', async () => {
    const { recorder, runner, step } = await startRun('/element-trap.html?escape=never');
    await step('Tab', ['Tab']);
    await step('Shift+Tab', ['Shift+Tab']);
    await step('Escape twice', ['Escape', 'Escape']);
    expect(runner.findings).toHaveLength(1);
    expect(runner.findings[0]!.stepN).toBe(4);
    expect(runner.findings[0]!.evidence).toContain('Escape pressed twice did not move focus either.');
    expect(listenerStopRule(stateOf(runner, recorder))).toBe('trapped');
  });

  it('reports an open trap from finish() at the Step that completed the Tab and Shift+Tab pair', async () => {
    const { runner, step } = await startRun('/element-trap.html?escape=never');
    await step('Tab', ['Tab']);
    await step('Shift+Tab', ['Shift+Tab']);
    expect(runner.findings).toHaveLength(0);
    expect(await runner.finish()).toBeNull();
    expect(runner.findings).toHaveLength(1);
    expect(runner.findings[0]!.stepN).toBe(3);
    expect(runner.findings[0]!.evidence).toContain('No key moved focus before the run ended.');
  });

  it('records nothing when Tab moves focus away', async () => {
    const { runner, step } = await startRun('/element-trap.html?tab=free');
    await step('Tab', ['Tab']);
    expect(await page.evaluate('document.activeElement.id')).toBe('after');
    await step('Shift+Tab', ['Shift+Tab']);
    await step('Escape twice', ['Escape', 'Escape']);
    expect(await runner.finish()).toBeNull();
    expect(runner.findings).toHaveLength(0);
  });

  it('gives only the dialog finding for a trap inside a dialog', async () => {
    const { runner, step } = await startRun('/element-trap.html?dialog=1&escape=never');
    await step('Tab', ['Tab']);
    await step('Shift+Tab', ['Shift+Tab']);
    await step('Escape', ['Escape']);
    expect(await runner.finish()).toBeNull();
    expect(runner.findings).toHaveLength(1);
    expect(runner.findings[0]!.title).toBe('Keyboard focus is trapped in a dialog');
  });
});
