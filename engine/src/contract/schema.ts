import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import type { ErrorObject, ValidateFunction } from 'ajv/dist/2020.js';
import type { Problem } from './types.ts';

/** engine/src/contract/ -> repository root -> contract/run.schema.json (that is ../contract/ from engine/). */
const SCHEMA_URL = new URL('../../../contract/run.schema.json', import.meta.url);

export function schemaFilePath(): string {
  return fileURLToPath(SCHEMA_URL);
}

let compiled: ValidateFunction | undefined;

function getValidator(): ValidateFunction {
  if (!compiled) {
    const schema = JSON.parse(readFileSync(SCHEMA_URL, 'utf8')) as object;
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    compiled = ajv.compile(schema);
  }
  return compiled;
}

/** Converts a JSON pointer such as `/steps/3/n` to `steps[3].n`. */
function pointerToPath(pointer: string): string {
  let out = '';
  for (const raw of pointer.split('/').slice(1)) {
    const part = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (/^\d+$/.test(part)) out += `[${part}]`;
    else out += out === '' ? part : `.${part}`;
  }
  return out;
}

function join(base: string, key: string): string {
  return base === '' ? key : `${base}.${key}`;
}

function toProblem(error: ErrorObject): Problem {
  const base = pointerToPath(error.instancePath);
  const params = error.params as Record<string, unknown>;
  switch (error.keyword) {
    case 'required': {
      const name = String(params['missingProperty']);
      return { path: join(base, name), message: 'is required' };
    }
    case 'additionalProperties': {
      const name = String(params['additionalProperty']);
      return { path: join(base, name), message: 'is not defined by the contract' };
    }
    case 'enum': {
      const allowed = (params['allowedValues'] as unknown[]).map((v) => JSON.stringify(v)).join(', ');
      return { path: base, message: `must be one of ${allowed}` };
    }
    default:
      return { path: base, message: error.message ?? 'is invalid' };
  }
}

/** Checks a value against the Run_Schema. Returns an empty list when it is valid. */
export function validateSchema(run: unknown): Problem[] {
  const validate = getValidator();
  if (validate(run)) return [];
  return (validate.errors ?? []).map(toProblem);
}
