import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isAllowedAddress } from '../src/config/address.ts';
import { ConfigError, loadConfig } from '../src/config/loadConfig.ts';

let dir: string;
let counter = 0;
beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'haunt-config-prop-'));
});
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

function configFile(baseUrl: string): string {
  const file = path.join(dir, `config-${counter++}.json`);
  const config = {
    allowedDomains: [],
    sites: { memos: { name: 'Memos', allowedTerms: ['Memos'], baseUrl } },
  };
  writeFileSync(file, JSON.stringify(config), 'utf8');
  return file;
}

const urlish = fc.oneof(
  fc.string({ minLength: 1 }),
  fc
    .tuple(
      fc.constantFrom('http', 'https', 'ftp', 'file'),
      fc.constantFrom('localhost', '127.0.0.1', '[::1]', '0.0.0.0', 'example.com', 'localhost.', 'user:pw@localhost'),
      fc.option(fc.integer({ min: 1, max: 65535 }), { nil: undefined }),
    )
    .map(([scheme, host, port]) => `${scheme}://${host}${port === undefined ? '' : `:${port}`}`),
);

describe('Feature: memos-real-world-haunt, Property 3: The address guard decides whether a site base URL loads', () => {
  it('loads a config exactly when isAllowedAddress accepts its baseUrl', () => {
    fc.assert(
      fc.property(urlish, (baseUrl) => {
        const allowed = isAllowedAddress(baseUrl, { allowedDomains: [] });
        const file = configFile(baseUrl);
        if (allowed) {
          expect(loadConfig(file).sites['memos']?.baseUrl).toBe(baseUrl);
        } else {
          expect(() => loadConfig(file)).toThrow(ConfigError);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('names the site and the address in the refusal', () => {
    const file = configFile('https://example.com');
    expect(() => loadConfig(file)).toThrow(/memos.*https:\/\/example\.com/s);
  });
});
