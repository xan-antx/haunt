import { existsSync } from 'node:fs';
import { mkdir, rename as fsRename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { formatProblem } from '../contract/invariants.ts';
import type { FinalizeResult } from './finalize.ts';

/** Moves `from` to `to`. Injectable so a test can simulate a failing rename. */
export type RenameFn = (from: string, to: string) => Promise<void>;

export interface WriteRunOptions {
  /** The Out_Root (already resolved to an absolute path). */
  outRoot: string;
  siteKey: string;
  /** The result of `finalizeRun`. Nothing is written when it has problems. */
  result: FinalizeResult;
  /** Defaults to `fs.rename`. */
  rename?: RenameFn;
  /** Process id used in the temporary folder name. Defaults to `process.pid`. */
  pid?: number;
  /** Waits between rename attempts. Injectable so a test does not really wait. */
  sleep?: (ms: number) => Promise<void>;
}

/** Windows antivirus and file indexers can hold a file briefly, which makes the rename fail with these codes. */
const RETRYABLE_RENAME_CODES = new Set(['EPERM', 'EACCES', 'EBUSY']);
const RENAME_MAX_ATTEMPTS = 10;
const RENAME_DELAY_STEP_MS = 50;

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Renames, retrying on EPERM, EACCES and EBUSY: up to 10 attempts in total, waiting 50 ms, 100 ms,
 * 150 ms ... between them. Any other error, or the last failure, is thrown at once.
 */
async function renameWithRetry(
  rename: RenameFn,
  from: string,
  to: string,
  sleep: (ms: number) => Promise<void>,
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | null)?.code;
      if (attempt >= RENAME_MAX_ATTEMPTS || code === undefined || !RETRYABLE_RENAME_CODES.has(code)) throw error;
      await sleep(RENAME_DELAY_STEP_MS * attempt);
    }
  }
}

/** Thrown instead of writing when the run did not pass validation. */
export class InvalidRunError extends Error {
  readonly problems: FinalizeResult['problems'];

  constructor(problems: FinalizeResult['problems']) {
    super(`The run is not valid, so nothing was written:\n${problems.map((p) => `  ${formatProblem(p)}`).join('\n')}`);
    this.name = 'InvalidRunError';
    this.problems = problems;
  }
}

export interface WrittenRun {
  /** `<Out_Root>/<Site_Key>/<runId>` */
  folder: string;
  /** `<Out_Root>/<Site_Key>/<runId>/run.json` */
  runJsonPath: string;
}

const SHOT_NAME = /^shots\/\d{3}(-seen)?\.png$/;
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Writes `run.json` and the screenshots into a temporary folder next to the final one
 * (`<Out_Root>/<Site_Key>/.<runId>.tmp-<pid>/`), then renames it to `<Out_Root>/<Site_Key>/<runId>/`.
 * On any failure the temporary folder is removed and the error is thrown again, so a
 * Run_Folder is either complete or absent. Writes nothing when `result.problems` is not empty.
 */
export async function writeRunFolder(options: WriteRunOptions): Promise<WrittenRun> {
  const { outRoot, siteKey, result } = options;
  if (result.problems.length > 0) throw new InvalidRunError(result.problems);

  const { run, files } = result;
  const runId = run.runId;
  if (!SAFE_SEGMENT.test(runId) || !SAFE_SEGMENT.test(siteKey)) {
    throw new Error(`Refusing to write: ${JSON.stringify(siteKey)}/${JSON.stringify(runId)} is not a safe folder name.`);
  }
  for (const name of files.keys()) {
    if (!SHOT_NAME.test(name)) throw new Error(`Refusing to write: ${JSON.stringify(name)} is not a screenshot name.`);
  }

  const rename = options.rename ?? fsRename;
  const siteFolder = path.join(outRoot, siteKey);
  const finalFolder = path.join(siteFolder, runId);
  const tempFolder = path.join(siteFolder, `.${runId}.tmp-${options.pid ?? process.pid}`);

  if (existsSync(finalFolder)) {
    throw new Error(`Refusing to write: ${finalFolder} already exists.`);
  }

  try {
    await mkdir(path.join(tempFolder, 'shots'), { recursive: true });
    await writeFile(path.join(tempFolder, 'run.json'), `${JSON.stringify(run, null, 2)}\n`, 'utf8');
    for (const [name, png] of files) {
      await writeFile(path.join(tempFolder, ...name.split('/')), png);
    }
    await renameWithRetry(rename, tempFolder, finalFolder, options.sleep ?? defaultSleep);
  } catch (error) {
    await rm(tempFolder, { recursive: true, force: true }).catch(() => undefined);
    throw error;
  }

  return { folder: finalFolder, runJsonPath: path.join(finalFolder, 'run.json') };
}
