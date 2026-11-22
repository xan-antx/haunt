import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseArgs } from '../src/cli/main.ts';
import { GHOST_IDS } from '../src/ghosts/registry.ts';

/**
 * Feature: listener-ai-mind, Property 6: Mind option parsing
 * **Validates: Requirements 3.1, 3.2, 3.4, 3.5**
 */
const RUNS = { numRuns: 100 };

const base = (ghost: string): string[] => ['run', '--ghost', ghost, '--mission', 'pay-bill', '--url', 'http://localhost:3000'];

describe('Feature: listener-ai-mind, Property 6: Mind option parsing', () => {
  it('accepts only scripted or ai, and names the accepted values otherwise', () => {
    fc.assert(
      fc.property(fc.string().filter((s) => s !== 'scripted' && s !== 'ai' && !s.startsWith('-')), (value) => {
        const parsed = parseArgs([...base('listener'), '--mind', value]);
        expect(parsed.kind).toBe('invalid');
        if (parsed.kind === 'invalid') expect(parsed.problems.join('\n')).toMatch(/scripted, ai/);
      }),
      RUNS,
    );
  });

  it('accepts scripted and ai for the listener and keeps the value', () => {
    for (const mind of ['scripted', 'ai'] as const) {
      const parsed = parseArgs([...base('listener'), '--mind', mind]);
      expect(parsed.kind).toBe('run');
      if (parsed.kind === 'run') expect(parsed.args.mind).toBe(mind);
    }
  });

  it('refuses ai for any ghost other than the listener', () => {
    fc.assert(
      fc.property(fc.constantFrom(...GHOST_IDS.filter((g) => g !== 'listener')), (ghost) => {
        const parsed = parseArgs([...base(ghost), '--mind', 'ai']);
        expect(parsed.kind).toBe('invalid');
        if (parsed.kind === 'invalid') expect(parsed.problems).toContain('The AI mind supports only the listener ghost.');
      }),
      RUNS,
    );
  });

  it('allows scripted for every ghost, and scripted is the default', () => {
    fc.assert(
      fc.property(fc.constantFrom(...GHOST_IDS), fc.boolean(), (ghost, explicit) => {
        const argv = explicit ? [...base(ghost), '--mind', 'scripted'] : base(ghost);
        const parsed = parseArgs(argv);
        expect(parsed.kind).toBe('run');
        // An omitted --mind leaves `mind` unset, which means scripted.
        if (parsed.kind === 'run') expect(parsed.args.mind ?? 'scripted').toBe('scripted');
        if (parsed.kind === 'run' && !explicit) expect(parsed.args.mind).toBeUndefined();
      }),
      RUNS,
    );
  });
});
