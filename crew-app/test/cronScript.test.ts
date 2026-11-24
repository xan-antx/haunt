import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// The script cron shim is Python because Kiro Crew runs script crons as Python callables and refuses
// command crons on native Windows. These tests read the file as text; cronScript.run.test.ts runs it.
const root = path.resolve(import.meta.dirname, '..');
const text = readFileSync(path.join(root, 'cron', 'nightly_patrol.py'), 'utf8');
const manifest = JSON.parse(readFileSync(path.join(root, 'app.json'), 'utf8')) as { crons: { timeout: number }[] };

describe('cron/nightly_patrol.py', () => {
  it('imports only the Python standard library modules it needs, plus Crew\'s Report', () => {
    const imports = [...text.matchAll(/^(?:import|from)\s+([\w.]+)/gm)].map((m) => m[1]);
    expect(imports.sort()).toEqual(['datetime', 'os', 'pathlib', 'shutil', 'subprocess']);
    expect(text).toMatch(/^try:\n {4}from kiro_crew\.cron_script import Report\nexcept ImportError:/m);
  });

  it('starts only the TypeScript runner, with no shell, no model and no haunt-mcp', () => {
    expect(text).toContain('RUNNER = APP_ROOT / "src" / "patrol.ts"');
    expect(text).toContain('[node, str(RUNNER)]');
    expect(text).not.toMatch(/shell\s*=\s*True/);
    expect(text).not.toMatch(/os\.system|os\.popen/);
    expect(text).not.toContain('haunt-mcp');
    expect(text).not.toMatch(/\bnpm\b|\bnpx\b|collect-runs/);
  });

  it('takes the repository root from HAUNT_REPO_ROOT and passes it on to the runner', () => {
    expect(text).toContain('env.get("HAUNT_REPO_ROOT")');
    expect(text).toContain('child_env["HAUNT_REPO_ROOT"] = str(repo_root)');
  });

  it('stops the runner before the cron timeout, so the exit code is reported', () => {
    const limit = Number(/^RUNNER_TIMEOUT_SECONDS = (\d+)$/m.exec(text)?.[1]);
    expect(limit).toBeGreaterThan(720); // the runner's own deadlines total 720 s
    expect(limit).toBeLessThan(manifest.crons[0]!.timeout);
  });

  it('reports a non-zero patrol exit code as a failed run', () => {
    expect(text).toMatch(/if completed\.returncode != 0:[\s\S]{0,300}?fail\(/);
    expect(text).toMatch(/^def fail\(message\):[\s\S]*?raise RuntimeError\(message\)/m);
  });

  // Crew ignores a returned value; Report(text) is what records the run's result.
  it('hands the summary to Crew by raising Report', () => {
    expect(text).toMatch(/^def run\(ctx=None\):[\s\S]*?raise Report\(patrol\(os\.environ\)\)/m);
  });

  it('logs to data/logs/patrol.log inside the app folder', () => {
    expect(text).toContain('LOG_FILE = APP_ROOT / "data" / "logs" / "patrol.log"');
  });
});
