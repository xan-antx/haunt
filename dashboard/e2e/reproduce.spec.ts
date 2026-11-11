import { expect, test, type Locator, type Page } from '@playwright/test';

// Reproduce_Command box in the Provenance_Panel (Req 5.6, 5.7, 5.8, 5.11).
// Zoom is emulated by dividing the CSS viewport by the zoom factor, e.g. 2560 px at 400% → 640 px,
// never going below the 320 CSS px floor of Req 5.7 and 18.8.

const ORIGIN = 'http://localhost:3001';
// The real Listener run from fixtures/runs/.
const REAL = '2026-11-10T1822Z-listener-pay-bill';
const HASH = `#/run/${REAL}/step/1`;
const HEIGHT = 1000;
const WIDTHS = [320, 1280, 2560];
const ZOOMS = [1, 2, 4];

// Network guard: fail on any request whose origin is not the dashboard's own.
let outside: string[] = [];
test.beforeEach(async ({ page }) => {
  outside = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== ORIGIN) outside.push(request.url());
  });
});
test.afterEach(() => {
  expect(outside, 'requests outside localhost:3001').toEqual([]);
});

// Req 5.7 and 18.8 cover CSS viewports from 320 px up, so a zoomed width never goes below 320.
const MIN_CSS_WIDTH = 320;
const cssWidth = (width: number, zoom: number) => Math.max(MIN_CSS_WIDTH, Math.round(width / zoom));

async function open(page: Page, width: number, zoom: number): Promise<Locator> {
  await page.setViewportSize({ width: cssWidth(width, zoom), height: Math.round(HEIGHT / zoom) });
  await page.goto(`/haunt/${HASH}`);
  await expect(page.locator('main h1')).toBeVisible();
  // The Provenance_Panel is collapsed by default on the Ghost Cam; open it.
  await page.getByRole('button', { name: 'Where this run came from' }).click();
  const box = page.getByRole('region', { name: 'Reproduce command' });
  await expect(box).toBeVisible();
  return box;
}

/** Number of line boxes the command's text occupies, and its height against its line-height. */
async function lineInfo(box: Locator) {
  return box.locator('code').evaluate((code) => {
    const range = document.createRange();
    range.selectNodeContents(code);
    const tops = new Set(
      Array.from(range.getClientRects())
        .filter((r) => r.width > 0 || r.height > 0)
        .map((r) => Math.round(r.top)),
    );
    return {
      lines: tops.size,
      height: code.getBoundingClientRect().height,
      lineHeight: parseFloat(getComputedStyle(code).lineHeight),
    };
  });
}

async function pageOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

async function scrollState(box: Locator) {
  return box.evaluate((el) => ({ left: el.scrollLeft, max: el.scrollWidth - el.clientWidth }));
}

test.describe('reproduce command', () => {
  for (const width of WIDTHS) {
    for (const zoom of ZOOMS) {
      const label = `${width} px at ${zoom * 100}% (${cssWidth(width, zoom)} px viewport)`;

      test(`${label}: the command stays on one line and the page does not scroll sideways`, async ({ page }) => {
        const box = await open(page, width, zoom);
        const info = await lineInfo(box);
        expect(info.lines, 'line boxes in the command').toBe(1);
        expect(Number.isNaN(info.lineHeight), 'computed line-height is a length').toBe(false);
        expect(Math.abs(info.height - info.lineHeight), 'command height vs line-height').toBeLessThanOrEqual(1);
        expect(await pageOverflow(page), 'page scrolls sideways').toBeLessThanOrEqual(0);
      });
    }
  }

  for (const zoom of ZOOMS) {
    test(`320 px at ${zoom * 100}%: the box is focusable and scrolls to both ends by keyboard`, async ({ page }) => {
      const box = await open(page, 320, zoom);
      await expect(box).toHaveAttribute('tabindex', '0');
      const before = await scrollState(box);
      expect(before.max, 'the command overflows its box').toBeGreaterThan(1);

      await box.focus();
      await expect(box).toBeFocused();

      await page.keyboard.press('End');
      await expect.poll(async () => {
        const s = await scrollState(box);
        return Math.abs(s.left - s.max);
      }).toBeLessThanOrEqual(1);

      await page.keyboard.press('Home');
      await expect.poll(async () => (await scrollState(box)).left).toBeLessThanOrEqual(1);

      await page.keyboard.press('ArrowRight');
      await expect.poll(async () => (await scrollState(box)).left).toBeGreaterThan(1);
      await page.keyboard.press('ArrowLeft');
      await expect.poll(async () => (await scrollState(box)).left).toBeLessThanOrEqual(1);

      // Keys scroll only the box, never the page.
      expect(await pageOverflow(page)).toBeLessThanOrEqual(0);
      expect(await page.evaluate(() => window.scrollX)).toBe(0);
    });
  }

  test('2560 px at 100%: the command fits, so the box is not in the Tab order', async ({ page }) => {
    const box = await open(page, 2560, 1);
    const s = await scrollState(box);
    expect(s.max, 'the command fits its box').toBeLessThanOrEqual(1);
    await expect(box).not.toHaveAttribute('tabindex');
  });

  test('the box joins and leaves the Tab order when the viewport changes', async ({ page }) => {
    const box = await open(page, 2560, 1);
    await expect(box).not.toHaveAttribute('tabindex');

    await page.setViewportSize({ width: 320, height: HEIGHT });
    await expect(box).toHaveAttribute('tabindex', '0');

    await page.setViewportSize({ width: 2560, height: HEIGHT });
    await expect(box).not.toHaveAttribute('tabindex');
  });
});
