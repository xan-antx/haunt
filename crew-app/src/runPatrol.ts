import path from 'node:path';
import { mapExitCode } from './exitCode.ts';
import { buildHauntArgs, GHOSTS, interpretExit, type GhostId } from './ghosts.ts';
import { istDate, seedForDate } from './istDate.ts';
import { checkPrerequisites, type Probe } from './prerequisites.ts';
import { makeEntry, type GhostEntry, type PatrolRecord } from './record.ts';
import { extractRunSummary, savedRunPath } from './runFile.ts';
import type { CommandResult, CommandRunner, SiteController } from './site.ts';
import type { PatrolStore } from './store.ts';
import { buildSummary } from './summary.ts';

const GHOST_TIMEOUT_MS = 180_000;

export interface PatrolDeps {
  repoRoot: string;
  /** Where the ghost runs go (`haunt run --out`). The app's own data folder, never the repository's runs/. */
  runsDir: string;
  clock: () => Date;
  probe: Probe;
  site: SiteController;
  commands: CommandRunner;
  store: PatrolStore;
  dashboardBaseUrl: string; // for the static fallback only
  readFile(path: string): Promise<string>; // for run.json
  stdout(text: string): void;
  stderr(text: string): void;
}

function lastLines(text: string, count: number): string {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '')
    .slice(-count)
    .join(' ');
}

function noRun(ghost: GhostId, exitCode: number | null, error: string): GhostEntry {
  return makeEntry(ghost, { result: 'no_run', exitCode, runId: null, findings: [], error });
}

async function entryFor(ghost: GhostId, result: CommandResult, readFile: PatrolDeps['readFile']): Promise<{ entry: GhostEntry; interrupted: boolean }> {
  const exit = interpretExit(result.code);
  if (exit.kind === 'interrupted') {
    return { entry: noRun(ghost, result.code, 'Interrupted (exit code 130).'), interrupted: true };
  }
  if (exit.kind === 'no_run') {
    const why = result.timedOut ? 'It took too long and was stopped.' : lastLines(result.stderr, 3) || `The command exited with code ${String(result.code)}.`;
    return { entry: noRun(ghost, result.code, why), interrupted: false };
  }
  const runPath = savedRunPath(result.stdout);
  if (runPath === null) return { entry: noRun(ghost, result.code, 'No run.json path was printed.'), interrupted: false };
  let text: string;
  try {
    text = await readFile(runPath);
  } catch (error) {
    return { entry: noRun(ghost, result.code, `The run file could not be read: ${error instanceof Error ? error.message : String(error)}`), interrupted: false };
  }
  const extracted = extractRunSummary(text, path.basename(path.dirname(runPath)));
  if (!extracted.ok) return { entry: noRun(ghost, result.code, extracted.error), interrupted: false };
  return {
    entry: makeEntry(ghost, { result: extracted.result, exitCode: result.code, runId: extracted.runId, findings: extracted.findings, error: null }),
    interrupted: false,
  };
}

/** One patrol. Returns the exit code. Exceptions after the site started propagate once the site is stopped. */
export async function runPatrol(deps: PatrolDeps): Promise<number> {
  const repoRuns = path.resolve(deps.repoRoot, 'runs');
  const fromRepoRuns = path.relative(repoRuns, path.resolve(deps.runsDir));
  if (fromRepoRuns === '' || (!fromRepoRuns.startsWith('..') && !path.isAbsolute(fromRepoRuns))) {
    throw new Error(`The patrol must not write ghost runs into the repository's runs/ folder (${deps.runsDir}).`);
  }

  const date = istDate(deps.clock());
  const seed = seedForDate(date);

  const missing = await checkPrerequisites(deps.repoRoot, deps.probe);
  if (missing.length > 0) {
    deps.stderr('Haunt Patrol cannot start. Something is missing:\n');
    for (const m of missing) deps.stderr(`- ${m.item}. Fix: ${m.fix}\n`);
    return mapExitCode({ kind: 'prerequisite_missing' });
  }

  const started = await deps.site.start();
  if (!started.ok) {
    deps.stderr(`Lantern Bills did not start: ${started.reason}\n`);
    return mapExitCode({ kind: 'site_not_started' });
  }

  const cliPath = path.join(deps.repoRoot, 'engine', 'bin', 'haunt.mjs');
  const runsDir = deps.runsDir;
  const engineDir = path.join(deps.repoRoot, 'engine');
  const entries: GhostEntry[] = [];
  let interrupted = false;

  try {
    for (const ghost of GHOSTS) {
      if (interrupted) {
        entries.push(noRun(ghost, null, 'Not run: patrol interrupted.'));
        continue;
      }
      try {
        const result = await deps.commands.run(buildHauntArgs(ghost, seed, runsDir, cliPath), { cwd: engineDir, timeoutMs: GHOST_TIMEOUT_MS });
        const built = await entryFor(ghost, result, deps.readFile);
        entries.push(built.entry);
        if (built.interrupted) interrupted = true;
      } catch (error) {
        entries.push(noRun(ghost, null, error instanceof Error ? error.message : String(error)));
      }
    }
  } finally {
    try {
      await started.stop();
    } catch (error) {
      deps.stderr(`Lantern Bills would not stop: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }

  const record: PatrolRecord = { version: 1, date, seed, interrupted, ghosts: entries };
  const previous = await deps.store.loadPrevious(date);
  const summary = buildSummary(record, previous);
  await deps.store.writeRecord(record);
  await deps.store.writeSummary(summary);
  await deps.store.exportStatic(record, summary, deps.dashboardBaseUrl);
  deps.stdout(summary);

  const savedRuns = entries.filter((e) => e.result !== 'no_run').length;
  return mapExitCode({ kind: 'ran', savedRuns });
}
