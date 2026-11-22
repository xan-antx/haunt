import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROTECTED_FOLDERS } from '../src/protected.ts';
import { buildSiteCommands } from '../src/site.ts';

function outDirOf(args: string[]): string | undefined {
  return args[args.indexOf('--outDir') + 1];
}

const cases = [
  { label: 'Windows-style', api: path.win32, root: 'C:\\Users\\someone\\Projects\\haunt' },
  { label: 'POSIX-style', api: path.posix, root: '/home/someone/projects/haunt' },
  { label: 'this platform', api: path, root: path.resolve('/some/where/haunt') },
] as const;

describe('buildSiteCommands (design risk 9: a relative --outDir would write into demo-site/)', () => {
  it.each(cases)('uses an absolute build folder under crew-app/.patrol ($label)', ({ api, root }) => {
    const { buildDir, build, preview } = buildSiteCommands(root, api);
    const expected = api.resolve(root, 'crew-app', '.patrol', 'site-build');
    const outDir = outDirOf(build.args);

    expect(outDir).toBeDefined();
    expect(api.isAbsolute(outDir as string)).toBe(true);
    expect(outDir).toBe(expected);
    expect(buildDir).toBe(expected);
    expect(api.relative(api.join(root, 'crew-app', '.patrol'), outDir as string).startsWith('..')).toBe(false);
    expect(outDirOf(preview.args)).toBe(expected);
  });

  it.each(cases)('builds with demo-site/ as the working folder and never outputs into a protected folder ($label)', ({ api, root }) => {
    const { build, preview } = buildSiteCommands(root, api);
    expect(build.cwd).toBe(api.join(root, 'demo-site'));
    for (const command of [build, preview]) {
      const outDir = outDirOf(command.args) as string;
      for (const folder of PROTECTED_FOLDERS) {
        const rel = api.relative(api.join(root, folder), outDir);
        expect(rel === '' || !rel.startsWith('..')).toBe(false);
      }
    }
  });

  it('passes the documented Vite arguments', () => {
    const { build, preview } = buildSiteCommands(path.resolve('/r'));
    expect(build.args.slice(1, 4)).toEqual(['build', '--base', '/']);
    expect(build.args).toContain('--emptyOutDir');
    expect(preview.args).toEqual(expect.arrayContaining(['preview', '--host', 'localhost', '--port', '3000', '--strictPort']));
  });
});
