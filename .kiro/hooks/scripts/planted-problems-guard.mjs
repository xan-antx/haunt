// Runs after each agent turn (Stop). If any file under demo-site/src differs
// from HEAD (staged or unstaged), runs the planted problem tests. Exits 0 when
// nothing changed or the tests pass. On failure, prints the last 60 lines of
// output to stderr and exits 2 so the failure goes back to the agent.
import { spawnSync } from 'node:child_process';

const SCOPE = 'demo-site/src';

const diff = spawnSync('git', ['diff', '--name-only', 'HEAD', '--', SCOPE], { encoding: 'utf8' });
if (diff.status !== 0) {
  process.stderr.write(`planted-problems-guard: git diff failed: ${diff.stderr ?? ''}`);
  process.exit(1);
}
if (!diff.stdout.trim()) process.exit(0);

const tests = spawnSync(
  'npx vitest --run src/components/__tests__ src/__tests__/translations.test.ts',
  { cwd: 'demo-site', shell: true, encoding: 'utf8' },
);
if (tests.status === 0) process.exit(0);

const output = `${tests.stdout ?? ''}\n${tests.stderr ?? ''}`.trim().split('\n').slice(-60).join('\n');
process.stderr.write(`Planted problems tests FAILED (exit ${tests.status}) in demo-site:\n${output}\n`);
process.exit(2);
