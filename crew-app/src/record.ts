import { GHOSTS, type GhostId } from './ghosts.ts';

export type RunResult = 'succeeded' | 'gave_up' | 'error';
export interface FindingRef {
  type: string;
  step: number;
  title: string;
}

export interface GhostEntry {
  ghost: GhostId;
  result: RunResult | 'no_run';
  exitCode: number | null;
  runId: string | null;
  findingCounts: Record<string, number>; // by finding type
  findingTitles: string[];
  findings: FindingRef[]; // type, step, title; the input for Finding_Key
  error: string | null;
}

export interface PatrolRecord {
  version: 1;
  date: string; // IST, YYYY-MM-DD
  seed: number;
  interrupted: boolean;
  ghosts: GhostEntry[]; // always three entries in GHOSTS order
}

export type RecordResult = { ok: true; record: PatrolRecord } | { ok: false; error: string };

/** Counts findings by type. Object.fromEntries defines own properties, so odd type names are safe. */
export function countByType(findings: readonly FindingRef[]): Record<string, number> {
  const counts = new Map<string, number>();
  for (const f of findings) counts.set(f.type, (counts.get(f.type) ?? 0) + 1);
  return Object.fromEntries(counts);
}

/** Builds an entry whose counts and titles are derived from `findings`. */
export function makeEntry(
  ghost: GhostId,
  fields: { result: GhostEntry['result']; exitCode: number | null; runId: string | null; findings: FindingRef[]; error: string | null },
): GhostEntry {
  return {
    ghost,
    result: fields.result,
    exitCode: fields.exitCode,
    runId: fields.runId,
    findingCounts: countByType(fields.findings),
    findingTitles: fields.findings.map((f) => f.title),
    findings: fields.findings,
    error: fields.error,
  };
}

export function serializeRecord(record: PatrolRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}

export function parseRecord(text: string): RecordResult {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: `Not valid JSON: ${error instanceof Error ? error.message : String(error)}` };
  }
  return validateRecord(value);
}

const RESULTS: readonly string[] = ['succeeded', 'gave_up', 'error', 'no_run'];

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sameCounts(a: Record<string, number>, b: Record<string, number>): boolean {
  const ak = Object.keys(a);
  const bk = Object.keys(b);
  return ak.length === bk.length && ak.every((k) => Object.hasOwn(b, k) && a[k] === b[k]);
}

export function validateRecord(value: unknown): RecordResult {
  const fail = (error: string): RecordResult => ({ ok: false, error });
  if (!isObject(value)) return fail('The record is not an object.');
  if (value.version !== 1) return fail('The record version must be 1.');
  if (typeof value.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value.date)) return fail('The record date must look like YYYY-MM-DD.');
  if (typeof value.seed !== 'number' || !Number.isSafeInteger(value.seed)) return fail('The record seed must be a safe integer.');
  if (typeof value.interrupted !== 'boolean') return fail('The record "interrupted" must be true or false.');
  if (!Array.isArray(value.ghosts) || value.ghosts.length !== GHOSTS.length) return fail('The record must have exactly three ghost entries.');

  const seen = new Set<string>();
  const entries: GhostEntry[] = [];
  for (const [index, raw] of value.ghosts.entries()) {
    if (!isObject(raw)) return fail(`Ghost entry ${index + 1} is not an object.`);
    const ghost = raw.ghost;
    if (typeof ghost !== 'string' || !(GHOSTS as readonly string[]).includes(ghost)) return fail(`Ghost entry ${index + 1} has an unknown ghost.`);
    if (seen.has(ghost)) return fail(`The ghost "${ghost}" appears more than once.`);
    seen.add(ghost);
    if (typeof raw.result !== 'string' || !RESULTS.includes(raw.result)) return fail(`The result for "${ghost}" is not valid.`);
    if (raw.exitCode !== null && (typeof raw.exitCode !== 'number' || !Number.isInteger(raw.exitCode))) return fail(`The exit code for "${ghost}" is not valid.`);
    if (raw.runId !== null && typeof raw.runId !== 'string') return fail(`The run id for "${ghost}" is not valid.`);
    if (raw.error !== null && typeof raw.error !== 'string') return fail(`The error text for "${ghost}" is not valid.`);
    if (!Array.isArray(raw.findings)) return fail(`The findings for "${ghost}" are not a list.`);
    const findings: FindingRef[] = [];
    for (const f of raw.findings) {
      if (!isObject(f) || typeof f.type !== 'string' || typeof f.title !== 'string' || typeof f.step !== 'number' || !Number.isInteger(f.step)) {
        return fail(`A finding for "${ghost}" needs a type, a step number and a title.`);
      }
      findings.push({ type: f.type, step: f.step, title: f.title });
    }
    if (!isObject(raw.findingCounts) || !Object.values(raw.findingCounts).every((n) => typeof n === 'number')) {
      return fail(`The finding counts for "${ghost}" are not valid.`);
    }
    if (!Array.isArray(raw.findingTitles) || !raw.findingTitles.every((t) => typeof t === 'string')) {
      return fail(`The finding titles for "${ghost}" are not valid.`);
    }
    if (raw.result === 'no_run' && (raw.runId !== null || findings.length > 0)) {
      return fail(`"${ghost}" has no saved run, so it must have no run id and no findings.`);
    }
    if (!sameCounts(raw.findingCounts as Record<string, number>, countByType(findings))) {
      return fail(`The finding counts for "${ghost}" do not match its findings.`);
    }
    const titles = raw.findingTitles as string[];
    if (titles.length !== findings.length || titles.some((t, i) => t !== findings[i]?.title)) {
      return fail(`The finding titles for "${ghost}" do not match its findings.`);
    }
    entries.push({
      ghost: ghost as GhostId,
      result: raw.result as GhostEntry['result'],
      exitCode: raw.exitCode as number | null,
      runId: raw.runId as string | null,
      findingCounts: raw.findingCounts as Record<string, number>,
      findingTitles: titles,
      findings,
      error: raw.error as string | null,
    });
  }
  return {
    ok: true,
    record: { version: 1, date: value.date, seed: value.seed, interrupted: value.interrupted, ghosts: entries },
  };
}
