import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

export interface SiteConfig {
  /** Name written to `site.name` in run files. */
  name: string;
  /** Words that belong to the site's own brand and must not be reported as untranslated. */
  allowedTerms: string[];
}

export interface HauntConfig {
  /** Extra host names (besides localhost and 127.0.0.1) that ghosts may visit. */
  allowedDomains: string[];
  /** Sites by Site_Key. */
  sites: Record<string, SiteConfig>;
}

/** Thrown when the Haunt_Config cannot be used. The message is meant to be printed as it is. */
export class ConfigError extends Error {
  readonly kind: 'missing' | 'unreadable' | 'bad_json' | 'schema';
  readonly file: string;

  constructor(kind: ConfigError['kind'], file: string, message: string) {
    super(message);
    this.name = 'ConfigError';
    this.kind = kind;
    this.file = file;
  }
}

const engineRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));

/** `engine/haunt.config.json` */
export const defaultConfigPath = resolve(engineRoot, 'haunt.config.json');
/** `engine/schemas/config.schema.json` */
export const configSchemaPath = resolve(engineRoot, 'schemas', 'config.schema.json');

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

type Validator = ReturnType<InstanceType<typeof Ajv2020>['compile']>;
let cachedValidator: Validator | undefined;

function getValidator(): Validator {
  if (!cachedValidator) {
    const schema: unknown = JSON.parse(readFileSync(configSchemaPath, 'utf8'));
    const ajv = new Ajv2020({ allErrors: true });
    cachedValidator = ajv.compile(schema as object);
  }
  return cachedValidator;
}

function describePath(instancePath: string): string {
  if (instancePath === '') return '(top level)';
  return instancePath
    .split('/')
    .slice(1)
    .map((part) => part.replace(/~1/g, '/').replace(/~0/g, '~'))
    .reduce((acc, part) => (/^\d+$/.test(part) ? `${acc}[${part}]` : acc ? `${acc}.${part}` : part), '');
}

/**
 * Reads and checks the Haunt_Config.
 * Throws a ConfigError with a plain-words message when the file is missing,
 * is not valid JSON, or does not follow `schemas/config.schema.json`.
 */
export function loadConfig(file: string = defaultConfigPath): HauntConfig {
  const path = resolve(file);

  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new ConfigError('missing', path, `Config file not found: ${path}`);
    }
    throw new ConfigError(
      'unreadable',
      path,
      `Config file could not be read: ${path} (${(err as Error).message})`,
    );
  }

  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (err) {
    throw new ConfigError(
      'bad_json',
      path,
      `Config file is not valid JSON: ${path} (${(err as Error).message})`,
    );
  }

  const validate = getValidator();
  if (!validate(data)) {
    const problems = (validate.errors ?? []).map((e) => {
      const where = describePath(e.instancePath);
      const extra =
        e.keyword === 'additionalProperties'
          ? `: "${String((e.params as { additionalProperty?: string }).additionalProperty)}"`
          : e.keyword === 'propertyNames'
            ? ` (key "${String((e.params as { propertyName?: string }).propertyName)}")`
            : '';
      return `  ${where}: ${e.message ?? 'is invalid'}${extra}`;
    });
    throw new ConfigError(
      'schema',
      path,
      `Config file does not follow schemas/config.schema.json: ${path}\n${problems.join('\n')}`,
    );
  }

  const config = data as HauntConfig;

  // The schema already rejects IP addresses; this check is kept in code on purpose (design: "checked in code as well").
  const ip = config.allowedDomains.find((d) => IPV4.test(d));
  if (ip !== undefined) {
    throw new ConfigError(
      'schema',
      path,
      `Config file does not follow schemas/config.schema.json: ${path}\n  allowedDomains: "${ip}" is an IP address; only host names are allowed`,
    );
  }

  return config;
}
