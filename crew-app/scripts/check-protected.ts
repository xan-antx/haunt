import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProtectionCheck, type GitResult } from '../src/protected.ts';

const repoRoot = process.env.HAUNT_REPO_ROOT ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function git(args: string[]): GitResult {
  const result = spawnSync('git', args, { cwd: repoRoot, shell: false, encoding: 'utf8', windowsHide: true });
  if (result.error) return { ok: false, error: result.error.message };
  if (result.status !== 0) return { ok: false, error: result.stderr.trim() || `git exited with code ${String(result.status)}` };
  return { ok: true, stdout: result.stdout };
}

process.exit(
  runProtectionCheck({
    git,
    out: (text) => process.stdout.write(text),
    err: (text) => process.stderr.write(text),
  }),
);
