// The fixed copy of a site: a run file whose site.name is the original's name plus " (exorcised)".
// The engine writes that name when run with `--site-name`. No contract field is involved.

import type { Run } from '../data/types';

export const EXORCISED_SUFFIX = ' (exorcised)';

/** Marks a run on the fixed copy in Exorcise's after-run list. */
export const AFTER_THE_FIX_LABEL = 'after the fix';

/** The fixed copy's name for an original site name. */
export function fixedCopyName(siteName: string): string {
  return `${siteName}${EXORCISED_SUFFIX}`;
}

/**
 * The original site's name when `siteName` is a fixed copy's name (it ends in " (exorcised)" and
 * something is left before the suffix), else null.
 */
export function originalSiteName(siteName: string): string | null {
  if (!siteName.endsWith(EXORCISED_SUFFIX)) return null;
  const original = siteName.slice(0, -EXORCISED_SUFFIX.length);
  return original.trim() === '' ? null : original;
}

/** True when the run was made on a site's fixed copy. */
export function isFixedCopyRun(run: Run): boolean {
  return originalSiteName(run.site.name) !== null;
}

/** The runs on original sites only: Home results and the tour use these. Keeps the order. */
export function originalSiteRuns(runs: Run[]): Run[] {
  return runs.filter((run) => !isFixedCopyRun(run));
}

/** True when `after` was made on the fixed copy of the site that `before` was made on. */
export function isAfterTheFix(before: Run, after: Run): boolean {
  return after.site.name === fixedCopyName(before.site.name);
}
