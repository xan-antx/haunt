export const GHOSTS = ['listener', 'phantom', 'bebe'] as const;
export type GhostId = (typeof GHOSTS)[number];

export const GHOST_NAMES: Record<GhostId, string> = {
  listener: 'The Listener',
  phantom: 'The Phantom',
  bebe: 'Bebe',
};

export const LANTERN_URL = 'http://localhost:3000';
export const MISSION = 'pay-bill';

export function buildHauntArgs(ghost: GhostId, seed: number, runsDir: string, cliPath: string): string[] {
  return [
    cliPath,
    'run',
    '--ghost',
    ghost,
    '--mission',
    MISSION,
    '--url',
    LANTERN_URL,
    '--out',
    runsDir,
    '--seed',
    String(seed),
  ];
}

export type GhostExit =
  | { kind: 'saved'; withError: boolean } // exit 0 or 3
  | { kind: 'no_run' } // exit 1, 2, or anything unexpected, including null
  | { kind: 'interrupted' }; // exit 130

export function interpretExit(code: number | null): GhostExit {
  if (code === 0) return { kind: 'saved', withError: false };
  if (code === 3) return { kind: 'saved', withError: true };
  if (code === 130) return { kind: 'interrupted' };
  return { kind: 'no_run' };
}
