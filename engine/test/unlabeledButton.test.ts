import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { HauntConfig } from '../src/config/loadConfig.ts';
import { DetectorRunner } from '../src/core/detectors.ts';
import { Recorder } from '../src/core/recorder.ts';
import type { ActionResult } from '../src/core/types.ts';
import { createUnlabeledButtonDetector } from '../src/detectors/unlabeledButton.ts';
import { pageInitScripts } from '../src/ghosts/registry.ts';
import { startFixtureServer, type FixtureServer } from './fixtureServer.ts';

/**
 * Sanity test for the `unlabeled_button` Detector: it runs in Chromium against a fixture page, through
 * the real DetectorRunner and Recorder, with fake Steps.
 * **Validates: Requirements 10.1, 10.2**
 */

const config: HauntConfig = {
  allowedDomains: [],
  sites: { 'lantern-bills': { name: 'Lantern Bills demo', allowedTerms: ['Lantern Bills'] } },
};
const site = config.sites['lantern-bills']!;

function actionResult(text: string, focusKey: string | null = null): ActionResult {
  return {
    actionText: text,
    spoken: '',
    focusBox: null,
    screenshot: Buffer.from('png'),
    trace: {
      pathBefore: '/pay',
      pathAfter: '/pay',
      keys: focusKey === null ? [] : [{ key: 'Tab', focusKey, dialogKey: null }],
      touchedKeys: [],
      actionEndedAt: 0,
      readyAt: 0,
      waits: [],
      announcements: [],
    },
  };
}

describe('unlabeled_button Detector on a fixture page in Chromium', () => {
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
    await page.goto(server.url('/unlabeled-button.html'));
  }, 60_000);

  afterAll(async () => {
    await context?.close();
    await browser?.close();
    await server?.close();
  });

  const elementKey = (selector: string, index = 0): Promise<string> =>
    page.evaluate(
      `window.__haunt.keys.key(document.querySelectorAll(${JSON.stringify(selector)})[${index}])`,
    ) as Promise<string>;

  it('records the unnamed buttons only, on the right Steps, with evidence', async () => {
    const recorder = new Recorder({ width: 800, height: 600, deviceScaleFactor: 1 });
    const runner = new DetectorRunner({
      detectors: [createUnlabeledButtonDetector()],
      page,
      cdp: session,
      config,
      site,
      recorder,
    });

    const domBefore = await page.evaluate('document.documentElement.outerHTML');

    // Step 1: nobody has focused anything.
    recorder.add(actionResult('Open the fixture'), 'Listening.');
    expect(await runner.observe(recorder.last!)).toBeNull();
    expect(runner.findings).toHaveLength(0); // Findings are written when the Run ends

    // Step 2: The Listener focuses the second twin. A new unnamed button appears on the page.
    const secondTwin = await elementKey('#twins button', 1);
    await page.evaluate(() => {
      const late = document.createElement('button');
      late.id = 'late';
      late.type = 'button';
      document.body.append(late);
    });
    recorder.add(actionResult('Next button (Tab ×1)', secondTwin), 'Tab.');
    expect(await runner.observe(recorder.last!)).toBeNull();
    // Seeing the same buttons again changes nothing.
    expect(await runner.observe(recorder.last!)).toBeNull();

    expect(await runner.finish()).toBeNull();

    const selectors = runner.findings.map((f) => /> at (.+?) \(button \d+ of \d+ on the page\)/.exec(f.evidence)?.[1] ?? '?');
    expect(selectors.sort()).toEqual(
      [
        'button#late',
        'div#twins > button[type=button]',
        'div#twins > button[type=button]',
        'main > div#role-button',
        'form#pay-form > button#icon-only',
        'main > button#dangling',
      ].sort(),
    );
    expect(runner.findings).toHaveLength(6);
    expect(runner.findings.every((f) => f.type === 'unlabeled_button' && f.screenshot === 'step')).toBe(true);
    expect(new Set(runner.findings.map((f) => f.title))).toEqual(new Set(['Button has no accessible name']));

    // No Finding for the named or hidden buttons.
    const all = runner.findings.map((f) => f.evidence).join('\n');
    for (const id of ['with-label', 'with-labelledby', 'with-title', 'with-text', 'aria-hidden', 'hidden-attr', 'display-none']) {
      expect(all).not.toContain(`#${id}`);
    }

    // The icon-only submit button: first present at Step 1, never focused.
    const icon = runner.findings.find((f) => f.evidence.includes('button#icon-only'))!;
    expect(icon.stepN).toBe(1);
    expect(icon.evidence).toContain('On page /pay');
    expect(icon.evidence).toContain('<button type="submit">');
    expect(icon.evidence).toContain('(button 1 of 9 on the page)');
    expect(icon.evidence).toContain('inside a form with no name, within the "Payment Information" section');
    expect(icon.evidence).toContain('contains only an <svg aria-hidden="true">');
    expect(icon.evidence).toContain('It has no text, no aria-label, no aria-labelledby and no title');
    expect(icon.evidence).toContain('a screen reader says only "button"');
    expect(icon.evidence).toContain('The Listener never focused it; it was first present at Step 1.');

    // A role=button element and a dangling aria-labelledby are unnamed too.
    const roleButton = runner.findings.find((f) => f.evidence.includes('div#role-button'))!;
    expect(roleButton.stepN).toBe(1);
    expect(roleButton.evidence).toContain('<div role="button">');
    const dangling = runner.findings.find((f) => f.evidence.includes('button#dangling'))!;
    expect(dangling.stepN).toBe(1);
    expect(dangling.evidence).toContain('an aria-labelledby ("no-such-id") that points to nothing');
    expect(dangling.evidence).toContain('is empty');

    // Identical twins are two distinct buttons. The one The Listener focused uses the Step of the first focus.
    const twins = runner.findings.filter((f) => f.evidence.includes('div#twins'));
    expect(twins.map((f) => f.stepN).sort()).toEqual([1, 2]);
    expect(twins.find((f) => f.stepN === 2)!.evidence).toContain('The Listener first focused it at Step 2.');
    expect(twins.find((f) => f.stepN === 1)!.evidence).toContain('The Listener never focused it');

    // A button that was not on the page yet uses the first Step on which it was present.
    expect(runner.findings.find((f) => f.evidence.includes('button#late'))!.stepN).toBe(2);

    // The Detector only read: the page is exactly as it was, apart from the button this test added.
    await page.evaluate("document.getElementById('late').remove()");
    expect(await page.evaluate('document.documentElement.outerHTML')).toBe(domBefore);
  });

  it('gives the same Findings for the same page and Step history', async () => {
    const run = async () => {
      const recorder = new Recorder({ width: 800, height: 600, deviceScaleFactor: 1 });
      const runner = new DetectorRunner({
        detectors: [createUnlabeledButtonDetector()],
        page,
        cdp: session,
        config,
        site,
        recorder,
      });
      recorder.add(actionResult('Open the fixture'), 'Listening.');
      await runner.observe(recorder.last!);
      recorder.add(actionResult('Tab', await elementKey('#icon-only')), 'Tab.');
      await runner.observe(recorder.last!);
      await runner.finish();
      return runner.findings;
    };
    const first = await run();
    const second = await run();
    expect(second).toEqual(first);
    expect(first).toHaveLength(5);
    expect(first.find((f) => f.evidence.includes('button#icon-only'))!.stepN).toBe(2);
  });
});
