import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, type Browser, type BrowserContext } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GUARDED_CONTEXT_OPTIONS, installGuard } from '../src/config/guard.ts';
import { applyThrottling } from '../src/core/throttling.ts';
import { phantomProfile } from '../src/ghosts/phantom/profile.ts';
import { startFixtureServer, type FixtureServer } from './fixtureServer.ts';

/*
 * The throttling test (Requirement 20.3, task 18.2): a 100 000-byte file fetched through The Phantom's
 * profile, with the request guard on, takes at least 2 seconds; the same file from the same server
 * without throttling takes less than 1 second.
 *
 * The 100 000-byte file is generated into a temporary folder at test start, so no large file is committed.
 */

const FIXTURE_BYTES = 100_000;

describe('The Phantom throttling, with the request guard on (Requirement 20.3)', () => {
  let root: string;
  let server: FixtureServer;
  let browser: Browser;

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'haunt-throttling-'));
    writeFileSync(path.join(root, 'index.html'), '<!doctype html><html lang="en"><title>Throttling</title><p>Throttling fixture</p></html>');
    writeFileSync(path.join(root, 'big.txt'), 'a'.repeat(FIXTURE_BYTES));
    server = await startFixtureServer(root);
    browser = await chromium.launch();
  }, 60_000);

  afterAll(async () => {
    await browser?.close();
    await server?.close();
    if (root) rmSync(root, { recursive: true, force: true });
  });

  /** Opens a guarded page on the fixture origin, optionally throttled, and times a full fetch of `big.txt`. */
  async function timeFullFetch(throttled: boolean): Promise<{ ms: number; bytes: number }> {
    const context: BrowserContext = await browser.newContext({
      ...GUARDED_CONTEXT_OPTIONS,
      viewport: { width: phantomProfile.width, height: phantomProfile.height },
      deviceScaleFactor: phantomProfile.deviceScaleFactor,
      locale: phantomProfile.locale,
      isMobile: phantomProfile.isMobile,
      hasTouch: phantomProfile.hasTouch,
      userAgent: phantomProfile.userAgent!,
    });
    try {
      const blocked: string[] = [];
      await installGuard(context, { allowedDomains: [] }, (message) => {
        blocked.push(message);
      });
      const page = await context.newPage();
      if (throttled) {
        const cdp = await context.newCDPSession(page);
        await applyThrottling(cdp, phantomProfile);
      }
      await page.goto(server.url('/index.html'), { waitUntil: 'load', timeout: 60_000 });

      const started = Date.now();
      const bytes = await page.evaluate(async (url) => {
        const response = await fetch(url, { cache: 'no-store' });
        const body = await response.arrayBuffer();
        return body.byteLength;
      }, server.url(`/big.txt?throttled=${throttled}`));
      const ms = Date.now() - started;

      expect(blocked).toEqual([]);
      return { ms, bytes };
    } finally {
      await context.close();
    }
  }

  it('takes at least 2 seconds to receive the 100 000-byte file through The Phantom profile', async () => {
    const { ms, bytes } = await timeFullFetch(true);
    expect(bytes).toBe(FIXTURE_BYTES);
    expect(ms).toBeGreaterThanOrEqual(2000);
    expect(server.requests).toContain('/big.txt');
  }, 90_000);

  it('takes less than 1 second to receive the same file without throttling', async () => {
    const { ms, bytes } = await timeFullFetch(false);
    expect(bytes).toBe(FIXTURE_BYTES);
    expect(ms).toBeLessThan(1000);
  }, 60_000);
});
