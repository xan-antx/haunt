import { describe, expect, it } from 'vitest';
import { buildKiroArgs, creditsLine, defaultKiroLauncher, INSTALL_HELP, parseCredits, parseTimeoutMs, resolveKiroCli } from '../src/mind/ai/kiro.ts';

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
    const exe = 'C:\\Users\\Lenovo\\AppData\\Local\\Kiro-Cli\\kiro-cli.exe';
    const result = resolveKiroCli({ Path: 'C:\\Windows;C:\\Users\\Lenovo\\AppData\\Local\\Kiro-Cli' }, (p) => p === exe, 'win32');
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
