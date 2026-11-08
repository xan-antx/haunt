import { expect, test, type Page } from '@playwright/test';

// Home checks for Req 7.10–7.12: the logo is the only h1, and at wide widths the
// "Recent ghost walks" panel sits beside the haunt cards with no empty card-sized track.

const ORIGIN = 'http://localhost:3001';

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

async function openHome(page: Page) {
  await page.goto('/#/');
  await expect(page.locator('main h1')).toBeVisible();
}

test.describe('home heading', () => {
  test('has exactly one h1, named "Haunt"', async ({ page }) => {
    await openHome(page);
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveAccessibleName('Haunt');
    await expect(page.locator('h1')).toHaveCount(1);
  });
});

test.describe('home wide layout', () => {
  for (const [width, height] of [
    [1280, 800],
    [1920, 1080],
  ] as const) {
    test(`at ${width} px the side panel is right of the cards and no empty track is wider than a card`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height });
      await openHome(page);

      const sites = page.getByRole('region', { name: 'Haunted sites' });
      const aside = page.getByRole('complementary', { name: 'Recent ghost walks' });
      const cards = sites.getByRole('article');
      await expect(aside).toBeVisible();
      await expect(cards.first()).toBeVisible();
      expect(await cards.count()).toBeGreaterThan(0);

      const sitesBox = await sites.boundingBox();
      const asideBox = await aside.boundingBox();
      expect(sitesBox, 'Haunted sites region box').not.toBeNull();
      expect(asideBox, 'Recent ghost walks box').not.toBeNull();

      const cardBoxes = await cards.evaluateAll((els) =>
        els.map((el) => {
          // Measure the grid item that holds the article (the visible card), not its padded content.
          const item = el.closest('li') ?? el;
          const r = item.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, width: r.width };
        }),
      );
      const cardsRight = Math.max(...cardBoxes.map((c) => c.right));
      const cardsTop = Math.min(...cardBoxes.map((c) => c.top));
      const cardWidth = Math.min(...cardBoxes.map((c) => c.width));

      // Side panel is to the right of the cards, starting at roughly the same height.
      expect(asideBox!.x, 'aside left edge vs cards right edge').toBeGreaterThanOrEqual(cardsRight - 1);
      expect(Math.abs(asideBox!.y - sitesBox!.y), 'aside top vs cards region top').toBeLessThanOrEqual(48);
      expect(Math.abs(asideBox!.y - cardsTop), 'aside top vs first card top').toBeLessThanOrEqual(96);

      // The cards list: the rightmost card reaches its right edge within one gap.
      const list = await sites.evaluate((region) => {
        const cardEl = region.querySelector('article');
        let el: HTMLElement | null = cardEl?.parentElement ?? null;
        // Walk up to the grid that lays out the cards (the list), stopping at the region.
        while (el && el !== region && getComputedStyle(el).display !== 'grid') el = el.parentElement;
        const target = el ?? (region as HTMLElement);
        const r = target.getBoundingClientRect();
        const style = getComputedStyle(target);
        const gap = parseFloat(style.columnGap) || 0;
        return { right: r.right, gap };
      });
      const emptyRight = list.right - cardsRight;
      expect(emptyRight, 'empty space beside the cards (within one gap)').toBeLessThanOrEqual(list.gap + 1);
      expect(emptyRight, 'empty space beside the cards (narrower than a card)').toBeLessThan(cardWidth);

      // And nothing scrolls sideways.
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(0);
    });
  }
});
