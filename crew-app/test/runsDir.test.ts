import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { main, patrolPaths } from '../src/patrol.ts';
import { runPatrol } from '../src/runPatrol.ts';
import { FAKE_ROOT, FAKE_RUNS_DIR, harness } from './helpers.ts';

function outOf(args: string[]): string | undefined {
  const at = args.indexOf('--out');
  return at === -1 ? undefined : args[at + 1];
}

describe('where the ghost runs go', () => {
  it('passes the app data folder to every haunt run as --out', async () => {
    const h = harness();
    await runPatrol(h.deps);
    expect(h.commands.calls).toHaveLength(3);
    for (const call of h.commands.calls) expect(outOf(call)).toBe(FAKE_RUNS_DIR);
  });

  it('never passes the repository runs/ folder', async () => {
    const h = harness();
    await runPatrol(h.deps);
    const repoRuns = path.join(FAKE_ROOT, 'runs');
    for (const call of h.commands.calls) expect(path.resolve(outOf(call) ?? '')).not.toBe(repoRuns);
  });

  it.each([
    ['the runs/ folder itself', path.join(FAKE_ROOT, 'runs')],
    ['a folder inside runs/', path.join(FAKE_ROOT, 'runs', 'lantern-bills')],
  ])('refuses %s before starting the site or any ghost (exit 4)', async (_label, runsDir) => {
    const h = harness();
    h.deps.runsDir = runsDir;
    const stderr: string[] = [];
    expect(await main({ run: () => runPatrol(h.deps), stderr: (t) => stderr.push(t) })).toBe(4);
    expect(stderr.join('')).toContain("must not write ghost runs into the repository's runs/ folder");
    expect(h.site.starts).toBe(0);
    expect(h.commands.calls).toHaveLength(0);
  });

  it('accepts a sibling folder whose name only starts with "runs"', async () => {
    const h = harness();
    h.deps.runsDir = path.join(FAKE_ROOT, 'runs-patrol');
    expect(await runPatrol(h.deps)).toBe(0);
  });
});

describe('patrolPaths', () => {
  const appRoot = path.resolve('/home/u/.kiro/crew/apps/haunt-patrol');
  const repoRoot = path.resolve('/projects/haunt');

  it('puts the runs in the installed copy data folder, not in HAUNT_REPO_ROOT', () => {
    const paths = patrolPaths({ HAUNT_REPO_ROOT: repoRoot }, appRoot);
    expect(paths.repoRoot).toBe(repoRoot);
    expect(paths.runsDir).toBe(path.join(appRoot, 'data', 'runs'));
    expect(path.relative(path.join(repoRoot, 'runs'), paths.runsDir).startsWith('..')).toBe(true);
  });

  it('puts the runs in crew-app/data/runs when the app runs from the repository', () => {
    const inRepo = path.join(repoRoot, 'crew-app');
    const paths = patrolPaths({}, inRepo);
    expect(paths.repoRoot).toBe(repoRoot);
    expect(paths.runsDir).toBe(path.join(inRepo, 'data', 'runs'));
  });
});
