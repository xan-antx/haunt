import fc from 'fast-check';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { BrowserProfile } from '../src/core/types.ts';
import { mulberry32 } from '../src/core/rng.ts';
import { BEBE_REACTION_DELAY, BEBE_SETTLE_QUIET_MS, BEBE_TYPING_DELAY_MS, bebeProfile } from '../src/ghosts/bebe/profile.ts';
import { phantomProfile, phantomTiming } from '../src/ghosts/phantom/profile.ts';
import { pageInitScripts } from '../src/ghosts/registry.ts';
import { createVisualBody, type VisualBodyOptions } from '../src/ghosts/visual/body.ts';
import type { Sight } from '../src/ghosts/visual/types.ts';
import { SEEN_ITEM_KEYS } from '../src/page/sight.ts';

/**
 * Feature: haunt-engine, Property 5: Visual perceptions carry no accessibility data
 * **Validates: Requirements 13.2, 17.2, 20.2**
 *
 * Generated pages are rendered in real Chromium in a context built from The Phantom's profile and in
 * one built from Bebe's profile (no network throttling), with the engine's page scripts installed.
 * Every element carries ARIA attributes, roles, titles, alt text, ids, names, data attributes and
 * hidden text (screen-reader-only spans, `hidden`, `display: none`, off-screen text, closed
 * `<details>`, `<template>`, comments…) whose values contain the marker prefix `qzmk`. Visible text
 * only uses a fixed vocabulary that never contains it. The Sight from the visual Body's `perceive()`
 * must have only the allowed keys, and its serialised form (the screenshot buffer left out) must not
 * contain the marker anywhere. A visible control text on every page proves the Sight really sees the
 * page, so an empty Sight cannot pass by accident.
 */

vi.setConfig({ testTimeout: 600_000, hookTimeout: 120_000 });

const RUNS = { numRuns: 100 };
const MARKER = 'qzmk';
const CONTROL_TEXT = 'Lantern control';
const ORIGIN = 'http://haunt.test';

// ---------------------------------------------------------------------------------------------
// Generated pages
// ---------------------------------------------------------------------------------------------

/** Visible words. None of them contains the marker prefix. */
const WORDS = ['Pay', 'this', 'bill', 'Home', 'Next', 'Amount', 'due', 'Save', 'Name', 'Back', 'Help', 'ਭੁਗਤਾਨ', 'ਬਿੱਲ', 'भुगतान', 'बिल'];
const wordsArb = fc.array(fc.constantFrom(...WORDS), { minLength: 1, maxLength: 3 }).map((w) => w.join(' '));

/** Attributes that may carry a marker. None of them is drawn on the screen as text. */
const ATTRS = [
  'role',
  'aria-label',
  'aria-labelledby',
  'aria-describedby',
  'aria-description',
  'aria-roledescription',
  'aria-valuetext',
  'aria-placeholder',
  'aria-keyshortcuts',
  'aria-details',
  'title',
  'id',
  'name',
  'class',
  'data-testid',
  'data-label',
  'lang',
] as const;
type Attr = (typeof ATTRS)[number];
const attrsArb = fc.uniqueArray(fc.constantFrom(...ATTRS), { minLength: 1, maxLength: 6 });

/** Ways to put marker text in the DOM where a sighted person cannot see it. */
const HIDDEN = [
  'srOnly',
  'hiddenAttr',
  'displayNone',
  'visibilityHidden',
  'opacityZero',
  'offscreen',
  'zeroSize',
  'template',
  'comment',
  'noscript',
  'script',
  'style',
] as const;
type Hidden = (typeof HIDDEN)[number];
const hiddenArb = fc.array(fc.constantFrom(...HIDDEN), { maxLength: 3 });

const KINDS = [
  'button',
  'link',
  'roleButtonLink',
  'textInput',
  'filledInput',
  'password',
  'checkbox',
  'radio',
  'select',
  'textarea',
  'submit',
  'hiddenInput',
  'image',
  'svg',
  'text',
  'heading',
  'details',
  'roleCheckboxDiv',
] as const;
type Kind = (typeof KINDS)[number];

interface ElementSpec {
  kind: Kind;
  words: string;
  attrs: Attr[];
  hidden: Hidden[];
}

const elementArb: fc.Arbitrary<ElementSpec> = fc.record({
  kind: fc.constantFrom(...KINDS),
  words: wordsArb,
  attrs: attrsArb,
  hidden: hiddenArb,
});

interface PageSpec {
  /** Top-level groups; each group is wrapped in a `<div>` with marker attributes when `wrap` is true. */
  groups: { wrap: boolean; wrapAttrs: Attr[]; elements: ElementSpec[] }[];
  /** A marker in `<title>`, a meta description and a style comment in the head. */
  headMarkers: boolean;
}

const pageArb: fc.Arbitrary<PageSpec> = fc.record({
  groups: fc.array(
    fc.record({ wrap: fc.boolean(), wrapAttrs: attrsArb, elements: fc.array(elementArb, { minLength: 1, maxLength: 4 }) }),
    { minLength: 1, maxLength: 5 },
  ),
  headMarkers: fc.boolean(),
});

/** Renders a page spec. Every marker is `qzmk<n>x`, unique on the page. */
function renderPage(spec: PageSpec): string {
  let n = 0;
  const m = (): string => `${MARKER}${(n += 1)}x`;
  const attrs = (list: readonly Attr[]): string => list.map((a) => ` ${a}="${m()}"`).join('');

  const hidden = (list: readonly Hidden[]): string =>
    list
      .map((h) => {
        switch (h) {
          case 'srOnly':
            return `<span style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0">${m()}</span>`;
          case 'hiddenAttr':
            return `<span hidden>${m()}</span>`;
          case 'displayNone':
            return `<span style="display:none">${m()}</span>`;
          case 'visibilityHidden':
            return `<span style="visibility:hidden">${m()}</span>`;
          case 'opacityZero':
            return `<span style="opacity:0">${m()}</span>`;
          case 'offscreen':
            return `<span style="position:absolute;left:-10000px;top:auto">${m()}</span>`;
          case 'zeroSize':
            return `<span style="display:inline-block;width:0;height:0;overflow:hidden">${m()}</span>`;
          case 'template':
            return `<template>${m()}</template>`;
          case 'comment':
            return `<!-- ${m()} -->`;
          case 'noscript':
            return `<noscript>${m()}</noscript>`;
          case 'script':
            return `<script>var unused = "${m()}";</script>`;
          case 'style':
            return `<style>/* ${m()} */</style>`;
        }
      })
      .join('');

  const element = (e: ElementSpec): string => {
    const a = attrs(e.attrs);
    const h = hidden(e.hidden);
    switch (e.kind) {
      case 'button':
        return `<button${a}>${e.words}${h}</button>`;
      case 'link':
        return `<a href="/${m()}#${m()}"${a}>${e.words}${h}</a>`;
      case 'roleButtonLink':
        return `<a href="#${m()}" role="button"${a}>${e.words}${h}</a>`;
      case 'textInput':
        return `<input type="text" placeholder="${e.words}"${a}>${h}`;
      case 'filledInput':
        return `<input type="text" value="${e.words}" autocomplete="${m()}"${a}>${h}`;
      case 'password':
        return `<input type="password" value="${m()}"${a}>${h}`;
      case 'checkbox':
        return `<label><input type="checkbox" value="${m()}"${a}> ${e.words}</label>${h}`;
      case 'radio':
        return `<input type="radio" value="${m()}" checked${a}>${h}`;
      case 'select':
        return `<select${a}><option value="${m()}">${e.words}</option><option value="${m()}" title="${m()}">Next</option></select>${h}`;
      case 'textarea':
        return `<textarea placeholder="${e.words}"${a}></textarea>${h}`;
      case 'submit':
        return `<input type="submit" value="${e.words}"${a}>${h}`;
      case 'hiddenInput':
        return `<input type="hidden" value="${m()}"${a}><span>${e.words}</span>${h}`;
      case 'image':
        return `<img alt="${m()}" width="40" height="40" src="data:image/gif;base64,R0lGODlhAQABAAAAACw="${a}><span>${e.words}</span>${h}`;
      case 'svg':
        return `<svg role="img" aria-label="${m()}" width="40" height="20"${a}><title>${m()}</title><desc>${m()}</desc><rect width="40" height="20" fill="#888"></rect></svg><span>${e.words}</span>${h}`;
      case 'text':
        return `<p${a}>${e.words}${h}</p>`;
      case 'heading':
        return `<h2${a}>${e.words}${h}</h2>`;
      case 'details':
        return `<details${a}><summary>${e.words}</summary>${m()}${h}</details>`;
      case 'roleCheckboxDiv':
        return `<div role="checkbox" aria-checked="true" tabindex="0"${a}>${e.words}${h}</div>`;
    }
  };

  const head = spec.headMarkers
    ? `<title>${m()}</title><meta name="description" content="${m()}"><style>/* ${m()} */</style>`
    : '<title>Case</title>';
  const body = spec.groups
    .map((g) => {
      const inner = g.elements.map(element).join('');
      return g.wrap ? `<div${attrs(g.wrapAttrs)}>${inner}</div>` : inner;
    })
    .join('');
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">${head}</head>` +
    `<body style="margin:8px;font:16px/1.4 sans-serif"><p>${CONTROL_TEXT}</p>${body}</body></html>`
  );
}

// ---------------------------------------------------------------------------------------------
// Browser contexts for the two profiles
// ---------------------------------------------------------------------------------------------

interface VisualGhostUnderTest {
  name: string;
  profile: BrowserProfile;
  timing: Omit<VisualBodyOptions, 'rng'>;
  context?: BrowserContext;
  page?: Page;
  pageErrors: string[];
}

const GHOSTS: VisualGhostUnderTest[] = [
  { name: 'The Phantom', profile: phantomProfile, timing: phantomTiming, pageErrors: [] },
  {
    name: 'Bebe',
    profile: bebeProfile,
    timing: { settleQuietMs: BEBE_SETTLE_QUIET_MS, reactionDelay: BEBE_REACTION_DELAY, typingDelayMs: BEBE_TYPING_DELAY_MS },
    pageErrors: [],
  },
];

let browser: Browser;
/** The HTML that the routed address serves for the current case. */
let currentHtml = '';

beforeAll(async () => {
  browser = await chromium.launch();
  for (const ghost of GHOSTS) {
    const { profile } = ghost;
    const context = await browser.newContext({
      viewport: { width: profile.width, height: profile.height },
      deviceScaleFactor: profile.deviceScaleFactor,
      locale: profile.locale,
      isMobile: profile.isMobile,
      hasTouch: profile.hasTouch,
      ...(profile.userAgent === undefined ? {} : { userAgent: profile.userAgent }),
      ...(profile.extraHTTPHeaders === undefined ? {} : { extraHTTPHeaders: profile.extraHTTPHeaders }),
    });
    for (const source of pageInitScripts) await context.addInitScript(source);
    await context.route(`${ORIGIN}/**`, (route) =>
      route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: currentHtml }),
    );
    const page = await context.newPage();
    page.on('pageerror', (error) => ghost.pageErrors.push(error.message));
    ghost.context = context;
    ghost.page = page;
  }
}, 120_000);

afterAll(async () => {
  await browser?.close();
});

/** The Sight as the Mind gets it, serialised without the screenshot buffer. */
function serialise(sight: Sight): string {
  const { screenshot: _screenshot, ...rest } = sight;
  return JSON.stringify(rest);
}

const SIGHT_KEYS = ['items', 'path', 'screenshot', 'screenshotHash', 'viewport'];
const BOX_KEYS = ['h', 'w', 'x', 'y'];
const LOOKS = new Set(['button', 'field', 'link', 'checkbox', 'text']);

// ---------------------------------------------------------------------------------------------
// Property 5
// ---------------------------------------------------------------------------------------------

describe('Feature: haunt-engine, Property 5: Visual perceptions carry no accessibility data', () => {
  it('gives The Phantom and Bebe Sights with only the allowed keys and no ARIA, role, name or hidden-text marker', async () => {
    let caseNo = 0;
    await fc.assert(
      fc.asyncProperty(pageArb, fc.integer({ min: 0, max: 2 ** 31 - 1 }), async (spec, seed) => {
        caseNo += 1;
        currentHtml = renderPage(spec);
        expect(currentHtml).toContain(MARKER);

        for (const ghost of GHOSTS) {
          const page = ghost.page!;
          await page.goto(`${ORIGIN}/case-${caseNo}`, { waitUntil: 'load' });
          const body = createVisualBody(page, { ...ghost.timing, rng: mulberry32(seed) });
          const { perception } = await body.perceive();

          // Only the allowed keys, at every level.
          expect(Object.keys(perception).sort()).toEqual(SIGHT_KEYS);
          expect(Object.keys(perception.viewport).sort()).toEqual(['h', 'w']);
          expect(perception.viewport).toEqual({ w: ghost.profile.width, h: ghost.profile.height });
          expect(perception.path).toBe(`/case-${caseNo}`);
          expect(Buffer.isBuffer(perception.screenshot)).toBe(true);
          for (const item of perception.items) {
            for (const key of Object.keys(item)) expect(SEEN_ITEM_KEYS).toContain(key);
            expect(Object.keys(item.box).sort()).toEqual(BOX_KEYS);
            expect(LOOKS.has(item.look)).toBe(true);
            expect(typeof item.text).toBe('string');
          }

          // The Sight really sees the page: the visible control text is there.
          expect(perception.items.some((item) => item.look === 'text' && item.text === CONTROL_TEXT)).toBe(true);

          // No marker anywhere, in any case.
          const serialised = serialise(perception);
          if (serialised.toLowerCase().includes(MARKER)) {
            throw new Error(`${ghost.name}'s Sight carries hidden or accessibility data: ${serialised}\nPage: ${currentHtml}`);
          }
          expect(ghost.pageErrors).toEqual([]);
        }
      }),
      RUNS,
    );
  });
});
