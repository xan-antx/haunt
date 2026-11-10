import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';

// First visit in 60 seconds (Req 21, 22, 23, 20.1–20.5, 6.10, 12.10): results first on Home, the
// guided tour by keyboard, the folded Séance and Haunted Map, old links, and the calmer menu.

const ORIGIN = 'http://localhost:3001';
const L = '2026-11-03-listener-pay-bill';
const B = '2026-11-03-bebe-pay-bill';

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

const url = (hash: string) => `${ORIGIN}/haunt/${hash}`;

test.describe('results first on Home', () => {
  test.use({ viewport: { width: 1536, height: 864 } });

  test('says what each ghost found in plain words, right after the Hero', async ({ page }) => {
    await open(page, '#/');
    const results = page.getByRole('region', { name: 'What the ghosts found on Lantern Bills' });
    await expect(results).toBeVisible();
    await expect(results.getByText("The Listener got trapped in a pop-up and couldn't pay.")).toBeVisible();
    await expect(results.getByText("Bebe managed to pay, but found text that wasn't translated.")).toBeVisible();
    await expect(page.getByRole('heading', { name: "What's in here" })).toHaveCount(0);

    // The results heading starts within the first screen, so a first-time visitor sees it at once.
    const heading = await results.getByRole('heading', { level: 2 }).boundingBox();
    expect(heading, 'results heading box').not.toBeNull();
    expect(heading!.y + heading!.height, 'results heading is inside the first screen').toBeLessThanOrEqual(864);

    // And "How Haunt works" comes after the results.
    const how = await page.getByRole('heading', { level: 2, name: 'How Haunt works' }).boundingBox();
    expect(how!.y).toBeGreaterThan(heading!.y);
  });

  test('"Watch it happen" opens the Ghost Cam at the right step with focus on its h1', async ({ page }) => {
    await open(page, '#/');
    await page.getByRole('link', { name: 'Watch it happen: The Listener at step 9' }).click();
    await expect(page).toHaveURL(url(`#/run/${L}/step/9`));
    await expect(page.locator('main h1')).toBeFocused();
    await page.goBack();
    await page.getByRole('link', { name: 'Watch it happen: Bebe at step 3' }).click();
    await expect(page).toHaveURL(url(`#/run/${B}/step/3`));
  });
});

const STOPS: { title: string; hash: string }[] = [
  { title: 'What the ghosts found', hash: '#/' },
  { title: 'What the page looked like', hash: `#/run/${L}/step/9` },
  { title: 'What The Listener heard', hash: `#/run/${L}/step/9` },
  { title: 'Where it got stuck', hash: `#/run/${L}/step/9` },
  { title: 'Every step of the visit', hash: `#/run/${L}/step/9` },
  { title: 'Every problem in one place', hash: '#/graveyard' },
  { title: 'Before and after a fix', hash: '#/exorcise' },
  { title: 'Which requirements people can reach', hash: '#/coverage' },
];

type Rect = { top: number; left: number; bottom: number; right: number };

/** The callout and highlight boxes, the viewport, and the callout's side. */
async function measureStop(page: Page) {
  return page.evaluate(() => {
    const rect = (el: Element | null): Rect | null => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top, left: r.left, bottom: r.bottom, right: r.right };
    };
    const dialog = document.querySelector('[role="dialog"]');
    return {
      dialog: rect(dialog),
      ring: rect(document.querySelector('[data-tour-highlight]')),
      side: dialog?.getAttribute('data-side') ?? null,
      width: document.documentElement.clientWidth,
      height: window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
}

/** Measures until two readings 150 ms apart agree, so any smooth scroll has finished. */
async function settledStop(page: Page) {
  let previous = '';
  for (let i = 0; i < 20; i++) {
    const m = await measureStop(page);
    const now = JSON.stringify(m);
    if (now === previous) return m;
    previous = now;
    await page.waitForTimeout(150);
  }
  return measureStop(page);
}

const overlaps = (a: Rect, b: Rect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

async function walkTour(page: Page) {
  const tourButton = page.getByRole('button', { name: 'Take the 60-second tour' });
  await tourButton.focus();
  await page.keyboard.press('Enter');
  for (const [i, stop] of STOPS.entries()) {
    const dialog = page.getByRole('dialog', { name: stop.title });
    await expect(dialog, `stop ${i + 1}`).toBeVisible();
    await expect(dialog).toContainText(`${i + 1} of ${STOPS.length}`);
    await expect(page).toHaveURL(url(stop.hash));
    const last = i === STOPS.length - 1;
    const next = dialog.getByRole('button', { name: last ? 'Finish' : 'Next' });
    await expect(next, `stop ${i + 1}: focus on ${last ? 'Finish' : 'Next'}`).toBeFocused();
    await expect(page.locator('[data-tour-highlight]'), `stop ${i + 1}: highlight`).toHaveCount(1);

    const m = await settledStop(page);
    expect(m.dialog, `stop ${i + 1}: dialog box`).not.toBeNull();
    expect(m.dialog!.top, `stop ${i + 1}: dialog top`).toBeGreaterThanOrEqual(0);
    expect(m.dialog!.left, `stop ${i + 1}: dialog left`).toBeGreaterThanOrEqual(0);
    expect(m.dialog!.bottom, `stop ${i + 1}: dialog bottom`).toBeLessThanOrEqual(m.height);
    expect(m.dialog!.right, `stop ${i + 1}: dialog right`).toBeLessThanOrEqual(m.width);
    expect(m.scrollWidth, `stop ${i + 1}: no sideways scroll`).toBeLessThanOrEqual(m.width);
    if (m.ring && ['below', 'above', 'right', 'left'].includes(m.side ?? '')) {
      expect(overlaps(m.dialog!, m.ring), `stop ${i + 1}: callout (${m.side}) does not cover its target`).toBe(false);
    }
    await page.keyboard.press('Enter');
  }
}

test.describe('the 60-second tour', () => {
  // The full walks visit five screens with smooth scrolling and ambient motion. Three at once in
  // parallel workers starve the other tests of CPU, so this group runs in order in one worker.
  test.describe.configure({ mode: 'default' });

  for (const viewport of [
    { width: 1536, height: 864 },
    { width: 1280, height: 720 },
    { width: 375, height: 740 },
  ]) {
    test(`at ${viewport.width}×${viewport.height}: every stop by keyboard, in view, off its target, then Finish`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await open(page, '#/');
      await walkTour(page);
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page).toHaveURL(url('#/coverage'));
      await expect(page.locator('main h1')).toBeFocused();
      await expect(page.locator('[inert]')).toHaveCount(0);
    });
  }

  test('Escape closes it and returns focus to the tour button; Back returns to Home', async ({ page }) => {
    await open(page, '#/');
    const tourButton = page.getByRole('button', { name: 'Take the 60-second tour' });
    await tourButton.click();
    await expect(page.getByRole('dialog', { name: 'What the ghosts found' })).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'What the page looked like' })).toBeVisible();
    await page.getByRole('dialog').getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('dialog', { name: 'What the ghosts found' })).toBeVisible();
    await expect(page).toHaveURL(url('#/'));
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(tourButton).toBeFocused();
  });

  test('keeps keyboard focus inside the callout while open, and the page is inert', async ({ page }) => {
    await open(page, '#/');
    await page.getByRole('button', { name: 'Take the 60-second tour' }).click();
    const dialog = page.getByRole('dialog', { name: 'What the ghosts found' });
    await expect(dialog.getByRole('button', { name: 'Next' })).toBeFocused();
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press(i % 2 ? 'Shift+Tab' : 'Tab');
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    }
    // The rest of the page is inert while the tour is open, so pointer input cannot reach it.
    expect(await page.locator('#root').getAttribute('inert')).toBe('');
  });

  test.describe('with reduced motion', () => {
    test.use({ reducedMotion: 'reduce' });

    test('nothing animates while the tour is open', async ({ page }) => {
      await open(page, '#/');
      await page.getByRole('button', { name: 'Take the 60-second tour' }).click();
      await expect(page.getByRole('dialog', { name: 'What the ghosts found' })).toBeVisible();
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog', { name: 'What the page looked like' })).toBeVisible();
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    });
  });

  test.describe('axe while open', () => {
    test.use({ bypassCSP: true });
    const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

    test('has no violations on Home and on the Ghost Cam stop', async ({ page }) => {
      await open(page, '#/');
      await page.getByRole('button', { name: 'Take the 60-second tour' }).click();
      await expect(page.getByRole('dialog', { name: 'What the ghosts found' })).toBeVisible();
      await page.addScriptTag({ path: axePath });
      const run = () =>
        page.evaluate(async () => {
          const axe = (window as unknown as { axe: { run: (ctx: Document) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
          const result = await axe.run(document);
          return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
        });
      expect(await run()).toEqual([]);
      await page.keyboard.press('Enter');
      await expect(page.getByRole('dialog', { name: 'What the page looked like' })).toBeVisible();
      expect(await run()).toEqual([]);
    });
  });
});

test.describe('old links open the right place', () => {
  test('the Haunted Map opens the Graveyard Map view with the same fog', async ({ page }) => {
    await open(page, '#/haunt/lantern-bills-demo/map?ghost=phantom');
    await expect(page).toHaveURL(url('#/graveyard?site=lantern-bills-demo&ghost=phantom&view=map'));
    await expect(page.getByRole('region', { name: 'Map of Lantern Bills demo' })).toBeVisible();
    await expect(page.getByText('The Phantom never entered this room')).toHaveCount(2);
    await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Graveyard' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('a Séance answer opens the Ghost Cam with the Ask panel on that answer', async ({ page }) => {
    await open(page, `#/seance/${L}/why-give-up`);
    await expect(page).toHaveURL(url(`#/run/${L}/step/9?ask=why-give-up`));
    const panel = page.getByRole('region', { name: 'Ask The Listener' });
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('I gave up at step 9 on /bill.');
  });

  test('the Séance opens the Ghost Cam destination with the Ask panel open', async ({ page }) => {
    await open(page, '#/seance');
    await expect(page).toHaveURL(url(`#/run/${L}/step/9?ask=open`));
    await expect(page.getByRole('region', { name: 'Ask The Listener' })).toContainText('The Listener is listening');
  });
});

test.describe('the Ask panel keeps the Ghost Cam on one screen', () => {
  test.use({ viewport: { width: 1536, height: 864 } });
  const AREAS = ['summary', 'shot', 'panel', 'notice', 'controls', 'timeline'] as const;

  async function areaBoxes(page: Page) {
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    return page.evaluate((areas) => {
      return areas.map((a) => {
        const r = document.querySelector(`[data-cam-area="${a}"]`)!.getBoundingClientRect();
        return { name: a, top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom };
      });
    }, [...AREAS]);
  }

  test('opening it moves nothing, and it sits exactly over the panel area', async ({ page }) => {
    await open(page, `#/run/${L}/step/9`);
    const closed = await areaBoxes(page);
    await page.getByRole('button', { name: 'Ask this ghost' }).click();
    const panel = page.getByRole('region', { name: 'Ask The Listener' });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole('button', { name: 'Why did you give up?' })).toBeFocused();
    await panel.getByRole('button', { name: 'Why did you give up?' }).click();
    await expect(page).toHaveURL(url(`#/run/${L}/step/9?ask=why-give-up`));
    const opened = await areaBoxes(page);
    const innerHeight = await page.evaluate(() => window.innerHeight);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    for (const [i, box] of opened.entries()) {
      for (const edge of ['top', 'left', 'width', 'height'] as const) {
        expect(Math.abs(box[edge] - closed[i]![edge]), `${box.name} ${edge} with the panel open`).toBeLessThanOrEqual(1);
      }
      expect(box.bottom, `${box.name} is inside the viewport`).toBeLessThanOrEqual(innerHeight);
    }
    const panelBox = await panel.boundingBox();
    const area = opened.find((b) => b.name === 'panel')!;
    expect(Math.abs(panelBox!.y - area.top), 'Ask panel top').toBeLessThanOrEqual(1);
    expect(Math.abs(panelBox!.height - area.height), 'Ask panel height').toBeLessThanOrEqual(1);

    await page.keyboard.press('Escape');
    await expect(panel).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Ask this ghost' })).toBeFocused();
    await expect(page).toHaveURL(url(`#/run/${L}/step/9`));
  });
});

test.describe('the calmer menu', () => {
  test('from 900 px: five one-line items named by their Screen, and no Menu button', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await open(page, '#/');
    const nav = page.getByRole('navigation', { name: 'Main' });
    const links = nav.getByRole('link');
    await expect(links).toHaveCount(5);
    const names = [];
    for (let i = 0; i < 5; i++) names.push(await links.nth(i).evaluate((el) => (el as HTMLElement).innerText.trim()));
    expect(names).toEqual(['Home', 'Ghost Cam', 'Graveyard', 'Exorcise', 'Spec Coverage']);
    for (const name of names) await expect(nav.getByRole('link', { name, exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Menu' })).toBeHidden();
    const tops = await links.evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().top)));
    expect(new Set(tops).size, 'all items on one row').toBe(1);
  });

  test('below 900 px: the Menu button opens the list with descriptions, and Escape closes it', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 740 });
    await open(page, '#/');
    const menu = page.getByRole('button', { name: 'Menu' });
    await expect(menu).toBeVisible();
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeHidden();

    await menu.click();
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav).toBeVisible();
    const ghostCam = nav.getByRole('link', { name: "Ghost Cam Replay a ghost's visit and ask it why" });
    await expect(ghostCam).toBeVisible();
    await expect(nav.getByText('Every problem found, as a list or a map')).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, 'no sideways scroll with the menu open').toBeLessThanOrEqual(0);

    await ghostCam.focus();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
    await expect(menu).toBeFocused();
    await expect(nav).toBeHidden();

    await menu.click();
    await nav.getByRole('link', { name: /^Graveyard/ }).click();
    await expect(page).toHaveURL(url('#/graveyard'));
    await expect(menu).toHaveAttribute('aria-expanded', 'false');
  });
});
