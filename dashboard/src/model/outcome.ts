// Outcome_Line: the plain-words sentence on a Home haunt card that says what
// happened to one ghost in a run (Req 7.14–7.19). This is the only place it is built.

import type { Run } from '../data/types';
import { FINDING_LABELS } from './findingLabels';
import { plural } from './format';

export type OutcomeRun = Pick<Run, 'result' | 'steps' | 'findings'>;

export function outcomeLine(run: OutcomeRun): string {
  const { steps, findings, result } = run;
  if (steps.length === 0) return 'No steps in this run';

  if (result === 'succeeded') return `Made it through in ${plural(steps.length, 'step')}`;

  // Last step = the step with the highest n. Steps are sorted by n, but take the
  // maximum so the rule holds even if they are not.
  const lastN = Math.max(...steps.map((step) => step.n));

  if (result === 'error') return `Hit a technical error at step ${lastN}`;

  const finding = findings.find((f) => f.step === lastN);
  if (!finding) return `Gave up at step ${lastN}`;

  const label = FINDING_LABELS[finding.type].label;
  if (finding.type === 'focus_trap') {
    return `Hit a ${label.charAt(0).toLowerCase()}${label.slice(1)} at step ${lastN}`;
  }
  return `Stuck at step ${lastN}: ${label}`;
}
