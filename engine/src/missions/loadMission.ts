import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ErrorObject } from 'ajv';
import Ajv2020 from 'ajv/dist/2020.js';

export type TargetKind = 'button' | 'link' | 'field' | 'checkbox';
export type PresentKind = TargetKind | 'any';

/** Name patterns per language. They are case-insensitive Unicode regular expressions (`iu`). */
export interface NamePatterns {
  en: string[];
  pa?: string[];
  hi?: string[];
}

export interface Target extends NamePatterns {
  kind: TargetKind;
}

export interface PresentCondition extends NamePatterns {
  kind: PresentKind;
}

export type DoneWhen = 'success' | { fieldValue: true } | { present: PresentCondition };

interface IntentionBase {
  id: string;
  thought: string;
  lastResort?: 'unnamedButton';
  target: Target;
  doneWhen: DoneWhen;
}

export type Intention =
  | (IntentionBase & { do: 'activate'; value?: string })
  | (IntentionBase & { do: 'type'; value: string });

export interface Mission {
  id: string;
  site: string;
  goal: string;
  requirement: string;
  successCheck: { text: string; visible: string };
  intentions: Intention[];
}

export interface MissionProblem {
  /** JSON path inside the mission file, for example `intentions[2].target.kind`. `$` is the whole file. */
  path: string;
  message: string;
}

export class MissionLoadError extends Error {
  readonly problems: MissionProblem[];
  readonly file: string;

  constructor(file: string, problems: MissionProblem[]) {
    super(
      `Mission file ${file} is not usable:\n` +
        problems.map((p) => `  ${p.path}: ${p.message}`).join('\n'),
    );
    this.name = 'MissionLoadError';
    this.file = file;
    this.problems = problems;
  }
}

const MISSION_KEY = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const SCHEMA_FILE = fileURLToPath(new URL('../../schemas/mission.schema.json', import.meta.url));

type ValidateFn = ((data: unknown) => boolean) & { errors?: ErrorObject[] | null };
let validateFn: ValidateFn | undefined;

function getValidator(): ValidateFn {
  if (!validateFn) {
    const ajv = new Ajv2020({ allErrors: true, strict: true, allowUnionTypes: true });
    const schema: unknown = JSON.parse(readFileSync(SCHEMA_FILE, 'utf8'));
    validateFn = ajv.compile(schema as object) as ValidateFn;
  }
  return validateFn;
}

/** Turns a JSON pointer such as `/intentions/0/target` into `intentions[0].target`. */
function pointerToPath(pointer: string): string {
  let result = '';
  for (const raw of pointer.split('/').slice(1)) {
    const part = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    result += /^\d+$/.test(part) ? `[${part}]` : result ? `.${part}` : part;
  }
  return result;
}

function joinPath(base: string, key: string): string {
  return base ? `${base}.${key}` : key;
}

function describeError(e: ErrorObject): MissionProblem {
  const base = pointerToPath(e.instancePath);
  const params = e.params as Record<string, unknown>;
  switch (e.keyword) {
    case 'required':
      return {
        path: joinPath(base, String(params.missingProperty)),
        message: 'is required',
      };
    case 'additionalProperties':
      return {
        path: joinPath(base, String(params.additionalProperty)),
        message: 'is not allowed here',
      };
    case 'enum':
      return {
        path: base || '$',
        message: `must be one of ${(params.allowedValues as unknown[]).map((v) => JSON.stringify(v)).join(', ')}`,
      };
    case 'const':
      return {
        path: base || '$',
        message: `must be ${JSON.stringify(params.allowedValue)}`,
      };
    default:
      return { path: base || '$', message: e.message ?? `failed ${e.keyword}` };
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Checks that every name pattern in `node` compiles as an `iu` regular expression. */
function checkPatterns(node: unknown, base: string, problems: MissionProblem[]): void {
  if (!isRecord(node)) return;
  for (const lang of ['en', 'pa', 'hi'] as const) {
    const list = node[lang];
    if (!Array.isArray(list)) continue;
    list.forEach((pattern, i) => {
      if (typeof pattern !== 'string') return;
      try {
        new RegExp(pattern, 'iu');
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        problems.push({
          path: `${base}.${lang}[${i}]`,
          message: `is not a valid regular expression (flags iu): ${reason}`,
        });
      }
    });
  }
}

/**
 * Checks a parsed mission against the mission schema and the rules the schema cannot express
 * (id equals the file name, patterns compile with `iu`). Returns an empty list when it is valid.
 */
export function validateMission(data: unknown, expectedId: string): MissionProblem[] {
  const validate = getValidator();
  const problems: MissionProblem[] = [];

  if (!validate(data)) {
    for (const e of validate.errors ?? []) {
      // `if` only reports that a `then` branch failed; the branch's own error says what is wrong.
      if (e.keyword === 'if') continue;
      problems.push(describeError(e));
    }
  }

  if (isRecord(data)) {
    if (typeof data.id === 'string' && data.id !== expectedId) {
      problems.push({
        path: 'id',
        message: `must equal the file name without .json (expected "${expectedId}", got "${data.id}")`,
      });
    }
    if (Array.isArray(data.intentions)) {
      data.intentions.forEach((intention: unknown, i) => {
        if (!isRecord(intention)) return;
        const base = `intentions[${i}]`;
        checkPatterns(intention.target, `${base}.target`, problems);
        const doneWhen = intention.doneWhen;
        if (isRecord(doneWhen)) {
          checkPatterns(doneWhen.present, `${base}.doneWhen.present`, problems);
        }
      });
    }
  }

  return problems;
}

/**
 * Loads `<missionsDir>/<id>.json` and validates it. Throws `MissionLoadError` with one problem
 * per JSON path when the file is missing, is not JSON, or fails validation.
 */
export function loadMission(missionsDir: string, id: string): Mission {
  const file = path.join(missionsDir, `${id}.json`);

  if (!MISSION_KEY.test(id)) {
    throw new MissionLoadError(file, [
      { path: '$', message: `"${id}" is not a valid mission id (lowercase letters, digits and single hyphens)` },
    ]);
  }

  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const message = code === 'ENOENT' ? 'file does not exist' : `cannot be read: ${(error as Error).message}`;
    throw new MissionLoadError(file, [{ path: '$', message }]);
  }

  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new MissionLoadError(file, [
      { path: '$', message: `is not valid JSON: ${(error as Error).message}` },
    ]);
  }

  const problems = validateMission(data, id);
  if (problems.length > 0) throw new MissionLoadError(file, problems);
  return data as Mission;
}
