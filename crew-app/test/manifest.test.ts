import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(readFileSync(path.join(root, 'app.json'), 'utf8')) as Record<string, any>;
const cron = manifest.crons[0] as Record<string, unknown>;

describe('manifest: documented fields', () => {
  it('declares name, version, displayName and permissions', () => {
    expect(manifest.name).toBe('haunt-patrol');
    expect(manifest.version).toBe('0.1.0');
    expect(manifest.displayName).toBe('Haunt Patrol');
    expect(manifest.permissions.network).toBe(false);
    expect(manifest.permissions.cron).toBe(true);
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

  it('has one cron entry at midnight', () => {
    expect(manifest.crons).toHaveLength(1);
    expect(cron.cron_expr).toBe('0 0 * * *');
  });
});

// UNVERIFIED (design risk 1): `command`, `timezone`, `strict_schedule`, `timeout` and `timeout_secs`
// come from the requirements, not from the Manifest reference. Re-check them against the Manifest
// reference or a `kirocrew app` install before changing an expected value here.
describe('manifest: unverified cron fields (design risk 1)', () => {
  it('is command-only', () => {
    expect(cron.command).toBe('node crew-app/src/patrol.ts');
    expect(cron).not.toHaveProperty('message');
    expect(cron).not.toHaveProperty('agent');
  });

  it('pins timezone, strict schedule and timeouts', () => {
    expect(cron.timezone).toBe('Asia/Kolkata');
    expect(cron.strict_schedule).toBe(true);
    expect(cron.timeout).toBe(900);
    expect(cron.timeout_secs as number).toBeGreaterThanOrEqual(905);
  });
});

// UNVERIFIED (design risks 2 to 5): the working directory of the cron command, an installed copy
// without the repository, Node backend support, and `permissions.network: false` with a backend.
// Re-check the backend and setup shapes against the Manifest reference or a `kirocrew app` install
// before changing an expected value here.
describe('manifest: unverified backend and setup shapes (design risks 2 to 5)', () => {
  it('declares a node backend with the documented route and health check', () => {
    expect(manifest.backend.type).toBe('node');
    expect(manifest.backend.entryPoint).toBe('src/backend/server.ts');
    expect(manifest.backend.healthCheck).toBe('/health');
    expect(manifest.backend.routes).toBe('/api/apps/haunt-patrol');
  });

  it('declares install and update commands that build the UI', () => {
    expect(manifest.setup.onInstall).toBe('npm install && npm run build');
    expect(manifest.setup.onUpdate).toBe('npm install && npm run build');
  });

  it('points the ui at the built bundle', () => {
    expect(manifest.ui.entry).toBe('dist/index.mjs');
    expect(manifest.ui.pages[0].route).toBe('/apps/haunt-patrol');
  });
});
