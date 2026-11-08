import { expect, test, type Page } from '@playwright/test';

// Home checks for Req 7.10–7.12: the Tagline is the only h1, and at wide widths the
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
  test('has exactly one h1, the Tagline', async ({ page }) => {
    await openHome(page);
    const h1 = page.getByRole('heading', { level: 1 });
    await expect(h1).toHaveCount(1);
    await expect(h1).toHaveAccessibleName('Haunt your app before your users do.');
    await expect(page.locator('[data-haunt-logo]')).toHaveCount(1);
    await expect(page.locator('header [data-haunt-logo]')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveCount(1);
  });
});

test.describe('home hero', () => {
  test('the logo mark appears once, inside the header, not in the Hero', async ({ page }) => {
    await openHome(page);
    await expect(page.locator('[data-haunt-logo]')).toHaveCount(1);
    await expect(page.locator('header [data-haunt-logo]')).toHaveCount(1);
    await expect(page.locator('main [data-haunt-logo]')).toHaveCount(0);
  });

  /** Boxes of the h1 and the three Hero_Ghosts. */
  async function heroBoxes(page: Page) {
    const h1 = await page.getByRole('heading', { level: 1 }).boundingBox();
    const ghosts = page.locator('[data-float="hero"]');
    await expect(ghosts).toHaveCount(3);
    const boxes = [];
    for (let i = 0; i < 3; i++) {
      const box = await ghosts.nth(i).boundingBox();
      expect(box, `Hero_Ghost ${i + 1} box`).not.toBeNull();
      boxes.push(box!);
    }
    expect(h1, 'h1 box').not.toBeNull();
    return { h1: h1!, ghosts: boxes };
  }

  test('at 900 px and wider the three Hero_Ghosts sit to the right of the h1 with names visible', async ({
    page,
  }) => {
    for (const [width, height] of [
      [900, 800],
      [1280, 800],
      [1920, 1080],
    ] as const) {
      await page.setViewportSize({ width, height });
      await openHome(page);
      const { h1, ghosts } = await heroBoxes(page);
      for (const [i, g] of ghosts.entries()) {
        expect(g.x, `at ${width} px Hero_Ghost ${i + 1} left vs h1 right`).toBeGreaterThanOrEqual(h1.x + h1.width - 1);
      }
      for (const name of ['The Listener', 'The Phantom', 'Bebe']) {
        await expect(page.locator('[data-float="hero"]').getByText(name, { exact: true }), `${name} at ${width} px`).toBeVisible();
      }
    }
  });

  test('at 899 px the three Hero_Ghosts sit below the h1', async ({ page }) => {
    await page.setViewportSize({ width: 899, height: 800 });
    await openHome(page);
    const { h1, ghosts } = await heroBoxes(page);
    for (const [i, g] of ghosts.entries()) {
      expect(g.y, `Hero_Ghost ${i + 1} top vs h1 bottom`).toBeGreaterThanOrEqual(h1.y + h1.height - 1);
    }
  });

  test('does not scroll sideways at 320 px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openHome(page);
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  test('does not scroll sideways at 200% zoom (640 px CSS-wide viewport)', async ({ page }) => {
    // 200% zoom of a 1280 px window is a 640 px CSS viewport.
    await page.setViewportSize({ width: 640, height: 400 });
    await openHome(page);
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  });

  /** Top of each Hero_Ghost, sampled every 250 ms for `ms` milliseconds. */
  async function sampleTops(page: Page, ms: number) {
    return page.evaluate(
      (duration) =>
        new Promise<number[][]>((resolve) => {
          const els = Array.from(document.querySelectorAll('[data-float="hero"]'));
          const samples: number[][] = [];
          const read = () => samples.push(els.map((el) => el.getBoundingClientRect().top));
          read();
          const id = setInterval(read, 250);
          setTimeout(() => {
            clearInterval(id);
            read();
            resolve(samples);
          }, duration);
        }),
      ms,
    );
  }

  test.describe('with reducedMotion no-preference', () => {
    test.use({ reducedMotion: 'no-preference' });

    test('each Hero_Ghost has a running animation and moves by at most 12 px over one cycle', async ({ page }) => {
      test.setTimeout(60_000);
      await page.setViewportSize({ width: 1280, height: 800 });
      await openHome(page);

      const states = await page.locator('[data-float="hero"]').evaluateAll((els) =>
        els.map((el) => el.getAnimations().map((a) => a.playState)),
      );
      expect(states).toHaveLength(3);
      for (const [i, s] of states.entries()) {
        expect(s.length, `Hero_Ghost ${i + 1} animation count`).toBeGreaterThan(0);
        expect(s, `Hero_Ghost ${i + 1} play state`).toContain('running');
      }

      // One 6 s cycle plus the longest 3 s delay, so every ghost completes a full cycle.
      const samples = await sampleTops(page, 9500);
      for (let i = 0; i < 3; i++) {
        const tops = samples.map((row) => row[i]!);
        const travel = Math.max(...tops) - Math.min(...tops);
        expect(travel, `Hero_Ghost ${i + 1} vertical travel`).toBeGreaterThan(0);
        expect(travel, `Hero_Ghost ${i + 1} vertical travel`).toBeLessThanOrEqual(12);
      }
    });
  });

  test.describe('with reducedMotion reduce', () => {
    test.use({ reducedMotion: 'reduce' });

    test('no Hero_Ghost animates and positions do not change over 2 seconds', async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await openHome(page);

      const counts = await page.locator('[data-float="hero"]').evaluateAll((els) =>
        els.map((el) => el.getAnimations().length),
      );
      expect(counts).toEqual([0, 0, 0]);

      const samples = await sampleTops(page, 2000);
      for (let i = 0; i < 3; i++) {
        const tops = samples.map((row) => row[i]!);
        expect(Math.max(...tops) - Math.min(...tops), `Hero_Ghost ${i + 1} movement`).toBe(0);
      }
    });
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
