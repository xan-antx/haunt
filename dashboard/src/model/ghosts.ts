// Ghost metadata: names, descriptions and accent tokens from .kiro/steering/dashboard-design.md,
// plus the plain-words result copy used across screens.

import type { GhostId, RunResult } from '../data/types';

export interface GhostInfo {
  id: GhostId;
  name: string;
  description: string;
  /** CSS custom property holding the ghost's accent color. */
  accentToken: '--ghost-listener' | '--ghost-phantom' | '--ghost-bebe';
}

/** Always in this order: The Listener, The Phantom, Bebe. */
export const GHOST_ORDER: readonly GhostId[] = ['listener', 'phantom', 'bebe'];

export const GHOSTS: Record<GhostId, GhostInfo> = {
  listener: {
    id: 'listener',
    name: 'The Listener',
    description: 'Moves through the page by keyboard and listens to a screen reader.',
    accentToken: '--ghost-listener',
  },
  phantom: {
    id: 'phantom',
    name: 'The Phantom',
    description: 'Browses on slow 3G and an old phone.',
    accentToken: '--ghost-phantom',
  },
  bebe: {
    id: 'bebe',
    name: 'Bebe',
    description: 'Reads at 200% zoom, prefers Punjabi or Hindi, and watches out for tricky wording.',
    accentToken: '--ghost-bebe',
  },
};

export function ghostName(id: GhostId): string {
  return GHOSTS[id].name;
}

export function isGhostId(value: string | null | undefined): value is GhostId {
  return value === 'listener' || value === 'phantom' || value === 'bebe';
}

/** Short status label, used in badges and the coverage table. */
export const RESULT_LABELS: Record<RunResult, string> = {
  succeeded: 'Completed',
  gave_up: 'Gave up',
  error: 'Errored',
};

/** A sentence about how the run ended, for example "Bebe made it through". */
export function resultSentence(ghost: GhostId, result: RunResult): string {
  const name = ghostName(ghost);
  switch (result) {
    case 'succeeded':
      return `${name} made it through`;
    case 'gave_up':
      return `${name} gave up`;
    case 'error':
      return `${name} was stopped by a technical error`;
  }
}

export function gaveUpHere(ghost: GhostId): string {
  return `${ghostName(ghost)} gave up here.`;
}

export function stoppedHere(ghost: GhostId): string {
  return `${ghostName(ghost)} was stopped here by a technical error.`;
}
