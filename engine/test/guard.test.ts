import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GUARDED_CONTEXT_OPTIONS, installGuard, isBlockedUrl } from '../src/config/guard.ts';
import { startFixtureServer, type FixtureServer } from './fixtureServer.ts';

/**
 * Unit tests for the request guard (Requirement 4.6).
 * **Validates: Requirements 4.6**
 */

const config = { allowedDomains: ['lantern-bills.example.org'] };

describe('isBlockedUrl', () => {
  it.each([
    'http://127.0.0.1:5173/x',
    'http://localhost:3000/',
    'https://lantern-bills.example.org/app.js',
    'ws://localhost:3000/socket',
    'wss://127.0.0.1/socket',
    'ws://lantern-bills.example.org/socket',
    'data:text/plain;base64,aGVsbG8=',
    'blob:http://127.0.0.1:5173/6f1c',
    'about:blank',
  ])('lets %s through', (url) => {
    expect(isBlockedUrl(url, config)).toBe(false);
  });

  it.each([
    'http://example.com/',
    'https://www.lantern-bills.example.org/',
    'ws://example.com/socket',
    'wss://example.com/socket',
    'ftp://localhost/',
    'http://user:pw@localhost/',
    'http://[::1]/',
    'http://0.0.0.0/',
    'http://localhost./',
    'not a url',
    '',
  ])('blocks %s', (url) => {
    expect(isBlockedUrl(url, config)).toBe(true);
  });
});

describe('installGuard in Chromium', () => {
  let server: FixtureServer;
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  const log: string[] = [];
  const failures: { url: string; errorText: string }[] = [];
  let results: Record<string, string>;

  beforeAll(async () => {
    server = await startFixtureServer();
    // Safety net: if the guard ever failed, every host except localhost and 127.0.0.1 still cannot be resolved,
    // so nothing would leave this machine. A request that is not aborted by the guard fails with
    // ERR_NAME_NOT_RESOLVED instead of ERR_BLOCKED_BY_CLIENT, which the assertions below tell apart.
    browser = await chromium.launch({ args: ['--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1'] });
    context = await browser.newContext({ ...GUARDED_CONTEXT_OPTIONS });
    await installGuard(context, { allowedDomains: [] }, (message) => log.push(message));

    page = await context.newPage();
    page.on('requestfailed', (request) => {
      failures.push({ url: request.url(), errorText: request.failure()?.errorText ?? '' });
    });
    await page.goto(server.url('/guard-probe.html'));
    await page.waitForFunction(() => (window as unknown as { __probe: { done: boolean } }).__probe.done, undefined, {
      timeout: 15_000,
    });
    results = await page.evaluate(
      () => (window as unknown as { __probe: { results: Record<string, string> } }).__probe.results,
    );
  }, 60_000);

  afterAll(async () => {
    await context?.close();
    await browser?.close();
    await server?.close();
  });

  it('creates the context with service workers blocked', () => {
    expect(GUARDED_CONTEXT_OPTIONS.serviceWorkers).toBe('block');
  });

  it('rejects a fetch to a host that is not allowed', () => {
    expect(results.fetchExternal).toMatch(/^blocked:TypeError/);
  });

  it('stops an image and a script from the same host', () => {
    expect(results.imageExternal).toBe('blocked');
    expect(results.scriptExternal).toBe('blocked');
  });

  it('closes a WebSocket to a host that is not allowed', () => {
    // The page never gets a real connection: either an error, or an open that the guard closes at once with 1008.
    expect(results.webSocketExternal).toMatch(/^(blocked:|closed:1008)/);
  });

  it('aborts the requests in the browser, before they leave the machine', () => {
    const external = failures.filter((f) => f.url.startsWith('http://example.com/'));
    expect(external.map((f) => f.url).sort()).toEqual([
      'http://example.com/',
      'http://example.com/pixel.png',
      'http://example.com/tracker.js',
    ]);
    for (const failure of external) {
      expect(failure.errorText).toContain('ERR_BLOCKED_BY_CLIENT');
    }
    expect(failures.filter((f) => f.errorText.includes('NAME_NOT_RESOLVED'))).toEqual([]);
  });

  it('logs every blocked URL', () => {
    expect(log).toContain('Blocked request to http://example.com/');
    expect(log).toContain('Blocked request to http://example.com/pixel.png');
    expect(log).toContain('Blocked request to http://example.com/tracker.js');
    expect(log.some((m) => m.startsWith('Blocked WebSocket to ws://example.com/socket'))).toBe(true);
  });

  it('logs nothing for allowed traffic', () => {
    expect(log.filter((m) => m.includes('127.0.0.1') || m.includes('data:'))).toEqual([]);
  });

  it('still serves an allowed request to the fixture server', () => {
    expect(results.fetchSameOrigin).toBe('ok');
    expect(server.requests).toContain('/ok.txt');
  });

  it('lets a data: URL through', () => {
    expect(results.fetchData).toBe('ok');
  });

  it('never sent a request for the blocked paths to the fixture server', () => {
    expect(server.requests).not.toContain('/pixel.png');
    expect(server.requests).not.toContain('/tracker.js');
  });

  it('blocks a navigation to a host that is not allowed', async () => {
    const before = log.length;
    await expect(page.goto('http://example.com/', { timeout: 10_000 })).rejects.toThrow(/ERR_BLOCKED_BY_CLIENT/);
    expect(log.slice(before)).toContain('Blocked request to http://example.com/');
  });
});
