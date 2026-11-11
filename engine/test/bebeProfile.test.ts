import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { applyAcceptLanguage, languageList, profileAcceptLanguage } from '../src/core/acceptLanguage.ts';
import type { RunState } from '../src/core/types.ts';
import { bebeGhost, bebeStopRule } from '../src/ghosts/bebe/index.ts';
import {
  BEBE_LANGUAGES,
  BEBE_REACTION_DELAY,
  BEBE_SETTLE_MAX_MS,
  BEBE_SETTLE_QUIET_MS,
  BEBE_TYPING_DELAY_MS,
  bebeProfile,
} from '../src/ghosts/bebe/profile.ts';
import { reactionDelayMs } from '../src/ghosts/visual/body.ts';

/*
 * Task 20.1: Bebe's profile, timing and stop rule, and a real Chromium check that her browser puts
 * Punjabi first in both `navigator.languages` and the `Accept-Language` request header.
 *
 * **Validates: Requirements 17.1, 17.3, 17.4, 17.5, 18.3**
 */

describe('Bebe profile values', () => {
  it('is a 640 by 400 desktop viewport at scale 2 in pa-IN with no throttling', () => {
    expect(bebeProfile).toEqual({
      width: 640,
      height: 400,
      deviceScaleFactor: 2,
      locale: 'pa-IN',
      isMobile: false,
      hasTouch: false,
      extraHTTPHeaders: { 'Accept-Language': 'pa-IN,pa;q=0.9' },
    });
    expect(bebeProfile.throttling).toBeUndefined();
    expect(bebeGhost.id).toBe('bebe');
    expect(bebeGhost.profile).toBe(bebeProfile);
  });

  it('settles for 2000 ms (at most 20 s), reacts in 1300 to 1700 ms and types at 300 ms', () => {
    expect(BEBE_SETTLE_QUIET_MS).toBe(2000);
    expect(BEBE_SETTLE_MAX_MS).toBe(20_000);
    expect(BEBE_REACTION_DELAY).toEqual({ minMs: 1300, maxMs: 1700 });
    expect(BEBE_TYPING_DELAY_MS).toBe(300);
    expect(reactionDelayMs(BEBE_REACTION_DELAY, () => 0)).toBe(1300);
    expect(reactionDelayMs(BEBE_REACTION_DELAY, () => 0.999999)).toBe(1700);
  });

  it('reads the Accept-Language header from a profile, whatever its case', async () => {
    expect(profileAcceptLanguage(bebeProfile)).toBe('pa-IN,pa;q=0.9');
    expect(profileAcceptLanguage({ extraHTTPHeaders: { 'accept-language': 'hi' } })).toBe('hi');
    expect(profileAcceptLanguage({})).toBeUndefined();
    expect(languageList('pa-IN,pa;q=0.9')).toBe('pa-IN,pa');
    const sent: string[] = [];
    await applyAcceptLanguage({ send: async (method) => void sent.push(method) }, {});
    expect(sent).toEqual([]);
  });

  it('tries Punjabi, then Hindi, then English', () => {
    expect(BEBE_LANGUAGES).toEqual(['pa', 'hi', 'en']);
  });

  it('never stops a Run because of Findings', () => {
    const state: RunState = {
      steps: [],
      findingCounts: { cut_off_text: 3, untranslated: 2, dark_pattern: 2 },
      mission: {} as RunState['mission'],
    };
    expect(bebeStopRule(state)).toBeNull();
    expect(bebeGhost.detectors().map((d) => d.type)).toEqual(['cut_off_text', 'untranslated', 'dark_pattern']);
  });
});

/** A one-page HTTP server on 127.0.0.1 that remembers the `Accept-Language` header of each request. */
async function startHeaderServer(): Promise<{ origin: string; acceptLanguages: string[]; close(): Promise<void> }> {
  const acceptLanguages: string[] = [];
  const server: Server = createServer((req, res) => {
    acceptLanguages.push(String(req.headers['accept-language'] ?? ''));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end('<!doctype html><title>Bebe</title>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    acceptLanguages,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

describe('Bebe browser languages', () => {
  let browser: Browser;
  let server: Awaited<ReturnType<typeof startHeaderServer>>;

  beforeAll(async () => {
    server = await startHeaderServer();
    browser = await chromium.launch();
  });

  afterAll(async () => {
    await browser?.close();
    await server?.close();
  });

  it('puts Punjabi first in navigator.languages and Accept-Language', async () => {
    const context = await browser.newContext({
      viewport: { width: bebeProfile.width, height: bebeProfile.height },
      deviceScaleFactor: bebeProfile.deviceScaleFactor,
      locale: bebeProfile.locale,
      isMobile: bebeProfile.isMobile,
      hasTouch: bebeProfile.hasTouch,
      ...(bebeProfile.extraHTTPHeaders === undefined ? {} : { extraHTTPHeaders: bebeProfile.extraHTTPHeaders }),
    });
    try {
      const page = await context.newPage();
      const userAgentBefore = await page.evaluate(() => navigator.userAgent);
      // As the CLI does: a CDP session on the page, then the profile's Accept-Language before navigating.
      const cdp = await context.newCDPSession(page);
      await applyAcceptLanguage(cdp, bebeProfile);
      await page.goto(`${server.origin}/`);
      expect(await page.evaluate(() => navigator.userAgent)).toBe(userAgentBefore);
      expect(server.acceptLanguages[0]).toBe('pa-IN,pa;q=0.9');

      const seen = await page.evaluate(() => ({
        languages: [...navigator.languages],
        language: navigator.language,
        width: window.innerWidth,
        height: window.innerHeight,
        dpr: window.devicePixelRatio,
      }));
      expect(seen.languages[0]?.toLowerCase().startsWith('pa')).toBe(true);
      expect(seen.language.toLowerCase().startsWith('pa')).toBe(true);
      expect(seen).toMatchObject({ width: 640, height: 400, dpr: 2 });
    } finally {
      await context.close();
    }
  });
});
