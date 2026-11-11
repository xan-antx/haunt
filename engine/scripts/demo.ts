// npm run demo (haunt-engine spec, Requirement 12.7).
//
// Empties engine/test-output/demo-run/, starts Lantern Bills through the Lantern_Bills_Harness,
// runs The Listener through the real CLI with --out test-output/demo-run, checks the run.json
// against the Run_Schema, prints its absolute path as the last line, and stops the server in finally.
// Nothing goes through a shell: the folder is emptied with fs.rm and the CLI runs as `node bin/haunt.mjs`.

import { spawn } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateSchema } from '../src/contract/schema.ts';
import { startLanternBills, type LanternBills } from '../e2e/harness/lanternBills.ts';

const ENGINE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ENGINE_DIR, 'bin', 'haunt.mjs');
const OUT_RELATIVE = 'test-output/demo-run';
const OUT_DIR = path.join(ENGINE_DIR, 'test-output', 'demo-run');
const RUN_TIMEOUT_MS = 240_000;

class DemoError extends Error {}

interface CliResult {
  code: number | null;
  stdout: string;
}

/** Runs the CLI as a child process. Its standard error (progress lines) is shown as it arrives. */
function runCli(args: string[]): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd: ENGINE_DIR,
      stdio: ['ignore', 'pipe', 'inherit'],
      windowsHide: true,
      shell: false,
    });
    let stdout = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    const timer = setTimeout(() => child.kill(), RUN_TIMEOUT_MS);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout });
    });
  });
}

async function runListener(url: string): Promise<string> {
  console.error(`Running The Listener against ${url} into ${OUT_RELATIVE}/`);
  const result = await runCli(['run', '--ghost', 'listener', '--mission', 'pay-bill', '--url', url, '--out', OUT_RELATIVE]);
  const lines = result.stdout.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
  const last = lines[lines.length - 1];
  if (result.code !== 0 || last === undefined || !path.isAbsolute(last)) {
    throw new DemoError(
      `The Listener's run failed (exit code ${String(result.code)}).${result.stdout.trim() ? `\n${result.stdout.trim()}` : ''}`,
    );
  }
  const relative = path.relative(OUT_DIR, last);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new DemoError(`The CLI wrote ${last}, which is outside ${OUT_DIR}.`);
  }
  return last;
}

async function checkSchema(runJsonPath: string): Promise<void> {
  const json = JSON.parse(await readFile(runJsonPath, 'utf8')) as unknown;
  const problems = validateSchema(json);
  if (problems.length > 0) {
    const list = problems.map((p) => `  ${p.path === '' ? '(root)' : p.path}: ${p.message}`).join('\n');
    throw new DemoError(`${runJsonPath} does not pass the Run_Schema:\n${list}`);
  }
  console.error('run.json passes the Run_Schema.');
}

async function main(argv: string[]): Promise<number> {
  if (argv.length > 0) {
    console.error(`Unknown argument(s): ${argv.join(' ')}. Usage: npm run demo`);
    return 2;
  }

  await rm(OUT_DIR, { recursive: true, force: true });

  let lantern: LanternBills | undefined;
  try {
    console.error('Building and starting Lantern Bills on port 3000...');
    lantern = await startLanternBills({ log: (line) => console.error(line) });
    const runJsonPath = await runListener(lantern.url);
    await checkSchema(runJsonPath);
    console.log(runJsonPath);
    return 0;
  } finally {
    if (lantern) {
      await lantern.stop();
      console.error('Lantern Bills stopped.');
    }
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  },
);
