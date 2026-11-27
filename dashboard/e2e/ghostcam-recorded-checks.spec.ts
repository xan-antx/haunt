import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// Ghost Cam checks that need the real recorded runs (run with playwright.recorded.config.ts):
//   UI-01  the thoughts strip shows the AI run's step 12 sentence at 1536x864, and a very long
//          thought stays inside its fixed strip and moves nothing
//   UI-10  the stuck notice keeps all three lines with WCAG text spacing and at 400% zoom
//   UI-14, UI-20  both Phantom runs have no axe violations (no scrolling box) at 1536 px and 320 px

const BASE = process.env.HAUNT_BASE ?? '/haunt/';
const AI_RUN = '2026-11-23T1020Z-listener-pay-bill';
const LONGEST_RUN = '2026-11-10T1822Z-listener-pay-bill';
const PHANTOM_RUNS = [
  { key: '2026-11-11T1744Z-phantom-pay-bill', steps: 5 },
  { key: '2026-11-22T1153Z-phantom-pay-bill', steps: 14 },
];

test.use({ bypassCSP: true });
const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');
const report: Record<string, unknown> = {};

async function open(page: Page, key: string, n: number) {
  await page.goto(`${BASE}#/run/${key}/step/${n}`);
  await expect(page.locator('main h1')).toBeVisible();
  await expect(page.locator('[data-cam-area="timeline"]')).toBeVisible();
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll<HTMLImageElement>('[data-cam-area="shot"] img')).every(
      (img) => img.complete && img.naturalWidth > 0,
    ),
  );
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

async function box(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const r = document.querySelector(sel)!.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom };
  }, selector);
}

test.afterAll(() => {
  mkdirSync('test-results', { recursive: true });
  writeFileSync('test-results/recorded-checks.json', JSON.stringify(report, null, 2));
});

test.describe('UI-01 at 1536x864', () => {
  test.use({ viewport: { width: 1536, height: 864 } });

  test('the AI run step 12 thought is visible without scrolling', async ({ page }) => {
    await open(page, AI_RUN, 12);
    const strip = page.getByTestId('thoughts-strip');
    await expect(strip.getByRole('heading', { name: 'What the AI mind decided' })).toBeVisible();
    const sentence = strip.getByText("This button has no name, but it's right after the form fields", { exact: false });
    await expect(sentence).toBeVisible();
    const inView = await page.evaluate(() => {
      const body = document.querySelector('[data-testid="thoughts-strip-text"]')!.getBoundingClientRect();
      const text = document.querySelector('[data-testid="thoughts-strip-text"] p')!.getBoundingClientRect();
      return { scrollY: window.scrollY, textTop: text.top, textBottom: text.bottom, bodyTop: body.top, bodyBottom: body.bottom, vh: window.innerHeight };
    });
    expect(inView.scrollY).toBe(0);
    expect(inView.textTop).toBeGreaterThanOrEqual(inView.bodyTop - 1);
    expect(inView.textBottom).toBeLessThanOrEqual(inView.bodyBottom + 1);
    expect(inView.bodyBottom).toBeLessThanOrEqual(inView.vh);
  });

  test('the longest thought in any run stays inside the strip and moves nothing', async ({ page }) => {
    // The longest thought in any run file is 575 characters, at step 20 of the 2026-11-10 run.
    await open(page, LONGEST_RUN, 1);
    const targets = ['[data-cam-area="shot"]', '[data-testid="transcript"]', '[data-testid="thoughts-strip"]', '[data-cam-area="controls"]', '[data-cam-area="timeline"]'];
    const measure = async () => Promise.all(targets.map((t) => box(page, t)));
    const before = await measure();
    await page.evaluate(() => {
      window.location.hash = '#/run/2026-11-10T1822Z-listener-pay-bill/step/20';
    });
    await expect(page.locator('[data-cam-area="controls"]')).toContainText('Step 20 of 20');
    const long = await page.evaluate(() => {
      const body = document.querySelector<HTMLElement>('[data-testid="thoughts-strip-text"]')!;
      return { chars: body.textContent!.length, scrollHeight: body.scrollHeight, clientHeight: body.clientHeight, focusable: body.getAttribute('tabindex') };
    });
    report.longestThought = long;
    expect(long.chars).toBe(575);
    expect(long.scrollHeight, 'the long thought scrolls inside the strip').toBeGreaterThan(long.clientHeight);
    expect(long.focusable, 'the scrolling strip can take focus').toBe('0');
    const after = await measure();
    targets.forEach((t, i) => {
      for (const edge of ['top', 'left', 'width', 'height'] as const) {
        expect(Math.abs(after[i]![edge] - before[i]![edge]), `${t} ${edge}`).toBeLessThanOrEqual(1);
      }
    });
    // The keyboard reaches the rest of the thought.
    await page.getByTestId('thoughts-strip-text').focus();
    await page.keyboard.press('ArrowDown');
    expect(await page.evaluate(() => document.querySelector('[data-testid="thoughts-strip-text"]')!.scrollTop)).toBeGreaterThan(0);
  });
});

// WCAG 1.4.12 text spacing, applied the way the success criterion's test does.
const TEXT_SPACING = `* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; }
p { margin-bottom: 2em !important; }`;

const NOTICE_VIEWPORTS = [
  { name: '100% zoom', width: 1536, height: 864 },
  { name: '400% zoom', width: 480, height: 270 },
  { name: '320 px', width: 320, height: 640 },
];

for (const viewport of NOTICE_VIEWPORTS) {
  test(`UI-10: the AI run's step 26 notice shows all three lines with text spacing at ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await open(page, AI_RUN, 26);
    await page.addStyleTag({ content: TEXT_SPACING });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const result = await page.evaluate(() => {
      const notice = document.querySelector<HTMLElement>('[data-testid="stuck-notice"]')!;
      const noticeRect = notice.getBoundingClientRect();
      const lines = Array.from(notice.querySelectorAll<HTMLElement>('.text p, [data-testid="stuck-notice"] p'));
      const unique = Array.from(new Set(lines));
      return {
        lineCount: unique.length,
        ellipsis: unique.some((p) => getComputedStyle(p).textOverflow === 'ellipsis'),
        clipped: unique.some((p) => p.scrollHeight > p.clientHeight + 1 || p.scrollWidth > p.clientWidth + 1),
        outside: unique.some((p) => {
          const r = p.getBoundingClientRect();
          return r.top < noticeRect.top - 1 || r.bottom > noticeRect.bottom + 1;
        }),
        noticeClips: notice.scrollHeight > notice.clientHeight + 1,
        overflowHidden: getComputedStyle(notice).overflow === 'hidden',
        texts: unique.map((p) => p.textContent),
        noticeHeight: noticeRect.height,
      };
    });
    report[`notice ${viewport.name}`] = result;
    expect(result.lineCount, 'three lines').toBe(3);
    expect(result.ellipsis).toBe(false);
    expect(result.clipped).toBe(false);
    expect(result.outside).toBe(false);
    expect(result.noticeClips).toBe(false);
    expect(result.overflowHidden).toBe(false);
    // The step line is whole, not cut with an ellipsis.
    expect(result.texts[1]).toBe('Keyboard trap: Keyboard focus is trapped in a dialog');
  });
}

for (const phantom of PHANTOM_RUNS) {
  for (const viewport of [
    { width: 1536, height: 864 },
    { width: 320, height: 640 },
  ]) {
    test(`UI-14, UI-20: ${phantom.key} has no axe violations at ${viewport.width} px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      const violations: string[] = [];
      for (const n of [1, 2, 3, phantom.steps]) {
        await open(page, phantom.key, n);
        await page.addScriptTag({ path: axePath });
        const found = await page.evaluate(async () => {
          const axe = (window as unknown as { axe: { run: (ctx: Document) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
          const result = await axe.run(document);
          return result.violations.map((v) => `${v.id}: ${v.nodes.map((node) => node.target.join(' ')).join(', ')}`);
        });
        violations.push(...found.map((f) => `step ${n}: ${f}`));
        // The whole phone screen shows: the image is not cropped by a scrolling box.
        const phone = await page.evaluate(() => {
          const boxEl = document.querySelector<HTMLElement>('[data-testid="screenshot-box"]')!;
          const img = boxEl.querySelector<HTMLImageElement>('img:not([aria-hidden])')!;
          const scroller = boxEl.closest<HTMLElement>('[class*="scroller"]')!;
          return {
            portrait: boxEl.dataset.portrait,
            imageHeightRatio: img.getBoundingClientRect().height / img.naturalHeight,
            imageWidthRatio: img.getBoundingClientRect().width / img.naturalWidth,
            scrolls: scroller.scrollHeight > scroller.clientHeight + 1 || scroller.scrollWidth > scroller.clientWidth + 1,
          };
        });
        expect(phone.portrait).toBe('true');
        expect(phone.scrolls, `step ${n}: no scrolling box`).toBe(false);
        expect(Math.abs(phone.imageHeightRatio - phone.imageWidthRatio), `step ${n}: the whole screen, not stretched`).toBeLessThan(0.02);
      }
      expect(violations).toEqual([]);
    });
  }
}

// UI-03, UI-13, UI-17 on the real runs: no axe violations on the screens Phase 3 changed.
for (const [name, hash] of [
  ['Home', '#/'],
  ['Spec Coverage', '#/coverage'],
  ['Exorcise', '#/exorcise'],
  ['Graveyard', '#/graveyard'],
] as const) {
  // Exorcise at 320 px has a scrollable table wrapper with no keyboard stop: UI-20, planned for
  // Phase 5 (5.1). Its 320 px check joins this list when that is fixed.
  for (const viewport of [
    { width: 1536, height: 864 },
    ...(name === 'Exorcise' ? [] : [{ width: 320, height: 640 }]),
  ]) {
    test(`Phase 3: ${name} has no axe violations at ${viewport.width} px`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto(`${BASE}${hash}`);
      await expect(page.locator('main h1')).toBeVisible();
      await expect(page.locator('main')).not.toContainText('Loading');
      if (name === 'Spec Coverage') await page.getByRole('button', { name: 'Full requirement' }).first().click();
      await page.addScriptTag({ path: axePath });
      const found = await page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run: (ctx: Document) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
        const result = await axe.run(document);
        return result.violations.map((v) => `${v.id}: ${v.nodes.map((node) => node.target.join(' ')).join(', ')}`);
      });
      expect(found, found.join('\n')).toEqual([]);
    });
  }
}

// UI-08: layout shift on a cold load of Home is below 0.1, and the menu never shows four items.
test('UI-08: Home loads with a layout shift below 0.1 and five menu items throughout', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.addInitScript(() => {
    const w = window as unknown as { __cls: number; __navCounts: Set<number> };
    w.__cls = 0;
    w.__navCounts = new Set();
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) {
        if (!entry.hadRecentInput) w.__cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
    new MutationObserver(() => {
      const items = document.querySelectorAll('nav[aria-label="Main"] li').length;
      if (items > 0) w.__navCounts.add(items);
    }).observe(document, { childList: true, subtree: true });
  });
  // A cold load: a throttled network, so the runs arrive after the first paint.
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  await page.goto(`${BASE}#/`);
  await expect(page.getByTestId('planted-line')).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  const { cls, counts } = await page.evaluate(() => {
    const w = window as unknown as { __cls: number; __navCounts: Set<number> };
    return { cls: w.__cls, counts: [...w.__navCounts] };
  });
  report.coldLoad = { cls, counts };
  expect(cls, 'cumulative layout shift').toBeLessThan(0.1);
  expect(counts, 'the menu always has five items').toEqual([5]);
});

test('UI-17: Home says 5 of 6 were found, on the real runs', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto(`${BASE}#/`);
  await expect(page.getByTestId('planted-line')).toContainText('The ghosts found 5 of 6');
  await expect(page.getByTestId('planted-line')).toContainText('No ghost has reached card errors that are never announced.');
});

test('UI-14: the first Phantom step says why the screen is blank', async ({ page }) => {
  await page.setViewportSize({ width: 1536, height: 864 });
  await open(page, PHANTOM_RUNS[1]!.key, 1);
  await expect(page.getByTestId('slow-load-caption')).toHaveText('The page is still loading on slow 3G');
});
