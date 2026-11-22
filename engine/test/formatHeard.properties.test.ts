import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Heard, HeardNode } from '../src/ghosts/listener/ax.ts';
import { formatHeard } from '../src/mind/ai/tools.ts';

/**
 * Feature: listener-ai-mind, Property 2: Page view keeps what the Listener hears
 * **Validates: Requirements 1.6**
 */
const RUNS = { numRuns: 100 };

const text = fc.string({ maxLength: 30 });

const nodeArb: fc.Arbitrary<HeardNode> = fc.record(
  {
    ref: fc.nat({ max: 99999 }).map((n) => `ax-${n}`),
    role: fc.constantFrom('button', 'heading', 'textbox', 'link', 'main', 'dialog', 'checkbox'),
    name: text,
    description: text,
    value: text,
    states: fc.record(
      {
        focused: fc.constant(true as const),
        checked: fc.constantFrom(true, false, 'mixed' as const),
        expanded: fc.boolean(),
        disabled: fc.constant(true as const),
        required: fc.constant(true as const),
        invalid: fc.constant(true as const),
        modal: fc.constant(true as const),
        busy: fc.constant(true as const),
      },
      { requiredKeys: [] },
    ),
    level: fc.integer({ min: 1, max: 6 }),
    depth: fc.nat({ max: 5 }),
  },
  { requiredKeys: ['ref', 'role', 'name', 'description', 'value', 'states', 'depth'] },
);

const heardArb: fc.Arbitrary<Heard> = fc.record({
  title: text,
  path: fc.string({ maxLength: 20 }).map((s) => `/${s}`),
  nodes: fc.array(nodeArb, { maxLength: 12 }),
  focus: fc.constant(null),
  dialog: fc.constant(null),
  region: fc.constant(null),
  readingPosition: fc.constant(null),
  announcements: fc.array(text, { maxLength: 3 }),
});

describe('Feature: listener-ai-mind, Property 2: Page view keeps what the Listener hears', () => {
  it('contains the title, the path, and the ref, role and name of every node', () => {
    fc.assert(
      fc.property(heardArb, (heard) => {
        const view = formatHeard(heard);
        expect(view).toContain(heard.title);
        expect(view).toContain(heard.path);
        for (const node of heard.nodes) {
          expect(view).toContain(node.ref);
          expect(view).toContain(node.role);
          expect(view).toContain(node.name);
        }
      }),
      RUNS,
    );
  });

  it('keeps one line per node, in document order', () => {
    fc.assert(
      fc.property(heardArb, (heard) => {
        const view = formatHeard(heard);
        let from = view.indexOf('Nodes:');
        for (const node of heard.nodes) {
          const at = view.indexOf(node.ref, from);
          expect(at).toBeGreaterThanOrEqual(0);
          from = at;
        }
      }),
      RUNS,
    );
  });
});
