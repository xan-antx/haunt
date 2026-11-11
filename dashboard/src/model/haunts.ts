// Haunts: all runs that share a site.name, plus the Start_Here_Step.

import type { GhostId, Run } from '../data/types';
import { siteKey } from '../routes';
import { byStartedAtDesc } from './format';
import { GHOST_ORDER } from './ghosts';
import { newestRun } from './origin';
import { watchStep } from './results';

export interface GhostSummary {
  ghost: GhostId;
  /** Most recent run first. */
  runs: Run[];
  /** The newest real run, or the newest sample when the ghost has no real run here (Req 24.2). */
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
      const latest = newestRun(ghostRuns, ghost);
      if (latest) ghosts.push({ ghost, runs: ghostRuns, latest });
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
 * The ghost's newest real run (or newest sample when it has no real run) at its Watch_Step, or
 * null when the ghost has no run or that run has no steps (Req 24.4).
 */
export function ghostWatchTarget(runs: readonly Run[], ghost: GhostId): StartHere | null {
  const run = newestRun(runs, ghost);
  const step = run ? watchStep(run) : null;
  return run && step !== null ? { runKey: run.key, step } : null;
}

/**
 * The Start_Here_Step (Req 7.5, 7.6, revised by Req 24.4): The Listener's newest real run at the
 * step of its first Blocking_Finding (its keyboard trap), by way of the Watch_Step. Null when
 * there is no Listener run with steps; the Ghost Cam's destination then falls back as described
 * in `ghostCamTarget`. This is the Ghost Cam's Screen_Destination and the tour's Ghost Cam stop.
 */
export function startHereTarget(runs: Run[]): StartHere | null {
  return ghostWatchTarget(runs, 'listener');
}
