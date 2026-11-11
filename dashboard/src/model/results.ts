// Home's Results_Section: the Result_Headline that says in plain words what happened to a ghost,
// and the Watch_Step its "Watch it happen" button opens (Req 21). Built only from run fields.

import type { Finding, Run } from '../data/types';
import { FINDING_LABELS, POP_UP_BLOCKER } from './findingLabels';
import { plural } from './format';
import { ghostName } from './ghosts';

/** Site_Short_Name: drops one trailing "demo" or "(demo)" word, any case. */
export function siteShortName(siteName: string): string {
  const short = siteName.replace(/\s+\(?demo\)?\s*$/i, '').trim();
  return short === '' ? siteName.trim() : short;
}

export function resultsHeading(siteName: string): string {
  return `What the ghosts found on ${siteShortName(siteName)}`;
}

const NOT_VERBS = new Set(['a', 'an', 'the', 'this', 'that', 'my', 'your', 'our', 'their']);

/** Mission_Verb: the goal's first word, lowercased, when it is all letters and not a determiner. */
export function missionVerb(goal: string): string | null {
  const first = goal.trim().split(/\s+/)[0] ?? '';
  if (!/^[A-Za-z]+$/.test(first)) return null;
  const verb = first.toLowerCase();
  return NOT_VERBS.has(verb) ? null : verb;
}

const POP_UP_WORDS = /\b(dialog|modal|pop-?up)\b/i;

function blocker(run: Run, finding: Finding): string {
  if (finding.type === 'focus_trap') {
    const spoken = run.steps.find((s) => s.n === finding.step)?.spoken ?? '';
    if ([finding.title, finding.evidence, spoken].some((text) => POP_UP_WORDS.test(text))) return POP_UP_BLOCKER;
  }
  return FINDING_LABELS[finding.type].blocker;
}

function lastStepN(run: Run): number {
  return Math.max(...run.steps.map((s) => s.n));
}

/** Findings by step, earliest first, keeping file order for ties. */
function byStep(findings: readonly Finding[]): Finding[] {
  return findings
    .map((finding, i) => ({ finding, i }))
    .sort((a, b) => a.finding.step - b.finding.step || a.i - b.i)
    .map(({ finding }) => finding);
}

/** Result_Headline (Req 21.4). The only place it is built. */
export function resultHeadline(run: Run): string {
  const name = ghostName(run.ghost);
  if (run.steps.length === 0) return `${name} recorded no steps.`;

  const verb = missionVerb(run.mission.goal);
  const couldnt = verb ? `couldn't ${verb}` : "couldn't finish the task";
  const managed = verb ? `managed to ${verb}` : 'made it through';
  const lastN = lastStepN(run);

  switch (run.result) {
    case 'gave_up': {
      const atLast = run.findings.find((f) => f.step === lastN);
      if (atLast) return `${name} ${blocker(run, atLast)} and ${couldnt}.`;
      return `${name} gave up at step ${lastN} and ${couldnt}.`;
    }
    case 'error':
      return `${name} hit a technical error and ${couldnt}.`;
    case 'succeeded': {
      const [first, ...rest] = byStep(run.findings);
      if (!first) return `${name} ${managed} with no problems.`;
      const more = rest.length > 0 ? ` and ${plural(rest.length, 'more problem')}` : '';
      return `${name} ${managed}, but found ${FINDING_LABELS[first.type].thing}${more}.`;
    }
  }
}

/**
 * Blocking_Findings (Req 24.4): in a run that did not succeed, the findings that stopped the
 * ghost. These are the findings at its last step, where it stopped, and every `focus_trap`
 * finding, because a keyboard trap leaves no way on. Only findings at a step of the run count.
 * A succeeded run has none. Earliest step first, keeping file order for ties.
 */
export function blockingFindings(run: Run): Finding[] {
  if (run.result === 'succeeded' || run.steps.length === 0) return [];
  const lastN = lastStepN(run);
  const steps = new Set(run.steps.map((s) => s.n));
  return byStep(run.findings).filter((f) => steps.has(f.step) && (f.step === lastN || f.type === 'focus_trap'));
}

/**
 * Watch_Step (Req 21.5, revised by Req 24.4): the step "Watch it happen" opens. Null when there
 * are no steps. The step of the first Blocking_Finding; else the last step of a `gave_up` or
 * `error` run; else, for a `succeeded` run, its earliest finding at a step of the run, or its
 * first step.
 */
export function watchStep(run: Run): number | null {
  if (run.steps.length === 0) return null;
  const blocking = blockingFindings(run)[0];
  if (blocking) return blocking.step;
  if (run.result !== 'succeeded') return lastStepN(run);
  const steps = new Set(run.steps.map((s) => s.n));
  const finding = byStep(run.findings).find((f) => steps.has(f.step));
  return finding ? finding.step : run.steps[0]!.n;
}
