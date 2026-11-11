import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { HauntConfig } from '../src/config/loadConfig.ts';
import { DetectorRunner } from '../src/core/detectors.ts';
import { Recorder } from '../src/core/recorder.ts';
import type { ActionResult } from '../src/core/types.ts';
import { createUntranslatedDetector, englishWords } from '../src/detectors/untranslated.ts';
import { pageInitScripts } from '../src/ghosts/registry.ts';

/**
 * The `untranslated` Detector: the word counting on its own, and a small page in Chromium through the
 * real DetectorRunner and Recorder, with hand-made Steps. Fixture-page tests come with task 20.5.
 * **Validates: Requirements 19.2, 19.4**
 */

const config: HauntConfig = {
  allowedDomains: [],
  sites: { 'lantern-bills': { name: 'Lantern Bills demo', allowedTerms: ['Lantern Bills'] } },
};
const site = config.sites['lantern-bills']!;
const leaveOut = { allowedTerms: ['Lantern Bills'], typed: [] as string[] };

describe('englishWords', () => {
  it('counts English words of three or more letters', () => {
    expect(englishWords('Pay this bill', leaveOut)).toEqual(['Pay', 'this', 'bill']);
    expect(englishWords('ਬਿੱਲ ਦਾ ਭੁਗਤਾਨ ਕਰੋ', leaveOut)).toEqual([]);
    expect(englishWords('ਕਾਰਡ to be', leaveOut)).toEqual([]);
  });

  it('leaves out allowed terms (any case), acronyms and tokens with digits', () => {
    expect(englishWords('© 2026 Lantern Bills', leaveOut)).toEqual([]);
    expect(englishWords('LANTERN BILLS ਵਿੱਚ ਸੁਆਗਤ', leaveOut)).toEqual([]);
    expect(englishWords('CVV MM/YY', leaveOut)).toEqual([]);
    expect(englishWords('₹2,490.00 INV2026 abc123', leaveOut)).toEqual([]);
    expect(englishWords('Enter CVV here', leaveOut)).toEqual(['Enter', 'here']);
  });

  it('leaves out what the Ghost typed, but only as whole words', () => {
    expect(englishWords('ਨਾਮ: Asha Kaur', { ...leaveOut, typed: ['Asha Kaur'] })).toEqual([]);
    expect(englishWords('Pay the bill', { ...leaveOut, typed: ['a', 'Pay'] })).toEqual(['the', 'bill']);
  });
});

const PAGE = `<!doctype html>
<html lang="pa-IN"><head><meta charset="utf-8"><title>t</title>
<style>
  body { margin: 0; font: 16px sans-serif; }
  .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
</style></head>
<body>
  <h1>Lantern Bills</h1>
  <p>ਤੁਹਾਡਾ ਬਿੱਲ ₹2,490.00</p>
  <button id="pay">Pay this bill</button>
  <span class="sr-only">Opens a new window</span>
  <p style="display:none">Hidden English text here</p>
  <label for="cvv">CVV</label><input id="cvv" placeholder="MM/YY">
  <label for="name">ਨਾਮ</label><input id="name" placeholder="ਕਾਰਡ ਉੱਤੇ ਨਾਮ">
  <p id="echo"></p>
  <div style="height: 2000px"></div>
  <p id="later">Your card was declined</p>
  <div style="height: 2000px"></div>
  <p id="never">Card number is invalid</p>
  <footer>© 2026 Lantern Bills</footer>
</body></html>`;

function actionResult(text: string): ActionResult {
  return {
    actionText: text,
    spoken: '',
    focusBox: null,
    screenshot: Buffer.from('png'),
    trace: {
      pathBefore: '/',
      pathAfter: '/',
      keys: [],
      touchedKeys: [],
      actionEndedAt: 0,
      readyAt: 0,
      waits: [],
      announcements: [],
    },
  };
}

describe('untranslated Detector on a small page in Chromium', () => {
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch();
    context = await browser.newContext({ viewport: { width: 640, height: 400 } });
    for (const source of pageInitScripts) await context.addInitScript(source);
    page = await context.newPage();
    await page.route('http://haunt.test/**', (route) => route.fulfill({ body: PAGE, contentType: 'text/html; charset=utf-8' }));
    await page.goto('http://haunt.test/');
  }, 60_000);

  afterAll(async () => {
    await context?.close();
    await browser?.close();
  });

  it('records English text at the first Step it is in view, and text never in view at the end', async () => {
    const recorder = new Recorder({ width: 640, height: 400, deviceScaleFactor: 2 });
    const runner = new DetectorRunner({ detectors: [createUntranslatedDetector()], page, cdp: { send: async () => ({}) } as never, config, site, recorder });
    const domBefore = await page.evaluate('document.documentElement.outerHTML');

    recorder.add(actionResult('Open http://haunt.test/'), 'Looking.');
    expect(await runner.observe(recorder.last!)).toBeNull();
    expect(runner.findings.map((f) => [f.stepN, f.evidence.slice(0, 40)])).toEqual([
      [1, 'The button text "Pay this bill" is in En'],
    ]);
    expect(runner.findings[0]!.evidence).toContain('lang="pa-IN"');
    expect(runner.findings[0]!.evidence).toContain('"Pay", "this" and "bill"');
    expect(runner.findings[0]!.evidence).toContain('on page /');

    // Step 2: Bebe types her name; the page echoes it and the field holds it.
    expect(await page.evaluate('document.documentElement.outerHTML')).toBe(domBefore); // the Detector changed nothing
    await page.evaluate(() => {
      (document.getElementById('name') as HTMLInputElement).value = 'Asha Kaur';
      document.getElementById('echo')!.textContent = 'Asha Kaur';
    });
    recorder.add(actionResult('Type "Asha Kaur"'), 'Typing.');
    expect(await runner.observe(recorder.last!)).toBeNull();
    expect(runner.findings).toHaveLength(1);

    // Step 3: the page scrolls down to "Your card was declined".
    await page.evaluate(() => document.getElementById('later')!.scrollIntoView());
    recorder.add(actionResult('Scroll down'), 'Scrolling.');
    expect(await runner.observe(recorder.last!)).toBeNull();
    expect(runner.findings.map((f) => f.stepN)).toEqual([1, 3]);
    expect(runner.findings[1]!.evidence).toContain('"Your card was declined"');
    expect(runner.findings[1]!.evidence).not.toContain('outside the visible part');

    // The end: the text never in view goes at the first Step it was present, and says so.
    expect(await runner.finish()).toBeNull();
    expect(runner.findings.map((f) => f.stepN)).toEqual([1, 3, 1]);
    const never = runner.findings[2]!;
    expect(never.evidence).toContain('"Card number is invalid"');
    expect(never.evidence.endsWith('It was outside the visible part of the screen.')).toBe(true);
    expect(never.title).toBe('Text is in English on a Punjabi page');
  }, 60_000);

  it('does nothing on a page that is not shown in Punjabi', async () => {
    await page.route('http://haunt.test/en', (route) =>
      route.fulfill({ body: PAGE.replace('lang="pa-IN"', 'lang="en"'), contentType: 'text/html; charset=utf-8' }),
    );
    await page.goto('http://haunt.test/en');
    const recorder = new Recorder({ width: 640, height: 400, deviceScaleFactor: 2 });
    const runner = new DetectorRunner({ detectors: [createUntranslatedDetector()], page, cdp: { send: async () => ({}) } as never, config, site, recorder });
    recorder.add(actionResult('Open http://haunt.test/en'), 'Looking.');
    expect(await runner.observe(recorder.last!)).toBeNull();
    expect(await runner.finish()).toBeNull();
    expect(runner.findings).toEqual([]);
  }, 60_000);
});
