import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// UI-04: the Ghost Cam fits on one screen, with no scrolling, for EVERY recorded run in runs/ at
// 1920x1080, 1536x864 and 1440x900, and its timeline is one row with the current step in view.
//
// This suite reads the real runs, so it needs the real build, not the fixture build:
//   npm run build && npx playwright test --config playwright.recorded.config.ts
// It reads `runs/index.json` (collected from ../runs/) to find every run, so a new recorded run
// is covered without editing this file. It writes test-results/recorded-fit.json, one row per run
// and size: the bottom edge of the lowest Ghost Cam element against the viewport height.

const BASE = process.env.HAUNT_BASE ?? '/haunt/';
const ORIGIN = 'http://localhost:3001';
const AREAS = ['summary', 'shot', 'panel', 'notice', 'controls', 'timeline'] as const;
const SIZES = [
  { width: 1920, height: 1080 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
];

interface IndexEntry {
  key: string;
  folder: string;
  errors: unknown[];
}

interface Row {
  run: string;
  size: string;
  steps: number;
  lowestBottom: number;
  lowestArea: string;
  viewportHeight: number;
  pass: boolean;
}
const rows: Row[] = [];

async function settle(page: Page) {
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll<HTMLImageElement>('[data-cam-area="shot"] img')).every(
      (img) => img.complete && img.naturalWidth > 0,
    ),
  );
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

test.describe.configure({ mode: 'serial' });

test('every recorded run fits the Ghost Cam at three sizes', async ({ page }) => {
  test.setTimeout(30 * 60_000);
  const outside: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).origin !== ORIGIN) outside.push(request.url());
  });

  await page.goto(BASE);
  const index = (await page.evaluate(async (base) => (await fetch(`${base}runs/index.json`)).json(), BASE)) as {
    entries: IndexEntry[];
  };
  const runs = index.entries.filter((e) => e.errors.length === 0);
  expect(runs.length, 'the recorded runs were collected').toBeGreaterThanOrEqual(9);

  const failures: string[] = [];
  for (const size of SIZES) {
    await page.setViewportSize(size);
    for (const entry of runs) {
      await page.goto(`${BASE}#/run/${entry.key}/step/1`);
      await expect(page.locator('main h1')).toBeVisible();
      await settle(page);
      const total = Number(((await page.locator('[data-cam-area="controls"]').textContent()) ?? '').match(/of (\d+)/)?.[1]);
      let lowest = 0;
      let lowestArea = '';
      for (let n = 1; n <= total; n++) {
        if (n > 1) {
          await page.evaluate((hash) => {
            window.location.hash = hash;
          }, `#/run/${entry.key}/step/${n}`);
          await expect(page.locator('[data-cam-area="controls"]')).toContainText(`Step ${n} of ${total}`);
          await settle(page);
        }
        const result = await page.evaluate((areas) => {
          const boxes = areas.map((a) => {
            const el = document.querySelector(`[data-cam-area="${a}"]`);
            return { a, bottom: el ? el.getBoundingClientRect().bottom : Infinity };
          });
          const timeline = document.querySelector<HTMLElement>('[data-cam-area="timeline"] ol')!;
          const marks = Array.from(timeline.querySelectorAll<HTMLElement>('button'));
          const tops = new Set(marks.map((m) => Math.round(m.getBoundingClientRect().top)));
          const current = timeline.querySelector<HTMLElement>('button[aria-current="step"]')!.getBoundingClientRect();
          const box = timeline.getBoundingClientRect();
          return {
            boxes,
            scrollY: window.scrollY,
            innerHeight: window.innerHeight,
            rowCount: tops.size,
            smallest: Math.min(...marks.map((m) => Math.min(m.getBoundingClientRect().width, m.getBoundingClientRect().height))),
            currentInView: current.left >= box.left - 1 && current.right <= box.right + 1,
            panelClipped: (() => {
              const shot = document.querySelector('[data-cam-area="shot"]')!.getBoundingClientRect();
              const strip = document.querySelector('[data-testid="thoughts-strip"]')?.getBoundingClientRect();
              return strip ? strip.bottom > shot.bottom + 0.5 : false;
            })(),
          };
        }, [...AREAS]);
        const worst = result.boxes.reduce((a, b) => (b.bottom > a.bottom ? b : a));
        if (worst.bottom > lowest) {
          lowest = worst.bottom;
          lowestArea = worst.a;
        }
        const where = `${entry.key} ${size.width}x${size.height} step ${n}`;
        if (result.scrollY !== 0) failures.push(`${where}: page scrolled`);
        if (worst.bottom > result.innerHeight) failures.push(`${where}: ${worst.a} bottom ${worst.bottom} > ${result.innerHeight}`);
        if (result.rowCount !== 1) failures.push(`${where}: timeline wraps onto ${result.rowCount} rows`);
        if (result.smallest < 24) failures.push(`${where}: a timeline mark is ${result.smallest}px`);
        if (!result.currentInView) failures.push(`${where}: current step is outside the timeline's view`);
        if (result.panelClipped) failures.push(`${where}: the thoughts strip sticks out under the screenshot`);
      }
      rows.push({
        run: entry.key,
        size: `${size.width}x${size.height}`,
        steps: total,
        lowestBottom: Math.round(lowest * 10) / 10,
        lowestArea,
        viewportHeight: size.height,
        pass: !failures.some((f) => f.startsWith(`${entry.key} ${size.width}x${size.height}`)),
      });
    }
  }

  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/recorded-fit.json', JSON.stringify(rows, null, 2));
  expect(failures, failures.join('\n')).toEqual([]);
  expect(outside, 'requests outside localhost:3001').toEqual([]);
});
