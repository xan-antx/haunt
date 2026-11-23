// Records the Devpost videos and screenshots into media/ at the repo root.
// Needs the dashboard on localhost:3001 and Lantern Bills on localhost:3000 (see README.md).
//
//   npx tsx capture.ts            everything
//   npx tsx capture.ts --videos   videos only
//   npx tsx capture.ts --shots    screenshots only

import { mkdir, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';

const DASHBOARD = withSlash(process.env.DASHBOARD_URL ?? 'http://localhost:3001/');
const LANTERN = withSlash(process.env.LANTERN_URL ?? 'http://localhost:3000/');
const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'media');
const VIDEO_TMP = join(OUT, '.tmp-video');
const SIZE = { width: 1920, height: 1080 };
/** Ghost Cam advances one step every 1500 ms; give each step a little slack. */
const STEP_MS = 1500;
/** Lantern Bills shows its banner 1500 ms after render; wait past it. */
const BANNER_SETTLE_MS = 2500;

type GhostId = 'listener' | 'phantom' | 'bebe';
interface IndexEntry {
  key: string;
  folder: string;
  origin?: string;
  errors: unknown[];
}
interface RunFile {
  ghost: GhostId;
  site: { name: string };
  steps: { n: number }[];
  findings: { step: number; type: string }[];
}
interface PickedRun {
  key: string;
  run: RunFile;
}

function withSlash(url: string): string {
  return url.endsWith('/') ? url : `${url}/`;
}

const dash = (hashPath: string) => `${DASHBOARD}#${hashPath}`;
const stepUrl = (key: string, n: number) => dash(`/run/${encodeURIComponent(key)}/step/${n}`);

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`);
  return (await res.json()) as T;
}

/** Sites named "... (exorcised)" are the fixed copy; their after-runs belong on the Exorcise screen only. */
const EXORCISED_SUFFIX = ' (exorcised)';

/**
 * The newest real run (origin "runs", not a sample) of each ghost on the original site, read from
 * the dashboard itself. Runs on an exorcised copy are skipped.
 */
async function pickRuns(): Promise<Record<GhostId, PickedRun>> {
  const index = await fetchJson<{ entries: IndexEntry[] }>(`${DASHBOARD}runs/index.json`);
  const real = index.entries
    .filter((e) => e.origin === 'runs' && e.errors.length === 0)
    .sort((a, b) => b.key.localeCompare(a.key));
  const picked: Partial<Record<GhostId, PickedRun>> = {};
  for (const entry of real) {
    const folder = entry.folder.split('/').map(encodeURIComponent).join('/');
    const run = await fetchJson<RunFile>(`${DASHBOARD}runs/${folder}/run.json`);
    if (run.site.name.endsWith(EXORCISED_SUFFIX)) continue;
    picked[run.ghost] ??= { key: entry.key, run };
  }
  for (const ghost of ['listener', 'phantom', 'bebe'] as const) {
    if (!picked[ghost]) throw new Error(`No real run for ${ghost} on the original site in ${DASHBOARD}runs/index.json`);
  }
  return picked as Record<GhostId, PickedRun>;
}

const lastStep = (run: RunFile) => run.steps[run.steps.length - 1]!.n;

/** The Listener's trap: the step of its first focus_trap finding, else its last step. */
function trapStep(run: RunFile): number {
  return run.findings.find((f) => f.type === 'focus_trap')?.step ?? lastStep(run);
}

async function newContext(browser: Browser, videoName?: string): Promise<BrowserContext> {
  return browser.newContext({
    viewport: SIZE,
    deviceScaleFactor: 1,
    ...(videoName ? { recordVideo: { dir: VIDEO_TMP, size: SIZE } } : {}),
  });
}

/** Closes the context and moves its video to media/<name>.webm. */
async function finishVideo(context: BrowserContext, page: Page, name: string): Promise<void> {
  const video = page.video();
  await context.close();
  if (!video) throw new Error(`No video for ${name}`);
  const target = join(OUT, `${name}.webm`);
  await video.saveAs(target);
  await video.delete();
  console.log(`  video  ${target}`);
}

/** Waits for a dashboard screen: heading shown, "Summoning…" gone, fonts and images loaded. */
async function settleDashboard(page: Page): Promise<void> {
  await page.locator('main h1').first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByText(/^Summoning .*…$/).first().waitFor({ state: 'detached', timeout: 30_000 }).catch(() => {});
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].filter((img) => !img.complete).map((img) => new Promise((r) => img.addEventListener('load', r, { once: true }))),
    );
  });
  // Park the mouse off the page so no hover state shows.
  await page.mouse.move(SIZE.width - 1, SIZE.height - 1);
}

/** Waits for Lantern Bills: translations, fonts and the late banner in place. */
async function settleLantern(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(BANNER_SETTLE_MS);
  await page.mouse.move(SIZE.width - 1, SIZE.height - 1);
}

async function shot(page: Page, name: string): Promise<void> {
  const target = join(OUT, `${name}.png`);
  await page.screenshot({ path: target, animations: 'disabled', caret: 'hide' });
  console.log(`  shot   ${target}`);
}

/** Opens a run at step 1, presses Play, and holds on `stopAt` (pausing there if it is not the end). */
async function recordGhostCam(browser: Browser, name: string, picked: PickedRun, stopAt: number): Promise<void> {
  const context = await newContext(browser, name);
  const page = await context.newPage();
  const first = picked.run.steps[0]!.n;
  await page.goto(stepUrl(picked.key, first));
  await settleDashboard(page);
  // The transcript is the panel next to the screenshot; make sure it is on screen.
  await page.locator('#spoken-heading, #thought-heading').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);

  await page.getByRole('group', { name: 'Playback' }).getByRole('button', { name: 'Play' }).click();
  await page.mouse.move(SIZE.width - 1, SIZE.height - 1);
  const steps = picked.run.steps.length;
  await page.waitForURL((url) => url.hash.split('?')[0]!.endsWith(`/step/${stopAt}`), {
    timeout: (steps + 5) * STEP_MS * 2,
  });
  if (stopAt !== lastStep(picked.run)) {
    await page.getByRole('group', { name: 'Playback' }).getByRole('button', { name: 'Play' }).click();
    await page.mouse.move(SIZE.width - 1, SIZE.height - 1);
  }
  // Hold on the final frame so the trap / result can be read.
  await page.waitForTimeout(4000);
  await finishVideo(context, page, name);
}

/** Lantern Bills loading twice, so the banner pushing the content down is visible. */
async function recordBannerJump(browser: Browser): Promise<void> {
  const name = 'lantern-bills-banner-jump';
  const context = await newContext(browser, name);
  const page = await context.newPage();
  await page.goto(`${LANTERN}?lang=en`);
  await settleLantern(page);
  for (let i = 0; i < 2; i++) {
    await page.waitForTimeout(1000);
    await page.reload();
    await settleLantern(page);
  }
  await page.waitForTimeout(1000);
  await finishVideo(context, page, name);
}

async function videos(browser: Browser, runs: Record<GhostId, PickedRun>): Promise<void> {
  console.log('Videos');
  const listener = runs.listener;
  await recordGhostCam(browser, 'ghostcam-listener-to-trap', listener, trapStep(listener.run));
  await recordGhostCam(browser, 'ghostcam-phantom', runs.phantom, lastStep(runs.phantom.run));
  await recordGhostCam(browser, 'ghostcam-bebe', runs.bebe, lastStep(runs.bebe.run));
  await recordBannerJump(browser);
}

async function shots(browser: Browser, runs: Record<GhostId, PickedRun>): Promise<void> {
  console.log('Screenshots');
  const context = await newContext(browser);
  const page = await context.newPage();

  const screens: [string, string][] = [
    ['dashboard-home', dash('/')],
    ['dashboard-ghostcam-listener-trap', stepUrl(runs.listener.key, trapStep(runs.listener.run))],
    ['dashboard-graveyard', dash('/graveyard')],
    ['dashboard-exorcise', dash('/exorcise')],
    ['dashboard-spec-coverage', dash('/coverage')],
  ];
  for (const [name, url] of screens) {
    await page.goto(url);
    await settleDashboard(page);
    await shot(page, name);
  }

  for (const [name, lang] of [
    ['lantern-bills-en', 'en'],
    ['lantern-bills-pa', 'pa'],
  ] as const) {
    await page.goto(`${LANTERN}?lang=${lang}`);
    await settleLantern(page);
    await shot(page, name);
  }
  await context.close();
}

async function main(): Promise<void> {
  const args = new Set(process.argv.slice(2));
  const all = !args.has('--videos') && !args.has('--shots');
  await mkdir(OUT, { recursive: true });
  const runs = await pickRuns();
  console.log(`Runs: listener ${runs.listener.key} (trap at step ${trapStep(runs.listener.run)}), phantom ${runs.phantom.key}, bebe ${runs.bebe.key}`);

  const browser = await chromium.launch();
  try {
    if (all || args.has('--shots')) await shots(browser, runs);
    if (all || args.has('--videos')) await videos(browser, runs);
  } finally {
    await browser.close();
    await rm(VIDEO_TMP, { recursive: true, force: true });
  }
  console.log(`Done. Files are in ${OUT}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
