import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import fc from 'fast-check';
import { afterAll, describe, expect, it } from 'vitest';
import { main } from '../src/cli/main.ts';
import type { BrowserLauncher, CliDeps } from '../src/cli/main.ts';
import { ConfigError, loadConfig } from '../src/config/loadConfig.ts';
import type { AnyGhost } from '../src/ghosts/registry.ts';

/**
 * Feature: haunt-engine, Property 2: Disallowed addresses are always refused before a browser starts
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.5**
 *
 * The real CLI `main(argv, deps)` runs with a config file that lists the generated `allowedDomains`
 * and a generated `--url`. The browser launcher is injected and counts calls; no browser ever starts.
 * The expected answer comes from an oracle written from the requirement text (it does not use
 * `src/config/address.ts`).
 */

const RUNS = { numRuns: 300 };

// ---------------------------------------------------------------------------------------------
// Temp folders (always under os.tmpdir(); never runs/)
// ---------------------------------------------------------------------------------------------

const tempRoot = mkdtempSync(path.join(tmpdir(), 'haunt-address-props-'));
let counter = 0;

afterAll(() => {
  rmSync(tempRoot, { recursive: true, force: true });
});

function freshFolder(): string {
  counter += 1;
  const dir = path.join(tempRoot, `case-${counter}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

// ---------------------------------------------------------------------------------------------
// Oracle, from Requirement 4.1 and 4.2
// ---------------------------------------------------------------------------------------------

/** Allowed_Address: parses as a URL, http or https, no user name or password, host is localhost, 127.0.0.1 or listed. */
function oracleAllows(raw: string, allowedDomains: readonly string[]): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.username.length > 0 || url.password.length > 0) return false;
  const host = url.hostname.toLowerCase();
  return host === 'localhost' || host === '127.0.0.1' || allowedDomains.includes(host);
}

/** What the refusal message must name: the parsed host, or the raw text when there is no host. */
function oracleNamedHost(raw: string): string {
  try {
    const host = new URL(raw).hostname;
    return host.length > 0 ? host : raw;
  } catch {
    return raw;
  }
}

// ---------------------------------------------------------------------------------------------
// Running the CLI with fakes
// ---------------------------------------------------------------------------------------------

interface Calls {
  isInstalled: number;
  launch: number;
  getGhost: number;
}

interface CliOutcome {
  code: number;
  stdout: string;
  stderr: string;
  calls: Calls;
  outDir: string;
}

const FAKE_GHOST = {
  id: 'listener',
  profile: { width: 1280, height: 800, deviceScaleFactor: 1, locale: 'en-US', isMobile: false, hasTouch: false },
  createBody() {
    throw new Error('createBody must not be reached: the launcher stops the run first');
  },
} as unknown as AnyGhost;

/**
 * Runs `main` with the given config text. A launcher that gets as far as `launch` throws "stop here",
 * so no real browser can start even if the address check lets the URL through.
 */
async function runCli(configText: string, url: string, extraArgs: string[] = []): Promise<CliOutcome> {
  const dir = freshFolder();
  const configFile = path.join(dir, 'haunt.config.json');
  writeFileSync(configFile, configText, 'utf8');
  const outDir = path.join(dir, 'out');

  const calls: Calls = { isInstalled: 0, launch: 0, getGhost: 0 };
  const launcher: BrowserLauncher = {
    async isInstalled() {
      calls.isInstalled += 1;
      return true;
    },
    async launch() {
      calls.launch += 1;
      throw new Error('stop here');
    },
  };
  let stdout = '';
  let stderr = '';
  const deps: CliDeps = {
    launcher,
    stdout: (text) => void (stdout += text),
    stderr: (text) => void (stderr += text),
    cwd: dir,
    env: { HAUNT_UNDER_TEST: '1' },
    repoRoot: path.join(dir, 'repo'),
    getGhost: () => {
      calls.getGhost += 1;
      return FAKE_GHOST;
    },
    initScripts: [],
    getCommit: async () => 'abc1234',
    onInterrupt: () => () => undefined,
  };
  // `--url=<value>` keeps a value that starts with "-" from being read as an option.
  const argv = [
    'run',
    '--ghost',
    'listener',
    '--mission',
    'pay-bill',
    `--url=${url}`,
    '--out',
    outDir,
    '--config',
    configFile,
    '--seed',
    '1',
    ...extraArgs,
  ];
  const code = await main(argv, deps);
  return { code, stdout, stderr, calls, outDir };
}

function configText(allowedDomains: readonly string[]): string {
  return JSON.stringify({
    allowedDomains,
    sites: { 'lantern-bills': { name: 'Lantern Bills demo', allowedTerms: ['Lantern Bills'] } },
  });
}

/** Nothing was written to the Out_Root: it does not exist, or it is empty. */
function outRootUntouched(outDir: string): boolean {
  return !existsSync(outDir) || readdirSync(outDir).length === 0;
}

// ---------------------------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------------------------

const ALNUM = [...'abcdefghijklmnopqrstuvwxyz0123456789'];
const LETTERS = [...'abcdefghijklmnopqrstuvwxyz'];
const alnumArb = fc.constantFrom(...ALNUM);
const letterArb = fc.constantFrom(...LETTERS);

/** A hyphen is only ever followed by a letter or digit, so a label never starts or ends with one and never has "--". */
const pieceArb = fc.oneof(
  { weight: 4, arbitrary: alnumArb },
  { weight: 1, arbitrary: alnumArb.map((c) => `-${c}`) },
);
const labelArb = fc.tuple(alnumArb, fc.array(pieceArb, { maxLength: 7 })).map(([head, rest]) => head + rest.join(''));
/** The last label starts with a letter, so the name can never be read as an IPv4 address. */
const lastLabelArb = fc.tuple(letterArb, fc.array(pieceArb, { maxLength: 5 })).map(([head, rest]) => head + rest.join(''));

/** A plain lowercase host name with at least two labels, valid for `allowedDomains`. */
const domainArb = fc
  .tuple(fc.array(labelArb, { minLength: 1, maxLength: 3 }), lastLabelArb)
  .map(([labels, last]) => [...labels, last].join('.'));

const domainsArb = fc.uniqueArray(domainArb, { minLength: 0, maxLength: 3 });

/** Applies upper case to the characters picked by the bits of `mask`. */
function mixCase(text: string, mask: number): string {
  return [...text].map((ch, i) => (((mask >> (i % 30)) & 1) === 1 ? ch.toUpperCase() : ch)).join('');
}
const maskArb = fc.integer({ min: 0, max: 2 ** 30 - 1 });
const withCase = (arb: fc.Arbitrary<string>): fc.Arbitrary<string> =>
  fc.tuple(arb, maskArb).map(([text, mask]) => mixCase(text, mask));

const schemeArb = fc.oneof(
  { weight: 5, arbitrary: fc.constantFrom('http', 'https') },
  { weight: 1, arbitrary: withCase(fc.constantFrom('http', 'https')) },
);
const portArb = fc.constantFrom('', '', '', ':80', ':443', ':3000', ':8080', ':65535', ':0', ':99999', ':abc', ':');
const pathArb = fc.constantFrom('', '', '/', '/pay', '/a/b?x=1#top', '?q=1', '#frag', '/%2e%2e/', '/p%C3%A4y');
const tailArb = fc.tuple(portArb, pathArb).map(([port, p]) => port + p);

/** Replaces the first letter that has a look-alike from another script. */
const LOOK_ALIKES: Record<string, string> = {
  a: '\u0430', // Cyrillic a
  c: '\u0441', // Cyrillic es
  e: '\u0435', // Cyrillic ie
  i: '\u0456', // Cyrillic Ukrainian i
  o: '\u043e', // Cyrillic o
  p: '\u0440', // Cyrillic er
  l: '\u04cf', // Cyrillic palochka
};
function lookAlike(host: string): string {
  const chars = [...host];
  const i = chars.findIndex((ch) => LOOK_ALIKES[ch] !== undefined);
  if (i < 0) return `${host}\u0430`;
  chars[i] = LOOK_ALIKES[chars[i] as string] as string;
  return chars.join('');
}

const OTHER_SCHEMES = ['ftp', 'file', 'javascript', 'data', 'ws', 'wss', 'mailto', 'blob', 'about', 'gopher', 'view-source'];
const SPECIAL_HOSTS = [
  '[::1]',
  '[0:0:0:0:0:0:0:1]',
  '[::ffff:127.0.0.1]',
  '0.0.0.0',
  '127.0.0.2',
  '127.255.255.255',
  '10.0.0.1',
  '192.168.1.1',
  '169.254.169.254',
  'localhost.localdomain',
  'localhost6',
  'local host',
  'exa mple.com',
  '0',
  '127.1',
  '2130706433',
  '0x7f.0.0.1',
  '\uff4cocalhost', // full-width l
  'localhost\u3002', // ideographic full stop
  'l\u043ecalhost', // Cyrillic o
  'xn--lcalhost-4cg',
  'xn--e1afmkfd.xn--p1ai',
];
const WHOLE_STRINGS = [
  'localhost',
  'localhost:3000',
  '//localhost',
  '127.0.0.1',
  'http:/localhost',
  'http:localhost',
  'http://',
  'http:///localhost',
  ' http://localhost ',
  '\thttp://localhost\n',
  'http://localhost\\@example.com',
  'http://example.com\\@localhost',
  'http://localhost@example.com',
  'http://127.0.0.1:80@example.com',
  'javascript:alert(1)',
  'data:text/html,<p>hi</p>',
  'file:///etc/passwd',
  'file://localhost/etc/passwd',
  'about:blank',
  'mailto:a@localhost',
  'blob:http://localhost/abc',
  'ws://localhost',
  '   ',
  '-',
  '--help',
  '-h',
  'null',
];

/** A URL string built around `domains` (the generated `allowedDomains`). */
function urlArb(domains: readonly string[]): fc.Arbitrary<string> {
  const hostArb = fc.constantFrom('localhost', '127.0.0.1', ...domains);
  const listedArb = domains.length > 0 ? fc.constantFrom(...domains) : fc.constant('localhost');
  const anyHost = fc.oneof(hostArb, domainArb, fc.constantFrom(...SPECIAL_HOSTS));
  const make = (scheme: string, userinfo: string, host: string, tail: string): string => `${scheme}://${userinfo}${host}${tail}`;

  return fc.oneof(
    // Allowed hosts: random case, port, path, scheme.
    { weight: 24, arbitrary: fc.tuple(schemeArb, withCase(hostArb), tailArb).map(([s, h, t]) => make(s, '', h, t)) },
    // Random domains.
    { weight: 3, arbitrary: fc.tuple(schemeArb, domainArb, tailArb).map(([s, h, t]) => make(s, '', h, t)) },
    // Subdomains of an allowed domain (and of localhost).
    {
      weight: 4,
      arbitrary: fc
        .tuple(schemeArb, labelArb, fc.oneof(listedArb, fc.constant('localhost')), tailArb)
        .map(([s, label, h, t]) => make(s, '', `${label}.${h}`, t)),
    },
    // Parents of an allowed domain.
    {
      weight: 3,
      arbitrary: fc
        .tuple(schemeArb, listedArb, tailArb)
        .map(([s, h, t]) => make(s, '', h.split('.').slice(1).join('.') || 'org', t)),
    },
    // Look-alike suffixes and prefixes.
    {
      weight: 2,
      arbitrary: fc
        .tuple(schemeArb, labelArb, listedArb, tailArb)
        .map(([s, label, h, t]) => make(s, '', `${label}${h}`, t)),
    },
    // Trailing dot.
    {
      weight: 3,
      arbitrary: fc.tuple(schemeArb, hostArb, tailArb).map(([s, h, t]) => make(s, '', `${h}.`, t)),
    },
    // Special hosts: IPv6, 0.0.0.0, other 127.x, odd spellings of loopback.
    { weight: 4, arbitrary: fc.tuple(schemeArb, fc.constantFrom(...SPECIAL_HOSTS), tailArb).map(([s, h, t]) => make(s, '', h, t)) },
    // User info on any host, including an allowed one.
    {
      weight: 5,
      arbitrary: fc
        .tuple(
          schemeArb,
          fc.constantFrom('user:pw@', 'user@', ':pw@', ':@', '@'),
          hostArb,
          tailArb,
        )
        .map(([s, u, h, t]) => make(s, u, h, t)),
    },
    // The allowed domain only inside the user info, path, query, fragment or as a sub-label of another host.
    {
      weight: 5,
      arbitrary: fc
        .tuple(schemeArb, hostArb, domainArb)
        .chain(([s, h, evil]) =>
          fc.constantFrom(
            `${s}://${h}@${evil}/`,
            `${s}://${h}:x@${evil}/`,
            `${s}://${evil}/${h}`,
            `${s}://${evil}/?host=${h}`,
            `${s}://${evil}/#${h}`,
            `${s}://${evil}?@${h}`,
            `${s}://${evil}\\@${h}`,
            `${s}://${h}.${evil}/`,
            `${s}://${evil}.${h}/`,
            `${s}://${h}%2f@${evil}/`,
          ),
        ),
    },
    // Other schemes.
    {
      weight: 4,
      arbitrary: fc
        .tuple(withCase(fc.constantFrom(...OTHER_SCHEMES)), anyHost, tailArb)
        .map(([s, h, t]) => make(s, '', h, t)),
    },
    // Unicode and punycode look-alikes of allowed hosts.
    {
      weight: 4,
      arbitrary: fc
        .tuple(schemeArb, fc.oneof(hostArb, listedArb), tailArb)
        .map(([s, h, t]) => make(s, '', lookAlike(h), t)),
    },
    // Fixed whole strings.
    { weight: 3, arbitrary: fc.constantFrom(...WHOLE_STRINGS) },
    // Garbage and arbitrary URLs.
    { weight: 3, arbitrary: fc.string({ minLength: 1, maxLength: 30 }) },
    { weight: 2, arbitrary: fc.string({ unit: 'binary', minLength: 1, maxLength: 30 }) },
    { weight: 2, arbitrary: fc.string({ unit: 'grapheme', minLength: 1, maxLength: 20 }) },
    { weight: 2, arbitrary: fc.webUrl() },
    { weight: 1, arbitrary: fc.domain() },
  );
}

const caseArb = domainsArb.chain((domains) =>
  fc.record({ domains: fc.constant(domains), url: urlArb(domains) }),
);

// ---------------------------------------------------------------------------------------------
// Property 2
// ---------------------------------------------------------------------------------------------

describe('Feature: haunt-engine, Property 2: Disallowed addresses are always refused before a browser starts', () => {
  it('refuses every address the oracle disallows before any browser call, and does not refuse the ones it allows', async () => {
    let refused = 0;
    let allowed = 0;

    await fc.assert(
      fc.asyncProperty(caseArb, async ({ domains, url }) => {
        const outcome = await runCli(configText(domains), url);
        const isAllowed = oracleAllows(url, domains);

        if (!isAllowed) {
          refused += 1;
          // Requirement 4.3: exit 2, no browser process, the refused host and allowedDomains named, no file written.
          expect(outcome.code).toBe(2);
          expect(outcome.calls.isInstalled).toBe(0);
          expect(outcome.calls.launch).toBe(0);
          expect(outcome.calls.getGhost).toBe(0);
          expect(outcome.stderr).toContain(oracleNamedHost(url));
          expect(outcome.stderr).toContain('allowedDomains');
          expect(outcome.stderr).toContain('Refused to visit');
          expect(outcome.stdout).toBe('');
          expect(outRootUntouched(outcome.outDir)).toBe(true);
        } else {
          allowed += 1;
          // The address check lets it through. The run then goes on to the launcher, which stops it.
          expect(outcome.stderr).not.toContain('Refused to visit');
          expect(outcome.calls.launch).toBe(1);
          expect(outcome.code).toBe(1);
          expect(outcome.stderr).toContain('The browser could not be started: stop here');
          expect(outRootUntouched(outcome.outDir)).toBe(true);
        }
      }),
      RUNS,
    );

    // The generators must exercise both branches, or the property would pass without testing anything.
    expect(refused).toBeGreaterThan(50);
    expect(allowed).toBeGreaterThan(50);
  });

  it('never lets a subdomain, parent, trailing dot, user info or other scheme through, whatever the case', async () => {
    const hostCaseArb = domainsArb
      .filter((domains) => domains.length > 0)
      .chain((domains) => fc.record({ domains: fc.constant(domains), host: fc.constantFrom(...domains), mask: maskArb, label: labelArb }));

    await fc.assert(
      fc.asyncProperty(hostCaseArb, async ({ domains, host, mask, label }) => {
        const shouted = mixCase(host, mask);
        const urls = [
          `http://${mixCase(label, mask)}.${shouted}/`, // subdomain (not listed itself, unless the generator happened to list it)
          `https://${shouted}./`, // trailing dot
          `http://user:pw@${shouted}/`, // user info
          `ftp://${shouted}/`, // other scheme
        ];
        for (const url of urls) {
          const listedItself = domains.includes(`${label}.${host}`);
          if (listedItself && url.startsWith(`http://${mixCase(label, mask)}.`)) continue;
          const outcome = await runCli(configText(domains), url);
          expect(oracleAllows(url, domains)).toBe(false);
          expect(outcome.code).toBe(2);
          expect(outcome.calls.launch).toBe(0);
          expect(outcome.stderr).toContain('allowedDomains');
        }
        // The listed domain itself, in any case, is accepted.
        const own = await runCli(configText(domains), `HTTPS://${shouted}:8443/pay`);
        expect(own.stderr).not.toContain('Refused to visit');
        expect(own.calls.launch).toBe(1);
      }),
      { numRuns: 100 },
    );
  });
});

// ---------------------------------------------------------------------------------------------
// Requirement 4.5: the config schema accepts only plain lowercase host names in allowedDomains
// ---------------------------------------------------------------------------------------------

/** Makes the first letter of the last label upper case (the last label always starts with a letter). */
function upperLastLabel(domain: string): string {
  const i = domain.lastIndexOf('.') + 1;
  return domain.slice(0, i) + domain.charAt(i).toUpperCase() + domain.slice(i + 1);
}

const octetArb = fc.integer({ min: 0, max: 255 });

/** An allowedDomains entry that breaks Requirement 4.5, built from a valid host name. */
const badEntryArb: fc.Arbitrary<string> = domainArb.chain((d) =>
  fc.oneof(
    fc.constantFrom('http://', 'https://', 'ftp://', '//', 'file://').map((scheme) => `${scheme}${d}`),
    fc.integer({ min: 0, max: 65535 }).map((port) => `${d}:${port}`),
    fc.constantFrom('/', '/x', '/a/b', '/pay?x=1', '#frag').map((p) => `${d}${p}`),
    fc.constantFrom(`*.${d}`, `*${d}`, `${d}.*`, '*', `*.${d.split('.').slice(1).join('.')}`),
    fc.constant(upperLastLabel(d)),
    fc.tuple(octetArb, octetArb, octetArb, octetArb).map((o) => o.join('.')),
  ),
);

describe('Feature: haunt-engine, Property 2: Disallowed addresses are always refused before a browser starts (config schema, Requirement 4.5)', () => {
  it('rejects allowedDomains entries with a scheme, port, path, wildcard, upper case or IP address', async () => {
    const caseWithBadEntry = fc
      .tuple(domainsArb, badEntryArb, fc.nat({ max: 3 }))
      .map(([valid, bad, at]) => {
        const list = [...valid];
        list.splice(Math.min(at, list.length), 0, bad);
        return list;
      })
      .filter((list) => new Set(list).size === list.length); // the schema also wants unique items; keep the failure about the bad entry

    await fc.assert(
      fc.asyncProperty(caseWithBadEntry, async (allowedDomains) => {
        // loadConfig rejects it.
        const dir = freshFolder();
        const file = path.join(dir, 'haunt.config.json');
        writeFileSync(file, configText(allowedDomains), 'utf8');
        let thrown: unknown;
        try {
          loadConfig(file);
        } catch (error) {
          thrown = error;
        }
        expect(thrown).toBeInstanceOf(ConfigError);
        expect((thrown as ConfigError).kind).toBe('schema');

        // The CLI exits 2 and starts nothing, even for an address that would be fine.
        const outcome = await runCli(configText(allowedDomains), 'http://localhost:3000');
        expect(outcome.code).toBe(2);
        expect(outcome.stderr).toContain('schemas/config.schema.json');
        expect(outcome.calls.isInstalled).toBe(0);
        expect(outcome.calls.launch).toBe(0);
        expect(outcome.calls.getGhost).toBe(0);
        expect(outRootUntouched(outcome.outDir)).toBe(true);
      }),
      RUNS,
    );
  });

  it('accepts plain lowercase host names and then allows exactly those hosts', async () => {
    await fc.assert(
      fc.asyncProperty(domainsArb, async (domains) => {
        const dir = freshFolder();
        const file = path.join(dir, 'haunt.config.json');
        writeFileSync(file, configText(domains), 'utf8');
        expect(loadConfig(file).allowedDomains).toEqual(domains);

        const first = domains[0];
        if (first !== undefined) {
          const outcome = await runCli(configText(domains), `https://${first}/`);
          expect(outcome.stderr).not.toContain('Refused to visit');
          expect(outcome.calls.launch).toBe(1);
        }
      }),
      RUNS,
    );
  });
});
