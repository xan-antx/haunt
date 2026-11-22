import path from 'node:path';
import type { FindingRef, RunResult } from './record.ts';

// The types live in record.ts so the UI can import record.ts without pulling in Node-only code.
export type { FindingRef, RunResult } from './record.ts';

export type RunExtract =
  | { ok: true; runId: string; result: RunResult; findings: FindingRef[] }
  | { ok: false; error: string };

const RESULTS: readonly string[] = ['succeeded', 'gave_up', 'error'];

/** Pure: takes the text of run.json. Never throws. */
export function extractRunSummary(jsonText: string, folderName: string): RunExtract {
  try {
    let value: unknown;
    try {
      value = JSON.parse(jsonText);
    } catch (error) {
      return { ok: false, error: `The run file is not valid JSON: ${error instanceof Error ? error.message : String(error)}` };
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return { ok: false, error: 'The run file is not a JSON object.' };
    }
    const obj = value as Record<string, unknown>;
    const result = obj.result;
    if (typeof result !== 'string' || !RESULTS.includes(result)) {
      return { ok: false, error: 'The run file has no valid result (expected succeeded, gave_up or error).' };
    }
    const rawFindings = obj.findings === undefined ? [] : obj.findings;
    if (!Array.isArray(rawFindings)) return { ok: false, error: 'The run file findings are not a list.' };
    const findings: FindingRef[] = [];
    for (const [index, item] of rawFindings.entries()) {
      const f = item as Record<string, unknown> | null;
      if (
        typeof f !== 'object' ||
        f === null ||
        typeof f.type !== 'string' ||
        typeof f.title !== 'string' ||
        typeof f.step !== 'number' ||
        !Number.isInteger(f.step)
      ) {
        return { ok: false, error: `Finding ${index + 1} in the run file needs a type, a step number and a title.` };
      }
      findings.push({ type: f.type, step: f.step, title: f.title });
    }
    const runId = typeof obj.runId === 'string' && obj.runId !== '' ? obj.runId : folderName;
    if (runId === '') return { ok: false, error: 'The run file has no run id and the folder name is empty.' };
    return { ok: true, runId, result: result as RunResult, findings };
  } catch (error) {
    return { ok: false, error: `The run file could not be read: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * The last stdout line (trimmed) that is an absolute path ending in run.json, or null.
 * Absolute means path.isAbsolute on the running platform. Other lines are ignored.
 */
export function savedRunPath(stdout: string): string | null {
  const found = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => path.isAbsolute(line) && /[\\/]run\.json$/.test(line));
  return found[found.length - 1] ?? null;
}
