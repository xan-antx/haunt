import { readFile } from 'node:fs/promises';
import path from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { serializeRecord } from '../src/record.ts';
import { createPatrolStore } from '../src/store.ts';
import { RUNS, arbRecord } from './helpers.ts';
import { tempRoot } from './tmp.ts';

describe('Feature: haunt-patrol, Property 5 (integration half): Patrol record round trip', () => {
  it('writes byte-identical dated and latest files, and a same-date write replaces the first', async () => {
    const root = await tempRoot();
    const store = createPatrolStore(path.join(root, 'crew-app'));
    const dir = path.join(root, 'crew-app', 'data', 'patrols');
    await fc.assert(
      fc.asyncProperty(arbRecord, arbRecord, async (first, secondBase) => {
        const second = { ...secondBase, date: first.date };
        await store.writeRecord(first);
        const dated = await readFile(path.join(dir, `${first.date}.json`), 'utf8');
        const latest = await readFile(path.join(dir, 'latest.json'), 'utf8');
        expect(dated).toBe(latest);
        expect(dated).toBe(serializeRecord(first));

        await store.writeRecord(second);
        expect(await readFile(path.join(dir, `${first.date}.json`), 'utf8')).toBe(serializeRecord(second));
        expect(await readFile(path.join(dir, 'latest.json'), 'utf8')).toBe(serializeRecord(second));
      }),
      RUNS,
    );
  });
});
