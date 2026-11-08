// @vitest-environment node
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { collectRuns, findRunFolders, folderKey } from '../collect';

const sampleDir = join(__dirname, '..', '..', '..', 'runs', 'samples');
const listener = readFileSync(join(sampleDir, 'listener-gave-up', 'run.json'), 'utf8');
const bebe = readFileSync(join(sampleDir, 'bebe-succeeded', 'run.json'), 'utf8');

let root: string;
let runsDir: string;
let outDir: string;
let logs: string[];

function write(path: string, content: string): void {
  const full = join(runsDir, path);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, content, 'utf8');
}

function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (current: string, prefix: string): void => {
    for (const name of readdirSync(current)) {
      const full = join(current, name);
      if (statSync(full).isDirectory()) walk(full, `${prefix}${name}/`);
      else out[`${prefix}${name}`] = readFileSync(full, 'utf8');
    }
  };
  walk(dir, '');
  return out;
}

function collect() {
  return collectRuns({ runsDir, outDir, log: (l) => logs.push(l), now: () => new Date('2026-11-08T00:00:00Z') });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'haunt-collect-'));
  runsDir = join(root, 'runs');
  outDir = join(root, 'dashboard', 'public', 'runs');
  logs = [];
  write('samples/listener-gave-up/run.json', listener);
  write('samples/listener-gave-up/shots/009.png', 'fake image');
  write('samples/bebe-succeeded/run.json', bebe);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('Collect_Step', () => {
  it('finds run.json files at any depth in sorted order', () => {
    write('2026/11/nightly/listener/run.json', listener.replace('2026-11-03-listener-pay-bill', 'nightly-1'));
    expect(findRunFolders(runsDir)).toEqual([
      '2026/11/nightly/listener',
      'samples/bebe-succeeded',
      'samples/listener-gave-up',
    ]);
  });

  it('copies folders with screenshots and writes the index', () => {
    const index = collect();
    expect(index.entries).toEqual([
      { key: '2026-11-03-bebe-pay-bill', folder: 'samples/bebe-succeeded', origin: 'samples', errors: [] },
      { key: '2026-11-03-listener-pay-bill', folder: 'samples/listener-gave-up', origin: 'samples', errors: [] },
    ]);
    expect(readFileSync(join(outDir, 'samples/listener-gave-up/shots/009.png'), 'utf8')).toBe('fake image');
    const written = JSON.parse(readFileSync(join(outDir, 'index.json'), 'utf8'));
    expect(written).toEqual({ formatVersion: 1, generatedAt: '2026-11-08T00:00:00.000Z', entries: index.entries });
    expect(logs).toEqual([]);
  });

  it('lists an invalid file with its errors, warns, and keeps going', () => {
    write('broken/run.json', '{ not json');
    write('wrong/run.json', bebe.replace('"succeeded"', '"success"'));
    const index = collect();
    const broken = index.entries.find((e) => e.folder === 'broken')!;
    expect(broken.key).toBe('broken');
    expect(broken.origin).toBe('runs');
    expect(broken.errors[0]!.message).toMatch(/^is not valid JSON/);
    const wrong = index.entries.find((e) => e.folder === 'wrong')!;
    expect(wrong.errors.some((e) => e.path === 'result')).toBe(true);
    expect(logs).toContain('Haunt: restless file runs/broken/run.json');
    expect(index.entries).toHaveLength(4);
  });

  it('keeps the first of two runs with the same runId and marks the later one', () => {
    write('zz-copy/run.json', listener);
    const index = collect();
    const copy = index.entries.find((e) => e.folder === 'zz-copy')!;
    expect(copy.key).toBe('zz-copy');
    expect(copy.errors).toEqual([
      {
        path: 'runId',
        message: 'duplicate runId: "2026-11-03-listener-pay-bill" is already used by samples/listener-gave-up/run.json',
      },
    ]);
    const original = index.entries.find((e) => e.folder === 'samples/listener-gave-up')!;
    expect(original.errors).toEqual([]);
    expect(logs).toContain('Haunt: restless file runs/zz-copy/run.json');
  });

  it('uses the folder path when runId is missing', () => {
    write('nested/deep/run.json', '{"formatVersion": 1}');
    const entry = collect().entries.find((e) => e.folder === 'nested/deep')!;
    expect(entry.key).toBe('nested--deep');
    expect(folderKey('a/b/c')).toBe('a--b--c');
  });

  it('removes stale files on a second run', () => {
    write('old/run.json', bebe.replace('2026-11-03-bebe-pay-bill', 'old-run'));
    collect();
    expect(existsSync(join(outDir, 'old/run.json'))).toBe(true);
    rmSync(join(runsDir, 'old'), { recursive: true });
    const index = collect();
    expect(existsSync(join(outDir, 'old'))).toBe(false);
    expect(index.entries.map((e) => e.folder)).not.toContain('old');
  });

  it('never changes source files', () => {
    write('broken/run.json', '{ not json');
    const before = snapshot(runsDir);
    collect();
    collect();
    expect(snapshot(runsDir)).toEqual(before);
  });
});
