// Collect_Step CLI. Runs before `npm run dev` and `npm run build`.
// Copies ../runs/**/run.json folders into public/runs/ and writes public/runs/index.json.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectRuns } from './collect';

const dashboardDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const runsDir = join(dashboardDir, '..', 'runs');
const outDir = join(dashboardDir, 'public', 'runs');

try {
  const index = collectRuns({ runsDir, outDir });
  const restless = index.entries.filter((e) => e.errors.length > 0).length;
  const valid = index.entries.length - restless;
  console.log(
    `Haunt: collected ${index.entries.length} run file(s) from runs/ (${valid} valid, ${restless} restless) into public/runs/.`,
  );
} catch (err) {
  console.error(`Haunt: could not read the runs folder at ${runsDir}.`);
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
