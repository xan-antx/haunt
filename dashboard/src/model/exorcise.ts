// Exorcise: compare a before run and an after run of the same mission and same ghost.
// Findings match by (type, page of the finding's step). Matching is a multiset.

import type { Finding, FindingType, Run } from '../data/types';
import { byStartedAtDesc } from './format';
import { isAfterTheFix } from './fixedCopy';
import { isRealWorldRun } from './realWorld';

export type ExorciseStatus = 'exorcised' | 'not_reached' | 'still_haunting' | 'new_haunting';

export interface ExorciseRow {
  status: ExorciseStatus;
  type: FindingType;
  page: string;
  before?: Finding;
  after?: Finding;
  key: string;
}

export type ExorciseResult = { rows: ExorciseRow[] } | { error: 'different_missions' | 'different_ghosts' };

/** Page of the finding's step, or "?" if the step is missing. */
export function findingPage(run: Run, finding: Finding): string {
  return run.steps.find((s) => s.n === finding.step)?.page ?? '?';
}

/** Other runs by the same ghost of the same mission, newest first. */
export function afterCandidates(before: Run, runs: Run[]): Run[] {
  return runs
    .filter((r) => r.key !== before.key && r.ghost === before.ghost && r.mission.id === before.mission.id)
    .sort(byStartedAtDesc);
}

/**
 * True when `after` is a fair "after" for `before` (UI-13): the same ghost, mission and mind, a later
 * run, on the same site or on its fixed copy, and neither run is a real-world run (Memos).
 */
export function isFairAfter(before: Run, after: Run): boolean {
  return (
    before.key !== after.key &&
    before.ghost === after.ghost &&
    before.mission.id === after.mission.id &&
    before.mind === after.mind &&
    !isRealWorldRun(before) &&
    !isRealWorldRun(after) &&
    Date.parse(after.startedAt) > Date.parse(before.startedAt) &&
    (after.site.name === before.site.name || isAfterTheFix(before, after))
  );
}

/** The runs the After picker offers for `before`, newest first. */
export function afterOptions(before: Run, runs: Run[]): Run[] {
  return runs.filter((r) => isFairAfter(before, r)).sort(byStartedAtDesc);
}

export function compareRuns(before: Run, after: Run): ExorciseResult {
  if (before.mission.id !== after.mission.id) return { error: 'different_missions' };
  if (before.ghost !== after.ghost) return { error: 'different_ghosts' };

  const afterPages = new Set(after.steps.map((s) => s.page));
  const unmatchedAfter = after.findings.map((finding, i) => ({ finding, i, page: findingPage(after, finding) }));
  const rows: ExorciseRow[] = [];

  before.findings.forEach((finding, i) => {
    const page = findingPage(before, finding);
    const matchAt = unmatchedAfter.findIndex((a) => a.finding.type === finding.type && a.page === page);
    if (matchAt >= 0) {
      const [match] = unmatchedAfter.splice(matchAt, 1);
      rows.push({ status: 'still_haunting', type: finding.type, page, before: finding, after: match!.finding, key: `b${i}-a${match!.i}` });
    } else {
      const reached = page !== '?' && afterPages.has(page);
      rows.push({ status: reached ? 'exorcised' : 'not_reached', type: finding.type, page, before: finding, key: `b${i}` });
    }
  });
  for (const a of unmatchedAfter) {
    rows.push({ status: 'new_haunting', type: a.finding.type, page: a.page, after: a.finding, key: `a${a.i}` });
  }
  return { rows };
}

export const EXORCISE_LABELS: Record<ExorciseStatus, string> = {
  exorcised: 'Exorcised',
  still_haunting: 'Still haunting',
  new_haunting: 'New haunting',
  not_reached: 'Not reached',
};
