import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { latestBody, summaryBody } from '../src/backend/handler.ts';
import { serializeRecord } from '../src/record.ts';
import { createPatrolStore } from '../src/store.ts';
import { record } from './helpers.ts';
import { tempRoot } from './tmp.ts';

const srcDir = path.resolve(import.meta.dirname, '..', 'src');

async function sourceFiles(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await sourceFiles(full)));
    else if (entry.name.endsWith('.ts')) found.push(full);
  }
  return found;
}

describe('PatrolStore', () => {
  it('loadPrevious gives none when the folder or an earlier record is missing', async () => {
    const root = await tempRoot();
    const store = createPatrolStore(path.join(root, 'crew-app'));
    expect(await store.loadPrevious('2026-11-03')).toEqual({ kind: 'none' });
    await store.writeRecord(record('2026-11-03'));
    expect(await store.loadPrevious('2026-11-03')).toEqual({ kind: 'none' });
  });

  it('loadPrevious ignores latest.json and picks the newest earlier dated file', async () => {
    const root = await tempRoot();
    const store = createPatrolStore(path.join(root, 'crew-app'));
    await store.writeRecord(record('2026-11-01'));
    await store.writeRecord(record('2026-11-02'));
    await store.writeRecord(record('2026-11-05')); // also writes latest.json with the 5th
    const previous = await store.loadPrevious('2026-11-04');
    expect(previous.kind).toBe('record');
    if (previous.kind === 'record') expect(previous.record.date).toBe('2026-11-02');
  });

  it('writes the same text to the dated file and latest.json, replaces the same date, and leaves no temp files', async () => {
    const root = await tempRoot();
    const store = createPatrolStore(path.join(root, 'crew-app'));
    const dir = path.join(root, 'crew-app', 'data', 'patrols');
    await store.writeRecord(record('2026-11-03'));
    const second = record('2026-11-03', { bebe: { result: 'error' } });
    await store.writeRecord(second);
    expect(await readFile(path.join(dir, '2026-11-03.json'), 'utf8')).toBe(serializeRecord(second));
    expect(await readFile(path.join(dir, 'latest.json'), 'utf8')).toBe(serializeRecord(second));
    expect((await readdir(dir)).sort()).toEqual(['2026-11-03.json', 'latest.json']);
    // The plain record only, not the { record, dashboardBaseUrl } body.
    expect(JSON.parse(await readFile(path.join(dir, 'latest.json'), 'utf8'))).toHaveProperty('ghosts');
  });

  it('writes summary.md', async () => {
    const root = await tempRoot();
    await createPatrolStore(path.join(root, 'crew-app')).writeSummary('hello\n');
    expect(await readFile(path.join(root, 'crew-app', 'data', 'patrols', 'summary.md'), 'utf8')).toBe('hello\n');
  });

  it('exportStatic writes bodies equal to latestBody and summaryBody', async () => {
    const root = await tempRoot();
    const r = record('2026-11-03');
    await createPatrolStore(path.join(root, 'crew-app')).exportStatic(r, 'the summary', 'http://localhost:3001');
    const dir = path.join(root, 'crew-app', 'ui', 'dist', 'data');
    expect(JSON.parse(await readFile(path.join(dir, 'latest.json'), 'utf8'))).toEqual(latestBody(r, 'http://localhost:3001'));
    expect(JSON.parse(await readFile(path.join(dir, 'summary.json'), 'utf8'))).toEqual(summaryBody('the summary'));
  });
});

describe('import rules for crew-app/src', () => {
  it('imports nothing from dashboard/ or liveGhost, and never references haunt-mcp', async () => {
    const files = await sourceFiles(srcDir);
    expect(files.length).toBeGreaterThan(10);
    for (const file of files) {
      const text = await readFile(file, 'utf8');
      const importLines = text.split('\n').filter((l) => /^\s*(import|export)\b.*\bfrom\b|\bimport\(/.test(l));
      for (const line of importLines) {
        expect(line, `${file}: ${line}`).not.toMatch(/liveGhost/);
        expect(line, `${file}: ${line}`).not.toMatch(/dashboard\//);
      }
      // Comments may name haunt-mcp; code must not reach for it. The only code string that could is a path or an arg.
      const code = text
        .split('\n')
        .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
        .join('\n');
      expect(code, file).not.toContain('haunt-mcp');
    }
  });
});
