export const PROTECTED_FOLDERS = ['engine', 'dashboard', 'demo-site', 'demo-site-exorcised'] as const;

/** Pure. Returns the lines whose first path segment is a protected folder, in input order. */
export function findProtectedPaths(lines: readonly string[]): string[] {
  return lines.filter((line) => {
    let p = line.replaceAll('\\', '/');
    if (p.startsWith('./')) p = p.slice(2);
    const first = p.split('/')[0] ?? '';
    return (PROTECTED_FOLDERS as readonly string[]).includes(first);
  });
}

export type GitResult = { ok: true; stdout: string } | { ok: false; error: string };
export interface ProtectionDeps {
  git(args: string[]): GitResult;
  out(text: string): void;
  err(text: string): void;
}

/** Returns the process exit code: 0 when nothing protected changed, 1 otherwise. */
export function runProtectionCheck(deps: ProtectionDeps): number {
  const result = deps.git(['diff', '--name-only']);
  if (!result.ok) {
    deps.err(`The protection check could not run git: ${result.error}\n`);
    return 1;
  }
  const lines = result.stdout.split(/\r?\n/).filter((l) => l.trim() !== '');
  const protectedPaths = findProtectedPaths(lines);
  if (protectedPaths.length === 0) {
    deps.out('No protected folder has unstaged changes.\n');
    return 0;
  }
  deps.err('These files are in a protected folder and have changed:\n');
  for (const p of protectedPaths) deps.err(`${p}\n`);
  return 1;
}
