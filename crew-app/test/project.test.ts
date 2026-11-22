import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..');
const readJson = async (rel: string): Promise<Record<string, any>> => JSON.parse(await readFile(path.join(root, rel), 'utf8')) as Record<string, any>;

async function tsFiles(dir: string): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await tsFiles(full)));
    else if (entry.name.endsWith('.ts')) found.push(full);
  }
  return found;
}

describe('README', () => {
  it('states the skipped-night rule and the exit codes', async () => {
    const text = await readFile(path.join(root, 'README.md'), 'utf8');
    expect(text).toMatch(/skipped\. There is no catch-up run/);
    expect(text).toMatch(/off or asleep at midnight IST/);
    for (const code of ['| 0 |', '| 1 |', '| 2 |', '| 3 |', '| 4 |']) expect(text).toContain(code);
    expect(text).toContain("not the engine's exit code 3");
    expect(text).toContain('http://localhost:3001');
  });
});

describe('project configuration', () => {
  it('has the root tsconfig settings', async () => {
    const { compilerOptions, exclude } = await readJson('tsconfig.json');
    expect(compilerOptions.allowImportingTsExtensions).toBe(true);
    expect(compilerOptions.noEmit).toBe(true);
    expect(compilerOptions.strict).toBe(true);
    expect(exclude).toContain('ui');
  });

  it('has the UI tsconfig settings', async () => {
    const { compilerOptions } = await readJson('ui/tsconfig.json');
    expect(compilerOptions.jsx).toBe('react-jsx');
    expect(compilerOptions.lib).toContain('DOM');
    expect(compilerOptions.moduleResolution).toBe('bundler');
    expect(compilerOptions.strict).toBe(true);
  });

  it('is an ES module package that type-checks both configs', async () => {
    const pkg = await readJson('package.json');
    expect(pkg.type).toBe('module');
    expect(pkg.scripts.typecheck).toContain('tsc -p tsconfig.json');
    expect(pkg.scripts.typecheck).toContain('tsc -p ui/tsconfig.json');
    expect(pkg.engines.node).toBe('>=24');
    expect(pkg.scripts['check:protected']).toBe('node scripts/check-protected.ts');
  });

  it('writes every relative import in src and scripts with a .ts extension, and only erasable syntax', async () => {
    const files = [...(await tsFiles(path.join(root, 'src'))), ...(await tsFiles(path.join(root, 'scripts')))];
    expect(files.length).toBeGreaterThan(10);
    const specifier = /(?:from\s+|import\s*\(\s*|import\s+)['"](\.{1,2}\/[^'"]*)['"]/g;
    for (const file of files) {
      const text = await readFile(file, 'utf8');
      for (const match of text.matchAll(specifier)) {
        expect(match[1], `${file}: ${match[0]}`).toMatch(/\.ts$/);
      }
      expect(text, file).not.toMatch(/^\s*(export\s+)?(const\s+)?enum\s/m);
      expect(text, file).not.toMatch(/^\s*(export\s+)?(namespace|module)\s+\w+\s*\{/m);
      expect(text, file).not.toMatch(/constructor\s*\(\s*(private|public|protected|readonly)\s/);
    }
  });
});
