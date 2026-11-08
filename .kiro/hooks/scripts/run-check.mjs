// Runs a command in a folder. Silent on success; on failure prints the output
// tail to stderr and exits 2 so the hook system reports it to the agent.
// Usage: node run-check.mjs <label> <folder> <command...>
import { spawnSync } from 'node:child_process';

const [label, folder, ...cmd] = process.argv.slice(2);
const result = spawnSync(cmd.join(' '), { cwd: folder, shell: true, encoding: 'utf8' });
if (result.status === 0) process.exit(0);

const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim().split('\n').slice(-60).join('\n');
process.stderr.write(`${label} FAILED (exit ${result.status}) in ${folder}:\n${output}\n`);
process.exit(2);
