// Lantern_Bills_Harness: builds Lantern Bills from demo-site/ into engine/test-output/.lantern-bills-build/,
// serves that build with `vite preview` on port 3000 and stops it afterwards.
//
// Rules (see the haunt-engine spec, Requirement 12.5, 12.6, 12.8, 12.9, 12.10):
// - Nothing goes through a shell. Node runs Vite's JavaScript entry point directly.
// - Nothing is installed. If demo-site/node_modules is missing, the harness fails with a message.
// - Nothing is written into demo-site/. The build output goes to Test_Output.
// - The server is stopped by stop(), which can be called more than once and from finally / afterAll.

import { execFile, execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const PORT = 3000;
const URL_TO_WAIT_FOR = `http://localhost:${PORT}/`;
const DEFAULT_BUILD_TIMEOUT_MS = 90_000;
const DEFAULT_START_TIMEOUT_MS = 60_000;
const OUTPUT_TAIL_CHARS = 4_000;

const ENGINE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPO_DIR = path.resolve(ENGINE_DIR, '..');
const DEMO_SITE_DIR = path.join(REPO_DIR, 'demo-site');
const BUILD_DIR = path.join(ENGINE_DIR, 'test-output', '.lantern-bills-build');

export const LANTERN_BILLS_PORT = PORT;
export const LANTERN_BILLS_BUILD_DIR = BUILD_DIR;

export interface LanternBillsOptions {
  /** Maximum time for `vite build`. Default 90 s. */
  buildTimeoutMs?: number;
  /** Maximum time to wait for http://localhost:3000/ to answer 200. Default 60 s. */
  startTimeoutMs?: number;
  /** Folder that holds the demo site. Default: the repository's `demo-site/`. Only the harness's own tests change it. */
  demoSiteDir?: string;
  /** Receives progress lines (for example `console.error`). Default: silent. */
  log?: (line: string) => void;
}

export interface LanternBills {
  /** Always `http://localhost:3000`, without a trailing slash. */
  url: string;
  /** Output of `git status --porcelain -- demo-site` recorded before anything started. */
  gitStatusBefore: string;
  /** Absolute path of the folder that holds the build. */
  buildDir: string;
  /** Stops the server and every process it started. Safe to call more than once. */
  stop(): Promise<void>;
  /** Current output of `git status --porcelain -- demo-site`. */
  gitStatusNow(): Promise<string>;
  /** Throws when `git status --porcelain -- demo-site` differs from `gitStatusBefore`. */
  assertDemoSiteUnchanged(): Promise<void>;
}

export class LanternBillsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LanternBillsError';
  }
}

function viteBinOf(demoSiteDir: string): string {
  return path.join(demoSiteDir, 'node_modules', 'vite', 'bin', 'vite.js');
}

/** 12.10: throws when the demo site's dependencies are not installed. Never installs anything. */
export function checkDemoSiteInstalled(demoSiteDir: string = DEMO_SITE_DIR): void {
  if (!existsSync(path.join(demoSiteDir, 'node_modules')) || !existsSync(viteBinOf(demoSiteDir))) {
    throw new LanternBillsError('Run npm install in demo-site/ first. (The harness does not install anything itself.)');
  }
}

export async function gitStatusOfDemoSite(): Promise<string> {
  const { stdout } = await execFileAsync('git', ['status', '--porcelain', '--', 'demo-site'], {
    cwd: REPO_DIR,
    windowsHide: true,
    maxBuffer: 10 * 1024 * 1024,
  });
  return stdout;
}

/** Resolves true when something accepts connections at host:port. Refused, unreachable and no-IPv6 mean false. */
function isListening(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (value: boolean): void => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(1_500, () => done(false));
    socket.once('connect', () => done(true));
    socket.once('error', () => done(false));
  });
}

async function assertPortFree(): Promise<void> {
  const [v4, v6] = await Promise.all([isListening('127.0.0.1', PORT), isListening('::1', PORT)]);
  if (v4 || v6) {
    throw new LanternBillsError(
      `Port ${PORT} is already in use. Stop the other server (for example npm run dev in demo-site/) and try again.`,
    );
  }
}

async function waitForPortFree(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const [v4, v6] = await Promise.all([isListening('127.0.0.1', PORT), isListening('::1', PORT)]);
    if (!v4 && !v6) return;
    await sleep(100);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class Tail {
  private text = '';
  push(chunk: Buffer | string): void {
    this.text += chunk.toString();
    if (this.text.length > OUTPUT_TAIL_CHARS * 2) this.text = this.text.slice(-OUTPUT_TAIL_CHARS);
  }
  toString(): string {
    return this.text.slice(-OUTPUT_TAIL_CHARS).trim();
  }
}

interface Spawned {
  child: ChildProcess;
  output: Tail;
  exited: Promise<number | null>;
  hasExited(): boolean;
}

function spawnVite(demoSiteDir: string, args: string[]): Spawned {
  const child = spawn(process.execPath, [viteBinOf(demoSiteDir), ...args], {
    cwd: demoSiteDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    shell: false,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' },
  });
  const output = new Tail();
  child.stdout?.on('data', (chunk: Buffer) => output.push(chunk));
  child.stderr?.on('data', (chunk: Buffer) => output.push(chunk));
  let exitedFlag = false;
  const exited = new Promise<number | null>((resolve) => {
    child.once('error', (err) => {
      output.push(`\n${err.message}`);
      exitedFlag = true;
      resolve(null);
    });
    child.once('exit', (code) => {
      exitedFlag = true;
      resolve(code);
    });
  });
  return { child, output, exited, hasExited: () => exitedFlag };
}

/** Kills the process and everything it started. No shell: taskkill on Windows, a signal elsewhere. */
async function killTree(proc: Spawned): Promise<void> {
  const pid = proc.child.pid;
  if (proc.hasExited() || pid === undefined) return;
  if (process.platform === 'win32') {
    try {
      await execFileAsync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
    } catch {
      // The process may have exited between the check and the call.
      proc.child.kill();
    }
  } else {
    proc.child.kill('SIGKILL');
  }
  await Promise.race([proc.exited, sleep(10_000)]);
}

/** Synchronous last resort, used only when the test process itself is exiting. */
function killTreeSync(proc: Spawned): void {
  const pid = proc.child.pid;
  if (proc.hasExited() || pid === undefined) return;
  try {
    if (process.platform === 'win32') {
      execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    } else {
      proc.child.kill('SIGKILL');
    }
  } catch {
    // Nothing more can be done while exiting.
  }
}

async function runBuild(demoSiteDir: string, timeoutMs: number, log: (line: string) => void): Promise<void> {
  await mkdir(path.dirname(BUILD_DIR), { recursive: true });
  const build = spawnVite(demoSiteDir, ['build', '--base', '/', '--outDir', BUILD_DIR, '--emptyOutDir']);
  let timer: NodeJS.Timeout | undefined;
  const timedOut = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs);
  });
  try {
    const outcome = await Promise.race([build.exited, timedOut]);
    if (outcome === 'timeout') {
      throw new LanternBillsError(
        `Building Lantern Bills took longer than ${Math.round(timeoutMs / 1000)} seconds and was stopped.\n${build.output}`,
      );
    }
    if (outcome !== 0) {
      throw new LanternBillsError(`Building Lantern Bills failed (exit code ${String(outcome)}).\n${build.output}`);
    }
    log(`Lantern Bills built into ${BUILD_DIR}`);
  } finally {
    if (timer) clearTimeout(timer);
    await killTree(build);
  }
}

async function answers200(): Promise<boolean> {
  try {
    const response = await fetch(URL_TO_WAIT_FOR, { signal: AbortSignal.timeout(2_000), redirect: 'manual' });
    await response.arrayBuffer();
    return response.status === 200;
  } catch {
    return false;
  }
}

/**
 * Builds Lantern Bills and serves it on http://localhost:3000.
 * Call `stop()` in `afterAll` or `finally`. When this function throws, everything it started is already stopped.
 */
export async function startLanternBills(options: LanternBillsOptions = {}): Promise<LanternBills> {
  const buildTimeoutMs = options.buildTimeoutMs ?? DEFAULT_BUILD_TIMEOUT_MS;
  const startTimeoutMs = options.startTimeoutMs ?? DEFAULT_START_TIMEOUT_MS;
  const log = options.log ?? (() => undefined);
  const demoSiteDir = options.demoSiteDir ?? DEMO_SITE_DIR;

  // 12.10: never install anything.
  checkDemoSiteInstalled(demoSiteDir);

  // 12.9: record the state of demo-site/ before anything runs.
  const gitStatusBefore = await gitStatusOfDemoSite();

  // 12.5: both IPv4 and IPv6 loopback must be free.
  await assertPortFree();

  let server: Spawned | undefined;
  let stopping: Promise<void> | undefined;
  const onProcessExit = (): void => {
    if (server) killTreeSync(server);
  };

  const stop = (): Promise<void> => {
    stopping ??= (async () => {
      process.off('exit', onProcessExit);
      if (server) {
        await killTree(server);
        await waitForPortFree(10_000);
      }
    })();
    return stopping;
  };

  try {
    await runBuild(demoSiteDir, buildTimeoutMs, log);

    // `--host localhost` lets Vite bind the addresses localhost resolves to, so http://localhost:3000 answers
    // and the server is not reachable from other machines.
    server = spawnVite(demoSiteDir, [
      'preview',
      '--base', '/',
      '--outDir', BUILD_DIR,
      '--host', 'localhost',
      '--port', String(PORT),
      '--strictPort',
    ]);
    process.once('exit', onProcessExit);

    const deadline = Date.now() + startTimeoutMs;
    for (;;) {
      if (server.hasExited()) {
        throw new LanternBillsError(`The Lantern Bills server stopped while starting.\n${server.output}`);
      }
      if (await answers200()) break;
      if (Date.now() >= deadline) {
        throw new LanternBillsError(
          `${URL_TO_WAIT_FOR} did not answer with HTTP 200 within ${Math.round(startTimeoutMs / 1000)} seconds.\n${server.output}`,
        );
      }
      await sleep(200);
    }
    log(`Lantern Bills is running at ${URL_TO_WAIT_FOR}`);
  } catch (error) {
    await stop();
    throw error;
  }

  return {
    url: `http://localhost:${PORT}`,
    gitStatusBefore,
    buildDir: BUILD_DIR,
    stop,
    gitStatusNow: gitStatusOfDemoSite,
    async assertDemoSiteUnchanged(): Promise<void> {
      const after = await gitStatusOfDemoSite();
      if (after !== gitStatusBefore) {
        throw new LanternBillsError(
          `demo-site/ changed while the tests ran.\nBefore (git status --porcelain -- demo-site):\n${gitStatusBefore || '(clean)'}\nAfter:\n${after || '(clean)'}`,
        );
      }
    },
  };
}
