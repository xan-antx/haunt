// Which screenshots to fetch first when a run opens or the step changes (UI-09): the current
// step's image, then the nearest steps, the next one before the previous one at equal distance
// (people mostly play forward). Steps without a screenshot are skipped; each file appears once.

import type { Run } from '../data/types';

export function preloadOrder(run: Run, currentN: number): string[] {
  const here = run.steps.findIndex((s) => s.n === currentN);
  const from = here < 0 ? 0 : here;
  const seen = new Set<string>();
  return run.steps
    .map((step, i) => ({ step, distance: Math.abs(i - from), behind: i < from }))
    .filter(({ step }) => typeof step.screenshot === 'string' && step.screenshot !== '')
    .sort((a, b) => a.distance - b.distance || Number(a.behind) - Number(b.behind))
    .map(({ step }) => step.screenshot as string)
    .filter((path) => (seen.has(path) ? false : (seen.add(path), true)));
}
