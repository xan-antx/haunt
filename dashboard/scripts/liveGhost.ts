// "Summon a live ghost", the local half. Only `npm run dev` loads this (see vite.config.ts).
//
// One job at a time: start Lantern Bills on port 3000 if nothing is there yet, run The Listener with
// the engine's own scripted mind through `haunt run`, collect the new run into public/runs/, and stop
// the site again if this job started it.
//
// Safety rules (see engine/README.md):
// - The address, ghost and mission are constants. Nothing the browser sends reaches a command line.
// - Only requests from this computer are served, with a matching Host and Origin.
// - Nothing goes through a shell. Node runs Vite's and the engine's JavaScript entry points directly.
// - Nothing is written into demo-site/ or engine/. The site is built into dashboard/.live/.

import { execFile, execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { promisify } from 'node:util';
import { collectRuns } from './collect';

const execFileAsync = promisify(execFile);

export const SUMMON_PATH = '/__haunt/summon';
export const SUMMON_HEADER = 'x-haunt-summon';
export const LANTERN_PORT = 3000;
export const LANTERN_URL = `http://localhost:${LANTERN_PORT}`;
export const GHOST = 'listener';
export const GHOST_NAME = 'The Listener';
export const MISSION = 'pay-bill';

const BUILD_TIMEOUT_MS = 120_000;
const START_TIMEOUT_MS = 60_000;
const RUN_TIMEOUT_MS = 240_000;

export type LiveState = 'idle' | 'running' | 'done' | 'failed';

export interface LiveStatus {
  state: LiveState;
  /** One plain sentence about what is happening now, or how it ended. */
  message: string;
  /** The ghost's latest step number while it is walking. */
  step?: number;
  /** Run_Key of the new run, once it is collected. */
  runKey?: string;
}

/** Everything the job needs from the outside world, so tests can replace it. */
export interface LiveGhostDeps {
  /** Tells whether something answers on localhost:3000, and whether it is Lantern Bills. */
  probeSite(): Promise<'none' | 'lantern' | 'other'>;
  /** Builds and serves Lantern Bills on port 3000. `stop` ends it. */
  startSite(): Promise<{ stop(): Promise<void> }>;
  /** Runs `haunt run` and reports each line of progress. Resolves with the exit code and the saved run.json path. */
  runGhost(onLine: (line: string) => void): Promise<{ code: number | null; runJsonPath: string | null; tail: string }>;
  /** Copies the new run into public/runs/ and returns its Run_Key. */
  collect(runJsonPath: string): string | null;
}

export class LiveGhost {
  private status: LiveStatus = { state: 'idle', message: '' };

  constructor(private readonly deps: LiveGhostDeps) {}

  getStatus(): LiveStatus {
    return { ...this.status };
  }

  /** Starts a job. Returns false when one is already running. */
  start(): boolean {
    if (this.status.state === 'running') return false;
    this.status = { state: 'running', message: 'Getting ready.' };
    void this.run();
    return true;
  }

  private set(next: LiveStatus): void {
    this.status = next;
  }

  private async run(): Promise<void> {
    let site: { stop(): Promise<void> } | undefined;
    try {
      const found = await this.deps.probeSite();
      if (found === 'other') {
        this.set({
          state: 'failed',
          message: `Something other than Lantern Bills is using port ${LANTERN_PORT}. Stop it and try again.`,
        });
        return;
      }
      if (found === 'none') {
        this.set({ state: 'running', message: `Starting Lantern Bills on port ${LANTERN_PORT}. The first build takes a little while.` });
        site = await this.deps.startSite();
      } else {
        this.set({ state: 'running', message: `Lantern Bills is already running on port ${LANTERN_PORT}.` });
      }

      this.set({ state: 'running', message: `${GHOST_NAME} is walking into Lantern Bills.` });
      const result = await this.deps.runGhost((line) => {
        const step = parseStep(line);
        if (step !== null) {
          this.set({ state: 'running', message: `${GHOST_NAME} is at step ${step}.`, step });
        }
      });

      // Exit code 0: saved. 3: saved, and the run ended with an error that the dashboard shows.
      if ((result.code === 0 || result.code === 3) && result.runJsonPath !== null) {
        this.set({ state: 'running', message: 'Adding the new run to the dashboard.' });
        const runKey = this.deps.collect(result.runJsonPath);
        if (runKey === null) {
          this.set({ state: 'failed', message: 'The ghost finished, but the dashboard could not find its run file.' });
        } else {
          this.set({ state: 'done', message: `${GHOST_NAME} finished. The new run is on the dashboard.`, runKey });
        }
      } else {
        const why = result.tail === '' ? `exit code ${String(result.code)}` : result.tail;
        this.set({ state: 'failed', message: `${GHOST_NAME} could not finish. ${why}` });
      }
    } catch (error) {
      this.set({ state: 'failed', message: error instanceof Error ? error.message : String(error) });
    } finally {
      if (site) {
        try {
          await site.stop();
        } catch {
          // The site is local and ours. If it will not stop, the final message above still stands.
        }
      }
      // The final state may only be reported after the site is down.
      if (this.status.state === 'running') this.set({ state: 'failed', message: 'The ghost stopped before it finished.' });
    }
  }
}

/** The step number in an engine progress line such as "Step 4: Press Tab", or null. */
export function parseStep(line: string): number | null {
  const match = /^Step (\d+):/.exec(line.trim());
  return match ? Number(match[1]) : null;
}

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function hostnameOf(hostHeader: string): string {
  // "localhost:3001" -> "localhost"; "[::1]:3001" -> "[::1]"
  return hostHeader.startsWith('[') ? hostHeader.slice(0, hostHeader.indexOf(']') + 1) : hostHeader.split(':')[0] ?? '';
}

/**
 * True only for a request that comes from this computer, addressed to a local name (so a web page
 * that rebinds its own name to 127.0.0.1 is refused), from this dashboard's own page or no page.
 */
export function isLocalRequest(request: {
  remoteAddress: string | undefined;
  host: string | undefined;
  origin: string | undefined;
}): boolean {
  if (request.remoteAddress === undefined || !LOOPBACK.has(request.remoteAddress)) return false;
  if (request.host === undefined || !LOCAL_HOSTS.has(hostnameOf(request.host.toLowerCase()))) return false;
  if (request.origin !== undefined) {
    try {
      const origin = new URL(request.origin);
      if (origin.host.toLowerCase() !== request.host.toLowerCase()) return false;
    } catch {
      return false;
    }
  }
  return true;
}

function send(res: ServerResponse, code: number, body: unknown): void {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

/** Connect-style middleware for `/__haunt/summon`: POST starts a job, GET reports progress. */
export function createSummonMiddleware(ghost: LiveGhost) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void): void => {
    const url = (req.url ?? '').split('?')[0];
    if (url !== SUMMON_PATH) {
      next();
      return;
    }
    const local = isLocalRequest({
      remoteAddress: req.socket.remoteAddress,
      host: req.headers.host,
      origin: typeof req.headers.origin === 'string' ? req.headers.origin : undefined,
    });
    if (!local) {
      send(res, 403, { error: 'Live ghosts can only be summoned from this computer.' });
      return;
    }
    if (req.method === 'GET') {
      send(res, 200, ghost.getStatus());
      return;
    }
    if (req.method === 'POST') {
      // A custom header cannot be sent by another site's form or simple request.
      if (req.headers[SUMMON_HEADER] !== '1') {
        send(res, 400, { error: 'Missing summon header.' });
        return;
      }
      const started = ghost.start();
      send(res, started ? 202 : 409, ghost.getStatus());
      return;
    }
    res.setHeader('Allow', 'GET, POST');
    send(res, 405, { error: 'Use GET or POST.' });
  };
}

// ---- The real world ----

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

async function portInUse(): Promise<boolean> {
  const [v4, v6] = await Promise.all([isListening('127.0.0.1', LANTERN_PORT), isListening('::1', LANTERN_PORT)]);
  return v4 || v6;
}

async function fetchTitle(): Promise<string | null> {
  try {
    const response = await fetch(`${LANTERN_URL}/`, { signal: AbortSignal.timeout(2_000), redirect: 'manual' });
    if (response.status !== 200) return null;
    const text = await response.text();
    return /<title>([^<]*)<\/title>/i.exec(text)?.[1] ?? '';
  } catch {
    return null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class Tail {
  private text = '';
  push(chunk: Buffer | string): void {
    this.text += chunk.toString();
    if (this.text.length > 8_000) this.text = this.text.slice(-4_000);
  }
  /** The last line that is an absolute path ending in run.json, or null. */
  savedRunPath(): string | null {
    const found = this.text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => path.isAbsolute(l) && /[\\/]run\.json$/.test(l));
    return found[found.length - 1] ?? null;
  }
  last(lines: number): string {
    return this.text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l !== '')
      .slice(-lines)
      .join(' ');
  }
}

interface Spawned {
  child: ChildProcess;
  tail: Tail;
  exited: Promise<number | null>;
  hasExited(): boolean;
}

function spawnNode(cwd: string, args: string[], onLine?: (line: string) => void): Spawned {
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' };
  delete env.HAUNT_UNDER_TEST;
  const child = spawn(process.execPath, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, shell: false, env });
  const tail = new Tail();
  let pending = '';
  const feed = (chunk: Buffer): void => {
    tail.push(chunk);
    if (!onLine) return;
    pending += chunk.toString();
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() ?? '';
    for (const line of lines) onLine(line);
  };
  child.stdout?.on('data', feed);
  child.stderr?.on('data', feed);
  let exitedFlag = false;
  const exited = new Promise<number | null>((resolve) => {
    child.once('error', (error) => {
      tail.push(`\n${error.message}`);
      exitedFlag = true;
      resolve(null);
    });
    child.once('exit', (code) => {
      exitedFlag = true;
      resolve(code);
    });
  });
  return { child, tail, exited, hasExited: () => exitedFlag };
}

async function killTree(proc: Spawned): Promise<void> {
  const pid = proc.child.pid;
  if (proc.hasExited() || pid === undefined) return;
  if (process.platform === 'win32') {
    try {
      await execFileAsync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true });
    } catch {
      proc.child.kill();
    }
  } else {
    proc.child.kill('SIGKILL');
  }
  await Promise.race([proc.exited, sleep(10_000)]);
}

/** Synchronous last resort, used only while the process is exiting. */
function killTreeSync(proc: Spawned): void {
  const pid = proc.child.pid;
  if (proc.hasExited() || pid === undefined) return;
  try {
    if (process.platform === 'win32') execFileSync('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else proc.child.kill('SIGKILL');
  } catch {
    // Nothing more can be done while exiting.
  }
}

async function withTimeout<T>(work: Promise<T>, ms: number, onTimeout: () => Error): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(onTimeout()), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface NodeDepsOptions {
  /** The repository root (the folder that holds demo-site/, engine/ and runs/). */
  repoRoot: string;
  /** dashboard/ */
  dashboardDir: string;
  log?: (line: string) => void;
}

export function createNodeDeps(options: NodeDepsOptions): LiveGhostDeps {
  const { repoRoot, dashboardDir } = options;
  const log = options.log ?? (() => undefined);
  const demoSiteDir = path.join(repoRoot, 'demo-site');
  const engineDir = path.join(repoRoot, 'engine');
  const runsDir = path.join(repoRoot, 'runs');
  const buildDir = path.join(dashboardDir, '.live', 'lantern-bills-build');
  const viteBin = path.join(demoSiteDir, 'node_modules', 'vite', 'bin', 'vite.js');
  const cli = path.join(engineDir, 'bin', 'haunt.mjs');

  return {
    async probeSite() {
      if (!(await portInUse())) return 'none';
      const title = await fetchTitle();
      return title !== null && title.includes('Lantern Bills') ? 'lantern' : 'other';
    },

    async startSite() {
      if (!existsSync(viteBin)) throw new Error('Run npm install in demo-site/ first. The dashboard does not install anything itself.');
      if (!existsSync(path.join(engineDir, 'node_modules'))) throw new Error('Run npm install in engine/ first. The dashboard does not install anything itself.');
      await mkdir(path.dirname(buildDir), { recursive: true });

      const build = spawnNode(demoSiteDir, [viteBin, 'build', '--base', '/', '--outDir', buildDir, '--emptyOutDir']);
      try {
        const code = await withTimeout(build.exited, BUILD_TIMEOUT_MS, () => new Error('Building Lantern Bills took too long and was stopped.'));
        if (code !== 0) throw new Error(`Building Lantern Bills failed. ${build.tail.last(3)}`);
      } finally {
        await killTree(build);
      }
      log('Haunt: Lantern Bills built.');

      const server = spawnNode(demoSiteDir, [
        viteBin, 'preview', '--base', '/', '--outDir', buildDir, '--host', 'localhost', '--port', String(LANTERN_PORT), '--strictPort',
      ]);
      // If the dev server itself is closed mid-job, do not leave the site running.
      const onExit = (): void => killTreeSync(server);
      process.once('exit', onExit);
      const stop = async (): Promise<void> => {
        process.off('exit', onExit);
        await killTree(server);
        log('Haunt: Lantern Bills stopped.');
      };
      const deadline = Date.now() + START_TIMEOUT_MS;
      for (;;) {
        if (server.hasExited()) throw new Error(`Lantern Bills stopped while starting. ${server.tail.last(3)}`);
        const title = await fetchTitle();
        if (title !== null && title.includes('Lantern Bills')) break;
        if (Date.now() >= deadline) {
          await stop();
          throw new Error(`Lantern Bills did not answer on port ${LANTERN_PORT} in time.`);
        }
        await sleep(250);
      }
      log(`Haunt: Lantern Bills is running at ${LANTERN_URL}`);
      return { stop };
    },

    async runGhost(onLine) {
      const proc = spawnNode(
        engineDir,
        [cli, 'run', '--ghost', GHOST, '--mission', MISSION, '--url', LANTERN_URL, '--out', runsDir],
        onLine,
      );
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        void killTree(proc);
      }, RUN_TIMEOUT_MS);
      const code = await proc.exited;
      clearTimeout(timer);
      // The engine prints the absolute path of the saved run.json as the last line on standard output.
      const runJsonPath = code === 0 || code === 3 ? proc.tail.savedRunPath() : null;
      return { code, runJsonPath, tail: timedOut ? 'It took too long and was stopped.' : proc.tail.last(2) };
    },

    collect(runJsonPath) {
      const relative = path.relative(runsDir, path.dirname(runJsonPath));
      if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return null;
      const folder = relative.split(path.sep).join('/');
      const index = collectRuns({ runsDir, outDir: path.join(dashboardDir, 'public', 'runs'), log });
      return index.entries.find((entry) => entry.folder === folder && entry.errors.length === 0)?.key ?? null;
    },
  };
}
