import type { CDPSession, Page, Request } from 'playwright';
import { createReadOnlyCdp } from '../../core/detectors.ts';
import type { ActionResult, Body, BodyOptions, Box, Probe, ReadOnlyCdp, StepTrace } from '../../core/types.ts';
import { quietForMs, readChangeClock, type ChangeClockState } from '../../page/changeClock.ts';
import { readFocusKeys, type FocusKeys } from '../../page/elementKeys.ts';
import { drainLiveAnnouncements } from '../../page/liveRegions.ts';
import { buildHeard, enableAccessibility, type Heard, type HeardNode, type RawAxNode } from './ax.ts';
import { focusedNode, nodeByRef, speak, stateWords } from './speech.ts';

/*
 * The Listener's Body (Requirements 8.4 to 8.11, 6.6; design "The Listener (Phase 1)").
 *
 * It lets The Listener perceive the page through the Accessibility_Tree (`Heard`) and act only the way a
 * keyboard and screen reader user can: keys, typed text, and jumps by heading, landmark, form field or button.
 *
 * ## The KeyboardOnlyPage facade
 *
 * The Body code in this file never touches a Playwright `Page`. It is written against `KeyboardOnlyPage`,
 * a narrow object built once by `createKeyboardOnlyPage(page, cdp)` below. The builder is the only place
 * that holds the real `Page` and `CDPSession`; they live in its closure and no member of the facade
 * returns them. The facade is a frozen object with exactly the members in `KEYBOARD_ONLY_PAGE_KEYS`:
 *
 *   keyboard.press / keyboard.type   the only input. `type` waits 30 ms between characters.
 *   screenshot                       the viewport as PNG
 *   cdp                              a ReadOnlyCdp: Accessibility.getFullAXTree, DOM.describeNode, DOM.getBoxModel
 *   navigate / url / title           open an address, and read where the page is
 *   readClock, drainAnnouncements,   explicit named reads of the engine's own page scripts
 *   readFocusKeys                    (Page_Change_Clock, Live_Announcements, element keys)
 *   networkQuietForMs                how long no request has been in flight (from Playwright's request events)
 *
 * There is no `mouse`, `touchscreen`, `click`, `fill`, `focus` or `evaluate`, so TypeScript rejects any
 * use of them in the Body (a unit test checks the key list, and uses `@ts-expect-error` to prove it).
 * The page-script reads (`readClock` and the other two) evaluate fixed read-only expressions from
 * `src/page/`; the Body cannot pass its own script.
 *
 * ## Settle
 *
 * After every action the Body waits until the page has been quiet for 300 ms: the Page_Change_Clock shows no
 * DOM change and no request has been in flight, both counted from the end of the action. It checks every
 * 50 ms and gives up after 5000 ms. `actionEndedAt` and `readyAt` are Page_Change_Clock times: `actionEndedAt`
 * is the clock read taken as the Settle starts, and `readyAt` is that value plus the time the Settle took, so
 * `readyAt - actionEndedAt` is the real wait even when the action replaced the document (a new document starts
 * a new clock).
 */

// ---------------------------------------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------------------------------------

export type ListenerKey =
  | 'Tab'
  | 'Shift+Tab'
  | 'ArrowUp'
  | 'ArrowDown'
  | 'ArrowLeft'
  | 'ArrowRight'
  | 'Enter'
  | 'Space'
  | 'Escape';

export type JumpTarget = 'heading' | 'landmark' | 'field' | 'button';
export type JumpDirection = 'next' | 'previous';

/** What The Listener can do (Requirement 8.5). */
export type ListenerAction =
  | { type: 'key'; key: ListenerKey }
  | { type: 'type'; text: string }
  | { type: 'jump'; to: JumpTarget; dir: JumpDirection };

// ---------------------------------------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------------------------------------

/** Time between two typed characters. */
export const TYPING_DELAY_MS = 30;
/** How long `open` waits for the `load` event. */
export const LOAD_TIMEOUT_MS = 60_000;
/** The page must be quiet this long before the Body is ready for the next decision. */
export const SETTLE_QUIET_MS = 300;
/** How often Settle looks at the page. */
export const SETTLE_POLL_MS = 50;
/** Settle never waits longer than this. */
export const SETTLE_MAX_MS = 5000;
/** A field or button jump never presses more than this many keys. */
export const JUMP_PRESS_CAP = 50;

const FIELD_ROLES: ReadonlySet<string> = new Set([
  'textbox',
  'searchbox',
  'combobox',
  'spinbutton',
  'checkbox',
  'radio',
  'listbox',
  'slider',
  'switch',
]);
const BUTTON_ROLES: ReadonlySet<string> = new Set(['button', 'togglebutton', 'menubutton']);
const HEADING_ROLES: ReadonlySet<string> = new Set(['heading']);
const LANDMARK_ROLES: ReadonlySet<string> = new Set([
  'banner',
  'main',
  'contentinfo',
  'navigation',
  'region',
  'form',
  'search',
  'complementary',
]);

// ---------------------------------------------------------------------------------------------------------
// The KeyboardOnlyPage facade
// ---------------------------------------------------------------------------------------------------------

/** Everything the Listener's Body may do to the browser. See the file comment. */
export interface KeyboardOnlyPage {
  readonly keyboard: {
    press(key: ListenerKey): Promise<void>;
    /** Types the text with 30 ms between characters. */
    type(text: string): Promise<void>;
  };
  /** The viewport as a PNG. */
  screenshot(): Promise<Buffer>;
  /** Read-only CDP calls only. */
  readonly cdp: ReadOnlyCdp;
  /** Goes to an address and waits for the `load` event (at most 60 s). */
  navigate(url: string): Promise<void>;
  /** The address the page shows now. */
  url(): string;
  title(): Promise<string>;
  /** The Page_Change_Clock, or `null` when the script is not installed. */
  readClock(): Promise<ChangeClockState | null>;
  /** The Live_Announcements recorded since the previous call, in order. */
  drainAnnouncements(): Promise<string[]>;
  /** Element keys of the focused element and its dialog, or `null` when the script is not installed. */
  readFocusKeys(): Promise<FocusKeys | null>;
  /** Milliseconds for which no request has been in flight; 0 while one is. */
  networkQuietForMs(): number;
}

/** The members of a `KeyboardOnlyPage`. A test checks them against the real object. */
export const KEYBOARD_ONLY_PAGE_KEYS = [
  'keyboard',
  'screenshot',
  'cdp',
  'navigate',
  'url',
  'title',
  'readClock',
  'drainAnnouncements',
  'readFocusKeys',
  'networkQuietForMs',
] as const satisfies readonly (keyof KeyboardOnlyPage)[];

/** The members of `KeyboardOnlyPage['keyboard']`. */
export const KEYBOARD_ONLY_KEYBOARD_KEYS = ['press', 'type'] as const;

/** Builds the facade. The only function in this file that holds the real `Page` and `CDPSession`. */
export function createKeyboardOnlyPage(page: Page, cdp: CDPSession): KeyboardOnlyPage {
  const inFlight = new Set<Request>();
  let lastNetworkEvent = Date.now();
  const started = (request: Request): void => {
    inFlight.add(request);
    lastNetworkEvent = Date.now();
  };
  const ended = (request: Request): void => {
    inFlight.delete(request);
    lastNetworkEvent = Date.now();
  };
  page.on('request', started);
  page.on('requestfinished', ended);
  page.on('requestfailed', ended);

  const readOnlyCdp = createReadOnlyCdp(cdp);

  const facade: KeyboardOnlyPage = {
    keyboard: Object.freeze({
      press: (key: ListenerKey) => page.keyboard.press(key),
      type: (text: string) => page.keyboard.type(text, { delay: TYPING_DELAY_MS }),
    }),
    screenshot: () => retryScreenshot(() => page.screenshot({ type: 'png' })),
    cdp: readOnlyCdp,
    navigate: async (url: string) => {
      await page.goto(url, { waitUntil: 'load', timeout: LOAD_TIMEOUT_MS });
    },
    url: () => page.url(),
    title: () => page.title(),
    readClock: () => readChangeClock(page),
    drainAnnouncements: () => drainLiveAnnouncements(page),
    readFocusKeys: () => readFocusKeys(page),
    networkQuietForMs: () => (inFlight.size > 0 ? 0 : Date.now() - lastNetworkEvent),
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

/**
 * Takes the viewport screenshot. Chromium answers `Page.captureScreenshot` with "Unable to capture
 * screenshot" when the first frame of a freshly opened page has not been composited yet, which happens
 * when the machine is busy. That one error is retried a few times; every other error is thrown at once.
 */
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

/** The path of an address, for `Step.page`. */
function pathOf(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

/** The DOM node id behind a Heard ref (`ax-123`, or `ax-123~2` for a repeat), or `null`. */
function backendIdOf(ref: string): number | null {
  const match = /^ax-(\d+)(?:~\d+)?$/.exec(ref);
  return match?.[1] !== undefined ? Number(match[1]) : null;
}

/** The border box of a `DOM.getBoxModel` answer: the bounding box of the border quad, in CSS px. */
function boxFromQuad(quad: readonly number[] | undefined): Box | null {
  if (!quad || quad.length < 8 || !quad.every((n) => Number.isFinite(n))) return null;
  const xs = [quad[0]!, quad[2]!, quad[4]!, quad[6]!];
  const ys = [quad[1]!, quad[3]!, quad[5]!, quad[7]!];
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

// ---------------------------------------------------------------------------------------------------------
// Settle
// ---------------------------------------------------------------------------------------------------------

export interface SettleResult {
  /** Page_Change_Clock time when the Settle started. */
  actionEndedAt: number;
  /** `actionEndedAt` plus the time the Settle took. */
  readyAt: number;
  /** How long the Settle took, in milliseconds of real time. */
  elapsedMs: number;
  /** True when it stopped because it reached 5000 ms and not because the page was quiet. */
  capped: boolean;
  /** Distinct Page_Change_Clock times of changes seen while waiting. */
  progress: number[];
}

/**
 * Waits until the DOM has had no change and no request has been in flight for 300 ms, counted from now,
 * checking every 50 ms, for at most 5000 ms.
 */
export async function settle(page: KeyboardOnlyPage): Promise<SettleResult> {
  const startedAt = Date.now();
  const first = await tolerant(() => page.readClock(), null);
  const actionEndedAt = first?.now ?? 0;
  const progress: number[] = [];
  let capped = false;

  for (;;) {
    const elapsed = Date.now() - startedAt;
    if (elapsed >= SETTLE_QUIET_MS) {
      // `undefined` means the read failed (for example the document is being replaced): not quiet yet.
      const clock = await tolerant<ChangeClockState | null, undefined>(() => page.readClock(), undefined);
      if (clock && !progress.includes(clock.lastChange) && clock.lastChange >= actionEndedAt) progress.push(clock.lastChange);
      const domQuiet = clock === undefined ? false : clock === null ? true : quietForMs(clock) >= SETTLE_QUIET_MS;
      if (domQuiet && page.networkQuietForMs() >= SETTLE_QUIET_MS) break;
    }
    const now = Date.now() - startedAt;
    if (now >= SETTLE_MAX_MS) {
      capped = true;
      break;
    }
    await sleep(Math.min(SETTLE_POLL_MS, SETTLE_MAX_MS - now));
  }

  const elapsedMs = Date.now() - startedAt;
  return { actionEndedAt, readyAt: actionEndedAt + elapsedMs, elapsedMs, capped, progress };
}

// ---------------------------------------------------------------------------------------------------------
// The Body
// ---------------------------------------------------------------------------------------------------------

/** A Heard together with what only the Body needs to know about the same read. */
interface Tree {
  heard: Heard;
  /** Number of focusable, not-ignored AX nodes. */
  focusable: number;
}

type TraceKey = StepTrace['keys'][number];

function countFocusable(raw: readonly RawAxNode[]): number {
  let count = 0;
  for (const node of raw) {
    if (node.ignored === true) continue;
    const focusable = node.properties?.find((p) => p.name === 'focusable')?.value?.value;
    if (focusable === true || focusable === 'true') count++;
  }
  return count;
}

class ListenerBody implements Body<Heard, ListenerAction> {
  private readingPosition: string | null = null;
  /** Announcements since the previous Perception. */
  private pending: string[] = [];

  constructor(
    private readonly page: KeyboardOnlyPage,
    private readonly ready: Promise<void>,
  ) {}

  async open(url: string): Promise<ActionResult> {
    await this.ready;
    this.readingPosition = null;
    this.pending = [];
    await this.page.navigate(url);

    const waited = await settle(this.page);
    const announcements = await this.drain();
    const { heard: after } = await this.hear(announcements);
    this.pending.push(...announcements);

    // A screen reader starts by saying the title of the page.
    const root = after.nodes.find((node) => node.role === 'RootWebArea');
    const spoken = speak({ before: null, after, ...(root ? { spokenNode: root } : {}) });
    const path = pathOf(this.page.url());
    return this.result({
      actionText: `Open ${url}`,
      spoken,
      focusBox: null,
      pathBefore: path,
      keys: [],
      touchedKeys: [],
      waited,
      announcements,
    });
  }

  async perceive(): Promise<{ perception: Heard; probe: Probe }> {
    await this.ready;
    const announcements = this.pending;
    this.pending = [];
    const { heard } = await this.hear(announcements);
    const clock = await tolerant(() => this.page.readClock(), null);
    return { perception: heard, probe: { at: clock?.now ?? 0 } };
  }

  async act(action: ListenerAction): Promise<ActionResult> {
    await this.ready;
    switch (action.type) {
      case 'key':
        return this.actKey(action.key);
      case 'type':
        return this.actType(action.text);
      case 'jump':
        return action.to === 'heading' || action.to === 'landmark'
          ? this.actReadingJump(action.to, action.dir)
          : this.actTabJump(action.to, action.dir);
    }
  }

  // -- actions ----------------------------------------------------------------------------------------

  private async actKey(key: ListenerKey): Promise<ActionResult> {
    const before = await this.hear([]);
    const pathBefore = pathOf(this.page.url());
    const entry = await this.press(key);
    const waited = await settle(this.page);
    const announcements = await this.drain();
    const after = await this.hear(announcements);
    this.followFocus(before.heard, after.heard);

    // A key that leaves focus on the same node but changes its state (Space on a checkbox) says the new state.
    const was = focusedNode(before.heard);
    const now = focusedNode(after.heard);
    const stateChange =
      was !== undefined &&
      now !== undefined &&
      was.ref === now.ref &&
      was.name === now.name &&
      was.role === now.role &&
      stateWords(was).join('|') !== stateWords(now).join('|');

    const spoken = speak({ before: before.heard, after: after.heard, stateChange });
    return this.finish({ actionText: key, spoken, pathBefore, keys: [entry], touchedKeys: [], waited, announcements, after });
  }

  private async actType(text: string): Promise<ActionResult> {
    const before = await this.hear([]);
    const pathBefore = pathOf(this.page.url());
    const target = await tolerant(() => this.page.readFocusKeys(), null);
    await this.page.keyboard.type(text);
    const waited = await settle(this.page);
    const announcements = await this.drain();
    const after = await this.hear(announcements);
    this.followFocus(before.heard, after.heard);

    const spoken = speak({ before: before.heard, after: after.heard, typed: text });
    return this.finish({
      actionText: `Type "${text}"`,
      spoken,
      pathBefore,
      keys: [],
      touchedKeys: target?.focusKey ? [target.focusKey] : [],
      waited,
      announcements,
      after,
    });
  }

  /** Heading and landmark jumps: move only the reading position. No key is sent and focus stays. */
  private async actReadingJump(to: 'heading' | 'landmark', dir: JumpDirection): Promise<ActionResult> {
    const before = await this.hear([]);
    const pathBefore = pathOf(this.page.url());
    const waited = await settle(this.page);
    const announcements = await this.drain();
    const after = await this.hear(announcements);

    const roles = to === 'heading' ? HEADING_ROLES : LANDMARK_ROLES;
    const nodes = after.heard.nodes;
    // A screen reader's reading cursor starts at the focus until it has been moved.
    const base = after.heard.readingPosition ?? after.heard.focus;
    const index = base === null ? -1 : nodes.findIndex((node) => node.ref === base);

    let target: HeardNode | undefined;
    if (dir === 'next') {
      target = nodes.slice(index + 1).find((node) => roles.has(node.role));
    } else if (index >= 0) {
      target = nodes.slice(0, index).findLast((node) => roles.has(node.role));
    }

    let spoken: string;
    if (target) {
      this.readingPosition = target.ref;
      after.heard.readingPosition = target.ref;
      spoken = speak({ before: before.heard, after: after.heard, spokenNode: target });
    } else {
      spoken = [`No ${dir} ${to}`, ...announcements].join('. ');
    }
    const readingNode = nodeByRef(after.heard, after.heard.readingPosition);
    return this.finish({
      actionText: `${dir === 'next' ? 'Next' : 'Previous'} ${to}`,
      spoken,
      pathBefore,
      keys: [],
      touchedKeys: [],
      waited,
      announcements,
      after,
      boxOf: readingNode,
    });
  }

  /** Field and button jumps: press Tab or Shift+Tab until the focused node is of that kind. */
  private async actTabJump(to: 'field' | 'button', dir: JumpDirection): Promise<ActionResult> {
    const before = await this.hear([]);
    const pathBefore = pathOf(this.page.url());
    const roles = to === 'field' ? FIELD_ROLES : BUTTON_ROLES;
    const key: ListenerKey = dir === 'next' ? 'Tab' : 'Shift+Tab';
    const limit = Math.min(JUMP_PRESS_CAP, before.focusable + 2);

    const keys: TraceKey[] = [];
    while (keys.length < limit) {
      keys.push(await this.press(key));
      const node = focusedNode((await this.hear([])).heard);
      if (node && roles.has(node.role)) break;
    }

    const waited = await settle(this.page);
    const announcements = await this.drain();
    const after = await this.hear(announcements);
    this.followFocus(before.heard, after.heard);

    const spoken = speak({ before: before.heard, after: after.heard });
    const label = to === 'field' ? 'form field' : 'button';
    return this.finish({
      actionText: `${dir === 'next' ? 'Next' : 'Previous'} ${label} (${key} ×${keys.length})`,
      spoken,
      pathBefore,
      keys,
      touchedKeys: [],
      waited,
      announcements,
      after,
    });
  }

  // -- shared steps -----------------------------------------------------------------------------------

  /** Presses one key and logs where focus is afterwards. */
  private async press(key: ListenerKey): Promise<TraceKey> {
    await this.page.keyboard.press(key);
    const focus = await tolerant(() => this.page.readFocusKeys(), null);
    return { key, focusKey: focus?.focusKey ?? null, dialogKey: focus?.dialogKey ?? null };
  }

  /** Drains the Live_Announcements and keeps them for the next Perception. */
  private async drain(): Promise<string[]> {
    return tolerant(() => this.page.drainAnnouncements(), [] as string[]);
  }

  /** Reads the Accessibility_Tree into a Heard. */
  private async hear(announcements: string[]): Promise<Tree> {
    const [tree, title] = await Promise.all([
      this.page.cdp.send<{ nodes: RawAxNode[] }>('Accessibility.getFullAXTree'),
      tolerant(() => this.page.title(), ''),
    ]);
    const heard = buildHeard(tree.nodes, {
      title,
      path: pathOf(this.page.url()),
      readingPosition: this.readingPosition,
      announcements,
    });
    // A reading position whose element is gone is dropped.
    if (heard.readingPosition !== null && !heard.nodes.some((node) => node.ref === heard.readingPosition)) {
      this.readingPosition = null;
      heard.readingPosition = null;
    }
    return { heard, focusable: countFocusable(tree.nodes) };
  }

  /** The reading position follows the focus: when focus moves to another node, or the page changes, it is dropped. */
  private followFocus(before: Heard, after: Heard): void {
    if (after.focus !== before.focus || after.path !== before.path) {
      this.readingPosition = null;
      after.readingPosition = null;
    }
  }

  /** The border box of a node in CSS px, or `null` when it has none. */
  private async boxOf(node: HeardNode | undefined): Promise<Box | null> {
    if (node === undefined || node.role === 'RootWebArea') return null;
    const backendNodeId = backendIdOf(node.ref);
    if (backendNodeId === null) return null;
    try {
      const { model } = await this.page.cdp.send<{ model?: { border?: number[] } }>('DOM.getBoxModel', { backendNodeId });
      return boxFromQuad(model?.border);
    } catch (error) {
      if (isFatal(error)) throw error;
      return null;
    }
  }

  private async finish(input: {
    actionText: string;
    spoken: string;
    pathBefore: string;
    keys: TraceKey[];
    touchedKeys: string[];
    waited: SettleResult;
    announcements: string[];
    after: Tree;
    /** The node whose box is the focusBox. Defaults to the focused node. */
    boxOf?: HeardNode | undefined;
  }): Promise<ActionResult> {
    this.pending.push(...input.announcements);
    const node = 'boxOf' in input ? input.boxOf : focusedNode(input.after.heard);
    const focusBox = await this.boxOf(node);
    return this.result({ ...input, focusBox });
  }

  private async result(input: {
    actionText: string;
    spoken: string;
    focusBox: Box | null;
    pathBefore: string;
    keys: TraceKey[];
    touchedKeys: string[];
    waited: SettleResult;
    announcements: string[];
  }): Promise<ActionResult> {
    const { waited } = input;
    const screenshot = await this.page.screenshot();
    const trace: StepTrace = {
      pathBefore: input.pathBefore,
      pathAfter: pathOf(this.page.url()),
      keys: input.keys,
      touchedKeys: input.touchedKeys,
      actionEndedAt: waited.actionEndedAt,
      readyAt: waited.readyAt,
      waits: [{ from: waited.actionEndedAt, to: waited.readyAt, progress: waited.progress, loadingUntil: null }],
      announcements: [...input.announcements],
    };
    return { actionText: input.actionText, spoken: input.spoken, focusBox: input.focusBox, trace, screenshot };
  }
}

/**
 * Creates The Listener's Body. It enables the accessibility domain once, right away; the first call of
 * `open`, `perceive` or `act` waits for that to finish.
 */
export function createListenerBody(page: Page, cdp: CDPSession, _opts: BodyOptions): Body<Heard, ListenerAction> {
  const ready = enableAccessibility(cdp);
  // A failure is reported by the first call that awaits `ready`; this keeps it from being an unhandled rejection before that.
  ready.catch(() => undefined);
  return new ListenerBody(createKeyboardOnlyPage(page, cdp), ready);
}
