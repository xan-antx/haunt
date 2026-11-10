import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  buildHeard,
  enableAccessibility,
  readHeard,
  type Heard,
  type HeardInput,
  type RawAxNode,
  type RawAxProperty,
} from '../src/ghosts/listener/ax.ts';
import { listenerProfile } from '../src/ghosts/listener/profile.ts';
import { startFixtureServer, type FixtureServer } from './fixtureServer.ts';

/**
 * Unit tests for The Listener's profile and for how a Heard is built from the Accessibility_Tree.
 * **Validates: Requirements 8.1, 8.2, 8.3**
 */

const input: HeardInput = { title: 'T', path: '/p', readingPosition: null, announcements: [] };

interface NodeSpec {
  role: string;
  name?: string;
  description?: string;
  value?: string;
  ignored?: boolean;
  parent?: string;
  children?: string[];
  backend?: number;
  props?: Record<string, unknown>;
}

/** Makes a raw CDP node in the shape `Accessibility.getFullAXTree` returns. */
function raw(id: string, spec: NodeSpec): RawAxNode {
  const properties: RawAxProperty[] = Object.entries(spec.props ?? {}).map(([name, value]) => ({
    name,
    value: { type: 'any', value },
  }));
  const node: RawAxNode = {
    nodeId: id,
    ignored: spec.ignored ?? false,
    role: { type: 'role', value: spec.role },
    properties,
    backendDOMNodeId: spec.backend ?? Number(id) * 10,
  };
  if (spec.name !== undefined) node.name = { type: 'computedString', value: spec.name };
  if (spec.description !== undefined) node.description = { type: 'computedString', value: spec.description };
  if (spec.value !== undefined) node.value = { type: 'string', value: spec.value };
  if (spec.parent !== undefined) node.parentId = spec.parent;
  if (spec.children !== undefined) node.childIds = spec.children;
  return node;
}

describe('The Listener profile (Requirement 8.1)', () => {
  it('is a 1280 by 800 desktop browser, scale 1, en-IN, without throttling', () => {
    expect(listenerProfile).toEqual({
      width: 1280,
      height: 800,
      deviceScaleFactor: 1,
      locale: 'en-IN',
      isMobile: false,
      hasTouch: false,
    });
    expect(listenerProfile.throttling).toBeUndefined();
  });
});

describe('buildHeard from canned AX nodes', () => {
  it('removes ignored nodes, keeps their children, and counts depth over kept ancestors only', () => {
    const heard = buildHeard(
      [
        raw('1', { role: 'RootWebArea', name: 'Doc', children: ['2', '5'] }),
        raw('2', { role: 'none', ignored: true, parent: '1', children: ['3'] }),
        raw('3', { role: 'main', parent: '2', children: ['4'] }),
        raw('4', { role: 'heading', name: 'Your Electricity Bill', parent: '3', props: { level: 1 } }),
        raw('5', { role: 'button', name: 'Pay this bill', parent: '1' }),
      ],
      input,
    );
    expect(heard.nodes.map((n) => [n.role, n.depth])).toEqual([
      ['RootWebArea', 0],
      ['main', 1],
      ['heading', 2],
      ['button', 1],
    ]);
    expect(heard.nodes.some((n) => n.role === 'none')).toBe(false);
  });

  it('leaves out the InlineTextBox line fragments that sit under StaticText', () => {
    const heard = buildHeard(
      [
        raw('1', { role: 'RootWebArea', children: ['2'] }),
        raw('2', { role: 'StaticText', name: 'Hello', parent: '1', children: ['-3'] }),
        { ...raw('-3', { role: 'InlineTextBox', name: 'Hello', parent: '2' }), backendDOMNodeId: undefined },
      ],
      input,
    );
    expect(heard.nodes.map((n) => n.role)).toEqual(['RootWebArea', 'StaticText']);
  });

  it('lists nodes in document order even when the raw array is shuffled', () => {
    const heard = buildHeard(
      [
        raw('4', { role: 'link', name: 'C', parent: '1' }),
        raw('1', { role: 'RootWebArea', children: ['2', '3', '4'] }),
        raw('3', { role: 'link', name: 'B', parent: '1' }),
        raw('2', { role: 'link', name: 'A', parent: '1' }),
      ],
      input,
    );
    expect(heard.nodes.map((n) => n.name)).toEqual(['', 'A', 'B', 'C']);
  });

  it('copies role, name, description and value as they are, and uses empty text when Chromium gave none', () => {
    const heard = buildHeard(
      [
        raw('1', { role: 'RootWebArea' }),
        raw('2', { role: 'textbox', name: 'Card number', description: 'Digits only', value: '4111', parent: '1' }),
        raw('3', { role: 'button', parent: '1' }),
      ],
      input,
    );
    expect(heard.nodes[1]).toMatchObject({ role: 'textbox', name: 'Card number', description: 'Digits only', value: '4111' });
    expect(heard.nodes[2]).toMatchObject({ role: 'button', name: '', description: '', value: '' });
  });

  it('uses the opaque ref ax-<backendDOMNodeId>', () => {
    const heard = buildHeard([raw('7', { role: 'button', backend: 42 })], input);
    expect(heard.nodes[0]?.ref).toBe('ax-42');
  });

  it('reads states, including a mixed checkbox and the heading level', () => {
    const heard = buildHeard(
      [
        raw('1', { role: 'RootWebArea', children: ['2', '3', '4', '5', '6', '7', '8'] }),
        raw('2', { role: 'checkbox', name: 'All', parent: '1', props: { checked: 'mixed' } }),
        raw('3', { role: 'checkbox', name: 'On', parent: '1', props: { checked: 'true' } }),
        raw('4', { role: 'checkbox', name: 'Off', parent: '1', props: { checked: 'false' } }),
        raw('5', { role: 'button', name: 'Menu', parent: '1', props: { expanded: false, disabled: true } }),
        raw('6', {
          role: 'textbox',
          name: 'Card',
          parent: '1',
          props: { required: true, invalid: 'true', busy: true, focused: true },
        }),
        raw('7', { role: 'textbox', name: 'Fine', parent: '1', props: { invalid: 'false', required: false } }),
        raw('8', { role: 'heading', name: 'Title', parent: '1', props: { level: 3 } }),
      ],
      input,
    );
    const byName = (name: string) => heard.nodes.find((n) => n.name === name);
    expect(byName('All')?.states).toEqual({ checked: 'mixed' });
    expect(byName('On')?.states).toEqual({ checked: true });
    expect(byName('Off')?.states).toEqual({ checked: false });
    expect(byName('Menu')?.states).toEqual({ expanded: false, disabled: true });
    expect(byName('Card')?.states).toEqual({ focused: true, required: true, invalid: true, busy: true });
    expect(byName('Fine')?.states).toEqual({});
    expect(byName('Title')?.level).toBe(3);
    expect(byName('Title')?.states).toEqual({});
    expect(byName('On')?.level).toBeUndefined();
  });

  it('reads the modal state of a dialog', () => {
    const heard = buildHeard([raw('1', { role: 'dialog', name: 'D', props: { modal: true } })], input);
    expect(heard.nodes[0]?.states).toEqual({ modal: true });
  });

  it('finds the focus, the nearest dialog above it and the nearest landmark above it', () => {
    const heard = buildHeard(
      [
        raw('1', { role: 'RootWebArea', children: ['2'] }),
        raw('2', { role: 'main', name: 'Page', parent: '1', children: ['3'] }),
        raw('3', { role: 'region', name: 'Checkout', parent: '2', children: ['4'] }),
        raw('4', { role: 'dialog', name: 'Protect your payment', parent: '3', children: ['5'] }),
        raw('5', { role: 'none', ignored: true, parent: '4', children: ['6'] }),
        raw('6', { role: 'checkbox', name: 'Cover', parent: '5', props: { focused: true, checked: true }, backend: 99 }),
      ],
      input,
    );
    expect(heard.focus).toBe('ax-99');
    expect(heard.dialog).toEqual({ ref: 'ax-40', name: 'Protect your payment' });
    expect(heard.region).toEqual({ ref: 'ax-30', role: 'region', name: 'Checkout' });
    expect(heard.nodes.find((n) => n.ref === 'ax-99')?.states.focused).toBe(true);
  });

  it('treats an alertdialog as a dialog and a focused dialog as containing the focus', () => {
    const heard = buildHeard(
      [
        raw('1', { role: 'RootWebArea', children: ['2'] }),
        raw('2', { role: 'alertdialog', name: 'Sure?', parent: '1', props: { focused: true } }),
      ],
      input,
    );
    expect(heard.dialog).toEqual({ ref: 'ax-20', name: 'Sure?' });
  });

  it('leaves dialog and region empty when the focus is outside any dialog or landmark, and when nothing has focus', () => {
    const outside = buildHeard(
      [
        raw('1', { role: 'RootWebArea', children: ['2', '3'] }),
        raw('2', { role: 'dialog', name: 'Other', parent: '1' }),
        raw('3', { role: 'button', name: 'B', parent: '1', props: { focused: true } }),
      ],
      input,
    );
    expect(outside.focus).toBe('ax-30');
    expect(outside.dialog).toBeNull();
    expect(outside.region).toBeNull();

    const none = buildHeard([raw('1', { role: 'RootWebArea' })], input);
    expect(none.focus).toBeNull();
    expect(none.dialog).toBeNull();
    expect(none.region).toBeNull();
  });

  it('does not report the focus on an ignored node', () => {
    const heard = buildHeard(
      [raw('1', { role: 'RootWebArea', children: ['2'] }), raw('2', { role: 'none', ignored: true, parent: '1', props: { focused: true } })],
      input,
    );
    expect(heard.focus).toBeNull();
  });

  it('passes the title, path, reading position and announcements through', () => {
    const announcements = ['Please enter a valid card number'];
    const heard = buildHeard([raw('1', { role: 'RootWebArea' })], {
      title: 'Your bill',
      path: '/autopay',
      readingPosition: 'ax-10',
      announcements,
    });
    expect(heard).toMatchObject({ title: 'Your bill', path: '/autopay', readingPosition: 'ax-10' });
    expect(heard.announcements).toEqual(announcements);
    expect(heard.announcements).not.toBe(announcements);
  });

  it('keeps refs unique when two AX nodes share a backend id', () => {
    const heard = buildHeard(
      [raw('1', { role: 'RootWebArea', children: ['2', '3'] }), raw('2', { role: 'text', parent: '1', backend: 5 }), raw('3', { role: 'text', parent: '1', backend: 5 })],
      input,
    );
    const refs = heard.nodes.map((n) => n.ref);
    expect(new Set(refs).size).toBe(refs.length);
  });
});

describe('readHeard', () => {
  it('asks for the full AX tree and builds a Heard from the answer', async () => {
    const calls: string[] = [];
    const cdp = {
      send: async (method: 'Accessibility.getFullAXTree') => {
        calls.push(method);
        return { nodes: [raw('1', { role: 'RootWebArea', name: 'Doc' })] };
      },
    };
    const heard = await readHeard(cdp, input);
    expect(calls).toEqual(['Accessibility.getFullAXTree']);
    expect(heard.nodes).toHaveLength(1);
  });

  it('enableAccessibility sends Accessibility.enable', async () => {
    const calls: string[] = [];
    await enableAccessibility({
      send: async (method) => {
        calls.push(method);
        return {};
      },
    });
    expect(calls).toEqual(['Accessibility.enable']);
  });
});

/** The keys a Heard may have, at each level (Requirements 8.2 and 8.3). */
const HEARD_KEYS = ['announcements', 'dialog', 'focus', 'nodes', 'path', 'readingPosition', 'region', 'title'];
const NODE_REQUIRED_KEYS = ['depth', 'description', 'name', 'ref', 'role', 'states', 'value'];
const NODE_ALLOWED_KEYS = new Set([...NODE_REQUIRED_KEYS, 'level']);
const STATE_KEYS = new Set(['focused', 'checked', 'expanded', 'disabled', 'required', 'invalid', 'modal', 'busy']);

describe('The Listener reads a fixture page in Chromium', () => {
  let server: FixtureServer;
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let cdp: CDPSession;
  let first: Heard;
  let second: Heard;

  beforeAll(async () => {
    server = await startFixtureServer();
    browser = await chromium.launch();
    context = await browser.newContext({
      viewport: { width: listenerProfile.width, height: listenerProfile.height },
      deviceScaleFactor: listenerProfile.deviceScaleFactor,
      locale: listenerProfile.locale,
    });
    page = await context.newPage();
    cdp = await context.newCDPSession(page);
    await enableAccessibility(cdp);
    await page.goto(server.url('/listener-ax.html'));
    const readInput = { title: await page.title(), path: new URL(page.url()).pathname, readingPosition: null, announcements: [] };
    first = await readHeard(cdp, readInput);
    second = await readHeard(cdp, readInput);
  }, 60_000);

  afterAll(async () => {
    await context?.close();
    await browser?.close();
    await server?.close();
  });

  const find = (heard: Heard, role: string, name: string) => heard.nodes.find((n) => n.role === role && n.name === name);

  it('reports title, path, roles and Chromium-computed names', () => {
    expect(first.title).toBe('Listener fixture');
    expect(first.path).toBe('/listener-ax.html');
    expect(find(first, 'heading', 'Your Electricity Bill')?.level).toBe(1);
    expect(find(first, 'heading', 'Payment')?.level).toBe(2);
    expect(find(first, 'heading', 'Extra cover')?.level).toBe(3);
    for (const [role, name] of [
      ['banner', ''],
      ['navigation', 'Main'],
      ['main', ''],
      ['contentinfo', ''],
      ['region', 'Checkout'],
      ['dialog', 'Protect your payment'],
      ['link', 'Bills'],
      ['checkbox', 'Payment protection'],
      ['button', 'Learn more'],
    ] as const) {
      expect(find(first, role, name), `${role} "${name}"`).toBeDefined();
    }
  });

  it('gives the labelled button its name and the icon-only button an empty name', () => {
    const buttons = first.nodes.filter((n) => n.role === 'button');
    expect(buttons.map((b) => b.name)).toEqual(['Pay this bill', '', 'Learn more']);
  });

  it('knows which node has focus, the dialog it is in and the landmark around it', () => {
    const cover = find(first, 'checkbox', 'Payment protection');
    expect(cover?.states).toMatchObject({ focused: true, checked: true });
    expect(first.focus).toBe(cover?.ref);
    const dialog = find(first, 'dialog', 'Protect your payment');
    expect(first.dialog).toEqual({ ref: dialog?.ref, name: 'Protect your payment' });
    const region = find(first, 'region', 'Checkout');
    expect(first.region).toEqual({ ref: region?.ref, role: 'region', name: 'Checkout' });
  });

  it('keeps nodes in document order with depth that grows inside containers', () => {
    const order = ['banner', 'navigation', 'main', 'contentinfo'].map((role) => first.nodes.findIndex((n) => n.role === role));
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const main = find(first, 'main', '');
    const h1 = find(first, 'heading', 'Your Electricity Bill');
    expect(h1!.depth).toBeGreaterThan(main!.depth);
    expect(first.nodes.some((n) => n.role === 'none' || n.role === 'Ignored')).toBe(false);
  });

  it('gives the same ref to the same element on two reads', () => {
    expect(second.nodes.map((n) => n.ref)).toEqual(first.nodes.map((n) => n.ref));
    expect(find(second, 'button', 'Pay this bill')?.ref).toBe(find(first, 'button', 'Pay this bill')?.ref);
    expect(new Set(first.nodes.map((n) => n.ref)).size).toBe(first.nodes.length);
    expect(first.nodes.every((n) => /^ax-\d+$/.test(n.ref))).toBe(true);
  });

  it('serialises with exactly the allowed keys and no pixels, sizes, CSS or HTML (Requirement 8.3)', () => {
    const json = JSON.stringify(first);
    for (const forbidden of ['"x":', '"y":', '"width"', '"height"', 'data:image', '<div', 'style']) {
      expect(json, forbidden).not.toContain(forbidden);
    }

    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(HEARD_KEYS);
    expect(Object.keys(parsed.dialog as object).sort()).toEqual(['name', 'ref']);
    expect(Object.keys(parsed.region as object).sort()).toEqual(['name', 'ref', 'role']);
    for (const node of parsed.nodes as Record<string, unknown>[]) {
      const keys = Object.keys(node);
      for (const key of NODE_REQUIRED_KEYS) expect(keys).toContain(key);
      for (const key of keys) expect(NODE_ALLOWED_KEYS.has(key), `node key ${key}`).toBe(true);
      for (const key of Object.keys(node.states as object)) expect(STATE_KEYS.has(key), `state key ${key}`).toBe(true);
    }
  });
});
