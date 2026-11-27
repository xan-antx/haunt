// Spec Coverage: one row per site and mission, with each ghost's most recent result on that site.
// A fixed copy is its own site, so its results never count as the original site's (UI-03).

import type { GhostId, Run } from '../data/types';
import { originalSiteName } from './fixedCopy';
import { byStartedAtDesc } from './format';
import { byRealThenNewest } from './origin';
import { isRealWorldRun } from './realWorld';
import { repoFileUrl } from './repo';
import { displayGoal, missionWords, siteLabel } from './sites';

export interface GhostCoverage {
  /** Newest real run of this mission by this ghost on this site, else its newest sample. */
  latest: Run | null;
  /** Real runs first, then samples; newest first within each. */
  runs: Run[];
}

export interface MissionCoverage {
  /** The run files' `site.name`. */
  siteName: string;
  /** The site as readers see it: "Lantern Bills", "Lantern Bills (fixed copy)", "Memos". */
  site: string;
  missionId: string;
  goal: string;
  /** A plain title for the requirement, such as "Pay a bill with a valid card". */
  title: string;
  /** Text from the newest real run, else from the newest run: the EARS requirement. */
  requirement: string;
  requirementChanged: boolean;
  /** A link to the requirement's file on GitHub, or null when the mission has no known file. */
  requirementLink: string | null;
  perGhost: Record<GhostId, GhostCoverage>;
}

/** Sites in reading order: the sites Haunt built, each followed by its fixed copy, then real-world sites. */
function siteRank(siteName: string, runs: Run[]): [number, string, number] {
  const original = originalSiteName(siteName);
  const realWorld = runs.some((r) => r.site.name === siteName && isRealWorldRun(r));
  return [realWorld ? 1 : 0, original ?? siteName, original === null ? 0 : 1];
}

/** Rows by site, then mission id. */
export function buildCoverage(runs: Run[]): MissionCoverage[] {
  const groups = new Map<string, { siteName: string; missionId: string; runs: Run[] }>();
  for (const run of runs) {
    const key = `${run.site.name}\u0000${run.mission.id}`;
    const group = groups.get(key) ?? { siteName: run.site.name, missionId: run.mission.id, runs: [] };
    group.runs.push(run);
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort((a, b) => {
      const [ar, an, af] = siteRank(a.siteName, runs);
      const [br, bn, bf] = siteRank(b.siteName, runs);
      return ar - br || an.localeCompare(bn) || af - bf || a.missionId.localeCompare(b.missionId);
    })
    .map(({ siteName, missionId, runs: missionRuns }) => {
      const sorted = [...missionRuns].sort(byStartedAtDesc);
      // Real runs always win (Req 24.2): the text comes from the newest real run, if there is one.
      const latest = [...sorted].sort(byRealThenNewest)[0]!;
      const forGhost = (ghost: GhostId): GhostCoverage => {
        const ghostRuns = sorted.filter((r) => r.ghost === ghost).sort(byRealThenNewest);
        return { latest: ghostRuns[0] ?? null, runs: ghostRuns };
      };
      const words = missionWords(missionId);
      return {
        siteName,
        site: siteLabel(siteName),
        missionId,
        goal: displayGoal(latest.mission),
        title: words.title ?? displayGoal(latest.mission),
        requirement: latest.mission.requirement,
        requirementChanged: new Set(sorted.map((r) => r.mission.requirement)).size > 1,
        requirementLink: words.requirementFile ? repoFileUrl(words.requirementFile) : null,
        perGhost: { listener: forGhost('listener'), phantom: forGhost('phantom'), bebe: forGhost('bebe') },
      };
    });
}

export interface SiteCoverage {
  siteName: string;
  site: string;
  rows: MissionCoverage[];
}

/** The rows grouped by site, in the same order. */
export function groupCoverageBySite(rows: MissionCoverage[]): SiteCoverage[] {
  const out: SiteCoverage[] = [];
  for (const row of rows) {
    const last = out[out.length - 1];
    if (last && last.siteName === row.siteName) last.rows.push(row);
    else out.push({ siteName: row.siteName, site: row.site, rows: [row] });
  }
  return out;
}
