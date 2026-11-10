import { describe, expect, it } from 'vitest';
import type { Finding, Run } from '../data/types';
import { FINDING_LABELS } from '../model/findingLabels';
import { missionVerb, resultHeadline, resultsHeading, siteShortName, watchStep } from '../model/results';
import { FINDING_TYPES } from '../data/types';
import { bebeRun, listenerRun } from './fixtures/samples';

/** A copy of the Listener sample with some fields changed. */
function edit(run: Run, changes: Partial<Run>): Run {
  return { ...structuredClone(run), ...changes };
}

const finding = (type: Finding['type'], step: number, title = 'A problem'): Finding => ({
  type,
  step,
  title,
  evidence: 'Seen in the run',
  screenshot: null,
});

describe('Results_Section wording with the samples (Req 21.1, 21.4, 21.5)', () => {
  it('shortens the site name and builds the heading', () => {
    expect(siteShortName('Lantern Bills demo')).toBe('Lantern Bills');
    expect(siteShortName('Lantern Bills (Demo)')).toBe('Lantern Bills');
    expect(siteShortName('Demolition Derby')).toBe('Demolition Derby');
    expect(siteShortName('demo')).toBe('demo');
    expect(resultsHeading('Lantern Bills demo')).toBe('What the ghosts found on Lantern Bills');
  });

  it('finds the Mission_Verb', () => {
    expect(missionVerb("Pay this month's electricity bill")).toBe('pay');
    expect(missionVerb('Find the opening hours')).toBe('find');
    expect(missionVerb('The bill')).toBeNull();
    expect(missionVerb('3 tickets')).toBeNull();
    expect(missionVerb('')).toBeNull();
  });

  it('says the Listener got trapped in a pop-up and Bebe managed to pay', () => {
    expect(resultHeadline(listenerRun())).toBe("The Listener got trapped in a pop-up and couldn't pay.");
    expect(resultHeadline(bebeRun())).toBe("Bebe managed to pay, but found text that wasn't translated.");
  });

  it('opens the Watch_Step: the Listener at step 9 and Bebe at step 3', () => {
    expect(watchStep(listenerRun())).toBe(9);
    expect(watchStep(bebeRun())).toBe(3);
  });
});

describe('Result_Headline rules (Req 21.4)', () => {
  const base = listenerRun();

  it('uses the plain keyboard-trap wording when nothing mentions a pop-up', () => {
    const run = edit(base, { findings: [finding('focus_trap', 9, 'Focus stays in the menu')] });
    run.steps[8]!.spoken = 'Button, Confirm';
    expect(resultHeadline(run)).toBe("The Listener got trapped with no keyboard way out and couldn't pay.");
  });

  it('notices a pop-up in the step spoken text', () => {
    const run = edit(base, { findings: [finding('focus_trap', 9, 'Focus stays put')] });
    run.steps[8]!.spoken = 'Popup, Confirm';
    expect(resultHeadline(run)).toBe("The Listener got trapped in a pop-up and couldn't pay.");
  });

  it('uses the first finding at the last step, in findings order', () => {
    const run = edit(base, { findings: [finding('slow_wait', 9), finding('focus_trap', 9, 'dialog')] });
    expect(resultHeadline(run)).toBe("The Listener waited too long for the page and couldn't pay.");
  });

  it('gives up with no finding at the last step', () => {
    const run = edit(base, { findings: [finding('unlabeled_button', 7)] });
    expect(resultHeadline(run)).toBe("The Listener gave up at step 9 and couldn't pay.");
  });

  it('stops on a technical error', () => {
    const run = edit(base, { result: 'error' });
    expect(resultHeadline(run)).toBe("The Listener hit a technical error and couldn't pay.");
  });

  it('counts more problems on a successful run', () => {
    const run = edit(bebeRun(), { findings: [finding('dark_pattern', 5), finding('cut_off_text', 2), finding('misclick', 4)] });
    expect(resultHeadline(run)).toBe('Bebe managed to pay, but found text that was cut off and 2 more problems.');
    const one = edit(bebeRun(), { findings: [finding('dark_pattern', 5), finding('slow_wait', 2)] });
    expect(resultHeadline(one)).toBe('Bebe managed to pay, but found a page that took too long and 1 more problem.');
  });

  it('has no problems to report', () => {
    expect(resultHeadline(edit(bebeRun(), { findings: [] }))).toBe('Bebe managed to pay with no problems.');
  });

  it('falls back when the goal has no Mission_Verb', () => {
    const mission = { ...base.mission, goal: 'The monthly bill' };
    expect(resultHeadline(edit(base, { mission }))).toBe(
      "The Listener got trapped in a pop-up and couldn't finish the task.",
    );
    expect(resultHeadline(edit(bebeRun(), { mission, findings: [] }))).toBe('Bebe made it through with no problems.');
  });

  it('says when the ghost recorded no steps', () => {
    const run = edit(base, { steps: [] });
    expect(resultHeadline(run)).toBe('The Listener recorded no steps.');
    expect(watchStep(run)).toBeNull();
  });

  it('has a blocker and a thing for every finding type', () => {
    for (const type of FINDING_TYPES) {
      expect(FINDING_LABELS[type].blocker.trim()).not.toBe('');
      expect(FINDING_LABELS[type].thing.trim()).not.toBe('');
    }
  });
});

describe('Watch_Step rules (Req 21.5)', () => {
  it('uses the last step for gave_up and error runs', () => {
    expect(watchStep(edit(listenerRun(), { result: 'error', findings: [] }))).toBe(9);
  });

  it('uses the earliest finding that matches a step on a successful run', () => {
    const run = edit(bebeRun(), { findings: [finding('misclick', 5), finding('slow_wait', 42), finding('dark_pattern', 4)] });
    expect(watchStep(run)).toBe(4);
  });

  it('uses the first step on a successful run with no findings', () => {
    expect(watchStep(edit(bebeRun(), { findings: [] }))).toBe(1);
  });
});
