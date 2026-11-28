// Tombstones: one per finding across all runs, with optional site and ghost filters.

import type { Finding, Run } from '../data/types';
import { siteKey } from '../routes';
import { FINDING_LABELS, plainFindingType } from './findingLabels';
import { tellApart } from './findingWords';
import { byStartedAtDesc } from './format';
import { latestRuns } from './latest';
import { siteLabel } from './sites';

export interface TombstoneData {
  run: Run;
  finding: Finding;
  label: string;
  /**
   * What tells this stone from another with the same type, step and ghost, in words from the run
   * file (for example "The total is higher than the bill"). Null when no other stone looks the same.
   */
  detail: string | null;
}

export interface GraveyardFilter {
  /** A site key (slug of site.name). */
  site?: string;
  ghost?: string;
}

/** Lantern Bills first, then its fixed copy, then every other site by name (UI-23). */
function siteRank(run: Run): [number, string] {
  const name = siteLabel(run.site.name);
  if (name === 'Lantern Bills') return [0, name];
  if (name === 'Lantern Bills (fixed copy)') return [1, name];
  return [2, name];
}

/** One line for the stone: "Here lies a button with no name." */
export function epitaph(finding: Finding): string {
  return `Here lies ${FINDING_LABELS[finding.type].thing}.`;
}

/** A run's stones. Findings of one type at one step share a stone's words, so each gets its own detail. */
function withDetails(run: Run): TombstoneData[] {
  const groups = new Map<string, Finding[]>();
  for (const finding of run.findings) {
    const key = `${finding.type}|${finding.step}`;
    groups.set(key, [...(groups.get(key) ?? []), finding]);
  }
  const details = new Map<Finding, string | null>();
  for (const group of groups.values()) {
    tellApart(group).forEach((detail, i) => details.set(group[i]!, detail));
  }
  return run.findings.map((finding) => ({
    run,
    finding,
    label: plainFindingType(finding.type),
    detail: details.get(finding) ?? null,
  }));
}

/** By site (Lantern Bills first), then by step, then the newest run first. */
export function buildGraveyard(runs: Run[], filter: GraveyardFilter = {}): TombstoneData[] {
  // Only each ghost's latest run on each site, so a run a newer run replaced is not counted twice (UI-17).
  return latestRuns(runs)
    .filter((run) => !filter.site || siteKey(run.site.name) === filter.site)
    .filter((run) => !filter.ghost || run.ghost === filter.ghost)
    .flatMap((run) => withDetails(run))
    .sort((a, b) => {
      const [ar, an] = siteRank(a.run);
      const [br, bn] = siteRank(b.run);
      return ar - br || an.localeCompare(bn) || a.finding.step - b.finding.step || byStartedAtDesc(a.run, b.run);
    });
}
