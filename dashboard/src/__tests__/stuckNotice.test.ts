import { describe, expect, it } from 'vitest';
import type { Run, Step } from '../data/types';
import { FINDING_LABELS } from '../model/findingLabels';
import { stuckNotice } from '../model/stuckNotice';
import { bebeRun, listenerRun } from './fixtures/samples';

function stepOf(run: Run, n: number): Step {
  const step = run.steps.find((s) => s.n === n);
  if (!step) throw new Error(`no step ${n}`);
  return step;
}

describe('stuckNotice with the samples', () => {
  it('merges the focus trap and the give-up at Listener step 9', () => {
    const run = listenerRun();
    const notice = stuckNotice(run, stepOf(run, 9));
    expect(notice).not.toBeNull();
    expect(notice!.lines[0]).toBe('The Listener got trapped here and gave up.');
    const finding = run.findings.find((f) => f.step === 9)!;
    // The evidence is one readable sentence, so it is shown with a full stop added (Req 10.36).
    expect(notice!.lines).toEqual([
      'The Listener got trapped here and gave up.',
      `${FINDING_LABELS.focus_trap.label}: ${finding.title}`,
      `${finding.evidence}.`,
    ]);
    expect(notice!.fullText).toBe(notice!.lines.join(' '));
    expect(notice!.details).toEqual([
      { label: FINDING_LABELS.focus_trap.label, title: finding.title, evidence: finding.evidence },
    ]);
  });

  it('reports a plain problem at Listener step 7', () => {
    const run = listenerRun();
    const notice = stuckNotice(run, stepOf(run, 7));
    expect(notice!.lines[0]).toBe('The Listener hit a problem here.');
    expect(notice!.lines).toHaveLength(3);
    expect(notice!.lines[1]).not.toContain('more at this step');
  });

  it('reports a problem at Bebe step 3', () => {
    const run = bebeRun();
    const notice = stuckNotice(run, stepOf(run, 3));
    expect(notice!.lines[0]).toBe('Bebe hit a problem here.');
    expect(notice!.lines).toHaveLength(3);
  });

  it('returns null at Listener step 1 and on every step without a finding or give-up', () => {
    const run = listenerRun();
    expect(stuckNotice(run, stepOf(run, 1))).toBeNull();
    for (const s of run.steps.filter((x) => x.n !== 7 && x.n !== 9)) {
      expect(stuckNotice(run, s)).toBeNull();
    }
    const bebe = bebeRun();
    for (const s of bebe.steps.filter((x) => x.n !== 3)) {
      expect(stuckNotice(bebe, s)).toBeNull();
    }
  });

  it('notes the extra findings when a step has three', () => {
    const run = listenerRun();
    const base = run.findings.find((f) => f.step === 7)!;
    const crowded: Run = {
      ...run,
      findings: [
        ...run.findings,
        { ...base, title: 'Second problem' },
        { ...base, title: 'Third problem' },
      ],
    };
    const notice = stuckNotice(crowded, stepOf(crowded, 7));
    expect(notice!.lines).toHaveLength(3);
    expect(notice!.lines[1]).toBe(
      `${FINDING_LABELS[base.type].label}: ${base.title} (+2 more at this step)`,
    );
    expect(notice!.lines[2]).toBe(`${base.evidence}.`);
    // The expandable details list all three findings in full.
    expect(notice!.details.map((d) => d.title)).toEqual([base.title, 'Second problem', 'Third problem']);
  });

  it('shows the amber error notice on the last step of an errored run', () => {
    const run: Run = { ...listenerRun(), result: 'error', findings: [] };
    const last = run.steps[run.steps.length - 1]!;
    const notice = stuckNotice(run, last);
    expect(notice!.lines).toEqual(['This run stopped because of an error, so its findings may be incomplete.']);
    expect(notice!.tone).toBe('warning');
    expect(stuckNotice(run, stepOf(run, 1))).toBeNull();
  });
});
