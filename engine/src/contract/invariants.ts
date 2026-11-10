import type { Problem } from './types.ts';
import { validateSchema } from './schema.ts';

/**
 * Run_Invariants: rules the engine's own output must follow. They are stricter than
 * the Run_Schema, which also has to accept the hand-written samples.
 *
 * Every function here accepts `unknown` and never throws. A part of the run that has
 * the wrong type is skipped, because the schema layer already reports it.
 */

/** The most Steps a Run may have. */
export const MAX_STEPS = 60;

/** Size of the screenshots in a Run, in pixels. */
export interface ScreenshotSize {
  width: number;
  height: number;
}

export interface ValidateOptions {
  /**
   * Size of the Run's screenshots (viewport size times device scale factor).
   * When given, a `focusBox` must lie inside it. When omitted, the size is unknown
   * and a `focusBox` is only checked for `w > 0` and `h > 0`.
   */
  screenshotSize?: ScreenshotSize;
}

const SHOT_PATTERN = /^shots\/\d{3}(-seen)?\.png$/;
const RUN_ID_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})Z-(listener|phantom|bebe)-([a-z0-9]+(?:-[a-z0-9]+)*)$/;
const STARTED_AT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})Z$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function describe(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return String(value);
  return typeof value;
}

function padStep(n: number): string {
  return String(n).padStart(3, '0');
}

/** True when the string is a real calendar date and time in UTC (no leap seconds). */
function isRealDateTime(y: number, mo: number, d: number, h: number, mi: number, s: number): boolean {
  if (mo < 1 || mo > 12 || h > 23 || mi > 59 || s > 59 || d < 1) return false;
  const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return d <= daysInMonth;
}

function checkRunId(run: Record<string, unknown>, out: Problem[]): void {
  const { runId, ghost, mission, startedAt } = run;
  if (typeof runId !== 'string') return;

  const match = RUN_ID_PATTERN.exec(runId);
  if (!match) {
    out.push({
      path: 'runId',
      message: `must look like YYYY-MM-DDTHHmmZ-<ghost>-<mission>, got ${describe(runId)}`,
    });
    return;
  }
  const [, year, month, day, hour, minute, idGhost, rest] = match as unknown as string[];

  if (typeof ghost === 'string' && idGhost !== ghost) {
    out.push({ path: 'runId', message: `ghost in the Run_Id is ${describe(idGhost)}, but ghost is ${describe(ghost)}` });
  }

  if (typeof startedAt === 'string') {
    const started = STARTED_AT_PATTERN.exec(startedAt);
    if (started) {
      const idTime = `${year}-${month}-${day}T${hour}:${minute}`;
      const startedTime = `${started[1]}-${started[2]}-${started[3]}T${started[4]}:${started[5]}`;
      if (idTime !== startedTime) {
        out.push({
          path: 'runId',
          message: `time in the Run_Id is ${idTime}, but startedAt is ${startedTime} to the minute`,
        });
      }
    }
  }

  const missionId = isRecord(mission) ? mission['id'] : undefined;
  if (typeof missionId === 'string' && missionId !== '') {
    // The mission may be followed by a numeric uniqueness suffix: -2, -3, ...
    const suffix = rest!.startsWith(`${missionId}-`) ? rest!.slice(missionId.length + 1) : null;
    const hasSuffix = suffix !== null && /^\d+$/.test(suffix) && Number(suffix) >= 2;
    if (rest !== missionId && !hasSuffix) {
      out.push({
        path: 'runId',
        message: `mission in the Run_Id is ${describe(rest)}, but mission.id is ${describe(missionId)}`,
      });
    }
  }
}

function checkStartedAt(run: Record<string, unknown>, out: Problem[]): void {
  const { startedAt } = run;
  if (typeof startedAt !== 'string') return;
  const m = STARTED_AT_PATTERN.exec(startedAt);
  if (!m || !isRealDateTime(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]))) {
    out.push({ path: 'startedAt', message: `must be a UTC time like YYYY-MM-DDTHH:mm:ssZ, got ${describe(startedAt)}` });
  }
}

function checkShotFile(
  path: string,
  value: unknown,
  available: ReadonlySet<string>,
  out: Problem[],
): value is string {
  if (typeof value !== 'string') return false;
  if (!SHOT_PATTERN.test(value)) {
    out.push({ path, message: `must match shots/NNN.png or shots/NNN-seen.png, got ${describe(value)}` });
    return false;
  }
  if (!available.has(value)) {
    out.push({ path, message: `${describe(value)} is not among the screenshots to be written` });
    return false;
  }
  return true;
}

function checkFocusBox(path: string, box: unknown, size: ScreenshotSize | undefined, out: Problem[]): void {
  if (!isRecord(box)) return;
  const { x, y, w, h } = box;
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(w) || !isFiniteNumber(h)) return;
  if (w <= 0) out.push({ path: `${path}.w`, message: `must be greater than 0, got ${w}` });
  if (h <= 0) out.push({ path: `${path}.h`, message: `must be greater than 0, got ${h}` });
  if (!size || w <= 0 || h <= 0) return;
  if (x < 0 || y < 0 || x + w > size.width || y + h > size.height) {
    out.push({
      path,
      message: `must lie inside the ${size.width}x${size.height} screenshot, got x=${x}, y=${y}, w=${w}, h=${h}`,
    });
  }
}

function checkSteps(steps: unknown[], available: ReadonlySet<string>, options: ValidateOptions, out: Problem[]): void {
  if (steps.length > MAX_STEPS) {
    out.push({ path: 'steps', message: `must have at most ${MAX_STEPS} Steps, got ${steps.length}` });
  }
  steps.forEach((step, i) => {
    if (!isRecord(step)) return;
    const base = `steps[${i}]`;
    const n = step['n'];

    if (isFiniteNumber(n) && n !== i + 1) {
      out.push({ path: `${base}.n`, message: `expected ${i + 1}, got ${n}` });
    }

    const shot = step['screenshot'];
    const listed = checkShotFile(`${base}.screenshot`, shot, available, out);
    // A listed file already matches the pattern; an unlisted one may not have been checked for its name.
    if (typeof shot === 'string' && Number.isInteger(n) && (listed || SHOT_PATTERN.test(shot))) {
      const expected = `shots/${padStep(n as number)}.png`;
      if (shot !== expected) {
        out.push({ path: `${base}.screenshot`, message: `expected ${describe(expected)}, got ${describe(shot)}` });
      }
    }

    if (typeof step['thought'] === 'string' && step['thought'].trim() === '') {
      out.push({ path: `${base}.thought`, message: 'must not be empty' });
    }

    if ('focusBox' in step) checkFocusBox(`${base}.focusBox`, step['focusBox'], options.screenshotSize, out);
  });
}

function checkFindings(
  findings: unknown[],
  steps: unknown[],
  available: ReadonlySet<string>,
  out: Problem[],
): void {
  const stepNumbers = new Set<number>();
  for (const step of steps) {
    if (isRecord(step) && isFiniteNumber(step['n'])) stepNumbers.add(step['n']);
  }
  findings.forEach((finding, i) => {
    if (!isRecord(finding)) return;
    const base = `findings[${i}]`;
    const stepRef = finding['step'];
    if (isFiniteNumber(stepRef) && !stepNumbers.has(stepRef)) {
      out.push({ path: `${base}.step`, message: `refers to Step ${stepRef}, which does not exist` });
    }
    checkShotFile(`${base}.screenshot`, finding['screenshot'], available, out);
  });
}

/**
 * Checks the Run_Invariants only. Never throws.
 * `screenshotNames` are the file names about to be written, e.g. `shots/001.png`.
 */
export function validateInvariants(
  run: unknown,
  screenshotNames: Iterable<string>,
  options: ValidateOptions = {},
): Problem[] {
  const out: Problem[] = [];
  try {
    if (!isRecord(run)) return out;
    const available = new Set<string>(screenshotNames);

    checkRunId(run, out);
    checkStartedAt(run, out);

    const steps = Array.isArray(run['steps']) ? (run['steps'] as unknown[]) : [];
    if (Array.isArray(run['steps'])) checkSteps(steps, available, options, out);
    if (Array.isArray(run['findings'])) checkFindings(run['findings'] as unknown[], steps, available, out);
  } catch (error) {
    out.push({
      path: '',
      message: `could not check the Run_Invariants: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
  return out;
}

/**
 * Checks a run against the Run_Schema and the Run_Invariants. Returns one
 * `{ path, message }` per problem, for example `steps[3].n: expected 4, got 5`.
 * An empty list means the run is valid. Never throws.
 *
 * The invariants run even when the schema reports problems; they skip any part
 * that has the wrong type, so the same fault is not reported twice.
 */
export function validate(
  run: unknown,
  screenshotNames: Iterable<string>,
  options: ValidateOptions = {},
): Problem[] {
  let schemaProblems: Problem[];
  try {
    schemaProblems = validateSchema(run);
  } catch (error) {
    schemaProblems = [
      {
        path: '',
        message: `could not check the Run_Schema: ${error instanceof Error ? error.message : String(error)}`,
      },
    ];
  }
  return [...schemaProblems, ...validateInvariants(run, screenshotNames, options)];
}

/** Formats a problem as `path: message`, or just the message when the path is empty. */
export function formatProblem(problem: Problem): string {
  return problem.path === '' ? problem.message : `${problem.path}: ${problem.message}`;
}
