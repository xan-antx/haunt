import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { HauntConfig } from '../src/config/loadConfig.ts';
import { DetectorRunner } from '../src/core/detectors.ts';
import { Recorder } from '../src/core/recorder.ts';
import type { ActionResult } from '../src/core/types.ts';
import { createUnannouncedErrorDetector } from '../src/detectors/unannouncedError.ts';
import { drainLiveAnnouncements, LIVE_REGIONS_SOURCE } from '../src/page/liveRegions.ts';
import { startFixtureServer, type FixtureServer } from './fixtureServer.ts';

/**
 * Sanity tests for the `unannounced_error` Detector on a fixture page in Chromium, run through the real
 * DetectorRunner and a Recorder. Each "action" changes the page, then the Live_Announcements made by the
 * change are drained into the Step's trace, as the Listener's Body does.
 * **Validates: Requirements 10.5, 10.6**
 */

const config: HauntConfig = {
  allowedDomains: [],
  sites: { 'lantern-bills': { name: 'Lantern Bills demo', allowedTerms: ['Lantern Bills'] } },
};
const site = config.sites['lantern-bills']!;

const SILENT = 'Invalid card number';

function actionResult(text: string, announcements: string[]): ActionResult {
  return {
    actionText: text,
    spoken: '',
    focusBox: null,
    screenshot: Buffer.from('png'),
    trace: {
      pathBefore: '/unannounced-error.html',
      pathAfter: '/unannounced-error.html',
      keys: [],
      touchedKeys: [],
      actionEndedAt: 0,
      readyAt: 0,
      waits: [],
      announcements,
    },
  };
}

describe('unannounced_error Detector', () => {
  let server: FixtureServer;
  let browser: Browser;
  let context: BrowserContext;

  beforeAll(async () => {
    server = await startFixtureServer();
    browser = await chromium.launch();
    context = await browser.newContext({ viewport: { width: 800, height: 600 } });
    await context.addInitScript({ content: LIVE_REGIONS_SOURCE });
  }, 60_000);

  afterAll(async () => {
    await context?.close();
    await browser?.close();
    await server?.close();
  });

  /**
   * Opens the fixture, then runs each action as one Step (Step 1 is the opening). Detectors observe after
   * every Step and finish at the end. Returns the Findings.
   */
  async function openFixture(): Promise<{ page: Page; session: CDPSession }> {
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    await session.send('Accessibility.enable');
    await page.goto(server.url('/unannounced-error.html'));
    return { page, session };
  }

  async function run(actions: ((page: Page) => Promise<void>)[]) {
    const { page, session } = await openFixture();
    try {
      const recorder = new Recorder({ width: 800, height: 600, deviceScaleFactor: 1 });
      const runner = new DetectorRunner({
        detectors: [createUnannouncedErrorDetector()],
        page,
        cdp: session,
        config,
        site,
        recorder,
      });

      await drainLiveAnnouncements(page);
      recorder.add(actionResult('Open the fixture', []), 'Opening the page.');
      expect(await runner.observe(recorder.last!)).toBeNull();

      for (const [index, action] of actions.entries()) {
        await action(page);
        const announcements = await drainLiveAnnouncements(page);
        recorder.add(actionResult(`action ${index + 2}`, announcements), `Step ${index + 2}.`);
        expect(await runner.observe(recorder.last!)).toBeNull();
      }
      expect(await runner.finish()).toBeNull();
      return { findings: runner.findings, recorder };
    } finally {
      await page.close();
    }
  }

  const call = (fn: string, ...args: unknown[]) => (page: Page) =>
    page.evaluate(`window.${fn}(...${JSON.stringify(args)})`).then(() => undefined);
  const nothing = async () => undefined;

  it('records a Finding at the Step where a silent error div first appeared', async () => {
    const { findings } = await run([nothing, call('showSilentError', SILENT), nothing, nothing]);

    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.type).toBe('unannounced_error');
    expect(finding.stepN).toBe(3);
    expect(finding.title).toBe('Error message is not announced');
    expect(finding.screenshot).toBe('step');
    // Measured facts: the text, the element, how long it stayed, and that nothing announced it.
    expect(finding.evidence).toContain(`"${SILENT}"`);
    expect(finding.evidence).toContain('<div class="errorText">');
    expect(finding.evidence).toContain('visible for 3 Steps');
    expect(finding.evidence).toContain('Steps 3 to 5');
    expect(finding.evidence).toMatch(/No live region, role="alert" or aria-live announced it/);
    expect(finding.evidence).toMatch(/description of the focused field did not include it/);
    expect(finding.evidence).toMatch(/hears nothing/);
  });

  it('gives the same Findings for the same page states and Step history', async () => {
    const actions = [call('showSilentError', SILENT), nothing];
    const first = await run(actions);
    const second = await run(actions);
    expect(second.findings).toEqual(first.findings);
    expect(first.findings).toHaveLength(1);
  });

  it('records no Finding when the same error is in role="alert"', async () => {
    const { findings, recorder } = await run([nothing, call('showAlertError', SILENT), nothing]);
    expect(recorder.steps[2]!.trace.announcements).toEqual([SILENT]);
    expect(findings).toEqual([]);
  });

  it('records no Finding when the error is linked to the focused field with aria-describedby', async () => {
    const { findings, recorder } = await run([call('showDescribedError', SILENT), nothing]);
    expect(recorder.steps.flatMap((s) => s.trace.announcements)).toEqual([]);
    expect(findings).toEqual([]);
  });

  it('records a Finding when the error is linked to a field that does not have the focus', async () => {
    const { findings } = await run([call('showDescribedElsewhere', SILENT), nothing]);
    expect(findings.map((f) => f.stepN)).toEqual([2]);
  });

  it('records no Finding when the text is also put into an aria-live region', async () => {
    const { findings, recorder } = await run([nothing, call('showLiveError', SILENT), nothing]);
    expect(recorder.steps[2]!.trace.announcements).toEqual([SILENT]);
    expect(findings).toEqual([]);
  });

  it('records a Finding when only other text was announced', async () => {
    // An announcement of different text does not make the silent error heard.
    const { findings } = await run([call('showAlertError', 'Saved your changes'), call('showSilentError', SILENT), nothing]);
    expect(findings.map((f) => f.evidence.match(/The text "([^"]+)"/)?.[1])).toEqual([SILENT]);
    expect(findings[0]!.stepN).toBe(3);
  });

  it('records a Finding for a silent error that appears and then disappears', async () => {
    const { findings } = await run([call('showSilentError', SILENT), nothing, call('clearSlot'), nothing]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.stepN).toBe(2);
    expect(findings[0]!.evidence).toContain('visible for 2 Steps');
    expect(findings[0]!.evidence).toContain('Steps 2 to 3');
    expect(findings[0]!.evidence).toContain('It then disappeared.');
  });

  it('records no Finding for an alert that appears and then disappears', async () => {
    const { findings } = await run([call('showAlertError', SILENT), call('clearSlot'), nothing]);
    expect(findings).toEqual([]);
  });

  it('treats the wording alone as error text, without an error class', async () => {
    const { findings } = await run([call('showNote', 'Please enter a valid card number'), nothing]);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.stepN).toBe(2);
    expect(findings[0]!.evidence).toContain('<p class="note">');
  });

  it('treats a Punjabi message as error text', async () => {
    const { findings } = await run([call('showNote', 'ਕਿਰਪਾ ਕਰਕੇ ਕਾਰਡ ਨੰਬਰ ਭਰੋ')]);
    expect(findings.map((f) => f.stepN)).toEqual([2]);
  });

  it('records nothing for ordinary text that is not an error', async () => {
    const { findings } = await run([call('showNote', 'Pay this bill'), nothing]);
    expect(findings).toEqual([]);
  });

  it('records a separate Finding for each silent error', async () => {
    const { findings } = await run([
      call('showSilentError', 'Invalid card number'),
      call('showSilentError', 'Invalid expiry date'),
      nothing,
    ]);
    expect(findings.map((f) => f.stepN)).toEqual([2, 3]);
  });

  it('does not move focus or change the page while it looks', async () => {
    const { page, session } = await openFixture();
    try {
      await page.evaluate(`window.showSilentError(${JSON.stringify(SILENT)}); window.focusField('expiry');`);
      await page.evaluate(`(() => {
        window.__changes = 0;
        new MutationObserver((records) => { window.__changes += records.length; })
          .observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
      })()`);
      const recorder = new Recorder({ width: 800, height: 600, deviceScaleFactor: 1 });
      const runner = new DetectorRunner({
        detectors: [createUnannouncedErrorDetector()],
        page,
        cdp: session,
        config,
        site,
        recorder,
      });
      recorder.add(actionResult('Look', []), 'Looking.');
      for (let i = 0; i < 3; i += 1) expect(await runner.observe(recorder.last!)).toBeNull();
      expect(await page.evaluate('document.activeElement.id + "|" + window.scrollY + "|" + window.__changes')).toBe('expiry|0|0');
    } finally {
      await page.close();
    }
  });
});
