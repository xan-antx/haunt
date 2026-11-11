import { createHash } from 'node:crypto';
import type { Page } from 'playwright';
import type { ActionResult, Body, Box, Probe, StepTrace } from '../../core/types.ts';
import { quietForMs, READ_CHANGE_CLOCK_EXPRESSION, readChangeClock, type ChangeClockState } from '../../page/changeClock.ts';
import { readClicksSince, type ClickEntry } from '../../page/clickLog.ts';
import { readFocusKeys, type FocusKeys } from '../../page/elementKeys.ts';
import { readSight, type SightReading } from '../../page/sight.ts';
import type { SeenItem, Sight, VisualAction } from './types.ts';

/*
 * The shared Body of the visual ghosts, The Phantom and Bebe (Requirements 13.3 to 13.6, 17.3 to 17.5,
 * 6.6; design "Shared visual body").
 *
 * The Body is the same for both ghosts. What differs is passed in as `VisualBodyOptions`: the Settle
 * quiet time, the Reaction_Delay range, the typing delay and the seeded random numbers.
 *
 * ## Perception
 *
 * `perceive()` takes one look with `page/sight.ts` (a single synchronous evaluation, so the Seen_Items
 * and the probe describe the same moment) and takes the viewport screenshot right after it. The Sight
 * (path, viewport, screenshot, its SHA-256 hash and the Seen_Items) goes to the Mind. The probe (page
 * clock and the element key under each item) is returned separately and goes only to the Detectors.
 * The Body keeps its own copy of the item boxes of the latest Sight, so a click is aimed from what was
 * seen even if the Mind changes the object it was given.
 *
 * ## Actions
 *
 *   click   waits the Reaction_Delay, counted from the moment the Sight was complete (screenshot
 *           taken), then clicks the centre of the item's box from that Sight. It never looks at the
 *           page again before clicking. Afterwards the click log tells which element got the click
 *           (`trace.click.hitKey`, `hitText`) and when (`trace.click.at`, page clock). The trace also
 *           names the aimed Seen_Item and its text (`aimedItem`, `aimedText`), so the misclick
 *           Detector can compare `probe.itemKeys[aimedItem]` with `hitKey`. `focusBox` is the aimed
 *           box and `seenScreenshot` is the Sight's screenshot.
 *   type    types into the focused field with the ghost's delay between characters.
 *   scroll  turns the mouse wheel over the viewport centre by 80% of the viewport height.
 *   wait    waits up to 2000 ms or until the Page_Change_Clock moves, then Settles.
 *   back    the browser's Back.
 *
 * ## Settle and waiting spans
 *
 * After every action the Body waits until the page's `load` event has fired (`readyState` is
 * `complete`) and the Page_Change_Clock has shown no change for the ghost's quiet time, counted from
 * the end of the action too, checking every 50 ms, for at most 20 000 ms.
 *
 * Every Settle and every wait action is recorded in `trace.waits` as a span for the `slow_wait`
 * Detector: `from` and `to`, `progress` (times of Page_Change_Clock changes and times a loading
 * indicator was visible) and `loadingUntil` (the last time in the span at which the `load` event had
 * not fired yet, or `null` when it had fired throughout). An action that replaces the document starts a
 * new page clock, so all the times of one action are kept on one timeline: the page clock read when the
 * action ended (`actionEndedAt`) plus the real time since then. A change seen in a later document is put
 * on that timeline by how long before the read it happened. `readyAt` is on the same timeline, so
 * `readyAt - actionEndedAt` is the real wait.
 *
 * ## The SightedPage facade
 *
 * As in The Listener's Body, the Body code is written against a narrow facade (`SightedPage`) built
 * once by `createSightedPage(page, options)`. It offers the mouse (click, move, wheel), typing, a
 * screenshot, opening an address, Back, and fixed read-only reads of the engine's own page scripts.
 * There is no `evaluate`, `fill`, `focus` or locator, so the Body cannot change the page except the way
 * a person with a mouse and keyboard can.
 */

// ---------------------------------------------------------------------------------------------------------
// Options and constants
// ---------------------------------------------------------------------------------------------------------

/** A closed range of whole milliseconds. */
export interface DelayRange {
  minMs: number;
  maxMs: number;
}

/** What differs between the visual ghosts. */
export interface VisualBodyOptions {
  /** Settle: the Page_Change_Clock must show no change for this long (The Phantom 1200, Bebe 2000). */
  settleQuietMs: number;
  /** Settle never waits longer than this. Default 20 000 ms. */
  settleMaxMs?: number;
  /** The Reaction_Delay before each click (The Phantom 550–650, Bebe 1300–1700). */
  reactionDelay: DelayRange;
  /** Time between two typed characters (The Phantom 120, Bebe 300). */
  typingDelayMs: number;
  /** Seeded random numbers in [0, 1), from the Run's seed. */
  rng: () => number;
}

/** The one CDP call the visual Body makes: a screenshot that does not wait for fonts and images. */
export interface ScreenshotCdp {
  send(method: 'Page.captureScreenshot', params: Record<string, unknown>): Promise<unknown>;
}

/** How often Settle and the wait action look at the page. */
export const SETTLE_POLL_MS = 50;
/** Default upper bound of a Settle. */
export const SETTLE_MAX_MS = 20_000;
/** The wait action waits at most this long for the page to change before it Settles. */
export const WAIT_MAX_MS = 2000;
/** A scroll moves by this share of the viewport height. */
export const SCROLL_SHARE = 0.8;
/** How long `open` waits for the new document to arrive (commit), and Back for its navigation. */
export const NAVIGATION_TIMEOUT_MS = 60_000;

/**
 * The Reaction_Delay for one click: `minMs + floor(rng() * (maxMs - minMs + 1))`, so it is a whole number
 * of milliseconds in `[minMs, maxMs]`. For The Phantom this is `550 + floor(rng() * 101)`.
 */
export function reactionDelayMs(range: DelayRange, rng: () => number): number {
  const span = Math.max(0, Math.floor(range.maxMs) - Math.floor(range.minMs));
  const r = rng();
  const unit = Number.isFinite(r) ? Math.min(Math.max(r, 0), 1 - Number.EPSILON) : 0;
  return Math.floor(range.minMs) + Math.floor(unit * (span + 1));
}

// ---------------------------------------------------------------------------------------------------------
// Page-side read of the waiting signals
// ---------------------------------------------------------------------------------------------------------

/** One read of what tells a person that the page is still busy. */
export interface WaitSignals {
  /** The Page_Change_Clock, or `null` when it is not installed (for example on Chromium's error page). */
  clock: ChangeClockState | null;
  /** True once the document's `load` event has fired (`readyState` is `complete`). */
  complete: boolean;
  /** True when a loading indicator is visible in the viewport. */
  loading: boolean;
}

/**
 * Read-only expression for `WaitSignals`. A loading indicator is an element with role `progressbar`,
 * `aria-busy="true"`, or a class or id containing `spinner` or `loading`, that has a box inside the
 * viewport and is not hidden. These signals go only into the step trace, never to the Mind.
 */
export const READ_WAIT_SIGNALS_EXPRESSION = String.raw`(function () {
  var clock = ${READ_CHANGE_CLOCK_EXPRESSION};
  var complete = document.readyState === 'complete';
  var loading = false;
  try {
    var list = document.querySelectorAll('[role="progressbar" i], [aria-busy="true" i], [class*="spinner" i], [id*="spinner" i], [class*="loading" i], [id*="loading" i]');
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    for (var i = 0; i < list.length && i < 500 && !loading; i += 1) {
      var el = list[i];
      var r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) continue;
      if (r.right <= 0 || r.bottom <= 0 || r.left >= vw || r.top >= vh) continue;
      var shown = typeof el.checkVisibility === 'function'
        ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
        : window.getComputedStyle(el).visibility === 'visible';
      if (shown) loading = true;
    }
  } catch (e) { loading = false; }
  return { clock: clock, complete: complete, loading: loading };
})()`;

// ---------------------------------------------------------------------------------------------------------
// The SightedPage facade
// ---------------------------------------------------------------------------------------------------------

/** Everything the visual Body may do to the browser. See the file comment. */
export interface SightedPage {
  readonly mouse: {
    click(x: number, y: number): Promise<void>;
    move(x: number, y: number): Promise<void>;
    wheel(deltaX: number, deltaY: number): Promise<void>;
  };
  readonly keyboard: {
    /** Types the text with the ghost's delay between characters. */
    type(text: string): Promise<void>;
  };
  /** The viewport as a PNG. */
  screenshot(): Promise<Buffer>;
  /** Goes to an address and returns once the new document has arrived (commit), at most 60 s. */
  navigate(url: string): Promise<void>;
  /** The browser's Back. Returns once the navigation has committed, or at once when there is no history. */
  goBack(): Promise<void>;
  /** The address the page shows now. */
  url(): string;
  /** The viewport size in CSS px, or `null` when it is not known. */
  viewportSize(): { width: number; height: number } | null;
  /** One look with the Sight script, or `null` when it is not installed. */
  readSight(): Promise<SightReading | null>;
  /** The Page_Change_Clock, or `null` when it is not installed. */
  readClock(): Promise<ChangeClockState | null>;
  /** The page clock, `load` state and loading indicators. */
  readWaitSignals(): Promise<WaitSignals>;
  /** The clicks logged at or after `at` (page clock). */
  readClicksSince(at: number): Promise<ClickEntry[]>;
  /** Element keys of the focused element and its dialog, or `null` when the script is not installed. */
  readFocusKeys(): Promise<FocusKeys | null>;
}

/** The members of a `SightedPage`. */
export const SIGHTED_PAGE_KEYS = [
  'mouse',
  'keyboard',
  'screenshot',
  'navigate',
  'goBack',
  'url',
  'viewportSize',
  'readSight',
  'readClock',
  'readWaitSignals',
  'readClicksSince',
  'readFocusKeys',
] as const satisfies readonly (keyof SightedPage)[];

/** Builds the facade. The only function in this file that holds the real `Page`. */
export function createSightedPage(
  page: Page,
  options: Pick<VisualBodyOptions, 'typingDelayMs'>,
  cdp?: ScreenshotCdp,
): SightedPage {
  const facade: SightedPage = {
    mouse: Object.freeze({
      click: (x: number, y: number) => page.mouse.click(x, y),
      move: (x: number, y: number) => page.mouse.move(x, y),
      wheel: (deltaX: number, deltaY: number) => page.mouse.wheel(deltaX, deltaY),
    }),
    keyboard: Object.freeze({
      type: (text: string) => page.keyboard.type(text, { delay: options.typingDelayMs }),
    }),
    screenshot: () =>
      retryScreenshot(async () => {
        if (!cdp) return page.screenshot({ type: 'png' });
        // Page.captureScreenshot does not wait for web fonts and images the way Playwright's screenshot
        // does. On slow 3G that wait took seconds, and The Phantom's Sight came late, after the page had moved.
        // The clip's scale keeps the device pixel ratio, so the picture has the same size as Playwright's.
        const size = page.viewportSize();
        const dpr = (await page.evaluate('window.devicePixelRatio')) as number;
        const params: { format: 'png'; clip?: { x: number; y: number; width: number; height: number; scale: number } } = {
          format: 'png',
        };
        if (size) params.clip = { x: 0, y: 0, width: size.width, height: size.height, scale: dpr };
        const shot = (await cdp.send('Page.captureScreenshot', params)) as { data: string };
        return Buffer.from(shot.data, 'base64');
      }),
    navigate: async (url: string) => {
      await page.goto(url, { waitUntil: 'commit', timeout: NAVIGATION_TIMEOUT_MS });
    },
    goBack: async () => {
      await page.goBack({ waitUntil: 'commit', timeout: NAVIGATION_TIMEOUT_MS });
    },
    url: () => page.url(),
    viewportSize: () => page.viewportSize(),
    readSight: () => readSight(page),
    readClock: () => readChangeClock(page),
    readWaitSignals: async () => (await page.evaluate(READ_WAIT_SIGNALS_EXPRESSION)) as WaitSignals,
    readClicksSince: (at: number) => readClicksSince(page, at),
    readFocusKeys: () => readFocusKeys(page),
  };
  return Object.freeze(facade);
}

// ---------------------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SCREENSHOT_ATTEMPTS = 3;
const SCREENSHOT_RETRY_DELAY_MS = 250;

/** Takes the viewport screenshot, retrying Chromium's "Unable to capture screenshot" of a page not yet composited. */
async function retryScreenshot(take: () => Promise<Buffer>): Promise<Buffer> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await take();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt >= SCREENSHOT_ATTEMPTS || !/Unable to capture screenshot/i.test(message)) throw error;
      await sleep(SCREENSHOT_RETRY_DELAY_MS);
    }
  }
}

/** A closed page or browser must stop the Run; every other read failure (for example mid-navigation) is tolerated. */
function isFatal(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /has been closed|Target closed|Browser closed/i.test(message);
}

async function tolerant<T, F>(read: () => Promise<T>, fallback: F): Promise<T | F> {
  try {
    return await read();
  } catch (error) {
    if (isFatal(error)) throw error;
    return fallback;
  }
}

/** The path of an address, for `Step.page` and the Sight. */
function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function centreOf(box: Box): { x: number; y: number } {
  return { x: round(box.x + box.w / 2), y: round(box.y + box.h / 2) };
}

/** `Click "Pay this bill"`, or for an item without text `Click a button with no text`. */
function clickText(item: Pick<SeenItem, 'look' | 'text'>): string {
  return item.text !== '' ? `Click "${item.text}"` : `Click a ${item.look} with no text`;
}

// ---------------------------------------------------------------------------------------------------------
// Settle and waiting spans
// ---------------------------------------------------------------------------------------------------------

type WaitSpan = StepTrace['waits'][number];

/** One action's timeline: the page clock when the action ended plus the real time since. */
interface Timeline {
  base: number;
  wallStart: number;
}

async function startTimeline(page: SightedPage): Promise<Timeline> {
  const wallStart = Date.now();
  const clock = await tolerant(() => page.readClock(), null);
  return { base: clock?.now ?? 0, wallStart };
}

function timeOn(timeline: Timeline): number {
  return timeline.base + (Date.now() - timeline.wallStart);
}

/** What `watch` hands to its stop condition after each read. */
interface WatchSample {
  /** `undefined` when the read failed, for example while the document is being replaced. */
  signals: WaitSignals | undefined;
  /** Milliseconds since the watch started. */
  elapsedMs: number;
}

interface WatchResult {
  span: WaitSpan;
  /** True when the stop condition held, false when the time ran out. */
  done: boolean;
}

/**
 * Looks at the page every 50 ms until `done` holds or `maxMs` has passed, and records the span:
 * Page_Change_Clock changes and visible loading indicators in `progress`, and the last time the `load`
 * event was still pending in `loadingUntil`. All times are on the action's timeline.
 */
async function watch(
  page: SightedPage,
  timeline: Timeline,
  maxMs: number,
  done: (sample: WatchSample) => boolean,
): Promise<WatchResult> {
  const startedAt = Date.now();
  const from = round(timeOn(timeline));
  const progress = new Set<number>();
  let loadingUntil: number | null = null;
  let previous: ChangeClockState | null = null;
  let finished = false;

  for (;;) {
    const signals = await tolerant<WaitSignals, undefined>(() => page.readWaitSignals(), undefined);
    const t = timeOn(timeline);
    if (signals === undefined) {
      // The document is being replaced: the browser shows its loading bar.
      loadingUntil = round(t);
    } else {
      if (!signals.complete) loadingUntil = round(t);
      if (signals.loading) progress.add(round(t));
      const clock = signals.clock;
      if (clock) {
        const moved =
          previous === null || clock.now < previous.now || clock.lastChange !== previous.lastChange;
        const changedAt = t - Math.max(0, clock.now - clock.lastChange);
        if (moved && changedAt >= from) progress.add(round(changedAt));
        previous = clock;
      }
    }

    const elapsedMs = Date.now() - startedAt;
    if (done({ signals, elapsedMs })) {
      finished = true;
      break;
    }
    if (elapsedMs >= maxMs) break;
    await sleep(Math.min(SETTLE_POLL_MS, maxMs - elapsedMs));
  }

  const to = round(timeOn(timeline));
  const sorted = [...progress].filter((p) => p <= to).sort((a, b) => a - b);
  return { span: { from, to, progress: sorted, loadingUntil }, done: finished };
}

/**
 * Settle: waits until the `load` event has fired and the Page_Change_Clock has shown no change for
 * `quietMs`, counted from the start of the Settle too, checking every 50 ms, for at most `maxMs`.
 */
async function settle(page: SightedPage, timeline: Timeline, quietMs: number, maxMs: number): Promise<WatchResult> {
  return watch(page, timeline, maxMs, ({ signals, elapsedMs }) => {
    if (signals === undefined || !signals.complete || elapsedMs < quietMs) return false;
    return signals.clock === null || quietForMs(signals.clock) >= quietMs;
  });
}

/** The wait action: up to 2000 ms or until the Page_Change_Clock moves. */
async function waitForChange(page: SightedPage, timeline: Timeline): Promise<WatchResult> {
  const first = await tolerant(() => page.readClock(), null);
  return watch(page, timeline, WAIT_MAX_MS, ({ signals }) => {
    if (signals === undefined) return true;
    const clock = signals.clock;
    if (!clock || !first) return false;
    return clock.now < first.now || clock.lastChange !== first.lastChange;
  });
}

// ---------------------------------------------------------------------------------------------------------
// The Body
// ---------------------------------------------------------------------------------------------------------

/** What the Body remembers of its latest Sight, for aiming a click. */
interface LastLook {
  items: ReadonlyMap<string, Readonly<{ look: SeenItem['look']; text: string; box: Readonly<Box> }>>;
  screenshot: Buffer;
  viewport: { w: number; h: number };
  probe: Probe;
  /** `Date.now()` just before the look started. */
  lookWall: number;
  /** `Date.now()` when the screenshot was taken, which completes the Sight. */
  completeWall: number;
}

interface ActionDone {
  actionText: string;
  pathBefore: string;
  timeline: Timeline;
  waits: WaitSpan[];
  touchedKeys: string[];
  focusBox: Box | null;
  click?: StepTrace['click'];
  seenScreenshot?: Buffer;
}

class VisualBody implements Body<Sight, VisualAction> {
  private last: LastLook | null = null;
  private readonly settleMaxMs: number;

  constructor(
    private readonly page: SightedPage,
    private readonly options: VisualBodyOptions,
  ) {
    this.settleMaxMs = options.settleMaxMs ?? SETTLE_MAX_MS;
  }

  async open(url: string): Promise<ActionResult> {
    this.last = null;
    await this.page.navigate(url);
    const timeline = await startTimeline(this.page);
    const pathBefore = pathOf(this.page.url());
    return this.settleAndFinish({ actionText: `Open ${url}`, pathBefore, timeline, waits: [], touchedKeys: [], focusBox: null });
  }

  async perceive(): Promise<{ perception: Sight; probe: Probe }> {
    const lookWall = Date.now();
    const reading = await tolerant(() => this.page.readSight(), null);
    const screenshot = await this.page.screenshot();
    const completeWall = Date.now();

    let path: string;
    let viewport: { w: number; h: number };
    let items: SeenItem[];
    let probe: Probe;
    if (reading) {
      ({ path, viewport, items } = reading);
      probe = { at: reading.probe.at, itemKeys: { ...reading.probe.itemKeys } };
    } else {
      // No Sight script (for example Chromium's error page) or the document is being replaced: nothing to act on.
      const clock = await tolerant(() => this.page.readClock(), null);
      const size = this.page.viewportSize();
      path = pathOf(this.page.url());
      viewport = { w: size?.width ?? 0, h: size?.height ?? 0 };
      items = [];
      probe = { at: clock?.now ?? 0, itemKeys: {} };
    }

    this.last = {
      items: new Map(items.map((item) => [item.id, Object.freeze({ look: item.look, text: item.text, box: Object.freeze({ ...item.box }) })])),
      screenshot,
      viewport: { ...viewport },
      probe: { ...probe },
      lookWall,
      completeWall,
    };

    const perception: Sight = {
      path,
      viewport: { ...viewport },
      screenshot,
      screenshotHash: createHash('sha256').update(screenshot).digest('hex'),
      items,
    };
    return { perception, probe };
  }

  async act(action: VisualAction): Promise<ActionResult> {
    const last = this.last;
    this.last = null;
    switch (action.type) {
      case 'click':
        return this.actClick(action.itemId, last);
      case 'type':
        return this.actType(action.text);
      case 'scroll':
        return this.actScroll(action.dir, last);
      case 'wait':
        return this.actWait();
      case 'back':
        return this.actBack();
    }
  }

  // -- actions ----------------------------------------------------------------------------------------

  private async actClick(itemId: string, last: LastLook | null): Promise<ActionResult> {
    const item = last?.items.get(itemId);
    if (!last || !item) throw new Error(`The visual Body was asked to click "${itemId}", which is not in the latest Sight.`);
    const pathBefore = pathOf(this.page.url());

    // The Reaction_Delay counts from the moment the Sight was complete. The page is not looked at again.
    const delay = reactionDelayMs(this.options.reactionDelay, this.options.rng);
    const remaining = delay - (Date.now() - last.completeWall);
    if (remaining > 0) await sleep(remaining);

    const point = centreOf(item.box);
    await this.page.mouse.click(point.x, point.y);
    const clickWall = Date.now();

    const logged = await tolerant(() => this.page.readClicksSince(last.probe.at), [] as ClickEntry[]);
    const hit = logged.find((entry) => entry.trusted) ?? null;
    const click: NonNullable<StepTrace['click']> = {
      aimed: { ...item.box },
      point,
      hitKey: hit?.key ?? null,
      // Without a log entry (the click replaced the document), the click time is estimated from the look.
      at: hit ? hit.at : round(last.probe.at + (clickWall - last.lookWall)),
      // For the misclick Detector: the aimed item's key is `probe.itemKeys[aimedItem]` of this Step.
      aimedItem: itemId,
      aimedText: item.text,
    };
    if (hit && typeof hit.text === 'string') click.hitText = hit.text;

    const timeline = await startTimeline(this.page);
    return this.settleAndFinish({
      actionText: clickText(item),
      pathBefore,
      timeline,
      waits: [],
      touchedKeys: click.hitKey ? [click.hitKey] : [],
      focusBox: { ...item.box },
      click,
      seenScreenshot: last.screenshot,
    });
  }

  private async actType(text: string): Promise<ActionResult> {
    const pathBefore = pathOf(this.page.url());
    const target = await tolerant(() => this.page.readFocusKeys(), null);
    await this.page.keyboard.type(text);
    const timeline = await startTimeline(this.page);
    return this.settleAndFinish({
      actionText: `Type "${text}"`,
      pathBefore,
      timeline,
      waits: [],
      touchedKeys: target?.focusKey ? [target.focusKey] : [],
      focusBox: null,
    });
  }

  private async actScroll(dir: 'down' | 'up', last: LastLook | null): Promise<ActionResult> {
    const pathBefore = pathOf(this.page.url());
    const size = this.page.viewportSize();
    const w = size?.width ?? last?.viewport.w ?? 0;
    const h = size?.height ?? last?.viewport.h ?? 0;
    const distance = Math.round(h * SCROLL_SHARE);
    await this.page.mouse.move(round(w / 2), round(h / 2));
    await this.page.mouse.wheel(0, dir === 'down' ? distance : -distance);
    const timeline = await startTimeline(this.page);
    return this.settleAndFinish({
      actionText: dir === 'down' ? 'Scroll down' : 'Scroll up',
      pathBefore,
      timeline,
      waits: [],
      touchedKeys: [],
      focusBox: null,
    });
  }

  private async actWait(): Promise<ActionResult> {
    const pathBefore = pathOf(this.page.url());
    const timeline = await startTimeline(this.page);
    const waited = await waitForChange(this.page, timeline);
    return this.settleAndFinish({
      actionText: 'Wait',
      pathBefore,
      timeline,
      waits: [waited.span],
      touchedKeys: [],
      focusBox: null,
    });
  }

  private async actBack(): Promise<ActionResult> {
    const pathBefore = pathOf(this.page.url());
    await this.page.goBack();
    const timeline = await startTimeline(this.page);
    return this.settleAndFinish({ actionText: 'Back', pathBefore, timeline, waits: [], touchedKeys: [], focusBox: null });
  }

  // -- shared steps -----------------------------------------------------------------------------------

  private async settleAndFinish(done: ActionDone): Promise<ActionResult> {
    const settled = await settle(this.page, done.timeline, this.options.settleQuietMs, this.settleMaxMs);
    const readyAt = round(timeOn(done.timeline));
    const screenshot = await this.page.screenshot();
    const trace: StepTrace = {
      pathBefore: done.pathBefore,
      pathAfter: pathOf(this.page.url()),
      keys: [],
      touchedKeys: done.touchedKeys,
      actionEndedAt: done.timeline.base,
      readyAt,
      waits: [...done.waits, settled.span],
      announcements: [],
    };
    if (done.click) trace.click = done.click;
    const result: ActionResult = { actionText: done.actionText, spoken: '', focusBox: done.focusBox, trace, screenshot };
    if (done.seenScreenshot) result.seenScreenshot = done.seenScreenshot;
    return result;
  }
}

/**
 * Creates the shared visual Body. The Phantom and Bebe call this from their `createBody` with their
 * own timing, for example `createVisualBody(page, { settleQuietMs: 1200, reactionDelay: { minMs: 550,
 * maxMs: 650 }, typingDelayMs: 120, rng: opts.rng })`.
 */
export function createVisualBody(page: Page, options: VisualBodyOptions, cdp?: ScreenshotCdp): Body<Sight, VisualAction> {
  return new VisualBody(createSightedPage(page, options, cdp), options);
}
