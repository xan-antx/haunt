import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const appRoot = path.resolve(import.meta.dirname, '..');
const configPath = path.join(appRoot, 'ui', 'vite.config.ts');
const bundlePath = path.join(appRoot, 'ui', 'dist', 'index.mjs');

type Config = {
  build: {
    emptyOutDir: unknown;
    outDir: string;
    lib: { fileName: () => string; formats: string[] };
    rollupOptions: { external: (string | RegExp)[] };
  };
};

const loadConfig = async (): Promise<Config> => (await import(pathToFileURL(configPath).href)).default as Config;

function isExternal(externals: (string | RegExp)[], id: string): boolean {
  return externals.some((e) => (typeof e === 'string' ? e === id : e.test(id)));
}

describe('ui/vite.config.ts', () => {
  it('keeps the static fallback: emptyOutDir is exactly false and only dist/index.mjs is written', async () => {
    const config = await loadConfig();
    expect(config.build.emptyOutDir).toBe(false);
    expect(config.build.outDir).toBe('dist');
    expect(config.build.lib.fileName()).toBe('index.mjs');
    expect(config.build.lib.formats).toEqual(['es']);
  });

  // build-first-app: React, ReactDOM, lucide-react and @kirocrew/app-sdk are provided by the dashboard.
  it('keeps every host-provided package external, including @kirocrew/app-sdk subpaths', async () => {
    const { external } = (await loadConfig()).build.rollupOptions;
    for (const id of ['react', 'react-dom', 'react/jsx-runtime', 'lucide-react', '@kirocrew/app-sdk', '@kirocrew/app-sdk/ui']) {
      expect(isExternal(external, id), id).toBe(true);
    }
    expect(isExternal(external, './model.ts')).toBe(false);
  });
});

describe('ui/dist/index.mjs (committed build artifact)', () => {
  const bundle = existsSync(bundlePath) ? readFileSync(bundlePath, 'utf8') : '';

  it('exists, because a Crew install copies the app and builds nothing', () => {
    expect(existsSync(bundlePath)).toBe(true);
  });

  it('imports only host-provided packages and bundles no copy of React', async () => {
    const { external } = (await loadConfig()).build.rollupOptions;
    const specifiers = [...bundle.matchAll(/^import\s[^;]*?from\s+"([^"]+)"/gm)].map((m) => m[1] as string);
    expect(specifiers).toContain('react');
    expect(specifiers).toContain('@kirocrew/app-sdk');
    for (const id of specifiers) expect(isExternal(external, id), id).toBe(true);
    expect(bundle).not.toMatch(/__SECRET_INTERNALS|__CLIENT_INTERNALS|react\.production/);
  });

  it('has a default export, the page component', () => {
    expect(bundle).toMatch(/export\s*\{[^}]*\bas default\b[^}]*\}|export default /);
  });

  it('is not ignored by git', () => {
    const result = spawnSync('git', ['check-ignore', '--no-index', '-q', 'crew-app/ui/dist/index.mjs'], {
      cwd: path.resolve(appRoot, '..'),
      shell: false,
      windowsHide: true,
    });
    expect(result.error).toBeUndefined();
    // git check-ignore exits 1 when the path is not ignored, 0 when it is.
    expect(result.status).toBe(1);
  });
});
