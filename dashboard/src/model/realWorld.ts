// Real-world runs: Haunt's visits to sites it did not build, such as Memos running on this computer.
// They are kept apart from the Lantern Bills results, so Home, the tour and the Ghost Cam link
// read only the sites that Haunt built. Imports only routes.ts and the data types.

import type { MindKind, Run } from '../data/types';
import { siteKey } from '../routes';

/** Site keys (see `siteKey`) of the real-world sites. */
const REAL_WORLD_SITES: ReadonlySet<string> = new Set(['memos']);

/** True when the run visited a real-world site. */
export function isRealWorldRun(run: Run): boolean {
  return REAL_WORLD_SITES.has(siteKey(run.site.name));
}

/** The real-world runs, in the order given. */
export function realWorldRuns(runs: readonly Run[]): Run[] {
  return runs.filter(isRealWorldRun);
}

/** The runs that are not real-world runs, in the order given. */
export function withoutRealWorld(runs: readonly Run[]): Run[] {
  return runs.filter((run) => !isRealWorldRun(run));
}

const MIND_ORDER: readonly MindKind[] = ['scripted', 'ai'];

/** The newest real-world run for each mind: the scripted mind first, then the AI mind. At most two runs. */
export function latestPerMind(runs: readonly Run[]): Run[] {
  const out: Run[] = [];
  for (const mind of MIND_ORDER) {
    let newest: Run | null = null;
    for (const run of realWorldRuns(runs)) {
      if (run.mind !== mind) continue;
      if (newest === null || Date.parse(run.startedAt) > Date.parse(newest.startedAt)) newest = run;
    }
    if (newest) out.push(newest);
  }
  return out;
}
