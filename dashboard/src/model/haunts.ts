// Haunts: all runs that share a site.name, plus the Home screen's "Start here" target.

import type { GhostId, Run } from '../data/types';
import { siteKey } from '../routes';
import { byStartedAtDesc } from './format';
import { GHOST_ORDER } from './ghosts';

export interface GhostSummary {
  ghost: GhostId;
  /** Most recent run first. */
  runs: Run[];
  latest: Run;
}

export interface Haunt {
  siteKey: string;
  siteName: string;
  /** Most recent run first. */
  runs: Run[];
  /** In ghost order: The Listener, The Phantom, Bebe. */
  ghosts: GhostSummary[];
  findingCount: number;
  latestStartedAt: string;
}

/** One Haunt per distinct site.name, most recently visited first. */
export function groupHaunts(runs: Run[]): Haunt[] {
  const bySite = new Map<string, Run[]>();
  for (const run of runs) {
    const list = bySite.get(run.site.name) ?? [];
    list.push(run);
    bySite.set(run.site.name, list);
  }
  const haunts: Haunt[] = [];
  for (const [siteName, siteRuns] of bySite) {
    const sorted = [...siteRuns].sort(byStartedAtDesc);
    const ghosts: GhostSummary[] = [];
    for (const ghost of GHOST_ORDER) {
      const ghostRuns = sorted.filter((r) => r.ghost === ghost);
      if (ghostRuns.length > 0) ghosts.push({ ghost, runs: ghostRuns, latest: ghostRuns[0]! });
    }
    haunts.push({
      siteKey: siteKey(siteName),
      siteName,
      runs: sorted,
      ghosts,
      findingCount: sorted.reduce((sum, r) => sum + r.findings.length, 0),
      latestStartedAt: sorted[0]!.startedAt,
    });
  }
  return haunts.sort((a, b) => Date.parse(b.latestStartedAt) - Date.parse(a.latestStartedAt));
}

/** At most `count` runs, newest first by startedAt. Does not mutate `runs`. */
export function recentRuns(runs: readonly Run[], count: number): Run[] {
  return [...runs].sort(byStartedAtDesc).slice(0, Math.max(0, count));
}

export interface StartHere {
  runKey: string;
  step: number;
}

/**
 * 1) the most recent Listener run with a focus_trap finding → that finding's step
 * 2) else the most recent Listener run with any finding → its first finding's step
 * 3) else null (the button is unavailable and a reason is shown)
 */
export function startHereTarget(runs: Run[]): StartHere | null {
  const listener = runs.filter((r) => r.ghost === 'listener').sort(byStartedAtDesc);
  for (const run of listener) {
    const trap = run.findings.find((f) => f.type === 'focus_trap');
    if (trap) return { runKey: run.key, step: trap.step };
  }
  for (const run of listener) {
    const first = [...run.findings].sort((a, b) => a.step - b.step)[0];
    if (first) return { runKey: run.key, step: first.step };
  }
  return null;
}

/** Why "Start here" is unavailable, in plain words. */
export function startHereUnavailableReason(runs: Run[]): string {
  return runs.some((r) => r.ghost === 'listener')
    ? "The Listener hasn't found a problem yet, so there is no moment to start from."
    : 'No Listener run has been recorded yet, so there is no moment to start from.';
}
