import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Runs `git` with the given arguments in `cwd` and resolves to its standard output. */
export type GitRunner = (args: string[], cwd: string) => Promise<string>;

const defaultRunner: GitRunner = (args, cwd) =>
  new Promise((resolve, reject) => {
    execFile('git', args, { cwd, windowsHide: true, timeout: 10_000 }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
  });

/** The folder that holds this file's package, `engine/`. */
function engineFolder(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

/**
 * Walks up from `startDir` to the first folder that contains `.git`
 * (a folder, or a file in a worktree). Returns null when there is none.
 */
export function findRepositoryRoot(startDir: string = engineFolder()): string | null {
  let current = path.resolve(startDir);
  for (;;) {
    if (existsSync(path.join(current, '.git'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export interface ShortCommitOptions {
  /** Folder to start the search for the repository root. Defaults to `engine/`. */
  startDir?: string;
  run?: GitRunner;
  /** Receives the warning text. Defaults to standard error. */
  warn?: (message: string) => void;
}

/**
 * The output of `git rev-parse --short HEAD`, run in the repository root.
 * Returns `unknown` and prints a warning when git is missing, there is no
 * repository, or there is no commit yet.
 */
export async function getShortCommit(options: ShortCommitOptions = {}): Promise<string> {
  const run = options.run ?? defaultRunner;
  const warn = options.warn ?? ((message: string) => void process.stderr.write(`${message}\n`));
  const root = findRepositoryRoot(options.startDir);
  if (root === null) {
    warn('Warning: no git repository found, so site.commit is "unknown".');
    return 'unknown';
  }
  try {
    const commit = (await run(['rev-parse', '--short', 'HEAD'], root)).trim();
    if (commit === '') throw new Error('git printed nothing');
    return commit;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    warn(`Warning: could not read the git commit (${reason}), so site.commit is "unknown".`);
    return 'unknown';
  }
}
