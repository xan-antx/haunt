import { readFileSync } from 'node:fs';
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ActionResult, Body } from '../src/core/types.ts';
import type { Heard, HeardNode } from '../src/ghosts/listener/ax.ts';
import {
  JUMP_PRESS_CAP,
  KEYBOARD_ONLY_KEYBOARD_KEYS,
  KEYBOARD_ONLY_PAGE_KEYS,
  createListenerBody,
  type ListenerAction,
} from '../src/ghosts/listener/body.ts';
import { listenerProfile } from '../src/ghosts/listener/profile.ts';
import { pageInitScripts } from '../src/ghosts/registry.ts';
import { startFixtureServer, type FixtureServer } from './fixtureServer.ts';

/*
 * Task 9.5: the gaps that `listenerBody.test.ts`, `speech.test.ts` and `listenerAx.test.ts` leave against
 * Requirements 8.2 to 8.10. It walks a Lantern-Bills-like fixture (unnamed submit button, role="alert"
 * messages, a modal dialog) and checks what The Listener hears, that no pointer input ever reaches the
 * page, that jumps stop after one cycle, that the Body source cannot reach the forbidden Page methods,
 * and that every serialised Heard has exactly the allowed keys.
 *
 * **Validates: Requirements 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9, 8.10**
 */

type ListenerBody = Body<Heard, ListenerAction>;

const next = (to: 'heading' | 'landmark' | 'field' | 'button'): ListenerAction => ({ type: 'jump', to, dir: 'next' });
const previous = (to: 'heading' | 'landmark' | 'field' | 'button'): ListenerAction => ({ type: 'jump', to, dir: 'previous' });
const key = (k: Extract<ListenerAction, { type: 'key' }>['key']): ListenerAction => ({ type: 'key', key: k });
const typeText = (text: string): ListenerAction => ({ type: 'type', text });

interface Log {
  keys: string[];
  pointer: Record<string, number>;
  pointerTotal: number;
  keyboardClicks: number;
  pointerClicks: number;
}

const FORBIDDEN_IN_JSON = ['"x":', '"y":', '"w":', '"h":', '"width"', '"height"', 'data:image', 'base64', '<div', '<', 'style', 'px'];
const HEARD_KEYS = ['announcements', 'dialog', 'focus', 'nodes', 'path', 'readingPosition', 'region', 'title'];
const NODE_KEYS = ['depth', 'description', 'name', 'ref', 'role', 'states', 'value'];
const STATE_KEYS = new Set(['focused', 'checked', 'expanded', 'disabled', 'required', 'invalid', 'modal', 'busy']);

/** Fails unless the Heard has exactly the allowed keys at every level and no forbidden text anywhere. */
function expectPureHeard(heard: Heard, label: string): void {
  const json = JSON.stringify(heard);
  for (const forbidden of FORBIDDEN_IN_JSON) expect(json, `${label}: ${forbidden}`).not.toContain(forbidden);
  const parsed = JSON.parse(json) as Record<string, unknown>;

  expect(Object.keys(parsed).sort(), `${label}: top level`).toEqual(HEARD_KEYS);
  expect(typeof parsed.title).toBe('string');
  expect(typeof parsed.path).toBe('string');
  expect(parsed.focus === null || typeof parsed.focus === 'string', `${label}: focus`).toBe(true);
  expect(parsed.readingPosition === null || typeof parsed.readingPosition === 'string', `${label}: readingPosition`).toBe(true);
  expect(Array.isArray(parsed.announcements)).toBe(true);
  for (const a of parsed.announcements as unknown[]) expect(typeof a).toBe('string');

  if (parsed.dialog !== null) expect(Object.keys(parsed.dialog as object).sort(), `${label}: dialog`).toEqual(['name', 'ref']);
  if (parsed.region !== null) expect(Object.keys(parsed.region as object).sort(), `${label}: region`).toEqual(['name', 'ref', 'role']);

  const nodes = parsed.nodes as Record<string, unknown>[];
  expect(nodes.length).toBeGreaterThan(0);
  for (const node of nodes) {
    const keys = Object.keys(node).sort();
    // `level` is the one optional key, and only a heading has it.
    expect(keys.filter((k) => k !== 'level'), `${label}: node keys of ${String(node.role)}`).toEqual(NODE_KEYS);
    if (keys.includes('level')) expect(node.role, `${label}: level on a non-heading`).toBe('heading');
    expect(String(node.ref)).toMatch(/^ax-/);
    for (const field of ['role', 'name', 'description', 'value'] as const) expect(typeof node[field]).toBe('string');
    expect(Number.isInteger(node.depth)).toBe(true);
    for (const [state, value] of Object.entries(node.states as Record<string, unknown>)) {
      expect(STATE_KEYS.has(state), `${label}: state ${state}`).toBe(true);
      expect([true, false, 'mixed']).toContain(value);
    }
  }
}

describe('The Listener, Requirements 8.2 to 8.10 (task 9.5)', () => {
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

  afterAll(async () => {
    for (const page of opened) await page.close().catch(() => undefined);
    await context?.close();
    await browser?.close();
    await server?.close();
  });

  interface Session {
    page: Page;
    cdp: CDPSession;
    body: ListenerBody;
    opening: ActionResult;
    keyOf(selector: string): Promise<string | null>;
    log(): Promise<Log>;
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
        page.evaluate(`window.__haunt.keys.key(document.querySelector(${JSON.stringify(selector)}))`) as Promise<string | null>,
      log: () => page.evaluate('window.__log') as Promise<Log>,
    };
  }

  // ---------------------------------------------------------------------------------------------------
  // One walk through a Lantern-Bills-like page, shared by the tests of this block.
  // ---------------------------------------------------------------------------------------------------
  describe('a walk through a Lantern-Bills-like page', () => {
    const r: Record<string, ActionResult> = {};
    const heardAt: Record<string, Heard> = {};
    let walk: Session;
    let finalLog: Log;

    beforeAll(async () => {
      const s = (walk = await start('/listener-lantern.html'));
      const step = async (name: string, action: ListenerAction): Promise<void> => {
        r[name] = await s.body.act(action);
      };
      const hear = async (name: string): Promise<void> => {
        heardAt[name] = (await s.body.perceive()).perception;
      };
      r.open = s.opening;
      await hear('opened');

      await step('heading', next('heading'));
      await step('pay', next('button'));
      await step('revealForm', key('Enter'));
      await step('card', next('field'));
      await step('expiry', next('field'));
      await step('unnamed', next('button'));
      await hear('unnamedFocused');
      await step('emptyCard', key('Enter')); // role="alert" inserted with its text, during the action
      await hear('afterAlert');

      await step('backToExpiry', previous('field'));
      await step('backToCard', previous('field'));
      await step('typed', typeText('4111111111111111'));
      await step('unnamedAgain', next('button'));
      await step('emptyExpiry', key('Enter')); // role="alert" inserted 200 ms later, during the Settle
      await hear('afterLateAlert');

      await step('toExpiry', previous('field'));
      await step('typedExpiry', typeText('11/28'));
      await step('unnamedThird', next('button'));
      await step('openDialog', key('Enter'));
      await hear('dialogOpen');
      await step('untick', key('Space'));
      await step('toLearn', key('Tab'));
      await step('arrow', key('ArrowDown'));
      await step('backToCheckbox', key('Shift+Tab'));
      await step('escape', key('Escape'));
      await step('landmark', next('landmark'));
      await step('headingAgain', previous('heading'));
      await hear('end');
      finalLog = await s.log();
    }, 120_000);

    it('speaks "Pay this bill, button" for a named button and just "button" for the unnamed one (8.9)', () => {
      expect(r.pay!.spoken).toBe('Pay this bill, button');
      expect(r.pay!.actionText).toBe('Next button (Tab ×1)');
      expect(r.unnamed!.spoken).toBe('button');
      expect(r.unnamed!.actionText).toBe('Next button (Tab ×1)');
      expect(r.unnamedAgain!.spoken).toBe('button');
      // The unnamed button really has an empty accessible name in what is heard.
      const node = heardAt.unnamedFocused!.nodes.find((n) => n.ref === heardAt.unnamedFocused!.focus);
      expect(node).toMatchObject({ role: 'button', name: '' });
    });

    it('speaks the region when focus enters it, field states, and the typed text (8.9)', () => {
      expect(r.open!.spoken).toBe('Lantern Bills - Pay Your Electricity Bill, document');
      expect(r.heading!.spoken).toBe('Your Electricity Bill, heading level 1');
      expect(r.card!.spoken).toBe('Payment Information, region. Card Number, edit text, required');
      expect(r.expiry!.spoken).toBe('Expiry Date, edit text, required');
      expect(r.typed!.spoken).toBe('4111111111111111');
      expect(r.typed!.actionText).toBe('Type "4111111111111111"');
    });

    it('speaks the dialog entry, a checkbox state and its change (8.9)', () => {
      expect(r.openDialog!.spoken).toBe('Protect your payment, dialog. Payment protection for ₹99, checkbox, checked');
      expect(heardAt.dialogOpen!.dialog?.name).toBe('Protect your payment');
      expect(r.untick!.actionText).toBe('Space');
      expect(r.untick!.spoken).toBe('not checked');
      expect(r.toLearn!.spoken).toBe('Learn more, button, collapsed');
      // Back inside the same dialog: it is not announced again.
      expect(r.backToCheckbox!.spoken).toBe('Payment protection for ₹99, checkbox, not checked');
    });

    it('appends a role="alert" announcement made during the action (8.4, 8.9)', async () => {
      expect(r.emptyCard!.actionText).toBe('Enter');
      expect(r.emptyCard!.trace.announcements).toEqual(['Card number is required']);
      expect(r.emptyCard!.spoken).toBe('button. Card number is required');
      // The announcement waits for the next Perception, once, and the alert did not move focus.
      expect(heardAt.afterAlert!.announcements).toEqual(['Card number is required']);
      expect(heardAt.afterAlert!.focus).toBe(heardAt.unnamedFocused!.focus);
      expect(heardAt.unnamedFocused!.announcements).toEqual([]);
    });

    it('appends a role="alert" announcement made during the Settle that follows the action (8.4, 8.9)', () => {
      expect(r.emptyExpiry!.trace.announcements).toEqual(['Expiry date is required']);
      expect(r.emptyExpiry!.spoken).toBe('button. Expiry date is required');
      // The earlier alert is still in the page but is not spoken again.
      expect(heardAt.afterLateAlert!.announcements).toEqual(['Expiry date is required']);
      expect(r.emptyExpiry!.trace.readyAt - r.emptyExpiry!.trace.actionEndedAt).toBeGreaterThanOrEqual(450);
    });

    it('records the action in plain words with the Tab count of every jump (8.10)', () => {
      expect(r.heading!.actionText).toBe('Next heading');
      expect(r.revealForm!.actionText).toBe('Enter');
      expect(r.card!.actionText).toBe('Next form field (Tab ×1)');
      expect(r.expiry!.actionText).toBe('Next form field (Tab ×1)');
      expect(r.backToExpiry!.actionText).toBe('Previous form field (Shift+Tab ×1)');
      expect(r.backToCard!.actionText).toBe('Previous form field (Shift+Tab ×1)');
      expect(r.unnamedAgain!.actionText).toBe('Next button (Tab ×2)'); // the Expiry Date field, then the button
      expect(r.arrow!.actionText).toBe('ArrowDown');
      expect(r.escape!.actionText).toBe('Escape');
      for (const name of ['card', 'expiry', 'backToCard', 'unnamedAgain']) {
        const pressed = r[name]!.trace.keys.length;
        expect(r[name]!.actionText).toContain(`×${pressed})`);
      }
    });

    it('moves only the reading position for heading and landmark jumps: no key, no focus change (8.6)', () => {
      for (const name of ['heading', 'landmark', 'headingAgain']) expect(r[name]!.trace.keys, name).toEqual([]);
      // Focus was on the checkbox of the dialog before the landmark jump and still is after the heading jumps.
      expect(r.escape!.spoken).toBe('Payment protection for ₹99, checkbox, not checked');
      expect(heardAt.end!.focus).toBe(heardAt.dialogOpen!.focus);
      expect(heardAt.end!.readingPosition).not.toBeNull();
      expect(heardAt.end!.readingPosition).not.toBe(heardAt.end!.focus);
    });

    it('never sends a pointer, mouse, touch or wheel event, or a click with a position, to the page (8.8)', async () => {
      expect(finalLog.pointer).toEqual({});
      expect(finalLog.pointerTotal).toBe(0);
      expect(finalLog.pointerClicks).toBe(0);
      // Enter and Space did activate buttons: the page saw their keyboard clicks (detail 0), not mouse clicks.
      expect(finalLog.keyboardClicks).toBeGreaterThanOrEqual(5);
      expect(finalLog.keys).toEqual(
        expect.arrayContaining(['Tab', 'Shift', 'Enter', ' ', 'Escape', 'ArrowDown', '4', '1', '/']),
      );
      // Only keys the Listener may press, and typed characters.
      const allowed = new Set(['Tab', 'Shift', 'Enter', ' ', 'Escape', 'ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', ...'0123456789/']);
      for (const k of finalLog.keys) expect(allowed.has(k), `unexpected key ${k}`).toBe(true);
      // The focus moved only by keyboard: the dialog checkbox got it from a key press, not a click.
      expect(await walk.page.evaluate('document.activeElement && document.activeElement.id')).toBe('cover');
    });

    it('has exactly the allowed keys at every level and no pixels, sizes, CSS or HTML in every Perception (8.2, 8.3)', async () => {
      for (const [name, heard] of Object.entries(heardAt)) expectPureHeard(heard, name);
      // Same check on a fresh read at the end of the walk, and the probe holds only a time.
      const { perception, probe } = await walk.body.perceive();
      expectPureHeard(perception, 'fresh');
      expect(Object.keys(probe)).toEqual(['at']);
    });

    it('lists what the Accessibility_Tree holds: names, states, the focus, the dialog and the live messages (8.2)', () => {
      const dialogOpen = heardAt.dialogOpen!;
      const byRole = (role: string, name: string): HeardNode | undefined =>
        dialogOpen.nodes.find((n) => n.role === role && n.name === name);
      expect(dialogOpen.title).toBe('Lantern Bills - Pay Your Electricity Bill');
      expect(dialogOpen.path).toBe('/listener-lantern.html');
      expect(byRole('button', 'Pay this bill')).toBeDefined();
      expect(byRole('textbox', 'Card Number')?.states).toMatchObject({ required: true });
      expect(byRole('heading', 'Your Electricity Bill')?.level).toBe(1);
      expect(byRole('checkbox', 'Payment protection for ₹99')?.states).toMatchObject({ checked: true, focused: true });
      expect(dialogOpen.focus).toBe(byRole('checkbox', 'Payment protection for ₹99')?.ref);
      expect(dialogOpen.dialog).toEqual({ ref: expect.stringMatching(/^ax-/), name: 'Protect your payment' });
    });
  });

  // ---------------------------------------------------------------------------------------------------
  describe('jumps by form field and button stop after one cycle (8.7)', () => {
    /** Same count as the Body makes: AX nodes that are not ignored and are focusable. */
    async function focusableCount(s: Session): Promise<number> {
      const { nodes } = (await s.cdp.send('Accessibility.getFullAXTree')) as {
        nodes: { ignored?: boolean; properties?: { name: string; value: { value?: unknown } }[] }[];
      };
      return nodes.filter(
        (n) =>
          n.ignored !== true &&
          n.properties?.some((p) => p.name === 'focusable' && (p.value.value === true || p.value.value === 'true')),
      ).length;
    }

    it('presses Tab no more than focusable nodes + 2 (and never over 50) when no field can be reached, and visits every tabbable once', async () => {
      const s = await start('/listener-nomatch.html');
      const limit = Math.min(JUMP_PRESS_CAP, (await focusableCount(s)) + 2);
      const keys = (await s.body.act(next('field'))).trace.keys;

      expect(keys.every((k) => k.key === 'Tab')).toBe(true);
      expect(keys).toHaveLength(limit);
      expect(keys.length).toBeLessThanOrEqual(JUMP_PRESS_CAP);
      // One full cycle: all four tabbable elements were reached, in page order.
      const visited = keys.map((k) => k.focusKey);
      const order = [await s.keyOf('#alpha'), await s.keyOf('#beta'), await s.keyOf('#only'), await s.keyOf('#gamma')];
      expect(visited.slice(0, 4)).toEqual(order);
      // The field that only a script can focus is never reached, and nothing was typed or focused there.
      expect(visited).not.toContain(await s.keyOf('#unreachable'));
      expect(await s.page.evaluate('document.activeElement && document.activeElement.id')).not.toBe('unreachable');
    });

    it('stops after the same bound going backwards, with Shift+Tab', async () => {
      const s = await start('/listener-nomatch.html');
      const limit = Math.min(JUMP_PRESS_CAP, (await focusableCount(s)) + 2);
      const r = await s.body.act(previous('field'));
      expect(r.trace.keys).toHaveLength(limit);
      expect(r.trace.keys.every((k) => k.key === 'Shift+Tab')).toBe(true);
      expect(r.actionText).toBe(`Previous form field (Shift+Tab ×${limit})`);
    });

    it('does not keep going after a match: the press count is the distance to the first match', async () => {
      const s = await start('/listener-nomatch.html');
      const forward = await s.body.act(next('button')); // Alpha and Beta are links and are skipped
      expect(forward.actionText).toBe('Next button (Tab ×3)');
      expect(forward.trace.keys.map((k) => k.focusKey)).toEqual([await s.keyOf('#alpha'), await s.keyOf('#beta'), await s.keyOf('#only')]);
      expect(forward.spoken).toBe('Only button, button');
      expect(await s.page.evaluate('document.activeElement.id')).toBe('only');
    });

    it('stops at the cap of 50 on a page with 60 links and no field, and ends a second jump at the same bound', async () => {
      const s = await start('/listener-many-links.html');
      const first = await s.body.act(next('field'));
      const second = await s.body.act(next('button'));
      expect(first.trace.keys).toHaveLength(JUMP_PRESS_CAP);
      expect(second.trace.keys).toHaveLength(JUMP_PRESS_CAP);
    });
  });

  // ---------------------------------------------------------------------------------------------------
  describe('the Body source cannot reach the forbidden Page methods (8.8)', () => {
    /** A source file without comments, so that words in the documentation do not count. */
    function code(file: string): string {
      const text = readFileSync(new URL(`../src/ghosts/listener/${file}`, import.meta.url), 'utf8');
      return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/.*$/gm, '$1');
    }
    /** The code of a top-level exported function: from its `export function` line to the next closing brace in column 0. */
    function exportedFunction(source: string, name: string): { start: number; end: number } {
      const start = source.indexOf(`export function ${name}`);
      expect(start, `function ${name}`).toBeGreaterThanOrEqual(0);
      const end = source.indexOf('\n}\n', start) + 3;
      return { start, end };
    }

    const FORBIDDEN_MEMBERS = [
      /\.mouse\b/,
      /\.touchscreen\b/,
      /\.(?:click|dblclick|tap|fill|focus|check|uncheck|hover|selectOption|setInputFiles|dragAndDrop)\(/,
      /\.(?:evaluate|evaluateHandle|\$eval|\$\$eval|dispatchEvent|addScriptTag|addInitScript|setContent|route|exposeFunction)\(/,
      /\.locator\(|\.getByRole\(|\.getByText\(/,
      /\.keyboard\.(?:down|up|insertText)\(/,
    ];

    for (const file of ['body.ts', 'speech.ts', 'ax.ts']) {
      it(`${file} never calls mouse, touchscreen, click, fill, focus, evaluate or the like`, () => {
        const source = code(file);
        expect(source.length).toBeGreaterThan(500);
        for (const pattern of FORBIDDEN_MEMBERS) expect(source, `${file}: ${pattern}`).not.toMatch(pattern);
        // The words themselves, as a member access or a call, are absent too.
        for (const call of ['.mouse', '.touchscreen', '.click(', '.fill(', '.focus(', '.evaluate(']) {
          expect(source.includes(call), `${file}: ${call}`).toBe(false);
        }
      });
    }

    it('body.ts uses the real Page only inside the two factory functions, and only the facade elsewhere', () => {
      const source = code('body.ts');
      const factory = exportedFunction(source, 'createKeyboardOnlyPage');
      const entry = exportedFunction(source, 'createListenerBody');
      const outside =
        source.slice(0, factory.start) + source.slice(factory.end, entry.start) + source.slice(entry.end);
      const withoutImports = outside.replace(/^import .*$/gm, '');

      expect(source).toMatch(/import type \{[^}]*\bPage\b[^}]*\} from 'playwright'/); // a type import: no runtime dependency
      expect(withoutImports).not.toMatch(/\bCDPSession\b|:\s*Page\b|\bRequest\b/);

      const pageMembers = new Set([...withoutImports.matchAll(/\bpage\.(\w+)/g)].map((m) => m[1]));
      expect(pageMembers.size).toBeGreaterThan(5);
      for (const member of pageMembers) expect(KEYBOARD_ONLY_PAGE_KEYS as readonly string[], `page.${member}`).toContain(member);
      const keyboardMembers = new Set([...withoutImports.matchAll(/\bkeyboard\.(\w+)/g)].map((m) => m[1]));
      for (const member of keyboardMembers) expect(KEYBOARD_ONLY_KEYBOARD_KEYS as readonly string[], `keyboard.${member}`).toContain(member);
    });

    it('the factory gives the keyboard only press and type, and the page script reads are the fixed ones', () => {
      const source = code('body.ts');
      const { start, end } = exportedFunction(source, 'createKeyboardOnlyPage');
      const factory = source.slice(start, end);
      const realPageCalls = new Set([...factory.matchAll(/\bpage\.(\w+)/g)].map((m) => m[1]));
      expect([...realPageCalls].sort()).toEqual(['goto', 'keyboard', 'on', 'screenshot', 'title', 'url']);
      const keyboardCalls = new Set([...factory.matchAll(/\bpage\.keyboard\.(\w+)/g)].map((m) => m[1]));
      expect([...keyboardCalls].sort()).toEqual(['press', 'type']);
    });

    it('the Body names no CDP method except the two read-only ones it needs', () => {
      const source = code('body.ts') + code('ax.ts');
      const methods = new Set([...source.matchAll(/'((?:Accessibility|DOM|Input|Runtime|Page|Emulation|Network|Target)\.\w+)'/g)].map((m) => m[1]));
      expect([...methods].sort()).toEqual(['Accessibility.enable', 'Accessibility.getFullAXTree', 'DOM.getBoxModel']);
    });
  });
});
