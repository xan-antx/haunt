import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConfigError, defaultConfigPath, loadConfig } from '../src/config/loadConfig.ts';

/**
 * Unit tests for loading the Haunt_Config (Requirement 4).
 * **Validates: Requirements 4.1, 4.2**
 */

let dir: string;
let counter = 0;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'haunt-config-'));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Writes `content` to a new file in the temp folder and returns its path. */
function writeConfig(content: string): string {
  const file = path.join(dir, `config-${counter++}.json`);
  writeFileSync(file, content, 'utf8');
  return file;
}

function configWith(overrides: Record<string, unknown>): string {
  return writeConfig(
    JSON.stringify({
      allowedDomains: [],
      sites: { 'lantern-bills': { name: 'Lantern Bills demo', allowedTerms: ['Lantern Bills'] } },
      ...overrides,
    }),
  );
}

function catchConfigError(file: string): ConfigError {
  try {
    loadConfig(file);
  } catch (err) {
    expect(err).toBeInstanceOf(ConfigError);
    return err as ConfigError;
  }
  throw new Error(`Expected loadConfig to throw for ${file}`);
}

describe('loadConfig: good files', () => {
  it('loads the real engine/haunt.config.json', () => {
    expect(path.basename(defaultConfigPath)).toBe('haunt.config.json');
    const config = loadConfig();
    expect(config.allowedDomains).toEqual([]);
    expect(config.sites['lantern-bills']).toEqual({ name: 'Lantern Bills demo', allowedTerms: ['Lantern Bills'] });
  });

  it('loads a config with allowed domains and several sites', () => {
    const file = configWith({
      allowedDomains: ['lantern-bills.example.org', 'a.b.example.net'],
      sites: {
        one: { name: 'One', allowedTerms: [] },
        'two-three': { name: 'Two', allowedTerms: ['x'] },
      },
    });
    const config = loadConfig(file);
    expect(config.allowedDomains).toEqual(['lantern-bills.example.org', 'a.b.example.net']);
    expect(Object.keys(config.sites)).toEqual(['one', 'two-three']);
  });

  it('accepts a file that starts with a byte order mark', () => {
    const file = writeConfig(`\uFEFF${JSON.stringify({ allowedDomains: [], sites: {} })}`);
    expect(loadConfig(file)).toEqual({ allowedDomains: [], sites: {} });
  });
});

describe('loadConfig: file problems', () => {
  it('names the file when it is missing', () => {
    const file = path.join(dir, 'does-not-exist.json');
    const err = catchConfigError(file);
    expect(err.kind).toBe('missing');
    expect(err.file).toBe(file);
    expect(err.message).toContain('Config file not found');
    expect(err.message).toContain(file);
  });

  it.each([
    ['text that is not JSON', 'this is not json'],
    ['a trailing comma', '{ "allowedDomains": [], "sites": {}, }'],
    ['an empty file', ''],
  ])('says the file is not valid JSON for %s', (_label, content) => {
    const file = writeConfig(content);
    const err = catchConfigError(file);
    expect(err.kind).toBe('bad_json');
    expect(err.file).toBe(file);
    expect(err.message).toContain('not valid JSON');
    expect(err.message).toContain(file);
  });

  it('reports a folder given as the config path as an error, not a crash', () => {
    const err = catchConfigError(dir);
    expect(err.kind).toBe('unreadable');
    expect(err.message).toContain('could not be read');
  });
});

describe('loadConfig: schema problems', () => {
  it.each([
    ['a scheme', 'https://example.com', 'allowedDomains[0]'],
    ['a port', 'example.com:8080', 'allowedDomains[0]'],
    ['a path', 'example.com/pay', 'allowedDomains[0]'],
    ['a wildcard', '*.example.com', 'allowedDomains[0]'],
    ['uppercase letters', 'Example.com', 'allowedDomains[0]'],
    ['a leading dot', '.example.com', 'allowedDomains[0]'],
    ['a trailing dot', 'example.com.', 'allowedDomains[0]'],
    ['a single label', 'intranet', 'allowedDomains[0]'],
    ['an empty string', '', 'allowedDomains[0]'],
  ])('rejects an allowed domain with %s', (_label, domain, where) => {
    const err = catchConfigError(configWith({ allowedDomains: [domain] }));
    expect(err.kind).toBe('schema');
    expect(err.message).toContain('schemas/config.schema.json');
    expect(err.message).toContain(where);
  });

  it('rejects an IP address in allowedDomains', () => {
    const err = catchConfigError(configWith({ allowedDomains: ['192.168.1.20'] }));
    expect(err.kind).toBe('schema');
    expect(err.message).toContain('allowedDomains[0]');
  });

  it('points at the second entry when only that one is bad', () => {
    const err = catchConfigError(configWith({ allowedDomains: ['good.example.com', 'https://bad.example.com'] }));
    expect(err.message).toContain('allowedDomains[1]');
    expect(err.message).not.toContain('allowedDomains[0]');
  });

  it('rejects duplicate allowed domains', () => {
    const err = catchConfigError(configWith({ allowedDomains: ['a.example.com', 'a.example.com'] }));
    expect(err.kind).toBe('schema');
    expect(err.message).toContain('allowedDomains');
  });

  it.each(['Lantern_Bills', 'UPPER', '-lead', 'trail-', 'double--dash', 'has space', ''])(
    'rejects the site key %j and names it',
    (key) => {
      const err = catchConfigError(configWith({ sites: { [key]: { name: 'x', allowedTerms: [] } } }));
      expect(err.kind).toBe('schema');
      expect(err.message).toContain(`key "${key}"`);
    },
  );

  it('rejects an extra top-level field and names it', () => {
    const err = catchConfigError(configWith({ extra: true }));
    expect(err.kind).toBe('schema');
    expect(err.message).toContain('"extra"');
  });

  it('rejects an extra field inside a site and says where', () => {
    const err = catchConfigError(
      configWith({ sites: { 'lantern-bills': { name: 'x', allowedTerms: [], colour: 'red' } } }),
    );
    expect(err.message).toContain('sites.lantern-bills');
    expect(err.message).toContain('"colour"');
  });

  it.each([
    ['allowedDomains', { sites: {} }],
    ['sites', { allowedDomains: [] }],
  ])('rejects a config without %s', (field, content) => {
    const err = catchConfigError(writeConfig(JSON.stringify(content)));
    expect(err.kind).toBe('schema');
    expect(err.message).toContain(field);
  });

  it('rejects a site without a name or with an empty name', () => {
    expect(catchConfigError(configWith({ sites: { a: { allowedTerms: [] } } })).message).toContain('name');
    expect(catchConfigError(configWith({ sites: { a: { name: '', allowedTerms: [] } } })).message).toContain(
      'sites.a.name',
    );
  });

  it('rejects an empty allowed term', () => {
    const err = catchConfigError(configWith({ sites: { a: { name: 'A', allowedTerms: [''] } } }));
    expect(err.message).toContain('sites.a.allowedTerms[0]');
  });

  it.each([
    ['an array', '[]'],
    ['null', 'null'],
    ['a string', '"hello"'],
  ])('rejects %s at the top level', (_label, content) => {
    const err = catchConfigError(writeConfig(content));
    expect(err.kind).toBe('schema');
    expect(err.message).toContain('(top level)');
  });

  it('lists every problem, not only the first', () => {
    const err = catchConfigError(configWith({ allowedDomains: ['https://a.com', 'B.com'], extra: 1 }));
    expect(err.message).toContain('allowedDomains[0]');
    expect(err.message).toContain('allowedDomains[1]');
    expect(err.message).toContain('"extra"');
  });
});
