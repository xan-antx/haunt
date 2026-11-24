import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { MindKind, Run } from '../data/types';
import { originalSiteRuns } from '../model/fixedCopy';
import { latestPerMind, realWorldRuns, withoutRealWorld } from '../model/realWorld';
import { screenDestinations } from '../model/screens';
import { buildTour } from '../model/tour';
import { bebeRun, listenerRun } from './fixtures/samples';

/** A Memos run made from the Listener sample, with its own key, mind and start time. */
function memosRun(index: number, mind: MindKind, startedAt: string): Run {
  const run = structuredClone(listenerRun());
  run.key = `memos-run-${index}`;
  run.folder = `memos/run-${index}`;
  run.site = { ...run.site, name: 'Memos' };
  run.mind = mind;
  run.startedAt = startedAt;
  return run;
}

const memosSpec = fc.record({
  mind: fc.constantFrom<MindKind>('scripted', 'ai'),
  minutes: fc.integer({ min: 0, max: 100_000 }),
});

function memosRuns(specs: { mind: MindKind; minutes: number }[]): Run[] {
  const used = new Set<number>();
  const runs: Run[] = [];
  specs.forEach((spec, i) => {
    if (used.has(spec.minutes)) return; // keep start times distinct, so "newest" is clear
    used.add(spec.minutes);
    runs.push(memosRun(i, spec.mind, new Date(Date.UTC(2026, 0, 1) + spec.minutes * 60_000).toISOString()));
  });
  return runs;
}

const lantern = (): Run[] => [listenerRun(), bebeRun()];

describe('Feature: memos-real-world-haunt, Property 14: Home, the tour and the Ghost Cam link ignore real-world runs', () => {
  it('gives the same Home runs, tour and screen links with or without Memos runs', () => {
    fc.assert(
      fc.property(fc.array(memosSpec, { maxLength: 6 }), (specs) => {
        const memos = memosRuns(specs);
        const base = lantern();
        const mixed = [...memos.slice(0, 2), ...base, ...memos.slice(2)];
        expect(originalSiteRuns(mixed).map((r) => r.key)).toEqual(originalSiteRuns(base).map((r) => r.key));
        expect(withoutRealWorld(mixed).map((r) => r.key)).toEqual(base.map((r) => r.key));
        expect(realWorldRuns(mixed)).toHaveLength(memos.length);
        expect(screenDestinations(mixed)).toEqual(screenDestinations(base));
        expect(buildTour(mixed)).toEqual(buildTour(base));
      }),
      { numRuns: 100 },
    );
  });
});

describe('Feature: memos-real-world-haunt, Property 15: The real-world screen shows the newest run for each mind', () => {
  it('returns the newest Memos run of each mind, scripted first, and ignores other sites', () => {
    fc.assert(
      fc.property(fc.array(memosSpec, { maxLength: 8 }), (specs) => {
        const memos = memosRuns(specs);
        const shown = latestPerMind([...lantern(), ...memos]);
        expect(shown.length).toBeLessThanOrEqual(2);
        for (const mind of ['scripted', 'ai'] as const) {
          const mine = memos.filter((r) => r.mind === mind);
          const card = shown.find((r) => r.mind === mind);
          if (mine.length === 0) {
            expect(card).toBeUndefined();
          } else {
            const newest = [...mine].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))[0]!;
            expect(card?.key).toBe(newest.key);
          }
        }
        expect(shown.map((r) => r.mind)).toEqual(shown.map((r) => r.mind).sort((a) => (a === 'scripted' ? -1 : 1)));
      }),
      { numRuns: 100 },
    );
  });
});
