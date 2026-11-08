import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';

const ORIGIN = 'http://localhost:3001';
const L = '2026-11-03-listener-pay-bill';

// The spoken texts come straight from the sample the dashboard serves, so the check follows the data.
const samplePath = fileURLToPath(new URL('../../runs/samples/listener-gave-up/run.json', import.meta.url));
const sample = JSON.parse(readFileSync(samplePath, 'utf8')) as { steps: { n: number; spoken: string }[] };
const SPOKEN = sample.steps.map((s) => s.spoken);

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

async function open(page: Page, hash: string) {
  await page.goto(`/${hash}`);
  await expect(page.locator('main h1')).toBeVisible();
}

interface LineStyle {
  current: string | null;
  contrast: number;
  borderWidth: number;
  borderColor: string;
}

/** Computed styles for every transcript line, with WCAG contrast against the panel's background. */
async function lineStyles(page: Page): Promise<LineStyle[]> {
  return page.getByRole('region', { name: 'Spoken transcript' }).evaluate((region) => {
    const parse = (c: string) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const [r, g, b, a] = m[1]!.split(/[\s,/]+/).filter(Boolean).map(Number);
      return { r: r!, g: g!, b: b!, a: a ?? 1 };
    };
    const luminance = ({ r, g, b }: { r: number; g: number; b: number }) => {
      const ch = (v: number) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
    };
    // The panel background is the nearest ancestor with an opaque background color.
    let bg = { r: 255, g: 255, b: 255, a: 1 };
    for (let n: Element | null = region; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) {
        bg = c;
        break;
      }
    }
    const bgL = luminance(bg);
    return Array.from(region.querySelectorAll('li')).map((li) => {
      const style = getComputedStyle(li);
      const fgL = luminance(parse(style.color)!);
      const [hi, lo] = fgL > bgL ? [fgL, bgL] : [bgL, fgL];
      return {
        current: li.getAttribute('aria-current'),
        contrast: (hi + 0.05) / (lo + 0.05),
        borderWidth: parseFloat(style.borderLeftWidth),
        borderColor: style.borderLeftColor,
      };
    });
  });
}

test.describe('spoken transcript', () => {
  test('grows one line per step, keeps the current line visible and highlighted, and never scrolls the page', async ({
    page,
  }) => {
    expect(SPOKEN.length).toBeGreaterThanOrEqual(9);
    await open(page, `#/run/${L}/step/1`);
    const region = page.getByRole('region', { name: 'Spoken transcript' });
    const lines = region.locator('li');
    const texts = region.locator('li > span:last-child');
    const forward = page.getByRole('button', { name: 'Step forward' });

    // Focus first, so any scroll caused by focusing is not counted as scroll caused by stepping.
    await forward.focus();
    const scrollY = await page.evaluate(() => window.scrollY);

    for (let n = 1; n <= 9; n++) {
      if (n > 1) await page.keyboard.press('Enter');
      await expect(page).toHaveURL(`${ORIGIN}/#/run/${L}/step/${n}`);
      await expect(lines, `line count at step ${n}`).toHaveCount(n);
      // One line per step, in order. Repeated texts would appear once per step, never merged.
      await expect(texts).toHaveText(SPOKEN.slice(0, n));
      await expect(region.locator('[aria-current="step"]')).toHaveCount(1);
    }

    expect(await page.evaluate(() => window.scrollY), 'page scroll while stepping').toBe(scrollY);

    const last = lines.last();
    await expect(last).toHaveAttribute('aria-current', 'step');
    await expect(region.locator('[aria-current="step"]')).toHaveText(new RegExp(`Step 9\\s+${SPOKEN[8]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`));

    const styles = await lineStyles(page);
    const current = styles[styles.length - 1]!;
    expect(current.current).toBe('step');
    expect(current.borderWidth, 'current line left border width').toBeGreaterThanOrEqual(4);
    expect(current.borderColor, 'current line left border color').not.toMatch(/^(transparent|rgba\(\d+,\s*\d+,\s*\d+,\s*0\))$/);
    for (const [i, line] of styles.slice(0, -1).entries()) {
      expect(current.contrast, `current line contrast vs line ${i + 1}`).toBeGreaterThan(line.contrast);
    }

    // The current line sits inside the scroller's visible box.
    const inside = await region.evaluate((scroller) => {
      const box = scroller.getBoundingClientRect();
      const top = box.top + scroller.clientTop;
      const left = box.left + scroller.clientLeft;
      const li = scroller.querySelector('[aria-current="step"]')!.getBoundingClientRect();
      return {
        top: li.top >= top - 1,
        bottom: li.bottom <= top + scroller.clientHeight + 1,
        left: li.left >= left - 1,
        right: li.right <= left + scroller.clientWidth + 1,
      };
    });
    expect(inside).toEqual({ top: true, bottom: true, left: true, right: true });
  });
});
