import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { Browser } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EXIT, main } from '../src/cli/main.ts';
import type { BrowserLauncher, CliDeps } from '../src/cli/main.ts';
import type { GhostId } from '../src/core/types.ts';
import type { AnyGhost } from '../src/ghosts/registry.ts';
import type { KiroLauncher, KiroProcess, KiroSpec } from '../src/mind/ai/kiro.ts';
import { heard } from './helpers/heard.ts';

/**
 * Unit tests for `haunt run --mind ai`: fake browser, fake Body, fake detectors and a fake Kiro launcher.
 * The fake Kiro talks to the real Bridge over loopback, the way haunt-mcp does. Nothing starts a real
 * browser or the real Kiro CLI, and files go only into a temporary folder.
 * **Validates: Requirements 3.3, 3.5, 3.6, 3.7, 5.3, 5.4, 5.5, 5.6, 5.8, 5.9**
 */

const NOW = new Date('2026-11-10T15:30:12.345Z');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01]);
const KIRO = 'C:\\fake\\kiro-cli.exe';

let root: string;
let fakeRepo: string;
let counter = 0;

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'haunt-cli-ai-'));
  fakeRepo = path.join(root, 'repo');
  mkdirSync(fakeRepo, { recursive: true });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function freshOut(): string {
  counter += 1;
  return path.join(root, `out-${counter}`);
}

// ---------------------------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------------------------

interface World {
  launcher: BrowserLauncher;
  launches: number;
  installedChecks: number;
  browsersClosed: number;
}

function makeWorld(): World {
  const world: World = { launcher: undefined as unknown as BrowserLauncher, launches: 0, installedChecks: 0, browsersClosed: 0 };
  const page = {
    addInitScript: async () => undefined,
    locator: () => ({
      first: () => ({
        waitFor: async () => {
          throw new Error('Timeout 300ms exceeded.');
        },
      }),
    }),
    screenshot: async () => PNG,
    url: () => 'http://localhost:3000/',
  };
  const context = { route: async () => undefined, routeWebSocket: async () => undefined, newPage: async () => page, newCDPSession: async () => ({ send: async () => ({}) }) };
  const browser = {
    newContext: async () => context,
    close: async () => {
      world.browsersClosed += 1;
    },
  };
  world.launcher = {
    isInstalled: async () => {
      world.installedChecks += 1;
      return true;
    },
    launch: async () => {
      world.launches += 1;
      return browser as unknown as Browser;
    },
  };
  return world;
}

function actionResult(text: string) {
  return {
    actionText: text,
    spoken: `spoken: ${text}`,
    focusBox: null,
    screenshot: PNG,
    trace: { pathBefore: '/', pathAfter: '/', keys: [], touchedKeys: [], actionEndedAt: 0, readyAt: 0, waits: [], announcements: [] },
  };
}

function makeGhost(id: GhostId = 'listener') {
  const seen = { opened: [] as string[], acts: [] as unknown[] };
  const ghost: AnyGhost = {
    id,
    profile: { width: 1280, height: 800, deviceScaleFactor: 1, locale: 'en-IN', isMobile: false, hasTouch: false },
    createBody() {
      return {
        async open(url: string) {
          seen.opened.push(url);
          return actionResult(`Open ${url}`);
        },
        async perceive() {
          return { perception: heard([{ ref: 'ax-1', role: 'button', name: 'Pay' }]), probe: { at: 1 } };
        },
        async act(action: unknown) {
          seen.acts.push(action);
          return actionResult('Press Tab');
        },
      };
    },
    createMind() {
      return {
        decide: () => ({ kind: 'give_up' as const, reason: 'no_match' as const, thought: 'Nothing matches.' }),
        giveUpThought: () => 'I found nothing I could use.',
      };
    },
    detectors: () => [],
    stopRule: () => null,
  };
  return { ghost, seen };
}

interface Fake {
  launcher: KiroLauncher;
  specs: KiroSpec[];
  killed: () => number;
}

/** A fake Kiro. `script` runs when it starts and may call the Bridge, exit, or do nothing. */
function makeKiro(script: (spec: KiroSpec, exit: (code: number | null, output?: string) => void) => void | Promise<void>): Fake {
  const specs: KiroSpec[] = [];
  let killed = 0;
  const launcher: KiroLauncher = (spec) => {
    specs.push(spec);
    let done: (value: { code: number | null; output: string }) => void = () => undefined;
    const exited = new Promise<{ code: number | null; output: string }>((resolve) => {
      done = resolve;
    });
    const process_: KiroProcess = {
      exited,
      kill: () => {
        killed += 1;
        done({ code: null, output: '' });
      },
    };
    void Promise.resolve(script(spec, (code, output = '') => done({ code, output }))).catch(() => undefined);
    return process_;
  };
  return { launcher, specs, killed: () => killed };
}

async function callTool(spec: KiroSpec, name: string, args: unknown = {}): Promise<unknown> {
  const response = await fetch(`${spec.env.HAUNT_BRIDGE_URL}/tool`, {
    method: 'POST',
    headers: { authorization: `Bearer ${spec.env.HAUNT_BRIDGE_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify({ name, args }),
  });
  return response.json();
}

interface RunOptions {
  world?: World;
  ghost?: ReturnType<typeof makeGhost>;
  kiro?: Fake;
  kiroFound?: boolean;
  env?: NodeJS.ProcessEnv;
  onInterrupt?: CliDeps['onInterrupt'];
  url?: string;
  extra?: string[];
}

async function runCli(options: RunOptions = {}) {
  const world = options.world ?? makeWorld();
  const fake = options.ghost ?? makeGhost();
  const kiro = options.kiro ?? makeKiro(() => undefined);
  const out = freshOut();
  let stdout = '';
  let stderr = '';
  const argv = [
    'run',
    '--ghost',
    'listener',
    '--mission',
    'pay-bill',
    '--url',
    options.url ?? 'http://localhost:3000',
    '--out',
    out,
    '--mind',
    'ai',
    ...(options.extra ?? []),
  ];
  const deps: CliDeps = {
    launcher: world.launcher,
    stdout: (t) => {
      stdout += t;
    },
    stderr: (t) => {
      stderr += t;
    },
    cwd: root,
    env: options.env ?? { HAUNT_UNDER_TEST: '1', KIRO_CLI_PATH: KIRO },
    repoRoot: fakeRepo,
    getGhost: () => fake.ghost,
    initScripts: [],
    now: () => NOW,
    getCommit: async () => 'abc1234',
    onInterrupt: options.onInterrupt ?? (() => () => undefined),
    kiroLauncher: kiro.launcher,
    kiroExists: (file) => options.kiroFound !== false && file === KIRO,
    kiroGraceMs: 20,
  };
  const code = await main(argv, deps);
  return { code, stdout, stderr, world, fake, kiro, out };
}

// ---------------------------------------------------------------------------------------------

describe('haunt run --mind ai', () => {
  it('starts Kiro with the agent arguments, the two bridge variables and the repository root', async () => {
    const kiro = makeKiro(async (spec, exit) => {
      await callTool(spec, 'finish');
      exit(0, 'Done.\nCredits: 0.5');
    });
    const result = await runCli({ kiro });
    expect(kiro.specs).toHaveLength(1);
    const spec = kiro.specs[0]!;
    expect(spec.command).toBe(KIRO);
    expect(spec.args.slice(0, 3)).toEqual(['chat', '--agent', 'listener']);
    expect(spec.args).toContain('--no-interactive');
    expect(spec.args).toContain('--trust-tools=@haunt-mcp');
    expect(spec.args.at(-1)).toContain('electricity');
    expect(spec.env.HAUNT_BRIDGE_URL).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(spec.env.HAUNT_BRIDGE_TOKEN).toMatch(/^[0-9a-f]{64}$/);
    expect(spec.env.HAUNT_UNDER_TEST).toBe('1');
    expect(spec.cwd).toBe(fakeRepo);
    expect(result.code).toBe(EXIT.ok);
  });

  it('a finish call ends the run as gave_up, writes it, and prints the run path last on stdout', async () => {
    const kiro = makeKiro(async (spec, exit) => {
      const first = (await callTool(spec, 'finish')) as { ok: boolean };
      expect(first.ok).toBe(true);
      expect(await callTool(spec, 'read_page')).toEqual({ ok: false, error: 'The run has ended. Stop now.' });
      exit(0, 'Credits: 0.25');
    });
    const result = await runCli({ kiro });
    expect(result.code).toBe(EXIT.ok);
    expect(result.stderr).toContain('Result: gave_up');
    const runPath = result.stdout.trim();
    expect(runPath.endsWith('run.json')).toBe(true);
    expect(existsSync(runPath)).toBe(true);
    expect(JSON.parse(readFileSync(runPath, 'utf8')).mind).toBe('ai');
    expect(result.stdout.trim().split(/\r?\n/)).toHaveLength(1);
    expect(kiro.killed()).toBeGreaterThanOrEqual(0);
  });

  it('prints the credits on the status stream, not with the run path', async () => {
    const kiro = makeKiro(async (spec, exit) => {
      await callTool(spec, 'finish');
      exit(0, 'answer\n▸ Credits: 0.25 • Time: 3s');
    });
    const result = await runCli({ kiro });
    expect(result.stderr).toContain('Kiro credits used: 0.25');
    expect(result.stdout).not.toContain('credits');
  });

  it('says the credits are unknown, with the reason, when Kiro printed none', async () => {
    const kiro = makeKiro(async (spec, exit) => {
      await callTool(spec, 'finish');
      exit(0, 'only an answer');
    });
    const result = await runCli({ kiro });
    expect(result.stderr).toMatch(/Kiro credits used: unknown \(.+\)/);
  });

  it('a step the agent takes goes through the Body and is recorded with the agent\'s thought', async () => {
    const kiro = makeKiro(async (spec, exit) => {
      await callTool(spec, 'read_page');
      await callTool(spec, 'think', { text: 'I will press Tab to reach the button.' });
      await callTool(spec, 'press_key', { key: 'Tab' });
      await callTool(spec, 'finish');
      exit(0);
    });
    const ghost = makeGhost();
    const result = await runCli({ kiro, ghost });
    expect(ghost.seen.acts).toEqual([{ type: 'key', key: 'Tab' }]);
    expect(result.stderr).toContain('Step 2: Press Tab');
    expect(result.code).toBe(EXIT.ok);
  });

  it('Kiro exiting with code 0 before the run ended gives gave_up and exit 0', async () => {
    const kiro = makeKiro((_spec, exit) => exit(0, 'I am done.'));
    const result = await runCli({ kiro });
    expect(result.code).toBe(EXIT.ok);
    expect(result.stderr).toContain('Result: gave_up');
  });

  it('Kiro exiting with a non-zero code gives an error that names the code, and exit 3', async () => {
    const kiro = makeKiro((_spec, exit) => exit(7, 'boom'));
    const result = await runCli({ kiro });
    expect(result.code).toBe(EXIT.resultError);
    expect(result.stderr).toContain('exit code 7');
  });

  it('a timeout kills Kiro, closes the Bridge, gives an error that names the limit, and exit 3', async () => {
    const kiro = makeKiro(() => undefined);
    const result = await runCli({ kiro, env: { HAUNT_UNDER_TEST: '1', KIRO_CLI_PATH: KIRO, HAUNT_AI_TIMEOUT_MS: '60' } });
    expect(result.code).toBe(EXIT.resultError);
    expect(result.stderr).toContain('60 ms');
    expect(kiro.killed()).toBeGreaterThanOrEqual(1);
    const spec = kiro.specs[0]!;
    await expect(fetch(`${spec.env.HAUNT_BRIDGE_URL}/tool`, { method: 'POST', body: '{}' })).rejects.toThrow();
  });

  it('Ctrl+C kills Kiro, closes the Bridge, writes nothing and exits 130', async () => {
    let interrupt: () => void = () => undefined;
    const kiro = makeKiro(async () => {
      interrupt();
    });
    const result = await runCli({
      kiro,
      onInterrupt: (handler) => {
        interrupt = handler;
        return () => undefined;
      },
    });
    expect(result.code).toBe(EXIT.interrupted);
    expect(kiro.killed()).toBeGreaterThanOrEqual(1);
    expect(result.world.browsersClosed).toBe(1);
    expect(existsSync(result.out)).toBe(false);
    expect(result.stdout).toBe('');
    const spec = kiro.specs[0]!;
    await expect(fetch(`${spec.env.HAUNT_BRIDGE_URL}/tool`, { method: 'POST', body: '{}' })).rejects.toThrow();
  });

  it('exits 2 with install help before any browser starts when Kiro is not found', async () => {
    const kiro = makeKiro(() => undefined);
    const result = await runCli({ kiro, kiroFound: false, env: { HAUNT_UNDER_TEST: '1' } });
    expect(result.code).toBe(EXIT.usage);
    expect(result.stderr).toContain('KIRO_CLI_PATH');
    expect(result.world.launches).toBe(0);
    expect(result.world.installedChecks).toBe(0);
    expect(kiro.specs).toHaveLength(0);
    expect(result.stdout).toBe('');
  });

  it('refuses a disallowed address in AI mode, before Kiro or a browser starts', async () => {
    const kiro = makeKiro(() => undefined);
    const result = await runCli({ kiro, url: 'https://example.com/' });
    expect(result.code).toBe(EXIT.usage);
    expect(result.world.launches).toBe(0);
    expect(kiro.specs).toHaveLength(0);
  });

  it('refuses --mind ai with another ghost', async () => {
    const world = makeWorld();
    const kiro = makeKiro(() => undefined);
    let stderr = '';
    const code = await main(['run', '--ghost', 'phantom', '--mission', 'pay-bill', '--url', 'http://localhost:3000', '--mind', 'ai', '--out', freshOut()], {
      launcher: world.launcher,
      stdout: () => undefined,
      stderr: (t) => {
        stderr += t;
      },
      env: { HAUNT_UNDER_TEST: '1', KIRO_CLI_PATH: KIRO },
      kiroLauncher: kiro.launcher,
      kiroExists: () => true,
    });
    expect(code).toBe(EXIT.usage);
    expect(stderr).toContain('The AI mind supports only the listener ghost.');
    expect(world.launches).toBe(0);
    expect(kiro.specs).toHaveLength(0);
  });

  it('the scripted run does not touch Kiro and prints no credits line', async () => {
    const world = makeWorld();
    const kiro = makeKiro(() => undefined);
    const fake = makeGhost();
    let stdout = '';
    let stderr = '';
    const code = await main(['run', '--ghost', 'listener', '--mission', 'pay-bill', '--url', 'http://localhost:3000', '--out', freshOut()], {
      launcher: world.launcher,
      stdout: (t) => {
        stdout += t;
      },
      stderr: (t) => {
        stderr += t;
      },
      cwd: root,
      env: { HAUNT_UNDER_TEST: '1' },
      repoRoot: fakeRepo,
      getGhost: () => fake.ghost,
      initScripts: [],
      now: () => NOW,
      getCommit: async () => 'abc1234',
      onInterrupt: () => () => undefined,
      kiroLauncher: kiro.launcher,
      kiroExists: () => false,
    });
    expect(code).toBe(EXIT.ok);
    expect(kiro.specs).toHaveLength(0);
    expect(stderr).not.toContain('Kiro');
    expect(stderr).toContain('Result: gave_up');
    expect(stdout.trim().endsWith('run.json')).toBe(true);
    expect(JSON.parse(readFileSync(stdout.trim(), 'utf8')).mind).toBe('scripted');
  });
});
