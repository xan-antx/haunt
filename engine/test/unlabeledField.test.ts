import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { HauntConfig } from '../src/config/loadConfig.ts';
import { DetectorRunner } from '../src/core/detectors.ts';
import { Recorder } from '../src/core/recorder.ts';
import type { ActionResult } from '../src/core/types.ts';
import { createUnlabeledFieldDetector, FIELD_AX_ROLES } from '../src/detectors/unlabeledField.ts';
import { enableAccessibility, type RawAxNode } from '../src/ghosts/listener/ax.ts';
import { pageInitScripts } from '../src/ghosts/registry.ts';
import { startFixtureServer, type FixtureServer } from './fixtureServer.ts';

/**
 * The `unlabeled_field` Detector in Chromium against `unlabeled-field.html`.
 * The Detector decides on the name Chromium computes. The test reads `Accessibility.getFullAXTree`
 * on its own and checks that the flagged elements are exactly the unignored fields with an empty name.
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.8, 6.10, 9.2**
 */
const config: HauntConfig = {
  allowedDomains: [],
  sites: { 'lantern-bills': { name: 'Lantern Bills demo', allowedTerms: ['Lantern Bills'] } },
};
const site = config.sites['lantern-bills']!;

const SKIPPED_TYPES = ['hidden', 'submit', 'button', 'reset', 'image'];
const TEXTBOX_ROLES = ['textbox', 'searchbox', 'combobox'];

interface Described {
  id: string;
  tag: string;
  type: string;
  roleAttr: string;
  role: string;
  name: string;
}

describe('unlabeled_field Detector in Chromium', () => {
  let server: FixtureServer;
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let session: CDPSession;

  beforeAll(async () => {
    server = await startFixtureServer();
    browser = await chromium.launch();
    context = await browser.newContext({ viewport: { width: 800, height: 600 } });
    for (const source of pageInitScripts) await context.addInitScript(source);
    page = await context.newPage();
    session = await context.newCDPSession(page);
    await enableAccessibility(session);
  }, 60_000);

  afterAll(async () => {
    await context?.close();
    await browser?.close();
    await server?.close();
  });

  async function haunt(pathname: string) {
    await page.goto(server.url(pathname));
    const recorder = new Recorder({ width: 800, height: 600, deviceScaleFactor: 1 });
    const runner = new DetectorRunner({ detectors: [createUnlabeledFieldDetector()], page, cdp: session, config, site, recorder });
    const result: ActionResult = {
      actionText: 'Open the fixture',
      spoken: '',
      focusBox: null,
      screenshot: Buffer.from('png'),
      trace: { pathBefore: pathname, pathAfter: pathname, keys: [], touchedKeys: [], actionEndedAt: 0, readyAt: 0, waits: [], announcements: [] },
    };
    recorder.add(result, 'Listening.');
    expect(await runner.observe(recorder.last!)).toBeNull();
    expect(await runner.finish()).toBeNull();
    return runner;
  }

  /** Independent read of the accessibility tree: every unignored node that has a DOM element. */
  async function readTree(): Promise<Described[]> {
    const { nodes } = (await session.send('Accessibility.getFullAXTree')) as { nodes: RawAxNode[] };
    const out: Described[] = [];
    for (const node of nodes) {
      if (node.ignored === true || node.backendDOMNodeId === undefined) continue;
      let described: { node: { nodeName: string; attributes?: string[] } };
      try {
        described = (await session.send('DOM.describeNode', { backendNodeId: node.backendDOMNodeId })) as typeof described;
      } catch {
        continue;
      }
      const attrs = described.node.attributes ?? [];
      const attr = (name: string): string => {
        for (let i = 0; i + 1 < attrs.length; i += 2) if (attrs[i] === name) return attrs[i + 1] ?? '';
        return '';
      };
      out.push({
        id: attr('id'),
        tag: described.node.nodeName.toLowerCase(),
        type: attr('type').toLowerCase(),
        roleAttr: attr('role').toLowerCase(),
        role: String(node.role?.value ?? ''),
        name: String(node.name?.value ?? ''),
      });
    }
    return out;
  }

  /** Form_Fields and Textbox_Elements, as the task defines them. */
  function isField(d: Described): boolean {
    if (['input', 'select', 'textarea'].includes(d.tag)) return !(d.tag === 'input' && SKIPPED_TYPES.includes(d.type));
    return TEXTBOX_ROLES.includes(d.roleAttr);
  }

  const idOf = (selector: string): string => (selector.split(' > ').pop() ?? '').split('#')[1] ?? '';

  /** Ids of the elements the Detector flagged, read from the selector in the evidence. */
  function flaggedIds(runner: DetectorRunner): string[] {
    return runner.findings.map((f) => {
      const match = /at (.+?)(?: \([^)]*\))? has no accessible name/.exec(f.evidence);
      return idOf(match?.[1] ?? '');
    });
  }

  it('flags exactly the unignored fields that Chromium gives an empty name', async () => {
    const runner = await haunt('/unlabeled-field.html');
    const tree = await readTree();
    const expected = tree.filter((d) => isField(d) && d.name.trim() === '').map((d) => d.id);
    expect(expected.length).toBeGreaterThan(5);
    expect(flaggedIds(runner).sort()).toEqual(expected.sort());
    for (const finding of runner.findings) {
      expect(finding.type).toBe('unlabeled_field');
      expect(finding.title).toBe('Form field has no accessible name');
      expect(finding.evidence).toContain('the name that Chromium computes for it is empty');
    }
  });

  it('flags native fields and text boxes with no name, and leaves named, placeholder-named, hidden and aria-hidden fields alone', async () => {
    const runner = await haunt('/unlabeled-field.html');
    const ids = flaggedIds(runner);
    for (const flagged of ['bare', 'bare-area', 'bare-select', 'div-textbox']) expect(ids).toContain(flagged);
    for (const left of ['named', 'aria-named', 'placeholder-only', 'hidden-input', 'aria-hidden-field', 'display-none', 'submit']) {
      expect(ids).not.toContain(left);
    }
  });

  it('follows the name Chromium computes for a div role="textbox" that has only an aria-placeholder', async () => {
    const runner = await haunt('/unlabeled-field.html');
    const tree = await readTree();
    const editor = tree.find((d) => d.id === 'div-aria-placeholder')!;
    // The Detector adds no exemption and no name of its own: it is flagged exactly when Chromium's name is empty.
    expect(flaggedIds(runner).includes('div-aria-placeholder')).toBe(editor.name.trim() === '');
    // The native input with only a placeholder has a non-empty name in Chromium, so it is not flagged.
    expect(tree.find((d) => d.id === 'placeholder-only')!.name.trim()).not.toBe('');
  });

  it('covers the role Chromium gives each native input type that has an empty name', async () => {
    const tree = await readTree();
    const typed = tree.filter((d) => d.id.startsWith('type-'));
    expect(typed.length).toBeGreaterThanOrEqual(15);
    const outside = typed
      .filter((d) => d.name.trim() === '' && !FIELD_AX_ROLES.includes(d.role))
      .map((d) => `${d.type}=${d.role}`);
    expect(outside, 'unnamed native input types whose role is not in FIELD_AX_ROLES').toEqual([]);
  });

  it('does not change the page or the focus', async () => {
    await page.goto(server.url('/unlabeled-field.html'));
    await page.focus('#named');
    const before = await page.evaluate('document.documentElement.outerHTML');
    const runner = new DetectorRunner({
      detectors: [createUnlabeledFieldDetector()],
      page,
      cdp: session,
      config,
      site,
      recorder: new Recorder({ width: 800, height: 600, deviceScaleFactor: 1 }),
    });
    const recorder = (runner as unknown as { recorder: Recorder }).recorder;
    recorder.add(
      {
        actionText: 'Open',
        spoken: '',
        focusBox: null,
        screenshot: Buffer.from('png'),
        trace: { pathBefore: '/', pathAfter: '/', keys: [], touchedKeys: [], actionEndedAt: 0, readyAt: 0, waits: [], announcements: [] },
      },
      'Listening.',
    );
    await runner.observe(recorder.last!);
    await runner.finish();
    expect(runner.findings.length).toBeGreaterThan(0);
    expect(await page.evaluate('document.activeElement.id')).toBe('named');
    expect(await page.evaluate('document.documentElement.outerHTML')).toBe(before);
  });
});
