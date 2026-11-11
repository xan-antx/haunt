import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';

// The suite runs against fixtures/runs/ (see playwright.config.ts): the real Listener run, which
// hides the Listener sample from every list, and the Bebe sample, labelled "Sample run".
const ORIGIN = 'http://localhost:3001';
const REAL = '2026-11-10T1822Z-listener-pay-bill';
const L = '2026-11-03-listener-pay-bill';
const B = '2026-11-03-bebe-pay-bill';

// The five Screens, plus the two views that replaced the Haunted Map and Séance screens.
const SCREENS: [string, string][] = [
  ['Home', '#/'],
  ['Graveyard Map view', '#/graveyard?ghost=phantom&view=map'],
  ['Graveyard', '#/graveyard'],
  ['Ghost Cam (Listener)', `#/run/${REAL}/step/20`],
  ['Ghost Cam (Listener sample, by link)', `#/run/${L}/step/9`],
  ['Ghost Cam (Bebe sample)', `#/run/${B}/step/3`],
  ['Ghost Cam with the Ask panel', `#/run/${REAL}/step/20?ask=where-stuck`],
  ['Exorcise', '#/exorcise'],
  ['Spec Coverage', '#/coverage'],
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

async function open(page: Page, hash: string) {
  await page.goto(`/haunt/${hash}`);
  await expect(page.locator('main h1')).toBeVisible();
}

test.describe('deep links', () => {
  test('a step URL opens that step, paused', async ({ page }) => {
    await open(page, `#/run/${REAL}/step/20`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Ghost Cam: The Listener: /);
    await expect(page.getByRole('button', { name: 'Play' })).toHaveAttribute('aria-pressed', 'false');
    // Scoped to the Timeline: the current Transcript line also has aria-current="step" (Req 10.18).
    const timeline = page.getByRole('region', { name: 'Timeline' });
    await expect(timeline.locator('[aria-current="step"]')).toHaveCount(1);
    await expect(timeline.locator('[aria-current="step"]')).toHaveAccessibleName('Step 20, finding: Keyboard trap');
    await page.waitForTimeout(1800);
    expect(page.url()).toBe(`${ORIGIN}/haunt/#/run/${REAL}/step/20`);
  });

  test('a link to the Listener sample still opens it, labelled Sample run', async ({ page }) => {
    await open(page, `#/run/${L}/step/9`);
    await expect(page.locator('[data-cam-area="summary"]').getByText('Sample run', { exact: true })).toBeVisible();
  });

  test('#/run/:key replaces the URL with step 1', async ({ page }) => {
    await open(page, `#/run/${B}`);
    await expect(page).toHaveURL(`${ORIGIN}/haunt/#/run/${B}/step/1`);
  });

  // Req 24.4: the newest real Listener run at its first Blocking_Finding, the keyboard trap at step 20.
  test("the tour's Ghost Cam stop opens the Listener trap", async ({ page }) => {
    await open(page, '#/');
    await page.getByRole('button', { name: 'Take the 60-second tour' }).click();
    const next = page.getByRole('dialog').getByRole('button', { name: 'Next' });
    await expect(next).toBeFocused();
    await next.press('Enter');
    await expect(page).toHaveURL(`${ORIGIN}/haunt/#/run/${REAL}/step/20`);
    await expect(page.getByRole('dialog', { name: 'What the page looked like' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page).toHaveURL(`${ORIGIN}/haunt/#/run/${REAL}/step/20`);
    await expect(page.locator('main h1')).toBeFocused();
  });

  test('the Ghost Cam link in the navigation opens the Listener trap', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, '#/');
    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Ghost Cam', exact: true }).click();
    await expect(page).toHaveURL(`${ORIGIN}/haunt/#/run/${REAL}/step/20`);
  });
});

test.describe('exorcise', () => {
  // The Listener's only shown run is the real one, so it has no after run yet; with a real run,
  // the "only sample runs" sentence is gone.
  test('with the fixture runs, #/exorcise shows no after run for The Listener and no table', async ({ page }) => {
    await open(page, '#/exorcise');
    await expect(page.getByLabel('Before run')).toHaveValue(REAL);
    const notice = page.getByText('No after run yet for The Listener');
    await expect(notice).toBeVisible();
    await expect(notice).not.toContainText('only has sample runs');
    await expect(page.getByLabel('Before run').locator('option')).toHaveCount(2);
    await expect(page.getByRole('table')).toHaveCount(0);
  });
});

test.describe('keyboard', () => {
  for (const [name, hash] of SCREENS) {
    test(`${name}: skip link first, every stop has a visible focus ring, and focus can leave`, async ({ page }) => {
      await open(page, hash);
      await page.locator('body').focus();
      const seen: string[] = [];
      let leftPage = false;
      for (let i = 0; i < 250; i++) {
        await page.keyboard.press('Tab');
        const info = await page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el || el === document.body) return null;
          const style = getComputedStyle(el);
          const path: string[] = [];
          for (let n: Element | null = el; n && n !== document.body; n = n.parentElement) {
            path.unshift(`${n.tagName}:${Array.from(n.parentElement?.children ?? []).indexOf(n)}`);
          }
          return {
            id: path.join('>'),
            text: (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 40),
            outline: style.outlineStyle,
            width: parseFloat(style.outlineWidth),
          };
        });
        if (info === null) {
          leftPage = true;
          break;
        }
        if (i === 0) expect(info.text).toBe('Skip to main content');
        expect(seen, `focus came back to "${info.text}" (a trap?)`).not.toContain(info.id);
        seen.push(info.id);
        expect(info.outline, `focus ring on "${info.text}"`).not.toBe('none');
        expect(info.width, `focus ring width on "${info.text}"`).toBeGreaterThanOrEqual(3);
      }
      expect(leftPage, 'Tab eventually leaves the page').toBe(true);
      expect(seen.length).toBeGreaterThan(5);
    });
  }

  test('the skip link moves focus to main', async ({ page }) => {
    await open(page, '#/graveyard');
    await page.locator('body').focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page.locator('#main-content')).toBeFocused();
    await expect(page).toHaveURL(`${ORIGIN}/haunt/#/graveyard`);
  });

  test('Ghost Cam controls work by keyboard and keep focus', async ({ page }) => {
    await open(page, `#/run/${REAL}/step/1`);
    const forward = page.getByRole('button', { name: 'Step forward' });
    await forward.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(`${ORIGIN}/haunt/#/run/${REAL}/step/2`);
    await expect(forward).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page).toHaveURL(`${ORIGIN}/haunt/#/run/${REAL}/step/3`);
  });

  test('Full requirement and Full details open by keyboard and close with Escape', async ({ page }) => {
    await open(page, `#/run/${REAL}/step/20`);
    for (const name of ['Full requirement', 'Full details']) {
      const button = page.getByRole('button', { name });
      await button.focus();
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      await page.keyboard.press('Enter');
      await expect(button).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByRole('region', { name })).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(button).toHaveAttribute('aria-expanded', 'false');
      await expect(page.getByRole('region', { name })).toBeHidden();
      await expect(button).toBeFocused();
    }
  });
});

test.describe('motion', () => {
  test('with reduced motion nothing animates', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const [, hash] of SCREENS) {
      await open(page, hash);
      expect(await page.evaluate(() => document.getAnimations().length), hash).toBe(0);
    }
    await open(page, `#/run/${REAL}/step/1`);
    await page.getByRole('button', { name: 'Play' }).click();
    await page.waitForTimeout(700);
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    await expect(page.getByTestId('waveform')).toHaveAttribute('data-animating', 'false');
  });

  test('without the preference, ambient motion runs within its limits', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await open(page, '#/');
    const animations = await page.evaluate(() =>
      document.getAnimations().map((a) => ({
        name: (a as CSSAnimation).animationName,
        duration: Number((a.effect?.getTiming().duration as number) ?? 0),
      })),
    );
    expect(animations.length).toBeGreaterThan(0);
    // Nothing cycles faster than 2.5 s, so nothing can flash more than three times a second.
    for (const a of animations) expect(a.duration).toBeGreaterThanOrEqual(2500);
  });
});

test.describe('reflow', () => {
  for (const width of [320, 640]) {
    test(`no horizontal page scroll at ${width} px (${width === 640 ? '200% zoom' : 'narrow phone'})`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 800 });
      for (const [name, hash] of SCREENS) {
        await open(page, hash);
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(overflow, `${name} scrolls sideways`).toBeLessThanOrEqual(0);
      }
    });
  }
});

test.describe('axe in a real browser', () => {
  // axe is injected as an inline script, which the production CSP would block.
  test.use({ bypassCSP: true });
  const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

  for (const [name, hash] of [...SCREENS, ['Restless or unknown run', '#/run/nobody/step/1'] as [string, string]]) {
    test(`${name} has no violations, including color contrast`, async ({ page }) => {
      await open(page, hash);
      await page.addScriptTag({ path: axePath });
      const violations = await page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run: (ctx: Document) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
        const result = await axe.run(document);
        return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
      });
      expect(violations).toEqual([]);
    });
  }
});
