import { spawn } from 'node:child_process';
import path from 'node:path';

/*
 * The Kiro launcher (design: "Kiro launcher").
 *
 * Finds the Kiro CLI, builds its arguments, starts it as a child process and reads the credits line
 * from what it printed. The facts here (flags, trust syntax, credits format) were verified in task 1
 * and are recorded in the design under "Verified Kiro CLI facts".
 */

/** Name of the agent file in `.kiro/agents/`. */
export const AGENT_NAME = 'listener';

/** Time Kiro gets to finish, when `HAUNT_AI_TIMEOUT_MS` is not set to a positive integer. */
export const DEFAULT_TIMEOUT_MS = 600_000;

/** Most output kept from the child. The credits line is printed near the end, so the end is kept. */
const MAX_OUTPUT_CHARS = 200_000;

export interface KiroSpec {
  command: string;
  args: string[];
  env: Record<string, string>;
  cwd: string;
}

export interface KiroProcess {
  /** Resolves when the process ends. `code` is null when it was killed or could not start. */
  readonly exited: Promise<{ code: number | null; output: string }>;
  kill(): void;
}

export type KiroLauncher = (spec: KiroSpec) => KiroProcess;

export type KiroResolution = { ok: true; path: string } | { ok: false; help: string };

export type CreditsReport = { known: true; credits: number } | { known: false; reason: string };

export const INSTALL_HELP = [
  'The Kiro CLI was not found, so the AI mind cannot start.',
  'Install it from https://kiro.dev/docs/cli/ and make sure "kiro-cli" is on your PATH,',
  'or set KIRO_CLI_PATH to the full path of the kiro-cli executable.',
].join('\n');

/**
 * Finds the Kiro CLI. `KIRO_CLI_PATH` wins when that file exists. Otherwise the first PATH entry that
 * holds `kiro-cli` (`.exe` or `.cmd` on Windows) is used. Otherwise the answer is the install help.
 */
export function resolveKiroCli(
  env: NodeJS.ProcessEnv,
  exists: (file: string) => boolean,
  platform: NodeJS.Platform = process.platform,
): KiroResolution {
  const explicit = env.KIRO_CLI_PATH?.trim();
  if (explicit && exists(explicit)) return { ok: true, path: explicit };

  const windows = platform === 'win32';
  const flavour = windows ? path.win32 : path.posix;
  const pathKey = Object.keys(env).find((key) => key.toUpperCase() === 'PATH');
  const entries = (pathKey === undefined ? '' : (env[pathKey] ?? '')).split(flavour.delimiter).filter((entry) => entry.trim() !== '');
  const names = windows ? ['kiro-cli.exe', 'kiro-cli.cmd'] : ['kiro-cli'];

  for (const entry of entries) {
    for (const name of names) {
      const candidate = flavour.join(entry.trim().replace(/^"(.*)"$/, '$1'), name);
      if (exists(candidate)) return { ok: true, path: candidate };
    }
  }
  return { ok: false, help: INSTALL_HELP };
}

/** `HAUNT_AI_TIMEOUT_MS` as milliseconds: a positive whole number, otherwise the default of 10 minutes. */
export function parseTimeoutMs(raw: string | undefined): number {
  if (raw === undefined) return DEFAULT_TIMEOUT_MS;
  const text = raw.trim();
  if (!/^\d+$/.test(text)) return DEFAULT_TIMEOUT_MS;
  const value = Number(text);
  return Number.isSafeInteger(value) && value > 0 ? value : DEFAULT_TIMEOUT_MS;
}

/**
 * The arguments for `kiro-cli`, as verified in task 1. The goal is the positional prompt.
 * `--trust-tools=@haunt-mcp` trusts only the haunt-mcp tools; `--trust-workspace` skips the trust
 * question for this launch only.
 */
export function buildKiroArgs(goal: string): string[] {
  return ['chat', '--agent', AGENT_NAME, '--no-interactive', '--trust-workspace', '--trust-tools=@haunt-mcp', goal];
}

const CREDITS_LINE = /credits(?:\s+used)?\s*[:=]\s*(\d+(?:\.\d+)?)/gi;

/** Reads the credits from Kiro's output, as in "Credits: 0.25". With no such line the reason says so. */
export function parseCredits(output: string): CreditsReport {
  let last: string | undefined;
  for (const match of output.matchAll(CREDITS_LINE)) last = match[1];
  if (last === undefined) return { known: false, reason: 'Kiro printed no credits line' };
  const credits = Number(last);
  return Number.isFinite(credits) ? { known: true, credits } : { known: false, reason: 'the credits value could not be read' };
}

/** The credits line the CLI prints on its status stream. */
export function creditsLine(report: CreditsReport): string {
  return report.known ? `Kiro credits used: ${report.credits}` : `Kiro credits used: unknown (${report.reason})`;
}

/** Starts the real Kiro CLI with `child_process.spawn`, without a shell, merging stdout and stderr. */
export const defaultKiroLauncher: KiroLauncher = (spec) => {
  let output = '';
  const keep = (chunk: Buffer | string): void => {
    output += chunk.toString();
    if (output.length > MAX_OUTPUT_CHARS) output = output.slice(-MAX_OUTPUT_CHARS);
  };

  const child = spawn(spec.command, spec.args, {
    cwd: spec.cwd,
    env: spec.env,
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.on('data', keep);
  child.stderr.on('data', keep);

  const exited = new Promise<{ code: number | null; output: string }>((resolve) => {
    child.once('error', (error) => {
      keep(`\n${error.message}\n`);
      resolve({ code: null, output });
    });
    child.once('close', (code) => resolve({ code, output }));
  });

  return {
    exited,
    kill: () => {
      if (child.exitCode === null && !child.killed) child.kill();
    },
  };
};
