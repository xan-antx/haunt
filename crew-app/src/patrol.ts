import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dashboardBaseUrl } from './dashboardLink.ts';
import { mapExitCode } from './exitCode.ts';
import { createRealProbe } from './prerequisites.ts';
import { runPatrol } from './runPatrol.ts';
import { createCommandRunner, createSiteController } from './site.ts';
import { createPatrolStore } from './store.ts';

export interface MainDeps {
  run(): Promise<number>;
  stderr(text: string): void;
}

/** Runs one patrol. Any exception that escapes becomes exit code 4 (the patrol crashed). */
export async function main(deps: MainDeps): Promise<number> {
  try {
    return await deps.run();
  } catch (error) {
    deps.stderr(`Haunt Patrol crashed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`);
    return mapExitCode({ kind: 'crashed' });
  }
}

export interface PatrolPaths {
  appRoot: string;
  repoRoot: string;
  runsDir: string;
}

/**
 * The app root (the folder with app.json) is one folder up from this file. Patrol data is written
 * there, where the backend reads it, and so are the ghost runs (data/runs/), so a patrol never changes
 * the repository's runs/ folder that the dashboard shows. The repository root (engine/, demo-site/)
 * comes from HAUNT_REPO_ROOT, then from the folder above the app root, which is right when the app runs
 * from the repository. An installed copy (~/.kiro/crew/apps/haunt-patrol/) needs HAUNT_REPO_ROOT.
 */
export function patrolPaths(env: Record<string, string | undefined>, appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')): PatrolPaths {
  const repoRoot = env.HAUNT_REPO_ROOT || path.resolve(appRoot, '..');
  return { appRoot, repoRoot, runsDir: path.join(appRoot, 'data', 'runs') };
}

/** The real wiring. */
export function realMainDeps(env: Record<string, string | undefined>): MainDeps {
  const { appRoot, repoRoot, runsDir } = patrolPaths(env);
  return {
    run: () =>
      runPatrol({
        repoRoot,
        runsDir,
        clock: () => new Date(),
        probe: createRealProbe(repoRoot),
        site: createSiteController(repoRoot),
        commands: createCommandRunner(),
        store: createPatrolStore(appRoot),
        dashboardBaseUrl: dashboardBaseUrl(env),
        readFile: (p) => readFile(p, 'utf8'),
        stdout: (text) => process.stdout.write(text),
        stderr: (text) => process.stderr.write(text),
      }),
    stderr: (text) => process.stderr.write(text),
  };
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(path.resolve(entry)).href) {
  process.exitCode = await main(realMainDeps(process.env));
}
