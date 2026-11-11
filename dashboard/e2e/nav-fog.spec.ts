import { expect, test, type Page } from '@playwright/test';

// Nav_Fog checks (Req 16.7–16.10): the fog behind the header spans the viewport from edge to edge,
// never makes the page scroll sideways, follows viewport changes without a reload, and never sits
// on top of a navigation link.

// The fixture runs (fixtures/runs/): the real Listener run and the Bebe sample are shown.
const ORIGIN = 'http://localhost:3001';
const REAL = '2026-11-10T1822Z-listener-pay-bill';
const B = '2026-11-03-bebe-pay-bill';

// The five Screens, plus the two views that replaced the Haunted Map and Séance screens.
const SCREENS: [string, string][] = [
  ['Home', '#/'],
  ['Graveyard Map view', '#/graveyard?ghost=phantom&view=map'],
  ['Graveyard', '#/graveyard'],
  ['Ghost Cam (Listener)', `#/run/${REAL}/step/20`],
  ['Ghost Cam (Bebe)', `#/run/${B}/step/3`],
  ['Ghost Cam with the Ask panel', `#/run/${REAL}/step/20?ask=where-stuck`],
  ['Exorcise', '#/exorcise'],
  ['Spec Coverage', '#/coverage'],
];

// 200% browser zoom halves the CSS-pixel viewport: a 1920×1080 window at 200% is 960×540.
const SIZES: { label: string; width: number; height: number }[] = [
  { label: '320 px', width: 320, height: 720 },
  { label: '768 px', width: 768, height: 1024 },
  { label: '1280 px', width: 1280, height: 800 },
  { label: '1920 px', width: 1920, height: 1080 },
  { label: '2560 px', width: 2560, height: 1440 },
  { label: '200% zoom (960×540)', width: 960, height: 540 },
];

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

/** Below 900 px the list is behind the Menu button (Req 20.3); open it so every link can be checked. */
async function openMenuIfNarrow(page: Page) {
  const menu = page.getByRole('button', { name: 'Menu' });
  if ((await menu.isVisible()) && (await menu.getAttribute('aria-expanded')) !== 'true') await menu.click();
  if (await menu.isVisible()) await expect(menu).toHaveAttribute('aria-expanded', 'true');
}

async function open(page: Page, hash: string) {
  await page.goto(`/haunt/${hash}`);
  await expect(page.locator('main h1')).toBeVisible();
  await openMenuIfNarrow(page);
  // The Ghost Cam link appears once the runs have loaded.
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Ghost Cam' })).toBeVisible();
  await expect(page.locator('header [data-fog]')).toHaveCount(1);
}

type FogMeasure = {
  clientWidth: number;
  scrollWidth: number;
  fogLeft: number;
  fogRight: number;
  fogWidth: number;
  layerWidths: number[];
};

async function measureFog(page: Page): Promise<FogMeasure> {
  return page.evaluate(() => {
    const fog = document.querySelector<HTMLElement>('header [data-fog]');
    if (!fog) throw new Error('header fog not found');
    const rect = fog.getBoundingClientRect();
    const layers = Array.from(fog.querySelectorAll<SVGSVGElement>('[data-fog-layer]'));
    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      fogLeft: rect.left,
      fogRight: rect.right,
      fogWidth: rect.width,
      layerWidths: layers.map((layer) => layer.getBoundingClientRect().width),
    };
  });
}

async function expectFullWidthFog(page: Page, where: string) {
  const m = await measureFog(page);
  expect(Math.abs(m.fogLeft), `${where}: fog left edge`).toBeLessThanOrEqual(1);
  expect(Math.abs(m.fogRight - m.clientWidth), `${where}: fog right edge vs clientWidth ${m.clientWidth}`).toBeLessThanOrEqual(1);
  expect(m.layerWidths.length, `${where}: fog layers`).toBe(2);
  for (const [i, width] of m.layerWidths.entries()) {
    expect(width, `${where}: layer ${i + 1} width vs twice the fog width`).toBeGreaterThanOrEqual(2 * m.fogWidth - 1);
  }
  expect(m.scrollWidth, `${where}: scrollWidth ≤ clientWidth`).toBeLessThanOrEqual(m.clientWidth);
}

async function expectNavLinksOnTop(page: Page, where: string) {
  const links = page.getByRole('navigation', { name: 'Main' }).getByRole('link');
  const count = await links.count();
  expect(count, `${where}: nav links`).toBe(5);
  // The Menu button, where shown, must not be covered by the fog either (Req 16.10).
  const menu = page.getByRole('button', { name: 'Menu' });
  if (await menu.isVisible()) {
    const onTop = await menu.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return top !== null && (top === el || el.contains(top));
    });
    expect(onTop, `${where}: elementFromPoint at the centre of the Menu button returns it`).toBe(true);
  }
  for (let i = 0; i < count; i++) {
    const link = links.nth(i);
    await link.scrollIntoViewIfNeeded();
    const hit = await link.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { onTop: top !== null && (top === el || el.contains(top)), label: el.textContent ?? '' };
    });
    expect(hit.onTop, `${where}: elementFromPoint at the centre of "${hit.label}" returns the link`).toBe(true);
  }
}

test.describe('Nav_Fog spans the viewport', () => {
  // Each test walks every screen with the animated, blurred fog at sizes up to 2560 px. Alone one
  // takes about 7 s; three at once in parallel workers starve each other of CPU and pass 90 s.
  // Running this group in order in one worker keeps every check and avoids that contention.
  test.describe.configure({ mode: 'default' });

  for (const size of SIZES) {
    test(`${size.label}: full-width fog, no sideways scroll, nav links reachable on every screen`, async ({ page }) => {
      await page.setViewportSize({ width: size.width, height: size.height });
      for (const [name, hash] of SCREENS) {
        await open(page, hash);
        const where = `${name} at ${size.label}`;
        await expectFullWidthFog(page, where);
        await expectNavLinksOnTop(page, where);
      }
    });
  }

  test('follows viewport changes without a reload', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, '#/');
    // A reload would clear this marker.
    await page.evaluate(() => {
      (window as unknown as { __navFogNoReload?: boolean }).__navFogNoReload = true;
    });
    for (const size of [...SIZES, ...[...SIZES].reverse()]) {
      await page.setViewportSize({ width: size.width, height: size.height });
      // Wait until layout reflects the new width (a vertical scrollbar may take up to ~20 px).
      await expect
        .poll(async () => page.evaluate(() => document.documentElement.clientWidth))
        .toBeGreaterThan(size.width - 30);
      await expect
        .poll(async () => page.evaluate(() => document.documentElement.clientWidth))
        .toBeLessThanOrEqual(size.width);
      const where = `Home after resize to ${size.label}`;
      await openMenuIfNarrow(page);
      await expectFullWidthFog(page, where);
      await expectNavLinksOnTop(page, where);
    }
    const marker = await page.evaluate(() => (window as unknown as { __navFogNoReload?: boolean }).__navFogNoReload);
    expect(marker, 'page was not reloaded').toBe(true);
  });
});
