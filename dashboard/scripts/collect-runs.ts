// Collect_Step CLI. Runs before `npm run dev` and `npm run build`.
// Copies ../runs/**/run.json folders into public/runs/ and writes public/runs/index.json.
//
// The end-to-end build collects the fixed test runs instead, so the Playwright suite does not
// change when new real runs land in runs/:
//   tsx scripts/collect-runs.ts --runs fixtures/runs --out .e2e/public/runs
// Both paths are relative to dashboard/.

import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectRuns } from './collect';

const dashboardDir = join(dirname(fileURLToPath(import.meta.url)), '..');

function option(name: string): string | undefined {
  const at = process.argv.indexOf(name);
  if (at === -1) return undefined;
  const value = process.argv[at + 1];
  if (value === undefined || value.startsWith('--')) {
    console.error(`Haunt: ${name} needs a folder path.`);
    process.exit(1);
  }
  return value;
}

const runsArg = option('--runs');
const outArg = option('--out');
const runsDir = runsArg ? resolve(dashboardDir, runsArg) : join(dashboardDir, '..', 'runs');
const outDir = outArg ? resolve(dashboardDir, outArg) : join(dashboardDir, 'public', 'runs');
const from = runsArg ?? 'runs/';
const to = outArg ?? 'public/runs/';

try {
  const index = collectRuns({ runsDir, outDir });
  const restless = index.entries.filter((e) => e.errors.length > 0).length;
  const valid = index.entries.length - restless;
  console.log(
    `Haunt: collected ${index.entries.length} run file(s) from ${from} (${valid} valid, ${restless} restless) into ${to}.`,
  );
} catch (err) {
  console.error(`Haunt: could not read the runs folder at ${runsDir}.`);
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
