import { execFile, execFileSync, spawn } from 'node:child_process';
import type { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { LANTERN_URL } from './ghosts.ts';

export const SITE_PORT = 3000;
const BUILD_TIMEOUT_MS = 120_000;
const READY_TIMEOUT_MS = 60_000;
const STOP_WAIT_MS = 10_000;

export interface SiteCommand {
  /** Arguments for the Node executable. The first one is Vite's entry file. */
  args: string[];
  cwd: string;
}
export interface SiteCommands {
  buildDir: string;
  build: SiteCommand;
  preview: SiteCommand;
}

/**
 * Pure. Both commands use the absolute build folder under crew-app/.patrol/. Vite resolves a relative
 * --outDir against its project root (demo-site/), which would write into a protected folder.
 */
export function buildSiteCommands(repoRoot: string, pathApi: Pick<typeof path, 'resolve' | 'join'> = path): SiteCommands {
  const buildDir = pathApi.resolve(repoRoot, 'crew-app', '.patrol', 'site-build');
  const demoSite = pathApi.join(repoRoot, 'demo-site');
  const vite = pathApi.join(demoSite, 'node_modules', 'vite', 'bin', 'vite.js');
  return {
    buildDir,
    build: { args: [vite, 'build', '--base', '/', '--outDir', buildDir, '--emptyOutDir'], cwd: demoSite },
    preview: {
      args: [vite, 'preview', '--base', '/', '--outDir', buildDir, '--host', 'localhost', '--port', String(SITE_PORT), '--strictPort'],
      cwd: demoSite,
    },
  };
}

export type SiteStart = { ok: true; stop(): Promise<void> } | { ok: false; reason: string };
export interface SiteController {
  start(): Promise<SiteStart>;
}

/** The small part of a child process the controller uses. */
export interface ChildLike extends EventEmitter {
  pid?: number | undefined;
  stdout: EventEmitter | null;
  stderr: EventEmitter | null;
  kill(signal?: NodeJS.Signals | number): boolean;
}

export interface SiteDeps {
  spawn(command: string, args: string[], options: { cwd: string; shell: false; windowsHide: true; stdio: ['ignore', 'pipe', 'pipe']; env: NodeJS.ProcessEnv }): ChildLike;
  portInUse(): Promise<boolean>;
  fetchTitle(): Promise<string | null>;
  sleep(ms: number): Promise<void>;
  now(): number;
  platform: string;
  /** Runs an executable (used for taskkill). Rejects when it fails. */
  execFile(command: string, args: string[]): Promise<void>;
  /** Synchronous last resort while the patrol process is exiting. */
  killSync(child: ChildLike): void;
  mkdir(dir: string): Promise<void>;
  exists(p: string): boolean;
  /** Registers a hook for process exit and returns a function that removes it. */
  onProcessExit(hook: () => void): () => void;
  buildTimeoutMs?: number;
  readyTimeoutMs?: number;
}

class Tail {
  private text = '';
  push(chunk: Buffer | string): void {
    this.text += chunk.toString();
    if (this.text.length > 8_000) this.text = this.text.slice(-4_000);
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

interface Running {
  child: ChildLike;
  tail: Tail;
  exited: Promise<number | null>;
  hasExited(): boolean;
}

function childEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' };
  delete env.HAUNT_UNDER_TEST;
  return env;
}

function startNode(deps: SiteDeps, command: SiteCommand): Running {
  const child = deps.spawn(process.execPath, command.args, {
    cwd: command.cwd,
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: childEnv(),
  });
  const tail = new Tail();
  child.stdout?.on('data', (c: Buffer | string) => tail.push(c));
  child.stderr?.on('data', (c: Buffer | string) => tail.push(c));
  let done = false;
  const exited = new Promise<number | null>((resolve) => {
    child.once('error', (error: Error) => {
      tail.push(`\n${error.message}`);
      done = true;
      resolve(null);
    });
    child.once('exit', (code: number | null) => {
      done = true;
      resolve(code);
    });
  });
  return { child, tail, exited, hasExited: () => done };
}

async function killTree(deps: SiteDeps, proc: Running): Promise<void> {
  const pid = proc.child.pid;
  if (proc.hasExited() || pid === undefined) return;
  if (deps.platform === 'win32') {
    try {
      await deps.execFile('taskkill', ['/pid', String(pid), '/T', '/F']);
    } catch {
      proc.child.kill();
    }
  } else {
    proc.child.kill('SIGKILL');
  }
  await Promise.race([proc.exited, deps.sleep(STOP_WAIT_MS)]);
}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | 'timeout'> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function createSiteController(repoRoot: string, deps: SiteDeps = createRealSiteDeps()): SiteController {
  const commands = buildSiteCommands(repoRoot);
  return {
    async start() {
      if (await deps.portInUse()) {
        return { ok: false, reason: `Port ${SITE_PORT} is already in use. Stop whatever is using it and try again.` };
      }
      const vite = commands.build.args[0] as string;
      if (!deps.exists(vite)) return { ok: false, reason: 'Vite was not found in demo-site/node_modules. Run npm install in demo-site/ first.' };

      await deps.mkdir(path.dirname(commands.buildDir));
      const build = startNode(deps, commands.build);
      const buildResult = await withTimeout(build.exited, deps.buildTimeoutMs ?? BUILD_TIMEOUT_MS);
      if (buildResult === 'timeout') {
        await killTree(deps, build);
        return { ok: false, reason: 'Building Lantern Bills took too long and was stopped.' };
      }
      if (buildResult !== 0) return { ok: false, reason: `Building Lantern Bills failed. ${build.tail.last(3)}`.trim() };

      const server = startNode(deps, commands.preview);
      const onExit = (): void => deps.killSync(server.child);
      const removeHook = deps.onProcessExit(onExit);
      const stop = async (): Promise<void> => {
        removeHook();
        await killTree(deps, server);
      };
      const deadline = deps.now() + (deps.readyTimeoutMs ?? READY_TIMEOUT_MS);
      for (;;) {
        if (server.hasExited()) {
          removeHook();
          return { ok: false, reason: `Lantern Bills stopped while starting. ${server.tail.last(3)}`.trim() };
        }
        const title = await deps.fetchTitle();
        if (title !== null && title.includes('Lantern Bills')) break;
        if (deps.now() >= deadline) {
          await stop();
          return { ok: false, reason: `Lantern Bills did not answer on ${LANTERN_URL} with the right page title in time.` };
        }
        await deps.sleep(250);
      }
      return { ok: true, stop };
    },
  };
}

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

export function createRealSiteDeps(): SiteDeps {
  return {
    spawn: (command, args, options) => spawn(command, args, options) as unknown as ChildLike,
    async portInUse() {
      const [v4, v6] = await Promise.all([isListening('127.0.0.1', SITE_PORT), isListening('::1', SITE_PORT)]);
      return v4 || v6;
    },
    async fetchTitle() {
      try {
        const response = await fetch(`${LANTERN_URL}/`, { signal: AbortSignal.timeout(2_000), redirect: 'manual' });
        if (response.status !== 200) return null;
        const text = await response.text();
        return /<title>([^<]*)<\/title>/i.exec(text)?.[1] ?? '';
      } catch {
        return null;
      }
    },
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    now: () => Date.now(),
    platform: process.platform,
    execFile: (command, args) =>
      new Promise<void>((resolve, reject) => {
        execFile(command, args, { windowsHide: true }, (error) => (error ? reject(error) : resolve()));
      }),
    killSync(child) {
      if (child.pid === undefined) return;
      try {
        if (process.platform === 'win32') execFileSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        else child.kill('SIGKILL');
      } catch {
        // Nothing more can be done while exiting.
      }
    },
    mkdir: async (dir) => {
      await mkdir(dir, { recursive: true });
    },
    exists: (p) => existsSync(p),
    onProcessExit(hook) {
      process.once('exit', hook);
      return () => {
        process.off('exit', hook);
      };
    },
  };
}

// ---- Command runner ----

export interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}
export interface CommandRunner {
  run(args: string[], options: { cwd: string; timeoutMs: number }): Promise<CommandResult>;
}

const OUTPUT_LIMIT = 8_000;

/** Spawns the current Node executable (no shell) and keeps the last 8 000 characters of each stream. */
export function createCommandRunner(): CommandRunner {
  return {
    run(args, options) {
      return new Promise<CommandResult>((resolve) => {
        let stdout = '';
        let stderr = '';
        let timedOut = false;
        const child = spawn(process.execPath, args, {
          cwd: options.cwd,
          shell: false,
          windowsHide: true,
          stdio: ['ignore', 'pipe', 'pipe'],
          env: childEnv(),
        });
        child.stdout.on('data', (c: Buffer) => {
          stdout = (stdout + c.toString()).slice(-OUTPUT_LIMIT);
        });
        child.stderr.on('data', (c: Buffer) => {
          stderr = (stderr + c.toString()).slice(-OUTPUT_LIMIT);
        });
        const timer = setTimeout(() => {
          timedOut = true;
          if (child.pid === undefined) return;
          if (process.platform === 'win32') {
            execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => child.kill());
          } else {
            child.kill('SIGKILL');
          }
        }, options.timeoutMs);
        child.once('error', (error) => {
          clearTimeout(timer);
          resolve({ code: null, stdout, stderr: `${stderr}\n${error.message}`.slice(-OUTPUT_LIMIT), timedOut });
        });
        child.once('close', (code) => {
          clearTimeout(timer);
          resolve({ code: timedOut ? null : code, stdout, stderr, timedOut });
        });
      });
    },
  };
}
