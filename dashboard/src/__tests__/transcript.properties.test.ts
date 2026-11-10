import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { Run } from '../data/types';
import { validateRun } from '../data/validate';
import { buildTranscript, fadeLevel, NOTHING_SPOKEN, nothingThought } from '../model/transcript';
import { COLORS, contrastRatio, TRANSCRIPT_FADES } from '../styles/tokens';
import { contractRunArb } from './arbitraries';

const toRun = (json: unknown): Run => {
  const loaded = validateRun(json, { key: 'k', folder: 'k', origin: 'runs' });
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.errors));
  return loaded.run;
};

// Empty, whitespace-only and a small shared pool (so values repeat across steps), plus free text.
const stepTextArb = fc.oneof(
  fc.constantFrom('', '   ', '\t\n ', 'Button, Pay now', 'Link, Home', 'Where is the bill?'),
  fc.string({ maxLength: 30 }),
);

type Json = { ghost: string; steps: Array<Record<string, unknown>> };

const runAndIndexArb = contractRunArb.chain((json) => {
  const j = json as unknown as Json;
  return fc
    .tuple(
      fc.array(fc.tuple(stepTextArb, stepTextArb), { minLength: j.steps.length, maxLength: j.steps.length }),
      fc.integer({ min: 0, max: j.steps.length - 1 }),
    )
    .map(([texts, index]) => {
      const steps = j.steps.map((s, i) => ({ ...s, spoken: texts[i]![0], thought: texts[i]![1] }));
      return { run: toRun({ ...json, steps }), index };
    });
});

describe('Feature: haunt-dashboard, Property 9: Transcript has exactly one line per step up to the current step', () => {
  it('returns one line per step through the current step, in order, with the right text', () => {
    fc.assert(
      fc.property(runAndIndexArb, ({ run, index }) => {
        const current = run.steps[index]!;
        const lines = buildTranscript(run, current.n);
        const listener = run.ghost === 'listener';

        expect(lines).toHaveLength(index + 1);
        expect(lines.filter((l) => l.current)).toHaveLength(1);
        expect(lines[lines.length - 1]!.current).toBe(true);
        expect(lines[lines.length - 1]!.n).toBe(current.n);

        lines.forEach((line, i) => {
          const step = run.steps[i]!;
          expect(line.n).toBe(step.n);
          if (i > 0) expect(line.n).toBeGreaterThan(lines[i - 1]!.n);
          const raw = listener ? step.spoken : step.thought;
          if (raw.trim() === '') {
            expect(line.empty).toBe(true);
            expect(line.text).toBe(listener ? NOTHING_SPOKEN : nothingThought(run.ghost));
          } else {
            expect(line.empty).toBe(false);
            expect(line.text).toBe(raw);
          }
        });
      }),
      { numRuns: 200 },
    );
  });
});

// **Validates: Requirements 10.19, 18.5**
describe('Feature: haunt-dashboard, Property 10: Transcript fading is monotonic and stays readable', () => {
  it('contrast never drops from one line to the next, peaks on the Current_Line and stays at least 4.5:1', () => {
    fc.assert(
      fc.property(runAndIndexArb, ({ run, index }) => {
        const lines = buildTranscript(run, run.steps[index]!.n);
        // Spoken panel for The Listener, thought panel for The Phantom and Bebe.
        const panel = run.ghost === 'listener' ? TRANSCRIPT_FADES.spoken : TRANSCRIPT_FADES.thought;
        const bg = COLORS[panel.bg];
        const ratios = lines.map((line) => contrastRatio(COLORS[panel.levels[line.fade]], bg));

        const currentIndex = lines.findIndex((l) => l.current);
        expect(currentIndex).toBe(lines.length - 1);

        ratios.forEach((ratio, i) => {
          expect(ratio).toBeGreaterThanOrEqual(4.5);
          // No line has higher contrast than any line after it.
          for (let j = i + 1; j < ratios.length; j++) expect(ratio).toBeLessThanOrEqual(ratios[j]!);
          // The Current_Line is strictly the most prominent.
          if (i !== currentIndex) expect(ratio).toBeLessThan(ratios[currentIndex]!);
        });
      }),
      { numRuns: 200 },
    );
  });

  it('fadeLevel never increases as the distance to the Current_Line shrinks, and is 0 only at distance 0', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 200 }), fc.integer({ min: 0, max: 200 }), (a, b) => {
        const [near, far] = a <= b ? [a, b] : [b, a];
        expect(fadeLevel(near)).toBeLessThanOrEqual(fadeLevel(far));
        expect(fadeLevel(a) === 0).toBe(a === 0);
        expect(fadeLevel(a)).toBe(Math.min(3, a));
      }),
      { numRuns: 200 },
    );
  });
});
