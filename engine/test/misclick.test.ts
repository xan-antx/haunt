import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { HauntConfig } from '../src/config/loadConfig.ts';
import { DetectorRunner } from '../src/core/detectors.ts';
import { Recorder } from '../src/core/recorder.ts';
import { mulberry32 } from '../src/core/rng.ts';
import type { DetectorContext, Probe, RecordedStep, StepTrace } from '../src/core/types.ts';
import { createMisclickDetector, misclickOf } from '../src/detectors/misclick.ts';
import { pageInitScripts } from '../src/ghosts/registry.ts';
import { createVisualBody } from '../src/ghosts/visual/body.ts';
import type { LayoutShiftEntry } from '../src/page/layoutShifts.ts';
import { startFixtureServer, type FixtureServer } from './fixtureServer.ts';

/**
 * The `misclick` Detector: aimed versus hit element key, the layout shifts between the Perception and
 * the click, and both screenshots. Unit tests with fake contexts, and one run in Chromium where the page
 * moves during the Reaction_Delay.
 * **Validates: Requirements 15.3, 15.4**
 */

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

const config: HauntConfig = {
  allowedDomains: [],
  sites: { 'lantern-bills': { name: 'Lantern Bills demo', allowedTerms: ['Lantern Bills'] } },
};
const site = config.sites['lantern-bills']!;

type Click = NonNullable<StepTrace['click']>;

function recorded(n: number, click: Partial<Click> | undefined, probe: Probe): RecordedStep {
  const trace: StepTrace = {
    pathBefore: '/',
    pathAfter: '/',
    keys: [],
    touchedKeys: [],
    actionEndedAt: 0,
    readyAt: 0,
    waits: [],
    announcements: [],
  };
  if (click) {
    trace.click = {
      aimed: { x: 16, y: 170, w: 132, h: 48 },
      point: { x: 82, y: 194 },
      hitKey: 'k2',
      at: 2200,
      aimedItem: 's1',
      aimedText: 'Pay this bill',
      hitText: 'Set up autopay',
      ...click,
    };
  }
  return {
    step: { n, page: '/', action: 'Click "Pay this bill"', spoken: '', thought: '', screenshot: `shots/00${n}.png`, waitMs: 0 },
    trace,
    probe,
  };
}

/** A fake context whose `inspect` answers with the given page clock and shifts, and records its calls. */
function fakeContext(current: RecordedStep, now: number, entries: LayoutShiftEntry[]) {
  const calls: { script: string; arg: unknown }[] = [];
  const ctx: DetectorContext = {
    async inspect<T>(script: string, arg?: unknown): Promise<T> {
      calls.push({ script, arg });
      const { from, to } = arg as { from: number; to: number };
      return { now, entries: entries.filter((e) => e.startTime >= from && e.startTime <= to) } as T;
    },
    cdp: { send: () => Promise.reject(new Error('no CDP in this test')) },
    steps: [current],
    current,
    config,
    site,
  };
  return { ctx, calls };
}

const shift: LayoutShiftEntry = {
  startTime: 1500,
  value: 0.31,
  hadRecentInput: false,
  sources: [{ key: 'k1', tag: 'button', text: 'Pay this bill', previousRect: { x: 16, y: 170, w: 132, h: 48 }, currentRect: { x: 16, y: 290, w: 132, h: 48 } }],
};

describe('misclickOf', () => {
  const probe: Probe = { at: 1000, itemKeys: { s1: 'k1' } };

  it('is a misclick when the hit key differs from the key under the aimed item', () => {
    expect(misclickOf(recorded(3, {}, probe))).toMatchObject({ stepN: 3, aimedKey: 'k1', hitKey: 'k2' });
  });

  it('is not a misclick when the click landed on the aimed element', () => {
    expect(misclickOf(recorded(3, { hitKey: 'k1' }, probe))).toBeNull();
  });

  it('measures nothing without a click, a hit key or an aimed key', () => {
    expect(misclickOf(recorded(3, undefined, probe))).toBeNull();
    expect(misclickOf(recorded(3, { hitKey: null }, probe))).toBeNull();
    expect(misclickOf(recorded(3, {}, { at: 1000, itemKeys: {} }))).toBeNull();
    expect(misclickOf(recorded(3, { aimedItem: undefined }, probe))).toBeNull();
  });
});

describe('misclick Detector with a fake context', () => {
  const probe: Probe = { at: 1000, itemKeys: { s1: 'k1' } };

  it('records the misclick with the shifts in the window, both screenshots and the seen screenshot', async () => {
    const late: LayoutShiftEntry = { ...shift, startTime: 2400, value: 0.5 };
    const { ctx, calls } = fakeContext(recorded(3, {}, probe), 5000, [shift, late]);
    const problems = await createMisclickDetector().observe(ctx);

    expect(calls).toHaveLength(1);
    expect(calls[0]!.arg).toEqual({ from: 1000, to: 2300 });
    expect(problems).toEqual([
      {
        key: 'click-3',
        stepN: 3,
        title: expect.any(String),
        screenshot: 'seen',
        evidence:
          'Aimed at "Pay this bill" (seen at x 16, y 170, 132×48). 1.2 s later the click landed on "Set up autopay". ' +
          'A layout shift of 0.31 happened in between: "Pay this bill" moved from x 16, y 170, 132×48 to x 16, y 290, 132×48. ' +
          'Before: shots/003-seen.png. After: shots/003.png.',
      },
    ]);
  });

  it('says so when no shift was recorded, and when the click replaced the page', async () => {
    const none = await createMisclickDetector().observe(fakeContext(recorded(2, {}, probe), 5000, []).ctx);
    expect(none[0]!.evidence).toContain('No layout shift was recorded in between.');

    const replaced = await createMisclickDetector().observe(fakeContext(recorded(2, {}, probe), 300, [shift]).ctx);
    expect(replaced[0]!.evidence).toContain('The click replaced the page');
    expect(replaced[0]!.evidence).not.toContain('0.31');
  });

  it('records nothing, and reads nothing, for a click on the aimed element', async () => {
    const { ctx, calls } = fakeContext(recorded(2, { hitKey: 'k1' }, probe), 5000, [shift]);
    expect(await createMisclickDetector().observe(ctx)).toEqual([]);
    expect(calls).toEqual([]);
  });
});

describe('misclick Detector in Chromium', () => {
  let server: FixtureServer;
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;

  beforeAll(async () => {
    server = await startFixtureServer();
    browser = await chromium.launch();
    context = await browser.newContext({ viewport: { width: 800, height: 600 } });
    for (const source of pageInitScripts) await context.addInitScript(source);
    page = await context.newPage();
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  it('finds the misclick when the buttons swap places during the Reaction_Delay', async () => {
    const session = await context.newCDPSession(page);
    const recorder = new Recorder({ width: 800, height: 600, deviceScaleFactor: 1 });
    const runner = new DetectorRunner({ detectors: [createMisclickDetector()], page, cdp: session, config, site, recorder });
    const body = createVisualBody(page, {
      settleQuietMs: 150,
      reactionDelay: { minMs: 800, maxMs: 800 },
      typingDelayMs: 5,
      rng: mulberry32(1),
    });

    recorder.add(await body.open(server.url('/visual-moving.html')), 'open');
    expect(await runner.observe(recorder.last!)).toBeNull();

    const { perception, probe } = await body.perceive();
    const pay = perception.items.find((i) => i.text === 'Pay this bill')!;
    const acting = body.act({ type: 'click', itemId: pay.id });
    await new Promise((resolve) => setTimeout(resolve, 200));
    await page.evaluate('window.moveNow()');
    recorder.add(await acting, 'tap', probe);
    expect(await runner.observe(recorder.last!)).toBeNull();

    expect(runner.findings).toHaveLength(1);
    const finding = runner.findings[0]!;
    expect(finding).toMatchObject({ type: 'misclick', stepN: 2, screenshot: 'seen' });
    expect(finding.evidence).toContain('Aimed at "Pay this bill" (seen at x 16, y 100, 200×48)');
    expect(finding.evidence).toContain('the click landed on "Set up autopay"');
    expect(finding.evidence).toContain('"Pay this bill" moved from x 16, y 100, 200×48 to x 16, y 300, 200×48');
    expect(finding.evidence).toContain('Before: shots/002-seen.png. After: shots/002.png.');
    expect(recorder.hasSeenScreenshot(2)).toBe(true);
  });

  it('finds nothing when the page stays still', async () => {
    const session = await context.newCDPSession(page);
    const recorder = new Recorder({ width: 800, height: 600, deviceScaleFactor: 1 });
    const runner = new DetectorRunner({ detectors: [createMisclickDetector()], page, cdp: session, config, site, recorder });
    const body = createVisualBody(page, {
      settleQuietMs: 150,
      reactionDelay: { minMs: 100, maxMs: 100 },
      typingDelayMs: 5,
      rng: mulberry32(1),
    });

    recorder.add(await body.open(server.url('/visual-moving.html')), 'open');
    const { perception, probe } = await body.perceive();
    const pay = perception.items.find((i) => i.text === 'Pay this bill')!;
    recorder.add(await body.act({ type: 'click', itemId: pay.id }), 'tap', probe);
    expect(await runner.observe(recorder.last!)).toBeNull();

    expect(recorder.last!.trace.click!.hitText).toBe('Pay this bill');
    expect(runner.findings).toEqual([]);
  });
});
