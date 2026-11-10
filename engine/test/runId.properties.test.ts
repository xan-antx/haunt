import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { folderExistsIn, formatRunId, makeRunId } from '../src/core/runId.ts';

/**
 * Feature: haunt-engine, Property 8: Run_Ids are well-formed and unique
 * **Validates: Requirements 2.3, 2.4**
 */

const RUNS = { numRuns: 100 };

const RUN_ID_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{4}Z-(listener|phantom|bebe)-[a-z0-9]+(-[a-z0-9]+)*$/;

// Oracle for the date part, written from the requirement text: UTC, minute precision.
function expectedPrefix(date: Date): string {
  const iso = date.toISOString(); // YYYY-MM-DDTHH:mm:ss.sssZ
  return `${iso.slice(0, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}Z`;
}

// Four-digit years only, so the Run_Id date part is always YYYY.
// Built from integer epoch milliseconds so the generator can never yield an invalid Date.
const dateArb = fc
  .integer({
    min: Date.parse('1970-01-01T00:00:00Z'),
    max: Date.parse('9999-12-31T23:59:59Z'),
  })
  .map((ms) => new Date(ms));
const ghostArb = fc.constantFrom('listener', 'phantom', 'bebe');
const missionArb = fc
  .array(fc.stringMatching(/^[a-z0-9]{1,8}$/), { minLength: 1, maxLength: 4 })
  .map((words) => words.join('-'));

// Folder names already taken: some of base, base-2 ... base-9 (so collisions are common),
// plus unrelated names that must never matter.
const takenArb = (base: string) =>
  fc
    .record({
      suffixes: fc.array(fc.boolean(), { minLength: 9, maxLength: 9 }),
      noise: fc.array(fc.stringMatching(/^[a-z0-9-]{1,20}$/), { maxLength: 5 }),
    })
    .map(({ suffixes, noise }) => {
      // suffixes[0] -> base, suffixes[i] -> base-(i+1)
      const taken = new Set<string>(noise);
      suffixes.forEach((on, i) => {
        if (on) taken.add(i === 0 ? base : `${base}-${i + 1}`);
      });
      return taken;
    });

const caseArb = fc
  .record({ startedAt: dateArb, ghost: ghostArb, mission: missionArb })
  .chain((c) =>
    takenArb(formatRunId(c.startedAt, c.ghost, c.mission)).map((taken) => ({ ...c, taken })),
  );

describe('Feature: haunt-engine, Property 8: Run_Ids are well-formed and unique', () => {
  it('every Run_Id matches the format and is not already taken', () => {
    fc.assert(
      fc.property(caseArb, ({ startedAt, ghost, mission, taken }) => {
        const id = makeRunId(startedAt, ghost, mission, (name) => taken.has(name));
        expect(id).toMatch(RUN_ID_PATTERN);
        expect(taken.has(id)).toBe(false);
        expect(id.startsWith(`${expectedPrefix(startedAt)}-${ghost}-${mission}`)).toBe(true);
      }),
      RUNS,
    );
  });

  it('without a collision the id is exactly <UTC date/time>-<ghost>-<mission>', () => {
    fc.assert(
      fc.property(dateArb, ghostArb, missionArb, (startedAt, ghost, mission) => {
        const id = makeRunId(startedAt, ghost, mission, () => false);
        expect(id).toBe(`${expectedPrefix(startedAt)}-${ghost}-${mission}`);
      }),
      RUNS,
    );
  });

  it('a collision gets the first free suffix -2, -3, ...', () => {
    fc.assert(
      fc.property(caseArb, ({ startedAt, ghost, mission, taken }) => {
        const base = `${expectedPrefix(startedAt)}-${ghost}-${mission}`;
        const id = makeRunId(startedAt, ghost, mission, (name) => taken.has(name));
        if (!taken.has(base)) {
          expect(id).toBe(base);
          return;
        }
        let n = 2;
        while (taken.has(`${base}-${n}`)) n++;
        expect(id).toBe(`${base}-${n}`);
      }),
      RUNS,
    );
  });

  it('allocating N ids in the same minute gives N distinct ids', () => {
    fc.assert(
      fc.property(
        dateArb,
        ghostArb,
        missionArb,
        fc.array(fc.integer({ min: 0, max: 59_999 }), { minLength: 1, maxLength: 12 }),
        fc.integer({ min: 0, max: 3 }),
        (date, ghost, mission, offsets, preexisting) => {
          const minuteStart = Math.floor(date.getTime() / 60_000) * 60_000;
          const base = formatRunId(new Date(minuteStart), ghost, mission);
          const taken = new Set<string>();
          for (let i = 0; i < preexisting; i++) taken.add(i === 0 ? base : `${base}-${i + 1}`);
          const initial = taken.size;

          const ids: string[] = [];
          for (const offset of offsets) {
            const id = makeRunId(new Date(minuteStart + offset), ghost, mission, (name) =>
              taken.has(name),
            );
            expect(id).toMatch(RUN_ID_PATTERN);
            ids.push(id);
            taken.add(id); // the run folder now exists
          }
          expect(new Set(ids).size).toBe(offsets.length);
          expect(taken.size).toBe(initial + offsets.length);
        },
      ),
      RUNS,
    );
  });

  it('folderExistsIn sees folders on disk, so suffixes work with real Run_Folders', () => {
    const site = mkdtempSync(path.join(tmpdir(), 'haunt-runid-'));
    try {
      const startedAt = new Date('2026-11-10T15:30:45Z');
      const exists = folderExistsIn(site);
      const first = makeRunId(startedAt, 'listener', 'pay-bill', exists);
      expect(first).toBe('2026-11-10T1530Z-listener-pay-bill');
      mkdirSync(path.join(site, first));
      const second = makeRunId(startedAt, 'listener', 'pay-bill', exists);
      expect(second).toBe('2026-11-10T1530Z-listener-pay-bill-2');
      mkdirSync(path.join(site, second));
      expect(makeRunId(startedAt, 'listener', 'pay-bill', exists)).toBe(
        '2026-11-10T1530Z-listener-pay-bill-3',
      );
    } finally {
      rmSync(site, { recursive: true, force: true });
    }
  });
});
