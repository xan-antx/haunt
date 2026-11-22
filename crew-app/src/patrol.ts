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

/** The real wiring. The repository root comes from HAUNT_REPO_ROOT, then from this file's location. */
export function realMainDeps(env: Record<string, string | undefined>): MainDeps {
  const repoRoot = env.HAUNT_REPO_ROOT ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  return {
    run: () =>
      runPatrol({
        repoRoot,
        clock: () => new Date(),
        probe: createRealProbe(repoRoot),
        site: createSiteController(repoRoot),
        commands: createCommandRunner(),
        store: createPatrolStore(repoRoot),
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
