import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GUARDED_CONTEXT_OPTIONS, installGuard } from '../src/config/guard.ts';
import { mulberry32 } from '../src/core/rng.ts';
import { applyThrottling } from '../src/core/throttling.ts';
import { PHANTOM_LANGUAGES, PHANTOM_USER_AGENT, phantomGhost, phantomProfile, phantomTiming } from '../src/ghosts/phantom/index.ts';
import { listenerProfile } from '../src/ghosts/listener/profile.ts';
import { reactionDelayMs } from '../src/ghosts/visual/body.ts';
import { startFixtureServer, type FixtureServer } from './fixtureServer.ts';

/*
 * The Phantom's profile and pace (Requirements 13.1, 13.3 to 13.5), and `applyThrottling`.
 * The timing of the throttled network itself is the throttling test (task 18.2).
 */

describe('The Phantom profile (Requirement 13.1)', () => {
  it('is a 360 by 640 mobile touch browser, scale 2, en-IN, with an older Android user agent', () => {
    expect(phantomProfile).toMatchObject({
      width: 360,
      height: 640,
      deviceScaleFactor: 2,
      locale: 'en-IN',
      isMobile: true,
      hasTouch: true,
    });
    expect(phantomProfile.userAgent).toBe(PHANTOM_USER_AGENT);
    expect(PHANTOM_USER_AGENT).toMatch(/Android 8\.1\.0/);
    expect(PHANTOM_USER_AGENT).toMatch(/Chrome\/80\./);
    expect(PHANTOM_USER_AGENT).toMatch(/Mobile Safari/);
  });

  it('throttles to Slow 3G (2000 ms, 50 000 bytes/s down and up) and a CPU four times slower', () => {
    expect(phantomProfile.throttling).toEqual({
      network: { latencyMs: 2000, downloadBytesPerSecond: 50_000, uploadBytesPerSecond: 50_000, connectionType: 'cellular3g' },
      cpuRate: 4,
    });
  });

  it('is the Ghost profile, under the id phantom', () => {
    expect(phantomGhost.id).toBe('phantom');
    expect(phantomGhost.profile).toBe(phantomProfile);
  });
});

describe("The Phantom's pace (Requirements 13.3 to 13.5)", () => {
  it('Settles for 1200 quiet ms (at most 20 s), reacts in 550 to 650 ms and types at 120 ms per character', () => {
    expect(phantomTiming).toEqual({
      settleQuietMs: 1200,
      settleMaxMs: 20_000,
      reactionDelay: { minMs: 550, maxMs: 650 },
      typingDelayMs: 120,
    });
    expect(PHANTOM_LANGUAGES).toEqual(['en']);
  });

  it('draws its Reaction_Delay as 550 + floor(rng() * 101), the same for the same seed', () => {
    expect(reactionDelayMs(phantomTiming.reactionDelay, () => 0)).toBe(550);
    expect(reactionDelayMs(phantomTiming.reactionDelay, () => 0.5)).toBe(600);
    expect(reactionDelayMs(phantomTiming.reactionDelay, () => 0.999_999)).toBe(650);

    const first = mulberry32(7);
    const second = mulberry32(7);
    const a = Array.from({ length: 20 }, () => reactionDelayMs(phantomTiming.reactionDelay, first));
    const b = Array.from({ length: 20 }, () => reactionDelayMs(phantomTiming.reactionDelay, second));
    expect(a).toEqual(b);
    for (const ms of a) expect(ms).toBeGreaterThanOrEqual(550);
    for (const ms of a) expect(ms).toBeLessThanOrEqual(650);
  });
});

describe('applyThrottling', () => {
  function recorder(): { calls: { method: string; params?: Record<string, unknown> }[]; send: (method: string, params?: Record<string, unknown>) => Promise<unknown> } {
    const calls: { method: string; params?: Record<string, unknown> }[] = [];
    return {
      calls,
      send: async (method, params) => {
        calls.push(params === undefined ? { method } : { method, params });
        return {};
      },
    };
  }

  it("enables the network domain, then sends The Phantom's network conditions and CPU rate", async () => {
    const cdp = recorder();
    await applyThrottling(cdp, phantomProfile);
    expect(cdp.calls).toEqual([
      { method: 'Network.enable' },
      {
        method: 'Network.emulateNetworkConditions',
        params: { offline: false, latency: 2000, downloadThroughput: 50_000, uploadThroughput: 50_000, connectionType: 'cellular3g' },
      },
      { method: 'Emulation.setCPUThrottlingRate', params: { rate: 4 } },
    ]);
  });

  it('sends nothing for a profile without throttling', async () => {
    const cdp = recorder();
    await applyThrottling(cdp, listenerProfile);
    expect(cdp.calls).toEqual([]);
  });
});

describe('The Phantom profile in Chromium, with the request guard on', () => {
  let server: FixtureServer;
  let browser: Browser;

  beforeAll(async () => {
    server = await startFixtureServer();
    browser = await chromium.launch();
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  it('shows the page as an old phone does, and Chromium accepts the throttling commands', async () => {
    const context = await browser.newContext({
      ...GUARDED_CONTEXT_OPTIONS,
      viewport: { width: phantomProfile.width, height: phantomProfile.height },
      deviceScaleFactor: phantomProfile.deviceScaleFactor,
      locale: phantomProfile.locale,
      isMobile: phantomProfile.isMobile,
      hasTouch: phantomProfile.hasTouch,
      userAgent: phantomProfile.userAgent!,
    });
    try {
      await installGuard(context, { allowedDomains: [] }, () => undefined);
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await applyThrottling(cdp, phantomProfile);
      const started = Date.now();
      await page.goto(server.url('/visual-body.html'), { waitUntil: 'commit', timeout: 60_000 });
      // The 2000 ms latency is still applied although the guard's route is installed.
      expect(Date.now() - started).toBeGreaterThanOrEqual(1900);

      const seen = await page.evaluate(() => ({
        // The screen, not the layout viewport: a mobile page without a viewport meta tag lays out at 980 px.
        width: window.screen.width,
        height: window.screen.height,
        ratio: window.devicePixelRatio,
        touch: navigator.maxTouchPoints > 0,
        userAgent: navigator.userAgent,
        language: navigator.language,
      }));
      expect(seen).toEqual({
        width: 360,
        height: 640,
        ratio: 2,
        touch: true,
        userAgent: PHANTOM_USER_AGENT,
        language: 'en-IN',
      });
    } finally {
      await context.close();
    }
  }, 90_000);
});
