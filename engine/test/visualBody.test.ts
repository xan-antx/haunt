import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../src/core/rng.ts';
import type { Body } from '../src/core/types.ts';
import { pageInitScripts } from '../src/ghosts/registry.ts';
import { createVisualBody, reactionDelayMs, type VisualBodyOptions } from '../src/ghosts/visual/body.ts';
import type { SeenItem, Sight, VisualAction } from '../src/ghosts/visual/types.ts';
import { startFixtureServer, type FixtureServer } from './fixtureServer.ts';

/**
 * Smoke tests for the shared visual Body in real Chromium. The fixture-based tests of the design's
 * examples (clipped text, modal backdrops, the page moving before a click) are in task 16.3.
 * **Validates: Requirements 13.3, 13.4, 13.5, 13.6, 17.5, 6.6**
 */

vi.setConfig({ testTimeout: 30_000, hookTimeout: 60_000 });

const PAGE = '/visual-body.html';
const OPTIONS: Omit<VisualBodyOptions, 'rng'> = {
  settleQuietMs: 150,
  reactionDelay: { minMs: 300, maxMs: 320 },
  typingDelayMs: 5,
};

let server: FixtureServer;
let browser: Browser;
let context: BrowserContext;
let page: Page;
let body: Body<Sight, VisualAction>;

function find(sight: Sight, look: SeenItem['look'], text: string): SeenItem {
  const item = sight.items.find((i) => i.look === look && i.text === text);
  if (!item) throw new Error(`No ${look} "${text}" in ${JSON.stringify(sight.items.map((i) => [i.look, i.text]))}`);
  return item;
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
  body = createVisualBody(page, { ...OPTIONS, rng: mulberry32(7) });
});

afterEach(async () => {
  await page.close();
});

describe('reactionDelayMs', () => {
  it('maps the random number onto the whole range', () => {
    const range = { minMs: 550, maxMs: 650 };
    expect(reactionDelayMs(range, () => 0)).toBe(550);
    expect(reactionDelayMs(range, () => 0.999999)).toBe(650);
    expect(reactionDelayMs(range, () => 0.5)).toBe(550 + Math.floor(0.5 * 101));
  });
});

describe('visual Body', () => {
  it('opens, Settles after load, and gives the Mind only the Sight', async () => {
    const opened = await body.open(server.url(PAGE));
    expect(opened.actionText).toBe(`Open ${server.url(PAGE)}`);
    expect(opened.spoken).toBe('');
    expect(opened.focusBox).toBeNull();
    expect(opened.trace.pathAfter).toBe(PAGE);
    expect(opened.trace.waits).toHaveLength(1);
    expect(opened.trace.readyAt - opened.trace.actionEndedAt).toBeGreaterThanOrEqual(OPTIONS.settleQuietMs);
    expect(opened.screenshot.length).toBeGreaterThan(0);

    const { perception, probe } = await body.perceive();
    expect(Object.keys(perception).sort()).toEqual(['items', 'path', 'screenshot', 'screenshotHash', 'viewport']);
    expect(perception.path).toBe(PAGE);
    expect(perception.viewport).toEqual({ w: 800, h: 600 });
    expect(perception.screenshotHash).toMatch(/^[0-9a-f]{64}$/);
    find(perception, 'button', 'Go');
    expect(Object.keys(probe.itemKeys ?? {}).length).toBeGreaterThan(0);
  });

  it('clicks the centre of the seen box after the Reaction_Delay and records what it hit', async () => {
    await body.open(server.url(PAGE));
    const { perception, probe } = await body.perceive();
    const seenAt = Date.now();
    const go = find(perception, 'button', 'Go');

    const result = await body.act({ type: 'click', itemId: go.id });
    expect(result.actionText).toBe('Click "Go"');
    expect(result.focusBox).toEqual(go.box);
    expect(result.seenScreenshot).toBe(perception.screenshot);
    const click = result.trace.click!;
    expect(click.aimed).toEqual(go.box);
    expect(click.point).toEqual({ x: go.box.x + go.box.w / 2, y: go.box.y + go.box.h / 2 });
    expect(click.hitKey).toBe(probe.itemKeys![go.id]);
    expect(click.at - probe.at).toBeGreaterThanOrEqual(OPTIONS.reactionDelay.minMs - 5);
    expect(result.trace.touchedKeys).toEqual([click.hitKey]);
    expect(Date.now() - seenAt).toBeGreaterThanOrEqual(OPTIONS.reactionDelay.minMs);

    const after = await body.perceive();
    find(after.perception, 'text', 'Clicked');
  });

  it('types into the clicked field', async () => {
    await body.open(server.url(PAGE));
    const { perception } = await body.perceive();
    const field = perception.items.find((i) => i.look === 'field')!;
    await body.act({ type: 'click', itemId: field.id });
    await body.perceive();
    const typed = await body.act({ type: 'type', text: '4111' });
    expect(typed.actionText).toBe('Type "4111"');
    expect(typed.focusBox).toBeNull();
    expect(typed.trace.touchedKeys).toHaveLength(1);
    const after = await body.perceive();
    find(after.perception, 'field', '4111');
  });

  it('scrolls by 80% of the viewport, waits, and goes back', async () => {
    await body.open(server.url(PAGE));
    await body.perceive();
    const scrolled = await body.act({ type: 'scroll', dir: 'down' });
    expect(scrolled.actionText).toBe('Scroll down');
    expect(await page.evaluate(() => window.scrollY)).toBe(480);

    await body.perceive();
    const waited = await body.act({ type: 'wait' });
    expect(waited.actionText).toBe('Wait');
    expect(waited.trace.waits).toHaveLength(2);
    expect(waited.trace.readyAt - waited.trace.actionEndedAt).toBeGreaterThanOrEqual(OPTIONS.settleQuietMs);

    await body.act({ type: 'scroll', dir: 'up' });
    const { perception } = await body.perceive();
    await body.act({ type: 'click', itemId: find(perception, 'link', 'Next page').id });
    expect(new URL(page.url()).pathname).toBe('/visual-page-scripts.html');
    await body.perceive();
    const back = await body.act({ type: 'back' });
    expect(back.actionText).toBe('Back');
    expect(back.trace.pathBefore).toBe('/visual-page-scripts.html');
    expect(back.trace.pathAfter).toBe(PAGE);
  });

  it('refuses to click an item that is not in the latest Sight', async () => {
    await body.open(server.url(PAGE));
    await expect(body.act({ type: 'click', itemId: 's1' })).rejects.toThrow(/not in the latest Sight/);
  });
});
