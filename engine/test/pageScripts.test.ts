import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { pageInitScripts } from '../src/ghosts/registry.ts';
import { CHANGE_CLOCK_SOURCE, quietForMs, readChangeClock } from '../src/page/changeClock.ts';
import { ELEMENT_KEYS_SOURCE, readElementKey, readFocusKeys } from '../src/page/elementKeys.ts';
import { drainLiveAnnouncements, LIVE_REGIONS_SOURCE } from '../src/page/liveRegions.ts';
import { startFixtureServer, type FixtureServer } from './fixtureServer.ts';

/**
 * Unit tests for the page scripts installed with addInitScript: the Page_Change_Clock, the
 * Live_Announcement recorder and the element keys. They run in real Chromium against fixture pages.
 * **Validates: Requirements 8.4**
 */

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

const PAGE = '/page-scripts.html';

let server: FixtureServer;
let browser: Browser;
let context: BrowserContext;
let page: Page;
let pageErrors: string[];

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** Opens a page with the three scripts installed the way the CLI does it, and goes to a fixture. */
async function openFixture(pathname: string): Promise<void> {
  for (const source of pageInitScripts) await page.addInitScript(source);
  await page.goto(server.url(pathname));
}

/** Waits until the page's own mutation counter is running (it starts 100 ms after load). */
async function waitForWatching(): Promise<void> {
  await page.waitForFunction('window.__watching === true');
}

/** Polls the clock until nothing has changed for `quietMs` and no animation runs. */
async function waitForQuiet(quietMs = 300): Promise<void> {
  const deadline = Date.now() + 8_000;
  for (;;) {
    const state = await readChangeClock(page);
    if (!state) throw new Error('The change clock is not installed.');
    if (!state.animating && quietForMs(state) >= quietMs) return;
    if (Date.now() > deadline) throw new Error('The page never went quiet.');
    await sleep(50);
  }
}

async function lastChange(): Promise<number> {
  const state = await readChangeClock(page);
  if (!state) throw new Error('The change clock is not installed.');
  return state.lastChange;
}

async function pageState(): Promise<Record<string, unknown>> {
  return (await page.evaluate('window.__state()')) as Record<string, unknown>;
}

beforeAll(async () => {
  server = await startFixtureServer();
  browser = await chromium.launch();
  context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
}, 60_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

beforeEach(async () => {
  page = await context.newPage();
  pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
});

afterEach(async () => {
  await page.close();
});

describe('registration', () => {
  it('lists the three scripts in pageInitScripts so every Run installs them', () => {
    expect(pageInitScripts).toEqual(expect.arrayContaining([CHANGE_CLOCK_SOURCE, LIVE_REGIONS_SOURCE, ELEMENT_KEYS_SOURCE]));
  });
});

describe('installation', () => {
  it('guards against double installation: a second run keeps the first one', async () => {
    await openFixture(PAGE);
    await page.evaluate(
      'window.__first = { clock: window.__haunt.clock, live: window.__haunt.live, keys: window.__haunt.keys, changes: window.__haunt.clock.read().changes }',
    );
    for (const source of pageInitScripts) await page.evaluate(source);
    const same = await page.evaluate(
      'window.__haunt.clock === window.__first.clock && window.__haunt.live === window.__first.live && window.__haunt.keys === window.__first.keys',
    );
    expect(same).toBe(true);
    expect(pageErrors).toEqual([]);
  });

  it('works in every frame, each with its own state', async () => {
    await openFixture('/page-scripts-frames.html');
    await expect.poll(() => page.frames().length).toBe(2);
    const child = page.frames().find((frame) => frame !== page.mainFrame());
    expect(child).toBeDefined();
    await child!.waitForLoadState('load');
    for (const frame of page.frames()) {
      const api = await frame.evaluate(
        '[typeof window.__haunt.clock.read, typeof window.__haunt.live.drain, typeof window.__haunt.keys.key].join(",")',
      );
      expect(api).toBe('function,function,function');
    }
    const parentKey = await readElementKey(page, 'h1');
    const childKey = await child!.evaluate("window.__haunt.keys.key(document.querySelector('h1'))");
    expect(parentKey).toBe('e1');
    expect(childKey).toBe('e1');
    expect(pageErrors).toEqual([]);
  });

  it.each(['/ok.txt', '/dot.svg'])('is tolerated on a document that is not a normal page (%s)', async (pathname) => {
    await openFixture(pathname);
    const names = (await page.evaluate('Object.keys(window.__haunt).sort()')) as string[];
    expect(names).toEqual(['clock', 'keys', 'live']);
    expect(await readChangeClock(page)).not.toBeNull();
    expect(await drainLiveAnnouncements(page)).toEqual([]);
    expect(pageErrors).toEqual([]);
  });

  it('gives null and an empty list on a page where the scripts are not installed', async () => {
    await page.goto(server.url(PAGE));
    expect(await readChangeClock(page)).toBeNull();
    expect(await drainLiveAnnouncements(page)).toEqual([]);
    expect(await readFocusKeys(page)).toBeNull();
    expect(await readElementKey(page, 'h1')).toBeNull();
  });
});

describe('Page_Change_Clock', () => {
  beforeEach(async () => {
    await openFixture(PAGE);
    await waitForWatching();
    await waitForQuiet();
  });

  it.each([
    ['a child added to a rendered element', "document.getElementById('mutable').appendChild(document.createElement('b'))"],
    ['text changed in a rendered element', "document.getElementById('mutable').firstChild.data = 'changed'"],
    ['an attribute changed on a rendered element', "document.getElementById('mutable').setAttribute('data-x', '1')"],
    ['an element shown by removing display: none', "document.getElementById('hidden').style.display = 'block'"],
  ])('moves on a DOM change: %s', async (_name, change) => {
    const before = await lastChange();
    await page.evaluate(change);
    expect(await lastChange()).toBeGreaterThan(before);
  });

  it('stays still when nothing changes, and engine reads do not move it', async () => {
    const before = await readChangeClock(page);
    for (let i = 0; i < 4; i += 1) {
      await sleep(150);
      await readChangeClock(page);
      await drainLiveAnnouncements(page);
      await readFocusKeys(page);
      await readElementKey(page, '#mutable');
    }
    const after = await readChangeClock(page);
    expect(after!.lastChange).toBe(before!.lastChange);
    expect(after!.changes).toBe(before!.changes);
    expect(after!.animating).toBe(false);
    expect(quietForMs(after!)).toBeGreaterThanOrEqual(600);
  });

  it('ignores changes inside elements that have no box and inside head, script and style', async () => {
    const before = await readChangeClock(page);
    await page.evaluate(`(() => {
      document.getElementById('hidden-child').textContent = 'changed';
      document.getElementById('hidden-child').setAttribute('data-x', '1');
      document.getElementById('hidden').appendChild(document.createElement('i'));
      document.head.appendChild(document.createElement('meta'));
      document.head.appendChild(document.createElement('script'));
      document.getElementById('sheet').appendChild(document.createTextNode('/* more css */'));
    })()`);
    await sleep(150);
    const after = await readChangeClock(page);
    expect(after!.lastChange).toBe(before!.lastChange);
    expect(after!.changes).toBe(before!.changes);
  });

  it('moves on a layout shift that no DOM change caused', async () => {
    await page.evaluate('window.scrollTo(0, 0)');
    await waitForQuiet();
    const mutationsBefore = ((await pageState()).mutations as number);
    const before = await lastChange();
    // A CSS rule inserted through the CSSOM changes the layout without a single DOM mutation record.
    await page.evaluate(`(() => {
      const sheet = document.getElementById('sheet').sheet;
      sheet.insertRule('#shifter { height: 260px; }', sheet.cssRules.length);
    })()`);
    await expect.poll(lastChange, { timeout: 5_000, interval: 50 }).toBeGreaterThan(before);
    expect(((await pageState()).mutations as number)).toBe(mutationsBefore);
  });

  it('moves when an image finishes loading, after the DOM change that started it', async () => {
    // Hold the image back so that the load certainly happens after the DOM change that starts it.
    await page.route('**/dot.svg*', async (route) => {
      await sleep(300);
      await route.continue();
    });
    const result = (await page.evaluate(`(async () => {
      const img = document.getElementById('pic');
      const clock = window.__haunt.clock;
      const loaded = new Promise((resolve) => img.addEventListener('load', resolve, { once: true }));
      img.src = '/dot.svg?' + Math.random();
      await new Promise((resolve) => setTimeout(resolve, 0));
      const afterMutation = clock.read().lastChange;
      await loaded;
      await new Promise((resolve) => setTimeout(resolve, 0));
      return { afterMutation, afterLoad: clock.read().lastChange };
    })()`)) as { afterMutation: number; afterLoad: number };
    expect(result.afterLoad).toBeGreaterThan(result.afterMutation);
  });

  it('counts a running CSS animation, and stays still once it is cancelled', async () => {
    await page.evaluate("document.getElementById('animated').className = 'pulse'");
    await sleep(200);
    const running = await readChangeClock(page);
    expect(running!.animating).toBe(true);
    expect(running!.lastChange).toBe(running!.now);
    await sleep(200);
    expect(quietForMs((await readChangeClock(page))!)).toBe(0);

    await page.evaluate('document.getAnimations().forEach((animation) => animation.cancel())');
    await waitForQuiet();
    const stopped = await readChangeClock(page);
    expect(stopped!.animating).toBe(false);
    expect(quietForMs(stopped!)).toBeGreaterThanOrEqual(300);
  });

  it('notices a short animation that starts and ends between two reads', async () => {
    const startedAt = (await page.evaluate(
      "(() => { const t = performance.now(); document.getElementById('animated').className = 'blink'; return t; })()",
    )) as number;
    await sleep(700);
    const state = await readChangeClock(page);
    expect(state!.animating).toBe(false);
    // The class change happened at startedAt; the animation ended about 150 ms later.
    expect(state!.lastChange - startedAt).toBeGreaterThanOrEqual(100);
  });
});

describe('Live_Announcements', () => {
  beforeEach(async () => {
    await openFixture(PAGE);
    await waitForWatching();
    await drainLiveAnnouncements(page);
  });

  const insertAlert = (text: string, attributes = ''): string => `(() => {
    const div = document.createElement('div');
    div.setAttribute('role', 'alert');
    ${attributes}
    div.textContent = ${JSON.stringify(text)};
    document.getElementById('container').appendChild(div);
  })()`;

  it('captures a role="alert" region that is inserted together with its text', async () => {
    await page.evaluate(insertAlert('Please enter a valid card number'));
    expect(await drainLiveAnnouncements(page)).toEqual(['Please enter a valid card number']);
  });

  it('captures a live region that arrives inside a larger block, reading inline markup as one sentence', async () => {
    await page.evaluate(
      `document.getElementById('container').innerHTML = '<section><p>Not live</p><div role="alert">Card declined <b>today</b></div></section>'`,
    );
    expect(await drainLiveAnnouncements(page)).toEqual(['Card declined today']);
  });

  it('captures text added to an empty region and text changed inside it', async () => {
    await page.evaluate("document.getElementById('live-polite').textContent = 'Saved'");
    expect(await drainLiveAnnouncements(page)).toEqual(['Saved']);
    await page.evaluate("document.getElementById('live-polite').firstChild.data = 'Saved again'");
    expect(await drainLiveAnnouncements(page)).toEqual(['Saved again']);
  });

  it('captures aria-live="assertive", role="status" and role="log", in the order they happened', async () => {
    await page.evaluate(`(() => {
      document.getElementById('live-assertive').textContent = 'one';
      document.getElementById('status').textContent = 'two';
      document.getElementById('log').appendChild(document.createTextNode('three'));
    })()`);
    expect(await drainLiveAnnouncements(page)).toEqual(['one', 'two', 'three']);
  });

  it('ignores aria-live="off", elements that are not live, removals and attribute changes', async () => {
    await page.evaluate(`(() => {
      document.getElementById('live-off').textContent = 'off';
      document.getElementById('plain').textContent = 'plain';
      document.getElementById('mutable').textContent = 'changed';
      document.getElementById('status').setAttribute('data-x', '1');
    })()`);
    expect(await drainLiveAnnouncements(page)).toEqual([]);

    await page.evaluate("document.getElementById('status').textContent = 'Done'");
    expect(await drainLiveAnnouncements(page)).toEqual(['Done']);
    await page.evaluate("document.getElementById('status').textContent = ''");
    expect(await drainLiveAnnouncements(page)).toEqual([]);
  });

  it('ignores text that a screen reader would not speak', async () => {
    await page.evaluate("document.getElementById('hidden-live').textContent = 'hidden by display'");
    await page.evaluate(insertAlert('hidden by aria-hidden', "div.setAttribute('aria-hidden', 'true');"));
    await page.evaluate(insertAlert('hidden by attribute', "div.setAttribute('hidden', '');"));
    expect(await drainLiveAnnouncements(page)).toEqual([]);
  });

  it('drain returns the buffer and clears it', async () => {
    await page.evaluate("document.getElementById('status').textContent = 'first'");
    expect(await drainLiveAnnouncements(page)).toEqual(['first']);
    expect(await drainLiveAnnouncements(page)).toEqual([]);
    await page.evaluate("document.getElementById('status').textContent = 'second'");
    expect(await drainLiveAnnouncements(page)).toEqual(['second']);
  });

  it('drain includes changes that the observer has not delivered yet, without repeating them later', async () => {
    const drained = await page.evaluate(
      "(() => { document.getElementById('live-polite').textContent = 'Now'; return window.__haunt.live.drain(); })()",
    );
    expect(drained).toEqual(['Now']);
    await sleep(50);
    expect(await drainLiveAnnouncements(page)).toEqual([]);
  });

  it('records a region inserted and edited in the same task once, with its final text', async () => {
    await page.evaluate(`(() => {
      const div = document.createElement('div');
      div.setAttribute('role', 'alert');
      div.textContent = 'first draft';
      document.getElementById('container').appendChild(div);
      div.firstChild.data = 'final text';
    })()`);
    expect(await drainLiveAnnouncements(page)).toEqual(['final text']);
  });

  it('collapses white space', async () => {
    await page.evaluate("document.getElementById('status').textContent = '  Payment \\n\\n  received  '");
    expect(await drainLiveAnnouncements(page)).toEqual(['Payment received']);
  });
});

describe('element keys', () => {
  beforeEach(async () => {
    await openFixture(PAGE);
    await waitForWatching();
  });

  it('gives the same element the same key every time, in the form e<number>', async () => {
    const first = await readElementKey(page, '#outside');
    const second = await readElementKey(page, '#outside');
    expect(first).toMatch(/^e\d+$/);
    expect(second).toBe(first);
  });

  it('gives different elements different keys, and null when nothing matches', async () => {
    const selectors = ['#outside', '#dialog', '#in-dialog', '#card', '#note', '#mutable'];
    const keys: (string | null)[] = [];
    for (const selector of selectors) keys.push(await readElementKey(page, selector));
    expect(keys.every((key) => key !== null)).toBe(true);
    expect(new Set(keys).size).toBe(selectors.length);
    expect(await readElementKey(page, '#does-not-exist')).toBeNull();
  });

  it('keeps the key when the element moves, and never reuses a key for a new element', async () => {
    const key = await readElementKey(page, '#outside');
    await page.evaluate("document.getElementById('container').appendChild(document.getElementById('outside'))");
    expect(await readElementKey(page, '#outside')).toBe(key);

    const result = (await page.evaluate(`(() => {
      const keys = window.__haunt.keys;
      const a = document.createElement('div');
      const keyA = keys.key(a);
      const same = keys.element(keyA) === a;
      a.remove();
      const keyB = keys.key(document.createElement('div'));
      return { keyA, keyB, same };
    })()`)) as { keyA: string; keyB: string; same: boolean };
    expect(result.same).toBe(true);
    expect(result.keyB).not.toBe(result.keyA);
  });

  it('returns null for things that are not elements', async () => {
    const result = await page.evaluate(
      '[window.__haunt.keys.key(null), window.__haunt.keys.key(document), window.__haunt.keys.key(document.body.firstChild)]',
    );
    expect(result).toEqual([null, null, null]);
  });

  it('reports the focused element and its enclosing dialog', async () => {
    await page.focus('#in-dialog');
    expect(await readFocusKeys(page)).toEqual({
      focusKey: await readElementKey(page, '#in-dialog'),
      dialogKey: await readElementKey(page, '#dialog'),
    });

    await page.focus('#in-dialog-nested');
    expect(await readFocusKeys(page)).toEqual({
      focusKey: await readElementKey(page, '#in-dialog-nested'),
      dialogKey: await readElementKey(page, '#dialog'),
    });

    await page.focus('#outside');
    expect(await readFocusKeys(page)).toEqual({ focusKey: await readElementKey(page, '#outside'), dialogKey: null });

    await page.evaluate('document.activeElement.blur()');
    expect(await readFocusKeys(page)).toEqual({ focusKey: null, dialogKey: null });
  });

  it('treats role="alertdialog" and the dialog element as dialogs, and finds the focus inside a shadow tree', async () => {
    await page.evaluate(`(() => {
      const alertdialog = document.createElement('div');
      alertdialog.id = 'alertdialog';
      alertdialog.setAttribute('role', 'alertdialog');
      alertdialog.innerHTML = '<button id="in-alert">Yes</button>';
      document.body.appendChild(alertdialog);

      const host = document.createElement('div');
      host.id = 'host';
      host.attachShadow({ mode: 'open' }).innerHTML = '<div role="dialog"><button id="in-shadow">Shadow</button></div>';
      document.body.appendChild(host);
    })()`);
    await page.focus('#in-alert');
    expect(await readFocusKeys(page)).toEqual({
      focusKey: await readElementKey(page, '#in-alert'),
      dialogKey: await readElementKey(page, '#alertdialog'),
    });

    await page.evaluate("document.getElementById('host').shadowRoot.getElementById('in-shadow').focus()");
    const shadowKeys = await readFocusKeys(page);
    expect(shadowKeys!.focusKey).toMatch(/^e\d+$/);
    expect(shadowKeys!.dialogKey).toMatch(/^e\d+$/);
    expect(shadowKeys!.dialogKey).not.toBe(shadowKeys!.focusKey);
  });
});

describe('the scripts are passive', () => {
  it('cause no mutation and no change of focus, scroll or values', async () => {
    await openFixture(PAGE);
    await waitForWatching();
    await waitForQuiet();

    const before = await pageState();
    expect(before.activeElement).toBe('note');
    expect(before.mutations).toBe(0);

    for (let i = 0; i < 3; i += 1) {
      await readChangeClock(page);
      await drainLiveAnnouncements(page);
      await readFocusKeys(page);
      for (const selector of ['#note', '#card', '#box', '#dialog', '#in-dialog', '#agree', '#hidden-child']) {
        await readElementKey(page, selector);
      }
      await page.evaluate(
        "window.__haunt.keys.dialogKey(document.getElementById('in-dialog')) + window.__haunt.keys.activeDialogKey() + window.__haunt.keys.activeKey()",
      );
      await sleep(100);
    }

    const after = await pageState();
    expect(after).toEqual(before);
    expect(after.mutations).toBe(0);
    expect(pageErrors).toEqual([]);
  });

  it('leave a page that mutates itself undisturbed: the page sees only its own changes', async () => {
    await openFixture(PAGE);
    await waitForWatching();
    await waitForQuiet();
    await page.evaluate("document.getElementById('status').textContent = 'Hello'");
    // Exactly one mutation (the page's own text change), none added by the engine's observers.
    expect((await pageState()).mutations).toBe(1);
    await drainLiveAnnouncements(page);
    await readChangeClock(page);
    expect((await pageState()).mutations).toBe(1);
  });
});
