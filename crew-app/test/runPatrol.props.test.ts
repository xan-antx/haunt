import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { GHOSTS } from '../src/ghosts.ts';
import { checkPrerequisites } from '../src/prerequisites.ts';
import { runPatrol } from '../src/runPatrol.ts';
import type { CommandResult } from '../src/site.ts';
import { FAKE_ROOT, RUNS, fakeSite, ghostOf, goodProbe, harness, savedResult } from './helpers.ts';
import path from 'node:path';

type Outcome = { kind: 'code'; code: number | null } | { kind: 'throw' };
const arbOutcome: fc.Arbitrary<Outcome> = fc.oneof(
  fc.constantFrom(0, 1, 2, 3, 130, null).map((code) => ({ kind: 'code' as const, code })),
  fc.constant({ kind: 'throw' as const }),
);

function responder(outcomes: Outcome[]): (ghost: (typeof GHOSTS)[number]) => CommandResult {
  return (ghost) => {
    const outcome = outcomes[GHOSTS.indexOf(ghost)] as Outcome;
    if (outcome.kind === 'throw') throw new Error('runner failed');
    if (outcome.code === 0 || outcome.code === 3) return savedResult(ghost, outcome.code);
    return { code: outcome.code, stdout: '', stderr: 'e', timedOut: outcome.code === null };
  };
}

describe('Feature: haunt-patrol, Property 1: Site is always stopped', () => {
  it('stops a started site exactly once, whatever the ghosts do', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(arbOutcome, { minLength: 3, maxLength: 3 }), async (outcomes) => {
        const h = harness({ respond: responder(outcomes) });
        await runPatrol(h.deps);
        expect(h.site.starts).toBe(1);
        expect(h.site.stops).toBe(1);
      }),
      RUNS,
    );
  });

  it('never stops a site that did not start', async () => {
    const site = fakeSite({ ok: false, reason: 'no' });
    const h = harness({ site });
    await runPatrol(h.deps);
    expect(site.stops).toBe(0);
  });
});

describe('Feature: haunt-patrol, Property 2: Ghosts run in fixed order and stop on interruption', () => {
  it('calls the ghosts in order up to and including the first 130', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(arbOutcome, { minLength: 3, maxLength: 3 }), async (outcomes) => {
        const h = harness({ respond: responder(outcomes) });
        await runPatrol(h.deps);
        const firstInterrupt = outcomes.findIndex((o) => o.kind === 'code' && o.code === 130);
        const expected = firstInterrupt === -1 ? [...GHOSTS] : GHOSTS.slice(0, firstInterrupt + 1);
        expect(h.commands.calls.map(ghostOf)).toEqual(expected);
      }),
      RUNS,
    );
  });
});

describe('Feature: haunt-patrol, Property 13: Prerequisite report is exact and stops the patrol', () => {
  it('reports exactly the missing subset, each with a fix, and runs nothing', async () => {
    await fc.assert(
      fc.asyncProperty(fc.boolean(), fc.array(fc.boolean(), { minLength: 3, maxLength: 3 }), fc.boolean(), async (oldNode, folderPresent, chromium) => {
        const folders = ['engine', 'demo-site', 'crew-app'];
        const probe = goodProbe({
          nodeVersion: () => (oldNode ? 'v22.1.0' : 'v24.2.0'),
          dirExists: (p) => {
            const index = folders.findIndex((f) => p === path.join(FAKE_ROOT, f, 'node_modules'));
            return index === -1 ? true : (folderPresent[index] as boolean);
          },
          chromiumInstalled: () => Promise.resolve(chromium),
        });
        const missing = await checkPrerequisites(FAKE_ROOT, probe);
        const expected = [
          ...(oldNode ? ['Node.js 24 or later'] : []),
          ...folders.filter((_, i) => !folderPresent[i]).map((f) => `${f}/node_modules`),
          ...(chromium ? [] : ['Playwright Chromium']),
        ];
        expect(missing.map((m) => m.item)).toEqual(expected);
        for (const m of missing) expect(m.fix.length).toBeGreaterThan(0);

        const h = harness({ probe });
        const code = await runPatrol(h.deps);
        if (expected.length > 0) {
          expect(code).not.toBe(0);
          expect(h.site.starts).toBe(0);
          expect(h.commands.calls).toHaveLength(0);
        }
      }),
      RUNS,
    );
  });
});
