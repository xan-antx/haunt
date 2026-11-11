import { expect, test, type Page } from '@playwright/test';

// The 60-second tour in ordinary browser windows, not only full screen: at every stop the
// highlighted part is fully on screen with room around it (or its top is, if it is taller than the
// screen), the callout is fully on screen, and the callout does not cover the highlight.

const ORIGIN = 'http://localhost:3001';
// The tour's Ghost Cam stop: the real Listener run from fixtures/runs/ at its keyboard trap.
const REAL = '2026-11-10T1822Z-listener-pay-bill';

const STOPS: { title: string; hash: string }[] = [
  { title: 'What the ghosts found', hash: '#/' },
  { title: 'What the page looked like', hash: `#/run/${REAL}/step/20` },
  { title: 'What The Listener heard', hash: `#/run/${REAL}/step/20` },
  { title: 'Where it got stuck', hash: `#/run/${REAL}/step/20` },
  { title: 'Every step of the visit', hash: `#/run/${REAL}/step/20` },
  { title: 'Every problem in one place', hash: '#/graveyard' },
  { title: 'Before and after a fix', hash: '#/exorcise' },
  { title: 'Which requirements people can reach', hash: '#/coverage' },
];

const VIEWPORTS = [
  { width: 1536, height: 864 },
  { width: 1920, height: 1080 },
  { width: 1536, height: 730 },
  { width: 1366, height: 650 },
];

/** The outline is 3 px wide and drawn outside the highlight's box. */
const OUTLINE = 3;
/** Free space the tour keeps between the highlight and the top and bottom of the screen. */
const SPACE = 12;

type Rect = { top: number; left: number; bottom: number; right: number };

interface Reading {
  dialog: Rect | null;
  /** The highlight with its outline. */
  ring: Rect | null;
  header: Rect | null;
  side: string | null;
  width: number;
  height: number;
  scrollY: number;
}

async function read(page: Page): Promise<Reading> {
  return page.evaluate((outline) => {
    const rect = (el: Element | null, grow = 0): Rect | null => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { top: r.top - grow, left: r.left - grow, bottom: r.bottom + grow, right: r.right + grow };
    };
    const dialog = document.querySelector('[role="dialog"]');
    return {
      dialog: rect(dialog),
      ring: rect(document.querySelector('[data-tour-highlight]'), outline),
      header: rect(document.querySelector('header')),
      side: dialog?.getAttribute('data-side') ?? null,
      width: document.documentElement.clientWidth,
      height: document.documentElement.clientHeight,
      scrollY: window.scrollY,
    };
  }, OUTLINE);
}

/** Reads until two readings 150 ms apart agree, so any smooth scroll has finished. */
async function settled(page: Page): Promise<Reading> {
  let previous = '';
  for (let i = 0; i < 40; i++) {
    const now = await read(page);
    const text = JSON.stringify(now);
    if (text === previous) return now;
    previous = text;
    await page.waitForTimeout(150);
  }
  return read(page);
}

const overlaps = (a: Rect, b: Rect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test.describe(`tour placement, ${reducedMotion === 'reduce' ? 'reduced motion' : 'smooth scrolling'}`, () => {
    test.use({ reducedMotion });
    // Each walk visits five screens; running them in order keeps the machine from starving them.
    test.describe.configure({ mode: 'default' });

    for (const viewport of VIEWPORTS) {
      test(`at ${viewport.width}×${viewport.height}: every stop shows its highlight and callout, apart`, async ({ page }) => {
        const outside: string[] = [];
        page.on('request', (request) => {
          if (new URL(request.url()).origin !== ORIGIN) outside.push(request.url());
        });
        await page.setViewportSize(viewport);
        await page.goto('/haunt/#/');
        await expect(page.locator('main h1')).toBeVisible();
        await page.getByRole('button', { name: 'Take the 60-second tour' }).click();

        for (const [i, stop] of STOPS.entries()) {
          const label = `${viewport.width}×${viewport.height} stop ${i + 1} (${stop.title})`;
          const dialog = page.getByRole('dialog', { name: stop.title });
          await expect(dialog, label).toBeVisible();
          await expect(page.locator('[data-tour-highlight]'), `${label}: highlight`).toHaveCount(1);
          await expect(dialog.getByRole('button', { name: i === STOPS.length - 1 ? 'Finish' : 'Next' })).toBeFocused();

          // The tour says when it has finished scrolling; a slow machine can pause a smooth scroll.
          await expect(dialog, `${label}: finished scrolling`).toHaveAttribute('data-tour-scroll', 'idle');
          const m = await settled(page);
          const ring = m.ring!;
          const callout = m.dialog!;
          expect(ring, `${label}: highlight box`).not.toBeNull();
          expect(callout, `${label}: callout box`).not.toBeNull();

          // The highlighted part: fully on screen with room around it, below the header and, if it
          // is taller than the screen, at least its top.
          const detail = ` [highlight ${JSON.stringify(ring)}, callout ${JSON.stringify(callout)}, scrollY ${m.scrollY}, screen ${m.width}×${m.height}]`;
          const tall = ring.bottom - ring.top > m.height - 2 * SPACE;
          expect(ring.left, `${label}: highlight left`).toBeGreaterThanOrEqual(0);
          expect(ring.right, `${label}: highlight right`).toBeLessThanOrEqual(m.width);
          expect(ring.top, `${label}: highlight top has room${detail}`).toBeGreaterThanOrEqual(SPACE);
          if (m.header && m.header.bottom > 0) {
            expect(ring.top, `${label}: highlight sits below the navigation`).toBeGreaterThanOrEqual(m.header.bottom);
          }
          if (tall) {
            expect(ring.top, `${label}: a tall highlight shows its top`).toBeLessThan(m.height / 2);
          } else {
            expect(ring.bottom, `${label}: highlight bottom has room${detail}`).toBeLessThanOrEqual(m.height - SPACE);
          }

          // The callout: fully on screen, and off the highlight.
          expect(callout.top, `${label}: callout top`).toBeGreaterThanOrEqual(0);
          expect(callout.left, `${label}: callout left`).toBeGreaterThanOrEqual(0);
          expect(callout.bottom, `${label}: callout bottom`).toBeLessThanOrEqual(m.height);
          expect(callout.right, `${label}: callout right`).toBeLessThanOrEqual(m.width);
          expect(m.side, `${label}: callout is beside, above or below`).toMatch(/^(below|above|left|right)$/);
          expect(overlaps(callout, ring), `${label}: callout (${m.side}) does not cover the highlight${detail}`).toBe(false);

          await page.keyboard.press('Enter');
        }
        await expect(page.getByRole('dialog')).toHaveCount(0);
        expect(outside, 'requests outside localhost:3001').toEqual([]);
      });
    }
  });
}

test.describe('scrolling with reduced motion', () => {
  test.use({ reducedMotion: 'reduce', viewport: { width: 1366, height: 650 } });

  test('jumps straight to the stop instead of gliding', async ({ page }) => {
    await page.goto('/haunt/#/');
    await expect(page.locator('main h1')).toBeVisible();
    await page.getByRole('button', { name: 'Take the 60-second tour' }).click();
    // Walk to the last Ghost Cam stop before the timeline ("Where it got stuck").
    for (const stop of STOPS.slice(0, 3)) {
      await expect(page.getByRole('dialog', { name: stop.title })).toBeVisible();
      await settled(page);
      await page.keyboard.press('Enter');
    }
    await expect(page.getByRole('dialog', { name: STOPS[3]!.title })).toBeVisible();
    await settled(page);
    // Record the scroll position on every frame while the tour moves on to the timeline.
    await page.evaluate(() => {
      const seen: number[] = [window.scrollY];
      (window as unknown as { __seen: number[] }).__seen = seen;
      const tick = () => {
        seen.push(window.scrollY);
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: STOPS[4]!.title })).toBeVisible();
    await settled(page);
    const seen = await page.evaluate(() => (window as unknown as { __seen: number[] }).__seen);
    const distinct = [...new Set(seen)];
    expect(distinct.length, `scroll positions seen: ${distinct.join(', ')}`).toBe(2);
  });
});
