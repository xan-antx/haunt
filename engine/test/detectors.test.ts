import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { HauntConfig } from '../src/config/loadConfig.ts';
import {
  createInspect,
  createReadOnlyCdp,
  DetectorRunner,
  READ_ONLY_CDP_METHODS,
  type CdpSender,
} from '../src/core/detectors.ts';
import { Recorder } from '../src/core/recorder.ts';
import type { ActionResult, DetectedProblem, Detector, DetectorContext, FindingType, RecordedStep } from '../src/core/types.ts';
import { startFixtureServer, type FixtureServer } from './fixtureServer.ts';

/**
 * Unit tests for the detector framework: the read-only CDP wrapper, `inspect`, the runner
 * (order, de-duplication, failures), and a purity check against a real page in Chromium.
 * **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 7.6**
 */

const config: HauntConfig = {
  allowedDomains: [],
  sites: { 'lantern-bills': { name: 'Lantern Bills demo', allowedTerms: ['Lantern Bills'] } },
};
const site = config.sites['lantern-bills']!;

function actionResult(text: string): ActionResult {
  return {
    actionText: text,
    spoken: '',
    focusBox: null,
    screenshot: Buffer.from('png'),
    trace: {
      pathBefore: '/',
      pathAfter: '/',
      keys: [],
      touchedKeys: [],
      actionEndedAt: 0,
      readyAt: 0,
      waits: [],
      announcements: [],
    },
  };
}

function recorderWithSteps(count: number): Recorder {
  const recorder = new Recorder({ width: 1280, height: 800, deviceScaleFactor: 1 });
  for (let i = 1; i <= count; i += 1) recorder.add(actionResult(`step ${i}`), `thought ${i}`);
  return recorder;
}

function problem(key: string, stepN: number, extra: Partial<DetectedProblem> = {}): DetectedProblem {
  return { key, stepN, title: `title ${key}`, evidence: `evidence ${key}`, screenshot: 'step', ...extra };
}

function detector(type: FindingType, observe: Detector['observe'], finish?: Detector['finish']): Detector {
  return finish ? { type, observe, finish } : { type, observe };
}

/** A runner on fake page and CDP objects: nothing here touches a browser. */
function fakeRunner(detectors: Detector[], recorder: Recorder) {
  const evaluate = vi.fn(async (_expression: string) => 'evaluated');
  const send = vi.fn(async (_method: string, _params?: object) => ({ ok: true }));
  const runner = new DetectorRunner({
    detectors,
    page: { evaluate } as never,
    cdp: { send } as never,
    config,
    site,
    recorder,
  });
  return { runner, evaluate, send };
}

describe('createReadOnlyCdp', () => {
  it('allows exactly the three read-only methods', () => {
    expect([...READ_ONLY_CDP_METHODS].sort()).toEqual([
      'Accessibility.getFullAXTree',
      'DOM.describeNode',
      'DOM.getBoxModel',
    ]);
  });

  it.each(['Accessibility.getFullAXTree', 'DOM.describeNode', 'DOM.getBoxModel'] as const)(
    'forwards %s with its parameters and returns the answer',
    async (method) => {
      const send = vi.fn(async (_method: string, _params?: object) => ({ answer: method }));
      const cdp = createReadOnlyCdp({ send } as unknown as CdpSender);
      await expect(cdp.send(method, { backendNodeId: 7 })).resolves.toEqual({ answer: method });
      expect(send).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledWith(method, { backendNodeId: 7 });
    },
  );

  it.each([
    'Input.dispatchKeyEvent',
    'Input.dispatchMouseEvent',
    'Input.insertText',
    'Runtime.evaluate',
    'Runtime.callFunctionOn',
    'Page.navigate',
    'DOM.focus',
    'DOM.setAttributeValue',
    'DOM.setNodeValue',
    'Emulation.setDeviceMetricsOverride',
    'dom.getBoxModel',
    'DOM.getBoxModel ',
    '__proto__',
    'toString',
    '',
  ])('throws for %j and sends nothing', async (method) => {
    const send = vi.fn(async (_method: string, _params?: object) => ({}));
    const cdp = createReadOnlyCdp({ send } as unknown as CdpSender);
    await expect(cdp.send(method as never, { expression: 'document.body.remove()' })).rejects.toThrow(/not allowed/);
    expect(send).not.toHaveBeenCalled();
  });

  it('names the refused method in the error', async () => {
    const cdp = createReadOnlyCdp({ send: async () => ({}) } as unknown as CdpSender);
    await expect(cdp.send('Input.dispatchKeyEvent' as never)).rejects.toThrow('Input.dispatchKeyEvent');
  });

  it('has only a send function, so the session behind it cannot be reached', () => {
    const cdp = createReadOnlyCdp({ send: async () => ({}) } as unknown as CdpSender);
    expect(Object.keys(cdp)).toEqual(['send']);
  });
});

describe('createInspect', () => {
  it('evaluates the script as a function expression called with the argument', async () => {
    const evaluate = vi.fn(async (_expression: string) => 42);
    const inspect = createInspect({ evaluate } as never);
    await expect(inspect<number>('(sel) => sel.length', 'button')).resolves.toBe(42);
    expect(evaluate).toHaveBeenCalledWith('((sel) => sel.length)("button")');
  });

  it('passes undefined when there is no argument, and JSON-encodes objects', async () => {
    const evaluate = vi.fn(async (_expression: string) => null);
    const inspect = createInspect({ evaluate } as never);
    await inspect('() => 1');
    await inspect('(o) => o.a', { a: [1, 'two'] });
    expect(evaluate.mock.calls).toEqual([['(() => 1)(undefined)'], ['((o) => o.a)({"a":[1,"two"]})']]);
  });
});

describe('DetectorRunner', () => {
  it('runs the Detectors in the order listed, after each Step, with a context for that Step', async () => {
    const recorder = recorderWithSteps(2);
    const order: string[] = [];
    const contexts: DetectorContext[] = [];
    const make = (type: FindingType) =>
      detector(type, async (ctx) => {
        order.push(type);
        contexts.push(ctx);
        return [];
      });
    const { runner } = fakeRunner([make('focus_trap'), make('unlabeled_button'), make('misclick')], recorder);

    expect(await runner.observe(recorder.last!)).toBeNull();
    expect(order).toEqual(['focus_trap', 'unlabeled_button', 'misclick']);

    const ctx = contexts[0]!;
    expect(ctx.current).toBe(recorder.last);
    expect(ctx.steps).toBe(recorder.steps);
    expect(ctx.config).toBe(config);
    expect(ctx.site).toBe(site);
    // Detectors get inspect and the read-only CDP wrapper, and nothing else.
    expect(Object.keys(ctx).sort()).toEqual(['cdp', 'config', 'current', 'inspect', 'site', 'steps']);
    expect(Object.keys(ctx.cdp)).toEqual(['send']);
  });

  it('lets a Detector use inspect and the read-only CDP wrapper through the runner', async () => {
    const recorder = recorderWithSteps(1);
    let seen: unknown;
    const { runner, evaluate, send } = fakeRunner(
      [
        detector('focus_trap', async (ctx) => {
          seen = [await ctx.inspect('() => 1'), await ctx.cdp.send('Accessibility.getFullAXTree')];
          return [];
        }),
      ],
      recorder,
    );
    await runner.observe(recorder.last!);
    expect(seen).toEqual(['evaluated', { ok: true }]);
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith('Accessibility.getFullAXTree', undefined);
  });

  it('records a Finding with the type of its Detector and the problem’s fields', async () => {
    const recorder = recorderWithSteps(2);
    const { runner } = fakeRunner(
      [detector('cut_off_text', async () => [problem('total', 2, { screenshot: 'seen' })])],
      recorder,
    );
    expect(await runner.observe(recorder.last!)).toBeNull();
    expect(runner.findings).toEqual([
      { type: 'cut_off_text', stepN: 2, title: 'title total', evidence: 'evidence total', screenshot: 'seen' },
    ]);
  });

  it('records a distinct problem once per Run: de-duplicated by type and key', async () => {
    const recorder = recorderWithSteps(3);
    const { runner } = fakeRunner(
      [
        detector('unannounced_error', async (ctx) => [problem('card-error', ctx.current.step.n)]),
        // Same key, different type: a separate problem.
        detector('untranslated', async (ctx) => [problem('card-error', ctx.current.step.n)]),
        // Duplicate inside one answer.
        detector('misclick', async () => [problem('a', 1), problem('a', 2), problem('b', 3)]),
      ],
      recorder,
    );
    for (const step of recorder.steps) await runner.observe(step);

    expect(runner.findings.map((f) => `${f.type}:${f.stepN}`)).toEqual([
      'unannounced_error:1',
      'untranslated:1',
      'misclick:1',
      'misclick:3',
    ]);
    expect(runner.findingCounts).toEqual({ unannounced_error: 1, untranslated: 1, misclick: 2 });
  });

  it('returns a copy of findingCounts and leaves out types with no Finding', async () => {
    const recorder = recorderWithSteps(1);
    const { runner } = fakeRunner([detector('misclick', async () => [problem('a', 1)])], recorder);
    expect(runner.findingCounts).toEqual({});
    await runner.observe(recorder.last!);
    const counts = runner.findingCounts as Record<string, number>;
    counts.misclick = 99;
    expect(runner.findingCounts).toEqual({ misclick: 1 });
  });

  it('reports a Detector that throws, names it, and does not run the Detectors after it', async () => {
    const recorder = recorderWithSteps(1);
    const after = vi.fn(async () => []);
    const { runner } = fakeRunner(
      [
        detector('unlabeled_button', async () => [problem('kept', 1)]),
        detector('focus_trap', async () => {
          throw new Error('kaboom');
        }),
        detector('misclick', after),
      ],
      recorder,
    );
    const failure = await runner.observe(recorder.last!);
    expect(failure).toEqual({ detector: 'focus_trap', message: 'kaboom', thought: 'focus_trap failed: kaboom' });
    expect(after).not.toHaveBeenCalled();
    // What an earlier Detector found before the failure is kept.
    expect(runner.findings.map((f) => f.type)).toEqual(['unlabeled_button']);
  });

  it('reports a non-Error throw as text', async () => {
    const recorder = recorderWithSteps(1);
    const { runner } = fakeRunner(
      [
        detector('slow_wait', async () => {
          throw 'plain text';
        }),
      ],
      recorder,
    );
    const failure = await runner.observe(recorder.last!);
    expect(failure?.thought).toBe('slow_wait failed: plain text');
  });

  it('reports a problem for an unrecorded Step as a failure and records none of that answer', async () => {
    const recorder = recorderWithSteps(2);
    const { runner } = fakeRunner(
      [detector('misclick', async () => [problem('fine', 2), problem('future', 3)])],
      recorder,
    );
    const failure = await runner.observe(recorder.last!);
    expect(failure?.detector).toBe('misclick');
    expect(failure?.message).toMatch(/Step 3.*only Steps 1 to 2/);
    expect(runner.findings).toHaveLength(0);
  });

  it('reads the Steps from the recorder each time, so Steps added later are valid', async () => {
    const recorder = recorderWithSteps(1);
    const { runner } = fakeRunner([detector('misclick', async () => [problem('later', 2)])], recorder);
    expect((await runner.observe(recorder.last!))?.detector).toBe('misclick');
    recorder.add(actionResult('step 2'), 'thought 2');
    expect(await runner.observe(recorder.last!)).toBeNull();
    expect(runner.findings).toHaveLength(1);
  });

  it('runs finish() for Detectors that have one, on the last Step, and de-duplicates with observe()', async () => {
    const recorder = recorderWithSteps(2);
    let finishCurrent: RecordedStep | undefined;
    const { runner } = fakeRunner(
      [
        detector(
          'cut_off_text',
          async () => [problem('total', 1)],
          async (ctx) => {
            finishCurrent = ctx.current;
            return [problem('total', 2), problem('end-only', 2)];
          },
        ),
        detector('misclick', async () => []),
      ],
      recorder,
    );
    await runner.observe(recorder.steps[0]!);
    expect(await runner.finish()).toBeNull();
    expect(finishCurrent).toBe(recorder.last);
    expect(runner.findings.map((f) => f.evidence)).toEqual(['evidence total', 'evidence end-only']);
  });

  it('reports a failure from finish(), and does nothing when no Step was recorded', async () => {
    const empty = recorderWithSteps(0);
    const noStepFinish = vi.fn(async () => []);
    expect(await fakeRunner([detector('misclick', async () => [], noStepFinish)], empty).runner.finish()).toBeNull();
    expect(noStepFinish).not.toHaveBeenCalled();

    const recorder = recorderWithSteps(1);
    const { runner } = fakeRunner(
      [
        detector(
          'cut_off_text',
          async () => [],
          async () => {
            throw new Error('end failed');
          },
        ),
      ],
      recorder,
    );
    expect((await runner.finish())?.thought).toBe('cut_off_text failed: end failed');
  });
});

/** The page state a pure Detector must leave alone. */
interface PageState {
  mutations: number;
  activeElement: string | null;
  scrollX: number;
  scrollY: number;
  boxScrollTop: number;
  cardValue: string;
  noteValue: string;
  agreeChecked: boolean;
  title: string;
}

interface AxNode {
  role?: { value?: string };
  ignored?: boolean;
  backendDOMNodeId?: number;
}

describe('Detector purity on a real page in Chromium', () => {
  let server: FixtureServer;
  let browser: Browser;
  let context: BrowserContext;
  let page: Page;
  let session: CDPSession;
  let baseline: PageState;
  const sent: string[] = [];

  const readState = (): Promise<PageState> =>
    page.evaluate(() => (window as unknown as { __state(): PageState }).__state());

  beforeAll(async () => {
    server = await startFixtureServer();
    browser = await chromium.launch();
    context = await browser.newContext({ viewport: { width: 800, height: 600 } });
    page = await context.newPage();
    session = await context.newCDPSession(page);
    await page.goto(server.url('/detector-purity.html'));
    await page.waitForFunction(() => (window as unknown as { __watching?: boolean }).__watching === true);
    baseline = await readState();
  }, 60_000);

  afterAll(async () => {
    await context?.close();
    await browser?.close();
    await server?.close();
  });

  /** A sample Detector that reads the page every way a Detector is allowed to. */
  function sampleDetector(): { detector: Detector; reads: unknown[] } {
    const reads: unknown[] = [];
    const sample = detector('unlabeled_button', async (ctx) => {
      const dom = await ctx.inspect<{ buttons: number; width: number; focusedId: string; text: string }>(
        `(tag) => {
          const el = document.querySelector(tag);
          const rect = el.getBoundingClientRect();
          const style = getComputedStyle(el);
          return {
            buttons: document.querySelectorAll(tag).length,
            width: rect.width + parseFloat(style.borderTopWidth),
            focusedId: document.activeElement ? document.activeElement.id : '',
            text: document.body.innerText.slice(0, 20),
          };
        }`,
        'button',
      );
      const tree = await ctx.cdp.send<{ nodes: AxNode[] }>('Accessibility.getFullAXTree');
      const button = tree.nodes.find((n) => n.role?.value === 'button' && !n.ignored && n.backendDOMNodeId);
      const described = await ctx.cdp.send<{ node: { nodeName: string } }>('DOM.describeNode', {
        backendNodeId: button!.backendDOMNodeId,
      });
      const box = await ctx.cdp.send<{ model: { border: number[] } }>('DOM.getBoxModel', {
        backendNodeId: button!.backendDOMNodeId,
      });
      reads.push({ dom, node: described.node.nodeName, border: box.model.border.length });
      return [problem('pay-button', ctx.current.step.n)];
    });
    return { detector: sample, reads };
  }

  it('starts from the recognisable state the checks compare against', () => {
    expect(baseline.mutations).toBe(0);
    expect(baseline.activeElement).toBe('note');
    expect(baseline.scrollY).toBeGreaterThan(0);
    expect(baseline.boxScrollTop).toBeGreaterThan(0);
    expect(baseline.cardValue).toBe('4111');
    expect(baseline.noteValue).toBe('some text');
    expect(baseline.agreeChecked).toBe(true);
  });

  it('inspect and the read-only CDP wrapper change nothing on the page', async () => {
    const recorder = recorderWithSteps(1);
    const { detector: sample, reads } = sampleDetector();
    const spy = {
      send: (method: string, params?: object) => {
        sent.push(method);
        return (session as unknown as { send(m: string, p?: object): Promise<unknown> }).send(method, params);
      },
    } as unknown as CdpSender;
    const runner = new DetectorRunner({ detectors: [sample], page, cdp: spy, config, site, recorder });

    for (let i = 0; i < 3; i += 1) expect(await runner.observe(recorder.last!)).toBeNull();

    // The Detector really read the page.
    expect(reads).toHaveLength(3);
    expect(reads[0]).toMatchObject({ dom: { buttons: 1, focusedId: 'note' }, node: 'BUTTON', border: 8 });
    expect(runner.findings).toHaveLength(1);
    expect(sent).toEqual(
      Array.from({ length: 3 }, () => ['Accessibility.getFullAXTree', 'DOM.describeNode', 'DOM.getBoxModel']).flat(),
    );

    const after = await readState();
    expect(after.mutations).toBe(0);
    expect(after.activeElement).toBe(baseline.activeElement);
    expect(after.scrollX).toBe(baseline.scrollX);
    expect(after.scrollY).toBe(baseline.scrollY);
    expect(after.boxScrollTop).toBe(baseline.boxScrollTop);
    expect(after.cardValue).toBe(baseline.cardValue);
    expect(after.noteValue).toBe(baseline.noteValue);
    expect(after.agreeChecked).toBe(baseline.agreeChecked);
    expect(after).toEqual(baseline);
  });

  it('refuses Input.dispatchKeyEvent and Runtime.evaluate, sends nothing, and the page is unchanged', async () => {
    const before = await readState();
    const forwarded: string[] = [];
    const spy = {
      send: (method: string, params?: object) => {
        forwarded.push(method);
        return (session as unknown as { send(m: string, p?: object): Promise<unknown> }).send(method, params);
      },
    } as unknown as CdpSender;
    const cdp = createReadOnlyCdp(spy);

    await expect(
      cdp.send('Input.dispatchKeyEvent' as never, { type: 'keyDown', key: 'x', text: 'x' }),
    ).rejects.toThrow(/not allowed/);
    await expect(
      cdp.send('Runtime.evaluate' as never, {
        expression: "document.title = 'hacked'; document.getElementById('card').value = 'changed'; document.body.append('x')",
      }),
    ).rejects.toThrow(/not allowed/);

    expect(forwarded).toEqual([]);
    const after = await readState();
    expect(after).toEqual(before);
    expect(after.title).toBe('Detector purity');
    expect(after.mutations).toBe(0);
  });

  // Keep this test last: it changes the page on purpose, to show the checks above can fail.
  it('the state checks do notice a real change (they are not vacuous)', async () => {
    const before = await readState();
    await page.evaluate(() => {
      document.getElementById('card')!.focus();
      (document.getElementById('card') as HTMLInputElement).value = 'changed';
      document.getElementById('box')!.scrollTop = 0;
      window.scrollTo(0, 0);
      document.title = 'changed';
    });
    const after = await readState();
    expect(after.mutations).toBeGreaterThan(before.mutations);
    expect(after.activeElement).not.toBe(before.activeElement);
    expect(after.scrollY).not.toBe(before.scrollY);
    expect(after.boxScrollTop).not.toBe(before.boxScrollTop);
    expect(after.cardValue).not.toBe(before.cardValue);
  });
});
