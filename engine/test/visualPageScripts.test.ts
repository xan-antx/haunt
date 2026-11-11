import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { pageInitScripts } from '../src/ghosts/registry.ts';
import { readChangeClock } from '../src/page/changeClock.ts';
import { readClicksSince } from '../src/page/clickLog.ts';
import { readElementKey } from '../src/page/elementKeys.ts';
import { readLayoutShifts } from '../src/page/layoutShifts.ts';
import { readSight, readVisibleText, SEEN_ITEM_KEYS, type SeenItem } from '../src/page/sight.ts';
import { startFixtureServer, type FixtureServer } from './fixtureServer.ts';

/**
 * Unit tests for the page scripts of the visual ghosts: Sight (Seen_Items and probe item keys), the
 * click log and the layout-shift recorder. They run in real Chromium against a fixture page, with
 * every page script installed the way the CLI installs them.
 * **Validates: Requirements 13.2, 17.2, 15.3, 15.4**
 */

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

const PAGE = '/visual-page-scripts.html';

let server: FixtureServer;
let browser: Browser;
let context: BrowserContext;
let page: Page;
let pageErrors: string[];

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function now(): Promise<number> {
  const state = await readChangeClock(page);
  if (!state) throw new Error('The change clock is not installed.');
  return state.now;
}

function centreOf(item: SeenItem): { x: number; y: number } {
  return { x: item.box.x + item.box.w / 2, y: item.box.y + item.box.h / 2 };
}

beforeAll(async () => {
  server = await startFixtureServer();
  browser = await chromium.launch();
  context = await browser.newContext({ viewport: { width: 800, height: 600 } });
  for (const source of pageInitScripts) await context.addInitScript(source);
}, 60_000);

afterAll(async () => {
  await browser?.close();
  await server?.close();
});

beforeEach(async () => {
  page = await context.newPage();
  pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto(server.url(PAGE));
});

afterEach(async () => {
  expect(pageErrors).toEqual([]);
  await page.close();
});

describe('Sight', () => {
  it('sees visible text, buttons, links, fields and checkboxes by their looks and visible text only', async () => {
    const sight = await readSight(page);
    expect(sight).not.toBeNull();
    const seen = sight!.items.map((item) => ({ look: item.look, text: item.text }));
    expect(seen).toEqual([
      { look: 'text', text: 'Your bill' },
      { look: 'text', text: 'Amount due' },
      { look: 'text', text: '₹2,490.00' },
      { look: 'button', text: 'Pay this bill' },
      { look: 'button', text: '' },
      { look: 'link', text: 'Set up autopay' },
      { look: 'text', text: 'Card number' },
      { look: 'field', text: '1234 5678' },
      { look: 'field', text: 'Asha' },
      { look: 'field', text: '•••' },
      { look: 'checkbox', text: '' },
      { look: 'text', text: 'Agree' },
      { look: 'text', text: 'Moving box' },
    ]);
    expect(sight!.items.find((item) => item.text === '1234 5678')?.placeholder).toBe(true);
    expect(sight!.items.find((item) => item.text === 'Asha')).not.toHaveProperty('placeholder');
    expect(sight!.items.find((item) => item.look === 'checkbox')?.checked).toBe(true);
    expect(sight!.path).toBe(PAGE);
    expect(sight!.viewport).toEqual({ w: 800, h: 600 });
  });

  it('numbers items s1, s2… and gives them only the Seen_Item keys, with no ARIA data', async () => {
    const sight = await readSight(page);
    sight!.items.forEach((item, i) => {
      expect(item.id).toBe(`s${i + 1}`);
      for (const key of Object.keys(item)) expect(SEEN_ITEM_KEYS).toContain(key);
      expect(Object.keys(item.box).sort()).toEqual(['h', 'w', 'x', 'y']);
      expect(item.box.w).toBeGreaterThan(0);
      expect(item.box.h).toBeGreaterThan(0);
    });
    const serialised = JSON.stringify({ path: sight!.path, viewport: sight!.viewport, items: sight!.items });
    for (const hidden of ['Aria name', 'Pay now', 'aria', 'role', 'card-label', 'Faded', 'Invisible', 'No box', 'Far below']) {
      expect(serialised).not.toContain(hidden);
    }
  });

  it('puts the element key under each item centre into the probe, and only there', async () => {
    const before = await now();
    const sight = await readSight(page);
    const after = await now();
    expect(sight!.probe.at).toBeGreaterThanOrEqual(before);
    expect(sight!.probe.at).toBeLessThanOrEqual(after);

    const byText = (text: string): SeenItem => sight!.items.find((item) => item.text === text)!;
    expect(sight!.probe.itemKeys[byText('Pay this bill').id]).toBe(await readElementKey(page, '#pay'));
    expect(sight!.probe.itemKeys[byText('Set up autopay').id]).toBe(await readElementKey(page, '#autopay'));
    expect(sight!.probe.itemKeys[byText('₹2,490.00').id]).toBe(await readElementKey(page, '#amount'));
    expect(Object.keys(sight!.probe.itemKeys).sort()).toEqual(sight!.items.map((item) => item.id).sort());
    for (const item of sight!.items) expect(JSON.stringify(item)).not.toMatch(/"e\d+"/);
  });

  it('reads the visible text of an element without the visually hidden parts', async () => {
    expect(await readVisibleText(page, '#icon')).toBe('');
    expect(await readVisibleText(page, '#intro')).toBe('Amount due ₹2,490.00');
  });
});

describe('click log', () => {
  it('records the interactive element that got the click, with its time', async () => {
    const sight = await readSight(page);
    const pay = sight!.items.find((item) => item.text === 'Pay this bill')!;
    const from = await now();
    await page.mouse.click(centreOf(pay).x, centreOf(pay).y);
    const clicks = await readClicksSince(page, from);
    expect(clicks).toHaveLength(1);
    expect(clicks[0]!.key).toBe(sight!.probe.itemKeys[pay.id]);
    expect(clicks[0]!.trusted).toBe(true);
    expect(clicks[0]!.at).toBeGreaterThanOrEqual(from);
    expect(clicks[0]!.at).toBeLessThanOrEqual(await now());
  });

  it('records the plain element when nothing interactive was hit, and filters by time', async () => {
    const first = await now();
    await page.click('#title');
    const second = await now();
    await page.click('#autopay');
    const all = await readClicksSince(page, first);
    expect(all.map((click) => click.key)).toEqual([await readElementKey(page, '#title'), await readElementKey(page, '#autopay')]);
    const later = await readClicksSince(page, second);
    expect(later.map((click) => click.key)).toEqual([await readElementKey(page, '#autopay')]);
  });
});

describe('layout shifts', () => {
  it('records a shift with its moved elements, their visible text and both rects', async () => {
    await page.waitForLoadState('load');
    await sleep(300);
    const from = await now();
    await page.evaluate("document.getElementById('mover').style.top = '120px'");
    await expect
      .poll(async () => (await readLayoutShifts(page, from)).length, { timeout: 5_000, interval: 50 })
      .toBeGreaterThan(0);
    const [entry] = await readLayoutShifts(page, from);
    expect(entry!.value).toBeGreaterThan(0);
    expect(entry!.hadRecentInput).toBe(false);
    const moved = entry!.sources.find((source) => Math.round(source.currentRect.y - source.previousRect.y) === 120);
    expect(moved, JSON.stringify(entry)).toBeDefined();
    expect(moved!.key).toBe(await readElementKey(page, '#mover'));
    expect(moved!.tag).toBe('div');
    expect(moved!.text).toBe('Moving box');
    expect(moved!.currentRect.x).toBe(moved!.previousRect.x);

    expect(await readLayoutShifts(page, from, from - 1)).toEqual([]);
    expect(await readLayoutShifts(page, (await now()) + 1)).toEqual([]);
  });
});
