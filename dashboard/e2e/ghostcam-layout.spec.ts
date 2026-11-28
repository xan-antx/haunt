import { expect, test, type Page } from '@playwright/test';

// Ghost Cam layout (Req 10.20, 10.24–10.26, 10.28, 10.29, 10.31–10.35, 18.8): the Run_Summary,
// both panels, the Stuck_Notice, the Control_Row and the timeline fit the screen (the footer and
// the collapsed Provenance_Panel may sit below the fold), nothing moves between steps, and narrow
// or zoomed screens stack the areas in reading order.

const ORIGIN = 'http://localhost:3001';
type Sample = { ghost: string; key: string; steps: number; hash: (n: number) => string; findingStep: number };
const sample = (ghost: string, key: string, steps: number, findingStep: number): Sample => ({
  ghost,
  key,
  steps,
  findingStep,
  hash: (n) => `#/run/${key}/step/${n}`,
});
// The fixture runs (fixtures/runs/): the real Listener run, with long requirement, spoken and
// evidence texts, and the two samples. The Listener sample is hidden from lists but opens by link.
const LISTENER = sample('The Listener', '2026-11-10T1822Z-listener-pay-bill', 20, 12);
const LISTENER_SAMPLE = sample('The Listener (sample)', '2026-11-03-listener-pay-bill', 9, 7);
const BEBE = sample('Bebe (sample)', '2026-11-03-bebe-pay-bill', 6, 3);
const SAMPLES: Sample[] = [LISTENER, LISTENER_SAMPLE, BEBE];

// Areas above the fold, in reading order. Each is a `data-cam-area` in GhostCamScreen.tsx
// (the Stuck_Notice slot is rendered by StuckNotice.tsx with `data-cam-area="notice"`).
const AREAS = ['summary', 'shot', 'panel', 'notice', 'controls', 'timeline'] as const;
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

/** Waits until fonts and the screenshot (or Placeholder) of the current step have settled. */
async function settle(page: Page) {
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll<HTMLImageElement>('[data-cam-area="shot"] img')).every((img) => img.complete),
  );
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** Opens a Ghost Cam step and waits until everything has settled. */
async function openCam(page: Page, hash: string) {
  await page.goto(`/haunt/${hash}`);
  await expect(page.locator('main h1')).toBeVisible();
  for (const area of AREAS) await expect(page.locator(`[data-cam-area="${area}"]`)).toBeVisible();
  await expect(page.locator(PROVENANCE)).toBeVisible();
  await settle(page);
}

/** Moves to another step of the same run without reloading the page. */
async function goToStep(page: Page, s: Sample, n: number) {
  await page.evaluate((hash) => {
    window.location.hash = hash;
  }, s.hash(n));
  await expect(page.locator('[data-cam-area="controls"]')).toContainText(`Step ${n} of ${s.steps}`);
  await settle(page);
}

/** Viewport-relative boxes for the six areas and the Provenance_Panel, in reading order. */
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

/** Box of any element by selector, viewport-relative. */
async function boxOf(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`missing element: ${sel}`);
    const r = el.getBoundingClientRect();
    return { top: r.top, left: r.left, width: r.width, height: r.height };
  }, selector);
}

const TRANSCRIPT = '[data-testid="transcript"]';
const NOTICE_SLOT = '[data-testid="stuck-notice-slot"]';

const FIT_VIEWPORTS = [
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

for (const viewport of FIT_VIEWPORTS) {
  test.describe(`Ghost Cam at ${viewport.width}×${viewport.height}, 100% zoom`, () => {
    test.use({ viewport });

    for (const s of SAMPLES) {
      test(`${s.ghost}: every step fits without scrolling`, async ({ page }) => {
        await openCam(page, s.hash(1));

        for (let n = 1; n <= s.steps; n++) {
          if (n > 1) await goToStep(page, s, n);

          const scrollY = await page.evaluate(() => window.scrollY);
          expect(scrollY, `step ${n}: page has not scrolled`).toBe(0);

          const innerHeight = await page.evaluate(() => window.innerHeight);

          const all = await boxes(page);
          const timeline = all.find((b) => b.name === 'timeline')!;
          const provenance = all.find((b) => b.name === 'provenance')!;

          // The footer and the Provenance_Panel may sit below the fold; the six areas may not.
          for (const b of all) {
            expect(b.bottom - b.top, `step ${n}: ${b.name} has height`).toBeGreaterThan(0);
            if (b.name === 'provenance') continue;
            expect(b.bottom, `step ${n}: ${b.name} bottom is within the ${innerHeight} px viewport`).toBeLessThanOrEqual(
              innerHeight,
            );
          }

          // Provenance_Panel is collapsed on load and sits below the timeline.
          expect(provenance.top, `step ${n}: Provenance_Panel starts below the timeline`).toBeGreaterThanOrEqual(
            timeline.bottom,
          );
          await expect(page.locator(`${PROVENANCE} button[aria-expanded]`)).toHaveAttribute('aria-expanded', 'false');
          await expect(page.locator(`${PROVENANCE} dl`)).toBeHidden();
        }
      });

      test(`${s.ghost}: Control_Row is under the panels, timeline under the Control_Row`, async ({ page }) => {
        await openCam(page, s.hash(s.steps));
        const all = await boxes(page);
        const by = (name: string) => all.find((b) => b.name === name)!;
        expect(by('controls').top, 'Control_Row sits below the screenshot').toBeGreaterThanOrEqual(by('shot').bottom - 1);
        expect(by('controls').top, 'Control_Row sits below the panel').toBeGreaterThanOrEqual(by('panel').bottom - 1);
        expect(by('controls').top, 'Control_Row sits below the Stuck_Notice slot').toBeGreaterThanOrEqual(
          by('notice').bottom - 1,
        );
        expect(by('timeline').top, 'timeline sits below the Control_Row').toBeGreaterThanOrEqual(by('controls').bottom - 1);
      });

      test(`${s.ghost}: Run_Summary rows are one line each`, async ({ page }) => {
        await openCam(page, s.hash(s.steps));
        const rows = await page.evaluate(() => {
          const summary = document.querySelector('[data-cam-area="summary"]')!;
          const h1 = summary.querySelector('h1');
          const requirement = Array.from(summary.querySelectorAll('p')).find((p) =>
            (p.getAttribute('title') ?? '').startsWith('Requirement:'),
          );
          return [
            ['name and goal', h1],
            ['requirement and result', requirement ?? null],
          ].map(([name, el]) => {
            if (!el) throw new Error(`missing Run_Summary row: ${String(name)}`);
            const node = el as HTMLElement;
            const style = getComputedStyle(node);
            const fontSize = parseFloat(style.fontSize);
            const lineHeight = style.lineHeight === 'normal' ? fontSize * 1.2 : parseFloat(style.lineHeight);
            return { name: String(name), height: node.getBoundingClientRect().height, lineHeight };
          });
        });
        for (const row of rows) {
          expect(row.height, `${row.name} row is a single line`).toBeLessThan(row.lineHeight * 2);
        }
      });
    }
  });
}

// UI-01, UI-04 and UI-10 on the fixture runs. The same checks run for every recorded run in
// e2e/ghostcam-recorded-fit.spec.ts and e2e/ghostcam-recorded-checks.spec.ts.
test.describe('Ghost Cam thoughts strip, timeline row and stuck notice', () => {
  // The text-spacing test injects a style sheet, which the production CSP would block.
  test.use({ viewport: { width: 1536, height: 864 }, bypassCSP: true });

  test('The Listener: the thoughts strip is under the screenshot, in view, and the timeline is one row', async ({ page }) => {
    await openCam(page, LISTENER.hash(LISTENER.findingStep));
    const strip = page.getByTestId('thoughts-strip');
    await expect(strip.getByRole('heading', { name: 'What The Listener was thinking' })).toBeVisible();
    const shot = await boxOf(page, '[data-cam-area="shot"]');
    const stripBox = await boxOf(page, '[data-testid="thoughts-strip"]');
    expect(stripBox.top + stripBox.height, 'the strip ends inside the stage').toBeLessThanOrEqual(shot.top + shot.height + 1);
    const image = await boxOf(page, '[data-cam-area="shot"] > div:first-child');
    expect(stripBox.top, 'the strip is under the screenshot').toBeGreaterThanOrEqual(image.top + image.height - 1);
    const tops = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-cam-area="timeline"] button')).map((b) => Math.round(b.getBoundingClientRect().top)),
    );
    expect(new Set(tops).size, 'every timeline mark is on one row').toBe(1);
    const smallest = await page.evaluate(() =>
      Math.min(...Array.from(document.querySelectorAll('[data-cam-area="timeline"] button')).map((b) => b.getBoundingClientRect().width)),
    );
    expect(smallest, 'marks are at least 24 px').toBeGreaterThanOrEqual(24);
  });

  test('The Listener: the stuck notice keeps all three lines with WCAG text spacing', async ({ page }) => {
    await openCam(page, LISTENER.hash(LISTENER.steps));
    await page.addStyleTag({
      content: '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }',
    });
    const result = await page.evaluate(() => {
      const notice = document.querySelector<HTMLElement>('[data-testid="stuck-notice"]')!;
      const rect = notice.getBoundingClientRect();
      const lines = Array.from(notice.querySelectorAll<HTMLElement>('p'));
      return {
        count: lines.length,
        clipped: lines.some((p) => p.scrollHeight > p.clientHeight + 1 || getComputedStyle(p).textOverflow === 'ellipsis'),
        outside: lines.some((p) => p.getBoundingClientRect().bottom > rect.bottom + 1),
        noticeClips: notice.scrollHeight > notice.clientHeight + 1,
      };
    });
    expect(result.count).toBe(3);
    expect(result.clipped).toBe(false);
    expect(result.outside).toBe(false);
    expect(result.noticeClips).toBe(false);
  });
});

// R2-06: a mouse click leaves focus on the button it clicked, and the arrow keys must keep working.
test.describe('Ghost Cam keys after a mouse click', () => {
  test.use({ viewport: { width: 1536, height: 864 } });

  const stepText = async (page: Page) => (await page.locator('[data-cam-area="controls"] strong').first().textContent())?.trim();

  test('Left and Right step while a Ghost Cam button has focus, and Space stays with the button', async ({ page }) => {
    await openCam(page, LISTENER.hash(5));
    await page.getByRole('button', { name: 'Step forward' }).click();
    await expect(page.getByRole('button', { name: 'Step forward' })).toBeFocused();
    expect(await stepText(page)).toBe('Step 6 of 20');

    await page.keyboard.press('ArrowRight');
    await expect.poll(() => stepText(page)).toBe('Step 7 of 20');
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => stepText(page)).toBe('Step 6 of 20');

    // A timeline mark, clicked with the mouse, keeps focus too.
    await page.locator('[data-cam-area="timeline"] button', { hasText: /^10$/ }).click();
    await expect.poll(() => stepText(page)).toBe('Step 10 of 20');
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => stepText(page)).toBe('Step 9 of 20');

    // Space on a focused button presses that button (here: Step forward), and does not play or pause.
    await page.getByRole('button', { name: 'Step forward' }).focus();
    await page.keyboard.press('Space');
    await expect.poll(() => stepText(page)).toBe('Step 10 of 20');
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  });

  test('Space plays and pauses only when focus is not on a control', async ({ page }) => {
    await openCam(page, LISTENER.hash(5));
    await page.locator('#main-content').click({ position: { x: 2, y: 2 } });
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible();
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  });

  test('the arrows are left alone in the thought strip, the Ask panel and an open "Full requirement" panel', async ({ page }) => {
    await openCam(page, LISTENER.hash(LISTENER.findingStep));
    const here = await stepText(page);
    // The Ask panel is an open panel: focus moves into it and the arrows do not step the run.
    await page.getByRole('button', { name: 'Ask this ghost' }).click();
    await expect(page.getByRole('button', { name: 'Close' })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    expect(await stepText(page)).toBe(here);
    await page.keyboard.press('Escape');

    // Opened with the mouse, focus stays on the panel's button: the open panel still keeps the arrows.
    await page.getByRole('button', { name: 'Full requirement' }).click();
    await page.keyboard.press('ArrowRight');
    expect(await stepText(page)).toBe(here);
    await page.keyboard.press('Escape');
    // Closed, the same button no longer holds them.
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => stepText(page)).not.toBe(here);
    await page.keyboard.press('ArrowLeft');
    await expect.poll(() => stepText(page)).toBe(here);

    // A focused, scrollable thought strip keeps the arrows.
    const strip = page.getByTestId('thoughts-strip-text');
    await strip.evaluate((el) => {
      el.setAttribute('tabindex', '0');
      el.focus();
    });
    await page.keyboard.press('ArrowRight');
    expect(await stepText(page)).toBe(here);
  });
});

test.describe('Ghost Cam layout stability', () => {
  test.use({ viewport: { width: 1536, height: 864 } });

  test('The Listener: stage, transcript, notice slot, controls and timeline do not move between steps', async ({
    page,
  }) => {
    await openCam(page, LISTENER.hash(1));
    const targets: [string, string][] = [
      ['screenshot stage', '[data-cam-area="shot"]'],
      ['Transcript_Viewport', TRANSCRIPT],
      ['Stuck_Notice slot', NOTICE_SLOT],
      ['Control_Row', '[data-cam-area="controls"]'],
      ['timeline', '[data-cam-area="timeline"]'],
    ];
    const measure = async () => {
      const result: Record<string, { top: number; left: number; width: number; height: number }> = {};
      for (const [name, selector] of targets) result[name] = await boxOf(page, selector);
      return result;
    };

    const first = await measure();
    // A finding step (12) and the last step (20, which also has a finding).
    for (const n of [LISTENER.findingStep, LISTENER.steps]) {
      await goToStep(page, LISTENER, n);
      const now = await measure();
      for (const [name] of targets) {
        for (const edge of ['top', 'left', 'width', 'height'] as const) {
          expect(
            Math.abs(now[name]![edge] - first[name]![edge]),
            `${name} ${edge} at step ${n} matches step 1 within 1 px`,
          ).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  for (const s of SAMPLES) {
    test(`${s.ghost}: the newest transcript line is visible at the last step`, async ({ page }) => {
      await openCam(page, s.hash(s.steps));
      const result = await page.evaluate((sel) => {
        const box = document.querySelector(sel)!.getBoundingClientRect();
        const items = Array.from(document.querySelectorAll(`${sel} li`));
        const inside = (el: Element) => {
          const r = el.getBoundingClientRect();
          return r.height > 0 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1;
        };
        const current = document.querySelector(`${sel} li[aria-current="step"]`);
        return {
          currentText: current?.textContent ?? '',
          currentVisible: current ? inside(current) : false,
          lastText: items[items.length - 1]?.textContent ?? '',
          visibleCount: items.filter(inside).length,
        };
      }, TRANSCRIPT);
      expect(result.currentText, 'Current_Line is the last line').toBe(result.lastText);
      expect(result.currentText).toContain(`Step ${s.steps}`);
      expect(result.currentVisible, 'newest line is fully inside the Transcript_Viewport').toBe(true);
      expect(result.visibleCount, 'at least six lines are visible').toBeGreaterThanOrEqual(Math.min(6, s.steps));
    });

    test(`${s.ghost}: the screenshot and transcript area is at least 380 px tall and the panels match`, async ({
      page,
    }) => {
      await openCam(page, s.hash(s.steps));
      const shot = await boxOf(page, '[data-cam-area="shot"]');
      const panel = await boxOf(page, '[data-cam-area="panel"]');
      const transcript = await boxOf(page, TRANSCRIPT);
      expect(shot.height, 'screenshot area height').toBeGreaterThanOrEqual(380);
      expect(panel.height, 'panel area height').toBeGreaterThanOrEqual(380);
      expect(transcript.height, 'transcript height').toBeGreaterThanOrEqual(6 * 24);
      expect(Math.abs(shot.height - panel.height), 'screenshot and panel are the same height').toBeLessThanOrEqual(1);

      // The screenshot fills its column: the gap between it and the panel is only the grid gap.
      const frame = await boxOf(page, '[data-cam-area="shot"] > div > div');
      expect(panel.left - (frame.left + frame.width), 'no empty gap beside the screenshot').toBeLessThanOrEqual(40);
    });
  }

  // Req 10.29, 10.36: the requirement and the notice's evidence are one line each, and opening their
  // full text moves nothing, stays inside the viewport and keeps clear of the Control_Row.
  test('The Listener: Full requirement and Full details open over the page without moving it', async ({ page }) => {
    await openCam(page, LISTENER.hash(LISTENER.steps));
    const targets: [string, string][] = [
      ['screenshot stage', '[data-cam-area="shot"]'],
      ['Transcript_Viewport', TRANSCRIPT],
      ['Stuck_Notice slot', NOTICE_SLOT],
      ['Control_Row', '[data-cam-area="controls"]'],
      ['timeline', '[data-cam-area="timeline"]'],
    ];
    const measure = async () => {
      const result: Record<string, { top: number; left: number; width: number; height: number }> = {};
      for (const [name, selector] of targets) result[name] = await boxOf(page, selector);
      return result;
    };
    const closed = await measure();

    // The evidence line is one line box, and its sentence is short and plain.
    const evidence = page.getByTestId('stuck-notice').locator('p').nth(2);
    await expect(evidence).toHaveText('Keyboard focus stayed inside the dialog "Protect your payment".');
    const evidenceBox = await evidence.boundingBox();
    expect(evidenceBox!.height, 'evidence is one line').toBeLessThan(2 * 24);

    const innerHeight = await page.evaluate(() => window.innerHeight);
    for (const name of ['Full requirement', 'Full details']) {
      await page.getByRole('button', { name }).click();
      const region = page.getByRole('region', { name });
      await expect(region).toBeVisible();
      const box = (await region.boundingBox())!;
      expect(box.y, `${name} top is on screen`).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height, `${name} bottom is on screen`).toBeLessThanOrEqual(innerHeight);
      const controls = await boxOf(page, '[data-cam-area="controls"]');
      expect(box.y + box.height, `${name} stays above the Control_Row`).toBeLessThanOrEqual(controls.top);
      const now = await measure();
      for (const [target] of targets) {
        for (const edge of ['top', 'left', 'width', 'height'] as const) {
          expect(Math.abs(now[target]![edge] - closed[target]![edge]), `${target} ${edge} with ${name} open`).toBeLessThanOrEqual(1);
        }
      }
      expect(await page.evaluate(() => window.scrollY), `${name}: the page has not scrolled`).toBe(0);
      await page.keyboard.press('Escape');
      await expect(region).toBeHidden();
    }
    await expect(page.getByRole('region', { name: 'Full requirement' })).toBeHidden();
  });

  test('The Listener: the waveform stays inside the Spoken_Panel', async ({ page }) => {
    await openCam(page, LISTENER.hash(LISTENER.steps));
    const wave = await boxOf(page, '[data-testid="waveform"]');
    const panel = await boxOf(page, '[data-cam-area="panel"] section');
    expect(wave.top + wave.height, 'waveform bottom is within the panel').toBeLessThanOrEqual(panel.top + panel.height + 0.5);
    expect(wave.top, 'waveform is below the transcript').toBeGreaterThanOrEqual(
      (await boxOf(page, TRANSCRIPT)).top + (await boxOf(page, TRANSCRIPT)).height - 1,
    );
  });

  test('The Placeholder label never overlaps the focus glow', async ({ page }) => {
    for (const s of SAMPLES) {
      for (let n = 1; n <= s.steps; n++) {
        await openCam(page, s.hash(n));
        const rects = await page.evaluate(() => {
          const caption = Array.from(document.querySelectorAll('[data-cam-area="shot"] div')).find((el) =>
            (el.textContent ?? '').startsWith('No screenshot for step') && el.children.length === 0,
          );
          const glow = document.querySelector('[data-testid="focus-glow"]');
          if (!caption || !glow) return null;
          const c = caption.getBoundingClientRect();
          const g = glow.getBoundingClientRect();
          return { captionTop: c.top, glowBottom: g.bottom };
        });
        if (rects) expect(rects.glowBottom, `${s.ghost} step ${n}: glow ends above the label`).toBeLessThanOrEqual(rects.captionTop + 0.5);
      }
    }
  });

  test('The Listener: Read aloud toggle shares a row with the Controls', async ({ page }) => {
    await openCam(page, LISTENER.hash(LISTENER.steps));
    const controls = page.locator('[data-cam-area="controls"]');
    const group = await controls.getByRole('group', { name: 'Playback' }).boundingBox();
    const toggle = await controls.getByRole('button', { name: /Read aloud \(approximation\)/ }).boundingBox();
    expect(group, 'Playback group is visible').not.toBeNull();
    expect(toggle, 'Read aloud toggle is inside the Control_Row').not.toBeNull();
    const overlap = Math.min(group!.y + group!.height, toggle!.y + toggle!.height) - Math.max(group!.y, toggle!.y);
    expect(overlap, 'toggle and Controls overlap vertically, so they are on one row').toBeGreaterThan(0);
  });
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

    for (const s of SAMPLES) {
      test(`${s.ghost}: areas stack in reading order with no sideways page scroll`, async ({ page }) => {
        await openCam(page, s.hash(s.steps));
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

      test(`${s.ghost}: no sideways scroll and a steady Transcript_Viewport height at every step`, async ({ page }) => {
        await openCam(page, s.hash(1));
        const firstHeight = (await boxOf(page, TRANSCRIPT)).height;
        for (let n = 1; n <= s.steps; n++) {
          if (n > 1) await goToStep(page, s, n);
          const height = (await boxOf(page, TRANSCRIPT)).height;
          expect(Math.abs(height - firstHeight), `Transcript_Viewport height at step ${n}`).toBeLessThanOrEqual(1);
          const { scrollWidth, clientWidth } = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          }));
          expect(scrollWidth, `step ${n}: page does not scroll sideways`).toBeLessThanOrEqual(clientWidth);
        }
      });
    }
  });
}
