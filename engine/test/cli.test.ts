import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EXIT, expandMission, main, parseArgs, USAGE } from '../src/cli/main.ts';
import type { BrowserLauncher, CliDeps } from '../src/cli/main.ts';
import { findRepositoryRoot } from '../src/core/git.ts';
import { mulberry32 } from '../src/core/rng.ts';
import type { BodyOptions, DetectedProblem, GhostId, MindOptions } from '../src/core/types.ts';
import { GHOST_IDS, getGhost, pageInitScripts, registerGhost } from '../src/ghosts/registry.ts';
import type { AnyGhost } from '../src/ghosts/registry.ts';
import { loadMission } from '../src/missions/loadMission.ts';
import type { Mission } from '../src/missions/loadMission.ts';

/**
 * Unit tests for src/cli/main.ts and src/ghosts/registry.ts.
 *
 * No real browser starts: the launcher, browser, context, page and CDP session are fakes, and the
 * Ghost is a fake with a scripted Body and Mind. Everything else is real: argument parsing, the
 * config and mission loaders, the address check, the Out_Root guard, the run loop, the recorder,
 * finalize and the atomic writer.
 *
 * Files are written only into temporary folders under os.tmpdir(), except the one test that checks
 * that `--out test-output/...` is not refused, which cannot write because Chromium is "missing".
 * Nothing is ever written into runs/.
 *
 * **Validates: Requirements 1.5, 2.7, 2.9, 2.10**
 */

const ENGINE_ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const REAL_MISSIONS_DIR = path.join(ENGINE_ROOT, 'missions');
const NOW = new Date('2026-11-10T15:30:12.345Z');
const RUN_ID = '2026-11-10T1530Z-listener-pay-bill';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

let root: string;
let missionsDir: string;
let configFile: string;
let fakeRepo: string;
let counter = 0;

/** A fresh, not yet existing Out_Root inside the temporary folder. */
function freshOut(): string {
  counter += 1;
  return path.join(root, `out-${counter}`);
}

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'haunt-cli-'));
  fakeRepo = path.join(root, 'repo');
  mkdirSync(fakeRepo, { recursive: true });

  configFile = path.join(root, 'config.json');
  writeFileSync(
    configFile,
    JSON.stringify({
      allowedDomains: [],
      sites: {
        'lantern-bills': { name: 'Lantern Bills demo', allowedTerms: ['Lantern Bills'] },
        'other-site': { name: 'Other site', allowedTerms: [] },
      },
    }),
    'utf8',
  );

  missionsDir = path.join(root, 'missions');
  mkdirSync(missionsDir, { recursive: true });
  const payBillText = readFileSync(path.join(REAL_MISSIONS_DIR, 'pay-bill.json'), 'utf8');
  writeFileSync(path.join(missionsDir, 'pay-bill.json'), payBillText, 'utf8');

  // A mission file that follows the shape but has a bad enum value deep inside.
  const broken = JSON.parse(payBillText) as Record<string, any>;
  broken.id = 'broken';
  broken.intentions[0].target.kind = 'banana';
  writeFileSync(path.join(missionsDir, 'broken.json'), JSON.stringify(broken), 'utf8');

  writeFileSync(path.join(missionsDir, 'notjson.json'), '{ this is not json', 'utf8');

  const wrongId = JSON.parse(payBillText) as Record<string, any>;
  wrongId.id = 'something-else';
  writeFileSync(path.join(missionsDir, 'wrongid.json'), JSON.stringify(wrongId), 'utf8');

  writeFileSync(path.join(root, 'bad-json-config.json'), '{ "allowedDomains": [', 'utf8');
  writeFileSync(path.join(root, 'bad-schema-config.json'), JSON.stringify({ allowedDomains: 'example.com', sites: [] }), 'utf8');
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------------------------
// Fake browser
// ---------------------------------------------------------------------------------------------

interface WorldOptions {
  /** `launcher.isInstalled()` answer. Default: true. */
  installed?: boolean;
  /** `launcher.launch()` rejects with this. */
  launchError?: Error;
  /** `browser.newContext()` rejects with this. */
  newContextError?: Error;
  /** `page.screenshot()` rejects with this. */
  screenshotError?: Error;
  /** The success element is visible. Default: false. */
  successVisible?: boolean;
}

interface Calls {
  isInstalled: number;
  launch: number;
  headless: boolean[];
  browsersClosed: number;
  contexts: Record<string, unknown>[];
  initScripts: string[];
  successSelectors: string[];
  cdpCommands: string[];
  httpRoutes: number;
  webSocketRoutes: number;
}

interface World {
  launcher: BrowserLauncher;
  calls: Calls;
}

function makeWorld(options: WorldOptions = {}): World {
  const calls: Calls = {
    isInstalled: 0,
    launch: 0,
    headless: [],
    browsersClosed: 0,
    contexts: [],
    initScripts: [],
    successSelectors: [],
    cdpCommands: [],
    httpRoutes: 0,
    webSocketRoutes: 0,
  };

  const page = {
    addInitScript: async (script: string) => {
      calls.initScripts.push(script);
    },
    locator: (selector: string) => ({
      first: () => ({
        waitFor: async () => {
          calls.successSelectors.push(selector);
          if (!(options.successVisible ?? false)) throw new Error('Timeout 300ms exceeded.');
        },
      }),
    }),
    screenshot: async () => {
      if (options.screenshotError) throw options.screenshotError;
      return PNG;
    },
    url: () => 'chrome-error://chromewebdata/',
  };
  const cdp = {
    send: async (method: string) => {
      calls.cdpCommands.push(method);
      return {};
    },
  };
  const context = {
    route: async () => {
      calls.httpRoutes += 1;
    },
    routeWebSocket: async () => {
      calls.webSocketRoutes += 1;
    },
    newPage: async () => page,
    newCDPSession: async () => cdp,
  };
  const browser = {
    newContext: async (contextOptions: Record<string, unknown>) => {
      if (options.newContextError) throw options.newContextError;
      calls.contexts.push(contextOptions);
      return context;
    },
    close: async () => {
      calls.browsersClosed += 1;
    },
  };

  const launcher: BrowserLauncher = {
    isInstalled: async () => {
      calls.isInstalled += 1;
      return options.installed ?? true;
    },
    launch: async (launchOptions) => {
      calls.launch += 1;
      calls.headless.push(launchOptions.headless);
      if (options.launchError) throw options.launchError;
      return browser as unknown as Browser;
    },
  };
  return { launcher, calls };
}

// ---------------------------------------------------------------------------------------------
// Fake ghost
// ---------------------------------------------------------------------------------------------

interface GhostScript {
  /** `body.open` rejects with this. */
  openError?: Error;
  /** `body.perceive` rejects with this (after Step 1). */
  perceiveError?: Error;
  /** How many actions the Mind takes before it gives up. Default: 0. */
  actions?: number;
  /** A Detector that reports these problems after every Step. */
  problems?: DetectedProblem[];
  /** `body.open` waits for this before it answers. */
  holdOpen?: Promise<never>;
  /** Called when `body.open` starts. */
  onOpen?: () => void;
}

interface Seen {
  missions: Mission[];
  bodyOptions: BodyOptions[];
  mindOptions: MindOptions[];
  /** The first number the Body drew from its random generator. */
  firstDraw: number | undefined;
  opened: string[];
}

interface FakeGhost {
  ghost: AnyGhost;
  seen: Seen;
}

function actionResult(text: string) {
  return {
    actionText: text,
    spoken: `spoken: ${text}`,
    focusBox: null,
    screenshot: PNG,
    trace: {
      pathBefore: '/',
      pathAfter: '/',
      keys: [],
      touchedKeys: [],
      actionEndedAt: 0,
      readyAt: 0,
      waits: [],
      announcements: [],
    },
  };
}

function makeGhost(script: GhostScript = {}, id: GhostId = 'listener'): FakeGhost {
  const seen: Seen = { missions: [], bodyOptions: [], mindOptions: [], firstDraw: undefined, opened: [] };
  const ghost: AnyGhost = {
    id,
    profile: { width: 1280, height: 800, deviceScaleFactor: 1, locale: 'en-IN', isMobile: false, hasTouch: false },
    createBody(_page, _cdp, options) {
      seen.bodyOptions.push(options);
      seen.firstDraw = options.rng();
      return {
        async open(url: string) {
          seen.opened.push(url);
          script.onOpen?.();
          if (script.holdOpen) await script.holdOpen;
          if (script.openError) throw script.openError;
          return actionResult(`Open ${url}`);
        },
        async perceive() {
          if (script.perceiveError) throw script.perceiveError;
          return { perception: null, probe: { at: 0 } };
        },
        async act(action: number) {
          return actionResult(`Act ${action}`);
        },
      };
    },
    createMind(mission, options) {
      seen.missions.push(mission);
      seen.mindOptions.push(options);
      let acted = 0;
      return {
        decide() {
          if (acted < (script.actions ?? 0)) {
            acted += 1;
            return { kind: 'act' as const, action: acted, thought: `I try thing ${acted}.`, intentionId: 'fake' };
          }
          return { kind: 'give_up' as const, reason: 'no_match' as const, thought: 'Nothing matches.' };
        },
        giveUpThought: () => 'I found nothing I could use.',
      };
    },
    detectors() {
      const problems = script.problems;
      if (!problems) return [];
      return [{ type: 'unlabeled_button' as const, observe: async () => problems }];
    },
    stopRule: () => null,
  };
  return { ghost, seen };
}

// ---------------------------------------------------------------------------------------------
// Running the CLI
// ---------------------------------------------------------------------------------------------

interface RunOptions {
  world?: World;
  ghost?: FakeGhost;
  /** `false`: the registry does not know the Ghost. */
  registered?: boolean;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  repoRoot?: string;
  onInterrupt?: CliDeps['onInterrupt'];
}

interface CliResult {
  code: number;
  stdout: string;
  stderr: string;
  world: World;
  fake: FakeGhost;
  /** The ids that were looked up in the ghost registry. */
  lookups: GhostId[];
}

const noInterrupt: NonNullable<CliDeps['onInterrupt']> = () => () => undefined;

async function runCli(argv: string[], options: RunOptions = {}): Promise<CliResult> {
  const world = options.world ?? makeWorld();
  const fake = options.ghost ?? makeGhost();
  const lookups: GhostId[] = [];
  let stdout = '';
  let stderr = '';
  const deps: CliDeps = {
    launcher: world.launcher,
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
    cwd: options.cwd ?? root,
    env: options.env ?? { HAUNT_UNDER_TEST: '1' },
    repoRoot: options.repoRoot ?? fakeRepo,
    getGhost: (id) => {
      lookups.push(id);
      return options.registered === false ? undefined : fake.ghost;
    },
    initScripts: ['window.__haunt_test = 1;'],
    now: () => NOW,
    getCommit: async () => 'abc1234',
    onInterrupt: options.onInterrupt ?? noInterrupt,
  };
  const code = await main(argv, deps);
  return { code, stdout, stderr, world, fake, lookups };
}

interface ArgOverrides {
  ghost?: string | null;
  mission?: string | null;
  url?: string | null;
  config?: string | null;
  missions?: string | null;
  out?: string | null;
  extra?: string[];
}

/** A complete, valid command line. `null` leaves an option out. */
function runArgs(overrides: ArgOverrides = {}, out: string = freshOut()): string[] {
  const pick = (value: string | null | undefined, fallback: string): string | null =>
    value === null ? null : (value ?? fallback);
  const pairs: [string, string | null][] = [
    ['--ghost', pick(overrides.ghost, 'listener')],
    ['--mission', pick(overrides.mission, 'pay-bill')],
    ['--url', pick(overrides.url, 'http://localhost:3000')],
    ['--config', pick(overrides.config, configFile)],
    ['--missions', pick(overrides.missions, missionsDir)],
    ['--out', pick(overrides.out, out)],
  ];
  const argv = ['run'];
  for (const [name, value] of pairs) if (value !== null) argv.push(name, value);
  argv.push(...(overrides.extra ?? []));
  return argv;
}

function lastLine(text: string): string | undefined {
  return text.trimEnd().split(/\r?\n/).at(-1);
}

function readRun(runJson: string): Record<string, any> {
  return JSON.parse(readFileSync(runJson, 'utf8')) as Record<string, any>;
}

/** Nothing was launched and nothing was looked up beyond argument checks. */
function expectNoBrowser(result: CliResult): void {
  expect(result.world.calls.launch).toBe(0);
  expect(result.world.calls.isInstalled).toBe(0);
  expect(result.world.calls.browsersClosed).toBe(0);
  expect(result.stdout).toBe('');
}

// ---------------------------------------------------------------------------------------------
// Argument errors: exit 2, no browser (Requirement 2.7, 4.3, 4.4, 5.9)
// ---------------------------------------------------------------------------------------------

describe('CLI argument errors exit 2 without launching a browser', () => {
  // `overrides` may be a function, because the temporary folder exists only after `beforeAll` has run.
  const cases: { name: string; overrides?: ArgOverrides | (() => ArgOverrides); argv?: string[]; expected: (string | RegExp)[] }[] = [
    { name: 'missing --ghost', overrides: { ghost: null }, expected: ['--ghost is missing', 'listener, phantom, bebe'] },
    { name: 'missing --mission', overrides: { mission: null }, expected: ['--mission is missing'] },
    { name: 'missing --url', overrides: { url: null }, expected: ['--url is missing'] },
    { name: 'unknown ghost', overrides: { ghost: 'ghoul' }, expected: ['Unknown ghost "ghoul"', 'listener, phantom, bebe'] },
    { name: 'unknown mission', overrides: { mission: 'nope' }, expected: ['nope', 'Available missions', 'pay-bill'] },
    { name: 'unknown --site key', overrides: { extra: ['--site', 'nope'] }, expected: ['"nope"', 'lantern-bills', 'other-site'] },
    { name: 'bad --site format', overrides: { extra: ['--site', 'Bad_Key'] }, expected: ['"Bad_Key"', 'not valid'] },
    { name: '--seed with a fraction', overrides: { extra: ['--seed', '4.5'] }, expected: ['--seed must be a whole number', '"4.5"'] },
    { name: '--seed with letters', overrides: { extra: ['--seed', 'abc'] }, expected: ['--seed must be a whole number', '"abc"'] },
    { name: '--seed in exponent form', overrides: { extra: ['--seed', '1e3'] }, expected: ['--seed must be a whole number'] },
    { name: 'unknown option', overrides: { extra: ['--bogus'] }, expected: [/bogus/] },
    { name: 'option without a value', overrides: { out: null, extra: ['--out'] }, expected: [/--out/] },
    { name: 'unknown command', argv: ['walk', '--ghost', 'listener', '--mission', 'pay-bill', '--url', 'http://localhost:3000'], expected: ['Unknown command "walk"', '"run"'] },
    { name: 'missing command', argv: ['--ghost', 'listener', '--mission', 'pay-bill', '--url', 'http://localhost:3000'], expected: ['command is missing'] },
    { name: 'extra argument after run', overrides: { extra: ['surprise'] }, expected: ['Unexpected extra argument "surprise"'] },
    { name: '--config that does not exist', overrides: { config: path.join('no', 'such', 'config.json') }, expected: ['Config file not found', 'config.json'] },
    { name: '--config that is not JSON', overrides: () => ({ config: path.join(root, 'bad-json-config.json') }), expected: ['not valid JSON'] },
    { name: '--config that fails the schema', overrides: () => ({ config: path.join(root, 'bad-schema-config.json') }), expected: ['schemas/config.schema.json', 'allowedDomains'] },
    { name: '--missions folder that does not exist', overrides: () => ({ missions: path.join(root, 'no-such-missions') }), expected: ['file does not exist', 'No missions found'] },
    { name: 'mission file that is not JSON', overrides: { mission: 'notjson' }, expected: ['notjson.json', 'is not valid JSON'] },
    { name: 'mission file whose id differs from its name', overrides: { mission: 'wrongid' }, expected: ['wrongid.json', 'id: must equal the file name'] },
    { name: 'mission file with a bad value deep inside', overrides: { mission: 'broken' }, expected: ['broken.json', 'intentions[0].target.kind', 'must be one of'] },
    { name: 'mission id that is not a valid name', overrides: { mission: '../escape' }, expected: ['not a valid mission id'] },
  ];

  it.each(cases)('$name', async ({ overrides, argv, expected }) => {
    const out = freshOut();
    const resolved = typeof overrides === 'function' ? overrides() : overrides;
    const result = await runCli(argv ?? runArgs(resolved, out));
    expect(result.code).toBe(2);
    for (const piece of expected) {
      if (typeof piece === 'string') expect(result.stderr).toContain(piece);
      else expect(result.stderr).toMatch(piece);
    }
    expectNoBrowser(result);
    expect(existsSync(out)).toBe(false);
  });

  it('lists every missing required option at once', async () => {
    const result = await runCli(['run']);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('--ghost is missing');
    expect(result.stderr).toContain('--mission is missing');
    expect(result.stderr).toContain('--url is missing');
    expect(result.stderr).toContain('npx haunt --help');
    expectNoBrowser(result);
  });

  it('refuses an empty --out value', async () => {
    const result = await runCli(runArgs({ out: '' }));
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('--out must not be empty');
    expectNoBrowser(result);
  });

  it('does not look up the ghost for any argument, config, mission or site error', async () => {
    const result = await runCli(runArgs({ extra: ['--site', 'nope'] }));
    expect(result.code).toBe(2);
    expect(result.lookups).toEqual([]);
  });
});

describe('address refusal (Requirement 4.3)', () => {
  it.each([
    ['https://example.com/', 'example.com'],
    ['http://Evil.Example.org:8080/path', 'evil.example.org'],
    ['http://[::1]:3000/', '::1'],
    ['ftp://localhost/', 'localhost'], // right host, wrong scheme: the host is still named
    ['http://user:pw@localhost:3000/', 'localhost'],
  ])('refuses %s, names the host and exits 2 without a browser', async (url, named) => {
    const out = freshOut();
    const result = await runCli(runArgs({ url }, out));
    expect(result.code).toBe(2);
    expect(result.stderr).toContain(named);
    expect(result.stderr).toContain('Ghosts only visit sites we own');
    expect(result.stderr).toContain('allowedDomains');
    expectNoBrowser(result);
    expect(existsSync(out)).toBe(false);
  });

  it('allows a domain that the config lists', async () => {
    const config = path.join(root, 'allowed-config.json');
    writeFileSync(
      config,
      JSON.stringify({ allowedDomains: ['ours.example.org'], sites: { 'lantern-bills': { name: 'Lantern Bills demo', allowedTerms: [] } } }),
      'utf8',
    );
    const result = await runCli(runArgs({ url: 'https://ours.example.org/', config }), { world: makeWorld({ successVisible: true }) });
    expect(result.code).toBe(0);
  });

  it('refuses every address when the config is bad', async () => {
    const result = await runCli(runArgs({ config: path.join(root, 'bad-json-config.json'), url: 'http://localhost:3000' }));
    expect(result.code).toBe(2);
    expectNoBrowser(result);
  });
});

// ---------------------------------------------------------------------------------------------
// Help (Requirement 2.9)
// ---------------------------------------------------------------------------------------------

describe('--help', () => {
  const OPTION_NAMES = ['--ghost', '--mission', '--url', '--out', '--site', '--seed', '--headed', '--config', '--missions', '--help'];

  it.each([
    ['--help', ['--help']],
    ['-h', ['-h']],
    ['run --help', ['run', '--help']],
    ['no arguments', []],
    ['run --help with otherwise bad arguments', ['run', '--ghost', 'ghoul', '--help']],
  ])('%s exits 0, lists the ghosts and the options, and starts nothing', async (_name, argv) => {
    const result = await runCli(argv);
    expect(result.code).toBe(0);
    expect(result.stdout).toBe(USAGE);
    for (const ghost of ['listener', 'phantom', 'bebe']) expect(result.stdout).toContain(ghost);
    for (const option of OPTION_NAMES) expect(result.stdout).toContain(option);
    expect(result.stdout).toContain('Usage:');
    expect(result.stderr).toBe('');
    expect(result.world.calls.launch).toBe(0);
    expect(result.world.calls.isInstalled).toBe(0);
    expect(result.lookups).toEqual([]);
  });

  it('documents the exit codes', () => {
    for (const code of ['0', '1', '2', '3', '130']) expect(USAGE).toContain(code);
    expect(EXIT).toEqual({ ok: 0, failed: 1, usage: 2, resultError: 3, interrupted: 130 });
  });

  it('parseArgs reads a complete command line', () => {
    const parsed = parseArgs(['run', '--ghost', 'bebe', '--mission', 'pay-bill', '--url', 'http://localhost:3000', '--seed', '7', '--headed']);
    expect(parsed).toEqual({
      kind: 'run',
      args: { ghost: 'bebe', mission: 'pay-bill', url: 'http://localhost:3000', headed: true, seed: 7 },
    });
  });
});

// ---------------------------------------------------------------------------------------------
// The Out_Root guard for the test runner (Requirement 2.10)
// ---------------------------------------------------------------------------------------------

describe('--out inside the repository runs/ folder under the test runner', () => {
  // A launcher whose Chromium is "missing": if the guard ever fails, the run stops with exit 1
  // before anything can be written, so these tests can never write into a real runs/ folder.
  const noChromium = (): World => makeWorld({ installed: false });

  it('the real vitest environment sets HAUNT_UNDER_TEST', () => {
    expect(process.env.HAUNT_UNDER_TEST).toBe('1');
  });

  it('refuses --out runs/... with exit 2 under the real vitest environment and the real repository', async () => {
    const repo = findRepositoryRoot();
    expect(repo).not.toBeNull();
    const target = path.join(repo as string, 'runs', 'cli-test-must-not-exist');
    const result = await runCli(runArgs({ out: target }), { world: noChromium(), env: process.env, repoRoot: repo as string });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('runs/');
    expect(result.stderr).toContain('test-output');
    expect(result.world.calls.isInstalled).toBe(0);
    expect(result.world.calls.launch).toBe(0);
    expect(existsSync(target)).toBe(false);
  });

  it('refuses a relative --out that resolves into runs/', async () => {
    const result = await runCli(runArgs({ out: path.join('runs', 'samples') }), {
      world: noChromium(),
      env: { HAUNT_UNDER_TEST: '1' },
      cwd: fakeRepo,
      repoRoot: fakeRepo,
    });
    expect(result.code).toBe(2);
    expect(result.world.calls.isInstalled).toBe(0);
  });

  it('refuses --out ../runs written from inside engine/', async () => {
    const engineDir = path.join(fakeRepo, 'engine');
    mkdirSync(engineDir, { recursive: true });
    const result = await runCli(runArgs({ out: path.join('..', 'runs') }), {
      world: noChromium(),
      env: { HAUNT_UNDER_TEST: '1' },
      cwd: engineDir,
      repoRoot: fakeRepo,
    });
    expect(result.code).toBe(2);
  });

  it('refuses runs/ itself', async () => {
    const result = await runCli(runArgs({ out: path.join(fakeRepo, 'runs') }), { world: noChromium(), repoRoot: fakeRepo });
    expect(result.code).toBe(2);
  });

  it('refuses the default Out_Root, which is runs/ at the repository root', async () => {
    const result = await runCli(runArgs({ out: null }), { world: noChromium(), repoRoot: fakeRepo });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain(path.join(fakeRepo, 'runs'));
    expect(result.world.calls.isInstalled).toBe(0);
    expect(existsSync(path.join(fakeRepo, 'runs'))).toBe(false);
  });

  it.each([
    ['test-output/cli', path.join('test-output', 'cli')],
    ['engine/test-output/cli', path.join('engine', 'test-output', 'cli')],
    ['runs-archive (a sibling whose name only starts like runs)', 'runs-archive'],
  ])('does not refuse %s', async (_name, out) => {
    const result = await runCli(runArgs({ out }), { world: noChromium(), cwd: fakeRepo, repoRoot: fakeRepo });
    // Exit 1 means the guard was passed and the run stopped at the Chromium check.
    expect(result.code).toBe(1);
    expect(result.world.calls.isInstalled).toBe(1);
    expect(existsSync(path.join(fakeRepo, out))).toBe(false);
  });

  it('does not refuse engine/test-output/... under the real repository root', async () => {
    const repo = findRepositoryRoot() as string;
    const result = await runCli(runArgs({ out: path.join(ENGINE_ROOT, 'test-output', 'cli-guard-check') }), {
      world: noChromium(),
      env: process.env,
      repoRoot: repo,
    });
    expect(result.code).toBe(1);
    expect(result.world.calls.isInstalled).toBe(1);
    expect(existsSync(path.join(ENGINE_ROOT, 'test-output', 'cli-guard-check'))).toBe(false);
  });

  it('does not apply the guard outside the test runner', async () => {
    const result = await runCli(runArgs({ out: path.join(fakeRepo, 'runs', 'x') }), {
      world: noChromium(),
      env: {},
      repoRoot: fakeRepo,
    });
    expect(result.code).toBe(1);
    expect(result.world.calls.isInstalled).toBe(1);
  });

  it('checks the guard before the ghost lookup and before Chromium', async () => {
    const result = await runCli(runArgs({ out: path.join(fakeRepo, 'runs', 'y') }), { registered: false, world: noChromium() });
    expect(result.code).toBe(2);
    expect(result.lookups).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------
// Ghost registry and missing Chromium (Requirements 1.5, 2.7)
// ---------------------------------------------------------------------------------------------

describe('ghost registry', () => {
  it('lists the three ghosts in usage order', () => {
    expect([...GHOST_IDS]).toEqual(['listener', 'phantom', 'bebe']);
  });

  it('returns undefined for an id nobody registered', () => {
    expect(getGhost('nobody' as GhostId)).toBeUndefined();
  });

  it('registers a ghost under its id and replaces it on a second registration', () => {
    const first = makeGhost({}, 'bebe').ghost;
    const second = makeGhost({}, 'bebe').ghost;
    registerGhost(first);
    expect(getGhost('bebe')).toBe(first);
    registerGhost(second);
    expect(getGhost('bebe')).toBe(second);
  });

  it('keeps the page scripts in a list that other modules can add to', () => {
    expect(Array.isArray(pageInitScripts)).toBe(true);
  });
});

describe('Chromium and ghost availability', () => {
  it('a missing Chromium prints npx playwright install chromium, exits 1 and writes nothing', async () => {
    const out = freshOut();
    const result = await runCli(runArgs({}, out), { world: makeWorld({ installed: false }) });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('npx playwright install chromium');
    expect(result.stdout).toBe('');
    expect(result.world.calls.isInstalled).toBe(1);
    expect(result.world.calls.launch).toBe(0);
    expect(existsSync(out)).toBe(false);
  });

  it('a launch that fails because the executable is missing prints the install command, exits 1 and writes nothing', async () => {
    const out = freshOut();
    const world = makeWorld({ launchError: new Error("browserType.launch: Executable doesn't exist at C:\\x\\chrome.exe\nplaywright install") });
    const result = await runCli(runArgs({}, out), { world });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('npx playwright install chromium');
    expect(result.stdout).toBe('');
    expect(existsSync(out)).toBe(false);
    expect(world.calls.browsersClosed).toBe(0);
  });

  it('any other launch failure exits 1 with the reason and writes nothing', async () => {
    const out = freshOut();
    const result = await runCli(runArgs({}, out), { world: makeWorld({ launchError: new Error('no display available') }) });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('no display available');
    expect(result.stderr).not.toContain('npx playwright install chromium');
    expect(existsSync(out)).toBe(false);
  });

  it('a ghost with a valid name that is not registered gives a clear message and exit 2', async () => {
    const out = freshOut();
    const result = await runCli(runArgs({ ghost: 'phantom' }, out), { registered: false });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain('"phantom"');
    expect(result.stderr).toContain('not implemented yet');
    expect(result.lookups).toEqual(['phantom']);
    expect(result.world.calls.isInstalled).toBe(0);
    expect(result.world.calls.launch).toBe(0);
    expect(result.stdout).toBe('');
    expect(existsSync(out)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// expandMission (Requirement 5.7)
// ---------------------------------------------------------------------------------------------

describe('expandMission', () => {
  const mission = loadMission(REAL_MISSIONS_DIR, 'pay-bill');

  it('replaces {{futureExpiry}} with the month two years after the start month', () => {
    const expanded = expandMission(mission, new Date('2026-11-10T15:30:12Z'));
    expect(expanded.intentions.find((i) => i.id === 'expiry')?.value).toBe('11/28');
    expect(JSON.stringify(expanded)).not.toContain('{{');
  });

  it('does not change the original mission or the other intentions', () => {
    const before = JSON.stringify(mission);
    const expanded = expandMission(mission, new Date('2026-11-10T15:30:12Z'));
    expect(JSON.stringify(mission)).toBe(before);
    expect(mission.intentions.find((i) => i.id === 'expiry')?.value).toBe('{{futureExpiry}}');
    expect(expanded.intentions.find((i) => i.id === 'cvv')).toEqual(mission.intentions.find((i) => i.id === 'cvv'));
    expect(expanded.goal).toBe(mission.goal);
  });
});

// ---------------------------------------------------------------------------------------------
// The happy paths, with a fake ghost and a fake browser
// ---------------------------------------------------------------------------------------------

describe('a run with a fake ghost and a fake browser', () => {
  it('succeeded: exit 0, run folder <out>/<siteKey>/<runId>/ with run.json and shots/, absolute path on the last line', async () => {
    const out = freshOut();
    const result = await runCli(runArgs({}, out), { world: makeWorld({ successVisible: true }) });
    expect(result.code).toBe(0);

    const folder = path.join(out, 'lantern-bills', RUN_ID);
    const runJson = path.join(folder, 'run.json');
    expect(lastLine(result.stdout)).toBe(runJson);
    expect(path.isAbsolute(lastLine(result.stdout) as string)).toBe(true);
    expect(result.stdout).toBe(`${runJson}\n`);
    expect(existsSync(runJson)).toBe(true);
    expect(readdirSync(path.join(folder, 'shots'))).toEqual(['001.png']);
    expect(readdirSync(path.join(out, 'lantern-bills'))).toEqual([RUN_ID]);

    const run = readRun(runJson);
    expect(run.formatVersion).toBe(1);
    expect(run.runId).toBe(RUN_ID);
    expect(run.ghost).toBe('listener');
    expect(run.result).toBe('succeeded');
    expect(run.startedAt).toBe('2026-11-10T15:30:12Z');
    expect(run.site).toEqual({ name: 'Lantern Bills demo', url: 'http://localhost:3000', commit: 'abc1234' });
    expect(run.mission.id).toBe('pay-bill');
    expect(run.steps).toHaveLength(1);
    expect(run.steps[0].screenshot).toBe('shots/001.png');
    expect(result.world.calls.successSelectors).toEqual(['[data-haunt="payment-success"]']);
    expect(result.world.calls.browsersClosed).toBe(1);
  });

  it('gave_up: exit 0, the Mind\'s give-up sentence ends the last thought, every Step has a screenshot', async () => {
    const out = freshOut();
    const result = await runCli(runArgs({}, out), { ghost: makeGhost({ actions: 2 }) });
    expect(result.code).toBe(0);

    const runJson = lastLine(result.stdout) as string;
    const run = readRun(runJson);
    expect(run.result).toBe('gave_up');
    expect(run.steps.map((s: { n: number }) => s.n)).toEqual([1, 2, 3]);
    expect(run.steps[2].thought).toBe('I try thing 2. I found nothing I could use.');
    expect(readdirSync(path.join(path.dirname(runJson), 'shots'))).toEqual(['001.png', '002.png', '003.png']);
    expect(result.stderr).toContain('Step 3: Act 2');
    expect(result.stderr).toContain('Result: gave_up');
    expect(result.world.calls.browsersClosed).toBe(1);
  });

  it('error result: exit 3, the run is still written, the path is still the last line', async () => {
    const out = freshOut();
    const result = await runCli(runArgs({}, out), { ghost: makeGhost({ perceiveError: new Error('the page vanished') }) });
    expect(result.code).toBe(3);

    const runJson = lastLine(result.stdout) as string;
    expect(runJson).toBe(path.join(out, 'lantern-bills', RUN_ID, 'run.json'));
    const run = readRun(runJson);
    expect(run.result).toBe('error');
    expect(run.steps.at(-1).thought).toContain('Something went wrong in the engine: the page vanished');
    expect(result.stderr).toContain('The run ended with an error');
    expect(result.world.calls.browsersClosed).toBe(1);
  });

  it('records findings from the ghost\'s detectors and reports them', async () => {
    const problem: DetectedProblem = { key: 'btn', stepN: 1, title: 'A button without a name', evidence: 'It says only "button".', screenshot: 'step' };
    const result = await runCli(runArgs(), { ghost: makeGhost({ problems: [problem] }) });
    expect(result.code).toBe(0);
    const run = readRun(lastLine(result.stdout) as string);
    expect(run.findings).toEqual([
      { type: 'unlabeled_button', step: 1, title: problem.title, evidence: problem.evidence, screenshot: 'shots/001.png' },
    ]);
    expect(result.stderr).toContain('1 finding');
    expect(result.stderr).toContain('Step 1, unlabeled_button');
  });

  it('adds -2, -3 to the run id and the folder name when the folder exists', async () => {
    const out = freshOut();
    const argv = runArgs({}, out);
    const first = await runCli(argv);
    const second = await runCli(argv);
    const third = await runCli(argv);
    expect([first.code, second.code, third.code]).toEqual([0, 0, 0]);

    const site = path.join(out, 'lantern-bills');
    expect(readdirSync(site).sort()).toEqual([RUN_ID, `${RUN_ID}-2`, `${RUN_ID}-3`]);
    expect(lastLine(second.stdout)).toBe(path.join(site, `${RUN_ID}-2`, 'run.json'));
    expect(readRun(lastLine(second.stdout) as string).runId).toBe(`${RUN_ID}-2`);
    expect(readRun(lastLine(third.stdout) as string).runId).toBe(`${RUN_ID}-3`);
  });

  it('resolves relative --out, --config and --missions against the current folder', async () => {
    const argv = runArgs({ out: 'rel-out', config: 'config.json', missions: 'missions' });
    const result = await runCli(argv, { cwd: root });
    expect(result.code).toBe(0);
    expect(lastLine(result.stdout)).toBe(path.join(root, 'rel-out', 'lantern-bills', RUN_ID, 'run.json'));
  });

  it('uses runs/ at the repository root by default outside the test runner', async () => {
    const repo = path.join(root, 'default-repo');
    mkdirSync(repo, { recursive: true });
    const result = await runCli(runArgs({ out: null }), { env: {}, repoRoot: repo });
    expect(result.code).toBe(0);
    expect(lastLine(result.stdout)).toBe(path.join(repo, 'runs', 'lantern-bills', RUN_ID, 'run.json'));
  });

  it('uses --site instead of the mission\'s site key', async () => {
    const out = freshOut();
    const result = await runCli(runArgs({ extra: ['--site', 'other-site'] }, out));
    expect(result.code).toBe(0);
    expect(lastLine(result.stdout)).toBe(path.join(out, 'other-site', RUN_ID, 'run.json'));
    expect(readRun(lastLine(result.stdout) as string).site.name).toBe('Other site');
  });

  it('uses the browser profile of the ghost, the guard, the init scripts and headless mode', async () => {
    const result = await runCli(runArgs());
    expect(result.code).toBe(0);
    const calls = result.world.calls;
    expect(calls.headless).toEqual([true]);
    expect(calls.contexts).toHaveLength(1);
    expect(calls.contexts[0]).toMatchObject({
      serviceWorkers: 'block',
      viewport: { width: 1280, height: 800 },
      deviceScaleFactor: 1,
      locale: 'en-IN',
    });
    expect(calls.httpRoutes).toBe(1);
    expect(calls.webSocketRoutes).toBe(1);
    expect(calls.initScripts).toEqual(['window.__haunt_test = 1;']);
    expect(result.fake.seen.opened).toEqual(['http://localhost:3000']);
  });

  it('--headed shows the browser window', async () => {
    const result = await runCli(runArgs({ extra: ['--headed'] }));
    expect(result.code).toBe(0);
    expect(result.world.calls.headless).toEqual([false]);
  });

  it('hands the Mind a mission with {{futureExpiry}} expanded, and keeps the run file\'s mission text', async () => {
    const result = await runCli(runArgs());
    expect(result.code).toBe(0);
    const [seenMission] = result.fake.seen.missions;
    expect(seenMission).toBeDefined();
    expect(seenMission?.intentions.find((i) => i.id === 'expiry')?.value).toBe('11/28');
    expect(JSON.stringify(seenMission)).not.toContain('{{');
    const run = readRun(lastLine(result.stdout) as string);
    expect(run.mission.goal).toBe(seenMission?.goal);
  });

  describe('seed', () => {
    it('--seed is used for the ghost\'s random numbers and nothing is printed about a random seed', async () => {
      const result = await runCli(runArgs({ extra: ['--seed', '42'] }));
      expect(result.code).toBe(0);
      expect(result.fake.seen.firstDraw).toBe(mulberry32(42)());
      expect(result.fake.seen.bodyOptions[0]?.rng).toBe(result.fake.seen.mindOptions[0]?.rng);
      expect(result.stderr).not.toMatch(/Seed: /);
    });

    it('without --seed a random seed is chosen, printed to standard error and used', async () => {
      const result = await runCli(runArgs());
      expect(result.code).toBe(0);
      const match = /Seed: (\d+)/.exec(result.stderr);
      expect(match).not.toBeNull();
      const seed = Number(match?.[1]);
      expect(Number.isSafeInteger(seed)).toBe(true);
      expect(result.fake.seen.firstDraw).toBe(mulberry32(seed)());
      expect(result.stdout).not.toContain('Seed');
    });
  });
});

// ---------------------------------------------------------------------------------------------
// Failure paths with a fake browser: nothing written, browser always closed
// ---------------------------------------------------------------------------------------------

describe('failure paths', () => {
  it('an invalid run exits 1, prints each problem with its JSON path and writes nothing', async () => {
    const out = freshOut();
    // A finding that points at a "seen" screenshot that Step 1 does not have.
    const problem: DetectedProblem = { key: 'bad', stepN: 1, title: 'Bad', evidence: 'Bad', screenshot: 'seen' };
    const result = await runCli(runArgs({}, out), { ghost: makeGhost({ problems: [problem] }) });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('The run is not valid, so nothing was written');
    expect(result.stderr).toContain('findings[0].screenshot');
    expect(result.stdout).toBe('');
    expect(existsSync(out)).toBe(false);
    expect(result.world.calls.browsersClosed).toBe(1);
  });

  it('exit 1 when the page cannot be opened and no Step was recorded; nothing is written', async () => {
    const out = freshOut();
    const world = makeWorld({ screenshotError: new Error('page closed') });
    const result = await runCli(runArgs({}, out), { world, ghost: makeGhost({ openError: new Error('net::ERR_CONNECTION_REFUSED') }) });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('could not be opened');
    expect(result.stderr).toContain('net::ERR_CONNECTION_REFUSED');
    expect(result.stdout).toBe('');
    expect(existsSync(out)).toBe(false);
    expect(world.calls.browsersClosed).toBe(1);
  });

  it('when the page cannot be opened but Chromium\'s error page can be photographed, Step 1 is saved with result error (exit 3)', async () => {
    const out = freshOut();
    const world = makeWorld();
    const result = await runCli(runArgs({}, out), { world, ghost: makeGhost({ openError: new Error('net::ERR_CONNECTION_REFUSED') }) });
    expect(result.code).toBe(3);
    const run = readRun(lastLine(result.stdout) as string);
    expect(run.result).toBe('error');
    expect(run.steps).toHaveLength(1);
    expect(run.steps[0].thought).toContain("I couldn't open the page.");
    expect(run.steps[0].thought).toContain('net::ERR_CONNECTION_REFUSED');
    expect(world.calls.browsersClosed).toBe(1);
  });

  it('an unexpected failure before the run is saved exits 1, writes nothing and closes the browser', async () => {
    const out = freshOut();
    const world = makeWorld({ newContextError: new Error('context refused') });
    const result = await runCli(runArgs({}, out), { world });
    expect(result.code).toBe(1);
    expect(result.stderr).toContain('context refused');
    expect(result.stdout).toBe('');
    expect(existsSync(out)).toBe(false);
    expect(world.calls.browsersClosed).toBe(1);
  });

  describe('Ctrl+C', () => {
    it('closes the browser, exits 130 and writes nothing', async () => {
      const out = freshOut();
      let handler: (() => void) | undefined;
      let removed = false;
      let opening!: () => void;
      const openStarted = new Promise<void>((resolve) => {
        opening = resolve;
      });
      const ghost = makeGhost({ holdOpen: new Promise<never>(() => undefined), onOpen: () => opening() });
      const world = makeWorld();

      const finished = runCli(runArgs({}, out), {
        world,
        ghost,
        onInterrupt: (h) => {
          handler = h;
          return () => {
            removed = true;
          };
        },
      });

      await openStarted;
      expect(handler).toBeDefined();
      handler?.();
      const result = await finished;

      expect(result.code).toBe(130);
      expect(result.stderr).toContain('Interrupted');
      expect(result.stdout).toBe('');
      expect(existsSync(out)).toBe(false);
      expect(world.calls.browsersClosed).toBe(1);
      expect(removed).toBe(true);
    });
  });

  it('removes the Ctrl+C handler after a normal run', async () => {
    let removed = false;
    const result = await runCli(runArgs(), {
      onInterrupt: () => () => {
        removed = true;
      },
    });
    expect(result.code).toBe(0);
    expect(removed).toBe(true);
  });
});
