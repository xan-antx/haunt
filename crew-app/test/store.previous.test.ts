import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseRecord } from '../src/record.ts';
import { runPatrol } from '../src/runPatrol.ts';
import { createPatrolStore } from '../src/store.ts';
import { RUNS, harness } from './helpers.ts';
import { tempRoot } from './tmp.ts';

describe('Feature: haunt-patrol, Property 11 (integration half): Unreadable previous record', () => {
  it('loadPrevious gives unreadable with the date, and runPatrol still prints a summary', async () => {
    const root = await tempRoot();
    const dir = path.join(root, 'crew-app', 'data', 'patrols');
    await mkdir(dir, { recursive: true });
    await fc.assert(
      fc.asyncProperty(
        fc.string().filter((t) => !parseRecord(t).ok),
        async (text) => {
          await writeFile(path.join(dir, '2026-11-02.json'), text, 'utf8');
          await writeFile(path.join(dir, '2026-10-01.json'), '{"older":true}', 'utf8');
          const store = createPatrolStore(path.join(root, 'crew-app'));
          expect(await store.loadPrevious('2026-11-03')).toEqual({ kind: 'unreadable', date: '2026-11-02' });

          const h = harness({ store: undefined });
          h.deps.store = { ...store, writeRecord: async () => undefined, writeSummary: async () => undefined, exportStatic: async () => undefined };
          expect(await runPatrol(h.deps)).toBe(0);
          expect(h.out.join('')).toContain('The previous patrol (2026-11-02) was unreadable');
        },
      ),
      RUNS,
    );
  });
});
