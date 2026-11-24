import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { HauntConfig } from '../src/config/loadConfig.ts';
import { DetectorRunner } from '../src/core/detectors.ts';
import { Recorder } from '../src/core/recorder.ts';
import type { ActionResult, StepTrace } from '../src/core/types.ts';
import { createUnlabeledFieldDetector } from '../src/detectors/unlabeledField.ts';
import { enableAccessibility } from '../src/ghosts/listener/ax.ts';
import { pageInitScripts } from '../src/ghosts/registry.ts';
import { readFocusKeys } from '../src/page/elementKeys.ts';
import { drainLiveAnnouncements } from '../src/page/liveRegions.ts';
import { startFixtureServer, type FixtureServer } from './fixtureServer.ts';

/**
 * The `unlabeled_field` Detector must add no Finding to the Lantern Bills flow (Requirement 4.3).
 * It plays the same walk as `listenerDetectors.test.ts`, with the Detector deciding on Chromium's computed names.
 * `EXPECTED` is the list of Findings that are allowed to appear. It is empty.
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5**
 */
const EXPECTED: { step: number; evidence: string }[] = [];

const config: HauntConfig = {
  allowedDomains: [],
  sites: { 'lantern-bills': { name: 'Lantern Bills demo', allowedTerms: ['Lantern Bills'] } },
};
const site = config.sites['lantern-bills']!;

type TraceKey = StepTrace['keys'][number];

describe('unlabeled_field on the Lantern Bills flow', () => {
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

  it('adds no Finding to the Lantern Bills walk', async () => {
    await page.goto(server.url('/listener-detectors-lantern.html'));
    await drainLiveAnnouncements(page);
    const recorder = new Recorder({ width: 800, height: 600, deviceScaleFactor: 1 });
    const runner = new DetectorRunner({ detectors: [createUnlabeledFieldDetector()], page, cdp: session, config, site, recorder });

    async function step(text: string, keys: string[] = []): Promise<void> {
      const logged: TraceKey[] = [];
      for (const key of keys) {
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
      expect(await runner.observe(recorder.last!)).toBeNull();
    }

    await step('Open the page');
    await step('Tab x3 to the icon button', ['Tab', 'Tab', 'Tab']);
    await step('Enter on the icon button', ['Enter']);
    await step('Enter in the cardholder field', ['Enter']);
    await step('Tab', ['Tab']);
    await step('Tab', ['Tab']);
    await step('Shift+Tab', ['Shift+Tab']);
    await step('Escape', ['Escape']);
    await step('Escape again', ['Escape']);
    expect(await runner.finish()).toBeNull();

    const found = runner.findings.map((f) => ({ step: f.stepN, evidence: f.evidence }));
    expect(found).toEqual(EXPECTED);
  });
});
