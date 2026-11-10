import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from 'playwright';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { ActionResult, Body } from '../src/core/types.ts';
import type { Heard } from '../src/ghosts/listener/ax.ts';
import {
  JUMP_PRESS_CAP,
  KEYBOARD_ONLY_KEYBOARD_KEYS,
  KEYBOARD_ONLY_PAGE_KEYS,
  SETTLE_MAX_MS,
  createKeyboardOnlyPage,
  createListenerBody,
  type ListenerAction,
} from '../src/ghosts/listener/body.ts';
import { listenerProfile } from '../src/ghosts/listener/profile.ts';
import { pageInitScripts } from '../src/ghosts/registry.ts';
import { startFixtureServer, type FixtureServer } from './fixtureServer.ts';

/**
 * The Listener's Body in Chromium, against fixture pages.
 * **Validates: Requirements 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10, 8.11, 6.6**
 */

type ListenerBody = Body<Heard, ListenerAction>;

const next = (to: 'heading' | 'landmark' | 'field' | 'button'): ListenerAction => ({ type: 'jump', to, dir: 'next' });
const previous = (to: 'heading' | 'landmark' | 'field' | 'button'): ListenerAction => ({ type: 'jump', to, dir: 'previous' });
const key = (k: Extract<ListenerAction, { type: 'key' }>['key']): ListenerAction => ({ type: 'key', key: k });

describe('The Listener Body', () => {
  let server: FixtureServer;
  let browser: Browser;
  let context: BrowserContext;
  const opened: Page[] = [];

  beforeAll(async () => {
    server = await startFixtureServer();
    browser = await chromium.launch();
    context = await browser.newContext({
      viewport: { width: listenerProfile.width, height: listenerProfile.height },
      deviceScaleFactor: listenerProfile.deviceScaleFactor,
      locale: listenerProfile.locale,
    });
    for (const source of pageInitScripts) await context.addInitScript(source);
  }, 60_000);

  afterEach(async () => {
    while (opened.length > 0) await opened.pop()?.close();
  });

  afterAll(async () => {
    await context?.close();
    await browser?.close();
    await server?.close();
  });

  interface Session {
    page: Page;
    cdp: CDPSession;
    body: ListenerBody;
    opening: ActionResult;
    /** The engine's element key of the first element matching a selector. */
    keyOf(selector: string): Promise<string | null>;
    /** The `__log` object of the fixture page. */
    log<T = Record<string, unknown>>(): Promise<T>;
  }

  async function start(path: string): Promise<Session> {
    const page = await context.newPage();
    opened.push(page);
    const cdp = await context.newCDPSession(page);
    const body = createListenerBody(page, cdp, {
      rng: Math.random,
      site: { name: 'Fixture', allowedTerms: [] },
      profile: listenerProfile,
    });
    const opening = await body.open(server.url(path));
    return {
      page,
      cdp,
      body,
      opening,
      keyOf: (selector) =>
        page.evaluate(
          `window.__haunt.keys.key(document.querySelector(${JSON.stringify(selector)}))`,
        ) as Promise<string | null>,
      log: <T>() => page.evaluate('window.__log') as Promise<T>,
    };
  }

  /** Performs the actions one after the other and returns their results. */
  async function run(body: ListenerBody, ...actions: ListenerAction[]): Promise<ActionResult[]> {
    const results: ActionResult[] = [];
    for (const action of actions) results.push(await body.act(action));
    return results;
  }

  // -----------------------------------------------------------------------------------------------------
  describe('open', () => {
    it('loads the page, speaks its title, and returns the first Step', async () => {
      const s = await start('/listener-form.html');
      const r = s.opening;
      expect(r.actionText).toBe(`Open ${server.url('/listener-form.html')}`);
      expect(r.spoken).toBe('Listener form fixture, document');
      expect(r.focusBox).toBeNull();
      expect(r.trace.pathBefore).toBe('/listener-form.html');
      expect(r.trace.pathAfter).toBe('/listener-form.html');
      expect(r.trace.keys).toEqual([]);
      expect(r.trace.readyAt).toBeGreaterThanOrEqual(r.trace.actionEndedAt);
      expect(r.screenshot.subarray(1, 4).toString('latin1')).toBe('PNG');
      expect(r.screenshot.readUInt32BE(16)).toBe(1280);
      expect(r.screenshot.readUInt32BE(20)).toBe(800);
    });
  });

  // -----------------------------------------------------------------------------------------------------
  describe('what The Listener hears (Requirement 8.9)', () => {
    it('speaks name and role, the region entered, the typed text, and a changed state', async () => {
      const s = await start('/listener-form.html');
      const [heading, pay, card, typed, expiry, save, space, icon, submit] = await run(
        s.body,
        next('heading'),
        next('button'),
        next('field'),
        { type: 'type', text: '4111111111111111' },
        next('field'),
        next('field'),
        key('Space'),
        next('button'),
        next('button'),
      );
      expect(heading!.spoken).toBe('Your Electricity Bill, heading level 1');
      expect(pay!.spoken).toBe('Pay this bill, button');
      expect(card!.spoken).toBe('Payment Information, region. Card Number, edit text, required');
      expect(typed!.spoken).toBe('4111111111111111');
      expect(expiry!.spoken).toBe('Expiry Date, edit text, required');
      expect(save!.spoken).toBe('Save this card, checkbox, checked');
      expect(space!.actionText).toBe('Space');
      expect(space!.spoken).toBe('not checked');
      expect(icon!.spoken).toBe('button');
      expect(submit!.spoken).toBe('Submit, button');
    });

    it('records the action in plain words', async () => {
      const s = await start('/listener-form.html');
      const results = await run(
        s.body,
        next('heading'),
        next('button'),
        next('field'),
        { type: 'type', text: '4111111111111111' },
        key('Shift+Tab'),
        key('Escape'),
        previous('button'),
      );
      expect(results.map((r) => r.actionText)).toEqual([
        'Next heading',
        'Next button (Tab ×2)',
        'Next form field (Tab ×1)',
        'Type "4111111111111111"',
        'Shift+Tab',
        'Escape',
        'Previous button (Shift+Tab ×3)', // Help link, the document, then Submit
      ]);
    });

    it('speaks the dialog when focus enters it, and says nothing about it when Escape leaves focus in place', async () => {
      const s = await start('/listener-dialog.html');
      const [open, enter, tab, enterOnLearn, tabBack, escape] = await run(
        s.body,
        next('button'),
        key('Enter'),
        key('Tab'),
        key('Enter'),
        key('Tab'),
        key('Escape'),
      );
      expect(open!.spoken).toBe('Open dialog, button');
      expect(enter!.spoken).toBe('Protect your payment, dialog. Payment protection, checkbox, checked');
      expect(tab!.spoken).toBe('Learn more, button, collapsed');
      expect(enterOnLearn!.spoken).toBe('expanded');
      expect(tabBack!.spoken).toBe('Payment protection, checkbox, checked');
      expect(escape!.spoken).toBe('Payment protection, checkbox, checked');
    });

    it('speaks every Live_Announcement made during the action and the Settle, and keeps them for the next Perception', async () => {
      const s = await start('/listener-settle.html');
      const [, save] = await run(s.body, next('button'), next('button'));
      const pressed = await s.body.act(key('Enter'));
      expect(save!.trace.announcements).toEqual([]);
      expect(pressed.trace.announcements).toEqual(['Saved']);
      expect(pressed.spoken).toBe('Save, button. Saved');

      const first = await s.body.perceive();
      expect(first.perception.announcements).toEqual(['Saved']);
      const second = await s.body.perceive();
      expect(second.perception.announcements).toEqual([]);
    });
  });

  // -----------------------------------------------------------------------------------------------------
  describe('jumps by heading and landmark (Requirement 8.6)', () => {
    it('moves only the reading position: no key is sent, focus stays, and the nodes are spoken in order', async () => {
      const s = await start('/listener-landmarks.html');
      const focusBefore = await s.page.evaluate('document.activeElement && document.activeElement.tagName');

      const headings = await run(s.body, next('heading'), next('heading'), next('heading'), next('heading'));
      expect(headings.map((r) => r.spoken)).toEqual([
        'Page title, heading level 1',
        'Section one, heading level 2',
        'Tip, heading level 3',
        'Section two, heading level 2',
      ]);
      for (const r of headings) expect(r.trace.keys).toEqual([]);

      const landmarks = await run(s.body, previous('heading'), previous('heading'));
      expect(landmarks.map((r) => r.spoken)).toEqual(['Tip, heading level 3', 'Section one, heading level 2']);

      expect(await s.page.evaluate('document.activeElement && document.activeElement.tagName')).toBe(focusBefore);
      expect(((await s.log()) as { keys: string[] }).keys).toEqual([]);
    });

    it('records the reading position in the Perception and follows it with the next jump', async () => {
      const s = await start('/listener-landmarks.html');
      await s.body.act(next('heading'));
      const afterFirst = (await s.body.perceive()).perception;
      const title = afterFirst.nodes.find((n) => n.role === 'heading' && n.name === 'Page title');
      expect(afterFirst.readingPosition).toBe(title?.ref);

      await s.body.act(next('heading'));
      const afterSecond = (await s.body.perceive()).perception;
      expect(afterSecond.nodes.find((n) => n.ref === afterSecond.readingPosition)?.name).toBe('Section one');
    });

    it('says "No next heading" at the end of the list and stays put, and "No previous heading" at the start', async () => {
      const s = await start('/listener-landmarks.html');
      const atStart = await s.body.act(previous('heading'));
      expect(atStart.spoken).toBe('No previous heading');
      expect(atStart.trace.keys).toEqual([]);

      await run(s.body, next('heading'), next('heading'), next('heading'), next('heading'));
      const end = await s.body.act(next('heading'));
      expect(end.spoken).toBe('No next heading');
      const again = await s.body.act(next('heading'));
      expect(again.spoken).toBe('No next heading');
      const position = (await s.body.perceive()).perception;
      expect(position.nodes.find((n) => n.ref === position.readingPosition)?.name).toBe('Section two');

      const back = await s.body.act(previous('heading'));
      expect(back.spoken).toBe('Tip, heading level 3');
    });

    it('jumps between landmarks and says "No next landmark" after the last one', async () => {
      const s = await start('/listener-landmarks.html');
      const results = await run(s.body, next('landmark'), next('landmark'), next('landmark'), next('landmark'), next('landmark'), next('landmark'));
      expect(results.map((r) => r.spoken)).toEqual([
        'banner',
        'Main, navigation',
        'main',
        'Tips, complementary',
        'contentinfo',
        'No next landmark',
      ]);
      expect(results[5]!.actionText).toBe('Next landmark');
      expect((await s.body.act(previous('landmark'))).spoken).toBe('Tips, complementary');
      expect(((await s.log()) as { keys: string[] }).keys).toEqual([]);
    });

    it('starts from the focused node and leaves the focus where it was', async () => {
      const s = await start('/listener-landmarks.html');
      await s.body.act(next('button')); // Tab ×2: Home link, then First
      const logged = ((await s.log()) as { keys: string[] }).keys.length;
      const tip = await s.body.act(next('heading'));
      expect(tip.spoken).toBe('Tip, heading level 3');
      expect(await s.page.evaluate('document.activeElement.id')).toBe('first');
      expect(((await s.log()) as { keys: string[] }).keys).toHaveLength(logged);
    });

    it('gives the focusBox of the node at the reading position', async () => {
      const s = await start('/listener-landmarks.html');
      const r = await s.body.act(next('heading'));
      const box = await s.page.locator('h1').boundingBox();
      expect(r.focusBox).not.toBeNull();
      expect(r.focusBox!.x).toBeCloseTo(box!.x, 0);
      expect(r.focusBox!.y).toBeCloseTo(box!.y, 0);
      expect(r.focusBox!.w).toBeCloseTo(box!.width, 0);
      expect(r.focusBox!.h).toBeCloseTo(box!.height, 0);
    });
  });

  // -----------------------------------------------------------------------------------------------------
  describe('jumps by form field and button (Requirement 8.7)', () => {
    it('skips controls of the other kind, and logs every Tab press with the focused element key', async () => {
      const s = await start('/listener-form.html');
      const card = await s.body.act(next('field'));
      expect(card.actionText).toBe('Next form field (Tab ×3)'); // Help link, Pay this bill, Card Number
      expect(card.trace.keys.map((k) => k.key)).toEqual(['Tab', 'Tab', 'Tab']);
      expect(card.trace.keys.map((k) => k.focusKey)).toEqual([
        await s.keyOf('#help-link'),
        await s.keyOf('#pay'),
        await s.keyOf('#card'),
      ]);
      expect(card.trace.keys.every((k) => k.dialogKey === null)).toBe(true);

      const icon = await s.body.act(next('button')); // Expiry, Save this card, Plan, then the unnamed button
      expect(icon.actionText).toBe('Next button (Tab ×4)');
      expect(icon.trace.keys.map((k) => k.focusKey)).toEqual([
        await s.keyOf('#expiry'),
        await s.keyOf('#save'),
        await s.keyOf('#plan'),
        await s.keyOf('#icon'),
      ]);
      expect(icon.spoken).toBe('button');
    });

    it('presses Shift+Tab for a jump to the previous kind and logs each press', async () => {
      const s = await start('/listener-form.html');
      await run(s.body, next('button'), next('button'), next('button')); // Pay this bill, the unnamed button, Submit
      const back = await s.body.act(previous('button'));
      expect(back.actionText).toBe('Previous button (Shift+Tab ×1)');
      expect(back.trace.keys).toEqual([{ key: 'Shift+Tab', focusKey: await s.keyOf('#icon'), dialogKey: null }]);
      expect(back.spoken).toBe('button');
    });

    it('logs the dialog key of every press inside a dialog, so a focus trap can be seen', async () => {
      const s = await start('/listener-dialog.html');
      await run(s.body, next('button'), key('Enter'));
      const dialogKey = await s.keyOf('#dlg');
      const [tab1, tab2, shiftTab, escape] = await run(s.body, key('Tab'), key('Tab'), key('Shift+Tab'), key('Escape'));
      expect(dialogKey).not.toBeNull();
      expect(tab1!.trace.keys).toEqual([{ key: 'Tab', focusKey: await s.keyOf('#learn'), dialogKey }]);
      expect(tab2!.trace.keys).toEqual([{ key: 'Tab', focusKey: await s.keyOf('#cover'), dialogKey }]);
      expect(shiftTab!.trace.keys).toEqual([{ key: 'Shift+Tab', focusKey: await s.keyOf('#learn'), dialogKey }]);
      expect(escape!.trace.keys).toEqual([{ key: 'Escape', focusKey: await s.keyOf('#learn'), dialogKey }]);
      // Escape did nothing: the dialog is still open and the focus is inside it.
      expect(await s.page.evaluate('document.getElementById("dlg").hidden')).toBe(false);
      expect(await s.page.evaluate('document.activeElement.id')).toBe('learn');
    });

    it('stops after one cycle when nothing of the kind can be reached', async () => {
      const s = await start('/listener-landmarks.html'); // a link and a button, no form field
      const r = await s.body.act(next('field'));
      const keys = r.trace.keys;
      const home = await s.keyOf('#home-link');
      const first = await s.keyOf('#first');
      // The two tabbable elements and the document were all visited, and no more than one extra press was made.
      expect(keys.length).toBeGreaterThanOrEqual(3);
      expect(keys.length).toBeLessThanOrEqual(5);
      expect(keys.every((k) => k.key === 'Tab')).toBe(true);
      expect(keys.map((k) => k.focusKey)).toEqual(expect.arrayContaining([home, first, null]));
      expect(r.actionText).toBe(`Next form field (Tab ×${keys.length})`);
    });

    it('never presses more than 50 keys, however many links the page has', async () => {
      const s = await start('/listener-many-links.html');
      const r = await s.body.act(next('field'));
      expect(r.trace.keys).toHaveLength(JUMP_PRESS_CAP);
      expect(r.actionText).toBe('Next form field (Tab ×50)');
    });

    it('moves no focus with the mouse or touch: the page sees no pointer input', async () => {
      const s = await start('/listener-form.html');
      await run(s.body, next('heading'), next('button'), key('Enter'), next('field'), { type: 'type', text: '12' }, key('Space'));
      expect(((await s.log()) as { pointer: number }).pointer).toBe(0);
    });
  });

  // -----------------------------------------------------------------------------------------------------
  describe('keys and typing', () => {
    it('presses the key and logs it', async () => {
      const s = await start('/listener-form.html');
      const [tab, arrow, escape] = await run(s.body, key('Tab'), key('ArrowDown'), key('Escape'));
      expect(tab!.spoken).toBe('Help, link');
      expect(tab!.trace.keys).toEqual([{ key: 'Tab', focusKey: await s.keyOf('#help-link'), dialogKey: null }]);
      expect(arrow!.trace.keys.map((k) => k.key)).toEqual(['ArrowDown']);
      expect(escape!.trace.keys.map((k) => k.key)).toEqual(['Escape']);
      expect(((await s.log()) as { keys: string[] }).keys).toEqual(['Tab', 'ArrowDown', 'Escape']);
    });

    it('types into the focused field 30 ms apart and records which element it typed into', async () => {
      const s = await start('/listener-form.html');
      await s.body.act(next('field'));
      const text = '4111111111111111';
      const typed = await s.body.act({ type: 'type', text });
      expect(await s.page.evaluate('document.getElementById("card").value')).toBe(text);
      expect(typed.spoken).toBe(text);
      expect(typed.trace.keys).toEqual([]);
      expect(typed.trace.touchedKeys).toEqual([await s.keyOf('#card')]);

      const times = ((await s.log()) as { times: number[] }).times.slice(-text.length);
      expect(times).toHaveLength(text.length);
      for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBeGreaterThanOrEqual(25);
    });

    it('presses Escape without closing a dialog that ignores it, and speaks the focused node again', async () => {
      const s = await start('/listener-dialog.html');
      await run(s.body, next('button'), key('Enter'));
      const escape = await s.body.act(key('Escape'));
      expect(escape.spoken).toBe('Payment protection, checkbox, checked');
      expect(escape.actionText).toBe('Escape');
    });
  });

  // -----------------------------------------------------------------------------------------------------
  describe('Settle (Requirement 8.11)', () => {
    it('waits for a delayed chain of DOM changes before returning', async () => {
      const s = await start('/listener-settle.html');
      await s.body.act(next('button'));
      const r = await s.body.act(key('Enter')); // three changes at 200, 450 and 700 ms
      expect(await s.page.locator('#late3').count()).toBe(1);
      expect(r.trace.readyAt - r.trace.actionEndedAt).toBeGreaterThanOrEqual(700);
      expect(r.trace.readyAt - r.trace.actionEndedAt).toBeLessThan(SETTLE_MAX_MS);
    });

    it('waits while a request is in flight', async () => {
      const s = await start('/listener-settle.html');
      await s.page.route('**/ok.txt', async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 1200));
        await route.fulfill({ status: 200, contentType: 'text/plain', body: 'ok' });
      });
      await run(s.body, next('button'), next('button'), next('button')); // Show later, Save, Load data
      const started = Date.now();
      const r = await s.body.act(key('Enter'));
      expect(Date.now() - started).toBeGreaterThanOrEqual(1150);
      expect(r.trace.readyAt - r.trace.actionEndedAt).toBeGreaterThanOrEqual(1150);
    });

    it('returns within the 5 s cap on a page that changes forever', async () => {
      const s = await start('/listener-mutating.html');
      const started = Date.now();
      const r = await s.body.act(key('Tab'));
      const wall = Date.now() - started;
      expect(wall).toBeGreaterThanOrEqual(SETTLE_MAX_MS - 100);
      expect(wall).toBeLessThan(SETTLE_MAX_MS + 2500);
      const waited = r.trace.readyAt - r.trace.actionEndedAt;
      expect(waited).toBeGreaterThanOrEqual(SETTLE_MAX_MS - 100);
      expect(waited).toBeLessThan(SETTLE_MAX_MS + 2500);
      expect(r.spoken).toBe('Press, button');
    }, 60_000);

    it('takes about 300 ms on a quiet page', async () => {
      const s = await start('/listener-form.html');
      const r = await s.body.act(key('Tab'));
      const waited = r.trace.readyAt - r.trace.actionEndedAt;
      expect(waited).toBeGreaterThanOrEqual(300);
      expect(waited).toBeLessThan(1500);
    });
  });

  // -----------------------------------------------------------------------------------------------------
  describe('perception (Requirements 8.2 and 8.3)', () => {
    it('has exactly the allowed keys and no coordinates, sizes, CSS, HTML or image data', async () => {
      const s = await start('/listener-form.html');
      await run(s.body, next('heading'), next('field'));
      const { perception, probe } = await s.body.perceive();

      expect(Object.keys(probe)).toEqual(['at']);
      expect(probe.at).toBeGreaterThan(0);

      const json = JSON.stringify(perception);
      for (const forbidden of ['"x":', '"y":', '"width"', '"height"', '"w":', '"h":', 'data:image', '<div', '<input', 'style', 'px']) {
        expect(json, forbidden).not.toContain(forbidden);
      }
      const parsed = JSON.parse(json) as Record<string, unknown>;
      expect(Object.keys(parsed).sort()).toEqual([
        'announcements',
        'dialog',
        'focus',
        'nodes',
        'path',
        'readingPosition',
        'region',
        'title',
      ]);
      const allowed = new Set(['ref', 'role', 'name', 'description', 'value', 'states', 'level', 'depth']);
      for (const node of parsed.nodes as Record<string, unknown>[]) {
        for (const k of Object.keys(node)) expect(allowed.has(k), `node key ${k}`).toBe(true);
      }
      expect(perception.title).toBe('Listener form fixture');
      expect(perception.path).toBe('/listener-form.html');
      expect(perception.nodes.find((n) => n.ref === perception.focus)?.name).toBe('Card Number');
    });
  });

  // -----------------------------------------------------------------------------------------------------
  describe('focusBox (Requirement 6.6)', () => {
    it('is the border box of the focused element in CSS px', async () => {
      const s = await start('/listener-form.html');
      for (const [action, selector] of [
        [next('field'), '#card'],
        [next('field'), '#expiry'],
        [next('button'), '#icon'],
      ] as const) {
        const r = await s.body.act(action);
        const box = await s.page.locator(selector).boundingBox();
        expect(r.focusBox, selector).not.toBeNull();
        expect(r.focusBox!.x).toBeCloseTo(box!.x, 0);
        expect(r.focusBox!.y).toBeCloseTo(box!.y, 0);
        expect(r.focusBox!.w).toBeCloseTo(box!.width, 0);
        expect(r.focusBox!.h).toBeCloseTo(box!.height, 0);
      }
    });

    it('is null when focus is on the document, and a screenshot is taken after every action', async () => {
      const s = await start('/listener-form.html');
      expect(s.opening.focusBox).toBeNull();
      const r = await s.body.act(key('Escape'));
      expect(r.focusBox).toBeNull();
      expect(r.screenshot.subarray(1, 4).toString('latin1')).toBe('PNG');
    });
  });

  // -----------------------------------------------------------------------------------------------------
  describe('the KeyboardOnlyPage facade (Requirement 8.8)', () => {
    it('has the documented members and nothing that clicks, fills, focuses, evaluates or uses a pointer', async () => {
      const s = await start('/listener-form.html');
      const facade = createKeyboardOnlyPage(s.page, s.cdp);

      expect(Object.keys(facade).sort()).toEqual([...KEYBOARD_ONLY_PAGE_KEYS].sort());
      expect(Object.keys(facade.keyboard).sort()).toEqual([...KEYBOARD_ONLY_KEYBOARD_KEYS].sort());

      const forbidden = [
        'mouse',
        'touchscreen',
        'click',
        'dblclick',
        'tap',
        'fill',
        'focus',
        'check',
        'type',
        'press',
        'evaluate',
        'evaluateHandle',
        'locator',
        'dispatchEvent',
        'setContent',
        'addScriptTag',
        'route',
      ];
      for (const name of forbidden) {
        expect(KEYBOARD_ONLY_PAGE_KEYS as readonly string[], name).not.toContain(name);
        expect(Object.keys(facade), name).not.toContain(name);
      }
      expect(Object.isFrozen(facade)).toBe(true);

      // The compiler rejects every one of these (`@ts-expect-error` fails the build if one is allowed).
      // @ts-expect-error the facade has no mouse
      expect(facade.mouse).toBeUndefined();
      // @ts-expect-error the facade has no touchscreen
      expect(facade.touchscreen).toBeUndefined();
      // @ts-expect-error the facade has no click
      expect(facade.click).toBeUndefined();
      // @ts-expect-error the facade has no fill
      expect(facade.fill).toBeUndefined();
      // @ts-expect-error the facade has no focus
      expect(facade.focus).toBeUndefined();
      // @ts-expect-error the facade has no evaluate
      expect(facade.evaluate).toBeUndefined();
      // @ts-expect-error the keyboard has no down or up
      expect(facade.keyboard.down).toBeUndefined();
    });

    it('lets only read-only CDP methods through', async () => {
      const s = await start('/listener-form.html');
      const facade = createKeyboardOnlyPage(s.page, s.cdp);
      const send = facade.cdp.send as (method: string, params?: object) => Promise<unknown>;
      await expect(send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 1, y: 1, button: 'left' })).rejects.toThrow(/not allowed/);
      await expect(send('DOM.focus', { backendNodeId: 1 })).rejects.toThrow(/not allowed/);
      await expect(send('Runtime.evaluate', { expression: '1' })).rejects.toThrow(/not allowed/);
      const tree = (await facade.cdp.send<{ nodes: unknown[] }>('Accessibility.getFullAXTree')).nodes;
      expect(tree.length).toBeGreaterThan(0);
    });
  });
});
