// Spec Coverage: one entry per mission.id with each ghost's most recent result.

import type { GhostId, Run } from '../data/types';
import { byStartedAtDesc } from './format';

export interface GhostCoverage {
  /** Most recent run of this mission by this ghost. */
  latest: Run | null;
  /** Most recent first. */
  runs: Run[];
}

export interface MissionCoverage {
  missionId: string;
  goal: string;
  /** Text from the most recent run. */
  requirement: string;
  requirementChanged: boolean;
  perGhost: Record<GhostId, GhostCoverage>;
}

/** Missions sorted by id. */
export function buildCoverage(runs: Run[]): MissionCoverage[] {
  const byMission = new Map<string, Run[]>();
  for (const run of runs) {
    const list = byMission.get(run.mission.id) ?? [];
    list.push(run);
    byMission.set(run.mission.id, list);
  }
  return [...byMission.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([missionId, missionRuns]) => {
      const sorted = [...missionRuns].sort(byStartedAtDesc);
      const latest = sorted[0]!;
      const forGhost = (ghost: GhostId): GhostCoverage => {
        const ghostRuns = sorted.filter((r) => r.ghost === ghost);
        return { latest: ghostRuns[0] ?? null, runs: ghostRuns };
      };
      return {
        missionId,
        goal: latest.mission.goal,
        requirement: latest.mission.requirement,
        requirementChanged: new Set(sorted.map((r) => r.mission.requirement)).size > 1,
        perGhost: { listener: forGhost('listener'), phantom: forGhost('phantom'), bebe: forGhost('bebe') },
      };
    });
}
