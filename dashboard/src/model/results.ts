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

/** Watch_Step (Req 21.5): the step "Watch it happen" opens. Null when there are no steps. */
export function watchStep(run: Run): number | null {
  if (run.steps.length === 0) return null;
  if (run.result !== 'succeeded') return lastStepN(run);
  const steps = new Set(run.steps.map((s) => s.n));
  const finding = byStep(run.findings).find((f) => steps.has(f.step));
  return finding ? finding.step : run.steps[0]!.n;
}
