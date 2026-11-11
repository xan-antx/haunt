// Real runs and sample runs (Req 24). A real run comes from runs/ outside runs/samples/. Real runs
// always win: a sample is shown only for a ghost that has no real run yet, and any sample that is
// still shown carries the Sample_Label.

import type { GhostId, Run } from '../data/types';
import { byStartedAtDesc } from './format';

/** The visible label on every sample run the Dashboard shows. */
export const SAMPLE_LABEL = 'Sample run';

export function isSample(run: Run): boolean {
  return run.origin === 'samples';
}

/** Ghosts that have at least one real run. */
function ghostsWithRealRuns(runs: readonly Run[]): Set<GhostId> {
  return new Set(runs.filter((r) => !isSample(r)).map((r) => r.ghost));
}

export interface RunVisibility {
  /** Every real run, and the samples of ghosts that have no real run. Input order is kept. */
  shown: Run[];
  /** Samples of ghosts that have a real run. Only a link that names one opens it. */
  hidden: Run[];
}

/** Splits runs into the ones the Dashboard lists and the samples that real runs replace. */
export function splitRuns(runs: readonly Run[]): RunVisibility {
  const real = ghostsWithRealRuns(runs);
  const shown: Run[] = [];
  const hidden: Run[] = [];
  for (const run of runs) {
    if (isSample(run) && real.has(run.ghost)) hidden.push(run);
    else shown.push(run);
  }
  return { shown, hidden };
}

/** Real runs first, then samples; newest first within each. */
export function byRealThenNewest(a: Run, b: Run): number {
  return Number(isSample(a)) - Number(isSample(b)) || byStartedAtDesc(a, b);
}

/** The ghost's newest real run, or its newest sample when it has no real run. Null when it has no run. */
export function newestRun(runs: readonly Run[], ghost: GhostId): Run | null {
  return [...runs].filter((r) => r.ghost === ghost).sort(byRealThenNewest)[0] ?? null;
}
