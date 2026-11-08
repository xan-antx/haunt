// The single Stuck_Notice shown on the Ghost Cam. This is the only place the notice is built,
// so the Ghost Cam can never show two notices at once (Req 10.30).

import type { Run, Step } from '../data/types';
import { FINDING_LABELS } from './findingLabels';
import { ghostName } from './ghosts';

export interface StuckNotice {
  /** At most 3 lines (Req 10.31). */
  lines: string[];
  /** The lines joined with a space, for the element's title. */
  fullText: string;
}

export function stuckNotice(run: Run, step: Step): StuckNotice | null {
  const found = run.findings.filter((f) => f.step === step.n);
  const lastN = run.steps.reduce((max, s) => (s.n > max ? s.n : max), -Infinity);
  const gaveUp = run.result === 'gave_up' && step.n === lastN;
  const name = ghostName(run.ghost);

  const first = found[0];
  if (!first) {
    if (!gaveUp) return null;
    const lines = [`${name} gave up here.`];
    return { lines, fullText: lines.join(' ') };
  }

  const lead =
    run.ghost === 'listener' && first.type === 'focus_trap'
      ? 'The Listener got trapped here'
      : `${name} hit a problem here`;
  const line1 = gaveUp ? `${lead} and gave up here.` : `${lead}.`;
  const more = found.length > 1 ? ` (+${found.length - 1} more at this step)` : '';
  const line2 = `${FINDING_LABELS[first.type].label}: ${first.title}${more}`;
  const lines = [line1, line2, first.evidence];
  return { lines, fullText: lines.join(' ') };
}
