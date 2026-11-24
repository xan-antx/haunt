import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { RawAxNode } from '../src/ghosts/listener/ax.ts';
import { createUnlabeledFieldDetector, FIELD_AX_ROLES, selectUnnamedFields } from '../src/detectors/unlabeledField.ts';
import type { DetectorContext, RecordedStep } from '../src/core/types.ts';

const ROLES = [...FIELD_AX_ROLES, 'button', 'link', 'heading', 'generic', 'StaticText', 'group', 'InlineTextBox'];

const names = fc.oneof(
  fc.constant(''),
  fc.constant('   '),
  fc.constant('\t\n '),
  fc.string({ maxLength: 12 }),
  fc.constantFrom('Email', 'Search', 'Any thoughts...'),
);

interface Spec {
  role: string;
  ignored: boolean;
  name: string;
  placeholder: string;
  ariaPlaceholder: string;
}

const spec: fc.Arbitrary<Spec> = fc.record({
  role: fc.constantFrom(...ROLES),
  ignored: fc.boolean(),
  name: names,
  placeholder: fc.string({ maxLength: 10 }),
  ariaPlaceholder: fc.string({ maxLength: 10 }),
});

function toNodes(specs: Spec[], withPlaceholders: boolean): RawAxNode[] {
  return specs.map((s, i) => ({
    nodeId: String(i + 1),
    ignored: s.ignored,
    role: { type: 'role', value: s.role },
    name: { type: 'computedString', value: s.name },
    backendDOMNodeId: 100 + i,
    properties: withPlaceholders
      ? [
          { name: 'placeholder', value: { type: 'string', value: s.placeholder } },
          { name: 'ariaPlaceholder', value: { type: 'string', value: s.ariaPlaceholder } },
        ]
      : [],
  }));
}

describe('Feature: memos-real-world-haunt, Property 8: Only the Computed_Name decides which nodes are unlabeled', () => {
  it('returns exactly the unignored field nodes with an empty trimmed name, in tree order', () => {
    fc.assert(
      fc.property(fc.array(spec, { maxLength: 25 }), (specs) => {
        const expected = specs
          .map((s, i) => ({ s, ref: `ax-${100 + i}` }))
          .filter(({ s }) => !s.ignored && FIELD_AX_ROLES.includes(s.role) && s.name.trim() === '')
          .map(({ ref }) => ref);
        const actual = selectUnnamedFields(toNodes(specs, true)).map((n) => n.ref);
        expect(actual).toEqual(expected);
      }),
      { numRuns: 100 },
    );
  });

  it('gives the same result whatever placeholder data the page reports', () => {
    fc.assert(
      fc.property(fc.array(spec, { maxLength: 25 }), (specs) => {
        expect(selectUnnamedFields(toNodes(specs, true)).map((n) => n.ref)).toEqual(
          selectUnnamedFields(toNodes(specs, false)).map((n) => n.ref),
        );
      }),
      { numRuns: 100 },
    );
  });

  it('selects an unnamed textbox even when the page reports an aria-placeholder', () => {
    const nodes = toNodes([{ role: 'textbox', ignored: false, name: '', placeholder: '', ariaPlaceholder: 'Any thoughts...' }], true);
    expect(selectUnnamedFields(nodes)).toHaveLength(1);
  });
});

/** What the fake page says about one unnamed field. */
interface FakeField {
  role: string;
  tag: string;
  type: string | null;
  ignored: boolean;
  placeholder: string | null;
  ariaPlaceholder: string | null;
  focusedAtStep: number | null;
}

const fieldArb: fc.Arbitrary<FakeField> = fc.record({
  role: fc.constantFrom('textbox', 'searchbox', 'combobox', 'checkbox'),
  tag: fc.constantFrom('input', 'div', 'textarea', 'select'),
  type: fc.constantFrom(null, 'text', 'email', 'search'),
  ignored: fc.boolean(),
  placeholder: fc.constantFrom(null, 'Search', 'Email'),
  ariaPlaceholder: fc.constantFrom(null, 'Any thoughts...'),
  focusedAtStep: fc.constantFrom(null, 2, 3),
});

/** Runs the detector against a fake CDP and a fake page for `stepCount` Steps, then finishes. */
async function run(fields: FakeField[], stepCount: number, path = '/memos') {
  const nodes: RawAxNode[] = fields.map((f, i) => ({
    nodeId: String(i + 1),
    role: { type: 'role', value: f.role },
    name: { type: 'computedString', value: '' },
    backendDOMNodeId: 500 + i,
  }));
  const cdp = {
    async send(method: string, params?: { backendNodeId: number }): Promise<unknown> {
      if (method === 'Accessibility.getFullAXTree') return { nodes };
      const index = (params?.backendNodeId ?? 0) - 500;
      if (method === 'DOM.describeNode') return { node: { nodeName: fields[index]!.tag.toUpperCase(), attributes: ['data-i', String(index)] } };
      if (method === 'DOM.getBoxModel') return { model: { border: [0, index * 30, 100, index * 30, 100, index * 30 + 20, 0, index * 30 + 20] } };
      throw new Error(`unexpected ${method}`);
    },
  };
  const inspect = async (_script: string, arg?: unknown): Promise<unknown> => {
    const { descriptors } = arg as { descriptors: { backendNodeId: number }[] };
    return {
      doc: 'doc',
      items: descriptors.map((d) => {
        const f = fields[d.backendNodeId - 500]!;
        return {
          key: `k${d.backendNodeId}`,
          tag: f.tag,
          role: f.role,
          type: f.type,
          selector: `${f.tag}#f${d.backendNodeId}`,
          where: 'inside the "Write" form',
          placeholder: f.placeholder,
          ariaPlaceholder: f.ariaPlaceholder,
          ignored: f.ignored ? 'not visible' : null,
        };
      }),
    };
  };
  const recorded: RecordedStep[] = [];
  const detector = createUnlabeledFieldDetector();
  const context = (): DetectorContext =>
    ({ inspect, cdp, steps: recorded, current: recorded[recorded.length - 1]!, config: { allowedDomains: [], sites: {} }, site: { name: 'F', allowedTerms: [] } }) as unknown as DetectorContext;
  for (let n = 1; n <= stepCount; n += 1) {
    const keys = fields.flatMap((f, i) => (f.focusedAtStep === n ? [{ key: 'Tab', focusKey: `k${500 + i}`, dialogKey: null }] : []));
    recorded.push({
      step: { n, page: path, action: `Step ${n}`, spoken: '', thought: '', screenshot: `shots/00${n}.png`, waitMs: 0 },
      trace: { pathBefore: path, pathAfter: path, keys, touchedKeys: [], actionEndedAt: 0, readyAt: 0, waits: [], announcements: [] },
      probe: { at: 0 },
    });
    expect(await detector.observe(context())).toEqual([]);
  }
  return (await detector.finish!(context())) ?? [];
}

describe('Feature: memos-real-world-haunt, Property 9: One finding per unlabeled element', () => {
  it('returns one problem for each unignored unnamed field, however many Steps saw it', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fieldArb, { maxLength: 6 }), fc.integer({ min: 3, max: 5 }), async (fields, stepCount) => {
        const problems = await run(fields, stepCount);
        const expected = fields.map((f, i) => ({ f, key: `doc:k${500 + i}` })).filter(({ f }) => !f.ignored);
        expect(problems.map((p) => p.key)).toEqual(expected.map((e) => e.key));
        expect(new Set(problems.map((p) => p.key)).size).toBe(problems.length);
        problems.forEach((p, i) => {
          expect(p.stepN).toBe(expected[i]!.f.focusedAtStep ?? 1);
          expect(p.title).toBe('Form field has no accessible name');
        });
      }),
      { numRuns: 100 },
    );
  });
});

describe('Feature: memos-real-world-haunt, Property 10: Unlabeled field evidence identifies the element and the missing name', () => {
  it('names the page, tag, type, role and selector, says the computed name is empty, and mentions a placeholder only when there is one', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fieldArb, { minLength: 1, maxLength: 5 }), async (fields) => {
        const problems = await run(fields, 3, '/home');
        const shown = fields.map((f, i) => ({ f, i })).filter(({ f }) => !f.ignored);
        expect(problems).toHaveLength(shown.length);
        problems.forEach((p, k) => {
          const { f, i } = shown[k]!;
          const e = p.evidence;
          expect(e).toContain('On page /home');
          expect(e).toContain(`<${f.tag}`);
          if (f.type !== null) expect(e).toContain(`type="${f.type}"`);
          expect(e).toContain(`role="${f.role}"`);
          expect(e).toContain(`${f.tag}#f${500 + i}`);
          expect(e).toContain('the name that Chromium computes for it is empty');
          expect(e).toContain('a screen reader says only the kind of field');
          const mentioned = e.includes('A placeholder is present');
          expect(mentioned).toBe(f.placeholder !== null || f.ariaPlaceholder !== null);
          if (f.ariaPlaceholder !== null) expect(e).toContain(`aria-placeholder "${f.ariaPlaceholder}") and is not providing a name`);
          if (f.focusedAtStep !== null) expect(e).toContain(`The Listener first focused it at Step ${f.focusedAtStep}.`);
          else expect(e).toContain('was first present at Step 1 and never focused');
        });
      }),
      { numRuns: 100 },
    );
  });
});
