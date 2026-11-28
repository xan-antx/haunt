// Exorcise: compare a before run and an after run of the same mission and same ghost.
// Findings match by (type, page of the finding's step). Matching is a multiset.

import type { Finding, FindingType, Run } from '../data/types';
import { tellApart } from './findingWords';
import { byStartedAtDesc } from './format';
import { isAfterTheFix, isFixedCopyRun } from './fixedCopy';
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

/**
 * A default pair. When a fixed copy has runs, the newest of them is "after" and the newest run
 * of the original site by the same ghost and mission is "before". Otherwise the newest run that
 * has a same-ghost, same-mission partner on an original site is "after", and its newest such
 * partner is "before". The before run is never a fixed copy's run.
 * Null when no run has such a partner.
 */
export function defaultPair(runs: Run[]): { before: Run; after: Run } | null {
  const sorted = [...runs].sort(byStartedAtDesc);
  // The before run is always an earlier run by the same ghost and mind, never a fixed copy's run.
  const partner = (after: Run) => sorted.find((r) => !isFixedCopyRun(r) && isFairAfter(r, after));
  for (const after of sorted) {
    if (!isFixedCopyRun(after)) continue;
    const before = partner(after);
    if (before) return { before, after };
  }
  for (const after of sorted) {
    const before = partner(after);
    if (before) return { before, after };
  }
  return null;
}

/**
 * The Before picker's runs: only runs on an original site, never a fixed copy's "after the fix"
 * runs. A fixed copy run that the URL names as the before run stays in the list, so the picker
 * can show what is open.
 */
export function beforeOptions(runs: Run[], current?: Run): Run[] {
  // Real-world runs (Memos) have no fixed copy and no fair "after", so they are never offered (UI-13).
  return runs.filter((r) => r.key === current?.key || (!isFixedCopyRun(r) && !isRealWorldRun(r)));
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

/**
 * Rows that read the same: of one type, with the same title. Each gets a detail from the run file
 * (its step, or the first sentence of its evidence) so a reader can tell them apart (R2-03). Rows
 * whose titles already differ need none, and rows that nothing in the run file separates get none.
 * The result maps a row's key to its detail.
 */
export function rowDetails(rows: ExorciseRow[]): Map<string, string> {
  const byType = new Map<string, ExorciseRow[]>();
  for (const row of rows) byType.set(row.type, [...(byType.get(row.type) ?? []), row]);
  const details = new Map<string, string>();
  for (const group of byType.values()) {
    const findings = group.map((row) => (row.before ?? row.after)!);
    if (group.length < 2 || new Set(findings.map((f) => f.title.trim())).size === group.length) continue;
    tellApart(findings).forEach((detail, i) => {
      if (detail) details.set(group[i]!.key, detail);
    });
  }
  return details;
}

export const EXORCISE_LABELS: Record<ExorciseStatus, string> = {
  exorcised: 'Exorcised',
  still_haunting: 'Still haunting',
  new_haunting: 'New haunting',
  not_reached: 'Not reached',
};
