import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { coldSpotSize } from '../model/coldSpots';
import { afterCandidates, compareRuns, findingPage, type ExorciseRow } from '../model/exorcise';
import { FINDING_LABELS } from '../model/findingLabels';
import { reproduceCommand } from '../model/reproduce';
import { answer } from '../model/seance';
import { FINDING_TYPES, GHOST_IDS, type GhostId, type Run } from '../data/types';
import { validateRun } from '../data/validate';
import { QUESTION_IDS } from '../routes';
import { defaultAfter, defaultPair } from '../screens/ExorciseScreen';
import { contractRunArb } from './arbitraries';

const toRun = (json: unknown, key: string): Run => {
  const loaded = validateRun(json, { key, folder: key, origin: 'runs' });
  if (!loaded.ok) throw new Error(JSON.stringify(loaded.errors));
  return loaded.run;
};
const runArb = (key: string) => contractRunArb.map((json) => toRun(json, key));

/**
 * Splits a POSIX shell command into words, honoring single quotes and the '\'' idiom.
 * Characters outside quotes that would start a new command are kept as their own tokens.
 */
function shellWords(command: string): string[] {
  const words: string[] = [];
  let current = '';
  let inWord = false;
  let i = 0;
  while (i < command.length) {
    const ch = command[i]!;
    if (ch === "'") {
      const end = command.indexOf("'", i + 1);
      if (end < 0) throw new Error('unterminated quote');
      current += command.slice(i + 1, end);
      inWord = true;
      i = end + 1;
    } else if (ch === '\\') {
      current += command[i + 1] ?? '';
      inWord = true;
      i += 2;
    } else if (ch === ' ') {
      if (inWord) words.push(current);
      current = '';
      inWord = false;
      i++;
    } else if (';|&<>()$`"*?[]{}~#!\n\t'.includes(ch)) {
      if (inWord) words.push(current);
      words.push(ch);
      current = '';
      inWord = false;
      i++;
    } else {
      current += ch;
      inWord = true;
      i++;
    }
  }
  if (inWord) words.push(current);
  return words;
}

describe('Feature: haunt-dashboard, Property 3: coldSpotSize is monotonic and bounded', () => {
  it('is non-decreasing in waitMs and stays within [24, 96]', () => {
    const wait = fc.double({ min: 0, max: 1e9, noNaN: true });
    fc.assert(
      fc.property(wait, wait, (a, b) => {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        expect(coldSpotSize(lo)).toBeLessThanOrEqual(coldSpotSize(hi));
        expect(coldSpotSize(a)).toBeGreaterThanOrEqual(24);
        expect(coldSpotSize(a)).toBeLessThanOrEqual(96);
      }),
      { numRuns: 1000 },
    );
  });
});

describe('Feature: haunt-dashboard, Property 4: Séance answers cite only real steps', () => {
  it('cites only steps in the run or referenced by a finding, and every step claim has a citation', () => {
    const noStepLines = ['I never got stuck.', 'Nothing got in my way this time, so I have nothing to wish for.'];
    fc.assert(
      fc.property(runArb('r'), fc.constantFrom(...QUESTION_IDS), (run, q) => {
        const allowed = new Set([...run.steps.map((s) => s.n), ...run.findings.map((f) => f.step)]);
        const a = answer(run, q);
        expect(a.paragraphs.length).toBeGreaterThan(0);
        for (const paragraph of a.paragraphs) {
          const cites = paragraph.filter((p) => p.kind === 'cite');
          for (const c of cites) expect(allowed.has(c.step)).toBe(true);
          const plain = paragraph.map((p) => (p.kind === 'text' ? p.text : '')).join('');
          if (cites.length === 0) expect(noStepLines).toContain(plain);
        }
      }),
      { numRuns: 300 },
    );
  });
});

describe('Feature: haunt-dashboard, Property 5: Exorcise rows partition the findings', () => {
  it('uses every before finding and every after finding exactly once', () => {
    const sameMission = fc.tuple(runArb('before'), runArb('after')).map(([b, a]) => {
      a.mission = { ...b.mission };
      a.ghost = b.ghost;
      return [b, a] as const;
    });
    fc.assert(
      fc.property(sameMission, ([before, after]) => {
        const result = compareRuns(before, after);
        if ('error' in result) throw new Error(`unexpected error: ${result.error}`);
        const beforeRows = result.rows.filter((r) => r.before);
        const afterRows = result.rows.filter((r) => r.after);
        expect(beforeRows).toHaveLength(before.findings.length);
        expect(afterRows).toHaveLength(after.findings.length);
        for (const f of before.findings) expect(beforeRows.filter((r) => r.before === f)).toHaveLength(1);
        for (const f of after.findings) expect(afterRows.filter((r) => r.after === f)).toHaveLength(1);
        for (const r of beforeRows) expect(['exorcised', 'not_reached', 'still_haunting']).toContain(r.status);
        for (const r of afterRows) expect(['still_haunting', 'new_haunting']).toContain(r.status);
      }),
      { numRuns: 300 },
    );
  });
});

describe('Feature: haunt-dashboard, Property 7: every finding type has labels', () => {
  it('has a non-empty label and helped text for every FindingType', () => {
    fc.assert(
      fc.property(fc.constantFrom(...FINDING_TYPES), (type) => {
        expect(FINDING_LABELS[type].label.trim()).not.toBe('');
        expect(FINDING_LABELS[type].helped.trim()).not.toBe('');
      }),
    );
  });
});

describe('Feature: haunt-dashboard, Property 8: reproduceCommand keeps values inside their quotes', () => {
  it('contains commit, ghost, mission id and URL as whole shell words', () => {
    const nasty = fc.string({
      unit: fc.constantFrom(..."abc019 '\"$`;&|\\/:.-_*?!#~(){}<>"),
      minLength: 1,
      maxLength: 20,
    });
    fc.assert(
      fc.property(runArb('r'), nasty, nasty, nasty, (run, commit, missionId, url) => {
        run.site = { ...run.site, commit, url };
        run.mission = { ...run.mission, id: missionId };
        const words = shellWords(reproduceCommand(run));
        expect(words).toEqual([
          'git', 'checkout', commit, '&', '&',
          'npx', 'haunt', 'run', '--ghost', run.ghost, '--mission', missionId, '--url', url,
        ]);
      }),
      { numRuns: 500 },
    );
  });
});

describe('Feature: exorcise-different-ghost-fix, Property 1: Exorcise only pairs runs by the same ghost on the same mission', () => {
  /**
   * Bug condition: same mission.id, different ghost, different key.
   * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7**
   */

  // Small pools so collisions (same ghost, same mission, ties in startedAt) are common.
  const runsArb = fc
    .array(
      fc.record({
        run: runArb('x'),
        ghost: fc.constantFrom<GhostId>(...GHOST_IDS),
        missionId: fc.constantFrom('pay-bill', 'autopay'),
        startedAt: fc.date({ min: new Date('2026-01-01T00:00:00Z'), max: new Date('2026-12-31T00:00:00Z'), noInvalidDate: true }),
      }),
      { minLength: 1, maxLength: 8 },
    )
    .map((items) =>
      items.map(({ run, ghost, missionId, startedAt }, i): Run => ({
        ...run,
        key: `run-${i}`,
        ghost,
        mission: { ...run.mission, id: missionId },
        startedAt: startedAt.toISOString(),
      })),
    );

  it('compareRuns never produces rows for different-ghost pairs', () => {
    const crossGhost = fc
      .tuple(runArb('before'), runArb('after'), fc.nat())
      .map(([before, after, pick]) => {
        const others = GHOST_IDS.filter((g) => g !== before.ghost);
        after.ghost = others[pick % others.length]!;
        after.mission = { ...before.mission };
        return [before, after] as const;
      });
    fc.assert(
      fc.property(crossGhost, ([before, after]) => {
        expect(compareRuns(before, after)).toEqual({ error: 'different_ghosts' });
      }),
      { numRuns: 300 },
    );
  });

  it('after options are same ghost and mission, complete, and newest first', () => {
    fc.assert(
      fc.property(runsArb, fc.nat(), (runs, pick) => {
        const before = runs[pick % runs.length]!;
        const options = afterCandidates(before, runs);
        const expected = runs.filter(
          (r) => r.key !== before.key && r.ghost === before.ghost && r.mission.id === before.mission.id,
        );
        expect(new Set(options.map((r) => r.key))).toEqual(new Set(expected.map((r) => r.key)));
        expect(options).toHaveLength(expected.length);
        for (let i = 1; i < options.length; i++) {
          expect(Date.parse(options[i - 1]!.startedAt)).toBeGreaterThanOrEqual(Date.parse(options[i]!.startedAt));
        }
        expect(defaultAfter(before, runs)?.key ?? null).toBe(options[0]?.key ?? null);
      }),
      { numRuns: 300 },
    );
  });

  it('defaultAfter and defaultPair only choose same-ghost, same-mission partners', () => {
    fc.assert(
      fc.property(runsArb, fc.nat(), (runs, pick) => {
        const before = runs[pick % runs.length]!;
        const after = defaultAfter(before, runs);
        if (after) {
          expect(after.key).not.toBe(before.key);
          expect(after.ghost).toBe(before.ghost);
          expect(after.mission.id).toBe(before.mission.id);
        }
        const pair = defaultPair(runs);
        if (pair) {
          expect(pair.after.ghost).toBe(pair.before.ghost);
          expect(pair.after.mission.id).toBe(pair.before.mission.id);
        }
      }),
      { numRuns: 300 },
    );
  });
});

/**
 * TEST ORACLE: frozen copy of the compareRuns matching loop from the pre-fix code
 * (exorcise-different-ghost-fix). Do not update it to follow later changes to compareRuns;
 * it exists so Property 2 can prove same-ghost comparisons are unchanged.
 */
function compareRunsOriginal(before: Run, after: Run): { rows: ExorciseRow[] } | { error: 'different_missions' } {
  if (before.mission.id !== after.mission.id) return { error: 'different_missions' };

  const afterPages = new Set(after.steps.map((s) => s.page));
  const unmatchedAfter = after.findings.map((finding, i) => ({ finding, i, page: findingPage(after, finding) }));
  const rows: ExorciseRow[] = [];

  before.findings.forEach((finding, i) => {
    const page = findingPage(before, finding);
    const matchAt = unmatchedAfter.findIndex((a) => a.finding.type === finding.type && a.page === page);
    if (matchAt >= 0) {
      const [match] = unmatchedAfter.splice(matchAt, 1);
      rows.push({ status: 'still_haunting', type: finding.type, page, before: finding, after: match!.finding, key: `b${i}-a${match!.i}` });
    } else {
      const reached = page !== '?' && afterPages.has(page);
      rows.push({ status: reached ? 'exorcised' : 'not_reached', type: finding.type, page, before: finding, key: `b${i}` });
    }
  });
  for (const a of unmatchedAfter) {
    rows.push({ status: 'new_haunting', type: a.finding.type, page: a.page, after: a.finding, key: `a${a.i}` });
  }
  return { rows };
}

describe('Feature: exorcise-different-ghost-fix, Property 2: same-ghost comparisons are unchanged', () => {
  /**
   * Preservation: pairs outside the bug condition behave as before the fix.
   * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9**
   */
  it('gives the same rows as the pre-fix matching for same-ghost, same-mission pairs', () => {
    const sameGhostSameMission = fc.tuple(runArb('before'), runArb('after')).map(([b, a]) => {
      a.mission = { ...b.mission };
      a.ghost = b.ghost;
      return [b, a] as const;
    });
    fc.assert(
      fc.property(sameGhostSameMission, ([before, after]) => {
        const result = compareRuns(before, after);
        const oracle = compareRunsOriginal(before, after);
        if (!('rows' in result) || !('rows' in oracle)) throw new Error('expected rows for a same-ghost, same-mission pair');
        expect(result.rows).toEqual(oracle.rows);
      }),
      { numRuns: 300 },
    );
  });

  it('refuses pairs with different missions, whatever the ghosts', () => {
    const differentMissions = fc
      .tuple(runArb('before'), runArb('after'), fc.constantFrom<GhostId>(...GHOST_IDS))
      .filter(([b, a]) => b.mission.id !== a.mission.id)
      .map(([b, a, ghost]) => {
        a.ghost = ghost;
        return [b, a] as const;
      });
    fc.assert(
      fc.property(differentMissions, ([before, after]) => {
        expect(compareRuns(before, after)).toEqual({ error: 'different_missions' });
      }),
      { numRuns: 300 },
    );
  });
});
