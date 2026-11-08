// Property test runner (Req 1.8–1.11). Used by `npm run test:properties`.
//
// Runs every Property_Test once with `vitest run -t PROPERTY_TEST_PATTERN`,
// then reads Vitest's JSON report and fails when zero tests ran, when any test
// failed, or when Vitest itself exited non-zero.
//
// Vitest is started as `node node_modules/vitest/vitest.mjs`, which is the same
// entry `npx vitest` resolves to. Running it through the current Node binary
// needs no shell, so the pattern (which contains `^`, `(`, `)` and `*`) reaches
// Vitest unchanged on Windows, macOS and Linux, and nothing is ever parsed by
// cmd.exe or sh.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROPERTY_TEST_PATTERN } from './propertyTestPattern';

/** The fields of Vitest's JSON report that the runner reads. */
export interface VitestJsonReport {
  numPassedTests: number;
  numFailedTests: number;
}

export interface ExitDecision {
  exitCode: 0 | 1;
  message?: string;
}

export const NO_TESTS_MESSAGE =
  "No Property_Tests ran. Property_Test describe names must start with 'Feature: <spec name>, Property' and be top level.";

export const NO_REPORT_MESSAGE = 'Vitest did not produce a report.';

/**
 * Decides the runner's exit code from Vitest's JSON report and exit code.
 * `report` is null or undefined when Vitest did not write a report.
 * `vitestExitCode` is null when Vitest was killed by a signal.
 */
export function decideExit(
  report: VitestJsonReport | null | undefined,
  vitestExitCode: number | null,
): ExitDecision {
  if (report == null) {
    return { exitCode: 1, message: NO_REPORT_MESSAGE };
  }
  if (report.numPassedTests + report.numFailedTests === 0) {
    return { exitCode: 1, message: NO_TESTS_MESSAGE };
  }
  if (report.numFailedTests > 0 || vitestExitCode !== 0) {
    return { exitCode: 1 };
  }
  return { exitCode: 0 };
}

function readReport(path: string): VitestJsonReport | null {
  if (!existsSync(path)) return null;
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as Record<string, unknown>).numPassedTests === 'number' &&
      typeof (parsed as Record<string, unknown>).numFailedTests === 'number'
    ) {
      return parsed as VitestJsonReport;
    }
    return null;
  } catch {
    return null;
  }
}

function main(): number {
  const dashboardDir = join(dirname(fileURLToPath(import.meta.url)), '..');
  const vitestEntry = join(dashboardDir, 'node_modules', 'vitest', 'vitest.mjs');
  const reportPath = join(tmpdir(), 'haunt-properties.json');

  if (!existsSync(vitestEntry)) {
    console.error(`Haunt: Vitest is not installed (looked for ${vitestEntry}). Run npm install in dashboard/.`);
    return 1;
  }

  // A report left over from an earlier run must never be mistaken for this one.
  rmSync(reportPath, { force: true });

  const result = spawnSync(
    process.execPath,
    [
      vitestEntry,
      'run',
      '-t',
      PROPERTY_TEST_PATTERN,
      '--reporter=default',
      '--reporter=json',
      `--outputFile.json=${reportPath}`,
    ],
    { cwd: dashboardDir, stdio: 'inherit', shell: false },
  );

  if (result.error) {
    console.error(`Haunt: could not start Vitest: ${result.error.message}`);
  }

  const decision = decideExit(readReport(reportPath), result.status);
  if (decision.message) console.error(`Haunt: ${decision.message}`);
  return decision.exitCode;
}

function isRunDirectly(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  const a = resolve(entry);
  const b = resolve(fileURLToPath(import.meta.url));
  // Windows paths are case-insensitive, and the drive letter case can differ.
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

if (isRunDirectly()) {
  process.exit(main());
}
