import { describe, expect, it } from 'vitest';
import path from 'node:path';
import {
  buildKiroArgs,
  creditsLine,
  defaultKiroLauncher,
  formatKiroLaunch,
  INSTALL_HELP,
  kiroLogPath,
  MAX_RELAUNCHES,
  parseCredits,
  parseTimeoutMs,
  resolveKiroCli,
  sumCredits,
} from '../src/mind/ai/kiro.ts';

/**
 * Unit tests for the Kiro launcher helpers. No test starts the real Kiro CLI.
 * **Validates: Requirements 5.1, 5.3, 5.8, 5.9**
 */

describe('buildKiroArgs', () => {
  const goal = 'Pay the electricity bill';
  const args = buildKiroArgs(goal);

  it('names the agent, runs without prompts and trusts only the haunt-mcp tools', () => {
    expect(args.slice(0, 3)).toEqual(['chat', '--agent', 'listener']);
    expect(args).toContain('--no-interactive');
    expect(args).toContain('--trust-tools=@haunt-mcp');
    expect(args).not.toContain('--trust-all-tools');
  });

  it('ends with the goal as the prompt', () => {
    expect(args[args.length - 1]).toBe(goal);
  });
});

describe('parseCredits', () => {
  it('reads a credits line of the form Kiro prints', () => {
    expect(parseCredits('answer\n▸ Credits: 0.25 • Time: 12s\n')).toEqual({ known: true, credits: 0.25 });
    expect(parseCredits('credits used: 3')).toEqual({ known: true, credits: 3 });
  });

  it('says why when there is no credits line', () => {
    const report = parseCredits('[tool] Running: read_page\n[tool] status: Completed\nDone.');
    expect(report.known).toBe(false);
    expect(creditsLine(report)).toMatch(/^Kiro credits used: unknown \(.+\)$/);
  });

  it('formats a known amount', () => {
    expect(creditsLine({ known: true, credits: 0.25 })).toBe('Kiro credits used: 0.25');
  });
});

describe('sumCredits', () => {
  it('adds up the credits of every launch', () => {
    expect(sumCredits([{ known: true, credits: 0.1 }, { known: true, credits: 0.2 }])).toEqual({ known: true, credits: 0.3 });
  });

  it('keeps a single report as it is', () => {
    expect(sumCredits([{ known: false, reason: 'Kiro printed no credits line' }])).toEqual({ known: false, reason: 'Kiro printed no credits line' });
  });

  it('is unknown when a launch printed no credits, and names that launch and the known part', () => {
    const report = sumCredits([{ known: true, credits: 0.5 }, { known: false, reason: 'x' }, { known: true, credits: 0.25 }]);
    expect(report).toEqual({ known: false, reason: 'Kiro printed no credits line for launch 2 of 3; the other launches used 0.75' });
  });
});

describe('Kiro log', () => {
  it('puts the run id in the file name', () => {
    expect(kiroLogPath(path.join('engine', 'test-output', 'kiro-logs'), '2026-11-22T1127Z-listener-pay-bill')).toBe(
      path.join('engine', 'test-output', 'kiro-logs', '2026-11-22T1127Z-listener-pay-bill.log'),
    );
  });

  it('records the arguments, how the launch ended and the whole output, but not the environment', () => {
    const text = formatKiroLaunch({
      launch: 2,
      spec: { command: 'kiro-cli', args: ['chat', 'Continue the mission.'], env: { HAUNT_BRIDGE_TOKEN: 'secret-token' }, cwd: '/repo' },
      startedAt: new Date('2026-11-22T11:27:36.000Z'),
      endedAt: new Date('2026-11-22T11:27:40.500Z'),
      code: 0,
      ended: 'Kiro exited by itself',
      output: 'line one\nline two\n\n',
    });
    expect(text).toContain(`=== Launch 2 of up to ${MAX_RELAUNCHES + 1} ===`);
    expect(text).toContain('Arguments: ["chat","Continue the mission."]');
    expect(text).toContain('after 4.5 s, exit code 0 (Kiro exited by itself)');
    expect(text).toContain('--- output ---\nline one\nline two\n--- end of output ---');
    expect(text).not.toContain('secret-token');
  });
});

describe('install help', () => {
  it('mentions KIRO_CLI_PATH', () => {
    expect(INSTALL_HELP).toContain('KIRO_CLI_PATH');
    const missing = resolveKiroCli({ PATH: '/nowhere' }, () => false, 'linux');
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.help).toContain('KIRO_CLI_PATH');
  });
});

describe('resolveKiroCli and parseTimeoutMs', () => {
  it('finds kiro-cli.exe through the Path variable on Windows', () => {
    const exe = 'C:\\Users\\someone\\AppData\\Local\\Kiro-Cli\\kiro-cli.exe';
    const result = resolveKiroCli({ Path: 'C:\\Windows;C:\\Users\\someone\\AppData\\Local\\Kiro-Cli' }, (p) => p === exe, 'win32');
    expect(result).toEqual({ ok: true, path: exe });
  });

  it('uses 10 minutes unless the value is a positive integer', () => {
    expect(parseTimeoutMs(undefined)).toBe(600000);
    expect(parseTimeoutMs('1500')).toBe(1500);
    expect(parseTimeoutMs('0')).toBe(600000);
    expect(parseTimeoutMs('soon')).toBe(600000);
  });
});

describe('defaultKiroLauncher', () => {
  it('merges stdout and stderr into output and reports the exit code', async () => {
    const script = "process.stdout.write('out line\\n'); process.stderr.write('Credits: 1.5\\n'); process.exit(3)";
    const child = defaultKiroLauncher({ command: process.execPath, args: ['-e', script], env: { ...process.env } as Record<string, string>, cwd: process.cwd() });
    const { code, output } = await child.exited;
    expect(code).toBe(3);
    expect(output).toContain('out line');
    expect(parseCredits(output)).toEqual({ known: true, credits: 1.5 });
  });

  it('kill() ends a running process', async () => {
    const child = defaultKiroLauncher({
      command: process.execPath,
      args: ['-e', 'setInterval(() => {}, 1000)'],
      env: { ...process.env } as Record<string, string>,
      cwd: process.cwd(),
    });
    child.kill();
    const { code } = await child.exited;
    expect(code).not.toBe(0);
  });

  it('reports a command that cannot start as an exit with no code', async () => {
    const child = defaultKiroLauncher({ command: 'definitely-not-a-real-program-xyz', args: [], env: {}, cwd: process.cwd() });
    const { code, output } = await child.exited;
    expect(code).toBeNull();
    expect(output.length).toBeGreaterThan(0);
  });
});
