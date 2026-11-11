import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../src/core/rng.ts';
import { pageInitScripts } from '../src/ghosts/registry.ts';
import { createVisualBody } from '../src/ghosts/visual/body.ts';
import type { SeenItem, Sight } from '../src/ghosts/visual/types.ts';
import { readElementKey } from '../src/page/elementKeys.ts';
import { readSight, readVisibleText, type SightReading } from '../src/page/sight.ts';
import { startFixtureServer, type FixtureServer } from './fixtureServer.ts';

/**
 * The design's examples for the shared visual body, on fixture pages in real Chromium: clipped text
 * gives only the visible characters, items under a modal backdrop are left out, a link with
 * `role="button"` looks like a link, and a click lands at the centre seen earlier even when the page
 * moved during the Reaction_Delay.
 * **Validates: Requirements 13.2, 13.4, 17.2**
 */

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

let server: FixtureServer;
let browser: Browser;
let context: BrowserContext;
let page: Page;
let pageErrors: string[];

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function looks(reading: SightReading | Sight): { look: SeenItem['look']; text: string }[] {
  return reading.items.map((item) => ({ look: item.look, text: item.text }));
}

function find(items: readonly SeenItem[], look: SeenItem['look'], text: string): SeenItem {
  const item = items.find((i) => i.look === look && i.text === text);
  if (!item) throw new Error(`No ${look} "${text}" in ${JSON.stringify(items.map((i) => [i.look, i.text]))}`);
  return item;
}

async function sightOf(path: string): Promise<SightReading> {
  await page.goto(server.url(path));
  const reading = await readSight(page);
  if (!reading) throw new Error('The Sight script is not installed.');
  return reading;
}

beforeAll(async () => {
  server = await startFixtureServer();
  browser = await chromium.launch();
  context = await browser.newContext({ viewport: { width: 800, height: 600 } });
  for (const source of pageInitScripts) await context.addInitScript(source);

  // Warm up. The first page, navigation and Sight of a fresh Chromium can take many seconds when other
  // browsers are starting, and that cost would otherwise land in the first test's 30 s limit.
  const warm = await context.newPage();
  await warm.goto(server.url('/visual-sight-cases.html'));
  await readSight(warm);
  await warm.close();
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
  expect(pageErrors).toEqual([]);
  await page.close();
});

describe('clipped text', () => {
  it('keeps only the characters that are fully visible across a horizontal clip', async () => {
    const sight = await sightOf('/visual-sight-cases.html');
    const clipped = find(sight.items, 'text', 'ABCDE');
    const clipWidth = await page.evaluate(() => document.getElementById('clip-x')!.getBoundingClientRect().width);
    expect(clipped.box.w).toBeLessThanOrEqual(clipWidth + 1);
    expect(await readVisibleText(page, '#clip-x')).toBe('ABCDE');
    expect(JSON.stringify(sight.items)).not.toContain('ABCDEF');
  });

  it('leaves out a line pushed below the bottom of its clipping box', async () => {
    const sight = await sightOf('/visual-sight-cases.html');
    find(sight.items, 'text', 'First line');
    expect(JSON.stringify(sight.items)).not.toContain('Second line');
    expect(await readVisibleText(page, '#clip-y')).toBe('First line');
  });
});

describe('modal backdrop', () => {
  it('leaves out the items under the backdrop and keeps the dialog', async () => {
    const sight = await sightOf('/visual-modal.html');
    expect(looks(sight)).toEqual([
      { look: 'text', text: 'Are you sure?' },
      { look: 'button', text: 'Close' },
    ]);
  });

  it('sees the same items once the backdrop is gone', async () => {
    await sightOf('/visual-modal.html');
    await page.evaluate(() => document.getElementById('backdrop')!.remove());
    const sight = (await readSight(page))!;
    expect(looks(sight)).toEqual([
      { look: 'text', text: 'Your bill' },
      { look: 'button', text: 'Pay this bill' },
      { look: 'link', text: 'Set up autopay' },
      { look: 'text', text: 'Amount due' },
      { look: 'text', text: 'Are you sure?' },
      { look: 'button', text: 'Close' },
    ]);
  });
});

describe('looks', () => {
  it('goes by the tag, not the role: a link with role="button" looks like a link', async () => {
    const sight = await sightOf('/visual-sight-cases.html');
    find(sight.items, 'link', 'Set up autopay');
    find(sight.items, 'button', 'Pay this bill');
    find(sight.items, 'text', 'Remind me later');
    expect(JSON.stringify(sight.items)).not.toContain('Open autopay settings');
  });
});

describe('click after the page moved', () => {
  it('clicks the centre seen earlier, and the click log names the element now under that point', async () => {
    const delayMs = 1000;
    const body = createVisualBody(page, {
      settleQuietMs: 150,
      reactionDelay: { minMs: delayMs, maxMs: delayMs },
      typingDelayMs: 5,
      rng: mulberry32(3),
    });
    await body.open(server.url('/visual-moving.html'));
    const { perception, probe } = await body.perceive();
    const pay = find(perception.items, 'button', 'Pay this bill');
    expect(pay.box).toEqual({ x: 16, y: 100, w: 200, h: 48 });

    // The page moves after the Sight and before the click, inside the Reaction_Delay.
    const acting = body.act({ type: 'click', itemId: pay.id });
    await sleep(100);
    const movedAt = (await page.evaluate('window.moveNow()')) as number;
    const result = await acting;

    const click = result.trace.click!;
    const seenCentre = { x: pay.box.x + pay.box.w / 2, y: pay.box.y + pay.box.h / 2 };
    expect(movedAt).toBeGreaterThan(probe.at);
    expect(click.at).toBeGreaterThan(movedAt);
    expect(click.aimed).toEqual(pay.box);
    expect(click.point).toEqual(seenCentre);
    expect(result.focusBox).toEqual(pay.box);

    const underPoint = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id ?? null, seenCentre);
    expect(underPoint).toBe('autopay');
    expect(click.hitKey).toBe(await readElementKey(page, '#autopay'));
    expect(click.hitKey).not.toBe(probe.itemKeys![pay.id]);
    expect(await page.textContent('#out')).toBe('Autopay opened');
  });
});
