import { createRequire } from 'node:module';
import { expect, test, type Page } from '@playwright/test';

// Final check 4: axe reports 0 violations on every dashboard state at 1536 px and 320 px, on the
// REAL recorded runs (run with playwright.recorded.config.ts after `npm run build`):
//   every screen, the Graveyard map and its filters, the Ask panel, the real-world screen, an
//   unknown run and address, the Ghost Cam at the first, a middle and the last step of every
//   recorded run, and each of the 8 tour stops.
// The page must also not scroll sideways at either width.

const BASE = process.env.HAUNT_BASE ?? '/haunt/';
const ORIGIN = 'http://localhost:3001';
const SIZES = [
  { width: 1536, height: 864 },
  { width: 320, height: 640 },
];

test.use({ bypassCSP: true });
const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

interface IndexEntry {
  key: string;
  errors: unknown[];
}

async function violations(page: Page): Promise<string[]> {
  if (!(await page.evaluate(() => 'axe' in window))) await page.addScriptTag({ path: axePath });
  return page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (ctx: Document) => Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }> } }).axe;
    const result = await axe.run(document);
    return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  });
}

async function settled(page: Page) {
  await expect(page.locator('main h1')).toBeVisible();
  await expect(page.locator('main')).not.toContainText('Loading');
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll<HTMLImageElement>('img')).every((img) => img.complete),
  );
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

// Final check 5: no screen's text or page title shows the Memos password, a doubled apostrophe,
// "couldn't sign", "Succeeded", a bare localhost address or a local Windows path. Commands and
// addresses inside <code> and <pre> (the Reproduce command, the Site URL) are meant to be copied
// and are left out; everything else is read at every step of every recorded run.
const FORBIDDEN: [string, RegExp][] = [
  ['the Memos password', /HauntTest123!/],
  ['a doubled apostrophe', /''/],
  ["couldn't sign", /couldn[’']t sign/i],
  ['"Succeeded"', /Succeeded/],
  ['a bare localhost address', /localhost|127\.0\.0\.1/],
  ['a local Windows path', /[A-Za-z]:\\|\\Users\\|%USERPROFILE%/],
];

test('no screen shows a forbidden string, at every step of every recorded run', async ({ page }) => {
  test.setTimeout(20 * 60_000);
  await page.setViewportSize({ width: 1536, height: 864 });
  await page.goto(BASE);
  const index = (await page.evaluate(async (base) => (await fetch(`${base}runs/index.json`)).json(), BASE)) as {
    entries: IndexEntry[];
  };
  const keys = index.entries.filter((e) => e.errors.length === 0).map((e) => e.key);
  const found: string[] = [];
  const read = async (label: string) => {
    const text = await page.evaluate(() => {
      const copy = document.body.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('code, pre, script, style').forEach((e) => e.remove());
      return `${document.title}\n${copy.innerText}`;
    });
    for (const [name, pattern] of FORBIDDEN) {
      const match = pattern.exec(text);
      if (match) found.push(`${label}: shows ${name} (near "${text.slice(Math.max(0, match.index - 40), match.index + 40).replace(/\n/g, ' ')}")`);
    }
  };
  for (const hash of ['#/', '#/graveyard', '#/graveyard?view=map', '#/exorcise', '#/coverage', '#/real-world', '#/no-such-room']) {
    await page.goto(`${BASE}${hash}`);
    await settled(page);
    await read(hash);
  }
  for (const key of keys) {
    await page.goto(`${BASE}#/run/${key}/step/1`);
    await settled(page);
    const total = Number((await page.locator('[data-cam-area="controls"]').textContent())?.match(/of (\d+)/)?.[1]);
    for (let n = 1; n <= total; n++) {
      if (n > 1) {
        await page.evaluate((hash) => {
          window.location.hash = hash;
        }, `#/run/${key}/step/${n}`);
        await expect(page.locator('[data-cam-area="controls"]')).toContainText(`Step ${n} of ${total}`);
      }
      await read(`run ${key} step ${n}`);
    }
  }
  expect(found, found.join('\n')).toEqual([]);
});

for (const size of SIZES) {
  test(`axe: every state at ${size.width} px`, async ({ page }) => {
    test.setTimeout(20 * 60_000);
    await page.setViewportSize(size);
    const outside: string[] = [];
    page.on('request', (request) => {
      if (new URL(request.url()).origin !== ORIGIN) outside.push(request.url());
    });
    await page.goto(BASE);
    const index = (await page.evaluate(async (base) => (await fetch(`${base}runs/index.json`)).json(), BASE)) as {
      entries: IndexEntry[];
    };
    const keys = index.entries.filter((e) => e.errors.length === 0).map((e) => e.key);
    expect(keys.length).toBeGreaterThanOrEqual(9);

    const found: string[] = [];
    const states: string[] = [];
    const check = async (label: string) => {
      states.push(label);
      const list = await violations(page);
      for (const v of list) found.push(`${label}: ${v}`);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 0) found.push(`${label}: the page scrolls sideways by ${overflow}px`);
    };

    const hashes = [
      '#/',
      '#/graveyard',
      '#/graveyard?view=map',
      '#/graveyard?view=map&ghost=phantom',
      '#/graveyard?view=map&ghost=listener',
      '#/graveyard?view=map&ghost=bebe',
      '#/graveyard?ghost=bebe',
      '#/exorcise',
      '#/coverage',
      '#/real-world',
      '#/run/nobody/step/1',
      '#/no-such-room',
    ];
    for (const hash of hashes) {
      await page.goto(`${BASE}${hash}`);
      await settled(page);
      await check(hash);
    }

    for (const key of keys) {
      const steps = Number(
        await (async () => {
          await page.goto(`${BASE}#/run/${key}/step/1`);
          await settled(page);
          return (await page.locator('[data-cam-area="controls"]').textContent())?.match(/of (\d+)/)?.[1];
        })(),
      );
      for (const n of new Set([1, Math.ceil(steps / 2), steps])) {
        await page.goto(`${BASE}#/run/${key}/step/${n}`);
        await settled(page);
        await check(`run ${key} step ${n}`);
      }
      await page.goto(`${BASE}#/run/${key}/step/1?ask=why-give-up`);
      await settled(page);
      await check(`run ${key} ask panel`);
    }

    // The tour: all eight stops.
    await page.goto(`${BASE}#/`);
    await settled(page);
    await page.getByRole('button', { name: 'Take the 60-second tour' }).click();
    for (let stop = 1; stop <= 8; stop++) {
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.waitForTimeout(400);
      await check(`tour stop ${stop}`);
      if (stop < 8) await page.keyboard.press('Enter');
    }

    console.log(`axe at ${size.width} px: ${states.length} states checked`);
    expect(found, found.join('\n')).toEqual([]);
    expect(outside, 'requests outside localhost:3001').toEqual([]);
  });
}
