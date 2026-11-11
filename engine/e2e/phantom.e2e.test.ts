// End-to-end test for The Phantom (haunt-engine spec, Requirements 20.4 and 20.6).
//
// It starts Lantern Bills on port 3000 through the harness, runs the real CLI 10 times in sequence
// as child processes with seeds 1 to 10, and checks:
//   - every run exits with 0 and prints the path of a readable run.json;
//   - at least 9 of the 10 runs have a `misclick` Finding;
//   - every run.json passes the Run_Schema, the Run_Invariants and the dashboard's validateRun with no errors;
//   - demo-site/ is exactly as it was before (git status unchanged).
// On failure the assertion message carries a table with one row per run.

import { execFile } from 'node:child_process';
import { readdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { validateRun } from '../../dashboard/src/data/validate.ts';
import { validate } from '../src/contract/invariants.ts';
import { validateSchema } from '../src/contract/schema.ts';
import type { Problem } from '../src/contract/types.ts';
import { startLanternBills, type LanternBills } from './harness/lanternBills.ts';

const execFileAsync = promisify(execFile);

const RUN_COUNT = 10;
const REQUIRED_RUNS = 9;
const PER_RUN_TIMEOUT_MS = 240_000;
/** 360 x 640 CSS px at device scale factor 2. */
const SCREENSHOT_SIZE = { width: 720, height: 1280 };

const ENGINE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_DIR = path.resolve(ENGINE_DIR, '..');
const OUT_RELATIVE = 'test-output/e2e/phantom';
const OUT_DIR = path.join(ENGINE_DIR, 'test-output', 'e2e', 'phantom');
const CLI = path.join(ENGINE_DIR, 'bin', 'haunt.mjs');

interface RunRecord {
  index: number;
  seed: number;
  exitCode: number | string | null;
  stdout: string;
  stderrTail: string;
  runJsonPath: string | null;
  json: unknown;
  readError: string | null;
}

interface RunView {
  result: string;
  findingTypes: string[];
  stepCount: number;
  lastThought: string;
}

let lantern: LanternBills | undefined;
let gitBeforeOthers = '';
const records: RunRecord[] = [];

/** Read-only `git status --porcelain -- <paths>` in the repository root. */
async function gitStatus(...paths: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', ['status', '--porcelain', '--', ...paths], {
    cwd: REPO_DIR,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function viewOf(record: RunRecord): RunView {
  const json = record.json;
  if (!isRecord(json)) return { result: '(no run.json)', findingTypes: [], stepCount: 0, lastThought: '' };
  const steps = Array.isArray(json['steps']) ? json['steps'] : [];
  const findings = Array.isArray(json['findings']) ? json['findings'] : [];
  const last = steps[steps.length - 1];
  return {
    result: typeof json['result'] === 'string' ? json['result'] : '(no result)',
    findingTypes: findings.flatMap((f) => (isRecord(f) && typeof f['type'] === 'string' ? [f['type']] : [])),
    stepCount: steps.length,
    lastThought: isRecord(last) && typeof last['thought'] === 'string' ? last['thought'] : '',
  };
}

function clip(text: string, max: number): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** One row per run: index, seed, exit code, result, steps, finding types, last thought, path. */
function describeRuns(): string {
  const rows = records.map((record) => {
    const view = viewOf(record);
    return [
      String(record.index),
      String(record.seed),
      String(record.exitCode),
      view.result,
      String(view.stepCount),
      view.findingTypes.length > 0 ? view.findingTypes.join(', ') : '(none)',
      clip(view.lastThought, 110) || '(none)',
      record.runJsonPath ?? `(no path) ${clip(record.stderrTail, 120)}`,
    ];
  });
  const header = ['run', 'seed', 'exit', 'result', 'steps', 'finding types', 'last thought', 'run.json'];
  const widths = header.map((h, c) => Math.max(h.length, ...rows.map((r) => (r[c] ?? '').length)));
  const line = (cells: string[]): string => cells.map((cell, c) => cell.padEnd(widths[c] ?? 0)).join(' | ');
  return [line(header), widths.map((w) => '-'.repeat(w)).join('-+-'), ...rows.map(line)].join('\n');
}

function withTable(message: string): string {
  return `${message}\n\n${describeRuns()}\n`;
}

function formatProblems(problems: readonly Problem[]): string {
  return problems.map((p) => (p.path === '' ? p.message : `${p.path}: ${p.message}`)).join('; ');
}

async function runCli(index: number): Promise<RunRecord> {
  const seed = index;
  const args = [
    CLI, 'run',
    '--ghost', 'phantom',
    '--mission', 'pay-bill',
    '--url', 'http://localhost:3000',
    '--out', OUT_RELATIVE,
    '--seed', String(seed),
  ];
  const record: RunRecord = {
    index,
    seed,
    exitCode: null,
    stdout: '',
    stderrTail: '',
    runJsonPath: null,
    json: undefined,
    readError: null,
  };
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, args, {
      cwd: ENGINE_DIR,
      env: { ...process.env, HAUNT_UNDER_TEST: '1' },
      timeout: PER_RUN_TIMEOUT_MS,
      maxBuffer: 50 * 1024 * 1024,
      windowsHide: true,
      shell: false,
    });
    record.exitCode = 0;
    record.stdout = stdout;
    record.stderrTail = stderr.slice(-1_500);
  } catch (error) {
    const e = error as { code?: number | string; stdout?: string; stderr?: string; killed?: boolean; message?: string };
    record.exitCode = e.killed === true ? 'timeout' : (e.code ?? 'failed');
    record.stdout = e.stdout ?? '';
    record.stderrTail = (e.stderr ?? e.message ?? '').slice(-1_500);
  }

  const lines = record.stdout.split(/\r?\n/).filter((l) => l.trim() !== '');
  const lastLine = lines[lines.length - 1];
  if (lastLine !== undefined && path.isAbsolute(lastLine.trim())) {
    record.runJsonPath = lastLine.trim();
    try {
      record.json = JSON.parse(await readFile(record.runJsonPath, 'utf8')) as unknown;
    } catch (error) {
      record.readError = error instanceof Error ? error.message : String(error);
    }
  }
  return record;
}

describe('The Phantom on Lantern Bills (end to end)', () => {
  beforeAll(async () => {
    gitBeforeOthers = await gitStatus('dashboard', 'runs');
    lantern = await startLanternBills({ log: (line) => console.error(line) });
  });

  afterAll(async () => {
    // The server is stopped first, so a failure in any test still frees port 3000.
    await lantern?.stop();
    if (lantern) {
      await lantern.assertDemoSiteUnchanged();
      expect(await gitStatus('dashboard', 'runs'), 'git status of dashboard/ and runs/ changed during the tests').toBe(
        gitBeforeOthers,
      );
    }
  });

  it(`runs the real CLI ${RUN_COUNT} times in sequence (seeds 1 to ${RUN_COUNT}) and every run exits with 0`, async () => {
    expect(lantern, 'Lantern Bills was not started').toBeDefined();
    // Only this folder is emptied.
    expect(path.relative(ENGINE_DIR, OUT_DIR).split(path.sep).join('/')).toBe(OUT_RELATIVE);
    await rm(OUT_DIR, { recursive: true, force: true });

    records.length = 0;
    for (let i = 1; i <= RUN_COUNT; i += 1) {
      const record = await runCli(i);
      records.push(record);
      const view = viewOf(record);
      console.error(
        `run ${i}/${RUN_COUNT} (seed ${record.seed}): exit ${String(record.exitCode)}, ${view.result}, ${view.stepCount} steps, [${view.findingTypes.join(', ')}]`,
      );
    }

    const bad = records.filter((r) => r.exitCode !== 0 || r.runJsonPath === null || r.readError !== null);
    expect(
      bad.map((r) => r.index),
      withTable(
        `These runs did not exit with 0 and print a readable run.json path:\n${bad
          .map((r) => `  run ${r.index}: exit ${String(r.exitCode)}; ${r.readError ?? clip(r.stderrTail, 400)}`)
          .join('\n')}`,
      ),
    ).toEqual([]);
    expect(records).toHaveLength(RUN_COUNT);
  });

  it(`at least ${REQUIRED_RUNS} of ${RUN_COUNT} runs have a misclick Finding`, () => {
    expect(records, 'the runs did not happen').toHaveLength(RUN_COUNT);
    const good = records.filter((r) => viewOf(r).findingTypes.includes('misclick'));
    expect(
      good.length,
      withTable(`Only ${good.length} of ${RUN_COUNT} runs have a misclick Finding; ${REQUIRED_RUNS} are required.`),
    ).toBeGreaterThanOrEqual(REQUIRED_RUNS);
  });

  it('every run.json passes the Run_Schema, the Run_Invariants and the dashboard validateRun', async () => {
    expect(records, 'the runs did not happen').toHaveLength(RUN_COUNT);
    const failures: string[] = [];

    for (const record of records) {
      if (record.runJsonPath === null) {
        failures.push(`run ${record.index}: no run.json`);
        continue;
      }
      const folder = path.dirname(record.runJsonPath);
      const shotNames = (await readdir(path.join(folder, 'shots'))).map((name) => `shots/${name}`);

      const schemaProblems = validateSchema(record.json);
      if (schemaProblems.length > 0) failures.push(`run ${record.index}, Run_Schema: ${formatProblems(schemaProblems)}`);

      const problems = validate(record.json, shotNames, { screenshotSize: SCREENSHOT_SIZE });
      if (problems.length > 0) failures.push(`run ${record.index}, Run_Schema + Run_Invariants: ${formatProblems(problems)}`);

      const loaded = validateRun(record.json, {
        key: path.basename(folder),
        folder: path.basename(folder),
        origin: 'runs',
      });
      if (!loaded.ok) {
        failures.push(`run ${record.index}, dashboard validateRun: ${formatProblems(loaded.errors)}`);
      }
    }

    expect(failures, withTable(`Some runs are not valid:\n${failures.map((f) => `  ${f}`).join('\n')}`)).toEqual([]);
  });

  it('leaves demo-site/, dashboard/ and runs/ unchanged', async () => {
    expect(lantern, 'Lantern Bills was not started').toBeDefined();
    await lantern?.assertDemoSiteUnchanged();
    expect(await gitStatus('dashboard', 'runs'), 'git status of dashboard/ and runs/ changed during the tests').toBe(
      gitBeforeOthers,
    );
  });
});
