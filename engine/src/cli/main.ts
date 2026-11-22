import { randomInt } from 'node:crypto';
import { existsSync, readdirSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs as nodeParseArgs } from 'node:util';
import type { Browser } from 'playwright';
import { isAllowedAddress, refusalMessage } from '../config/address.ts';
import { GUARDED_CONTEXT_OPTIONS, installGuard } from '../config/guard.ts';
import { ConfigError, loadConfig } from '../config/loadConfig.ts';
import { formatProblem } from '../contract/invariants.ts';
import { DetectorRunner } from '../core/detectors.ts';
import { finalizeRun } from '../core/finalize.ts';
import { findRepositoryRoot, getShortCommit } from '../core/git.ts';
import { Recorder } from '../core/recorder.ts';
import { mulberry32 } from '../core/rng.ts';
import { folderExistsIn, makeRunId } from '../core/runId.ts';
import { applyThrottling } from '../core/throttling.ts';
import { applyAcceptLanguage } from '../core/acceptLanguage.ts';
import { runLoop } from '../core/runLoop.ts';
import type { RunLoopOutcome, RunLoopRecorder } from '../core/runLoop.ts';
import type { ActionResult, Body, GhostId } from '../core/types.ts';
import { writeRunFolder } from '../core/writer.ts';
import { GHOST_IDS, getGhost, pageInitScripts } from '../ghosts/registry.ts';
import type { AnyGhost } from '../ghosts/registry.ts';
import type { Heard } from '../ghosts/listener/ax.ts';
import type { ListenerAction } from '../ghosts/listener/body.ts';
import { startBridge } from '../mind/ai/bridge.ts';
import { AiRunDriver } from '../mind/ai/driver.ts';
import {
  buildKiroArgs,
  creditsLine,
  defaultKiroLauncher,
  parseCredits,
  parseTimeoutMs,
  resolveKiroCli,
} from '../mind/ai/kiro.ts';
import type { KiroLauncher } from '../mind/ai/kiro.ts';
import { loadMission, MissionLoadError } from '../missions/loadMission.ts';
import type { Intention, Mission } from '../missions/loadMission.ts';
import { applyTemplates } from '../missions/templates.ts';

export const USAGE = `Usage:
  npx haunt run --ghost <listener|phantom|bebe> --mission <id> --url <url>
                [--out <dir>] [--site <key>] [--site-name <text>] [--seed <int>] [--headed]
                [--config <file>] [--missions <dir>] [--mind <scripted|ai>]
  npx haunt --help | npx haunt run --help

Ghosts:
  listener   keyboard only, through a screen reader's view
  phantom    slow 3G and an old phone
  bebe       200% zoom, Punjabi or Hindi, wary of tricky wording

Options:
  --ghost <name>      which ghost to send (required)
  --mission <id>      the mission to attempt, for example pay-bill (required)
  --url <url>         the page to open; only localhost, 127.0.0.1 and allowedDomains (required)
  --out <dir>         where run folders go, resolved against the current folder (default: runs/)
  --site <key>        site key to use instead of the mission's own (must be in haunt.config.json)
  --site-name <text>  name written to the run's site.name (default: the site's name in haunt.config.json)
  --seed <int>        seed for the visual ghosts' timing jitter (default: random, printed)
  --headed            show the browser window
  --config <file>     use this config file instead of engine/haunt.config.json
  --missions <dir>    read missions from this folder instead of engine/missions
  --mind <name>       scripted (default) or ai: a Kiro agent chooses the Listener's keys (listener only)
  -h, --help          show this text

Exit codes:
  0 succeeded or gave up, run saved    1 invalid run, no Chromium, or page not opened
  2 bad arguments, config, mission, site, address or Out_Root
  3 result error, run saved            130 interrupted with Ctrl+C, nothing written
`;

/** Exit codes (Requirement 2). */
export const EXIT = { ok: 0, failed: 1, usage: 2, resultError: 3, interrupted: 130 } as const;

/** The pieces of Playwright the CLI needs. Injectable, so tests never start a real browser. */
export interface BrowserLauncher {
  /** Tells whether the Chromium that Playwright would launch is installed. */
  isInstalled(): Promise<boolean>;
  launch(options: { headless: boolean }): Promise<Browser>;
}

/** The launcher that uses Playwright. Playwright is imported only when one of its methods runs. */
export const defaultLauncher: BrowserLauncher = {
  async isInstalled() {
    const { chromium } = await import('playwright');
    try {
      return existsSync(chromium.executablePath());
    } catch {
      return false;
    }
  },
  async launch(options) {
    const { chromium } = await import('playwright');
    return chromium.launch(options);
  },
};

/** Everything `main` reads from the outside world. Every field is optional. */
export interface CliDeps {
  launcher?: BrowserLauncher;
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  /** Folder that relative `--out`, `--config` and `--missions` values resolve against. */
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** The repository root (the folder with `.git`). Found from `engine/` when absent. */
  repoRoot?: string;
  /** Looks up a registered Ghost. Defaults to the ghost registry. */
  getGhost?: (id: GhostId) => AnyGhost | undefined;
  /** Sources for `page.addInitScript`. Defaults to `pageInitScripts` from the registry. */
  initScripts?: readonly string[];
  now?: () => Date;
  /** Defaults to `git rev-parse --short HEAD` in the repository root. */
  getCommit?: () => Promise<string>;
  /** Registers a Ctrl+C handler and returns a function that removes it. Defaults to `process.on('SIGINT')`. */
  onInterrupt?: (handler: () => void) => () => void;
  /** Starts the Kiro CLI for `--mind ai`. Defaults to `child_process.spawn`. Tests pass a fake. */
  kiroLauncher?: KiroLauncher;
  /** Tells whether a file exists, for finding the Kiro CLI. Defaults to `fs.existsSync`. */
  kiroExists?: (file: string) => boolean;
  /** How long Kiro gets to exit on its own after the run has ended, so its credits line is printed. Default 5000. */
  kiroGraceMs?: number;
}

export type MindKind = 'scripted' | 'ai';
export const MIND_KINDS: readonly MindKind[] = ['scripted', 'ai'];

export interface RunArgs {
  ghost: GhostId;
  mission: string;
  url: string;
  out?: string;
  site?: string;
  siteName?: string;
  seed?: number;
  headed: boolean;
  config?: string;
  missions?: string;
  /** `scripted` when absent. */
  mind?: MindKind;
}

export type ParsedArgs =
  | { kind: 'help' }
  | { kind: 'run'; args: RunArgs }
  | { kind: 'invalid'; problems: string[] };

const OPTIONS = {
  ghost: { type: 'string' },
  mission: { type: 'string' },
  url: { type: 'string' },
  out: { type: 'string' },
  site: { type: 'string' },
  'site-name': { type: 'string' },
  seed: { type: 'string' },
  headed: { type: 'boolean' },
  config: { type: 'string' },
  missions: { type: 'string' },
  mind: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
} as const;

const SITE_KEY = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ENGINE_ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const DEFAULT_MISSIONS_DIR = path.join(ENGINE_ROOT, 'missions');

/**
 * Reads the command line (without `node` and the script name).
 * `--help`, `-h` and an empty command line give `help`. Anything missing, unknown or invalid
 * gives `invalid` with one sentence per problem, each naming the allowed values where there are any.
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  if (argv.length === 0 || argv.includes('--help') || argv.includes('-h')) return { kind: 'help' };

  let values: ReturnType<typeof nodeParseArgs<{ options: typeof OPTIONS; allowPositionals: true }>>;
  try {
    values = nodeParseArgs({ args: [...argv], options: OPTIONS, allowPositionals: true, strict: true });
  } catch (error) {
    return { kind: 'invalid', problems: [error instanceof Error ? error.message : String(error)] };
  }

  const { values: opts, positionals } = values;
  const problems: string[] = [];

  if (positionals.length === 0) {
    problems.push('The command is missing. The only command is "run".');
  } else if (positionals[0] !== 'run') {
    problems.push(`Unknown command "${positionals[0]}". The only command is "run".`);
  } else if (positionals.length > 1) {
    problems.push(`Unexpected extra argument "${positionals[1]}".`);
  }

  const ghost = opts.ghost;
  if (ghost === undefined || ghost === '') {
    problems.push(`--ghost is missing. Allowed values: ${GHOST_IDS.join(', ')}.`);
  } else if (!(GHOST_IDS as readonly string[]).includes(ghost)) {
    problems.push(`Unknown ghost "${ghost}". Allowed values: ${GHOST_IDS.join(', ')}.`);
  }

  const mind = opts.mind;
  if (mind !== undefined && !(MIND_KINDS as readonly string[]).includes(mind)) {
    problems.push(`Unknown mind "${mind}". Allowed values: ${MIND_KINDS.join(', ')}.`);
  } else if (mind === 'ai' && ghost !== undefined && ghost !== '' && ghost !== 'listener' && (GHOST_IDS as readonly string[]).includes(ghost)) {
    problems.push('The AI mind supports only the listener ghost.');
  }

  if (opts.mission === undefined || opts.mission === '') problems.push('--mission is missing. Give a mission id, for example pay-bill.');
  if (opts.url === undefined || opts.url === '') problems.push('--url is missing. Give the address of the page to open, for example http://localhost:3000.');

  for (const name of ['out', 'site', 'config', 'missions'] as const) {
    if (opts[name] === '') problems.push(`--${name} must not be empty.`);
  }

  if (opts['site-name'] !== undefined && opts['site-name'].trim() === '') problems.push('--site-name must not be empty.');

  let seed: number | undefined;
  if (opts.seed !== undefined) {
    const parsed = Number(opts.seed);
    if (!/^-?\d+$/.test(opts.seed) || !Number.isSafeInteger(parsed)) {
      problems.push(`--seed must be a whole number, got "${opts.seed}". Example: --seed 42.`);
    } else {
      seed = parsed;
    }
  }

  if (problems.length > 0) return { kind: 'invalid', problems };

  const args: RunArgs = {
    ghost: ghost as GhostId,
    mission: opts.mission as string,
    url: opts.url as string,
    headed: opts.headed === true,
  };
  // Only set when given, so a command line without --mind parses exactly as it did before. Absent means scripted.
  if (mind !== undefined) args.mind = mind as MindKind;
  if (opts.out !== undefined) args.out = opts.out;
  if (opts.site !== undefined) args.site = opts.site;
  if (opts['site-name'] !== undefined) args.siteName = opts['site-name'];
  if (opts.config !== undefined) args.config = opts.config;
  if (opts.missions !== undefined) args.missions = opts.missions;
  if (seed !== undefined) args.seed = seed;
  return { kind: 'run', args };
}

/** Clones the mission with every `{{futureExpiry}}` in an Intention value replaced. The Mind gets this copy. */
export function expandMission(mission: Mission, startedAt: Date): Mission {
  return {
    ...mission,
    intentions: mission.intentions.map(
      (intention): Intention =>
        intention.value === undefined
          ? intention
          : ({ ...intention, value: applyTemplates(intention.value, startedAt) } as Intention),
    ),
  };
}

/** True when `child` is `parent` or a folder inside it. */
function isInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (relative.split(path.sep)[0] !== '..' && !path.isAbsolute(relative));
}

/** Resolves symbolic links in the part of `p` that exists, so a link into `runs/` is seen for what it is. */
function resolveReal(p: string): string {
  const full = path.resolve(p);
  const rest: string[] = [];
  let current = full;
  for (;;) {
    try {
      return path.join(realpathSync.native(current), ...rest.reverse());
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return full;
      rest.push(path.basename(current));
      current = parent;
    }
  }
}

function listMissionIds(dir: string): string[] {
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.slice(0, -'.json'.length))
      .sort();
  } catch {
    return [];
  }
}

function floorToSeconds(date: Date): Date {
  return new Date(Math.floor(date.getTime() / 1000) * 1000);
}

function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.pathname : '/';
  } catch {
    return '/';
  }
}

function defaultOnInterrupt(handler: () => void): () => void {
  let count = 0;
  const listener = (): void => {
    count += 1;
    if (count > 1) process.exit(EXIT.interrupted); // a second Ctrl+C means "now"
    handler();
  };
  process.on('SIGINT', listener);
  return () => void process.off('SIGINT', listener);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * The `haunt` command. Returns the exit code; the caller sets `process.exitCode`.
 *
 * Checks run in this order, all before Playwright is imported: arguments, config, mission, site key,
 * address, Out_Root test guard, ghost registration, and last the Chromium installation.
 * A failing check prints what is wrong and returns without opening a browser.
 */
export async function main(argv: string[], deps: CliDeps = {}): Promise<number> {
  const out = deps.stdout ?? ((text: string) => void process.stdout.write(text));
  const err = deps.stderr ?? ((text: string) => void process.stderr.write(text));
  const cwd = deps.cwd ?? process.cwd();
  const env = deps.env ?? process.env;
  const launcher = deps.launcher ?? defaultLauncher;
  const say = (line: string): void => err(`${line}\n`);

  // 1. Arguments.
  const parsed = parseArgs(argv);
  if (parsed.kind === 'help') {
    out(USAGE);
    return EXIT.ok;
  }
  if (parsed.kind === 'invalid') {
    say('The command line is not right:');
    for (const problem of parsed.problems) say(`  - ${problem}`);
    say('');
    say('Run "npx haunt --help" to see the usage.');
    return EXIT.usage;
  }
  const { args } = parsed;

  // 2. Config.
  let config;
  try {
    config = loadConfig(args.config === undefined ? undefined : path.resolve(cwd, args.config));
  } catch (error) {
    say(error instanceof ConfigError ? error.message : `The config file could not be used: ${messageOf(error)}`);
    return EXIT.usage;
  }

  // 3. Mission.
  const missionsDir = args.missions === undefined ? DEFAULT_MISSIONS_DIR : path.resolve(cwd, args.missions);
  let mission: Mission;
  try {
    mission = loadMission(missionsDir, args.mission);
  } catch (error) {
    say(error instanceof MissionLoadError ? error.message : `The mission could not be loaded: ${messageOf(error)}`);
    const ids = listMissionIds(missionsDir);
    say(ids.length > 0 ? `Available missions in ${missionsDir}: ${ids.join(', ')}` : `No missions found in ${missionsDir}.`);
    return EXIT.usage;
  }

  // 4. Site key.
  const siteKey = args.site ?? mission.site;
  const siteKeys = Object.keys(config.sites);
  if (!SITE_KEY.test(siteKey)) {
    say(`The site key "${siteKey}" is not valid: use lowercase letters, digits and single hyphens. Sites in the config: ${siteKeys.join(', ')}`);
    return EXIT.usage;
  }
  const site = Object.hasOwn(config.sites, siteKey) ? config.sites[siteKey] : undefined;
  if (!site) {
    say(`The site key "${siteKey}" is not listed in the config's sites. Allowed values: ${siteKeys.join(', ')}`);
    return EXIT.usage;
  }

  // 5. Address.
  if (!isAllowedAddress(args.url, config)) {
    say(refusalMessage(args.url));
    return EXIT.usage;
  }

  // 6. Out_Root, and the guard that keeps tests out of the repository's runs/ folder.
  const repoRoot = deps.repoRoot ?? findRepositoryRoot() ?? path.resolve(ENGINE_ROOT, '..');
  const outRoot = args.out === undefined ? path.join(repoRoot, 'runs') : path.resolve(cwd, args.out);
  if (env.HAUNT_UNDER_TEST === '1' && isInside(resolveReal(outRoot), resolveReal(path.join(repoRoot, 'runs')))) {
    say(`Refused to write into ${outRoot}: the test runner must not write into the repository's runs/ folder. Pass --out with a folder such as engine/test-output.`);
    return EXIT.usage;
  }

  // 7. The ghost must exist.
  const ghost = (deps.getGhost ?? getGhost)(args.ghost);
  if (!ghost) {
    say(`The ghost "${args.ghost}" is not implemented yet, so it cannot run. Implemented ghosts are registered in engine/src/ghosts/registry.ts.`);
    return EXIT.usage;
  }

  // 7b. The Kiro CLI, for the AI mind. Not finding it is a usage problem, and no browser has started.
  let kiro: AiRunContext | undefined;
  if (args.mind === 'ai') {
    const found = resolveKiroCli(env, deps.kiroExists ?? existsSync);
    if (!found.ok) {
      for (const line of found.help.split('\n')) say(line);
      return EXIT.usage;
    }
    kiro = {
      command: found.path,
      launcher: deps.kiroLauncher ?? defaultKiroLauncher,
      env,
      timeoutMs: parseTimeoutMs(env.HAUNT_AI_TIMEOUT_MS),
      graceMs: deps.kiroGraceMs ?? 5000,
    };
  }

  // 8. Chromium.
  if (!(await launcher.isInstalled())) {
    say('Chromium for Playwright is not installed. Install it with:');
    say('  npx playwright install chromium');
    return EXIT.failed;
  }

  // From here on a browser may open.
  const context: RunContext = {
    args,
    config,
    mission,
    siteKey,
    site,
    ghost,
    outRoot,
    launcher,
    out,
    say,
    initScripts: deps.initScripts ?? pageInitScripts,
    now: deps.now ?? (() => new Date()),
    getCommit: deps.getCommit ?? (() => getShortCommit({ warn: say })),
    repoRoot,
    ...(kiro ? { kiro } : {}),
  };
  return runWithInterrupt(context, deps.onInterrupt ?? defaultOnInterrupt);
}

interface RunContext {
  args: RunArgs;
  config: ReturnType<typeof loadConfig>;
  mission: Mission;
  siteKey: string;
  site: ReturnType<typeof loadConfig>['sites'][string];
  ghost: AnyGhost;
  outRoot: string;
  launcher: BrowserLauncher;
  out: (text: string) => void;
  say: (line: string) => void;
  initScripts: readonly string[];
  now: () => Date;
  getCommit: () => Promise<string>;
  repoRoot: string;
  /** Set when `--mind ai` is on. */
  kiro?: AiRunContext;
}

/** What the AI run path needs from the outside world. */
interface AiRunContext {
  command: string;
  launcher: KiroLauncher;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
  graceMs: number;
}

/** Runs the ghost and handles Ctrl+C: the browser is closed, nothing is written, the exit code is 130. */
async function runWithInterrupt(ctx: RunContext, onInterrupt: (handler: () => void) => () => void): Promise<number> {
  const state: RunState = { interrupted: false, committing: false, browser: undefined, stopAi: undefined };
  let wake: () => void = () => undefined;
  const interruption = new Promise<'interrupted'>((resolve) => {
    wake = () => resolve('interrupted');
  });
  const stopListening = onInterrupt(() => {
    state.interrupted = true;
    if (!state.committing) wake();
  });

  try {
    const work = doRun(ctx, state);
    work.catch(() => undefined); // if Ctrl+C wins the race, a later failure of the abandoned work is expected
    const winner = await Promise.race([work, interruption]);
    if (winner === 'interrupted') {
      ctx.say('Interrupted. The browser was closed and nothing was written.');
      return EXIT.interrupted;
    }
    return winner;
  } catch (error) {
    ctx.say(`The engine stopped before the run was saved: ${messageOf(error)}`);
    return EXIT.failed;
  } finally {
    stopListening();
    await state.stopAi?.().catch(() => undefined);
    await state.browser?.close().catch(() => undefined);
  }
}

interface RunState {
  interrupted: boolean;
  committing: boolean;
  browser: Browser | undefined;
  /** Kills the Kiro child and closes the Bridge. Set while an AI run is going. */
  stopAi: (() => Promise<void>) | undefined;
}

/**
 * The AI run: the driver owns the Body, the Bridge lets haunt-mcp reach it, and Kiro is the child that
 * calls the tools. The run ends when the driver's pipeline ends it, when Kiro exits, or on timeout.
 * Afterwards the child is killed and the Bridge closed, and the caller goes on into finalize.
 */
async function runAiMind(
  ctx: RunContext,
  state: RunState,
  driver: AiRunDriver,
  kiro: AiRunContext,
): Promise<RunLoopOutcome> {
  await driver.start();
  if (driver.outcome) return driver.outcome; // the page could not be opened; nothing to hand to Kiro

  const bridge = await startBridge(driver);
  const child = kiro.launcher({
    command: kiro.command,
    args: buildKiroArgs(ctx.mission.goal),
    env: {
      ...Object.fromEntries(Object.entries(kiro.env).filter((entry): entry is [string, string] => typeof entry[1] === 'string')),
      HAUNT_BRIDGE_URL: bridge.url,
      HAUNT_BRIDGE_TOKEN: bridge.token,
    },
    cwd: ctx.repoRoot,
  });
  let exitedWith: { code: number | null; output: string } | undefined;
  void child.exited.then((exit) => {
    exitedWith = exit;
  });
  const stop = async (): Promise<void> => {
    child.kill();
    await bridge.close();
  };
  state.stopAi = stop;

  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), kiro.timeoutMs);
  });
  try {
    const first = await Promise.race([
      driver.ended.then(() => 'ended' as const),
      child.exited.then((exit) => exit),
      timeout,
    ]);
    if (first === 'timeout') await driver.endExternally({ kind: 'timeout', ms: kiro.timeoutMs });
    else if (first !== 'ended') await driver.endExternally({ kind: 'exit', code: first.code });

    // The run is over. Give Kiro a moment to finish by itself, so it can print its credits line.
    if (!exitedWith && !state.interrupted) {
      let grace: NodeJS.Timeout | undefined;
      await Promise.race([
        child.exited,
        new Promise<void>((resolve) => {
          grace = setTimeout(resolve, kiro.graceMs);
        }),
      ]);
      clearTimeout(grace);
    }
  } finally {
    clearTimeout(timer);
    await stop();
    state.stopAi = undefined;
  }

  if (!state.interrupted) {
    const output = exitedWith ? exitedWith.output : (await Promise.race([child.exited, new Promise<null>((r) => setTimeout(() => r(null), 500))]))?.output ?? '';
    ctx.say(creditsLine(parseCredits(output)));
  }
  return driver.outcome ?? { result: 'error', errorMessage: 'The AI run ended without an outcome.' };
}

async function doRun(ctx: RunContext, state: RunState): Promise<number> {
  const { args, config, mission, siteKey, site, ghost, outRoot, say } = ctx;
  const { profile } = ghost;

  const startedAt = floorToSeconds(ctx.now());
  const runId = makeRunId(startedAt, ghost.id, mission.id, folderExistsIn(path.join(outRoot, siteKey)));
  const commit = await ctx.getCommit();

  const seed = args.seed ?? randomInt(0, 2 ** 31);
  if (args.seed === undefined) say(`Seed: ${seed} (random; pass --seed ${seed} to repeat the timing)`);
  const rng = mulberry32(seed);

  say(`Sending ${ghost.id} on mission ${mission.id} to ${args.url} (site ${siteKey}).`);
  say(`Run id: ${runId}`);

  try {
    state.browser = await ctx.launcher.launch({ headless: !args.headed });
  } catch (error) {
    const message = messageOf(error);
    say(`The browser could not be started: ${message.split(/\r?\n/)[0] ?? message}`);
    if (/executable doesn't exist|playwright install/i.test(message)) {
      say('Install Chromium with:');
      say('  npx playwright install chromium');
    }
    return EXIT.failed;
  }
  const browser = state.browser;
  if (state.interrupted) return EXIT.interrupted;

  const context = await browser.newContext({
    ...GUARDED_CONTEXT_OPTIONS,
    viewport: { width: profile.width, height: profile.height },
    deviceScaleFactor: profile.deviceScaleFactor,
    locale: profile.locale,
    isMobile: profile.isMobile,
    hasTouch: profile.hasTouch,
    ...(profile.userAgent === undefined ? {} : { userAgent: profile.userAgent }),
    ...(profile.extraHTTPHeaders === undefined ? {} : { extraHTTPHeaders: profile.extraHTTPHeaders }),
  });
  await installGuard(context, config, (message) => say(message));

  const page = await context.newPage();
  for (const script of ctx.initScripts) await page.addInitScript(script);

  const cdp = await context.newCDPSession(page);
  await applyThrottling(cdp, profile);
  await applyAcceptLanguage(cdp, profile);

  // The Mind gets a copy of the mission with the template values filled in; the run file keeps the original text.
  const mindMission = expandMission(mission, startedAt);
  const body = ghost.createBody(page, cdp, { rng, site, profile });
  const mind = ghost.createMind(mindMission, { rng });

  const recorder = new Recorder({ width: profile.width, height: profile.height, deviceScaleFactor: profile.deviceScaleFactor });
  const detectors = new DetectorRunner({ detectors: ghost.detectors(), page, cdp, config, site, recorder });

  const loopRecorder: RunLoopRecorder = {
    add(result, thought, probe, intention) {
      const recorded = recorder.add(result, thought, probe, intention);
      say(`Step ${recorded.step.n}: ${recorded.step.action}`);
      return recorded;
    },
    appendToLastThought: (text) => recorder.appendToLastThought(text),
    get steps() {
      return recorder.steps;
    },
    get last() {
      return recorder.last;
    },
  };

  const checkSuccess = async (): Promise<boolean> => {
    try {
      const target = page.locator(mission.successCheck.visible).first();
      if (ghost.id !== 'listener') {
        // The visual ghosts have just Settled, so the check does not wait. A 300 ms wait here would
        // delay their next Sight, and The Phantom's timing depends on taking it right after Settle.
        return await target.isVisible();
      }
      await target.waitFor({ state: 'visible', timeout: 300 });
      return true;
    } catch {
      return false;
    }
  };
  const onOpenFailure = async (): Promise<ActionResult | null> => {
    // Chromium shows an error page when it cannot load the address; keep a picture of it as Step 1.
    const screenshot = await page.screenshot({ type: 'png' });
    const now = Date.now();
    const where = pathOf(page.url());
    return {
      actionText: `Open ${args.url}`,
      spoken: '',
      focusBox: null,
      screenshot,
      trace: {
        pathBefore: where,
        pathAfter: where,
        keys: [],
        touchedKeys: [],
        actionEndedAt: now,
        readyAt: now,
        waits: [],
        announcements: [],
      },
    };
  };

  let outcome: RunLoopOutcome;
  if (ctx.kiro) {
    // Only the Listener has an AI mind (checked in parseArgs). The driver replaces the loop, not the pipeline.
    const driver = new AiRunDriver({
      body: body as unknown as Body<Heard, ListenerAction>,
      url: args.url,
      mission: mindMission,
      detectors,
      recorder: loopRecorder,
      stopRule: (runState) => ghost.stopRule(runState),
      checkSuccess,
      onOpenFailure,
    });
    outcome = await runAiMind(ctx, state, driver, ctx.kiro);
  } else {
    outcome = await runLoop({
      body,
      mind,
      stopRule: (runState) => ghost.stopRule(runState),
      detectors,
      recorder: loopRecorder,
      mission: mindMission,
      url: args.url,
      checkSuccess,
      onOpenFailure,
    });
  }

  if (state.interrupted) return EXIT.interrupted;

  if (recorder.steps.length === 0) {
    say(`The page could not be opened and no Step was recorded, so nothing was written: ${outcome.errorMessage ?? 'unknown error'}`);
    return EXIT.failed;
  }

  const finalized = finalizeRun({
    runId,
    ghost: ghost.id,
    mission,
    site: { name: args.siteName ?? site.name },
    url: args.url,
    commit,
    startedAt,
    result: outcome.result,
    recorder,
    findings: detectors.findings,
    screenshotSize: {
      width: Math.round(profile.width * profile.deviceScaleFactor),
      height: Math.round(profile.height * profile.deviceScaleFactor),
    },
  });

  if (finalized.problems.length > 0) {
    say('The run is not valid, so nothing was written:');
    for (const problem of finalized.problems) say(`  ${formatProblem(problem)}`);
    return EXIT.failed;
  }

  // Past this point the write is atomic and is allowed to finish, even if Ctrl+C arrives.
  if (state.interrupted) return EXIT.interrupted;
  state.committing = true;

  let runJsonPath: string;
  try {
    ({ runJsonPath } = await writeRunFolder({ outRoot, siteKey, result: finalized }));
  } catch (error) {
    say(`The run could not be saved: ${messageOf(error)}`);
    return EXIT.failed;
  }

  const count = detectors.findings.length;
  say(`Result: ${outcome.result}. ${count} ${count === 1 ? 'finding' : 'findings'}.`);
  for (const finding of detectors.findings) say(`  Step ${finding.stepN}, ${finding.type}: ${finding.title}`);
  if (outcome.result === 'error') say(`The run ended with an error: ${outcome.errorMessage ?? 'unknown error'}`);

  ctx.out(`${runJsonPath}\n`);
  return outcome.result === 'error' ? EXIT.resultError : EXIT.ok;
}
