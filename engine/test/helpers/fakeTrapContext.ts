import type { Detector, DetectorContext, DetectedProblem, RecordedStep } from '../../src/core/types.ts';
import type { RawAxNode } from '../../src/ghosts/listener/ax.ts';

/** One Step of a generated history. */
export interface FakeStep {
  /** Key presses of the Step: the key and the focus and dialog keys after it. */
  keys: { key: string; focusKey: string | null; dialogKey: string | null }[];
  /** Where focus is after the Step. */
  focus: { focusKey: string | null; dialogKey: string | null };
  announcements?: string[];
}

export interface FakeOptions {
  /** What the dialog read answers. Only used by the dialog part. */
  dialog?: (arg: { dialogKey: string; reached: string[]; describe: string[] }) => unknown;
  /** Role of a focused text box and its Computed_Name, for the accessibility tree read. */
  textbox?: { role: string; name: string };
  escapeText?: boolean;
}

function recordedStep(n: number, step: FakeStep): RecordedStep {
  return {
    step: { n, page: '/', action: `Step ${n}`, spoken: '', thought: '', screenshot: `shots/${String(n).padStart(3, '0')}.png`, waitMs: 0 },
    trace: {
      pathBefore: '/',
      pathAfter: '/',
      keys: step.keys,
      touchedKeys: [],
      actionEndedAt: 0,
      readyAt: 0,
      waits: [],
      announcements: step.announcements ?? [],
    },
    probe: { at: 0 },
  };
}

/**
 * Feeds a Detector the history one Step at a time, as the run loop would, with a fake `inspect` and a fake
 * read-only CDP. Returns what `observe` returned at each Step and what `finish` returned at the end.
 */
export async function playHistory(
  detector: Detector,
  steps: readonly FakeStep[],
  options: FakeOptions = {},
): Promise<{ observed: DetectedProblem[][]; finished: DetectedProblem[] }> {
  const recorded: RecordedStep[] = [];
  let current = 0;

  const inspect = async (script: string, arg?: unknown): Promise<unknown> => {
    const focus = steps[current - 1]?.focus ?? { focusKey: null, dialogKey: null };
    if (script.includes('escapeText')) {
      return { present: true, textbox: true, role: 'textbox', escapeText: options.escapeText ?? false };
    }
    if (script.includes("return role === 'textbox'")) return options.textbox !== undefined;
    if (script.includes('unreached')) {
      const dialog = options.dialog;
      if (!dialog) return { open: false, focusInside: false, dialogName: null, described: [], unreached: [] };
      return dialog(arg as { dialogKey: string; reached: string[]; describe: string[] });
    }
    if (script.includes('keys.focus()')) return { doc: 'doc', focus };
    throw new Error(`unexpected inspect script: ${script.slice(0, 60)}`);
  };

  const cdp = {
    async send(method: string): Promise<unknown> {
      if (method !== 'Accessibility.getFullAXTree') throw new Error(`unexpected CDP method ${method}`);
      const box = options.textbox ?? { role: 'textbox', name: '' };
      const nodes: RawAxNode[] = [
        {
          nodeId: '1',
          role: { type: 'role', value: box.role },
          name: { type: 'computedString', value: box.name },
          properties: [{ name: 'focused', value: { type: 'booleanOrUndefined', value: true } }],
          backendDOMNodeId: 7,
        },
      ];
      return { nodes };
    },
  };

  const context = (): DetectorContext =>
    ({
      inspect,
      cdp,
      steps: recorded,
      current: recorded[recorded.length - 1]!,
      config: { allowedDomains: [], sites: {} },
      site: { name: 'Fake', allowedTerms: [] },
    }) as unknown as DetectorContext;

  const observed: DetectedProblem[][] = [];
  for (const step of steps) {
    current += 1;
    recorded.push(recordedStep(current, step));
    observed.push(await detector.observe(context()));
  }
  const finished = recorded.length === 0 ? [] : ((await detector.finish?.(context())) ?? []);
  return { observed, finished };
}
