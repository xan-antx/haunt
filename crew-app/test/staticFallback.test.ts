import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { latestBody, summaryBody } from '../src/backend/handler.ts';
import { runPatrol } from '../src/runPatrol.ts';
import { createPatrolStore } from '../src/store.ts';
import { harness, record, runJsonText } from './helpers.ts';
import { tempRoot } from './tmp.ts';

const BASE = 'http://localhost:3001';

async function readJson(file: string): Promise<unknown> {
  return JSON.parse(await readFile(file, 'utf8'));
}

describe('static fallback survival', () => {
  it('keeps latest.json and summary.json when a rebuild writes a new index.mjs into ui/dist', async () => {
    const root = await tempRoot();
    const dist = path.join(root, 'crew-app', 'ui', 'dist');
    const r = record('2026-11-03');
    await createPatrolStore(root).exportStatic(r, 'summary text', BASE);
    const before = [await readFile(path.join(dist, 'data', 'latest.json'), 'utf8'), await readFile(path.join(dist, 'data', 'summary.json'), 'utf8')];

    // A rebuild with emptyOutDir false only writes the bundle.
    await writeFile(path.join(dist, 'index.mjs'), 'export default null;\n', 'utf8');

    expect(await readFile(path.join(dist, 'data', 'latest.json'), 'utf8')).toBe(before[0]);
    expect(await readFile(path.join(dist, 'data', 'summary.json'), 'utf8')).toBe(before[1]);
  });

  it('rewrites both data files from the newest record on every patrol', async () => {
    const root = await tempRoot();
    const dist = path.join(root, 'crew-app', 'ui', 'dist', 'data');
    const store = createPatrolStore(root);

    const first = harness({ store, files: () => runJsonText('succeeded'), now: new Date('2026-11-03T05:00:00Z') });
    await runPatrol(first.deps);
    const second = harness({ store, files: () => runJsonText('error', [{ type: 'zoom', step: 1, title: 'Too small' }]), now: new Date('2026-11-04T05:00:00Z') });
    await runPatrol(second.deps);

    const latest = (await readJson(path.join(dist, 'latest.json'))) as { record: { date: string; ghosts: { result: string }[] } };
    expect(latest.record.date).toBe('2026-11-04');
    expect(latest.record.ghosts[0]?.result).toBe('error');
    const summary = (await readJson(path.join(dist, 'summary.json'))) as { summary: string };
    expect(summary.summary).toContain('Too small');
    expect(summary.summary).toContain('Compared with 2026-11-03');
  });

  it('recreates both files when ui/dist was deleted before the patrol', async () => {
    const root = await tempRoot();
    const dist = path.join(root, 'crew-app', 'ui', 'dist');
    const store = createPatrolStore(root);
    await mkdir(dist, { recursive: true });
    await rm(dist, { recursive: true, force: true });

    await runPatrol(harness({ store }).deps);

    expect(await readJson(path.join(dist, 'data', 'latest.json'))).toHaveProperty('record');
    expect(await readJson(path.join(dist, 'data', 'summary.json'))).toHaveProperty('summary');
  });

  it('writes the same bodies the backend returns', async () => {
    const root = await tempRoot();
    const h = harness({ store: createPatrolStore(root) });
    await runPatrol(h.deps);
    const dist = path.join(root, 'crew-app', 'ui', 'dist', 'data');
    const plain = (await readJson(path.join(root, 'crew-app', 'data', 'patrols', 'latest.json'))) as Parameters<typeof latestBody>[0];
    const summaryText = await readFile(path.join(root, 'crew-app', 'data', 'patrols', 'summary.md'), 'utf8');
    expect(await readJson(path.join(dist, 'latest.json'))).toEqual(latestBody(plain, BASE));
    expect(await readJson(path.join(dist, 'summary.json'))).toEqual(summaryBody(summaryText));
  });
});
