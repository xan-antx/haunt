// After a spec task: run `npm run build` in each project folder that has uncommitted
// changes (the folder the task worked in). Exits 2 with the errors if any build fails.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const candidates = ['engine', 'demo-site', 'dashboard'];
const status = spawnSync('git status --porcelain', { shell: true, encoding: 'utf8' }).stdout ?? '';
const changed = candidates.filter(dir => status.split('\n').some(line => line.slice(3).replace(/\\/g, '/').startsWith(`${dir}/`)));

const failures = [];
for (const dir of changed) {
  const pkgPath = `${dir}/package.json`;
  if (!existsSync(pkgPath)) continue;
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (!pkg.scripts?.build) continue;
  const result = spawnSync('npm run build', { cwd: dir, shell: true, encoding: 'utf8' });
  if (result.status !== 0) {
    const tail = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim().split('\n').slice(-60).join('\n');
    failures.push(`npm run build FAILED in ${dir}/:\n${tail}`);
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join('\n\n')}\n`);
  process.exit(2);
}
process.exit(0);
