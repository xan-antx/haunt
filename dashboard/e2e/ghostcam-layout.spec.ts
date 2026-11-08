import { expect, test, type Page } from '@playwright/test';

// Ghost Cam layout (Req 10.24–10.26, 18.8): everything above the provenance fits a
// 1920×1080 screen, and narrow or zoomed screens stack the areas in reading order.

const ORIGIN = 'http://localhost:3001';
const SAMPLES: [string, string][] = [
  ['The Listener', '#/run/2026-11-03-listener-pay-bill/step/9'],
  ['Bebe', '#/run/2026-11-03-bebe-pay-bill/step/6'],
];

// Areas above the fold, in reading order. Each is a `data-cam-area` in GhostCamScreen.tsx.
const AREAS = ['summary', 'shot', 'panel', 'controls', 'timeline'] as const;
// The Provenance_Panel is the labelled section inside the "rest" area.
const PROVENANCE = '[data-cam-area="rest"] > section';

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

type Box = { name: string; top: number; bottom: number; left: number; right: number };

/** Opens a Ghost Cam step and waits until fonts and the screenshot (or Placeholder) have settled. */
async function openCam(page: Page, hash: string) {
  await page.goto(`/${hash}`);
  await expect(page.locator('main h1')).toBeVisible();
  for (const area of AREAS) await expect(page.locator(`[data-cam-area="${area}"]`)).toBeVisible();
  await expect(page.locator(PROVENANCE)).toBeVisible();
  // Either the screenshot has finished loading or the Placeholder is showing.
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll<HTMLImageElement>('[data-cam-area="shot"] img')).every((img) => img.complete),
  );
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** Viewport-relative boxes for the five areas and the Provenance_Panel, in reading order. */
async function boxes(page: Page): Promise<Box[]> {
  return page.evaluate(
    ({ areas, provenance }) => {
      const targets: [string, Element | null][] = [
        ...areas.map((a): [string, Element | null] => [a, document.querySelector(`[data-cam-area="${a}"]`)]),
        ['provenance', document.querySelector(provenance)],
      ];
      return targets.map(([name, el]) => {
        if (!el) throw new Error(`missing Ghost Cam area: ${name}`);
        const r = el.getBoundingClientRect();
        return { name, top: r.top, bottom: r.bottom, left: r.left, right: r.right };
      });
    },
    { areas: [...AREAS], provenance: PROVENANCE },
  );
}

test.describe('Ghost Cam at 1920×1080, 100% zoom', () => {
  test.use({ viewport: { width: 1920, height: 1080 } });

  for (const [ghost, hash] of SAMPLES) {
    test(`${ghost}: summary, screenshot, panel, controls and timeline fit without scrolling`, async ({ page }) => {
      await openCam(page, hash);
      const scrollY = await page.evaluate(() => window.scrollY);
      expect(scrollY, 'page has not scrolled').toBe(0);

      const innerHeight = await page.evaluate(() => window.innerHeight);
      const all = await boxes(page);
      const timeline = all.find((b) => b.name === 'timeline')!;
      const provenance = all.find((b) => b.name === 'provenance')!;

      for (const b of all.filter((x) => x.name !== 'provenance')) {
        expect(b.bottom - b.top, `${b.name} has height`).toBeGreaterThan(0);
        expect(b.bottom, `${b.name} bottom is within the 1080 px viewport`).toBeLessThanOrEqual(innerHeight);
      }
      expect(provenance.top, 'Provenance_Panel starts below the timeline').toBeGreaterThanOrEqual(timeline.bottom);
    });
  }
});

// 200% zoom on a 1920×1080 screen is emulated as a 960×540 CSS pixel viewport.
const STACKED: [string, { width: number; height: number }][] = [
  ['320 px', { width: 320, height: 800 }],
  ['899 px', { width: 899, height: 900 }],
  ['200% zoom', { width: 960, height: 540 }],
];

for (const [label, viewport] of STACKED) {
  test.describe(`Ghost Cam stacked at ${label}`, () => {
    test.use({ viewport });

    for (const [ghost, hash] of SAMPLES) {
      test(`${ghost}: areas stack in reading order with no sideways page scroll`, async ({ page }) => {
        await openCam(page, hash);
        const all = await boxes(page);
        expect(all.map((b) => b.name)).toEqual([...AREAS, 'provenance']);

        // Each area starts at or below the bottom of every earlier area (1 px rounding allowed).
        // From 900 px up (which includes 200% zoom, 960×540), design.md keeps the 3fr/2fr stage, so
        // the panel may instead sit level with the screenshot and to its right; reading order
        // left to right is still screenshot then panel. Under 900 px it must be one column.
        for (let i = 1; i < all.length; i++) {
          const cur = all[i]!;
          for (const prev of all.slice(0, i)) {
            const besideShot =
              viewport.width >= 900 &&
              cur.name === 'panel' &&
              prev.name === 'shot' &&
              Math.abs(cur.top - prev.top) <= 1 &&
              cur.left >= prev.right - 1;
            if (besideShot) continue;
            expect(cur.top, `${cur.name} sits below ${prev.name}`).toBeGreaterThanOrEqual(prev.bottom - 1);
          }
        }

        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(scrollWidth, 'page does not scroll sideways').toBeLessThanOrEqual(clientWidth);
      });
    }
  });
}
