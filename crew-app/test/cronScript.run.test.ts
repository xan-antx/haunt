import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { tempRoot } from './tmp.ts';

// Runs cron/nightly_patrol.py with a real Python against a fake app folder whose src/patrol.ts is a
// stand-in runner, so no site starts and no ghost runs. Set HAUNT_TEST_PYTHON to pick the interpreter.

const appSource = path.resolve(import.meta.dirname, '..');

function findPython(): string | null {
  const candidates = process.env.HAUNT_TEST_PYTHON ? [process.env.HAUNT_TEST_PYTHON] : ['python3', 'python'];
  for (const candidate of candidates) {
    // The absolute path, because the tests narrow PATH to control whether node can be found.
    const probe = spawnSync(candidate, ['-c', 'import sys; print(sys.version_info[0], sys.executable)'], { encoding: 'utf8', windowsHide: true });
    const [major, executable] = probe.stdout.trim().split(' ', 2);
    if (probe.status === 0 && major === '3' && executable) return executable;
  }
  return null;
}
const python = findPython();

// Loads the script as Crew does (by file path), calls run(None) and prints what happened as JSON.
const DRIVER = `
import importlib.util, json, sys
spec = importlib.util.spec_from_file_location("nightly_patrol", sys.argv[1])
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
try:
    value = mod.run(None)
    out = {"status": "returned", "value": value}
except mod.Report as r:
    out = {"status": "report", "message": r.message}
except Exception as e:
    out = {"status": "error", "type": type(e).__name__, "error": str(e)}
sys.stdout.write("\\n" + json.dumps(out) + "\\n")
`;

// The stand-in runner prints what it was given, so the tests can check the working folder and env.
const FAKE_RUNNER = `
const env = process.env;
if (env.FAKE_STDOUT === 'ECHO') process.stdout.write('cwd=' + process.cwd() + '\\nrepo=' + env.HAUNT_REPO_ROOT + '\\n');
else process.stdout.write(env.FAKE_STDOUT ?? '');
process.stderr.write(env.FAKE_STDERR ?? '');
process.exitCode = Number(env.FAKE_EXIT ?? '0');
`;

interface Outcome {
  status: 'returned' | 'report' | 'error';
  message?: string;
  type?: string;
  error?: string;
}

let appRoot = '';
let repoRoot = '';

beforeEach(async () => {
  const tmp = await tempRoot();
  appRoot = path.join(tmp, 'apps', 'haunt-patrol');
  repoRoot = path.join(tmp, 'haunt');
  mkdirSync(path.join(appRoot, 'cron'), { recursive: true });
  mkdirSync(path.join(appRoot, 'src'), { recursive: true });
  copyFileSync(path.join(appSource, 'cron', 'nightly_patrol.py'), path.join(appRoot, 'cron', 'nightly_patrol.py'));
  writeFileSync(path.join(appRoot, 'src', 'patrol.ts'), FAKE_RUNNER, 'utf8');
  mkdirSync(path.join(repoRoot, 'engine', 'bin'), { recursive: true });
  writeFileSync(path.join(repoRoot, 'engine', 'bin', 'haunt.mjs'), '', 'utf8');
});

function runCron(env: Record<string, string | undefined>): Outcome {
  const base = { ...process.env };
  delete base.HAUNT_REPO_ROOT;
  const result = spawnSync(python as string, ['-c', DRIVER, path.join(appRoot, 'cron', 'nightly_patrol.py')], {
    cwd: appRoot,
    env: { ...base, PATH: path.dirname(process.execPath), ...env },
    encoding: 'utf8',
    windowsHide: true,
    timeout: 60_000,
  });
  expect(result.status, result.stderr).toBe(0);
  const last = result.stdout.trim().split(/\r?\n/).pop() ?? '';
  return JSON.parse(last) as Outcome;
}

function patrolLog(): string {
  const file = path.join(appRoot, 'data', 'logs', 'patrol.log');
  return existsSync(file) ? readFileSync(file, 'utf8') : '';
}

describe.skipIf(python === null)('cron/nightly_patrol.py run(ctx)', () => {
  it('raises Report with the summary text, which Crew records as the result', () => {
    const outcome = runCron({ HAUNT_REPO_ROOT: repoRoot, FAKE_STDOUT: '# Haunt Patrol, 2026-11-24 (IST)\n\nBebe: succeeded ₹\n' });
    expect(outcome).toEqual({ status: 'report', message: '# Haunt Patrol, 2026-11-24 (IST)\n\nBebe: succeeded ₹' });
  });

  it('runs the runner in the repository with HAUNT_REPO_ROOT passed on', () => {
    const outcome = runCron({ HAUNT_REPO_ROOT: repoRoot, FAKE_STDOUT: 'ECHO' });
    expect(outcome.message).toBe(`cwd=${repoRoot}\nrepo=${repoRoot}`);
  });

  it('logs the repository root, the node path, the command, the exit code and the output', () => {
    runCron({ HAUNT_REPO_ROOT: repoRoot, FAKE_STDOUT: 'summary line\n', FAKE_STDERR: 'a warning\n' });
    const log = patrolLog();
    expect(log).toContain(`Repository root: ${repoRoot} (from HAUNT_REPO_ROOT)`);
    expect(log).toMatch(/Node: .*node(\.exe)?\s*$/im);
    expect(log).toContain('Command: ');
    expect(log).toContain(path.join(appRoot, 'src', 'patrol.ts'));
    expect(log).toContain('Exit code: 0');
    expect(log).toMatch(/Output:\r?\n {4}summary line/);
    expect(log).toMatch(/Errors:\r?\n {4}a warning/);
    expect(log).toContain('Returning the summary');
  });

  it('appends to the log on every run', () => {
    runCron({ HAUNT_REPO_ROOT: repoRoot, FAKE_STDOUT: 'one\n' });
    runCron({ HAUNT_REPO_ROOT: repoRoot, FAKE_STDOUT: 'two\n' });
    expect(patrolLog().match(/Patrol starting/g)).toHaveLength(2);
  });

  it('fails with the exit code, its meaning and the error text when the patrol exits non-zero', () => {
    const outcome = runCron({ HAUNT_REPO_ROOT: repoRoot, FAKE_EXIT: '1', FAKE_STDERR: '- Playwright Chromium. Fix: npx playwright install chromium in engine/\n' });
    expect(outcome.status).toBe('error');
    expect(outcome.type).toBe('RuntimeError');
    expect(outcome.error).toContain('exited with code 1: A prerequisite is missing.');
    expect(outcome.error).toContain('npx playwright install chromium in engine/');
    const log = patrolLog();
    expect(log).toContain('Exit code: 1');
    expect(log).toContain('ERROR: Haunt Patrol exited with code 1');
  });

  it('fails when the patrol exits 0 without a summary', () => {
    const outcome = runCron({ HAUNT_REPO_ROOT: repoRoot, FAKE_STDOUT: '' });
    expect(outcome.status).toBe('error');
    expect(outcome.error).toContain('printed no summary');
  });

  it('fails clearly when HAUNT_REPO_ROOT is not set and no repository is next to the app', () => {
    const outcome = runCron({});
    expect(outcome.status).toBe('error');
    expect(outcome.error).toContain('HAUNT_REPO_ROOT is not set');
    expect(patrolLog()).toContain('ERROR: Haunt Patrol cannot find the Haunt repository');
  });

  it('fails clearly when HAUNT_REPO_ROOT names a folder that does not exist', () => {
    const missing = path.join(repoRoot, 'nope');
    const outcome = runCron({ HAUNT_REPO_ROOT: missing });
    expect(outcome.status).toBe('error');
    expect(outcome.error).toContain(`HAUNT_REPO_ROOT is set to ${missing}, but that folder does not exist`);
  });

  it('fails clearly when HAUNT_REPO_ROOT has no engine', () => {
    const outcome = runCron({ HAUNT_REPO_ROOT: appRoot });
    expect(outcome.status).toBe('error');
    expect(outcome.error).toContain('cannot find the engine');
    expect(outcome.error).toContain(path.join(appRoot, 'engine', 'bin', 'haunt.mjs'));
  });

  it('fails clearly when node is not on PATH, and starts nothing', () => {
    const outcome = runCron({ HAUNT_REPO_ROOT: repoRoot, PATH: path.join(repoRoot, 'engine') });
    expect(outcome.status).toBe('error');
    expect(outcome.error).toContain('cannot find node on PATH');
    expect(patrolLog()).not.toContain('Command: ');
  });
});
