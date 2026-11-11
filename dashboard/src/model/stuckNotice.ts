// The single Stuck_Notice shown on the Ghost Cam. This is the only place the notice is built,
// so the Ghost Cam can never show two notices at once (Req 10.30).

import type { Run, Step } from '../data/types';
import { FINDING_LABELS } from './findingLabels';
import { evidenceSentence } from './findingWords';
import { ghostName } from './ghosts';

/** One finding at the step, in full, for the notice's expandable details (Req 10.36). */
export interface StuckDetail {
  label: string;
  title: string;
  /** The finding's evidence exactly as the run file has it. */
  evidence: string;
}

export interface StuckNotice {
  /** At most 3 lines (Req 10.31). The third is one readable sentence, the Evidence_Sentence. */
  lines: string[];
  /** The lines joined with a space, for the element's title. */
  fullText: string;
  /** 'warning' is the amber style for an errored run; 'stuck' is the default style. */
  tone: 'stuck' | 'warning';
  /** Every finding at the step, in file order, with its full evidence. Empty when there is none. */
  details: StuckDetail[];
}

export const ERROR_NOTICE = 'This run stopped because of an error, so its findings may be incomplete.';

export function stuckNotice(run: Run, step: Step): StuckNotice | null {
  const found = run.findings.filter((f) => f.step === step.n);
  const lastN = run.steps.reduce((max, s) => (s.n > max ? s.n : max), -Infinity);
  const gaveUp = run.result === 'gave_up' && step.n === lastN;
  const errored = run.result === 'error' && step.n === lastN;
  const name = ghostName(run.ghost);

  const first = found[0];
  if (!first) {
    if (errored) return { lines: [ERROR_NOTICE], fullText: ERROR_NOTICE, tone: 'warning', details: [] };
    if (!gaveUp) return null;
    const lines = [`${name} gave up here.`];
    return { lines, fullText: lines.join(' '), tone: 'stuck', details: [] };
  }

  const lead =
    run.ghost === 'listener' && first.type === 'focus_trap'
      ? 'The Listener got trapped here'
      : `${name} hit a problem here`;
  const line1 = gaveUp ? `${lead} and gave up.` : `${lead}.`;
  const more = found.length > 1 ? ` (+${found.length - 1} more at this step)` : '';
  const line2 = `${FINDING_LABELS[first.type].label}: ${first.title}${more}`;
  const lines = [line1, line2, evidenceSentence(run, first)];
  const details = found.map((f) => ({ label: FINDING_LABELS[f.type].label, title: f.title, evidence: f.evidence }));
  return { lines, fullText: lines.join(' '), tone: 'stuck', details };
}
