// The planted-problems story (UI-17): Lantern Bills has six problems planted in it on purpose
// (.kiro/steering/demo-site.md). This works out, from the run files alone, how many of them the
// ghosts found and how many the fix exorcised. Nothing here is adjusted to reach six.

import type { Finding, FindingType, Run } from '../data/types';
import { afterOptions, compareRuns } from './exorcise';
import { fixedCopyName, isAfterTheFix } from './fixedCopy';
import { latestRuns } from './latest';

/** The site the six problems are planted in, by its run-file name. */
export const PLANTED_SITE = 'Lantern Bills demo';

export interface PlantedProblem {
  id: string;
  /** Plain words, for the Home line and for a ghost that never reached it. */
  title: string;
  /** The finding types that show this problem. A run that finds any of them has found the problem. */
  types: readonly FindingType[];
}

/**
 * The explicit mapping from finding types to the six planted problems, in the order of
 * .kiro/steering/demo-site.md.
 */
export const PLANTED_PROBLEMS: readonly PlantedProblem[] = [
  { id: 'pay-button', title: 'a pay button with no name', types: ['unlabeled_button'] },
  {
    id: 'protect-dialog',
    title: 'the "Protect your payment" dialog that traps the keyboard and ticks a paid add-on',
    types: ['focus_trap', 'dark_pattern'],
  },
  { id: 'card-errors', title: 'card errors that are never announced', types: ['unannounced_error'] },
  { id: 'late-banner', title: 'a banner that loads late and pushes the page down', types: ['slow_wait', 'misclick'] },
  { id: 'cut-off-total', title: 'a payment total that is cut off at narrow widths', types: ['cut_off_text'] },
  { id: 'untranslated', title: 'missing Punjabi and Hindi text', types: ['untranslated'] },
];

export interface PlantedStatus {
  problem: PlantedProblem;
  /** The first finding of the problem in a latest run on Lantern Bills, or null when no run found it. */
  found: { run: Run; finding: Finding } | null;
  /** A before run and a fair after run on the fixed copy where the problem is marked exorcised. */
  exorcised: { before: Run; after: Run } | null;
}

export interface PlantedStory {
  planted: number;
  found: number;
  exorcised: number;
  statuses: PlantedStatus[];
  /** The problems no run reached. */
  notFound: PlantedProblem[];
}

function exorcisedBy(problem: PlantedProblem, runs: readonly Run[]): { before: Run; after: Run } | null {
  const originals = runs.filter((r) => r.site.name === PLANTED_SITE);
  for (const before of [...originals].sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))) {
    if (!before.findings.some((f) => problem.types.includes(f.type))) continue;
    for (const after of afterOptions(before, [...runs])) {
      if (!isAfterTheFix(before, after) || after.site.name !== fixedCopyName(PLANTED_SITE)) continue;
      const result = compareRuns(before, after);
      if ('error' in result) continue;
      if (result.rows.some((row) => row.status === 'exorcised' && problem.types.includes(row.type))) {
        return { before, after };
      }
    }
  }
  return null;
}

/** Null when there is no run on Lantern Bills at all. */
export function plantedStory(runs: readonly Run[]): PlantedStory | null {
  const latest = latestRuns(runs).filter((r) => r.site.name === PLANTED_SITE);
  if (latest.length === 0) return null;
  const statuses: PlantedStatus[] = PLANTED_PROBLEMS.map((problem) => {
    let found: PlantedStatus['found'] = null;
    for (const run of latest) {
      const finding = run.findings.find((f) => problem.types.includes(f.type));
      if (finding) {
        found = { run, finding };
        break;
      }
    }
    return { problem, found, exorcised: found ? exorcisedBy(problem, runs) : null };
  });
  return {
    planted: PLANTED_PROBLEMS.length,
    found: statuses.filter((s) => s.found).length,
    exorcised: statuses.filter((s) => s.exorcised).length,
    statuses,
    notFound: statuses.filter((s) => !s.found).map((s) => s.problem),
  };
}
