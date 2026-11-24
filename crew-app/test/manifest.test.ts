import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'app.json'), 'utf8')) as Record<string, any>;
const cron = manifest.crons[0] as Record<string, unknown>;

// Checked against the Kiro Crew docs on 2026-11-23: kiro.dev/docs/crew/apps (overview, manifest,
// build-first-app, publishing) and docs/app-kit/manifest-reference.md, api-reference.md and
// publishing-guide.md plus docs/guides/windows-install.md in kirodotdev/KiroCrew.

describe('manifest: identity and permissions', () => {
  it('declares name, version, displayName and permissions', () => {
    expect(manifest.name).toBe('haunt-patrol');
    expect(manifest.version).toBe('0.1.0');
    expect(manifest.displayName).toBe('Haunt Patrol');
    expect(manifest.permissions.network).toBe(false);
    expect(manifest.permissions.cron).toBe(true);
  });

  it('declares the backend proxy path in permissions.api, because useAppApi refuses undeclared paths', () => {
    expect(manifest.permissions.api).toEqual(['/apps/haunt-patrol/api']);
  });

  it('claims Windows support explicitly, because the platform.os default leaves Windows out', () => {
    expect(manifest.platform.os).toEqual(['macos', 'linux', 'windows']);
  });

  it('has the agents, skills and ui folders', () => {
    for (const dir of ['agents', 'skills', 'ui']) expect(existsSync(path.join(root, dir))).toBe(true);
  });

  it('has an agent with no tools that the cron entry never mentions', () => {
    const agent = JSON.parse(readFileSync(path.join(root, 'agents', 'patrol-guide.json'), 'utf8')) as Record<string, unknown>;
    expect(agent.tools).toEqual([]);
    expect(JSON.stringify(cron)).not.toContain(String(agent.name));
    expect(cron).not.toHaveProperty('agent');
  });
});

describe('manifest: the nightly cron', () => {
  it('has one cron entry at midnight IST that fires on time', () => {
    expect(manifest.crons).toHaveLength(1);
    expect(cron.name).toBe('nightly-patrol');
    expect(cron.cron_expr).toBe('0 0 * * *');
    expect(cron.timezone).toBe('Asia/Kolkata');
    expect(cron.strict_schedule).toBe(true);
  });

  // Command crons are refused on native Windows, so the job is a model-free script cron.
  it('is a script cron with no model call: script set, no command, message or agent', () => {
    expect(cron.script).toBe('cron/nightly_patrol.py:run');
    expect(cron).not.toHaveProperty('command');
    expect(cron).not.toHaveProperty('message');
    expect(cron).not.toHaveProperty('agent');
    expect(cron).not.toHaveProperty('agent_sequence');
  });

  it('points the script at a .py file inside the app that defines the callable', () => {
    const [file, callable] = String(cron.script).split(':') as [string, string];
    const full = path.resolve(root, file);
    expect(path.relative(root, full).startsWith('..')).toBe(false);
    expect(file.endsWith('.py')).toBe(true);
    expect(readFileSync(full, 'utf8')).toMatch(new RegExp(`^def ${callable}\\(`, 'm'));
  });

  it('gives the subprocess 900 s and the whole run at least 5 s more', () => {
    expect(cron.timeout).toBe(900);
    expect(cron.timeout_secs as number).toBeGreaterThanOrEqual((cron.timeout as number) + 5);
    expect(cron.timeout_secs as number).toBeLessThanOrEqual(86_400);
  });
});

describe('manifest: backend, ui and setup', () => {
  it('declares a node backend with the documented route and health check', () => {
    expect(manifest.backend.type).toBe('node');
    expect(manifest.backend.entryPoint).toBe('src/backend/server.ts');
    expect(manifest.backend.port).toBe('auto');
    expect(manifest.backend.healthCheck).toBe('/health');
    expect(manifest.backend.routes).toBe('/api/apps/haunt-patrol');
  });

  // setup.onInstall runs only on registry installs and through /bin/bash, which native Windows refuses;
  // setup.onUpdate is never executed. The committed ui/dist/index.mjs makes a build step unnecessary.
  it('declares no setup scripts', () => {
    expect(manifest).not.toHaveProperty('setup');
  });

  it('points the ui at the committed bundle, relative to ui/', () => {
    expect(manifest.ui.entry).toBe('dist/index.mjs');
    expect(existsSync(path.join(root, 'ui', manifest.ui.entry as string))).toBe(true);
    expect(manifest.ui.pages[0].route).toBe('/apps/haunt-patrol');
    expect(manifest.ui.pages[0].label).toBe('Haunt Patrol');
  });
});
