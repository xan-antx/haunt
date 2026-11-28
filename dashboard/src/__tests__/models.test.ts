import { describe, expect, it } from 'vitest';
import { buildRooms, coldSpotSize } from '../model/coldSpots';
import { buildCoverage } from '../model/coverage';
import { afterCandidates, compareRuns, rowDetails } from '../model/exorcise';
import { tellApart } from '../model/findingWords';
import { FINDING_LABELS, plainFindingType } from '../model/findingLabels';
import { formatDate, formatLocalDateTime, formatSeconds } from '../model/format';
import { GHOSTS, resultSentence } from '../model/ghosts';
import { buildGraveyard, epitaph } from '../model/graveyard';
import { groupHaunts, startHereTarget } from '../model/haunts';
import { reproduceCommand, shellQuote } from '../model/reproduce';
import { resultHeadline } from '../model/results';
import { MASK } from '../model/secrets';
import { answer, answerText, questionLabel } from '../model/seance';
import { displayGoal, displayName, plainAction, siteLabel } from '../model/sites';
import { waveformBars } from '../model/waveform';
import { FINDING_TYPES, type Finding } from '../data/types';
import { allRecordedRuns, bebeRun, listenerRun, mustRun, sampleRuns } from './fixtures/samples';
import * as derived from './fixtures/derived';

const meta = (key: string) => ({ key, folder: `test/${key}`, origin: 'runs' as const });

describe('ghosts and labels', () => {
  it('uses the names and descriptions from the design rules', () => {
    expect(GHOSTS.listener.name).toBe('The Listener');
    expect(GHOSTS.phantom.description).toBe('Browses on slow 3G and an old phone.');
    expect(resultSentence('bebe', 'succeeded')).toBe('Bebe completed the task');
    expect(resultSentence('listener', 'gave_up')).toBe('The Listener gave up');
  });

  it('has the plain-words labels from the requirements', () => {
    expect(Object.fromEntries(FINDING_TYPES.map((t) => [t, plainFindingType(t)]))).toEqual({
      unlabeled_button: 'Button with no name',
      focus_trap: 'Keyboard trap',
      unannounced_error: 'Error nobody announced',
      slow_wait: 'Too long a wait',
      misclick: 'Clicked the wrong thing',
      cut_off_text: 'Text cut off',
      untranslated: 'Text not translated',
      dark_pattern: 'Tricky choice',
      unlabeled_field: 'Field with no name',
    });
  });
});

describe('haunts with the samples', () => {
  it('groups both samples into one Haunt with 3 findings', () => {
    const haunts = groupHaunts(sampleRuns());
    expect(haunts).toHaveLength(1);
    const [haunt] = haunts;
    expect(haunt!.siteName).toBe('Lantern Bills demo');
    expect(haunt!.siteKey).toBe('lantern-bills-demo');
    expect(haunt!.findingCount).toBe(3);
    expect(haunt!.ghosts.map((g) => g.ghost)).toEqual(['listener', 'bebe']);
    expect(haunt!.latestStartedAt).toBe('2026-11-03T14:35:42Z');
  });

  it('points Start here at the Listener focus trap, step 9', () => {
    expect(startHereTarget(sampleRuns())).toEqual({ runKey: '2026-11-03-listener-pay-bill', step: 9 });
  });

  // Revised by Req 24.4: the newest Listener run at its Watch_Step, not its first finding.
  it('falls back to the Watch_Step of the newest Listener run, then to null', () => {
    const noTrap = mustRun(derived.listenerAfterFix(), meta('a'));
    noTrap.findings = [noTrap.findings[0]!, { ...noTrap.findings[0]!, type: 'misclick', step: 4 }];
    noTrap.findings[0]!.type = 'unlabeled_button';
    // No Blocking_Finding: it gave up at its last step, 9, with no finding there.
    expect(startHereTarget([noTrap])).toEqual({ runKey: 'a', step: 9 });
    expect(startHereTarget([bebeRun()])).toBeNull();
  });
});

describe('rooms and cold spots with the samples', () => {
  it('shows rooms / and /bill with 3 cold spots', () => {
    const rooms = buildRooms(sampleRuns());
    expect(rooms.map((r) => r.page)).toEqual(['/', '/bill']);
    expect(rooms[0]!.ghosts).toEqual(['listener', 'bebe']);
    expect(rooms[0]!.coldSpots).toEqual([]);
    expect(rooms[1]!.coldSpots).toEqual([
      { runKey: '2026-11-03-listener-pay-bill', ghost: 'listener', step: 7, waitMs: 180, reason: 'finding' },
      { runKey: '2026-11-03-listener-pay-bill', ghost: 'listener', step: 9, waitMs: 500, reason: 'gave_up' },
      { runKey: '2026-11-03-bebe-pay-bill', ghost: 'bebe', step: 3, waitMs: 150, reason: 'finding' },
    ]);
  });

  it('sizes cold spots between 24 and 96 px', () => {
    expect(coldSpotSize(0)).toBe(24);
    expect(coldSpotSize(100)).toBe(40);
    expect(coldSpotSize(1_000_000)).toBe(96);
    expect(formatSeconds(1200)).toBe('1.2 s');
    expect(formatSeconds(150)).toBe('0.2 s');
  });
});

describe('graveyard with the samples', () => {
  it('shows 3 tombstones and filters by site and ghost', () => {
    const all = buildGraveyard(sampleRuns());
    expect(all.map((t) => t.label)).toEqual(['Text not translated', 'Button with no name', 'Keyboard trap']);
    expect(buildGraveyard(sampleRuns(), { ghost: 'listener' })).toHaveLength(2);
    expect(buildGraveyard(sampleRuns(), { site: 'lantern-bills-demo' })).toHaveLength(3);
    expect(buildGraveyard(sampleRuns(), { site: 'elsewhere' })).toHaveLength(0);
  });

  it('puts Lantern Bills first and orders by step, with a plain epitaph (UI-23)', () => {
    const stones = buildGraveyard(allRecordedRuns());
    const siteOrder = stones.map((t) => siteLabel(t.run.site.name));
    // Every Lantern Bills stone comes before every other site's.
    const firstOther = siteOrder.findIndex((s) => s !== 'Lantern Bills');
    if (firstOther >= 0) expect(siteOrder.slice(firstOther)).not.toContain('Lantern Bills');
    const lantern = stones.filter((t) => siteLabel(t.run.site.name) === 'Lantern Bills');
    expect(lantern.map((t) => t.finding.step)).toEqual([...lantern.map((t) => t.finding.step)].sort((a, b) => a - b));
    expect(epitaph({ type: 'unlabeled_button' } as Finding)).toBe('Here lies a button with no name.');
  });
});

// R2-03: findings that look the same are told apart with words from the run file, and nothing is merged.
describe('findings that look the same (R2-03)', () => {
  const recorded = allRecordedRuns();

  it("tells Bebe's two step 13 Tricky choice stones apart with their own titles, and keeps every stone", () => {
    const stones = buildGraveyard(recorded);
    const latest = stones.filter((t) => t.run.ghost === 'bebe' && t.finding.type === 'dark_pattern' && t.finding.step === 13);
    expect(latest).toHaveLength(2);
    expect(latest.map((t) => t.detail).sort()).toEqual(['A paid option was ticked in advance', 'The total is higher than the bill']);
    // The detail is the finding's own title, from the run file.
    for (const t of latest) expect(t.detail).toBe(t.finding.title);
  });

  it('gives a detail only to stones that share a type and step with another, and never merges or drops one', () => {
    const stones = buildGraveyard(recorded);
    for (const t of stones) {
      const twins = stones.filter((o) => o.run.key === t.run.key && o.finding.type === t.finding.type && o.finding.step === t.finding.step);
      if (twins.length === 1) expect(t.detail, `${t.run.key} ${t.finding.type} step ${t.finding.step}`).toBeNull();
      else expect(t.detail, `${t.run.key} ${t.finding.type} step ${t.finding.step}`).not.toBeNull();
    }
    // No two stones of one run, type and step read the same.
    const seen = new Set<string>();
    for (const t of stones) {
      const key = [t.run.key, t.finding.type, t.finding.step, t.detail ?? ''].join('|');
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });

  it('counts the same findings as the run files', () => {
    const runs = allRecordedRuns();
    const total = buildGraveyard(runs).length;
    const latestFindings = new Set(buildGraveyard(runs).map((t) => t.run.key));
    const expected = [...latestFindings].reduce((n, key) => n + runs.find((r) => r.key === key)!.findings.length, 0);
    expect(total).toBe(expected);
  });

  it('shows the step on The Phantom\'s two "Clicked the wrong thing" rows, and not on rows that already differ', () => {
    const before = recorded.find((r) => r.key === '2026-11-11T1744Z-phantom-pay-bill')!;
    const after = recorded.find((r) => r.key === '2026-11-22T1153Z-phantom-pay-bill')!;
    const result = compareRuns(before, after);
    if (!('rows' in result)) throw new Error('expected rows');
    const misclicks = result.rows.filter((r) => r.type === 'misclick');
    expect(misclicks).toHaveLength(2);
    const details = rowDetails(result.rows);
    expect(misclicks.map((r) => details.get(r.key))).toEqual(['Step 3', 'Step 5']);
    // Every row is still there, with its own status.
    expect(result.rows).toHaveLength(before.findings.length + after.findings.length - result.rows.filter((r) => r.status === 'still_haunting').length);
  });

  it("leaves rows alone when their titles already differ, as Bebe's Tricky choice rows do", () => {
    const run = recorded.find((r) => r.key === '2026-11-11T1744Z-bebe-pay-bill')!;
    const result = compareRuns(run, run);
    if (!('rows' in result)) throw new Error('expected rows');
    expect(result.rows.filter((r) => r.type === 'dark_pattern').length).toBeGreaterThan(1);
    expect(rowDetails(result.rows).size).toBe(0);
  });

  it('tellApart uses the title, then the step, then a plain first sentence, and says nothing when nothing differs', () => {
    const f = (title: string, step: number, evidence = 'Evidence one. More.'): Finding => ({ type: 'misclick', step, title, evidence, screenshot: 'shots/001.png' });
    expect(tellApart([f('A', 1)])).toEqual([null]);
    expect(tellApart([f('A', 3), f('B', 3)])).toEqual(['A', 'B']);
    expect(tellApart([f('Same', 3), f('Same', 5)])).toEqual(['Step 3', 'Step 5']);
    expect(tellApart([f('Same', 3, 'The first button.'), f('Same', 3, 'The second button.')])).toEqual(['The first button.', 'The second button.']);
    expect(tellApart([f('Same', 3, 'Same.'), f('Same', 3, 'Same.')])).toEqual([null, null]);
    // Evidence that is not plain words (a path) is not shown.
    expect(tellApart([f('Same', 3, 'On /bill it moved.'), f('Same', 3, 'On /pay it moved.')])).toEqual([null, null]);
  });
});

describe('séance with the samples', () => {
  it('answers why the Listener gave up', () => {
    expect(answerText(answer(listenerRun(), 'why-give-up'))).toBe(
      [
        'I gave up at step 9 on the bill page.',
        'At step 7, the pay button has no accessible name.',
        'At step 9, cannot escape the payment confirmation dialog.',
      ].join('\n'),
    );
  });

  it('answers why Bebe did not give up', () => {
    expect(answerText(answer(bebeRun(), 'why-give-up'))).toBe("I didn't give up. I finished at step 6 and paid the bill.");
  });

  // Revised by Req 24.6: the findings at each stuck step, in plain words.
  it('answers where the Listener got stuck', () => {
    expect(answerText(answer(listenerRun(), 'where-stuck'))).toBe(
      'At step 7 I found a button with no name.\nAt step 9 I got trapped in a pop-up.',
    );
  });

  it('says where a run with no finding at its last step gave up or stopped, by page name', () => {
    const gaveUp = mustRun(derived.listenerAfterFix(), meta('g'));
    gaveUp.findings = [];
    expect(answerText(answer(gaveUp, 'where-stuck'))).toBe('At step 9 I gave up on the bill page.');
    const errored = mustRun(derived.listenerNeverReachesBill(), meta('err'));
    expect(answerText(answer(errored, 'where-stuck'))).toBe('At step 3 a technical error stopped me on the bill page.');
  });

  it('answers what Bebe was thinking, from her thoughts, and what would have helped', () => {
    const first = bebeRun().steps[0]!.thought.trim();
    expect(answerText(answer(bebeRun(), 'what-heard')).split('\n')[0]).toBe(
      `Step 1: ${/[.!?]$/.test(first) ? first : `${first}.`}`,
    );
    expect(questionLabel('bebe', 'what-heard')).toBe('What were you thinking?');
    expect(questionLabel('phantom', 'what-heard')).toBe('What were you thinking?');
    expect(questionLabel('listener', 'what-heard')).toBe('What did you hear?');
    expect(answerText(answer(bebeRun(), 'what-helped'))).toBe('At step 3: This text in my language.');
  });

  // UI-02: every question, for every recorded run, reads as plain sentences.
  it('never gives an empty, repeated or broken answer for any recorded run', () => {
    const runs = allRecordedRuns();
    expect(runs).toHaveLength(11);
    for (const run of runs) {
      for (const q of ['why-give-up', 'where-stuck', 'what-heard', 'what-helped'] as const) {
        const text = answerText(answer(run, q));
        const where = `${run.key} / ${q}`;
        expect(text, where).not.toContain("''");
        expect(text, where).not.toMatch(/ : \./);
        expect(text, where).not.toMatch(/: \./);
        expect(text, where).not.toMatch(/(\b[\w' ]{10,}\b)(?:,| and) ?\1/);
        const lines = text.split('\n');
        expect(new Set(lines).size, `${where} repeats a line`).toBe(lines.length);
      }
    }
  });

  // UI-05: the Memos account's password never reaches a screen or a page title.
  it('masks the throwaway password in every loaded run and shows a short goal for Memos', () => {
    const memos = allRecordedRuns().filter((r) => r.mission.id === 'write-note');
    expect(memos).toHaveLength(2);
    for (const run of memos) {
      expect(JSON.stringify(run), run.key).not.toContain('HauntTest123!');
      expect(displayGoal(run.mission)).toBe('Write and save a note in Memos');
      expect(run.steps.some((s) => s.spoken.includes(MASK) || s.action.includes(MASK))).toBe(true);
    }
    for (const run of allRecordedRuns()) expect(JSON.stringify(run), run.key).not.toContain('HauntTest123!');
  });

  // UI-06: both Memos cards end with what the ghost could not do, not with "sign".
  it('ends the Memos headlines with "save the note" and never "sign"', () => {
    for (const run of allRecordedRuns().filter((r) => r.mission.id === 'write-note')) {
      const headline = resultHeadline(run);
      expect(headline, run.key).toMatch(/couldn't save the note\.$/);
      expect(headline).not.toMatch(/sign/);
    }
  });

  // UI-24: no local address in a step's action.
  it('names the page instead of a local address in a step action', () => {
    expect(plainAction('Lantern Bills demo', 'Open http://localhost:3000')).toBe('Open the bill page');
    expect(plainAction('Memos', 'Open http://localhost:5230/auth')).toBe('Open the sign-in page');
    expect(siteLabel('Lantern Bills demo (exorcised)')).toBe('Lantern Bills (fixed copy)');
    expect(displayName('Lantern Bills demo (exorcised)')).toBe('Lantern Bills (fixed copy)');
    expect(displayName('Lantern Bills demo')).toBe('Lantern Bills');
    expect(displayName('Memos')).toBe('Memos');
  });

  it('shows dates in UTC with a label, whatever the time zone (UI-18)', () => {
    // Late evening UTC is already the next day in India; the run id and the screen both say the 22nd.
    expect(formatDate('2026-11-22T23:30:00Z')).toBe('22 Nov 2026 UTC');
    expect(formatLocalDateTime('2026-11-22T23:30:00Z')).toBe('22 Nov 2026, 23:30 UTC');
    expect(siteLabel('Memos')).toBe('Memos');
  });

  it('ends a completed run with a real sentence', () => {
    const run = allRecordedRuns().find((r) => r.key === '2026-11-11T1744Z-bebe-pay-bill')!;
    expect(answerText(answer(run, 'why-give-up'))).toBe("I didn't give up. I finished at step 14 and paid the bill.");
  });

  it('says a technical error stopped an error run', () => {
    const run = mustRun(derived.listenerNeverReachesBill(), meta('err'));
    expect(answerText(answer(run, 'why-give-up'))).toBe(
      'Something broke on the technical side at step 3, so I had to stop.',
    );
  });
});

describe('exorcise', () => {
  const before = listenerRun();

  it('marks a removed finding as exorcised and a remaining one as still haunting', () => {
    const after = mustRun(derived.listenerAfterFix(), meta('after'));
    const result = compareRuns(before, after);
    if ('error' in result) throw new Error('unexpected');
    expect(result.rows.map((r) => [r.type, r.page, r.status])).toEqual([
      ['unlabeled_button', '/bill', 'exorcised'],
      ['focus_trap', '/bill', 'still_haunting'],
    ]);
  });

  it('marks findings on pages the after run never reached as not reached', () => {
    const after = mustRun(derived.listenerNeverReachesBill(), meta('short'));
    const result = compareRuns(before, after);
    if ('error' in result) throw new Error('unexpected');
    expect(result.rows.map((r) => r.status)).toEqual(['not_reached', 'not_reached']);
  });

  it('refuses to compare different ghosts', () => {
    expect(compareRuns(before, bebeRun())).toEqual({ error: 'different_ghosts' });
  });

  it('marks new findings as new haunting', () => {
    const after = mustRun(derived.listenerNewFinding(), meta('2026-11-08-listener-pay-bill'));
    expect(after.ghost).toBe(before.ghost);
    const result = compareRuns(before, after);
    if ('error' in result) throw new Error('unexpected');
    expect(result.rows.map((r) => r.status)).toEqual(['still_haunting', 'still_haunting', 'new_haunting']);
    const added = result.rows.find((r) => r.status === 'new_haunting');
    expect(added?.type).toBe('unannounced_error');
    expect(added?.before).toBeUndefined();
    expect(added?.after?.step).toBe(6);
  });

  it('matches as a multiset', () => {
    const twice = listenerRun();
    twice.findings = [twice.findings[0]!, { ...twice.findings[0]!, step: 6 }];
    const once = mustRun(derived.listenerAfterFix(), meta('once'));
    once.findings = [{ ...twice.findings[0]! }];
    const result = compareRuns(twice, once);
    if ('error' in result) throw new Error('unexpected');
    expect(result.rows.map((r) => r.status)).toEqual(['still_haunting', 'exorcised']);
  });

  it('refuses to compare different missions', () => {
    expect(compareRuns(before, mustRun(derived.differentMission(), meta('m')))).toEqual({ error: 'different_missions' });
  });

  it('checks the mission before the ghost when both differ', () => {
    const other = mustRun(derived.differentMission(), meta('2026-11-07-bebe-autopay'));
    expect(other.ghost).not.toBe(before.ghost);
    expect(other.mission.id).not.toBe(before.mission.id);
    expect(compareRuns(before, other)).toEqual({ error: 'different_missions' });
  });

  it('offers no after candidates when only the samples exist', () => {
    expect(afterCandidates(listenerRun(), sampleRuns())).toEqual([]);
  });

  it('offers only same-ghost, same-mission after candidates, newest first', () => {
    const runs = [
      ...sampleRuns(),
      mustRun(derived.listenerAfterFix(), meta('2026-11-05-listener-pay-bill')),
      mustRun(derived.listenerNeverReachesBill(), meta('2026-11-06-listener-pay-bill')),
    ];
    expect(afterCandidates(listenerRun(), runs).map((r) => r.key)).toEqual([
      '2026-11-06-listener-pay-bill',
      '2026-11-05-listener-pay-bill',
    ]);
  });
});

describe('coverage with the samples', () => {
  it('shows pay-bill with Listener gave up, Bebe completed, Phantom not yet haunted', () => {
    const coverage = buildCoverage(sampleRuns());
    expect(coverage).toHaveLength(1);
    const [m] = coverage;
    expect(m!.missionId).toBe('pay-bill');
    expect(m!.requirement).toBe('WHEN the user submits a valid payment THE system SHALL show a confirmation');
    expect(m!.requirementChanged).toBe(false);
    expect(m!.perGhost.listener.latest?.result).toBe('gave_up');
    expect(m!.perGhost.bebe.latest?.result).toBe('succeeded');
    expect(m!.perGhost.phantom.latest).toBeNull();
  });

  it('flags a changed requirement and uses the newest text', () => {
    const newer = mustRun(derived.phantomRun(), meta('p'));
    newer.mission = { ...newer.mission, requirement: 'WHEN paying THE system SHALL confirm' };
    const [m] = buildCoverage([...sampleRuns(), newer]);
    expect(m!.requirementChanged).toBe(true);
    expect(m!.requirement).toBe('WHEN paying THE system SHALL confirm');
    expect(m!.perGhost.phantom.latest?.key).toBe('p');
  });
});

describe('reproduce and waveform', () => {
  it('builds the reproduce command for the Listener sample', () => {
    expect(reproduceCommand(listenerRun())).toBe(
      'git checkout def5678 && cd engine && npm run haunt -- run --ghost listener --mission pay-bill --url http://localhost:3000',
    );
    expect(shellQuote("it's here")).toBe(`'it'\\''s here'`);
  });

  it('makes deterministic waveform bars', () => {
    const bars = waveformBars('Button, Confirm');
    expect(bars).toHaveLength(32);
    expect(waveformBars('Button, Confirm')).toEqual(bars);
    expect(bars.every((b) => b >= 0.15 && b <= 1)).toBe(true);
    expect(waveformBars('Button, Confirm', 32, 1)).not.toEqual(bars);
  });

  it('has a label and helped text for every finding type', () => {
    for (const type of FINDING_TYPES) {
      expect(FINDING_LABELS[type].label.length).toBeGreaterThan(0);
      expect(FINDING_LABELS[type].helped.length).toBeGreaterThan(0);
    }
  });
});
