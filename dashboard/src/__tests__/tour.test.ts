import { describe, expect, it } from 'vitest';
import { buildTour, placeCallout, sentenceCount } from '../model/tour';
import { bebeRun, sampleRuns } from './fixtures/samples';

const L = '2026-11-03-listener-pay-bill';
const B = '2026-11-03-bebe-pay-bill';

describe('buildTour with the samples (Req 22.1, 22.2, 22.11)', () => {
  const stops = buildTour(sampleRuns())!;

  it('has the eight stops in order, on the right screens', () => {
    expect(stops.map((s) => s.id)).toEqual(['results', 'shot', 'panel', 'notice', 'timeline', 'graveyard', 'exorcise', 'coverage']);
    expect(stops.map((s) => s.path)).toEqual([
      '/',
      `/run/${L}/step/9`,
      `/run/${L}/step/9`,
      `/run/${L}/step/9`,
      `/run/${L}/step/9`,
      '/graveyard',
      '/exorcise',
      '/coverage',
    ]);
    expect(stops.map((s) => s.targets[0])).toEqual([
      '[data-tour="results"]',
      '[data-cam-area="shot"]',
      '[data-cam-area="panel"]',
      '[data-cam-area="notice"]',
      '[data-cam-area="timeline"]',
      '[data-tour="graveyard-views"]',
      '[data-tour="exorcise-pickers"]',
      '[data-tour="coverage-table"]',
    ]);
  });

  it('keeps every body to one or two plain sentences', () => {
    for (const stop of stops) {
      expect(stop.title.trim(), stop.id).not.toBe('');
      const count = sentenceCount(stop.body);
      expect(count, `${stop.id}: ${stop.body}`).toBeGreaterThanOrEqual(1);
      expect(count, `${stop.id}: ${stop.body}`).toBeLessThanOrEqual(2);
    }
  });

  it('names the site, says "heard" for The Listener and mentions Ask this ghost at the notice', () => {
    expect(stops[0]!.body).toContain('on Lantern Bills.');
    expect(stops[2]!.title).toBe('What The Listener heard');
    expect(stops[2]!.body).toContain("The Listener's screen reader said");
    expect(stops[3]!.body).toContain('Ask this ghost');
    expect(stops[5]!.body).toContain('Choose Map');
  });

  it('says "was thinking" for Bebe, whose first step is the Ghost Cam stop', () => {
    const bebe = buildTour([bebeRun()])!;
    expect(bebe[1]!.path).toBe(`/run/${B}/step/1`);
    expect(bebe[2]!.title).toBe('What Bebe was thinking');
    expect(bebe[2]!.body).toContain('what Bebe was thinking');
  });

  it('is unavailable with no runs', () => {
    expect(buildTour([])).toBeNull();
  });
});

describe('sentenceCount', () => {
  it('counts sentences ending in . ! or ?', () => {
    expect(sentenceCount('One.')).toBe(1);
    expect(sentenceCount("It's the page. The outline marks focus.")).toBe(2);
    expect(sentenceCount('Is it? Yes! Done.')).toBe(3);
    expect(sentenceCount('No full stop')).toBe(0);
  });
});

describe('placeCallout examples (Req 22.5, 22.10)', () => {
  const vp = { width: 1536, height: 864 };
  const size = { width: 468, height: 200 };

  it('goes below a target near the top', () => {
    expect(placeCallout({ top: 100, left: 200, width: 600, height: 100 }, size, vp)).toEqual({ top: 212, left: 200, side: 'below' });
  });

  it('goes above a target near the bottom', () => {
    expect(placeCallout({ top: 700, left: 200, width: 600, height: 100 }, size, vp)).toEqual({ top: 488, left: 200, side: 'above' });
  });

  it('goes beside a tall target', () => {
    expect(placeCallout({ top: 100, left: 40, width: 700, height: 700 }, size, vp)).toEqual({ top: 100, left: 752, side: 'right' });
  });

  it('centres without a target', () => {
    expect(placeCallout(null, size, vp)).toEqual({ top: 332, left: 534, side: 'center' });
  });

  it('uses the far edge on narrow screens', () => {
    expect(placeCallout({ top: 50, left: 0, width: 300, height: 100 }, { width: 296, height: 200 }, { width: 320, height: 640 })).toEqual({
      top: 428,
      left: 12,
      side: 'edge',
    });
    expect(placeCallout({ top: 500, left: 0, width: 300, height: 100 }, { width: 296, height: 200 }, { width: 320, height: 640 })).toEqual({
      top: 12,
      left: 12,
      side: 'edge',
    });
  });
});
