// UI-17: the planted-problems story, computed from every recorded run in runs/.

import { describe, expect, it } from 'vitest';
import { buildGraveyard } from '../model/graveyard';
import { groupHaunts } from '../model/haunts';
import { latestRuns } from '../model/latest';
import { splitRuns } from '../model/origin';
import { PLANTED_PROBLEMS, PLANTED_SITE, plantedStory } from '../model/planted';
import { allRecordedRuns } from './fixtures/samples';

const shown = () => splitRuns(allRecordedRuns()).shown;

describe('the mapping from finding types to the six planted problems', () => {
  it('has six problems and gives every finding type to at most one of them', () => {
    expect(PLANTED_PROBLEMS).toHaveLength(6);
    const types = PLANTED_PROBLEMS.flatMap((p) => p.types);
    expect(new Set(types).size).toBe(types.length);
    expect(new Set(PLANTED_PROBLEMS.map((p) => p.id)).size).toBe(6);
  });
});

describe('the planted-problems story from the recorded runs', () => {
  it('finds five of the six, exorcises all five, and names the one no run reached', () => {
    const story = plantedStory(shown())!;
    expect(story.planted).toBe(6);
    expect(story.found).toBe(5);
    expect(story.exorcised).toBe(5);
    expect(story.notFound.map((p) => p.id)).toEqual(['card-errors']);
  });

  it('points every found problem at a finding in a latest run, and every exorcised one at a fair pair', () => {
    const story = plantedStory(shown())!;
    const latestKeys = new Set(latestRuns(shown()).map((r) => r.key));
    for (const status of story.statuses) {
      if (!status.found) {
        expect(status.exorcised).toBeNull();
        continue;
      }
      expect(latestKeys.has(status.found.run.key)).toBe(true);
      expect(status.found.run.site.name).toBe(PLANTED_SITE);
      expect(status.problem.types).toContain(status.found.finding.type);
      expect(status.exorcised).not.toBeNull();
      expect(status.exorcised!.before.site.name).toBe(PLANTED_SITE);
      expect(status.exorcised!.after.site.name).toBe(`${PLANTED_SITE} (exorcised)`);
      expect(status.exorcised!.before.ghost).toBe(status.exorcised!.after.ghost);
      expect(status.exorcised!.before.mind).toBe(status.exorcised!.after.mind);
    }
  });

  it('is null when there is no run on Lantern Bills', () => {
    expect(plantedStory(shown().filter((r) => r.site.name === 'Memos'))).toBeNull();
  });

  it('does not count a problem as exorcised when the fixed copy was never walked', () => {
    const story = plantedStory(shown().filter((r) => r.site.name === PLANTED_SITE))!;
    expect(story.found).toBe(5);
    expect(story.exorcised).toBe(0);
  });
});

describe('counts use only each ghost\'s latest run on each site (UI-17)', () => {
  it('keeps one run per ghost and site, newest first', () => {
    const latest = latestRuns(shown());
    expect(latest.map((r) => `${r.site.name}|${r.ghost}`)).toEqual([
      'Lantern Bills demo|listener',
      'Lantern Bills demo|phantom',
      'Lantern Bills demo|bebe',
      'Lantern Bills demo (exorcised)|listener',
      'Lantern Bills demo (exorcised)|phantom',
      'Lantern Bills demo (exorcised)|bebe',
      'Memos|listener',
    ]);
    // The scripted 10 Nov Listener run was replaced by the AI run of 23 Nov.
    expect(latest.map((r) => r.key)).not.toContain('2026-11-10T1822Z-listener-pay-bill');
  });

  it('the Graveyard counts 10 tombstones, not 13, and Home counts 9 findings on Lantern Bills', () => {
    const runs = shown();
    expect(buildGraveyard(runs)).toHaveLength(10);
    expect(buildGraveyard(runs).map((t) => t.run.key)).not.toContain('2026-11-10T1822Z-listener-pay-bill');
    const haunt = groupHaunts(runs).find((h) => h.siteName === PLANTED_SITE)!;
    expect(haunt.findingCount).toBe(9);
  });
});
