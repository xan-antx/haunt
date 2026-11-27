import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config/loadConfig.ts';
import { loadMission } from '../src/missions/loadMission.ts';

/**
 * "Haunt your own site": the mission template in engine/missions/README.md and the config in the
 * root README must follow the engine's schemas, so a reader who copies them gets files that load.
 */
const ENGINE = fileURLToPath(new URL('..', import.meta.url));
const REPO = path.resolve(ENGINE, '..');
const temp = mkdtempSync(path.join(tmpdir(), 'haunt-own-site-'));
afterAll(() => rmSync(temp, { recursive: true, force: true }));

/** The first fenced json block in `markdown` that starts after `after` (a heading line). */
function jsonBlockAfter(markdown: string, after: string): string {
  const text = markdown.replace(/\r\n/g, '\n');
  const start = text.indexOf(after);
  expect(start, `"${after}" is in the file`).toBeGreaterThanOrEqual(0);
  const match = /```json\n([\s\S]*?)```/.exec(text.slice(start));
  expect(match, 'a json block follows').not.toBeNull();
  return match![1]!;
}

describe('Haunt your own site', () => {
  it('the mission template loads as the mission "my-mission"', () => {
    const readme = readFileSync(path.join(ENGINE, 'missions', 'README.md'), 'utf8');
    const dir = path.join(temp, 'missions');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'my-mission.json'), jsonBlockAfter(readme, '## Template'));
    const mission = loadMission(dir, 'my-mission');
    expect(mission.site).toBe('my-site');
    expect(mission.intentions.length).toBeGreaterThan(0);
  });

  it('the config in the root README loads and lists "my-site"', () => {
    const readme = readFileSync(path.join(REPO, 'README.md'), 'utf8');
    const file = path.join(temp, 'haunt.config.json');
    writeFileSync(file, jsonBlockAfter(readme, '## Haunt your own site'));
    expect(Object.keys(loadConfig(file).sites)).toEqual(['my-site']);
  });
});
