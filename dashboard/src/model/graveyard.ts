// Tombstones: one per finding across all runs, with optional site and ghost filters.

import type { Finding, Run } from '../data/types';
import { siteKey } from '../routes';
import { plainFindingType } from './findingLabels';
import { byStartedAtDesc } from './format';
import { latestRuns } from './latest';

export interface TombstoneData {
  run: Run;
  finding: Finding;
  label: string;
}

export interface GraveyardFilter {
  /** A site key (slug of site.name). */
  site?: string;
  ghost?: string;
}

/** Newest run first, then findings by step. */
export function buildGraveyard(runs: Run[], filter: GraveyardFilter = {}): TombstoneData[] {
  // Only each ghost's latest run on each site, so a run a newer run replaced is not counted twice (UI-17).
  return latestRuns(runs)
    .filter((run) => !filter.site || siteKey(run.site.name) === filter.site)
    .filter((run) => !filter.ghost || run.ghost === filter.ghost)
    .sort(byStartedAtDesc)
    .flatMap((run) =>
      [...run.findings]
        .sort((a, b) => a.step - b.step)
        .map((finding) => ({ run, finding, label: plainFindingType(finding.type) })),
    );
}
