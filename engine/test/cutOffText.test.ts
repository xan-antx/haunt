import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { HauntConfig } from '../src/config/loadConfig.ts';
import { DetectorRunner } from '../src/core/detectors.ts';
import { Recorder } from '../src/core/recorder.ts';
import type { ActionResult } from '../src/core/types.ts';
import { createCutOffTextDetector, OUTSIDE_VIEWPORT_NOTE } from '../src/detectors/cutOffText.ts';
import { pageInitScripts } from '../src/ghosts/registry.ts';

/**
 * Small Chromium test for the `cut_off_text` Detector, through the real DetectorRunner and Recorder,
 * with fake Steps. The page is served inline with `page.route`.
 * **Validates: Requirements 19.1, 19.4**
 */

const config: HauntConfig = {
  allowedDomains: [],
  sites: { 'lantern-bills': { name: 'Lantern Bills demo', allowedTerms: ['Lantern Bills'] } },
};
const site = config.sites['lantern-bills']!;

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><style>
  body { margin: 0; font: 20px/1.2 monospace; }
  .summary { width: 180px; padding: 16px; border: 2px solid; overflow: hidden; white-space: nowrap; }
  .summary h2, .summary dt { white-space: normal; font-size: 16px; }
  .amount { margin: 0; font-size: 40px; overflow: hidden; white-space: nowrap; }
  .scroll { width: 100px; overflow-x: auto; white-space: nowrap; }
  .ellipsis { width: 100px; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .fits { width: 300px; overflow: hidden; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .far { margin-top: 1500px; width: 100px; overflow: clip; white-space: nowrap; }
  .farther { margin-top: 3000px; width: 100px; overflow: hidden; white-space: nowrap; }
</style></head><body>
  <section class="summary" aria-labelledby="h"><h2 id="h">Payment Summary</h2>
    <dl><dt>Total</dt><dd class="amount" id="amount">₹2,490.00</dd></dl>
  </section>
  <div class="scroll" id="scroll">ABCDEFGHIJKLMNOPQRSTUVWXYZ</div>
  <div class="ellipsis" id="ellipsis">Read the tricky terms carefully</div>
  <div class="fits" id="fits">Short text</div>
  <span class="sr-only">Screen reader only text that is long</span>
  <div class="far" id="far">Further down the page here</div>
  <div class="farther" id="farther">Never scrolled into view text</div>
</body></html>`;

function actionResult(text: string): ActionResult {
  return {
    actionText: text,
    spoken: '',
    focusBox: null,
    screenshot: Buffer.from('png'),
    trace: {
      pathBefore: '/cut.html',
      pathAfter: '/cut.html',
      keys: [],
      touchedKeys: [],
      actionEndedAt: 0,
      readyAt: 0,
      waits: [],
      announcements: [],
    },
  };
}

describe('cut_off_text Detector in Chromium', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let session: CDPSession;

  beforeAll(async () => {
    browser = await chromium.launch();
    context = await browser.newContext({ viewport: { width: 640, height: 400 }, deviceScaleFactor: 2 });
    for (const source of pageInitScripts) await context.addInitScript(source);
    page = await context.newPage();
    await page.route('http://haunt.test/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: PAGE }),
    );
    session = await context.newCDPSession(page);
    await page.goto('http://haunt.test/cut.html');
  }, 60_000);

  afterAll(async () => {
    await context?.close();
    await browser?.close();
  });

  it('records clipped, non-scrollable text once, at the right Steps, and leaves scrollable or fitting text alone', async () => {
    const recorder = new Recorder({ width: 640, height: 400, deviceScaleFactor: 2 });
    const runner = new DetectorRunner({
      detectors: [createCutOffTextDetector()],
      page,
      cdp: session,
      config,
      site,
      recorder,
    });
    const domBefore = await page.evaluate('document.documentElement.outerHTML');

    // Step 1: the top of the page is in view.
    recorder.add(actionResult('Open the page'), 'Looking.');
    expect(await runner.observe(recorder.last!)).toBeNull();
    expect(await page.evaluate('window.scrollY')).toBe(0); // the Detector did not scroll
    const atStep1 = runner.findings.map((f) => f.evidence);
    expect(atStep1).toHaveLength(2);

    // The same page again adds nothing.
    recorder.add(actionResult('Wait'), 'Looking.');
    expect(await runner.observe(recorder.last!)).toBeNull();
    expect(runner.findings).toHaveLength(2);

    // Step 3: the test (not the Detector) scrolls to the clipped text further down.
    await page.evaluate("document.getElementById('far').scrollIntoView()");
    recorder.add(actionResult('Scroll'), 'Looking.');
    expect(await runner.observe(recorder.last!)).toBeNull();
    expect(await runner.finish()).toBeNull();

    const findings = runner.findings;
    expect(findings).toHaveLength(4);
    expect(findings.every((f) => f.type === 'cut_off_text' && f.title === 'Text is cut off at 200% zoom')).toBe(true);
    const byText = (t: string) => findings.find((f) => f.evidence.startsWith(`The text "${t}"`))!;

    // The summary total: full text, visible part, the box's width and name, its size and overflow styles.
    const amount = byText('₹2,490.00');
    expect(amount.stepN).toBe(1);
    const visible = /only "([^"]*)" fits inside its 180 px wide box \(Payment Summary\), and the box can't be scrolled\./.exec(
      amount.evidence,
    );
    expect(visible).not.toBeNull();
    expect(visible![1]!.length).toBeGreaterThan(0);
    expect('₹2,490.00'.startsWith(visible![1]!)).toBe(true);
    expect(visible![1]).not.toBe('₹2,490.00');
    expect(amount.evidence).toContain('with overflow-x: hidden and overflow-y: hidden');
    expect(amount.evidence).toMatch(/is 180 × \d+ px inside \(its content is \d+ × \d+ px\)/);
    expect(amount.evidence).not.toContain(OUTSIDE_VIEWPORT_NOTE);

    // Ellipsis: the visible part ends with "…".
    const ellipsis = byText('Read the tricky terms carefully');
    expect(ellipsis.stepN).toBe(1);
    expect(ellipsis.evidence).toMatch(/only "[^"]+…" fits inside its 100 px wide box/);
    expect(ellipsis.evidence).toContain('text-overflow: ellipsis');

    // First in the viewport at Step 3.
    const far = byText('Further down the page here');
    expect(far.stepN).toBe(3);
    expect(far.evidence).toContain('overflow-x: clip');
    expect(far.evidence).not.toContain(OUTSIDE_VIEWPORT_NOTE);

    // Never in the viewport: the first Step at which it was present, and the evidence says so.
    const farther = byText('Never scrolled into view text');
    expect(farther.stepN).toBe(1);
    expect(farther.evidence.endsWith(OUTSIDE_VIEWPORT_NOTE)).toBe(true);

    // Scrollable overflow, text that fits and screen-reader-only text are not Findings.
    const all = findings.map((f) => f.evidence).join('\n');
    expect(all).not.toContain('ABCDEFGHIJ');
    expect(all).not.toContain('Short text');
    expect(all).not.toContain('Screen reader only');

    // The Detector only read.
    expect(await page.evaluate('document.documentElement.outerHTML')).toBe(domBefore);
  });
});
