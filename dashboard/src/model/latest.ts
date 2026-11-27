// Each ghost's latest run on each site (UI-17). Counts of findings and tombstones use only these,
// so a run that a newer run replaced is not counted twice.

import type { Run } from '../data/types';
import { GHOST_ORDER } from './ghosts';
import { newestRun } from './origin';

/**
 * For every site and every ghost: the newest real run, else the newest sample. A fixed copy is its
 * own site. Sites keep their first-seen order and ghosts follow the ghost order.
 */
export function latestRuns(runs: readonly Run[]): Run[] {
  const bySite = new Map<string, Run[]>();
  for (const run of runs) {
    const list = bySite.get(run.site.name) ?? [];
    list.push(run);
    bySite.set(run.site.name, list);
  }
  const out: Run[] = [];
  for (const siteRuns of bySite.values()) {
    for (const ghost of GHOST_ORDER) {
      const latest = newestRun(siteRuns, ghost);
      if (latest) out.push(latest);
    }
  }
  return out;
}
