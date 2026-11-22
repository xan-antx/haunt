import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { PROTECTED_FOLDERS, findProtectedPaths, runProtectionCheck, type GitResult } from '../src/protected.ts';
import { RUNS } from './helpers.ts';

function check(git: GitResult): { code: number; out: string; err: string } {
  let out = '';
  let err = '';
  const code = runProtectionCheck({ git: () => git, out: (t) => (out += t), err: (t) => (err += t) });
  return { code, out, err };
}

describe('Feature: haunt-patrol, Property 17: Protection check path matching', () => {
  const arbPath = fc.oneof(
    fc.constantFrom('engine/src/x.ts', '.\\dashboard\\a.ts', './demo-site/b', 'demo-site-exorcised/c', 'engine-notes/x.md', 'crew-app/engine/x.ts', 'README.md', 'demo-site-exorcised-copy/x'),
    fc.string({ minLength: 1 }).filter((s) => !s.includes('\n')),
  );

  it('flags exactly the paths whose first segment is a protected folder, in input order', () => {
    fc.assert(
      fc.property(fc.array(arbPath, { maxLength: 8 }), (paths) => {
        const expected = paths.filter((p) => {
          let n = p.replaceAll('\\', '/');
          if (n.startsWith('./')) n = n.slice(2);
          return (PROTECTED_FOLDERS as readonly string[]).includes(n.split('/')[0] ?? '');
        });
        expect(findProtectedPaths(paths)).toEqual(expected);
      }),
      RUNS,
    );
  });

  it('returns 0 exactly when git succeeds and nothing protected is listed', () => {
    fc.assert(
      fc.property(fc.array(arbPath, { maxLength: 6 }), (paths) => {
        const result = check({ ok: true, stdout: paths.join('\n') });
        const lines = paths.join('\n').split(/\r?\n/).filter((l) => l.trim() !== '');
        expect(result.code === 0).toBe(findProtectedPaths(lines).length === 0);
      }),
      RUNS,
    );
  });
});

describe('protection check with a fake git', () => {
  it('passes when git lists nothing', () => {
    expect(check({ ok: true, stdout: '' }).code).toBe(0);
  });

  it.each(PROTECTED_FOLDERS)('fails and prints a path under %s', (folder) => {
    const result = check({ ok: true, stdout: `README.md\n${folder}/src/file.ts\n` });
    expect(result.code).not.toBe(0);
    expect(result.err).toContain(`${folder}/src/file.ts`);
    expect(result.err).not.toContain('README.md');
  });

  it('fails and prints the error when git fails', () => {
    const result = check({ ok: false, error: 'not a git repository' });
    expect(result.code).not.toBe(0);
    expect(result.err).toContain('not a git repository');
  });

  it('does not flag look-alike folders', () => {
    expect(check({ ok: true, stdout: 'engine-notes/x.md\ncrew-app/engine/x.ts\n' }).code).toBe(0);
  });
});
