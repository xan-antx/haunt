import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { JUMP_DIRS, JUMP_TARGETS, LISTENER_KEYS } from '../src/mind/ai/tools.ts';
import type { ToolCall } from '../src/mind/ai/tools.ts';
import { FakeDetectors, makeDriver } from './helpers/aiFakes.ts';

/**
 * Feature: listener-ai-mind, Property 7: Detectors alone decide findings
 * **Validates: Requirements 4.1, 4.3, 4.4, 4.5**
 */
const RUNS = { numRuns: 100 };

/** A call shape without free text: texts are filled in per variant. */
type Shape =
  | { kind: 'read_page' }
  | { kind: 'read_announcements' }
  | { kind: 'press_key'; key: (typeof LISTENER_KEYS)[number] }
  | { kind: 'type_text' }
  | { kind: 'jump'; to: (typeof JUMP_TARGETS)[number]; dir: (typeof JUMP_DIRS)[number] }
  | { kind: 'think' };

const shape: fc.Arbitrary<Shape> = fc.oneof(
  fc.constant({ kind: 'read_page' } as const),
  fc.constant({ kind: 'read_announcements' } as const),
  fc.record({ kind: fc.constant('press_key' as const), key: fc.constantFrom(...LISTENER_KEYS) }),
  fc.constant({ kind: 'type_text' } as const),
  fc.record({ kind: fc.constant('jump' as const), to: fc.constantFrom(...JUMP_TARGETS), dir: fc.constantFrom(...JUMP_DIRS) }),
  fc.constant({ kind: 'think' } as const),
);

function toCall(s: Shape, text: string): ToolCall {
  switch (s.kind) {
    case 'press_key':
      return { name: 'press_key', key: s.key };
    case 'type_text':
      return { name: 'type_text', text };
    case 'jump':
      return { name: 'jump', to: s.to, dir: s.dir };
    case 'think':
      return { name: 'think', text };
    default:
      return { name: s.kind };
  }
}

async function play(shapes: Shape[], text: string) {
  const detectors = new FakeDetectors({ findWhen: (step) => step.step.action === 'Press Enter' });
  const { driver } = makeDriver({ detectors });
  await driver.start();
  for (const s of shapes) await driver.handle(toCall(s, text));
  return detectors.findings;
}

/** The oracle: a finding for every Enter key press, at the Step it became (Step 1 is the page opening). */
function expected(shapes: Shape[]): { stepN: number; key: string }[] {
  const out: { stepN: number; key: string }[] = [];
  let n = 1;
  for (const s of shapes) {
    if (s.kind === 'press_key' || s.kind === 'type_text' || s.kind === 'jump') {
      n += 1;
      if (s.kind === 'press_key' && s.key === 'Enter') out.push({ stepN: n, key: 'Press Enter' });
    }
  }
  return out;
}

describe('Feature: listener-ai-mind, Property 7: Detectors alone decide findings', () => {
  it('records exactly what the detectors report, whatever the think and type_text texts say', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(shape, { maxLength: 30 }),
        fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim() !== ''),
        fc.string({ minLength: 1, maxLength: 40 }).filter((s) => s.trim() !== ''),
        async (shapes, textA, textB) => {
          const a = await play(shapes, textA);
          const b = await play(shapes, textB);
          expect(a).toEqual(expected(shapes));
          expect(b).toEqual(a);
        },
      ),
      RUNS,
    );
  });

  it('lets the agent claim a problem or deny one without changing the findings', async () => {
    const shapes: Shape[] = [{ kind: 'press_key', key: 'Tab' }, { kind: 'think' }, { kind: 'press_key', key: 'Enter' }];
    const quiet = await play(shapes, 'Everything is fine and nothing is wrong.');
    const loud = await play(shapes, 'This button has no label and there is a focus trap!');
    expect(loud).toEqual(quiet);
    expect(quiet).toEqual([{ stepN: 3, key: 'Press Enter' }]);
  });
});
