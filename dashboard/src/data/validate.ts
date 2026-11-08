// Hand-written validator for run files. Shared by the Collect_Step and the Data_Module.
// It never throws: every problem becomes a ValidationIssue in plain words.

import { isSafeScreenshotPath } from './screenshots';
import {
  FINDING_TYPES,
  GHOST_IDS,
  RUN_RESULTS,
  type Finding,
  type FindingType,
  type FocusBox,
  type GhostId,
  type LoadedRun,
  type Mission,
  type RunMeta,
  type RunResult,
  type Site,
  type Step,
  type ValidationIssue,
} from './types';

type Obj = Record<string, unknown>;

const ISO_8601 =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

function isObject(value: unknown): value is Obj {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Describes a value in plain words for error messages. */
export function describe(value: unknown): string {
  if (value === undefined) return 'nothing';
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'a list';
  if (typeof value === 'object') return 'an object';
  if (typeof value === 'string') {
    const shown = value.length > 40 ? `${value.slice(0, 40)}…` : value;
    return JSON.stringify(shown);
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return typeof value;
}

function allowed(values: readonly string[]): string {
  return values.map((v) => `"${v}"`).join(', ');
}

class Checker {
  errors: ValidationIssue[] = [];
  warnings: ValidationIssue[] = [];

  error(path: string, message: string): void {
    this.errors.push({ path, message });
  }

  warn(path: string, message: string): void {
    this.warnings.push({ path, message });
  }

  string(obj: Obj, field: string, path: string, opts: { nonEmpty?: boolean } = {}): string {
    const value = obj[field];
    if (typeof value !== 'string') {
      this.error(path, `expected text, got ${describe(value)}`);
      return '';
    }
    if (opts.nonEmpty && value.trim() === '') {
      this.error(path, 'expected text, got an empty string');
    }
    return value;
  }

  number(obj: Obj, field: string, path: string): number {
    const value = obj[field];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      this.error(path, `expected a number, got ${describe(value)}`);
      return 0;
    }
    return value;
  }

  object(obj: Obj, field: string, path: string): Obj {
    const value = obj[field];
    if (!isObject(value)) {
      this.error(path, `expected an object, got ${describe(value)}`);
      return {};
    }
    return value;
  }

  oneOf<T extends string>(obj: Obj, field: string, path: string, values: readonly T[]): T {
    const value = obj[field];
    if (typeof value !== 'string' || !(values as readonly string[]).includes(value)) {
      this.error(path, `expected one of ${allowed(values)}, got ${describe(value)}`);
      return values[0] as T;
    }
    return value as T;
  }

  /** Optional screenshot: absent or null → null; unsafe → null plus a warning. */
  screenshot(obj: Obj, path: string): string | null {
    const value = obj.screenshot;
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string') {
      this.error(path, `expected text, got ${describe(value)}`);
      return null;
    }
    if (!isSafeScreenshotPath(value)) {
      this.warn(
        path,
        `screenshot path ${describe(value)} is not a plain path inside the run folder, so it is treated as missing`,
      );
      return null;
    }
    return value;
  }
}

function checkFocusBox(c: Checker, value: unknown, path: string): FocusBox | null {
  if (value === undefined || value === null) return null;
  if (!isObject(value)) {
    c.error(path, `expected an object, got ${describe(value)}`);
    return null;
  }
  const box: FocusBox = {
    x: c.number(value, 'x', `${path}.x`),
    y: c.number(value, 'y', `${path}.y`),
    w: c.number(value, 'w', `${path}.w`),
    h: c.number(value, 'h', `${path}.h`),
  };
  if (box.w <= 0 || box.h <= 0) {
    if (typeof value.w === 'number' && typeof value.h === 'number') {
      c.warn(path, `focus box has zero size (${box.w}×${box.h}), so no focus is drawn for this step`);
    }
    return null;
  }
  return box;
}

function checkStep(c: Checker, value: unknown, i: number): Step | null {
  const path = `steps[${i}]`;
  if (!isObject(value)) {
    c.error(path, `expected an object, got ${describe(value)}`);
    return null;
  }
  const n = c.number(value, 'n', `${path}.n`);
  if (typeof value.n === 'number' && (!Number.isInteger(n) || n < 1)) {
    c.error(`${path}.n`, `expected a whole number of 1 or more, got ${describe(n)}`);
  }
  const waitMs = c.number(value, 'waitMs', `${path}.waitMs`);
  if (typeof value.waitMs === 'number' && waitMs < 0) {
    c.error(`${path}.waitMs`, `expected 0 or more, got ${describe(waitMs)}`);
  }
  return {
    n,
    page: c.string(value, 'page', `${path}.page`),
    action: c.string(value, 'action', `${path}.action`),
    spoken: c.string(value, 'spoken', `${path}.spoken`),
    thought: c.string(value, 'thought', `${path}.thought`),
    screenshot: c.screenshot(value, `${path}.screenshot`),
    focusBox: checkFocusBox(c, value.focusBox, `${path}.focusBox`),
    waitMs,
  };
}

function checkFinding(c: Checker, value: unknown, i: number): Finding | null {
  const path = `findings[${i}]`;
  if (!isObject(value)) {
    c.error(path, `expected an object, got ${describe(value)}`);
    return null;
  }
  return {
    type: c.oneOf<FindingType>(value, 'type', `${path}.type`, FINDING_TYPES),
    step: c.number(value, 'step', `${path}.step`),
    title: c.string(value, 'title', `${path}.title`),
    evidence: c.string(value, 'evidence', `${path}.evidence`),
    screenshot: c.screenshot(value, `${path}.screenshot`),
  };
}

function validateUnsafe(input: unknown, meta: RunMeta): LoadedRun {
  const c = new Checker();
  if (!isObject(input)) {
    return {
      ok: false,
      key: meta.key,
      folder: meta.folder,
      errors: [{ path: '(file)', message: `expected a run object, got ${describe(input)}` }],
    };
  }

  if (input.formatVersion !== 1) {
    c.error('formatVersion', `expected 1, got ${describe(input.formatVersion)}`);
  }
  const runId = c.string(input, 'runId', 'runId', { nonEmpty: true });
  const ghost = c.oneOf<GhostId>(input, 'ghost', 'ghost', GHOST_IDS);

  const missionObj = c.object(input, 'mission', 'mission');
  const mission: Mission = {
    id: isObject(input.mission) ? c.string(missionObj, 'id', 'mission.id', { nonEmpty: true }) : '',
    goal: isObject(input.mission) ? c.string(missionObj, 'goal', 'mission.goal') : '',
    requirement: isObject(input.mission) ? c.string(missionObj, 'requirement', 'mission.requirement') : '',
    successCheck: isObject(input.mission) ? c.string(missionObj, 'successCheck', 'mission.successCheck') : '',
  };

  const siteObj = c.object(input, 'site', 'site');
  const site: Site = {
    name: isObject(input.site) ? c.string(siteObj, 'name', 'site.name', { nonEmpty: true }) : '',
    url: isObject(input.site) ? c.string(siteObj, 'url', 'site.url') : '',
    commit: isObject(input.site) ? c.string(siteObj, 'commit', 'site.commit') : '',
  };

  const startedAt = c.string(input, 'startedAt', 'startedAt');
  if (typeof input.startedAt === 'string' && (!ISO_8601.test(startedAt) || Number.isNaN(Date.parse(startedAt)))) {
    c.error('startedAt', `expected an ISO 8601 time such as "2026-11-03T14:22:15Z", got ${describe(startedAt)}`);
  }

  const result = c.oneOf<RunResult>(input, 'result', 'result', RUN_RESULTS);

  const steps: Step[] = [];
  if (!Array.isArray(input.steps)) {
    c.error('steps', `expected a list, got ${describe(input.steps)}`);
  } else {
    if (input.steps.length === 0) c.error('steps', 'expected at least one step, got an empty list');
    input.steps.forEach((raw, i) => {
      const step = checkStep(c, raw, i);
      if (step) steps.push(step);
    });
  }
  const seen = new Map<number, number>();
  steps.forEach((step, i) => {
    const first = seen.get(step.n);
    if (first !== undefined) {
      c.error(`steps[${i}].n`, `step number ${step.n} is used twice (also at steps[${first}])`);
    } else {
      seen.set(step.n, i);
    }
  });
  steps.sort((a, b) => a.n - b.n);

  const findings: Finding[] = [];
  if (!Array.isArray(input.findings)) {
    c.error('findings', `expected a list, got ${describe(input.findings)}`);
  } else {
    input.findings.forEach((raw, i) => {
      const finding = checkFinding(c, raw, i);
      if (!finding) return;
      if (isObject(raw) && typeof raw.step === 'number' && !seen.has(finding.step)) {
        c.warn(`findings[${i}].step`, `points to step ${finding.step}, which is not in this run`);
      }
      findings.push(finding);
    });
  }

  if (c.errors.length > 0) {
    return { ok: false, key: meta.key, folder: meta.folder, errors: c.errors };
  }
  return {
    ok: true,
    run: {
      key: meta.key,
      folder: meta.folder,
      origin: meta.origin,
      formatVersion: 1,
      runId,
      ghost,
      mission,
      site,
      startedAt,
      result,
      steps,
      findings,
      warnings: c.warnings,
    },
  };
}

/** Validates parsed run JSON. Never throws. */
export function validateRun(input: unknown, meta: RunMeta): LoadedRun {
  try {
    return validateUnsafe(input, meta);
  } catch (err) {
    return {
      ok: false,
      key: meta.key,
      folder: meta.folder,
      errors: [{ path: '(file)', message: `could not be checked: ${err instanceof Error ? err.message : String(err)}` }],
    };
  }
}
