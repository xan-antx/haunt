import { describe, expect, it } from 'vitest';
import { buildRooms, coldSpotSize } from '../model/coldSpots';
import { buildCoverage } from '../model/coverage';
import { afterCandidates, compareRuns } from '../model/exorcise';
import { FINDING_LABELS, plainFindingType } from '../model/findingLabels';
import { formatSeconds } from '../model/format';
import { GHOSTS, resultSentence } from '../model/ghosts';
import { buildGraveyard } from '../model/graveyard';
import { groupHaunts, startHereTarget } from '../model/haunts';
import { reproduceCommand, shellQuote } from '../model/reproduce';
import { answer, answerText } from '../model/seance';
import { waveformBars } from '../model/waveform';
import { FINDING_TYPES } from '../data/types';
import { bebeRun, listenerRun, mustRun, sampleRuns } from './fixtures/samples';
import * as derived from './fixtures/derived';

const meta = (key: string) => ({ key, folder: `test/${key}`, origin: 'runs' as const });

describe('ghosts and labels', () => {
  it('uses the names and descriptions from the design rules', () => {
    expect(GHOSTS.listener.name).toBe('The Listener');
    expect(GHOSTS.phantom.description).toBe('Browses on slow 3G and an old phone.');
    expect(resultSentence('bebe', 'succeeded')).toBe('Bebe made it through');
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

  it('falls back to the first finding, then to null', () => {
    const noTrap = mustRun(derived.listenerAfterFix(), meta('a'));
    noTrap.findings = [noTrap.findings[0]!, { ...noTrap.findings[0]!, type: 'misclick', step: 4 }];
    noTrap.findings[0]!.type = 'unlabeled_button';
    expect(startHereTarget([noTrap])).toEqual({ runKey: 'a', step: 4 });
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
});

describe('séance with the samples', () => {
  it('answers why the Listener gave up', () => {
    expect(answerText(answer(listenerRun(), 'why-give-up'))).toBe(
      [
        'I gave up at step 9 on /bill.',
        'At step 7, The pay button has no accessible name.',
        'At step 9, Cannot escape the payment confirmation dialog.',
      ].join('\n'),
    );
  });

  it('answers why Bebe did not give up', () => {
    expect(answerText(answer(bebeRun(), 'why-give-up'))).toBe("I didn't give up. I finished at step 6: Payment received.");
  });

  it('answers where the Listener got stuck', () => {
    expect(answerText(answer(listenerRun(), 'where-stuck'))).toBe(
      'On /bill at step 7, I waited 0.2 s.\nOn /bill at step 9, I waited 0.5 s.',
    );
  });

  it('answers what Bebe heard and what would have helped', () => {
    expect(answerText(answer(bebeRun(), 'what-heard')).split('\n')[0]).toBe("Step 1: 'Pay your bill'.");
    expect(answerText(answer(bebeRun(), 'what-helped'))).toBe('At step 3: This text in my language.');
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
      'git checkout def5678 && npx haunt run --ghost listener --mission pay-bill --url http://localhost:3000',
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
